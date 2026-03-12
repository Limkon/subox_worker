// =================================================================
// === 入口文件：src/index.js ===
// =================================================================

import { getKV, DEFAULT_SUPER_PASSWORD } from './config.js';
import { sha1 } from './utils/helpers.js';
import { handleSubscription } from './handlers/sub.js';
import { handleAdmin } from './handlers/admin.js';

// --- 一级缓存 (L1)：内存变量全局缓存 ---
const kvMemoryCache = new Map();       // 专门缓存 KV 路由规则与配置 (L1)
const responseMemoryCache = new Map(); // 专门缓存订阅和后台的响应体 (L1)
const knownCacheKeys = new Set();      // 记录已写入 L2 缓存的 URL，用于精准清理

// --- 路由规则解析缓存 (CPU 优化核心) ---
let parsedRulesCache = null;           // 缓存解析后的路由规则数组
let lastRouteRulesStr = null;          // 记录上次解析的路由规则字符串

// 安全基线配置
const MAX_MEMORY_ITEMS = 100;          // 防止 Map 无限增长导致 OOM
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB 内存缓存阈值

/**
 * 内存容量熔断保护器
 */
function checkMemorySize() {
    if (kvMemoryCache.size > MAX_MEMORY_ITEMS) kvMemoryCache.clear();
    if (responseMemoryCache.size > MAX_MEMORY_ITEMS) responseMemoryCache.clear();
    if (knownCacheKeys.size > MAX_MEMORY_ITEMS * 2) knownCacheKeys.clear();
}

/**
 * 【规则配置缓存引擎】L1 (内存) + L2 (Cache API) 双重缓存 KV 读取
 */
