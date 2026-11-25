// =================================================================
// === 协议解析模块：src/protocols/index.js ===
// =================================================================

import { safeBase64Encode } from '../utils/helpers.js';
import { LIMITS } from '../config.js';

/** 安全将数组或字符串转为分隔符连接的字符串 */
function safeJoin(val, delimiter = ',') {
    if (!val) return '';
    if (Array.isArray(val)) return val.join(delimiter);
    return String(val);
}

/** 节点入集合前的统一收口：长度截断 + 总量上限 */
function addNode(uniqueStrings, value) {
    if (!value || uniqueStrings.size >= LIMITS.MAX_NODES) return;
    uniqueStrings.add(String(value).slice(0, LIMITS.MAX_NODE_LENGTH));
}

const TAG = (name) => name ? `#${encodeURIComponent(String(name))}` : '';

// --- Hysteria v1 ---
export function processHysteria(data, uniqueStrings) {
    try {
        const { up_mbps, down_mbps, auth_str, server_name, alpn, server } = data;
        if (!server || !up_mbps || !down_mbps || !auth_str || !server_name || !alpn) return;
        addNode(uniqueStrings,
            `hysteria://${server}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${encodeURIComponent(auth_str)}&insecure=1&peer=${encodeURIComponent(server_name)}&alpn=${encodeURIComponent(safeJoin(alpn))}`);
    } catch (e) { /* 单条配置异常不影响其他节点 */ }
}

// --- Hysteria2 ---
export function processHysteria2(data, uniqueStrings) {
    try {
        let auth = '';
        if (typeof data.auth === 'string') auth = data.auth;
        else if (data.auth && typeof data.auth.password === 'string') auth = data.auth.password;
        else if (data.password) auth = String(data.password);

        const server = data.server || '';
        if (!server) return;

        const insecure = (data.tls && data.tls.insecure) ? 1 : 0;
        const sni = (data.tls && data.tls.sni) ? data.tls.sni : '';
        const alpn = safeJoin(data.tls?.alpn);
        const params = [];
        if (insecure) params.push(`insecure=${insecure}`);
        if (sni) params.push(`sni=${encodeURIComponent(sni)}`);
        if (alpn) params.push(`alpn=${encodeURIComponent(alpn)}`);
        addNode(uniqueStrings,
            `hysteria2://${encodeURIComponent(auth)}@${server}${params.length ? '?' + params.join('&') : ''}`);
    } catch (e) { /* noop */ }
}

