// =================================================================
// === 协议解析模块：src/protocols/index.js ===
// =================================================================

import { safeBase64Encode } from '../utils/helpers.js';

/**
 * 辅助函数：安全将数组或字符串转为逗号分隔字符串 (杜绝 TypeError)
 * @param {any} val 输入参数 (数组或字符串)
 * @param {string} delimiter 分隔符
 * @returns {string}
 */
function safeJoin(val, delimiter = ',') {
    if (!val) return '';
    if (Array.isArray(val)) return val.join(delimiter);
    return String(val);
}

// --- Hysteria ---
export function processHysteria(data, uniqueStrings) {
    try {
        const { up_mbps, down_mbps, auth_str, server_name, alpn, server } = data;
        if (!server || !up_mbps || !down_mbps || !auth_str || !server_name || !alpn) return;
        const alpnStr = safeJoin(alpn);
        const formattedString = `hysteria://${server}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${encodeURIComponent(auth_str)}&insecure=1&peer=${encodeURIComponent(server_name)}&alpn=${encodeURIComponent(alpnStr)}`;
        uniqueStrings.add(formattedString);
    } catch (e) {}
}

// --- Hysteria2 ---
export function processHysteria2(data, uniqueStrings) {
    try {
        // 兼容 auth 为对象或字符串的各种上游配置写法
        let auth = '';
        if (typeof data.auth === 'string') {
            auth = data.auth;
        } else if (data.auth && typeof data.auth.password === 'string') {
            auth = data.auth.password;
        } else if (data.password) {
            auth = String(data.password);
        }

        const server = data.server || '';
        if (!server) return;

        const insecure = (data.tls && data.tls.insecure) ? 1 : 0;
        const sni = (data.tls && data.tls.sni) ? data.tls.sni : '';
        const alpn = safeJoin(data.tls?.alpn);
        
        const queryParams = [];
        if (insecure) queryParams.push(`insecure=${insecure}`);
        if (sni) queryParams.push(`sni=${encodeURIComponent(sni)}`);
        if (alpn) queryParams.push(`alpn=${encodeURIComponent(alpn)}`);
        const queryStr = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

        const formattedString = `hysteria2://${encodeURIComponent(auth)}@${server}${queryStr}`;
        uniqueStrings.add(formattedString);
    } catch (e) {}
}

