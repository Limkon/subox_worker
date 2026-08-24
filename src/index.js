// =================================================================
// === 入口文件：src/index.js ===
// =================================================================

import { getKV, DEFAULT_SUPER_PASSWORD } from './config.js';
import { sha1 } from './utils/helpers.js';
import { handleSubscription } from './handlers/sub.js';
import { handleAdmin } from './handlers/admin.js';

// --- 一级缓存 (L1)：内存变量全局缓存 ---
const kvMemoryCache = new Map();       // 专门缓存 KV 路由规则与配置 (L1)[cite: 10]
const responseMemoryCache = new Map(); // 专门缓存订阅和后台的响应体 (L1)[cite: 10]
const knownCacheKeys = new Set();      // 记录已写入 L2 缓存的 URL，用于精准清理[cite: 10]

// --- 路由规则解析缓存 (CPU 优化核心) ---
let parsedRulesCache = null;           // 缓存解析后的路由规则数组[cite: 10]
let lastRouteRulesStr = null;          // 记录上次解析的路由规则字符串[cite: 10]

// 安全基线配置
const MAX_MEMORY_ITEMS = 100;          // 防止 Map 无限增长导致 OOM[cite: 10]
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB 内存缓存阈值[cite: 10]

/**
 * 内存容量熔断保护器
 */
function checkMemorySize() {
    if (kvMemoryCache.size > MAX_MEMORY_ITEMS) kvMemoryCache.clear();[cite: 10]
    if (responseMemoryCache.size > MAX_MEMORY_ITEMS) responseMemoryCache.clear();[cite: 10]
    if (knownCacheKeys.size > MAX_MEMORY_ITEMS * 2) knownCacheKeys.clear();[cite: 10]
}

/**
 * 【规则配置缓存引擎】L1 (内存) + L2 (Cache API) 双重缓存 KV 读取
 */
async function getKVCachedL1L2(request, env, ctx, key) {
    if (kvMemoryCache.has(key)) return kvMemoryCache.get(key);[cite: 10]

    const url = new URL(request.url);[cite: 10]
    const dummyUrlStr = `${url.origin}/__internal_kv_cache/${key}`;[cite: 10]
    const dummyReq = new Request(dummyUrlStr, { method: 'GET' });[cite: 10]
    const edgeCache = caches.default;[cite: 10]

    const l2Res = await edgeCache.match(dummyReq);[cite: 10]
    if (l2Res) {
        const val = await l2Res.text();[cite: 10]
        checkMemorySize();[cite: 10]
        kvMemoryCache.set(key, val);[cite: 10]
        knownCacheKeys.add(dummyUrlStr);[cite: 10]
        return val;[cite: 10]
    }

    const val = await getKV(env, key) || "";[cite: 10]
    checkMemorySize();[cite: 10]
    kvMemoryCache.set(key, val);[cite: 10]

    const cacheRes = new Response(val, { 
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'max-age=31536000' }
    });[cite: 10]
    ctx.waitUntil(edgeCache.put(dummyReq, cacheRes));[cite: 10]
    knownCacheKeys.add(dummyUrlStr);[cite: 10]

    return val;[cite: 10]
}

/**
 * 【防击穿引擎】L1 (内存) + L2 (Cache API) 双重缓存处理核心
 */
