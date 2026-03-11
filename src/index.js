// =================================================================
// === 入口文件：src/index.js ===
// =================================================================

import { getKV, DEFAULT_SUPER_PASSWORD } from './config.js';
import { sha1 } from './utils/helpers.js';
import { handleSubscription } from './handlers/sub.js';
import { handleAdmin } from './handlers/admin.js';

export default {
    /**
     * Worker 总入口
     * @param {Request} request 
     * @param {object} env 
     * @param {object} ctx 提供 waitUntil 等生命周期方法
     */
    async fetch(request, env, ctx) {
        // --- 新增：全局缓存拦截 (方案一核心) ---
        // 仅拦截 GET 请求，且基于完整 Request (URL) 进行匹配
        let cache;
        if (request.method === "GET") {
            cache = caches.default;
            const cachedResponse = await cache.match(request);
            if (cachedResponse) {
                // 命中缓存，0 KV 消耗，直接阻断后续所有逻辑返回结果
                return cachedResponse; 
            }
        }
        // ------------------------------------

        // 1. 关键检查：验证 KV 绑定是否存在
        if (!env.host || typeof env.host.get !== 'function') {
            return new Response(
                "配置错误：KV 命名空间 'host' 未正确绑定。\n" +
                "请在 Cloudflare Worker 设置中添加名为 'host' 的 KV 绑定。",
                { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
            );
        }
        
        const url = new URL(request.url);
        
        // 2. 密码获取逻辑 (优先级: KV > ENV > 默认超级密码)
        const kvPassword = await getKV(env, "ADMIN_PASSWORD");
        const envPassword = env.password; 
        const hasUserSetPassword = !!(kvPassword || envPassword);
        
        // configPassword 用于生成订阅 Token 及作为管理路径
        const configPassword = kvPassword || envPassword || DEFAULT_SUPER_PASSWORD;
        
        // 3. 计算订阅路径 Token
        const expiryDays = parseInt(await getKV(env, "SUB_EXPIRY_DAYS") || "0", 10);
        let inputForHash = configPassword;

        if (expiryDays > 0) {
            const periodLengthMs = expiryDays * 86400000;
            const currentPeriod = Math.floor(Date.now() / periodLengthMs);
            inputForHash += String(currentPeriod);
        }
        inputForHash += "sub"; 
        
        const hash = await sha1(inputForHash);
        const subToken = hash.substring(0, 6); // 6位 Token
        const subPath = "/" + subToken;
        
        const currentPath = url.pathname.substring(1);

        // --- 路由 1：订阅路径 (优先级最高) ---
        if (url.pathname === subPath && request.method === "GET") { 
            const subResponse = await handleSubscription(request, env, subToken);
            
            // --- 新增：将订阅结果写入缓存 ---
            // 仅当成功获取到数据 (status 200) 时进行缓存，避免缓存错误信息
            if (subResponse.status === 200 && cache) {
                // 复制响应，并注入 Cache-Control 头
                const responseToCache = new Response(subResponse.body, {
                    status: subResponse.status,
                    statusText: subResponse.statusText,
                    headers: new Headers(subResponse.headers)
                });
                
                // 设置缓存有效期为 300 秒 (5 分钟)
                responseToCache.headers.set('Cache-Control', 'max-age=300');

                // 使用 ctx.waitUntil 异步写入边缘缓存，不阻塞当前请求的响应返回给用户
                ctx.waitUntil(cache.put(request, responseToCache.clone()));

                return responseToCache;
            }
            // ------------------------------

            return subResponse;
        }

        // --- 路由 2：管理后台配置页面 ---
        const isRootAdmin = (url.pathname === '/' && !hasUserSetPassword);
        const isPasswordAdmin = (currentPath === configPassword || currentPath === DEFAULT_SUPER_PASSWORD);

        if (isRootAdmin || isPasswordAdmin) { 
            return await handleAdmin(request, env, configPassword, subToken);
        }

        // --- 路由 3：反向代理与跳转逻辑 ---
        
        // 优先级 A: 检查多行路由规则 (精确匹配路径前缀 + Referer 溯源)
        const routeRulesStr = await getKV(env, "ROUTE_RULES") || "";
        if (routeRulesStr) {
            // [性能优化]: 一次性解析所有有效规则，避免多次 split 浪费 CPU
            const parsedRules = routeRulesStr.split('\n')
                .map(l => l.trim())
                .filter(l => l)
                .map(rule => {
                    const parts = rule.split(':');
                    if (parts.length >= 2) {
                        return {
                            key: parts[0].trim(),
                            target: parts.slice(1).join(':').trim()
                        };
                    }
                    return null;
                })
                .filter(r => r !== null);

            let matchedRule = null;
            
            // 1. 优先进行直接的路径匹配
            for (const rule of parsedRules) {
                if (url.pathname === `/${rule.key}` || url.pathname.startsWith(`/${rule.key}/`)) {
                    matchedRule = { ...rule, fromReferer: false };
                    break;
                }
            }

            // 2. 如果直接匹配失败，尝试通过 Referer 进行溯源匹配
            if (!matchedRule) {
                const referer = request.headers.get('Referer');
                if (referer) {
                    try {
                        const refererUrl = new URL(referer);
                        for (const rule of parsedRules) {
                            if (refererUrl.pathname === `/${rule.key}` || refererUrl.pathname.startsWith(`/${rule.key}/`)) {
                                matchedRule = { ...rule, fromReferer: true };
                                break;
                            }
                        }
                    } catch (e) {
                        // Referer URL 解析错误忽略
                    }
                }
            }

            // 3. 执行代理转发逻辑
            if (matchedRule) {
                const { key } = matchedRule;
                let { target } = matchedRule;
                let keepPath = false; 
                
                // 解析前缀符号并决定是否保留路径
                if (target.startsWith('*')) {
                    keepPath = true; // 纯节点，留路径
                    target = target.substring(1);
                } else if (target.startsWith('^')) {
                    // 智能混合：WS连节点(留路径)，HTTP看网页(去路径)
                    const upgradeHeader = request.headers.get('Upgrade');
                    const isWS = upgradeHeader && upgradeHeader.toLowerCase() === 'websocket';
                    keepPath = isWS;
                    target = target.substring(1);
                }
                
                // [Bug 修复]: 使用 url.host 以支持带有端口号的目标 (例如 example.com:8443)
                url.host = target;
                
                // 去路径逻辑
                if (!matchedRule.fromReferer && !keepPath) {
                    url.pathname = url.pathname.substring(key.length + 1);
                    if (!url.pathname.startsWith('/')) {
                        url.pathname = '/' + url.pathname;
                    }
                }
                
                // [逻辑补全]: 覆写 Host 等请求头，防止目标服务器因 SNI/Host 不匹配而拒绝请求
                const proxyHeaders = new Headers(request.headers);
                proxyHeaders.set('Host', url.hostname); // Host 头部通常不带端口或由目标服务器自行处理
                proxyHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
                
                return fetch(new Request(url, {
                    method: request.method,
                    headers: proxyHeaders,
                    body: request.body,
                    redirect: 'manual'
                }));
            }
        }

        // 优先级 B: 全局兜底反代 (如果上述路由规则均未匹配)
        const proxyHost = await getKV(env, "PROXY_HOSTNAME") || env.HOSTNAME || ""; 
        if (proxyHost) {
            // [Bug 修复]: 同上，替换 hostname 为 host
            url.host = proxyHost;
            
            const proxyHeaders = new Headers(request.headers);
            proxyHeaders.set('Host', url.hostname);
            proxyHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
            
            return fetch(new Request(url, {
                method: request.method,
                headers: proxyHeaders,
                body: request.body,
                redirect: 'manual'
            }));
        }

        // 优先级 C: 根目录跳转
        if (url.pathname === '/') {
            const redirectURL = await getKV(env, "ROOT_REDIRECT_URL") || "";
            if (redirectURL) {
                try {
                    return Response.redirect(redirectURL, 302);
                } catch (e) {
                    console.log(`Invalid ROOT_REDIRECT_URL: ${e.message}`);
                }
            }
        }
        
        // 优先级 D: 返回空白页
        return new Response(null, { status: 204 });
    }
};