// --- Xray (完整支持数组遍历、WS/XHTTP/gRPC/H2/TCP 全传输层以及 Reality) ---
export function processXray(data, uniqueStrings) {
    if (!data || !Array.isArray(data.outbounds)) return;

    for (const outbound of data.outbounds) {
        try {
            if (!outbound) continue;
            const name = outbound.tag || '';
            const protocol = outbound.protocol;
            const settings = outbound.settings || {};
            const streamSettings = outbound.streamSettings || {};

            // 传输层网络与各协议配置
            const net = streamSettings.network || 'tcp';
            const security = streamSettings.security || '';
            const tlsSettings = streamSettings.tlsSettings || streamSettings.realitySettings || {};
            const sni = tlsSettings.serverName || '';
            const fp = tlsSettings.fingerprint || (security === 'tls' ? 'chrome' : '');
            const alpn = safeJoin(tlsSettings.alpn);

            // Reality 专属配置提取 (修复节点失效关键 Bug)
            const realitySettings = streamSettings.realitySettings || {};
            const pbk = realitySettings.publicKey || '';
            const sid = realitySettings.shortId || '';
            const spx = realitySettings.spiderX || '';

            // 路径与 Host 提取 (兼容 ws, xhttp, splithttp, grpc, http)
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

            // A. VMess 协议处理
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
                    net: net,
                    type: "none",
                    host: host,
                    path: path,
                    tls: security,
                    sni: sni,
                    alpn: alpn,
                    fp: fp
                };
                if (!vmessObj.add || !vmessObj.port || !vmessObj.id) continue;
                uniqueStrings.add(`vmess://${safeBase64Encode(JSON.stringify(vmessObj))}`);
                continue;
            }

            // B. VLESS 协议处理 (含完整 Reality 支持)
            if (protocol === 'vless') {
                const vnext = settings.vnext?.[0] || {};
                const user = vnext.users?.[0] || {};
                const id = user.id || '';
                const address = vnext.address || '';
                const port = vnext.port || '';
                const encryption = user.encryption || 'none';
                const flow = user.flow || '';

                if (!id || !address || !port) continue;

                const params = [
                    `encryption=${encodeURIComponent(encryption)}`,
                    `security=${encodeURIComponent(security)}`,
                    `type=${encodeURIComponent(net)}`
                ];
                if (flow) params.push(`flow=${encodeURIComponent(flow)}`);
                if (sni) params.push(`sni=${encodeURIComponent(sni)}`);
                if (fp) params.push(`fp=${encodeURIComponent(fp)}`);
                if (pbk) params.push(`pbk=${encodeURIComponent(pbk)}`);
                if (sid) params.push(`sid=${encodeURIComponent(sid)}`);
                if (spx) params.push(`spx=${encodeURIComponent(spx)}`);
                if (path) params.push(`path=${encodeURIComponent(path)}`);
                if (host) params.push(`host=${encodeURIComponent(host)}`);
                if (alpn) params.push(`alpn=${encodeURIComponent(alpn)}`);

                const tagStr = name ? `#${encodeURIComponent(name)}` : '';
                uniqueStrings.add(`vless://${id}@${address}:${port}?${params.join('&')}${tagStr}`);
                continue;
            }

            // C. Trojan 协议处理
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

                const tagStr = name ? `#${encodeURIComponent(name)}` : '';
                uniqueStrings.add(`trojan://${encodeURIComponent(password)}@${address}:${port}?${params.join('&')}${tagStr}`);
            }
        } catch (e) {}
    }
}

// --- Singbox ---
export function processSingbox(data, uniqueStrings) {
    try {
        const { up_mbps, down_mbps, auth_str, server_name, alpn, server, server_port } = data;
        if (!server || !server_port || !up_mbps || !down_mbps || !auth_str || !server_name || !alpn) return;
        const alpnStr = safeJoin(alpn);
        uniqueStrings.add(`hysteria://${server}:${server_port}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${encodeURIComponent(auth_str)}&insecure=1&peer=${encodeURIComponent(server_name)}&alpn=${encodeURIComponent(alpnStr)}`);
    } catch (e) {}
}

// --- Naive ---
export function processNaive(data, uniqueStrings) {
    try {
        const proxy_str = data.proxy;
        if (!proxy_str || typeof proxy_str !== 'string') return;
        const cleanStr = proxy_str.trim();
        if (cleanStr.startsWith('naive+') || cleanStr.startsWith('https://') || cleanStr.startsWith('quic://')) {
            uniqueStrings.add(cleanStr);
        } else {
            uniqueStrings.add(`naive+https://${cleanStr}`);
        }
    } catch (e) {}
}

// --- Subscription 纯文本行提取 (单趟流式处理，零冗余中间数组) ---
export function processSubscription(data, uniqueStrings) {
    if (!data || typeof data !== 'string') return;

    const lines = data.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (
            line.startsWith('vless://') ||
            line.startsWith('vmess://') ||
            line.startsWith('trojan://') ||
            line.startsWith('hysteria://') ||
            line.startsWith('hysteria2://') ||
            line.startsWith('hy2://') ||
            line.startsWith('ss://') ||
            line.startsWith('ssr://') ||
            line.startsWith('tuic://') ||
            line.startsWith('naive+')
        ) {
            uniqueStrings.add(line);
        }
    }
}