// --- Xray (WS / XHTTP / gRPC / H2 / TCP + Reality) ---
export function processXray(data, uniqueStrings) {
    if (!data || !Array.isArray(data.outbounds)) return;

    for (const outbound of data.outbounds) {
        try {
            if (!outbound || uniqueStrings.size >= LIMITS.MAX_NODES) continue;
            const name = outbound.tag || '';
            const protocol = String(outbound.protocol || '').toLowerCase();
            const settings = outbound.settings || {};
            const streamSettings = outbound.streamSettings || {};

            const net = streamSettings.network || 'tcp';
            const security = streamSettings.security || '';
            const tlsSettings = streamSettings.tlsSettings || streamSettings.realitySettings || {};
            const sni = tlsSettings.serverName || '';
            const fp = tlsSettings.fingerprint || (security === 'tls' ? 'chrome' : '');
            const alpn = safeJoin(tlsSettings.alpn);

            const realitySettings = streamSettings.realitySettings || {};
            const pbk = realitySettings.publicKey || '';
            const sid = realitySettings.shortId || '';
            const spx = realitySettings.spiderX || '';

            let path = '';
            let host = '';
            if (streamSettings.wsSettings) {
                path = streamSettings.wsSettings.path || '';
                host = streamSettings.wsSettings.headers?.Host || streamSettings.wsSettings.headers?.host || '';
            } else if (streamSettings.xhttpSettings || streamSettings.splithttpSettings) {
                const xs = streamSettings.xhttpSettings || streamSettings.splithttpSettings;
                path = xs.path || '';
                host = xs.host || xs.headers?.Host || xs.headers?.host || '';
            } else if (streamSettings.grpcSettings) {
                path = streamSettings.grpcSettings.serviceName || '';
                host = streamSettings.grpcSettings.authority || '';
            } else if (streamSettings.httpSettings) {
                path = streamSettings.httpSettings.path || '';
                host = safeJoin(streamSettings.httpSettings.host);
            }

            // A. VMess
            if (protocol === 'vmess') {
                const vnext = settings.vnext?.[0] || {};
                const user = vnext.users?.[0] || {};
                const vmessObj = {
                    v: "2",
                    ps: name || vnext.address || 'vmess',
                    add: vnext.address || '',
                    port: vnext.port || '',
                    id: user.id || '',
                    aid: user.alterId !== undefined ? String(user.alterId) : "0",
                    scy: user.security || "auto",
                    net,
                    type: "none",
                    host,
                    path,
                    // 修复：vmess 链接的 tls 只能是 'tls' 或空，不能写 'reality'
                    tls: security === 'tls' ? 'tls' : '',
                    sni,
                    alpn,
                    fp
                };
                if (!vmessObj.add || !vmessObj.port || !vmessObj.id) continue;
                addNode(uniqueStrings, `vmess://${safeBase64Encode(JSON.stringify(vmessObj))}`);
                continue;
            }

            // B. VLESS（含 Reality）
            if (protocol === 'vless') {
                const vnext = settings.vnext?.[0] || {};
                const user = vnext.users?.[0] || {};
                const id = user.id || '';
                const address = vnext.address || '';
                const port = vnext.port || '';
                if (!id || !address || !port) continue;

                const params = [
                    `encryption=${encodeURIComponent(user.encryption || 'none')}`,
                    `security=${encodeURIComponent(security)}`,
                    `type=${encodeURIComponent(net)}`
                ];
                if (user.flow) params.push(`flow=${encodeURIComponent(user.flow)}`);
                if (sni) params.push(`sni=${encodeURIComponent(sni)}`);
                if (fp) params.push(`fp=${encodeURIComponent(fp)}`);
                if (pbk) params.push(`pbk=${encodeURIComponent(pbk)}`);
                if (sid) params.push(`sid=${encodeURIComponent(sid)}`);
                if (spx) params.push(`spx=${encodeURIComponent(spx)}`);
                if (path) params.push(`path=${encodeURIComponent(path)}`);
                if (host) params.push(`host=${encodeURIComponent(host)}`);
                if (alpn) params.push(`alpn=${encodeURIComponent(alpn)}`);

                addNode(uniqueStrings, `vless://${id}@${address}:${port}?${params.join('&')}${TAG(name)}`);
                continue;
            }

            // C. Trojan
            if (protocol === 'trojan') {
                const trojanSettings = settings.trojan || settings.clients?.[0] || {};
                const password = trojanSettings.password || settings.servers?.[0]?.password || '';
                const address = settings.servers?.[0]?.address || '';
                const port = settings.servers?.[0]?.port || '';
                if (!password || !address || !port) continue;

                const params = [`security=${encodeURIComponent(security || 'tls')}`, `type=${encodeURIComponent(net)}`];
                if (sni) params.push(`sni=${encodeURIComponent(sni)}`);
                if (fp) params.push(`fp=${encodeURIComponent(fp)}`);
                if (path) params.push(`path=${encodeURIComponent(path)}`);
                if (host) params.push(`host=${encodeURIComponent(host)}`);
                if (alpn) params.push(`alpn=${encodeURIComponent(alpn)}`);

                addNode(uniqueStrings, `trojan://${encodeURIComponent(password)}@${address}:${port}?${params.join('&')}${TAG(name)}`);
                continue;
            }

            // D. Shadowsocks（原先会被静默丢弃）
            if (protocol === 'shadowsocks') {
                const servers = Array.isArray(settings.servers) ? settings.servers : [];
                for (const s of servers) {
                    if (uniqueStrings.size >= LIMITS.MAX_NODES) break;
                    const method = s?.method || s?.cipher || 'aes-128-gcm';
                    const pass = s?.password || '';
                    const addr = s?.address || '';
                    const port = s?.port || '';
                    if (!addr || !port || !pass) continue;
                    const cred = safeBase64Encode(`${method}:${pass}`);
                    addNode(uniqueStrings, `ss://${cred}@${addr}:${port}${TAG(name)}`);
                }
            }
        } catch (e) { /* 单条 outbound 异常跳过 */ }
    }
}

