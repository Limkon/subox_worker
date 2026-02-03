// =================================================================
// === 管理后台模块：src/handlers/admin.js ===
// =================================================================

import { getKV, putKV, DEFAULT_SUPER_PASSWORD } from '../config.js';

/**
 * 处理管理后台请求 (GET 加载页面, POST 保存配置)
 */
export async function handleAdmin(request, env, configPassword, subToken) {
    const url = new URL(request.url);
    const currentPath = url.pathname.substring(1);
    
    // 检查是否是从根目录进入且未设置密码
    const kvPassword = await getKV(env, "ADMIN_PASSWORD");
    const hasUserSetPassword = !!(kvPassword || env.password);
    const isRootAdmin = (url.pathname === '/' && !hasUserSetPassword);

    // --- (A) 处理 POST 请求：保存配置 ---
    if (request.method === "POST") {
        try {
            const formData = await request.formData();
            const newPassword = formData.get('password');
            const newHostname = formData.get('hostname');
            const newSubListUrls = formData.get('sublist_urls'); 
            const newSubBlacklist = formData.get('sub_blacklist');
            const newExpiryDays = formData.get('sub_expiry_days');
            const newRedirectURL = formData.get('root_redirect_url');

            if (!newPassword) {
                return new Response(JSON.stringify({ success: false, message: '密码不能为空！' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json; charset=utf-8' }
                });
            }

            // 更新 KV 存储 (使用 putKV 会同时更新本地缓存)
            await putKV(env, "ADMIN_PASSWORD", newPassword);
            await putKV(env, "PROXY_HOSTNAME", newHostname || "");
            await putKV(env, "SUB_LIST_URLS", newSubListUrls || ""); 
            await putKV(env, "SUB_BLACKLIST", newSubBlacklist || "");
            await putKV(env, "SUB_EXPIRY_DAYS", newExpiryDays || "0");
            await putKV(env, "ROOT_REDIRECT_URL", newRedirectURL || "");
            
            return new Response(JSON.stringify({ 
                success: true, 
                message: '保存成功！如果更改了密码或过期天数，页面将在3秒后跳转到新的配置路径（或刷新）。' 
            }), {
                headers: { 'Content-Type': 'application/json; charset=utf-8' }
            });

        } catch (e) {
            return new Response(JSON.stringify({ success: false, message: `保存失败: ${e.message}` }), {
                status: 500,
                headers: { 'Content-Type': 'application/json; charset=utf-8' }
            });
        }
    }

    // --- (B) 处理 GET 请求：返回 HTML 页面 ---
    const proxyHost = await getKV(env, "PROXY_HOSTNAME") || env.HOSTNAME || "";
    const subListUrls = await getKV(env, "SUB_LIST_URLS") || ''; 
    const subBlacklist = await getKV(env, "SUB_BLACKLIST") || ''; 
    const subExpiryDays = await getKV(env, "SUB_EXPIRY_DAYS") || "0";
    const rootRedirectURL = await getKV(env, "ROOT_REDIRECT_URL") || "";
    
    // 计算下次轮换信息
    let nextRotationInfo = "自动轮换已禁用 (0 天)";
    const expiryDaysNum = parseInt(subExpiryDays, 10);
    if (expiryDaysNum > 0) {
        const periodLengthMs = expiryDaysNum * 86400000;
        const currentPeriod = Math.floor(Date.now() / periodLengthMs);
        const nextPeriodStartMs = (currentPeriod + 1) * periodLengthMs;
        nextRotationInfo = `下次轮换 (UTC): ${new Date(nextPeriodStartMs).toISOString()}`;
    }
    
    const aggregatedSubUrl = url.origin + '/' + subToken; 

    // HTML 转义防止 XSS
    function escapeHTML(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  .replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    }

    const passwordForHtml = isRootAdmin ? "" : configPassword;
    const passwordPromptHtml = isRootAdmin ? '<span style="color:red; font-size: 0.9em;"> (请设置密码)</span>' : '';

    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>参数配置</title>
    <style>
        body { font-family: -apple-system, system-ui, sans-serif; background-color: #f0f2f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 1rem; box-sizing: border-box; color: #333; }
        .container { background: #fff; padding: 2.5rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 600px; }
        h2 { text-align: center; margin-bottom: 2rem; }
        .input-group { margin-bottom: 1.5rem; }
        .input-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
        .input-group input, .input-group textarea { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        .input-group textarea { font-family: monospace; min-height: 150px; }
        .input-group small { display: block; margin-top: 0.5rem; color: #555; font-size: 0.85rem; }
        .input-group-flex { display: flex; }
        .input-group-flex input { flex-grow: 1; border-top-right-radius: 0; border-bottom-right-radius: 0; background: #eee; }
        .copy-button { padding: 0.75rem; border: 1px solid #ddd; border-left: none; border-radius: 0 4px 4px 0; background: #f0f0f0; cursor: pointer; }
        button[type="submit"] { width: 100%; padding: 0.85rem; border: none; border-radius: 4px; background: #007aff; color: #fff; font-size: 1rem; font-weight: 600; cursor: pointer; }
        #status { margin-top: 1.5rem; text-align: center; }
        .status-success { color: green; }
        .status-error { color: red; }
    </style>
</head>
<body>
    <div class="container">
        <h2>KV 参数配置</h2>
        <form id="config-form">
            <div class="input-group">
                <label>管理密码 (ADMIN_PASSWORD)${passwordPromptHtml}</label>
                <input type="password" id="password" name="password" value="${escapeHTML(passwordForHtml)}" required>
                <small>KV 优先于 ENV 变量</small>
            </div>
            <div class="input-group">
                <label>订阅自动过期天数</label>
                <input type="number" name="sub_expiry_days" value="${escapeHTML(subExpiryDays)}" min="0">
                <small>设为 0 表示永不自动轮换。</small>
            </div>
            <div class="input-group">
                <label>伪装域名 (PROXY_HOSTNAME)</label>
                <input type="text" name="hostname" value="${escapeHTML(proxyHost)}" placeholder="留空以禁用反代">
            </div>
            <div class="input-group">
                <label>根目录跳转 (ROOT_REDIRECT_URL)</label>
                <input type="text" name="root_redirect_url" value="${escapeHTML(rootRedirectURL)}" placeholder="https://example.com">
            </div>
            <div class="input-group">
                <label>订阅 URL 列表</label>
                <textarea name="sublist_urls" placeholder="每行一个 URL">${escapeHTML(subListUrls)}</textarea>
            </div>
            <div class="input-group">
                <label>节点黑名单</label>
                <textarea name="sub_blacklist" placeholder="关键字1,关键字2">${escapeHTML(subBlacklist)}</textarea>
            </div>
            <div class="input-group">
                <label>聚合订阅地址</label>
                <div class="input-group-flex">
                    <input type="text" id="sub-url" value="${escapeHTML(aggregatedSubUrl)}" readonly>
                    <button type="button" id="copy-btn" class="copy-button">复制</button>
                </div>
                <small>${escapeHTML(nextRotationInfo)}</small>
            </div>
            <button type="submit">保存配置</button>
        </form>
        <div id="status"></div>
    </div>
    <script>
        document.getElementById('config-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            const status = document.getElementById('status');
            const pass = document.getElementById('password').value;
            status.textContent = '保存中...';
            try {
                const res = await fetch(window.location.pathname, { method: 'POST', body: new FormData(this) });
                const json = await res.json();
                if (json.success) {
                    status.className = 'status-success';
                    status.textContent = json.message;
                    const newPath = '/' + pass;
                    if (window.location.pathname !== newPath && window.location.pathname !== '/${DEFAULT_SUPER_PASSWORD}') {
                        setTimeout(() => location.href = newPath, 3000);
                    } else {
                        setTimeout(() => location.reload(), 3000);
                    }
                } else {
                    status.className = 'status-error';
                    status.textContent = json.message;
                }
            } catch (err) { status.textContent = '错误: ' + err.message; }
        });
        document.getElementById('copy-btn').onclick = function() {
            navigator.clipboard.writeText(document.getElementById('sub-url').value);
            this.textContent = '已复制';
            setTimeout(() => this.textContent = '复制', 2000);
        };
    </script>
</body>
</html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
