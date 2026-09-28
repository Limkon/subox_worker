// =================================================================
// === 协议解析模块：src/protocols/index.js ===
// =================================================================

import { safeBase64Encode } from '../utils/helpers.js';

// --- Hysteria ---
export function processHysteria(data, uniqueStrings) {
    try {
        const { up_mbps, down_mbps, auth_str, server_name, alpn, server } = data;
        if (!server || !up_mbps || !down_mbps || !auth_str || !server_name || !alpn) return;
        const formattedString = `hysteria://${server}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${auth_str}&insecure=1&peer=${server_name}&alpn=${alpn}`;
        uniqueStrings.add(formattedString);
    } catch (e) {}
}

// --- Hysteria2 ---
export function processHysteria2(data, uniqueStrings) {
    try {
        const auth = data.auth || '';
        const server = data.server || '';
        const insecure = data.tls && data.tls.insecure ? 1 : 0;
        const sni = data.tls ? data.tls.sni || '' : '';
        if (!server) return;
        
        let queryParams = [];
        if (insecure) queryParams.push(`insecure=${insecure}`);
        if (sni) queryParams.push(`sni=${encodeURIComponent(sni)}`);
        const queryStr = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

        const formattedString = `hysteria2://${auth}@${server}${queryStr}`;
        uniqueStrings.add(formattedString);
    } catch (e) {}
}

// --- Xray (完整支持数组遍历与 WS/XHTTP/gRPC/H2/TCP 全传输层) ---
export function processXray(data, uniqueStrings) {
    if (!data || !Array.isArray(data.outbounds)) return;

    // 1. 彻底修复：循环遍历全部 outbound，杜绝只读首个导致节点丢失
    for (const outbound of data.outbounds) {
        try {
            if (!outbound) continue;
            const name = outbound.tag || '';
            const protocol = outbound.protocol;
            const settings = outbound.settings || {};
            const streamSettings = outbound.streamSettings || {};

            // 识别传输层网络与各协议配置
            const net = streamSettings.network || 'tcp';
            const security = streamSettings.security || '';
            const tlsSettings = streamSettings.tlsSettings || streamSettings.realitySettings || {};
            const sni = tlsSettings.serverName || '';
            const fp = tlsSettings.fingerprint || (security === 'tls' ? 'chrome' : '');
            const alpn = tlsSettings.alpn ? tlsSettings.alpn.join(',') : '';

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
                host = streamSettings.httpSettings.host ? streamSettings.httpSettings.host.join(',') : '';
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
                    aid: user.alterId || "0",
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

            // B. VLESS 协议处理
            if (protocol === 'vless') {
                const vnext = settings.vnext?.[0] || {};
                const user = vnext.users?.[0] || {};
                const id = user.id || '';
                const address = vnext.address || '';
                const port = vnext.port || '';
                const encryption = user.encryption || 'none';

                if (!id || !address || !port) continue;

                let params = [
                    `encryption=${encryption}`,
                    `security=${security}`,
                    `type=${net}`
                ];
                if (sni) params.push(`sni=${encodeURIComponent(sni)}`);
                if (fp) params.push(`fp=${encodeURIComponent(fp)}`);
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

                let params = [`security=${security || 'tls'}`, `type=${net}`];
                if (sni) params.push(`sni=${encodeURIComponent(sni)}`);
                if (fp) params.push(`fp=${encodeURIComponent(fp)}`);
                if (path) params.push(`path=${encodeURIComponent(path)}`);
                if (host) params.push(`host=${encodeURIComponent(host)}`);
                if (alpn) params.push(`alpn=${encodeURIComponent(alpn)}`);

                const tagStr = name ? `#${encodeURIComponent(name)}` : '';
                uniqueStrings.add(`trojan://${password}@${address}:${port}?${params.join('&')}${tagStr}`);
            }
        } catch (e) {}
    }
}

// --- Singbox ---
export function processSingbox(data, uniqueStrings) {
    try {
        const { up_mbps, down_mbps, auth_str, server_name, alpn, server, server_port } = data;
        if (!server || !server_port || !up_mbps || !down_mbps || !auth_str || !server_name || !alpn) return;
        uniqueStrings.add(`hysteria://${server}:${server_port}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${auth_str}&insecure=1&peer=${server_name}&alpn=${alpn}`);
    } catch (e) {}
}

