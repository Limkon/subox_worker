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

// --- 路由规则解析缓存 (CPU 优化) ---
let parsedRulesCache = null;
let lastRouteRulesStr = null;

// 安全与内存熔断基线
const MAX_MEMORY_ITEMS = 50;           // 适度缩小防 OOM
const MAX_BODY_SIZE = 3 * 1024 * 1024; // 限制单条内存缓存最大 3MB

/**
 * 内存容量熔断保护器
 */
function checkMemorySize() {
    if (kvMemoryCache.size > MAX_MEMORY_ITEMS) kvMemoryCache.clear();
    if (responseMemoryCache.size > MAX_MEMORY_ITEMS) responseMemoryCache.clear();
    if (knownCacheKeys.size > MAX_MEMORY_ITEMS * 2) knownCacheKeys.clear();
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
            checkMemorySize();
            kvMemoryCache.set(key, val);
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

    if (responseMemoryCache.has(cleanUrlStr)) {
        const cached = responseMemoryCache.get(cleanUrlStr);
        return new Response(cached.body.slice(0), {
            status: cached.status,
            headers: new Headers(cached.headers)
        });
    }

    if (inFlightResponsePromises.has(cleanUrlStr)) {
        const sharedData = await inFlightResponsePromises.get(cleanUrlStr);
        return new Response(sharedData.body.slice(0), {
            status: sharedData.status,
            headers: new Headers(sharedData.headers)
        });
    }

    const singleFlightTask = (async () => {
        try {
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
                    checkMemorySize();
                    responseMemoryCache.set(cleanUrlStr, cacheItem);
                }
                knownCacheKeys.add(cleanUrlStr);
                return cacheItem;
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
            const cacheItem = {
                body: bodyBuf,
                status: response.status,
                headers: Array.from(response.headers.entries())
            };

            if (bodyBuf.byteLength <= MAX_BODY_SIZE) {
                checkMemorySize();
                responseMemoryCache.set(cleanUrlStr, cacheItem);
            }

            const l2CacheHeaders = new Headers(response.headers);
            l2CacheHeaders.set('Cache-Control', 'max-age=31536000');
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

    if (origin) {
        const internalKvKeys = ["ADMIN_PASSWORD", "SUB_EXPIRY_DAYS", "ROUTE_RULES", "PROXY_HOSTNAME", "ROOT_REDIRECT_URL", "SUB_LIST_URLS", "SUB_BLACKLIST"];
        for (const kvKey of internalKvKeys) {
            const dummyUrlStr = `${origin}/__internal_kv_cache/${kvKey}`;
            try {
                ctx.waitUntil(edgeCache.delete(new Request(dummyUrlStr, { method: 'GET' })));
            } catch (e) {}
        }
    }
}

/**
 * 原生全流反向代理执行器
 */
async function executeProxy(targetUrl, originalRequest, isWs, clientIP, currentHostname) {
    if (targetUrl.hostname === currentHostname) {
        return new Response("Proxy Loop Detected: Target points to the Worker itself", { status: 508 });
    }

    const proxyRequest = new Request(targetUrl.toString(), originalRequest);
    
    proxyRequest.headers.set('Host', targetUrl.host);
    proxyRequest.headers.set('X-Forwarded-Proto', targetUrl.protocol.replace(':', ''));
    
    if (clientIP) {
        proxyRequest.headers.set('X-Real-IP', clientIP);
        const existingXFF = originalRequest.headers.get('X-Forwarded-For');
        proxyRequest.headers.set('X-Forwarded-For', existingXFF ? `${existingXFF}, ${clientIP}` : clientIP);
    }

    if (isWs) {
        proxyRequest.headers.set('Upgrade', 'websocket');
        proxyRequest.headers.set('Connection', 'Upgrade');
    }

    const fetchOpts = { redirect: 'manual' };
    const methodUpper = originalRequest.method.toUpperCase();
    if (methodUpper !== 'GET' && methodUpper !== 'HEAD' && originalRequest.body) {
        fetchOpts.duplex = 'half';
    }

    try {
        return await fetch(proxyRequest, fetchOpts);
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
                parsedRulesCache = routeRulesStr.split('\n')
                    .map(l => l.trim())
                    .filter(l => l && !l.startsWith('#'))
                    .map(rule => {
                        const parts = rule.split(':');
                        if (parts.length >= 2) {
                            const rawKey = parts[0].trim().replace(/^\/+|\/+$/g, '');
                            const rawTarget = parts.slice(1).join(':').trim();
                            if (rawKey && rawTarget) {
                                return { key: rawKey, target: rawTarget };
                            }
                        }
                        return null;
                    }).filter(r => r !== null);
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
                const { key, target } = matchedRule;

                const protoMatch = target.match(/^(https?):\/\//i);
                let targetProto = protoMatch ? (protoMatch[1].toLowerCase() + ':') : null;
                const cleanTarget = target.replace(/^https?:\/\//i, '');

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

                let subPath = '';
                if (matchedRule.fromReferer) {
                    subPath = url.pathname;
                } else {
                    if (url.pathname === `/${key}` || url.pathname === `/${key}/`) {
                        subPath = '/';
                    } else if (url.pathname.startsWith(`/${key}/`)) {
                        subPath = url.pathname.slice(key.length + 1);
                    } else {
                        subPath = '/';
                    }
                }

                if (!subPath.startsWith('/')) {
                    subPath = '/' + subPath;
                }

                if (targetBasePath) {
                    targetUrl.pathname = targetBasePath + (subPath === '/' ? '' : subPath);
                } else {
                    targetUrl.pathname = subPath;
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
            targetUrl.pathname = targetBasePath + url.pathname;
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