async function getResponseWithL1L2(request, ctx, fetcher) {
    const urlObj = new URL(request.url);[cite: 10]
    // 缓存键投毒防御：彻底抛弃 query 参数，仅使用纯净的 origin + pathname
    const cleanUrlStr = urlObj.origin + urlObj.pathname;[cite: 10]
    const cacheReq = new Request(cleanUrlStr, { method: 'GET' });[cite: 10]

    // 1. L1 内存拦截
    if (responseMemoryCache.has(cleanUrlStr)) {[cite: 10]
        const cachedData = responseMemoryCache.get(cleanUrlStr);[cite: 10]
        return new Response(cachedData.body, {
            status: cachedData.status,
            headers: new Headers(cachedData.headers)
        });[cite: 10]
    }

    // 2. L2 边缘节点拦截
    const edgeCache = caches.default;[cite: 10]
    const l2Response = await edgeCache.match(cacheReq);[cite: 10]
    if (l2Response) {[cite: 10]
        // L2 回读 OOM 防御：检查体积后再吸入内存
        const contentLength = l2Response.headers.get('content-length');[cite: 10]
        if (!contentLength || parseInt(contentLength, 10) <= MAX_BODY_SIZE) {[cite: 10]
            try {
                const cloned = l2Response.clone();[cite: 10]
                const bodyBuf = await cloned.arrayBuffer();[cite: 10]
                checkMemorySize();[cite: 10]
                responseMemoryCache.set(cleanUrlStr, {
                    body: bodyBuf,
                    status: l2Response.status,
                    headers: Array.from(l2Response.headers.entries())
                });[cite: 10]
            } catch (e) {
                console.log(`L2 to L1 fallback error: ${e.message}`);[cite: 10]
            }
        }
        knownCacheKeys.add(cleanUrlStr);[cite: 10]
        return l2Response;[cite: 10]
    }

    // 3. 执行真实运算
    const response = await fetcher();[cite: 10]

    // 4. 写入双重缓存
    if (response && response.status === 200) {[cite: 10]
        const clonedForL1 = response.clone();[cite: 10]
        const clonedForL2 = response.clone();[cite: 10]

        ctx.waitUntil((async () => {
            try {
                const bodyBuf = await clonedForL1.arrayBuffer();[cite: 10]
                if (bodyBuf.byteLength <= MAX_BODY_SIZE) {[cite: 10]
                    checkMemorySize();[cite: 10]
                    responseMemoryCache.set(cleanUrlStr, {
                        body: bodyBuf,
                        status: clonedForL1.status,
                        headers: Array.from(clonedForL1.headers.entries())
                    });[cite: 10]
                    knownCacheKeys.add(cleanUrlStr);[cite: 10]
                }
            } catch (e) {}
        })());

        const cacheResponse = new Response(clonedForL2.body, clonedForL2);[cite: 10]
        cacheResponse.headers.set('Cache-Control', 'max-age=31536000');[cite: 10]
        // 安全防线强化：剥离 Set-Cookie 响应头，消除跨用户敏感凭证泄漏隐患
        cacheResponse.headers.delete('Set-Cookie');
        ctx.waitUntil(edgeCache.put(cacheReq, cacheResponse));[cite: 10]
        knownCacheKeys.add(cleanUrlStr);[cite: 10]
    }

    return response;[cite: 10]
}

/**
 * 统一清理缓存
 */
