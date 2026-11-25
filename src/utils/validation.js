// =================================================================
// === 输入校验 / 目标地址解析：src/utils/validation.js ===
// =================================================================

import { LIMITS } from '../config.js';

const ROUTE_KEY_RE = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

/** 主机名规范化：小写 + 去尾点（URL 已完成 punycode 编码） */
export function normalizeHostname(host) {
    return String(host || '').trim().toLowerCase().replace(/\.+$/, '');
}

/**
 * 禁止作为反代目标的 host：回环、私网、链路本地、云元数据、内部域名。
 * Cloudflare Workers 本身无法访问这些地址，这里显式拦截以防配置误用与 SSRF 绕过。
 */
export function isForbiddenHost(host) {
    const h = normalizeHostname(host);
    if (!h) return true;
    if (h === 'localhost' || h.endsWith('.localhost')) return true;
    if (h === 'metadata' || h === 'metadata.google.internal' || h.endsWith('.internal')) return true;
    if (h.endsWith('.local') || h.endsWith('.localdomain') || h.endsWith('.arpa')) return true;
    if (h === '0' || h === '0.0.0.0' || h === '::' || h === '[::]' || h === '[::1]') return true;

    // IPv6（URL.hostname 对 IPv6 会带方括号）
    if (h.startsWith('[')) {
        const inner = h.slice(1, h.indexOf(']') === -1 ? undefined : h.indexOf(']'));
        const v6 = inner.toLowerCase();
        if (v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') ||
            v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb')) {
            return true;
        }
        return false;
    }

    const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
        const o = m.slice(1).map(Number);
        if (o.some(n => n > 255)) return true;
        const [a, b] = o;
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 169 && b === 254) return true;              // 链路本地 / 元数据
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 100 && b >= 64 && b <= 127) return true;    // CGNAT
        if (a === 198 && (b === 18 || b === 19)) return true;
        if (a >= 224) return true;                            // 组播 / 保留
    }
    return false;
}

/**
 * 解析并校验反代目标。
 * 输入形如 `example.com:8443/path` 或 `https://example.com/base`。
 * 拒绝 userinfo（`@` 绕过）、query/hash 注入、非 http(s) 协议、私网目标。
 * @returns {{proto:string, host:string, hostname:string, basePath:string, original:string}}
 * @throws {Error} 目标非法
 */