async function getKVCachedL1L2(request, env, ctx, key) {
    if (kvMemoryCache.has(key)) return kvMemoryCache.get(key);

    const url = new URL(request.url);
    const dummyUrlStr = `${url.origin}/__internal_kv_cache/${key}`;
    const dummyReq = new Request(dummyUrlStr, { method: 'GET' });
    const edgeCache = caches.default;

    const l2Res = await edgeCache.match(dummyReq);
    if (l2Res) {
        const val = await l2Res.text();
        checkMemorySize();
        kvMemoryCache.set(key, val);
        knownCacheKeys.add(dummyUrlStr);
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
    knownCacheKeys.add(dummyUrlStr);

    return val;
}

/**
 * 【防击穿引擎】L1 (内存) + L2 (Cache API) 双重缓存处理核心
 */
async function getResponseWithL1L2(request, ctx, fetcher) {
    const urlObj = new URL(request.url);
    // [修复1] 缓存键投毒防御：彻底抛弃 query 参数，仅使用纯净的 origin + pathname
    const cleanUrlStr = urlObj.origin + urlObj.pathname;
    const cacheReq = new Request(cleanUrlStr, { method: 'GET' });

    // 1. L1 内存拦截
    if (responseMemoryCache.has(cleanUrlStr)) {
        const cachedData = responseMemoryCache.get(cleanUrlStr);
        return new Response(cachedData.body, {
            status: cachedData.status,
            headers: new Headers(cachedData.headers)
        });
    }

    // 2. L2 边缘节点拦截
    const edgeCache = caches.default;
    const l2Response = await edgeCache.match(cacheReq);
    if (l2Response) {
        // [修复3] L2 回读 OOM 防御：检查体积后再吸入内存
        const contentLength = l2Response.headers.get('content-length');
        if (!contentLength || parseInt(contentLength, 10) <= MAX_BODY_SIZE) {
            try {
                const cloned = l2Response.clone();
                const bodyBuf = await cloned.arrayBuffer();
                checkMemorySize(); // [修复2] 触发容量检查
                responseMemoryCache.set(cleanUrlStr, {
                    body: bodyBuf,
                    status: l2Response.status,
                    headers: Array.from(l2Response.headers.entries())
                });
            } catch (e) {
                console.log(`L2 to L1 fallback error: ${e.message}`);
            }
        }
        knownCacheKeys.add(cleanUrlStr);
        return l2Response;
    }

    // 3. 执行真实运算
    const response = await fetcher();

    // 4. 写入双重缓存
    if (response && response.status === 200) {
        const clonedForL1 = response.clone();
        const clonedForL2 = response.clone();

        ctx.waitUntil((async () => {
            try {
                const bodyBuf = await clonedForL1.arrayBuffer();
                if (bodyBuf.byteLength <= MAX_BODY_SIZE) { 
                    checkMemorySize(); // [修复2] 触发容量检查
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

/**
 * 统一清理缓存
 */
function clearAllCaches(ctx) {
    kvMemoryCache.clear();
    responseMemoryCache.clear();
    
    // 【性能优化】同步清理路由解析缓存，确保下次请求重新解析最新规则
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

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // --- 核心安全锁：拦截外部恶意读取内部虚拟 KV 缓存 ---
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

        // --- 全面启用 L1+L2 引擎获取配置 ---
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

        // --- 路由 1：订阅路径 (全量 L1+L2 防击穿保护) ---
        if (url.pathname === subPath && request.method === "GET") { 
            return await getResponseWithL1L2(request, ctx, () => handleSubscription(request, env, subToken));
        }

        // --- 路由 2：管理后台配置页面 (智能缓存刷新机制) ---
        const isRootAdmin = (url.pathname === '/' && !hasUserSetPassword);
        const isPasswordAdmin = (currentPath === configPassword || currentPath === DEFAULT_SUPER_PASSWORD);

        if (isRootAdmin || isPasswordAdmin) { 
            if (request.method === "GET") {
                return await getResponseWithL1L2(request, ctx, () => handleAdmin(request, env, configPassword, subToken));
            } else if (request.method === "POST") {
                const adminResponse = await handleAdmin(request, env, configPassword, subToken);
                if (adminResponse.status === 200) {
                    clearAllCaches(ctx); 
                }
                return adminResponse;
            }
        }

        // --- 路由 3：反向代理与跳转逻辑 (代理流量严格透传) ---
        const routeRulesStr = await getKVCachedL1L2(request, env, ctx, "ROUTE_RULES");
        if (routeRulesStr) {
            // 【CPU 性能优化核心】避免每次请求重复进行耗时的字符串切割与正则操作
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
            // 直接读取内存中已解析完成的对象数组进行 O(N) 极速匹配
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
                
                if (target.startsWith('*')) {
                    keepPath = true; target = target.substring(1);
                } else if (target.startsWith('^')) {
                    const upgradeHeader = request.headers.get('Upgrade');
                    const isWS = upgradeHeader && upgradeHeader.toLowerCase() === 'websocket';
                    keepPath = isWS; target = target.substring(1);
                }
                
                url.host = target;
                if (!matchedRule.fromReferer && !keepPath) {
                    url.pathname = url.pathname.substring(key.length + 1);
                    if (!url.pathname.startsWith('/')) url.pathname = '/' + url.pathname;
                }
                
                // 【修复核心 1：利用原生 request 保持 Zero-Copy 流式传输】
                const proxyRequest = new Request(url, request);
                proxyRequest.headers.set('Host', url.hostname); 
                proxyRequest.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
                
                return fetch(proxyRequest, { redirect: 'manual' });
            }
        }

        // 优先级 B: 全局兜底反代
        const proxyHost = await getKVCachedL1L2(request, env, ctx, "PROXY_HOSTNAME");
        if (proxyHost) {
            url.host = proxyHost;
            // 【修复核心 2：兜底逻辑同理，防止大文件/WebSocket/代理协议中断和掉速】
            const proxyRequest = new Request(url, request);
            proxyRequest.headers.set('Host', url.hostname);
            proxyRequest.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
            
            return fetch(proxyRequest, { redirect: 'manual' });
        }

        // 优先级 C: 根目录跳转
        const redirectURL = await getKVCachedL1L2(request, env, ctx, "ROOT_REDIRECT_URL");
        if (url.pathname === '/' && redirectURL) {
            try { return Response.redirect(redirectURL, 302); } catch (e) { }
        }
        
        return new Response(null, { status: 204 });
    }
};
