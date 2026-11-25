// =================================================================
// === 入口文件：src/index.js ===
// === L1(内存, 带 TTL) + L2(隔离 Cache 命名空间) + Single-Flight ===
// =================================================================

import {
    readKV, getKV, isKVBound,
    DEFAULT_SUPER_PASSWORD, LIMITS, INTERNAL_KV_KEYS,
    CACHE_NAMESPACES, CACHE_TAGS
} from './config.js';
import { deriveSubToken, sha256Hex, constantTimeEqual } from './utils/helpers.js';
import { handleSubscription } from './handlers/sub.js';
import { handleAdmin } from './handlers/admin.js';
import {
    parseRouteRules, parseProxyTarget, normalizeHostname,
    isForbiddenHost, safeRedirectUrl
} from './utils/validation.js';
import { createTTLCache, createBoundedSet, waitUntilSafe } from './utils/cache.js';
import { createHybridRateLimiter } from './utils/ratelimit.js';

// --- L1：带 TTL / 总字节上限的内存缓存 ---
const kvMemoryCache = createTTLCache({
    maxItems: LIMITS.MAX_CACHE_ITEMS,
    maxBytes: 2 * 1024 * 1024,
    ttlMs: LIMITS.KV_L1_TTL_MS
});
const responseMemoryCache = createTTLCache({
    maxItems: LIMITS.MAX_CACHE_ITEMS,
    maxBytes: LIMITS.MAX_SUB_CACHE_BYTES,
    ttlMs: LIMITS.SUB_L1_TTL_MS
});
const knownCacheKeys = createBoundedSet(LIMITS.MAX_KNOWN_CACHE_KEYS);

// --- Single-Flight 并发合并 ---
const inFlightKVPromises = new Map();
const inFlightResponsePromises = new Map();

// --- 混合限流：per-isolate 快速路径 + KV 跨数据中心计数 ---
// 不依赖 Cloudflare Rate Limiting Rules，部署后即刻生效，无需手工配置。
const flushLimiter = createHybridRateLimiter({
    max: LIMITS.RATE_LIMIT_MAX,
    windowSec: Math.ceil(LIMITS.RATE_LIMIT_WINDOW_MS / 1000),
    scope: 'flush'
});
const adminLimiter = createHybridRateLimiter({
    max: LIMITS.RATE_LIMIT_MAX,
    windowSec: Math.ceil(LIMITS.RATE_LIMIT_WINDOW_MS / 1000),
    scope: 'admin'
});

// --- 路由规则解析缓存 ---
let parsedRulesCache = null;
let lastRouteRulesStr = null;

const HOP_BY_HOP_HEADERS = [
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade'
];

/**
 * 打开隔离的 Cache 命名空间。
 * 不使用 caches.default（它与 zone 的 fetch/CDN 缓存共享，会把配置与节点
 * 凭据暴露给同 zone 的其他 Worker/子请求）。命名空间不可用时直接跳过 L2。
 */
async function openCache(name) {
    try {
        if (typeof caches === 'undefined' || !caches || typeof caches.open !== 'function') return null;
        return await caches.open(name);
    } catch (e) {
        console.error(`[cache] open(${name}) failed: ${e.message}`);
        return null;
    }
}

/** 不可枚举的缓存键（命名空间隔离 + 摘要后缀） */
async function kvCacheRequest(origin, key) {
    const suffix = await sha256Hex(`${origin}|kv|${key}`, 24);
    return new Request(`${origin}/__subox/kv/${suffix}`, { method: 'GET' });
}
async function subCacheRequest(origin, pathname) {
    const suffix = await sha256Hex(`${origin}|sub|${pathname}`, 24);
    return new Request(`${origin}/__subox/sub/${suffix}`, { method: 'GET' });
}

/**
 * KV 双重缓存读取。
 * 修复要点：L1 带 TTL；KV 读取失败不写缓存；L2 用隔离命名空间且 TTL 大幅缩短；
 * 所有 waitUntil 都带 catch。
 */