export function parseProxyTarget(raw) {
    const original = String(raw ?? '').trim();
    if (!original) throw new Error('目标地址为空');

    let proto = null;
    let rest = original;
    const protoMatch = rest.match(/^(https?):\/\//i);
    if (protoMatch) {
        proto = protoMatch[1].toLowerCase() + ':';
        rest = rest.slice(protoMatch[0].length);
    } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rest)) {
        throw new Error('只允许 http/https 目标');
    }

    if (rest.includes('@')) throw new Error('目标地址不允许包含用户信息');
    if (/[?#]/.test(rest)) throw new Error('目标地址不允许包含查询串或片段');

    const slashIndex = rest.indexOf('/');
    const hostPart = (slashIndex === -1 ? rest : rest.slice(0, slashIndex)).trim();
    const basePath = slashIndex === -1 ? '' : rest.slice(slashIndex).replace(/\/+$/, '');
    if (!hostPart) throw new Error('目标主机名缺失');

    if (!proto) {
        const portMatch = hostPart.match(/:(\d+)$/);
        proto = (portMatch && (portMatch[1] === '80' || portMatch[1] === '8080')) ? 'http:' : 'https:';
    }

    let url;
    try {
        url = new URL(`${proto}//${hostPart}`);
    } catch (e) {
        throw new Error('目标地址格式非法');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('只允许 http/https 目标');
    }
    if (url.port) {
        const port = Number(url.port);
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('目标端口非法');
    }
    if (isForbiddenHost(url.hostname)) throw new Error('目标地址指向内网/保留地址');
    if (CONTROL_RE.test(basePath)) throw new Error('目标路径包含非法控制字符');

    return {
        proto: url.protocol,
        host: url.host,
        hostname: url.hostname,
        basePath,
        original
    };
}

/** 校验根目录跳转：只允许 http/https 绝对地址，禁止 userinfo 与 javascript:/data: */
export function safeRedirectUrl(raw) {
    const s = String(raw ?? '').trim();
    if (!s || s.length > LIMITS.MAX_REDIRECT_LENGTH) return '';
    try {
        const u = new URL(s);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
        if (u.username || u.password) return '';
        if (CONTROL_RE.test(s)) return '';
        return u.toString();
    } catch (e) {
        return '';
    }
}

/** 同源校验（用于管理后台 POST 的 CSRF 防护） */
export function isSameOriginRequest(request) {
    const origin = request.headers.get('Origin');
    if (origin) {
        try {
            return new URL(origin).origin === new URL(request.url).origin;
        } catch (e) {
            return false;
        }
    }
    // 无 Origin 时退回 Fetch Metadata
    return request.headers.get('Sec-Fetch-Site') === 'same-origin';
}

/**
 * 校验后台提交的全部配置。
 * 返回 { ok:true, values, passwordProvided } 或 { ok:false, error }。
 * password 留空 = 不修改 ADMIN_PASSWORD（避免明文回填，也避免误清空）。
 */
export function validateAdminForm(formData, currentHostname = '') {
    const read = (k) => {
        const v = formData.get(k);
        return typeof v === 'string' ? v : (v == null ? '' : String(v));
    };

    const values = {};
    let passwordProvided = false;

    const password = read('password').trim();
    if (password) {
        if (password.length > LIMITS.MAX_PASSWORD_LENGTH) return { ok: false, error: '密码过长' };
        if (CONTROL_RE.test(password)) return { ok: false, error: '密码包含非法控制字符' };
        // 后台用「口令即路径」鉴权：只允许 encodeURIComponent 不转义的字符，
        // 否则 pathname 会被百分号编码，导致后台永远不可达（自我锁定）。
        if (!/^[A-Za-z0-9._~!*'()-]+$/.test(password)) {
            return { ok: false, error: '密码只能包含字母、数字及 . _ - ~ ! * ( ) 等路径安全字符' };
        }
        values.ADMIN_PASSWORD = password;
        passwordProvided = true;
    }

    const expiryRaw = read('sub_expiry_days').trim() || '0';
    if (!/^\d{1,4}$/.test(expiryRaw)) return { ok: false, error: '轮换天数必须是 0-365 的整数' };
    const expiry = parseInt(expiryRaw, 10);
    if (!Number.isInteger(expiry) || expiry < 0 || expiry > LIMITS.MAX_EXPIRY_DAYS) {
        return { ok: false, error: `轮换天数必须在 0-${LIMITS.MAX_EXPIRY_DAYS} 之间` };
    }
    values.SUB_EXPIRY_DAYS = String(expiry);

    const routeRaw = read('route_rules');
    if (routeRaw.length > 32 * 1024) return { ok: false, error: '路由规则过长' };
    const ruleLines = routeRaw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (ruleLines.length > LIMITS.MAX_ROUTE_RULES) return { ok: false, error: '路由规则条数超限' };
    for (let i = 0; i < ruleLines.length; i++) {
        const line = ruleLines[i];
        const colon = line.indexOf(':');
        if (colon === -1) return { ok: false, error: `路由规则第 ${i + 1} 行缺少冒号` };
        const key = line.slice(0, colon).trim().replace(/^\/+|\/+$/g, '');
        const target = line.slice(colon + 1).trim();
        if (!ROUTE_KEY_RE.test(key)) return { ok: false, error: `路由规则第 ${i + 1} 行标签非法` };
        if (!target) return { ok: false, error: `路由规则第 ${i + 1} 行目标为空` };
        try {
            const parsed = parseProxyTarget(target);
            if (normalizeHostname(parsed.hostname) === normalizeHostname(currentHostname)) {
                return { ok: false, error: `路由规则第 ${i + 1} 行目标指向 Worker 自身` };
            }
        } catch (e) {
            return { ok: false, error: `路由规则第 ${i + 1} 行非法：${e.message}` };
        }
    }
    values.ROUTE_RULES = routeRaw;

    const hostname = read('hostname').trim();
    if (hostname) {
        try {
            const parsed = parseProxyTarget(hostname);
            if (normalizeHostname(parsed.hostname) === normalizeHostname(currentHostname)) {
                return { ok: false, error: '全局伪装域名不能指向 Worker 自身' };
            }
        } catch (e) {
            return { ok: false, error: `全局伪装域名非法：${e.message}` };
        }
    }
    values.PROXY_HOSTNAME = hostname;

    const subListRaw = read('sublist_urls');
    if (subListRaw.length > 32 * 1024) return { ok: false, error: '订阅 URL 列表过长' };
    const urls = subListRaw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (urls.length > LIMITS.MAX_SUB_SOURCES) {
        return { ok: false, error: `订阅源最多 ${LIMITS.MAX_SUB_SOURCES} 条` };
    }
    for (let i = 0; i < urls.length; i++) {
        const line = urls[i];
        if (!/^https?:\/\//i.test(line)) return { ok: false, error: `订阅源第 ${i + 1} 行必须以 http(s):// 开头` };
        try {
            const u = new URL(line);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('协议不支持');
            if (u.username || u.password) throw new Error('不允许包含用户信息');
            if (isForbiddenHost(u.hostname)) throw new Error('不允许指向内网/保留地址');
        } catch (e) {
            return { ok: false, error: `订阅源第 ${i + 1} 行非法：${e.message}` };
        }
    }
    values.SUB_LIST_URLS = subListRaw;

    const blacklist = read('sub_blacklist');
    if (blacklist.length > LIMITS.MAX_BLACKLIST_BYTES) return { ok: false, error: '节点黑名单过长' };
    if (CONTROL_RE.test(blacklist.replace(/[\n\r\t]/g, ''))) return { ok: false, error: '节点黑名单包含非法控制字符' };
    values.SUB_BLACKLIST = blacklist;

    const redirectRaw = read('root_redirect_url').trim();
    if (redirectRaw && !safeRedirectUrl(redirectRaw)) {
        return { ok: false, error: '根目录跳转必须是合法的 http/https 绝对地址' };
    }
    values.ROOT_REDIRECT_URL = redirectRaw;

    return { ok: true, values, passwordProvided };
}

/** 解析订阅源列表（已在上游校验过，这里只做防御性过滤） */
export function parseSubscriptionUrls(raw) {
    if (!raw || typeof raw !== 'string') return [];
    return raw.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'))
        .filter(l => /^https?:\/\//i.test(l))
        .slice(0, LIMITS.MAX_SUB_SOURCES);
}

/** 解析路由规则：按 key 长度降序（最长前缀优先），非法行跳过 */
export function parseRouteRules(routeRulesStr) {
    if (!routeRulesStr) return [];
    const rules = [];
    for (const rawLine of routeRulesStr.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const key = line.slice(0, colonIdx).trim().replace(/^\/+|\/+$/g, '');
        const target = line.slice(colonIdx + 1).trim();
        if (!key || !target) continue;
        try {
            const parsed = parseProxyTarget(target);
            rules.push({ key, ...parsed });
        } catch (e) {
            // 非法规则不进入热路径，避免整站抛异常
        }
    }
    return rules.sort((a, b) => b.key.length - a.key.length);
}