// --- Singbox (Hysteria 形态) ---
export function processSingbox(data, uniqueStrings) {
    try {
        const { up_mbps, down_mbps, auth_str, server_name, alpn, server, server_port } = data;
        if (!server || !server_port || !up_mbps || !down_mbps || !auth_str || !server_name || !alpn) return;
        addNode(uniqueStrings,
            `hysteria://${server}:${server_port}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${encodeURIComponent(auth_str)}&insecure=1&peer=${encodeURIComponent(server_name)}&alpn=${encodeURIComponent(safeJoin(alpn))}`);
    } catch (e) { /* noop */ }
}

// --- Naive ---
export function processNaive(data, uniqueStrings) {
    try {
        const proxyStr = data.proxy;
        if (!proxyStr || typeof proxyStr !== 'string') return;
        const cleanStr = proxyStr.trim();
        // 修复：客户端要求 naive+ 前缀；https:// 与 quic:// 也必须补上
        if (cleanStr.startsWith('naive+')) addNode(uniqueStrings, cleanStr);
        else if (/^(https?|quic):\/\//i.test(cleanStr)) addNode(uniqueStrings, `naive+${cleanStr}`);
        else addNode(uniqueStrings, `naive+https://${cleanStr}`);
    } catch (e) { /* noop */ }
}

// --- 纯文本订阅行提取（大小写不敏感） ---
export function processSubscription(data, uniqueStrings) {
    if (!data || typeof data !== 'string') return;

    const prefixes = [
        'vless://', 'vmess://', 'trojan://', 'hysteria://', 'hysteria2://', 'hy2://',
        'ss://', 'ssr://', 'tuic://', 'naive+', 'anytls://', 'socks5://'
    ];
    const lines = data.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (uniqueStrings.size >= LIMITS.MAX_NODES) break;
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;
        const lower = line.toLowerCase();
        if (prefixes.some(p => lower.startsWith(p))) addNode(uniqueStrings, line);
    }
}