// --- Naive (直接添加规范格式，杜绝乱码二次 Base64) ---
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

// --- Subscription (增强对 hy2://、tuic:// 等全协议格式识别) ---
export function processSubscription(data, uniqueStrings) {
    if (!data || typeof data !== 'string') return;

    const lines = data.split('\n')
        .map(line => line.trim())
        .filter(line => {
            return line && (
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
            );
        });

    lines.forEach(line => uniqueStrings.add(line));
}

// --- Clash (YAML/JSON，全面适配 WS/XHTTP/gRPC/SS) ---
export function processClash(data, uniqueStrings) {
    if (!data || !Array.isArray(data.proxies)) return;

    data.proxies.forEach(proxy => {
        try {
            const { type, server, port, name } = proxy;
            if (!type || !server || !port || !name) return;

            // 统一提取网络与传输配置
            const network = proxy.network || 'tcp';
            const wsOpts = proxy['ws-opts'] || {};
            const grpcOpts = proxy['grpc-opts'] || {};
            const xhttpOpts = proxy['xhttp-opts'] || {};
            
            const path = proxy['ws-path'] || wsOpts.path || grpcOpts['grpc-service-name'] || xhttpOpts.path || '';
            const host = wsOpts.headers?.Host || wsOpts.headers?.host || xhttpOpts.host || '';
            const security = proxy.tls ? 'tls' : (proxy.reality ? 'reality' : '');
            const sni = proxy.sni || proxy['server-name'] || '';
            const fp = proxy.fingerprint || (security ? 'chrome' : '');
            const alpn = proxy.alpn ? proxy.alpn.join(',') : '';

            // A. VMess
            if (type === 'vmess') {
                const vmessObj = {
                    v: "2",
                    ps: name,
                    add: server,
                    port: port,
                    id: proxy.uuid,
                    aid: proxy.alterId || "0",
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
                if (!vmessObj.id) return;
                uniqueStrings.add(`vmess://${safeBase64Encode(JSON.stringify(vmessObj))}`);
                return;
            }

            // B. VLESS
            if (type === 'vless') {
                const uuid = proxy.uuid;
                if (!uuid) return;

                let params = [
                    `encryption=none`,
                    `security=${security}`,
                    `type=${network}`
                ];
                if (sni) params.push(`sni=${encodeURIComponent(sni)}`);
                if (fp) params.push(`fp=${encodeURIComponent(fp)}`);
                if (path) params.push(`path=${encodeURIComponent(path)}`);
                if (host) params.push(`host=${encodeURIComponent(host)}`);
                if (alpn) params.push(`alpn=${encodeURIComponent(alpn)}`);

                uniqueStrings.add(`vless://${uuid}@${server}:${port}?${params.join('&')}#${encodeURIComponent(name)}`);
                return;
            }

            // C. Trojan
            if (type === 'trojan') {
                const password = proxy.password;
                if (!password) return;

                let params = [
                    `security=${security || 'tls'}`,
                    `type=${network}`
                ];
                if (sni) params.push(`sni=${encodeURIComponent(sni)}`);
                if (fp) params.push(`fp=${encodeURIComponent(fp)}`);
                if (path) params.push(`path=${encodeURIComponent(path)}`);
                if (host) params.push(`host=${encodeURIComponent(host)}`);

                uniqueStrings.add(`trojan://${password}@${server}:${port}?${params.join('&')}#${encodeURIComponent(name)}`);
                return;
            }

            // D. Hysteria2
            if (type === 'hysteria2') {
                const auth = proxy.password || proxy.auth || '';
                if (!auth) return;
                const insecure = proxy.insecure || proxy['skip-cert-verify'] ? 1 : 0;
                
                let params = [];
                if (insecure) params.push(`insecure=1`);
                if (sni) params.push(`sni=${encodeURIComponent(sni)}`);
                const queryStr = params.length > 0 ? `?${params.join('&')}` : '';

                uniqueStrings.add(`hysteria2://${auth}@${server}:${port}${queryStr}#${encodeURIComponent(name)}`);
                return;
            }

            // E. Shadowsocks
            if (type === 'ss') {
                const { password, cipher } = proxy;
                if (!password || !cipher) return;
                const credentials = safeBase64Encode(`${cipher}:${password}`);
                uniqueStrings.add(`ss://${credentials}@${server}:${port}#${encodeURIComponent(name)}`);
            }
        } catch (e) {}
    });
}