function clearAllCaches(ctx, origin = null) {
    kvMemoryCache.clear();[cite: 10]
    responseMemoryCache.clear();[cite: 10]
    
    // 【性能优化】同步清理路由解析缓存，确保下次请求重新解析最新规则
    parsedRulesCache = null;[cite: 10]
    lastRouteRulesStr = null;[cite: 10]
    
    const edgeCache = caches.default;[cite: 10]
    for (const key of knownCacheKeys) {[cite: 10]
        try {
            ctx.waitUntil(edgeCache.delete(new Request(key, { method: 'GET' })));[cite: 10]
        } catch (e) {}
    }
    knownCacheKeys.clear();[cite: 10]

    // 显式清理内部 KV 虚拟缓存键，防止 Worker 实例重启/漂移后 L2 遗留旧配置
    if (origin) {
        const internalKvKeys = ["ADMIN_PASSWORD", "SUB_EXPIRY_DAYS", "ROUTE_RULES", "PROXY_HOSTNAME", "ROOT_REDIRECT_URL"];
        for (const kvKey of internalKvKeys) {
            const dummyUrlStr = `${origin}/__internal_kv_cache/${kvKey}`;
            try {
                ctx.waitUntil(edgeCache.delete(new Request(dummyUrlStr, { method: 'GET' })));
            } catch (e) {}
        }
    }
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);[cite: 10]

        // --- 核心安全锁：拦截外部恶意读取内部虚拟 KV 缓存 ---
        if (url.pathname.startsWith('/__internal_kv_cache/')) {[cite: 10]
            return new Response("Forbidden: Internal Cache Path", { status: 403 });[cite: 10]
        }

        if (!env.host || typeof env.host.get !== 'function') {[cite: 10]
            return new Response(
                "配置错误：KV 命名空间 'host' 未正确绑定。\n",[cite: 10]
                { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }[cite: 10]
            );
        }
        
        // --- 路由 0：手动强力清洗后门 ---
        if (url.pathname === '/flush-cache') {[cite: 10]
            const providedPwd = url.searchParams.get('pwd');[cite: 10]
            const realPwd = await getKV(env, "ADMIN_PASSWORD") || env.password || DEFAULT_SUPER_PASSWORD;[cite: 10] 
            
            if (providedPwd === realPwd) {[cite: 10]
                clearAllCaches(ctx, url.origin);
                return new Response("✅ 终极双重缓存架构已全部清洗完成！", {[cite: 10]
                    status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' }[cite: 10]
                });
            } else {
                return new Response("❌ 权限不足", { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });[cite: 10]
            }
        }

        // --- 全面启用 L1+L2 引擎获取配置 ---
        const kvPassword = await getKVCachedL1L2(request, env, ctx, "ADMIN_PASSWORD");[cite: 10]
        const envPassword = env.password;[cite: 10] 
        const hasUserSetPassword = !!(kvPassword || envPassword);[cite: 10]
        const configPassword = kvPassword || envPassword || DEFAULT_SUPER_PASSWORD;[cite: 10]
        
        const expiryDays = parseInt(await getKVCachedL1L2(request, env, ctx, "SUB_EXPIRY_DAYS") || "0", 10);[cite: 10]
        let inputForHash = configPassword;[cite: 10]
        if (expiryDays > 0) {[cite: 10]
            const periodLengthMs = expiryDays * 86400000;[cite: 10]
            const currentPeriod = Math.floor(Date.now() / periodLengthMs);[cite: 10]
            inputForHash += String(currentPeriod);[cite: 10]
        }
        inputForHash += "sub";[cite: 10] 
        const hash = await sha1(inputForHash);[cite: 10]
        const subToken = hash.substring(0, 6);[cite: 10]
        const subPath = "/" + subToken;[cite: 10]
        const currentPath = url.pathname.substring(1);[cite: 10]

        // --- 路由 1：订阅路径 (全量 L1+L2 防击穿保护) ---
        if (url.pathname === subPath && request.method === "GET") {[cite: 10] 
            return await getResponseWithL1L2(request, ctx, () => handleSubscription(request, env, subToken));[cite: 10]
        }

        // --- 路由 2：管理后台配置页面 (智能缓存刷新机制) ---
        const isRootAdmin = (url.pathname === '/' && !hasUserSetPassword);[cite: 10]
        const isPasswordAdmin = (currentPath === configPassword || currentPath === DEFAULT_SUPER_PASSWORD);[cite: 10]

        if (isRootAdmin || isPasswordAdmin) {[cite: 10] 
            if (request.method === "GET") {[cite: 10]
                return await getResponseWithL1L2(request, ctx, () => handleAdmin(request, env, configPassword, subToken));[cite: 10]
            } else if (request.method === "POST") {[cite: 10]
                const adminResponse = await handleAdmin(request, env, configPassword, subToken);[cite: 10]
                if (adminResponse.status === 200) {[cite: 10]
                    clearAllCaches(ctx, url.origin); 
                }
                return adminResponse;[cite: 10]
            }
        }

        // --- 路由 3：反向代理与跳转逻辑 (代理流量严格透传) ---
        const routeRulesStr = await getKVCachedL1L2(request, env, ctx, "ROUTE_RULES");[cite: 10]
        if (routeRulesStr) {[cite: 10]
            // 【CPU 性能优化核心】避免每次请求重复进行耗时的字符串切割与正则操作
            if (routeRulesStr !== lastRouteRulesStr || !parsedRulesCache) {[cite: 10]
                parsedRulesCache = routeRulesStr.split('\n')[cite: 10]
                    .map(l => l.trim())[cite: 10]
                    .filter(l => l)[cite: 10]
                    .map(rule => {[cite: 10]
                        const parts = rule.split(':');[cite: 10]
                        if (parts.length >= 2) return { key: parts[0].trim(), target: parts.slice(1).join(':').trim() };[cite: 10]
                        return null;[cite: 10]
                    }).filter(r => r !== null);[cite: 10]
                lastRouteRulesStr = routeRulesStr;[cite: 10]
            }

            let matchedRule = null;[cite: 10]
            // 直接读取内存中已解析完成的对象数组进行 O(N) 极速匹配
            for (const rule of parsedRulesCache) {[cite: 10]
                if (url.pathname === `/${rule.key}` || url.pathname.startsWith(`/${rule.key}/`)) {[cite: 10]
                    matchedRule = { ...rule, fromReferer: false }; break;[cite: 10]
                }
            }
            if (!matchedRule) {[cite: 10]
                const referer = request.headers.get('Referer');[cite: 10]
                if (referer) {[cite: 10]
                    try {
                        const refererUrl = new URL(referer);[cite: 10]
                        for (const rule of parsedRulesCache) {[cite: 10]
                            if (refererUrl.pathname === `/${rule.key}` || refererUrl.pathname.startsWith(`/${rule.key}/`)) {[cite: 10]
                                matchedRule = { ...rule, fromReferer: true }; break;[cite: 10]
                            }
                        }
                    } catch (e) {}
                }
            }

            if (matchedRule) {[cite: 10]
                const { key } = matchedRule;[cite: 10]
                let { target } = matchedRule;[cite: 10]
                let keepPath = false;[cite: 10] 
                
                if (target.startsWith('*')) {[cite: 10]
                    keepPath = true; target = target.substring(1);[cite: 10]
                } else if (target.startsWith('^')) {[cite: 10]
                    const upgradeHeader = request.headers.get('Upgrade');[cite: 10]
                    const isWS = upgradeHeader && upgradeHeader.toLowerCase() === 'websocket';[cite: 10]
                    keepPath = isWS; target = target.substring(1);[cite: 10]
                }
                
                // 自动剥离 target 可能包含的 http:// / https:// 及路径后缀，防止 url.host 抛出 Invalid Host 异常
                url.host = target.replace(/^https?:\/\//i, '').split('/')[0];
                if (!matchedRule.fromReferer && !keepPath) {[cite: 10]
                    url.pathname = url.pathname.substring(key.length + 1);[cite: 10]
                    if (!url.pathname.startsWith('/')) url.pathname = '/' + url.pathname;[cite: 10]
                }
                
                // 显式将第一个参数转为字符串 url.toString()，保证各种 Edge 运行时环境下的全量兼容性
                const proxyRequest = new Request(url.toString(), request);
                proxyRequest.headers.set('Host', url.hostname);[cite: 10] 
                proxyRequest.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));[cite: 10]
                
                return fetch(proxyRequest, { redirect: 'manual' });[cite: 10]
            }
        }

        // 优先级 B: 全局兜底反代
        const proxyHost = await getKVCachedL1L2(request, env, ctx, "PROXY_HOSTNAME");[cite: 10]
        if (proxyHost) {[cite: 10]
            // 自动剥离 proxyHost 的协议前缀与路径后缀
            url.host = proxyHost.replace(/^https?:\/\//i, '').split('/')[0];
            const proxyRequest = new Request(url.toString(), request);
            proxyRequest.headers.set('Host', url.hostname);[cite: 10]
            proxyRequest.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));[cite: 10]
            
            return fetch(proxyRequest, { redirect: 'manual' });[cite: 10]
        }

        // 优先级 C: 根目录跳转
        const redirectURL = await getKVCachedL1L2(request, env, ctx, "ROOT_REDIRECT_URL");[cite: 10]
        if (url.pathname === '/' && redirectURL) {[cite: 10]
            try { return Response.redirect(redirectURL, 302); } catch (e) { }[cite: 10]
        }
        
        return new Response(null, { status: 204 });[cite: 10]
    }
};
