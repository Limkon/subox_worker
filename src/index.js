// =================================================================
// === 入口文件：src/index.js ===
// =================================================================

import { getKV, DEFAULT_SUPER_PASSWORD } from './config.js';
import { sha1 } from './utils/helpers.js';
import { handleSubscription } from './handlers/sub.js';
import { handleAdmin } from './handlers/admin.js';

// --- 一级缓存 (L1)：内存变量全局缓存 ---
const kvMemoryCache = new Map();       // 缓存 KV 路由规则与配置 (L1)
const responseMemoryCache = new Map(); // 缓存订阅响应体 (L1)
const knownCacheKeys = new Set();      // 记录已写入 L2 缓存的 URL

// --- 【防惊群核心 (Single-Flight)】并发合并映射表 ---
const inFlightKVPromises = new Map();       // 合并并发读取相同 KV 的请求
const inFlightResponsePromises = new Map(); // 合并并发拉取相同订阅的请求

// --- 路由规则解析缓存 (CPU 优化：预编译 Target 地址) ---
let parsedRulesCache = null;
let lastRouteRulesStr = null;

// 安全与内存熔断基线
const MAX_MEMORY_ITEMS = 50;           // 适度缩小防 OOM
const MAX_BODY_SIZE = 3 * 1024 * 1024; // 限制单条内存缓存最大 3MB

/**
 * 平滑安全的内存容量控制器 (杜绝全量 clear 导致的瞬间惊群击穿)
 */
function safeSetCache(map, key, value, limit = MAX_MEMORY_ITEMS) {
    if (map.size >= limit) {
        // 每次修剪最旧的 10% 键，保持缓存温热平滑过渡
        const evictCount = Math.max(1, Math.floor(limit * 0.1));
        const iterator = map.keys();
        for (let i = 0; i < evictCount; i++) {
            const oldestKey = iterator.next().value;
            if (oldestKey !== undefined) map.delete(oldestKey);
        }
    }
    map.set(key, value);
}

/**
 * 预编译解析路由规则 (将 URL 拆解下沉到配置更新时执行，请求热路径 0 正则)
 */
