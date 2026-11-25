// =================================================================
// === 管理后台模块：src/handlers/admin.js ===
// =================================================================

import { readKV, putKV, DEFAULT_SUPER_PASSWORD, LIMITS } from '../config.js';
import { constantTimeEqual } from '../utils/helpers.js';
import { validateAdminForm, isSameOriginRequest } from '../utils/validation.js';

const ADMIN_CSRF_HEADER = 'X-Requested-With';
const ADMIN_CSRF_VALUE = 'subox-admin';

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char] || char));
}

function randomNonce() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function baseHeaders(nonce) {
    const headers = new Headers({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    });
    if (nonce) {
        headers.set('Content-Security-Policy',
            `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; ` +
            `connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`);
    }
    return headers;
}

function jsonResponse(obj, status, extra = {}) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, private',
            'X-Content-Type-Options': 'nosniff',
            ...extra
        }
    });
}

export async function handleAdmin(request, env, configPassword, subToken) {
    const url = new URL(request.url);
    const isSuperPath = url.pathname === '/' + DEFAULT_SUPER_PASSWORD;

    // -------------------------------------------------------------
    // POST：保存配置
    // -------------------------------------------------------------
    if (request.method === "POST") {
        // CSRF：同源 + 自定义头（跨站表单无法设置自定义头）
        if (!isSameOriginRequest(request) || request.headers.get(ADMIN_CSRF_HEADER) !== ADMIN_CSRF_VALUE) {
            return jsonResponse({ success: false, message: '请求来源校验失败' }, 403);
        }

        let formData;
        try {
            formData = await request.formData();
        } catch (e) {
            return jsonResponse({ success: false, message: '表单解析失败' }, 400);
        }

        const [currentPwdRes] = await Promise.all([readKV(env, "ADMIN_PASSWORD")]);
        const hasUserSetPassword = !!(
            (currentPwdRes.ok && currentPwdRes.value && String(currentPwdRes.value).trim()) ||
            (env.password && String(env.password).trim())
        );

        const validation = validateAdminForm(formData, url.hostname);
        if (!validation.ok) {
            return jsonResponse({ success: false, message: validation.error }, 400);
        }
        // 首次配置必须设置管理口令，避免保存后 `/` 仍是免认证后台
        if (!hasUserSetPassword && !validation.passwordProvided) {
            return jsonResponse({ success: false, message: '首次配置必须设置管理密码' }, 400);
        }
        // 首次设置口令的可选引导令牌（不配置时保持原有初始化流程）
        if (!hasUserSetPassword && env.BOOTSTRAP_TOKEN) {
            const provided = formData.get('bootstrap_token');
            if (!constantTimeEqual(String(provided ?? ''), String(env.BOOTSTRAP_TOKEN))) {
                return jsonResponse({ success: false, message: '首次配置需要提供正确的引导令牌' }, 403);
            }
        }

        const { values, passwordProvided } = validation;
        try {
            // 先完成全部校验再写入；KV 无事务，失败时明确提示可能已部分写入
            const writes = Object.entries(values).map(([k, v]) => putKV(env, k, v));
            if (passwordProvided) writes.unshift(putKV(env, "ADMIN_PASSWORD", values.ADMIN_PASSWORD));
            // 递增配置版本号，便于运维按版本核对缓存新鲜度
            writes.push(putKV(env, "CONFIG_VERSION", String(Date.now())));
            await Promise.all(writes);
        } catch (e) {
            return jsonResponse({ success: false, message: `保存失败（可能已部分写入，请重试）: ${e.message}` }, 500);
        }

        return jsonResponse({ success: true, message: '保存成功！缓存已重置，页面将在 2 秒后更新。' }, 200);
    }

    // -------------------------------------------------------------
    // GET：渲染控制面板
    // -------------------------------------------------------------
    const keys = [
        "ADMIN_PASSWORD", "ROUTE_RULES", "PROXY_HOSTNAME", "SUB_LIST_URLS",
        "SUB_BLACKLIST", "SUB_EXPIRY_DAYS", "ROOT_REDIRECT_URL"
    ];
    const results = await Promise.all(keys.map(k => readKV(env, k)));
    const conf = Object.fromEntries(keys.map((k, i) => [k, results[i].ok ? (results[i].value ?? '') : '']));

    const kvPassword = conf.ADMIN_PASSWORD;
    const hasUserSetPassword = !!(
        (kvPassword && String(kvPassword).trim()) || (env.password && String(env.password).trim())
    );
    const isRootAdmin = (url.pathname === '/' && !hasUserSetPassword);
    // 尚未设置口令时，任何后台入口（含超级口令路径）都需要引导令牌
    const bootstrapRequired = !hasUserSetPassword && !!env.BOOTSTRAP_TOKEN;

    // 轮换提示：先夹逼到合法范围，杜绝 new Date(NaN).toISOString() 崩溃
    let nextRotationInfo = "自动轮换已禁用 (0 天)";
    const parsedDays = parseInt(conf.SUB_EXPIRY_DAYS || "0", 10);
    const expiryDaysNum = Math.min(LIMITS.MAX_EXPIRY_DAYS, Math.max(0, Number.isFinite(parsedDays) ? parsedDays : 0));
    if (expiryDaysNum > 0) {
        try {
            const periodLengthMs = expiryDaysNum * 86400000;
            const currentPeriod = Math.floor(Date.now() / periodLengthMs);
            const nextPeriodStartMs = (currentPeriod + 1) * periodLengthMs;
            nextRotationInfo = `下次轮换 (UTC): ${new Date(nextPeriodStartMs).toISOString()}`;
        } catch (e) {
            nextRotationInfo = "自动轮换时间计算失败";
        }
    }

    const aggregatedSubUrl = url.origin + '/' + subToken;
    const passwordPromptHtml = isRootAdmin
        ? '<span style="color:red; font-size: 0.9em;"> (请设置密码)</span>'
        : '';
    const bootstrapHtml = bootstrapRequired ? `
            <div class="input-group">
                <label>首次配置引导令牌 (BOOTSTRAP_TOKEN)</label>
                <input type="password" name="bootstrap_token" autocomplete="off" required>
            </div>` : '';

    const nonce = randomNonce();
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>参数配置</title>
    <style>
        body { font-family: -apple-system, system-ui, sans-serif; background-color: #f0f2f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 1rem; box-sizing: border-box; color: #333; }
        .container { background: #fff; padding: 2.5rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 600px; position: relative; }
        h2 { text-align: center; margin-bottom: 2rem; margin-top: 0; }
        .btn-clean { position: absolute; top: 2.2rem; right: 2.5rem; background-color: #ff4d4f; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600; }
        .btn-clean:hover { background-color: #ff7875; }
        .input-group { margin-bottom: 1.5rem; }
        .input-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
        .input-group input, .input-group textarea { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        .input-group textarea { font-family: monospace; min-height: 90px; }
        .input-group small { display: block; margin-top: 0.5rem; color: #555; font-size: 0.85rem; line-height: 1.4; }
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
        <button type="button" id="flush-cache-btn" class="btn-clean">清理缓存</button>
        <h2>KV 参数配置</h2>
        <form id="config-form">
            <div class="input-group">
                <label>管理密码 (ADMIN_PASSWORD)${passwordPromptHtml}</label>
                <input type="password" id="password" name="password" value="" placeholder="留空表示不修改当前密码" autocomplete="new-password">
            </div>${bootstrapHtml}
            <div class="input-group">
                <label>订阅自动过期天数 (0-${LIMITS.MAX_EXPIRY_DAYS})</label>
                <input type="number" name="sub_expiry_days" value="${escapeHTML(expiryDaysNum)}" min="0" max="${LIMITS.MAX_EXPIRY_DAYS}">
            </div>
            <div class="input-group">
                <label>路由规则 (ROUTE_RULES) - 全流反代模式</label>
                <textarea name="route_rules" placeholder="v1: A.com&#10;v2: B.com:8443&#10;v3: https://C.com:2053">${escapeHTML(conf.ROUTE_RULES)}</textarea>
                <small>
                    • <b>纯净规则格式</b>：<code>标签: 目标地址</code><br>
                    • 按最长标签优先匹配；目标只允许 http/https，禁止指向内网与 Worker 自身<br>
                    • 支持 WebSocket / gRPC / HTTP 透传，子路径与查询参数原样转发
                </small>
            </div>
            <div class="input-group">
                <label>全局伪装域名兜底 (PROXY_HOSTNAME)</label>
                <input type="text" name="hostname" value="${escapeHTML(conf.PROXY_HOSTNAME)}">
            </div>
            <div class="input-group">
                <label>根目录跳转 (ROOT_REDIRECT_URL)</label>
                <input type="text" name="root_redirect_url" value="${escapeHTML(conf.ROOT_REDIRECT_URL)}">
            </div>
            <div class="input-group">
                <label>订阅 URL 列表 (最多 ${LIMITS.MAX_SUB_SOURCES} 条)</label>
                <textarea name="sublist_urls">${escapeHTML(conf.SUB_LIST_URLS)}</textarea>
            </div>
            <div class="input-group">
                <label>节点黑名单 (支持 * 通配，逗号/换行分隔)</label>
                <textarea name="sub_blacklist">${escapeHTML(conf.SUB_BLACKLIST)}</textarea>
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
    <script nonce="${nonce}">
        (function () {
            var onSuperPath = ${isSuperPath ? 'true' : 'false'};
            var status = document.getElementById('status');

            document.getElementById('config-form').addEventListener('submit', async function (e) {
                e.preventDefault();
                var pass = document.getElementById('password').value;
                status.textContent = '保存中...';
                try {
                    var res = await fetch(window.location.pathname, {
                        method: 'POST',
                        headers: { '${ADMIN_CSRF_HEADER}': '${ADMIN_CSRF_VALUE}' },
                        body: new FormData(this)
                    });
                    var json = await res.json();
                    status.className = json.success ? 'status-success' : 'status-error';
                    status.textContent = json.message;
                    if (json.success) {
                        var newPath = pass ? '/' + encodeURIComponent(pass) : window.location.pathname;
                        if (!onSuperPath && newPath !== window.location.pathname) {
                            setTimeout(function () { location.href = newPath; }, 2000);
                        } else {
                            setTimeout(function () { location.reload(); }, 2000);
                        }
                    }
                } catch (err) {
                    status.className = 'status-error';
                    status.textContent = '错误: ' + err.message;
                }
            });

            document.getElementById('copy-btn').onclick = function () {
                navigator.clipboard.writeText(document.getElementById('sub-url').value);
                this.textContent = '已复制';
                var self = this;
                setTimeout(function () { self.textContent = '复制'; }, 2000);
            };

            document.getElementById('flush-cache-btn').addEventListener('click', async function () {
                var pass = document.getElementById('password').value;
                if (!confirm('确定要清理系统缓存吗？')) return;
                status.textContent = '清理中...';
                try {
                    var res = await fetch('/flush-cache', {
                        method: 'POST',
                        headers: {
                            '${ADMIN_CSRF_HEADER}': '${ADMIN_CSRF_VALUE}',
                            'X-Admin-Password': pass
                        }
                    });
                    var text = await res.text();
                    status.className = res.status === 200 ? 'status-success' : 'status-error';
                    status.textContent = text;
                } catch (err) {
                    status.className = 'status-error';
                    status.textContent = '请求失败: ' + err.message;
                }
            });
        })();
    </script>
</body>
</html>`;

    return new Response(html, { status: 200, headers: baseHeaders(nonce) });
}
