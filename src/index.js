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
     */
    async fetch(request, env) {
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
            return await handleSubscription(request, env, subToken);
        }

        // --- 路由 2：管理后台配置页面 ---
        const isRootAdmin = (url.pathname === '/' && !hasUserSetPassword);
        const isPasswordAdmin = (currentPath === configPassword || currentPath === DEFAULT_SUPER_PASSWORD);

        if (isRootAdmin || isPasswordAdmin) { 
            return await handleAdmin(request, env, configPassword, subToken);
        }

        // --- 路由 3：反向代理与跳转逻辑 ---
        
        // 优先级 A: 检查多行路由规则 (精确匹配路径前缀)
        const routeRulesStr = await getKV(env, "ROUTE_RULES") || "";
        if (routeRulesStr) {
            const rules = routeRulesStr.split('\n').map(l => l.trim()).filter(l => l);
            for (const rule of rules) {
                const parts = rule.split(':');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    let target = parts.slice(1).join(':').trim();
                    
                    // 匹配路径前缀：完全匹配 /key 或以 /key/ 开头
                    if (url.pathname === `/${key}` || url.pathname.startsWith(`/${key}/`)) {
                        let keepPath = false; // 默认：普通网页，去路径
                        
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
                        
                        // 覆盖目标域名
                        url.hostname = target;
                        
                        // 如果是"去路径"模式，将前缀从 pathname 中剥离
                        if (!keepPath) {
                            url.pathname = url.pathname.substring(key.length + 1);
                            if (!url.pathname.startsWith('/')) {
                                url.pathname = '/' + url.pathname;
                            }
                        }
                        
                        return fetch(new Request(url, request));
                    }
                }
            }
        }

        // 优先级 B: 全局兜底反代 (如果上述路由规则均未匹配)
        const proxyHost = await getKV(env, "PROXY_HOSTNAME") || env.HOSTNAME || ""; 
        if (proxyHost) {
            url.hostname = proxyHost;
            return fetch(new Request(url, request));
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