async function getKVCachedL1L2(request, env, ctx, key) {
    if (kvMemoryCache.has(key)) return kvMemoryCache.get(key);
    if (inFlightKVPromises.has(key)) return await inFlightKVPromises.get(key);

    const origin = new URL(request.url).origin;
    const task = (async () => {
        try {
            const cache = await openCache(CACHE_NAMESPACES.KV);
            let cacheReq = null;
            try { cacheReq = await kvCacheRequest(origin, key); } catch (e) { /* 摘要失败则跳过 L2 */ }

            if (cache && cacheReq) {
                try {
                    const l2 = await cache.match(cacheReq);
                    if (l2) {
                        const val = await l2.text();
                        kvMemoryCache.set(key, val, val.length);
                        return val;
                    }
                } catch (e) {
                    console.error(`[cache] kv match failed: ${e.message}`);
                }
            }

            const res = await readKV(env, key);
            if (!res.ok) return null; // 关键：失败不缓存，避免把配置负缓存成空串

            const val = res.value == null ? '' : String(res.value);
            kvMemoryCache.set(key, val, val.length);

            if (cache && cacheReq) {
                const l2Response = new Response(val, {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Cache-Control': `public, max-age=0, s-maxage=${LIMITS.KV_L2_TTL_S}`,
                        'Cache-Tag': CACHE_TAGS.CONFIG
                    }
                });
                waitUntilSafe(ctx, cache.put(cacheReq, l2Response), 'kv-l2-put');
            }
            return val;
        } finally {
            inFlightKVPromises.delete(key);
        }
    })();

    inFlightKVPromises.set(key, task);
    return await task;
}

/** 订阅响应体缓存（L1 TTL + L2 隔离命名空间 + 防击穿） */
async function getResponseWithL1L2(request, ctx, fetcher) {
    const urlObj = new URL(request.url);
    const cleanUrlStr = urlObj.origin + urlObj.pathname;

    const cached = responseMemoryCache.get(cleanUrlStr);
    if (cached) return buildResponse(cached);

    if (inFlightResponsePromises.has(cleanUrlStr)) {
        const shared = await inFlightResponsePromises.get(cleanUrlStr);
        return buildResponse(shared);
    }

    const task = (async () => {
        try {
            const cache = await openCache(CACHE_NAMESPACES.SUB);
            let cacheReq = null;
            try { cacheReq = await subCacheRequest(urlObj.origin, urlObj.pathname); } catch (e) { /* 跳过 L2 */ }

            if (cache && cacheReq) {
                try {
                    const l2 = await cache.match(cacheReq);
                    if (l2) {
                        const bodyBuf = await l2.arrayBuffer();
                        const item = {
                            body: bodyBuf,
                            status: l2.status,
                            headers: Array.from(l2.headers.entries())
                        };
                        if (bodyBuf.byteLength <= LIMITS.MAX_SUB_CACHE_BYTES) {
                            responseMemoryCache.set(cleanUrlStr, item, bodyBuf.byteLength);
                        }
                        knownCacheKeys.add(cacheReq.url);
                        return item;
                    }
                } catch (e) {
                    console.error(`[cache] sub match failed: ${e.message}`);
                }
            }

            const response = await fetcher();
            if (!response || response.status !== 200) {
                const errBuf = response ? await response.arrayBuffer() : new ArrayBuffer(0);
                return {
                    body: errBuf,
                    status: response ? response.status : 500,
                    headers: response ? Array.from(response.headers.entries()) : []
                };
            }

            const bodyBuf = await response.arrayBuffer();
            const item = {
                body: bodyBuf,
                status: response.status,
                headers: Array.from(response.headers.entries())
            };
            if (bodyBuf.byteLength <= LIMITS.MAX_SUB_CACHE_BYTES) {
                responseMemoryCache.set(cleanUrlStr, item, bodyBuf.byteLength);
            }

            if (cache && cacheReq) {
                // 边缘缓存头与返回给客户端的头分离：客户端仍收到 no-store
                const l2Headers = new Headers(response.headers);
                l2Headers.set('Cache-Control', `public, max-age=0, s-maxage=${LIMITS.SUB_L2_TTL_S}`);
                l2Headers.set('Cache-Tag', CACHE_TAGS.SUB);
                l2Headers.delete('Set-Cookie');
                const cacheResponse = new Response(bodyBuf.slice(0), {
                    status: response.status,
                    headers: l2Headers
                });
                waitUntilSafe(ctx, cache.put(cacheReq, cacheResponse), 'sub-l2-put');
                knownCacheKeys.add(cacheReq.url);
            }
            return item;
        } finally {
            inFlightResponsePromises.delete(cleanUrlStr);
        }
    })();

    inFlightResponsePromises.set(cleanUrlStr, task);
    return buildResponse(await task);
}