function parseRouteRules(routeRulesStr) {
    if (!routeRulesStr) return [];
    return routeRulesStr.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'))
        .map(rule => {
            const colonIdx = rule.indexOf(':');
            if (colonIdx === -1) return null;
            const rawKey = rule.slice(0, colonIdx).trim().replace(/^\/+|\/+$/g, '');
            const rawTarget = rule.slice(colonIdx + 1).trim();
            if (!rawKey || !rawTarget) return null;

            // 预解析协议与 Host / Path
            const protoMatch = rawTarget.match(/^(https?):\/\//i);
            let targetProto = protoMatch ? (protoMatch[1].toLowerCase() + ':') : null;
            const cleanTarget = rawTarget.replace(/^https?:\/\//i, '');
            const slashIndex = cleanTarget.indexOf('/');

            let targetHost = '';
            let targetBasePath = '';
            if (slashIndex !== -1) {
                targetHost = cleanTarget.substring(0, slashIndex).trim();
                targetBasePath = cleanTarget.substring(slashIndex).replace(/\/+$/, '');
            } else {
                targetHost = cleanTarget.trim();
            }

            if (!targetProto) {
                const portMatch = targetHost.match(/:(\d+)$/);
                if (portMatch && (portMatch[1] === '80' || portMatch[1] === '8080')) {
                    targetProto = 'http:';
                } else {
                    targetProto = 'https:';
                }
            }

            return {
                key: rawKey,
                targetProto,
                targetHost,
                targetBasePath,
                originalTarget: rawTarget
            };
        }).filter(Boolean);
}

/**
 * 【规则配置缓存引擎 + 防惊群保护】
 */
async function getKVCachedL1(request, env, ctx, key) {
    if (kvMemoryCache.has(key)) return kvMemoryCache.get(key);

    if (inFlightKVPromises.has(key)) {
        return await inFlightKVPromises.get(key);
    }

    const kvFetchTask = (async () => {
        try {
            const val = (await getKV(env, key)) || "";
            safeSetCache(kvMemoryCache, key, val);
            return val;
        } finally {
            inFlightKVPromises.delete(key);
        }
    })();

    inFlightKVPromises.set(key, kvFetchTask);
    return await kvFetchTask;
}

/**
 * 【响应体缓存引擎 + 防惊群/击穿保护】
 */
async function getResponseWithL1L2(request, ctx, fetcher) {
    const urlObj = new URL(request.url);
    const cleanUrlStr = urlObj.origin + urlObj.pathname;
    const cacheReq = new Request(cleanUrlStr, { method: 'GET' });

    // 1. 命中 L1 内存缓存
    if (responseMemoryCache.has(cleanUrlStr)) {
        const cached = responseMemoryCache.get(cleanUrlStr);
        return new Response(cached.body.slice(0), {
            status: cached.status,
            headers: new Headers(cached.headers)
        });
    }

    // 2. 命中并发合并任务 (Single-Flight)
    if (inFlightResponsePromises.has(cleanUrlStr)) {
        const sharedData = await inFlightResponsePromises.get(cleanUrlStr);
        return new Response(sharedData.body.slice(0), {
            status: sharedData.status,
            headers: new Headers(sharedData.headers)
        });
    }

    const singleFlightTask = (async () => {
        try {
            // 3. 检查 L2 边缘缓存
            const edgeCache = caches.default;
            const l2Response = await edgeCache.match(cacheReq);
            if (l2Response) {
                const bodyBuf = await l2Response.arrayBuffer();
                const cacheItem = {
                    body: bodyBuf,
                    status: l2Response.status,
                    headers: Array.from(l2Response.headers.entries())
                };
                if (bodyBuf.byteLength <= MAX_BODY_SIZE) {
                    safeSetCache(responseMemoryCache, cleanUrlStr, cacheItem);
                }
                knownCacheKeys.add(cleanUrlStr);
                return cacheItem;
            }

            // 4. 回源生成订阅响应
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
            const cacheItem = {
                body: bodyBuf,
                status: response.status,
                headers: Array.from(response.headers.entries())
            };

            if (bodyBuf.byteLength <= MAX_BODY_SIZE) {
                safeSetCache(responseMemoryCache, cleanUrlStr, cacheItem);
            }

            // 修复边缘缓存一年假死问题：设定合理的 s-maxage，兼顾防击穿与时效
            const l2CacheHeaders = new Headers(response.headers);
            l2CacheHeaders.set('Cache-Control', 'public, max-age=60, s-maxage=1800');
            l2CacheHeaders.delete('Set-Cookie');

            const cacheResponse = new Response(bodyBuf.slice(0), {
                status: response.status,
                headers: l2CacheHeaders
            });
            ctx.waitUntil(edgeCache.put(cacheReq, cacheResponse));
            knownCacheKeys.add(cleanUrlStr);

            return cacheItem;
        } finally {
            inFlightResponsePromises.delete(cleanUrlStr);
        }
    })();

    inFlightResponsePromises.set(cleanUrlStr, singleFlightTask);
    const result = await singleFlightTask;
    return new Response(result.body.slice(0), {
        status: result.status,
        headers: new Headers(result.headers)
    });
}

/**
 * 统一清理缓存
 */
function clearAllCaches(ctx, origin = null) {
    kvMemoryCache.clear();
    responseMemoryCache.clear();
    inFlightKVPromises.clear();
    inFlightResponsePromises.clear();
    parsedRulesCache = null;
    lastRouteRulesStr = null;
    
    const edgeCache = caches.default;
    for (const key of knownCacheKeys) {
        try {
            ctx.waitUntil(edgeCache.delete(new Request(key, { method: 'GET' })));
        } catch (e) {}
    }
    knownCacheKeys.clear();
}

/**
 * 原生全流反向代理执行器
 */
async function executeProxy(targetUrl, originalRequest, isWs, clientIP, currentHostname) {
    if (targetUrl.hostname === currentHostname) {
        return new Response("Proxy Loop Detected: Target points to the Worker itself", { status: 508 });
    }

    const newHeaders = new Headers(originalRequest.headers);
    newHeaders.set('Host', targetUrl.host);
    newHeaders.set('X-Forwarded-Proto', targetUrl.protocol.replace(':', ''));
    
    if (clientIP) {
        newHeaders.set('X-Real-IP', clientIP);
        const existingXFF = originalRequest.headers.get('X-Forwarded-For');
        newHeaders.set('X-Forwarded-For', existingXFF ? `${existingXFF}, ${clientIP}` : clientIP);
    }

    if (isWs) {
        newHeaders.set('Upgrade', 'websocket');
        newHeaders.set('Connection', 'Upgrade');
    } else {
        newHeaders.delete('keep-alive');
    }

    const fetchOpts = {
        method: originalRequest.method,
        headers: newHeaders,
        redirect: 'manual'
    };

    const methodUpper = originalRequest.method.toUpperCase();
    if (methodUpper !== 'GET' && methodUpper !== 'HEAD' && originalRequest.body) {
        fetchOpts.body = originalRequest.body;
        fetchOpts.duplex = 'half';
    }

    try {
        return await fetch(targetUrl.toString(), fetchOpts);
    } catch (err) {
        return new Response(`Bad Gateway / Upstream Connect Failed: ${err.message}`, {
            status: 502,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname.startsWith('/__internal_kv_cache/')) {
            return new Response("Forbidden: Internal Cache Path", { status: 403 });
        }

        if (!env.host || typeof env.host.get !== 'function') {
            return new Response(
                "配置错误：KV 命名空间 'host' 未正确绑定。\n",
                { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
            );
        }
        
        // --- 路由 0：手动强力清洗后门 ---
        if (url.pathname === '/flush-cache') {
            const providedPwd = url.searchParams.get('pwd');
            const realPwd = (await getKV(env, "ADMIN_PASSWORD")) || env.password;
            
            if (providedPwd && (providedPwd === realPwd || providedPwd === DEFAULT_SUPER_PASSWORD)) {
                clearAllCaches(ctx, url.origin);
                return new Response("✅ 终极双重缓存架构已全部清洗完成！", {
                    status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            } else {
                return new Response("❌ 权限不足", { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
            }
        }

        const rawKvPassword = await getKVCachedL1(request, env, ctx, "ADMIN_PASSWORD");
        const kvPassword = (rawKvPassword || "").trim();
        const envPassword = (env.password || "").trim(); 
        const hasUserSetPassword = !!(kvPassword || envPassword);
        const configPassword = kvPassword || envPassword || DEFAULT_SUPER_PASSWORD;
        
        const expiryDays = parseInt(await getKVCachedL1(request, env, ctx, "SUB_EXPIRY_DAYS") || "0", 10);
        let inputForHash = configPassword;
        if (expiryDays > 0) {
            const periodLengthMs = expiryDays * 86400000;
            const currentPeriod = Math.floor(Date.now() / periodLengthMs);
            inputForHash += String(currentPeriod);
        }
        inputForHash += "sub"; 
        const hash = await sha1(inputForHash);
        const subToken = hash.substring(0, 6);
        const subPath = "/" + subToken;

        const normalizedPath = url.pathname.replace(/^\/+|\/+$/g, '');

        // --- 路由 1：订阅路径 ---
        if (url.pathname === subPath && request.method === "GET") { 
            return await getResponseWithL1L2(request, ctx, () => handleSubscription(request, env, subToken));
        }

        // --- 路由 2：管理后台配置页面 ---
        const isRootAdmin = (url.pathname === '/' && !hasUserSetPassword);
        const isPasswordAdmin = normalizedPath && (normalizedPath === configPassword || normalizedPath === DEFAULT_SUPER_PASSWORD);

        if (isRootAdmin || isPasswordAdmin) { 
            if (request.method === "GET") {
                const adminRes = await handleAdmin(request, env, configPassword, subToken);
                adminRes.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
                return adminRes;
            } else if (request.method === "POST") {
                const adminResponse = await handleAdmin(request, env, configPassword, subToken);
                if (adminResponse.status === 200) {
                    clearAllCaches(ctx, url.origin); 
                }
                return adminResponse;
            }
        }

        // =================================================================
        // --- 路由 3：全流反向代理与路由分流逻辑 ---
        // =================================================================

        const clientIP = request.headers.get('CF-Connecting-IP');
        const isWebSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';

        // --- 3.1 规则路由匹配 ---
        const routeRulesStr = await getKVCachedL1(request, env, ctx, "ROUTE_RULES");
        if (routeRulesStr) {
            if (routeRulesStr !== lastRouteRulesStr || !parsedRulesCache) {
                parsedRulesCache = parseRouteRules(routeRulesStr);
                lastRouteRulesStr = routeRulesStr;
            }

            let matchedRule = null;
            for (const rule of parsedRulesCache) {
                if (url.pathname === `/${rule.key}` || url.pathname.startsWith(`/${rule.key}/`)) {
                    matchedRule = { ...rule, fromReferer: false }; 
                    break;
                }
            }

            if (!matchedRule) {
                const referer = request.headers.get('Referer');
                if (referer) {
                    try {
                        const refererUrl = new URL(referer);
                        if (refererUrl.origin === url.origin) {
                            for (const rule of parsedRulesCache) {
                                if (refererUrl.pathname === `/${rule.key}` || refererUrl.pathname.startsWith(`/${rule.key}/`)) {
                                    matchedRule = { ...rule, fromReferer: true }; 
                                    break;
                                }
                            }
                        }
                    } catch (e) {}
                }
            }

            if (matchedRule) {
                const { key, targetProto, targetHost, targetBasePath } = matchedRule;
                const targetUrl = new URL(`${targetProto}//${targetHost}`);

                let subPath = '';
                if (matchedRule.fromReferer) {
                    subPath = url.pathname;
                } else {
                    if (url.pathname === `/${key}` || url.pathname === `/${key}/`) {
                        // 保护客户端原本可能携带的末尾斜杠
                        subPath = url.pathname.endsWith('/') ? '/' : '';
                    } else if (url.pathname.startsWith(`/${key}/`)) {
                        subPath = url.pathname.slice(key.length + 1);
                    } else {
                        subPath = '/';
                    }
                }

                if (subPath && !subPath.startsWith('/')) {
                    subPath = '/' + subPath;
                }

                // 准确组合目标路径，杜绝双斜杠与斜杠丢失引发的 301 重定向循环
                if (targetBasePath) {
                    targetUrl.pathname = targetBasePath + (subPath === '/' ? '/' : subPath);
                } else {
                    targetUrl.pathname = subPath || '/';
                }

                targetUrl.search = url.search;

                return executeProxy(targetUrl, request, isWebSocket, clientIP, url.hostname);
            }
        }

        // --- 3.2 全局兜底反代 ---
        const proxyHost = await getKVCachedL1(request, env, ctx, "PROXY_HOSTNAME");
        if (proxyHost) {
            let targetHostStr = proxyHost.trim();
            const protoMatch = targetHostStr.match(/^(https?):\/\//i);
            let targetProto = protoMatch ? (protoMatch[1].toLowerCase() + ':') : null;
            const cleanTarget = targetHostStr.replace(/^https?:\/\//i, '');

            const slashIndex = cleanTarget.indexOf('/');
            let targetHost = cleanTarget;
            let targetBasePath = '';
            if (slashIndex !== -1) {
                targetHost = cleanTarget.substring(0, slashIndex).trim();
                targetBasePath = cleanTarget.substring(slashIndex).replace(/\/+$/, '');
            } else {
                targetHost = cleanTarget.trim();
            }

            if (!targetProto) {
                const portMatch = targetHost.match(/:(\d+)$/);
                if (portMatch && (portMatch[1] === '80' || portMatch[1] === '8080')) {
                    targetProto = 'http:';
                } else {
                    targetProto = 'https:';
                }
            }

            const targetUrl = new URL(`${targetProto}//${targetHost}`);
            targetUrl.pathname = targetBasePath ? (targetBasePath + (url.pathname.startsWith('/') ? url.pathname : '/' + url.pathname)) : url.pathname;
            targetUrl.search = url.search;

            return executeProxy(targetUrl, request, isWebSocket, clientIP, url.hostname);
        }

        // --- 3.3 根目录跳转 ---
        const redirectURL = await getKVCachedL1(request, env, ctx, "ROOT_REDIRECT_URL");
        if (url.pathname === '/' && redirectURL) {
            try { return Response.redirect(redirectURL, 302); } catch (e) { }
        }

        if (isWebSocket) {
            return new Response(`WebSocket Proxy Error: No route rule or global proxy configured for "${url.pathname}"`, {
                status: 404,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        }
        
        return new Response(null, { status: 204 });
    }
};