// --- Clash (YAML/JSON，修复 Reality 关键参数、alpn 类型容错) ---
export function processClash(data, uniqueStrings) {
    if (!data || !Array.isArray(data.proxies)) return;

    for (const proxy of data.proxies) {
        try {
            if (!proxy) continue;
            const { type, server, port, name } = proxy;
            if (!type || !server || !port || !name) continue;

            // 统一提取网络与传输配置
            const network = proxy.network || 'tcp';
            const wsOpts = proxy['ws-opts'] || {};
            const grpcOpts = proxy['grpc-opts'] || {};
            const xhttpOpts = proxy['xhttp-opts'] || {};
            
            const path = proxy['ws-path'] || wsOpts.path || grpcOpts['grpc-service-name'] || xhttpOpts.path || '';
            const host = wsOpts.headers?.Host || wsOpts.headers?.host || xhttpOpts.host || '';
            
            // Reality 专属判定与提取
            const realityOpts = proxy['reality-opts'] || {};
            const isReality = Boolean(proxy.reality || proxy['reality-opts']);
            const security = isReality ? 'reality' : (proxy.tls ? 'tls' : '');
            const sni = proxy.sni || proxy['server-name'] || '';
            const fp = proxy.fingerprint || (security ? 'chrome' : '');
            const alpn = safeJoin(proxy.alpn);

            // A. VMess
            if (type === 'vmess') {
                const vmessObj = {
                    v: "2",
                    ps: name,
                    add: server,
                    port: port,
                    id: proxy.uuid,
                    aid: proxy.alterId !== undefined ? String(proxy.alterId) : "0",
                    scy: proxy.cipher || "auto",
                    net: network,
                    type: "none",
                    host: host,
                    path: path,
                    tls: security,
                    sni: sni,
                    alpn: alpn,
                    fp: fp
                };
                if (!vmessObj.id) continue;
                uniqueStrings.add(`vmess://${safeBase64Encode(JSON.stringify(vmessObj))}`);
                continue;
            }

            // B. VLESS (完整兼容 Reality)
            if (type === 'vless') {
                const uuid = proxy.uuid;
                if (!uuid) continue;

                const params = [
                    `encryption=none`,
                    `security=${encodeURIComponent(security)}`,
                    `type=${encodeURIComponent(network)}`
                ];
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

                uniqueStrings.add(`vless://${uuid}@${server}:${port}?${params.join('&')}#${encodeURIComponent(name)}`);
                continue;
            }

            // C. Trojan
            if (type === 'trojan') {
                const password = proxy.password;
                if (!password) continue;

                const params = [
                    `security=${encodeURIComponent(security || 'tls')}`,
                    `type=${encodeURIComponent(network)}`
                ];
                if (sni) params.push(`sni=${encodeURIComponent(sni)}`);
                if (fp) params.push(`fp=${encodeURIComponent(fp)}`);
                if (path) params.push(`path=${encodeURIComponent(path)}`);
                if (host) params.push(`host=${encodeURIComponent(host)}`);
                if (alpn) params.push(`alpn=${encodeURIComponent(alpn)}`);

                uniqueStrings.add(`trojan://${encodeURIComponent(password)}@${server}:${port}?${params.join('&')}#${encodeURIComponent(name)}`);
                continue;
            }

            // D. Hysteria2
            if (type === 'hysteria2') {
                const auth = proxy.password || proxy.auth || '';
                if (!auth) continue;
                const insecure = (proxy.insecure || proxy['skip-cert-verify']) ? 1 : 0;
                
                const params = [];
                if (insecure) params.push(`insecure=1`);
                if (sni) params.push(`sni=${encodeURIComponent(sni)}`);
                if (alpn) params.push(`alpn=${encodeURIComponent(alpn)}`);
                const queryStr = params.length > 0 ? `?${params.join('&')}` : '';

                uniqueStrings.add(`hysteria2://${encodeURIComponent(auth)}@${server}:${port}${queryStr}#${encodeURIComponent(name)}`);
                continue;
            }

            // E. Shadowsocks
            if (type === 'ss') {
                const { password, cipher } = proxy;
                if (!password || !cipher) continue;
                const credentials = safeBase64Encode(`${cipher}:${password}`);
                uniqueStrings.add(`ss://${credentials}@${server}:${port}#${encodeURIComponent(name)}`);
            }
        } catch (e) {}
    }
}