function buildResponse(item) {
    const headers = new Headers(item.headers);
    headers.set('Cache-Control', 'no-store, private');
    return new Response(item.body.slice(0), { status: item.status, headers });
}

/**
 * 统一清理缓存。
 * 说明：Cloudflare 的 cache.delete 只在发起它的那个数据中心生效，Cache API
 * 内容本身也不跨数据中心复制。因此真正的跨中心一致性依赖短 TTL（KV 30s /
 * 订阅 120s）与 Cache-Tag 的全局 purge，而不是本函数。
 */
async function clearAllCaches(ctx, origin = null) {
    kvMemoryCache.clear();
    responseMemoryCache.clear();
    inFlightKVPromises.clear();
    inFlightResponsePromises.clear();
    parsedRulesCache = null;
    lastRouteRulesStr = null;

    const keysToDelete = Array.from(knownCacheKeys.values());
    knownCacheKeys.clear();

    const subCache = await openCache(CACHE_NAMESPACES.SUB);
    if (subCache) {
        for (const key of keysToDelete) {
            try {
                waitUntilSafe(ctx, subCache.delete(new Request(key, { method: 'GET' })), 'sub-l2-delete');
            } catch (e) { /* noop */ }
        }
    }

    if (origin) {
        const kvCache = await openCache(CACHE_NAMESPACES.KV);
        if (kvCache) {
            for (const kvKey of INTERNAL_KV_KEYS) {
                try {
                    const req = await kvCacheRequest(origin, kvKey);
                    waitUntilSafe(ctx, kvCache.delete(req), 'kv-l2-delete');
                } catch (e) { /* noop */ }
            }
        }
    }
}

