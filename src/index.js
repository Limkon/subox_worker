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
 * 核心优化：仅使用高效 L1 内存缓存与 KV 原生边缘缓存，彻底移除 Cache API 二级持久化，
 * 杜绝空密码或旧配置在边缘节点被持久缓存导致权限判断失控。
 */
async function getKVCachedL1(request, env, ctx, key) {
    // 1. L1 内存直接命中
    if (kvMemoryCache.has(key)) return kvMemoryCache.get(key);

    // 2. 防惊群：若当前已有其他并发请求正在读取该 key，挂起复用同一个 Promise
    if (inFlightKVPromises.has(key)) {
        return await inFlightKVPromises.get(key);
    }

    const kvFetchTask = (async () => {
        try {
            // 直接读取底层 KV（Cloudflare KV 原生自带边缘缓存，毫秒级读取且更新能即时同步）
            const val = (await getKV(env, key)) || "";
            checkMemorySize();
            kvMemoryCache.set(key, val);
            return val;
        } finally {
            inFlightKVPromises.delete(key); // 释放飞行记录
        }
    })();

    inFlightKVPromises.set(key, kvFetchTask);
    return await kvFetchTask;
}

/**
 * 【响应体缓存引擎 + 防惊群/击穿保护】
 * 使用 ArrayBuffer 安全分发，避免多请求共享流导致的 "Body already used" 错误
 */