// --- Clash (YAML/JSON) ---
export function processClash(data, uniqueStrings) {
    if (!data || !Array.isArray(data.proxies)) return;

    for (const proxy of data.proxies) {
        try {
            if (!proxy || uniqueStrings.size >= LIMITS.MAX_NODES) continue;
            const { type, server, port, name } = proxy;
            if (!type || !server || !port || !name) continue;
            const t = String(type).toLowerCase();

            const network = proxy.network || 'tcp';
            const wsOpts = proxy['ws-opts'] || {};
            const grpcOpts = proxy['grpc-opts'] || {};
            const xhttpOpts = proxy['xhttp-opts'] || {};
            const path = proxy['ws-path'] || wsOpts.path || grpcOpts['grpc-service-name'] || xhttpOpts.path || '';
            const host = wsOpts.headers?.Host || wsOpts.headers?.host || xhttpOpts.host || '';

            const realityOpts = proxy['reality-opts'] || {};
            const isReality = Boolean(proxy.reality || proxy['reality-opts']);
            const security = isReality ? 'reality' : (proxy.tls ? 'tls' : '');
            const sni = proxy.sni || proxy['server-name'] || '';
            const fp = proxy.fingerprint || (security ? 'chrome' : '');
            const alpn = safeJoin(proxy.alpn);
            const tag = TAG(name);

            // A. VMess
            if (t === 'vmess') {
                const vmessObj = {
                    v: "2", ps: name, add: server, port,
                    id: proxy.uuid,
                    aid: proxy.alterId !== undefined ? String(proxy.alterId) : "0",
                    scy: proxy.cipher || "auto",
                    net: network, type: "none", host, path,
                    tls: security === 'tls' ? 'tls' : '',
                    sni, alpn, fp
                };
                if (!vmessObj.id) continue;
                addNode(uniqueStrings, `vmess://${safeBase64Encode(JSON.stringify(vmessObj))}`);
                continue;
            }

            // B. VLESS（含 Reality）
            if (t === 'vless') {
                if (!proxy.uuid) continue;
                const params = [`encryption=none`, `security=${encodeURIComponent(security)}`, `type=${encodeURIComponent(network)}`];
                if (proxy.flow) params.push(`flow=${encodeURIComponent(proxy.flow)}`);
                if (sni) params.push(`sni=${encodeURIComponent(sni)}`);
                if (fp) params.push(`fp=${encodeURIComponent(fp)}`);
                const pbk = realityOpts['public-key'] || realityOpts.publicKey || '';
                const sid = realityOpts['short-id'] || realityOpts.shortId || '';
                const spx = realityOpts['spider-x'] || realityOpts.spiderX || '';
                if (pbk) params.push(`pbk=${encodeURIComponent(pbk)}`);
                if (sid) params.push(`sid=${encodeURIComponent(sid)}`);
                if (spx) params.push(`spx=${encodeURIComponent(spx)}`);
                if (path) params.push(`path=${encodeURIComponent(path)}`);
                if (host) params.push(`host=${encodeURIComponent(host)}`);
                if (alpn) params.push(`alpn=${encodeURIComponent(alpn)}`);
                addNode(uniqueStrings, `vless://${proxy.uuid}@${server}:${port}?${params.join('&')}${tag}`);
                continue;
            }

            // C. Trojan
            if (t === 'trojan') {
                if (!proxy.password) continue;
                const params = [`security=${encodeURIComponent(security || 'tls')}`, `type=${encodeURIComponent(network)}`];
                if (sni) params.push(`sni=${encodeURIComponent(sni)}`);
                if (fp) params.push(`fp=${encodeURIComponent(fp)}`);
                if (path) params.push(`path=${encodeURIComponent(path)}`);
                if (host) params.push(`host=${encodeURIComponent(host)}`);
                if (alpn) params.push(`alpn=${encodeURIComponent(alpn)}`);
                addNode(uniqueStrings, `trojan://${encodeURIComponent(proxy.password)}@${server}:${port}?${params.join('&')}${tag}`);
                continue;
            }

            // D. Hysteria2
            if (t === 'hysteria2') {
                const auth = proxy.password || proxy.auth || '';
                if (!auth) continue;
                const insecure = (proxy.insecure || proxy['skip-cert-verify']) ? 1 : 0;
                const params = [];
                if (insecure) params.push('insecure=1');
                if (sni) params.push(`sni=${encodeURIComponent(sni)}`);
                if (alpn) params.push(`alpn=${encodeURIComponent(alpn)}`);
                addNode(uniqueStrings, `hysteria2://${encodeURIComponent(auth)}@${server}:${port}${params.length ? '?' + params.join('&') : ''}${tag}`);
                continue;
            }

            // E. Hysteria v1
            if (t === 'hysteria') {
                const auth = proxy['auth-str'] || proxy.auth_str || proxy.auth || '';
                const up = proxy.up || proxy.up_mbps || '';
                const down = proxy.down || proxy.down_mbps || '';
                if (!auth || !up || !down) continue;
                const params = [
                    'protocol=udp',
                    `auth=${encodeURIComponent(auth)}`,
                    `upmbps=${encodeURIComponent(up)}`,
                    `downmbps=${encodeURIComponent(down)}`
                ];
                if (sni) params.push(`peer=${encodeURIComponent(sni)}`);
                if (proxy['skip-cert-verify']) params.push('insecure=1');
                if (alpn) params.push(`alpn=${encodeURIComponent(alpn)}`);
                addNode(uniqueStrings, `hysteria://${server}:${port}?${params.join('&')}${tag}`);
                continue;
            }

            // F. TUIC v5
            if (t === 'tuic') {
                const uuid = proxy.uuid || proxy.token || '';
                const pass = proxy.password || '';
                if (!uuid || !pass) continue;
                const params = [];
                const cc = proxy['congestion-controller'] || proxy.congestion_controller || '';
                if (cc) params.push(`congestion_control=${encodeURIComponent(cc)}`);
                if (alpn) params.push(`alpn=${encodeURIComponent(alpn)}`);
                if (sni) params.push(`sni=${encodeURIComponent(sni)}`);
                if (proxy['skip-cert-verify']) params.push('allow_insecure=1');
                addNode(uniqueStrings, `tuic://${uuid}:${encodeURIComponent(pass)}@${server}:${port}${params.length ? '?' + params.join('&') : ''}${tag}`);
                continue;
            }

            // G. Shadowsocks
            if (t === 'ss') {
                const { password, cipher } = proxy;
                if (!password || !cipher) continue;
                addNode(uniqueStrings, `ss://${safeBase64Encode(`${cipher}:${password}`)}@${server}:${port}${tag}`);
            }
        } catch (e) { /* 单条 proxy 异常跳过 */ }
    }
}