/** 原生全流反向代理执行器 */
async function executeProxy(targetUrl, originalRequest, isWs, clientIP, currentUrl) {
    if (
        normalizeHostname(targetUrl.hostname) === normalizeHostname(currentUrl.hostname) ||
        isForbiddenHost(targetUrl.hostname)
    ) {
        return new Response('Proxy Loop Detected: target points to the Worker itself or a forbidden address', { status: 508 });
    }

    // 多层代理 / 别名回环兜底
    const hops = Number(originalRequest.headers.get('X-Subox-Proxy-Hops') || '0');
    const hopCount = Number.isFinite(hops) ? hops : 0;
    if (hopCount >= LIMITS.MAX_PROXY_HOPS) {
        return new Response('Proxy Loop Detected: hop limit exceeded', { status: 508 });
    }

    const newHeaders = new Headers(originalRequest.headers);
    for (const key of Array.from(newHeaders.keys())) {
        const lk = key.toLowerCase();
        if (HOP_BY_HOP_HEADERS.includes(lk) || lk.startsWith('cf-') || lk === 'host') {
            newHeaders.delete(key);
        }
    }
    // Host 由 URL 决定（Workers 运行时不接受手工覆盖），这里只设置转发元数据
    newHeaders.set('X-Forwarded-Proto', currentUrl.protocol.replace(':', ''));
    newHeaders.set('X-Forwarded-Host', currentUrl.host);
    newHeaders.set('X-Subox-Proxy-Hops', String(hopCount + 1));
    if (clientIP) {
        newHeaders.set('X-Real-IP', clientIP);
        // 覆盖客户端可能伪造的 XFF，不再拼接
        newHeaders.set('X-Forwarded-For', clientIP);
    }
    if (isWs) {
        newHeaders.set('Upgrade', 'websocket');
        newHeaders.set('Connection', 'Upgrade');
    }

    const method = originalRequest.method.toUpperCase();
    const fetchOpts = { method, headers: newHeaders, redirect: 'manual' };
    if (method !== 'GET' && method !== 'HEAD' && originalRequest.body) {
        fetchOpts.body = originalRequest.body;
        fetchOpts.duplex = 'half';
    }

    let timer = null;
    if (!isWs) {
        const controller = new AbortController();
        timer = setTimeout(() => controller.abort(), LIMITS.PROXY_TIMEOUT_MS);
        fetchOpts.signal = controller.signal;
    }

    try {
        const response = await fetch(targetUrl.toString(), fetchOpts);
        if (timer) clearTimeout(timer);
        if (isWs && !response.webSocket) {
            return new Response('Bad Gateway: upstream rejected WebSocket upgrade', {
                status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        }
        return response;
    } catch (err) {
        if (timer) clearTimeout(timer);
        return new Response(`Bad Gateway / Upstream Connect Failed: ${err.message}`, {
            status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

/** 组装代理目标 URL（含 try/catch，避免畸形配置让整站 500） */
function buildTargetUrl(parsed, subPath, search) {
    const targetUrl = new URL(`${parsed.proto}//${parsed.host}`);
    let suffix = subPath || '/';
    if (!suffix.startsWith('/')) suffix = '/' + suffix;
    targetUrl.pathname = parsed.basePath
        ? parsed.basePath + (suffix === '/' ? '/' : suffix)
        : suffix;
    targetUrl.search = search;
    return targetUrl;
}

async function handleRequest(request, env, ctx) {
    const url = new URL(request.url);

    // 内部虚拟路径一律拒绝（即使 L2 缓存里存在对应条目）
    if (url.pathname.startsWith('/__internal_kv_cache/') || url.pathname.startsWith('/__subox/')) {
        return new Response('Forbidden: Internal Cache Path', { status: 403 });
    }

    if (!isKVBound(env)) {
        return new Response("配置错误：KV 命名空间 'host' 未正确绑定。\n", {
            status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }

    // --- 路由 0：手动清洗缓存（超级口令保持有效）---
    if (url.pathname === '/flush-cache') {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const limiterKey = `flush:${ip}`;
        if (!await flushLimiter.allow(env, limiterKey)) {
            return new Response('Too Many Requests', {
                status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' }
            });
        }

        let provided = request.headers.get('X-Admin-Password');
        if (!provided && request.method === 'POST') {
            try {
                const fd = await request.formData();
                provided = fd.get('pwd');
            } catch (e) { /* 无表单体时忽略 */ }
        }
        if (!provided) provided = url.searchParams.get('pwd'); // 兼容原有 ?pwd= 用法

        const realPwd = (await getKV(env, "ADMIN_PASSWORD")) || env.password;
        const ok = !!provided && (
            constantTimeEqual(provided, realPwd) ||
            constantTimeEqual(provided, DEFAULT_SUPER_PASSWORD)
        );
        if (!ok) {
            await flushLimiter.fail(env, limiterKey);
            return new Response('❌ 权限不足', {
                status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
            });
        }

        await flushLimiter.reset(env, limiterKey);
        await clearAllCaches(ctx, url.origin);
        return new Response('✅ 缓存已清洗（L1 全量 / 本数据中心 L2；其他地区由短 TTL 收敛）', {
            status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
        });
    }

    // --- 配置读取（全部走 L1+L2）---
    const rawKvPassword = await getKVCachedL1L2(request, env, ctx, "ADMIN_PASSWORD");
    const kvPassword = (rawKvPassword || '').trim();
    const envPassword = (env.password || '').trim();
    const hasUserSetPassword = !!(kvPassword || envPassword);
    const configPassword = kvPassword || envPassword || DEFAULT_SUPER_PASSWORD;

    let expiryDays = parseInt(await getKVCachedL1L2(request, env, ctx, "SUB_EXPIRY_DAYS") || "0", 10);
    if (!Number.isFinite(expiryDays) || expiryDays < 0) expiryDays = 0;
    expiryDays = Math.min(expiryDays, LIMITS.MAX_EXPIRY_DAYS);
    const periodTag = expiryDays > 0
        ? String(Math.floor(Date.now() / (expiryDays * 86400000)))
        : 'static';
    const subToken = await deriveSubToken(configPassword, periodTag);
    const subPath = '/' + subToken;

    const normalizedPath = url.pathname.replace(/^\/+|\/+$/g, '');

    // --- 路由 1：订阅 ---
    if (url.pathname === subPath && request.method === "GET") {
        return await getResponseWithL1L2(request, ctx, () => handleSubscription(env));
    }

    // --- 路由 2：管理后台（超级口令路径保持有效）---
    const isRootAdmin = (url.pathname === '/' && !hasUserSetPassword);
    const isPasswordAdmin = !!normalizedPath && (
        normalizedPath === configPassword || normalizedPath === DEFAULT_SUPER_PASSWORD
    );

    if (isRootAdmin || isPasswordAdmin) {
        if (request.method === "GET") {
            const adminRes = await handleAdmin(request, env, configPassword, subToken);
            adminRes.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, private');
            return adminRes;
        }
        if (request.method === "POST") {
            const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
            const limiterKey = `admin:${ip}`;
            if (!await adminLimiter.allow(env, limiterKey)) {
                return new Response(JSON.stringify({ success: false, message: '请求过于频繁，请稍后重试' }), {
                    status: 429,
                    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60', 'Cache-Control': 'no-store' }
                });
            }
            const adminResponse = await handleAdmin(request, env, configPassword, subToken);
            if (adminResponse.status === 200) {
                await adminLimiter.reset(env, limiterKey);
                await clearAllCaches(ctx, url.origin);
            } else {
                await adminLimiter.fail(env, limiterKey);
            }
            return adminResponse;
        }
    }

    // --- 路由 3：反向代理 ---
    const clientIP = request.headers.get('CF-Connecting-IP');
    const isWebSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';

    // 3.1 规则路由（最长标签优先）
    const routeRulesStr = await getKVCachedL1L2(request, env, ctx, "ROUTE_RULES");
    if (routeRulesStr) {
        if (routeRulesStr !== lastRouteRulesStr || !parsedRulesCache) {
            parsedRulesCache = parseRouteRules(routeRulesStr);
            lastRouteRulesStr = routeRulesStr;
        }

        const matches = (pathname) => parsedRulesCache.find(rule =>
            pathname === `/${rule.key}` || pathname.startsWith(`/${rule.key}/`)
        );

        let matchedRule = null;
        const direct = matches(url.pathname);
        if (direct) matchedRule = { ...direct, fromReferer: false };

        if (!matchedRule) {
            const referer = request.headers.get('Referer');
            if (referer) {
                try {
                    const refererUrl = new URL(referer);
                    if (refererUrl.origin === url.origin) {
                        const fromRef = matches(refererUrl.pathname);
                        if (fromRef) matchedRule = { ...fromRef, fromReferer: true };
                    }
                } catch (e) { /* 非法 Referer 忽略 */ }
            }
        }

        if (matchedRule) {
            let subPathSuffix;
            if (matchedRule.fromReferer) {
                subPathSuffix = url.pathname;
            } else if (url.pathname === `/${matchedRule.key}` || url.pathname === `/${matchedRule.key}/`) {
                subPathSuffix = url.pathname.endsWith('/') ? '/' : '';
            } else if (url.pathname.startsWith(`/${matchedRule.key}/`)) {
                subPathSuffix = url.pathname.slice(matchedRule.key.length + 1);
            } else {
                subPathSuffix = '/';
            }

            try {
                const targetUrl = buildTargetUrl(matchedRule, subPathSuffix, url.search);
                return executeProxy(targetUrl, request, isWebSocket, clientIP, url);
            } catch (e) {
                return new Response(`Bad Gateway: invalid route target (${e.message})`, {
                    status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }
        }
    }

    // 3.2 全局兜底反代
    const proxyHost = await getKVCachedL1L2(request, env, ctx, "PROXY_HOSTNAME");
    if (proxyHost && proxyHost.trim()) {
        try {
            const parsed = parseProxyTarget(proxyHost.trim());
            const targetUrl = buildTargetUrl(parsed, url.pathname, url.search);
            return executeProxy(targetUrl, request, isWebSocket, clientIP, url);
        } catch (e) {
            return new Response(`Bad Gateway: invalid PROXY_HOSTNAME (${e.message})`, {
                status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        }
    }

    // 3.3 根目录跳转（只允许 http/https 绝对地址）
    const redirectURL = await getKVCachedL1L2(request, env, ctx, "ROOT_REDIRECT_URL");
    if (url.pathname === '/' && redirectURL) {
        const safe = safeRedirectUrl(redirectURL);
        if (safe) return Response.redirect(safe, 302);
    }

    if (isWebSocket) {
        return new Response(`WebSocket Proxy Error: No route rule or global proxy configured for "${url.pathname}"`, {
            status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }

    return new Response(null, { status: 204 });
}

export default {
    async fetch(request, env, ctx) {
        try {
            return await handleRequest(request, env, ctx);
        } catch (err) {
            // 顶层兜底：任何未捕获异常都不再表现为 1101/空白 500
            console.error(`[worker] unhandled: ${err?.message || err}`);
            return new Response('Internal Worker Error', {
                status: 500,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Cache-Control': 'no-store',
                    'X-Content-Type-Options': 'nosniff'
                }
            });
        }
    }
};
