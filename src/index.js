// =================================================================
// === 入口文件：src/index.js ===
// =================================================================

import { getKV, DEFAULT_SUPER_PASSWORD } from './config.js';
import { sha1 } from './utils/helpers.js';
import { handleSubscription } from './handlers/sub.js';
import { handleAdmin } from './handlers/admin.js';

// --- 一级缓存 (L1)：内存变量全局缓存 ---
const kvMemoryCache = new Map();
const responseMemoryCache = new Map();
const knownCacheKeys = new Set();

let parsedRulesCache = null;
let lastRouteRulesStr = null;

const MAX_MEMORY_ITEMS = 100;
const MAX_BODY_SIZE = 10 * 1024 * 1024;

function checkMemorySize() {
    if (kvMemoryCache.size > MAX_MEMORY_ITEMS) kvMemoryCache.clear();
    if (responseMemoryCache.size > MAX_MEMORY_ITEMS) responseMemoryCache.clear();
    if (knownCacheKeys.size > MAX_MEMORY_ITEMS * 2) knownCacheKeys.clear();
}

async function getKVCachedL1L2(request, env, ctx, key) {
    if (kvMemoryCache.has(key)) return kvMemoryCache.get(key);

    const dummyUrlStr = `http://internal-config.local/__internal_kv_cache/${key}`;
    const dummyReq = new Request(dummyUrlStr, { method: 'GET' });
    const edgeCache = caches.default;

    const l2Res = await edgeCache.match(dummyReq);
    if (l2Res) {
        const val = await l2Res.text();
        checkMemorySize();
        kvMemoryCache.set(key, val);
        return val;
    }

    const val = await getKV(env, key) || "";
    checkMemorySize();
    kvMemoryCache.set(key, val);

    const cacheRes = new Response(val, { 
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'max-age=31536000' }
    });
    ctx.waitUntil(edgeCache.put(dummyReq, cacheRes));

    return val;
}

async function getResponseWithL1L2(request, ctx, fetcher) {
    const urlObj = new URL(request.url);
    const cleanUrlStr = urlObj.origin + urlObj.pathname;
    const cacheReq = new Request(cleanUrlStr, { method: 'GET' });

    if (responseMemoryCache.has(cleanUrlStr)) {
        const cachedData = responseMemoryCache.get(cleanUrlStr);
        return new Response(cachedData.body, {
            status: cachedData.status,
            headers: new Headers(cachedData.headers)
        });
    }

    const edgeCache = caches.default;
    const l2Response = await edgeCache.match(cacheReq);
    if (l2Response) {
        const contentLength = l2Response.headers.get('content-length');
        if (!contentLength || parseInt(contentLength, 10) <= MAX_BODY_SIZE) {
            try {
                const cloned = l2Response.clone();
                const bodyBuf = await cloned.arrayBuffer();
                checkMemorySize();
                responseMemoryCache.set(cleanUrlStr, {
                    body: bodyBuf,
                    status: l2Response.status,
                    headers: Array.from(l2Response.headers.entries())
                });
            } catch (e) {}
        }
        knownCacheKeys.add(cleanUrlStr);
        return l2Response;
    }

    const response = await fetcher();

    if (response && response.status === 200) {
        const clonedForL1 = response.clone();
        const clonedForL2 = response.clone();

        ctx.waitUntil((async () => {
            try {
                const bodyBuf = await clonedForL1.arrayBuffer();
                if (bodyBuf.byteLength <= MAX_BODY_SIZE) { 
                    checkMemorySize();
                    responseMemoryCache.set(cleanUrlStr, {
                        body: bodyBuf,
                        status: clonedForL1.status,
                        headers: Array.from(clonedForL1.headers.entries())
                    });
                    knownCacheKeys.add(cleanUrlStr);
                }
            } catch (e) {}
        })());

        const cacheResponse = new Response(clonedForL2.body, clonedForL2);
        cacheResponse.headers.set('Cache-Control', 'max-age=31536000');
        ctx.waitUntil(edgeCache.put(cacheReq, cacheResponse));
        knownCacheKeys.add(cleanUrlStr);
    }

    return response;
}

