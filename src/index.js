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
        // 逻辑：基于密码 + (可选)时间盐 + "sub" 字符串
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
        // 访问条件：路径匹配 configPassword / 超级密码，或者未设密码时的根目录
        const isRootAdmin = (url.pathname === '/' && !hasUserSetPassword);
        const isPasswordAdmin = (currentPath === configPassword || currentPath === DEFAULT_SUPER_PASSWORD);

        if (isRootAdmin || isPasswordAdmin) { 
            return await handleAdmin(request, env, configPassword, subToken);
        }

        // --- 路由 3：反向代理与跳转逻辑 ---
        // 只有在上述路径都不匹配时执行
        
        // 优先级 A: 检查反代
        const proxyHost = await getKV(env, "PROXY_HOSTNAME") || env.HOSTNAME || ""; 
        if (proxyHost) {
            url.hostname = proxyHost;
            return fetch(new Request(url, request));
        }

        // 优先级 B: 根目录跳转
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
        
        // 优先级 C: 返回空白页
        return new Response(null, { status: 204 });
    }
};