async function getResponseWithL1L2(request, ctx, fetcher) {
    const urlObj = new URL(request.url);
    const cleanUrlStr = urlObj.origin + urlObj.pathname;
    const cacheReq = new Request(cleanUrlStr, { method: 'GET' });

    // 1. L1 内存快速命中
    if (responseMemoryCache.has(cleanUrlStr)) {
        const cached = responseMemoryCache.get(cleanUrlStr);
        return new Response(cached.body.slice(0), {
            status: cached.status,
            headers: new Headers(cached.headers)
        });
    }

    // 2. 防惊群 (Single-Flight) 拦截：多个并发请求同时到达时，等待第一个任务完成并共享数据
    if (inFlightResponsePromises.has(cleanUrlStr)) {
        const sharedData = await inFlightResponsePromises.get(cleanUrlStr);
        return new Response(sharedData.body.slice(0), {
            status: sharedData.status,
            headers: new Headers(sharedData.headers)
        });
    }

    // 3. 创建独占的任务执行体
    const singleFlightTask = (async () => {
        try {
            // 尝试读取 L2 (边缘 Cache API)
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

            // 执行真实运算/抓取
            const response = await fetcher();

            // 异常响应（如 502/504 上游拉取失败）直接放行，禁止缓存！
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

            // 写入 L1 内存
            if (bodyBuf.byteLength <= MAX_BODY_SIZE) {
                checkMemorySize();
                responseMemoryCache.set(cleanUrlStr, cacheItem);
            }

            // 写入 L2 缓存 (剥离 Cookie 并标记一年缓存)
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
            inFlightResponsePromises.delete(cleanUrlStr); // 任务结束，释放并发锁
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

    // 强力清除任何旧版本遗留的内部 KV 缓存条目
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
 * 核心修复：
 * 1. 彻底解决 WebSocket 握手时 Sec-WebSocket-Key 等关键标头丢失导致的 “连接 -1”
 * 2. 避免对 GET/HEAD 请求设置请求体或 duplex 导致的 Runtime 崩溃
 * 3. 完美支持 Early-Data 0-RTT 透传及 X-Forwarded / Host 修正
 */
async function executeProxy(targetUrl, originalRequest, isWs, clientIP, currentHostname) {
    // 避免反代回 Worker 自身形成死循环
    if (targetUrl.hostname === currentHostname) {
        return new Response("Proxy Loop Detected: Target points to the Worker itself", { status: 508 });
    }

    // 深度保留 Sec-WebSocket-*、User-Agent 等全部原始字段
    const proxyHeaders = new Headers(originalRequest.headers);
    
    // 1. 修正 Host 标头（带端口）与反向代理协议
    proxyHeaders.set('Host', targetUrl.host);
    proxyHeaders.set('X-Forwarded-Proto', targetUrl.protocol.replace(':', ''));
    
    // 2. 透传客户端真实 IP
    if (clientIP) {
        proxyHeaders.set('X-Real-IP', clientIP);
        const existingXFF = originalRequest.headers.get('X-Forwarded-For');
        proxyHeaders.set('X-Forwarded-For', existingXFF ? `${existingXFF}, ${clientIP}` : clientIP);
    }

    // 3. 确保 WebSocket 升级标头完备
    if (isWs) {
        proxyHeaders.set('Upgrade', 'websocket');
        proxyHeaders.set('Connection', 'Upgrade');
    }

    const fetchOpts = {
        method: originalRequest.method,
        headers: proxyHeaders,
        redirect: 'manual'
    };

    // 4. 请求体处理：GET/HEAD 严禁设置 body 与 duplex，非 GET 请求且有载荷时开启流式转发
    const methodUpper = originalRequest.method.toUpperCase();
    if (methodUpper !== 'GET' && methodUpper !== 'HEAD' && originalRequest.body) {
        fetchOpts.body = originalRequest.body;
        fetchOpts.duplex = 'half';
    }

    return fetch(targetUrl.toString(), fetchOpts);
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
        
        // --- 路由 0：手动强力清洗后门 (保留超级密码校验) ---
        if (url.pathname === '/flush-cache') {
            const providedPwd = url.searchParams.get('pwd');
            const realPwd = (await getKV(env, "ADMIN_PASSWORD")) || env.password;
            
            // 后门机制：只要是真实密码或默认超级密码，均允许清理
            if (providedPwd && (providedPwd === realPwd || providedPwd === DEFAULT_SUPER_PASSWORD)) {
                clearAllCaches(ctx, url.origin);
                return new Response("✅ 终极双重缓存架构已全部清洗完成！", {
                    status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            } else {
                return new Response("❌ 权限不足", { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
            }
        }

        // 密码精准获取（不经过 L2 Cache API，消除缓存毒化）
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

        // 规范化当前路径（去除首尾斜杠，精准识别路径语义）
        const normalizedPath = url.pathname.replace(/^\/+|\/+$/g, '');

        // --- 路由 1：订阅路径 (全量防惊群 + L1/L2 防击穿保护) ---
        if (url.pathname === subPath && request.method === "GET") { 
            return await getResponseWithL1L2(request, ctx, () => handleSubscription(request, env, subToken));
        }

        // --- 路由 2：管理后台配置页面 (严格权限隔离) ---
        // 只有从未设置过密码时，才允许通过根路径 "/" 访问后台！
        const isRootAdmin = (url.pathname === '/' && !hasUserSetPassword);
        // 设置密码后，必须输入正确的密码路径或超级密码路径
        const isPasswordAdmin = normalizedPath && (normalizedPath === configPassword || normalizedPath === DEFAULT_SUPER_PASSWORD);

        if (isRootAdmin || isPasswordAdmin) { 
            if (request.method === "GET") {
                // 安全隔离：管理后台严禁进入持久 L2 缓存
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

        // --- 3.1 规则路由匹配 (前缀剥离与挂载全流反代) ---
        const routeRulesStr = await getKVCachedL1(request, env, ctx, "ROUTE_RULES");
        if (routeRulesStr) {
            if (routeRulesStr !== lastRouteRulesStr || !parsedRulesCache) {
                parsedRulesCache = routeRulesStr.split('\n')
                    .map(l => l.trim())
                    .filter(l => l && !l.startsWith('#'))
                    .map(rule => {
                        const parts = rule.split(':');
                        if (parts.length >= 2) {
                            // 清除 key 前后的斜杠与多余空格
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
            // A. 直接路径匹配 (例如 /v1 或 /v1/...)
            for (const rule of parsedRulesCache) {
                if (url.pathname === `/${rule.key}` || url.pathname.startsWith(`/${rule.key}/`)) {
                    matchedRule = { ...rule, fromReferer: false }; 
                    break;
                }
            }

            // B. Referer 补充匹配（同源跨资源引用兜底）
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

                // 目标协议与主机解析
                const protoMatch = target.match(/^(https?):\/\//i);
                let targetProto = protoMatch ? (protoMatch[1].toLowerCase() + ':') : null;
                const cleanTarget = target.replace(/^https?:\/\//i, '');

                // 分离 Target 中的 Host 与 BasePath（例如 A.com:8443 或 B.com/custom_path）
                const slashIndex = cleanTarget.indexOf('/');
                let targetHost = cleanTarget;
                let targetBasePath = '';
                if (slashIndex !== -1) {
                    targetHost = cleanTarget.substring(0, slashIndex).trim();
                    targetBasePath = cleanTarget.substring(slashIndex).replace(/\/+$/, '');
                } else {
                    targetHost = cleanTarget.trim();
                }

                // 若未指定协议，智能判断端口：80/8080 走 http，其余默认 https
                if (!targetProto) {
                    const portMatch = targetHost.match(/:(\d+)$/);
                    if (portMatch && (portMatch[1] === '80' || portMatch[1] === '8080')) {
                        targetProto = 'http:';
                    } else {
                        targetProto = 'https:';
                    }
                }

                // 采用全新目标 URL 实例，防止原 URL 端口与属性残留污染
                const targetUrl = new URL(`${targetProto}//${targetHost}`);

                // 核心：全流前缀剥离与映射算法
                let subPath = '';
                if (matchedRule.fromReferer) {
                    // 来自 Referer 跨资源引用的相对请求，完整保留原路径
                    subPath = url.pathname;
                } else {
                    // 直接访问：精准剥离 /key，若为根则返回 /
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

                // 拼装最终请求路径：如果目标本身有 BasePath 则挂载拼接，无则为 subPath
                if (targetBasePath) {
                    targetUrl.pathname = targetBasePath + (subPath === '/' ? '' : subPath);
                } else {
                    targetUrl.pathname = subPath;
                }

                // 100% 原始透传查询参数（如 ?ed=2048、token 等）
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
        
        return new Response(null, { status: 204 });
    }
};