function clearAllCaches(ctx) {
    kvMemoryCache.clear();
    responseMemoryCache.clear();
    parsedRulesCache = null;
    lastRouteRulesStr = null;
    
    const edgeCache = caches.default;
    const knownKVKeys = [
        "ADMIN_PASSWORD", "ROUTE_RULES", "PROXY_HOSTNAME", 
        "SUB_LIST_URLS", "SUB_BLACKLIST", "SUB_EXPIRY_DAYS", "ROOT_REDIRECT_URL"
    ];
    for (const key of knownKVKeys) {
        const dummyUrlStr = `http://internal-config.local/__internal_kv_cache/${key}`;
        try { ctx.waitUntil(edgeCache.delete(new Request(dummyUrlStr, { method: 'GET' }))); } catch (e) {}
    }
    for (const key of knownCacheKeys) {
        try { ctx.waitUntil(edgeCache.delete(new Request(key, { method: 'GET' }))); } catch (e) {}
    }
    knownCacheKeys.clear();
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
        
        if (url.pathname === '/flush-cache') {
            const providedPwd = url.searchParams.get('pwd');
            const realPwd = await getKV(env, "ADMIN_PASSWORD") || env.password || DEFAULT_SUPER_PASSWORD; 
            if (providedPwd === realPwd) {
                clearAllCaches(ctx);
                return new Response("✅ 终极双重缓存架构已全部清洗完成！", {
                    status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            } else {
                return new Response("❌ 权限不足", { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
            }
        }

        const kvPassword = await getKVCachedL1L2(request, env, ctx, "ADMIN_PASSWORD");
        const envPassword = env.password; 
        const hasUserSetPassword = !!(kvPassword || envPassword);
        const configPassword = kvPassword || envPassword || DEFAULT_SUPER_PASSWORD;
        
        const expiryDays = parseInt(await getKVCachedL1L2(request, env, ctx, "SUB_EXPIRY_DAYS") || "0", 10);
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
        const currentPath = url.pathname.substring(1);

        if (url.pathname === subPath && request.method === "GET") { 
            return await getResponseWithL1L2(request, ctx, () => handleSubscription(request, env, subToken));
        }

        const isRootAdmin = (url.pathname === '/' && !hasUserSetPassword);
        const isPasswordAdmin = (currentPath === configPassword || currentPath === DEFAULT_SUPER_PASSWORD);

        if (isRootAdmin || isPasswordAdmin) { 
            if (request.method === "GET") {
                return await getResponseWithL1L2(request, ctx, () => handleAdmin(request, env, configPassword, subToken));
            } else if (request.method === "POST") {
                const adminResponse = await handleAdmin(request, env, configPassword, subToken);
                if (adminResponse.status === 200) clearAllCaches(ctx); 
                return adminResponse;
            }
        }

        // --- 路由 3：反向代理与跳转逻辑 (代理流量严格透传) ---
        const routeRulesStr = await getKVCachedL1L2(request, env, ctx, "ROUTE_RULES");
        if (routeRulesStr) {
            if (routeRulesStr !== lastRouteRulesStr || !parsedRulesCache) {
                parsedRulesCache = routeRulesStr.split('\n')
                    .map(l => l.trim())
                    .filter(l => l)
                    .map(rule => {
                        const parts = rule.split(':');
                        if (parts.length >= 2) return { key: parts[0].trim(), target: parts.slice(1).join(':').trim() };
                        return null;
                    }).filter(r => r !== null);
                lastRouteRulesStr = routeRulesStr;
            }

            let matchedRule = null;
            for (const rule of parsedRulesCache) {
                if (url.pathname === `/${rule.key}` || url.pathname.startsWith(`/${rule.key}/`)) {
                    matchedRule = { ...rule, fromReferer: false }; break;
                }
            }
            if (!matchedRule) {
                const referer = request.headers.get('Referer');
                if (referer) {
                    try {
                        const refererUrl = new URL(referer);
                        for (const rule of parsedRulesCache) {
                            if (refererUrl.pathname === `/${rule.key}` || refererUrl.pathname.startsWith(`/${rule.key}/`)) {
                                matchedRule = { ...rule, fromReferer: true }; break;
                            }
                        }
                    } catch (e) {}
                }
            }

            if (matchedRule) {
                const { key } = matchedRule;
                let { target } = matchedRule;
                let keepPath = false; 
                
                const upgradeHeader = request.headers.get('Upgrade');
                const contentType = request.headers.get('Content-Type');
                const isNodeTraffic = !!upgradeHeader || (contentType && contentType.toLowerCase().includes('grpc'));
                
                if (target.startsWith('*')) {
                    keepPath = true; target = target.substring(1);
                } else if (target.startsWith('^')) {
                    keepPath = isNodeTraffic; target = target.substring(1);
                }
                
                url.host = target;
                
                if (!matchedRule.fromReferer && !keepPath) {
                    url.pathname = url.pathname.substring(key.length + 1);
                    if (!url.pathname.startsWith('/')) url.pathname = '/' + url.pathname;
                }
                
                // 【终极重构核心】：化繁为简，彻底清除违规的 Host 篡改
                if (isNodeTraffic) {
                    // 节点流量：最干净的原生透传！不改任何头，规避 Pages V8 引擎的安全阻断
                    return fetch(new Request(url, request));
                } 
                
                // 网页流量：规避 404
                const proxyRequest = new Request(url, request);
                proxyRequest.headers.set('Origin', `${url.protocol}//${url.hostname}`);
                proxyRequest.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
                
                const response = await fetch(proxyRequest, { redirect: 'manual' });
                
                if ([301, 302, 303, 307, 308].includes(response.status)) {
                    const location = response.headers.get('Location');
                    if (location) {
                        try {
                            const locUrl = new URL(location);
                            if (locUrl.hostname === url.hostname) {
                                const workerHost = new URL(request.url).hostname;
                                locUrl.hostname = workerHost;
                                const modifiedResponse = new Response(response.body, response);
                                modifiedResponse.headers.set('Location', locUrl.toString());
                                return modifiedResponse;
                            }
                        } catch (e) {}
                    }
                }
                return response;
            }
        }

        // 优先级 B: 全局兜底反代
        const proxyHost = await getKVCachedL1L2(request, env, ctx, "PROXY_HOSTNAME");
        if (proxyHost) {
            url.host = proxyHost;
            
            const upgradeHeader = request.headers.get('Upgrade');
            const contentType = request.headers.get('Content-Type');
            const isNodeTraffic = !!upgradeHeader || (contentType && contentType.toLowerCase().includes('grpc'));
            
            if (isNodeTraffic) {
                // 节点流量终极透传
                return fetch(new Request(url, request));
            }
            
            const proxyRequest = new Request(url, request);
            proxyRequest.headers.set('Origin', `${url.protocol}//${url.hostname}`);
            proxyRequest.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
            
            const response = await fetch(proxyRequest, { redirect: 'manual' });
            
            if ([301, 302, 303, 307, 308].includes(response.status)) {
                const location = response.headers.get('Location');
                if (location) {
                    try {
                        const locUrl = new URL(location);
                        if (locUrl.hostname === url.hostname) {
                            const workerHost = new URL(request.url).hostname;
                            locUrl.hostname = workerHost;
                            const modifiedResponse = new Response(response.body, response);
                            modifiedResponse.headers.set('Location', locUrl.toString());
                            return modifiedResponse;
                        }
                    } catch (e) {}
                }
            }
            return response;
        }

        // 优先级 C: 根目录跳转
        const redirectURL = await getKVCachedL1L2(request, env, ctx, "ROOT_REDIRECT_URL");
        if (url.pathname === '/' && redirectURL) {
            try { return Response.redirect(redirectURL, 302); } catch (e) { }
        }
        
        return new Response(null, { status: 204 });
    }
};
