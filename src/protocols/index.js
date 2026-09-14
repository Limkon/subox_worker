// =================================================================
// === 协议解析模块：src/protocols/index.js ===
// =================================================================

import { safeBase64Encode } from '../utils/helpers.js';

// --- Hysteria ---
export function processHysteria(data, uniqueStrings) {
    const { up_mbps, down_mbps, auth_str, server_name, alpn, server } = data;
    if (!server || !up_mbps || !down_mbps || !auth_str || !server_name || !alpn) return;
    const formattedString = `hysteria://${server}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${auth_str}&insecure=1&peer=${server_name}&alpn=${alpn}`;
    uniqueStrings.add(formattedString);
}

// --- Hysteria2 ---
export function processHysteria2(data, uniqueStrings) {
    const auth = data.auth || '';
    const server = data.server || '';
    const insecure = data.tls && data.tls.insecure ? 1 : 0;
    const sni = data.tls ? data.tls.sni || '' : '';
    if (!server) return;
    const formattedString = `hysteria2://${auth}@${server}?insecure=${insecure}&sni=${sni}`;
    uniqueStrings.add(formattedString);
}

// --- Xray ---
export function processXray(data, uniqueStrings) {
    const outbound = data.outbounds?.[0];
    if (!outbound) return;
    const name = outbound.tag || '';
    if (!name) return;

    const protocol = outbound.protocol;
    const settings = outbound.settings || {};
    const streamSettings = outbound.streamSettings || {};

    if (protocol === 'vmess') {
        const vnext = settings.vnext?.[0] || {};
        const user = vnext.users?.[0] || {};
        const vmessObj = {
            v: "2",
            ps: name,
            add: vnext.address || '',
            port: vnext.port || '',
            id: user.id || '',
            aid: user.alterId || "0",
            scy: user.security || "auto",
            net: streamSettings.network || 'tcp',
            type: "none",
            host: streamSettings.wsSettings?.headers?.Host || '',
            path: streamSettings.wsSettings?.path || '',
            tls: streamSettings.security || '',
            sni: streamSettings.tlsSettings?.serverName || '',
            alpn: streamSettings.tlsSettings?.alpn ? streamSettings.tlsSettings.alpn.join(',') : '',
            fp: streamSettings.tlsSettings?.fingerprint || (streamSettings.security === 'tls' ? 'chrome' : '')
        };
        if (!vmessObj.add || !vmessObj.port || !vmessObj.id) return;
        uniqueStrings.add(`vmess://${safeBase64Encode(JSON.stringify(vmessObj))}`);
        return;
    }

    if (protocol === 'vless') {
        const vnext = settings.vnext?.[0] || {};
        const user = vnext.users?.[0] || {};
        const id = user.id || '';
        const address = vnext.address || '';
        const port = vnext.port || '';
        const encryption = user.encryption || 'none';
        const security = streamSettings.security || '';
        let fp = streamSettings.tlsSettings?.fingerprint || '';
        const sni = streamSettings.tlsSettings?.serverName || '';
        const type = streamSettings.network || 'tcp';
        const path = streamSettings.wsSettings?.path || '';
        const host = streamSettings.wsSettings?.headers?.Host || '';
        if (security === 'tls' && !fp) fp = 'chrome';

        if (!id || !address || !port) return;
        uniqueStrings.add(`vless://${id}@${address}:${port}?encryption=${encryption}&security=${security}&sni=${sni}&fp=${fp}&type=${type}&path=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}#${encodeURIComponent(name)}`);
        return;
    }

    if (protocol === 'trojan') {
        const trojanSettings = settings.trojan || settings.clients?.[0] || {};
        const password = trojanSettings.password || '';
        const address = settings.servers?.[0]?.address || '';
        const port = settings.servers?.[0]?.port || '';
        const security = streamSettings.security || '';
        let fp = streamSettings.tlsSettings?.fingerprint || '';
        const sni = streamSettings.tlsSettings?.serverName || '';
        const type = streamSettings.network || 'tcp';
        const path = streamSettings.wsSettings?.path || '';
        const host = streamSettings.wsSettings?.headers?.Host || '';
        if (security === 'tls' && !fp) fp = 'chrome';

        if (!password || !address || !port) return;
        uniqueStrings.add(`trojan://${password}@${address}:${port}?security=${security}&sni=${sni}&fp=${fp}&type=${type}&path=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}#${encodeURIComponent(name)}`);
    }
}

// --- Singbox ---
export function processSingbox(data, uniqueStrings) {
    const { up_mbps, down_mbps, auth_str, server_name, alpn, server, server_port } = data;
    if (!server || !server_port || !up_mbps || !down_mbps || !auth_str || !server_name || !alpn) return;
    uniqueStrings.add(`hysteria://${server}:${server_port}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${auth_str}&insecure=1&peer=${server_name}&alpn=${alpn}`);
}

// --- Naive ---
export function processNaive(data, uniqueStrings) {
    const proxy_str = data.proxy;
    if (!proxy_str) return;
    uniqueStrings.add(safeBase64Encode(proxy_str));
}

// --- Subscription ---
export function processSubscription(data, uniqueStrings) {
    const lines = data.split('\n').map(line => line.trim()).filter(line => {
        return line && (
            line.startsWith('vless://') ||
            line.startsWith('vmess://') ||
            line.startsWith('trojan://') ||
            line.startsWith('hysteria://') ||
            line.startsWith('hysteria2://') ||
            line.startsWith('ss://') ||
            line.startsWith('tuic://')
        );
    });
    lines.forEach(line => uniqueStrings.add(line));
}

// --- Clash (YAML/JSON) ---
export function processClash(data, uniqueStrings) {
    if (!data || !Array.isArray(data.proxies)) return;

    data.proxies.forEach(proxy => {
        try {
            const { type, server, port, name } = proxy;
            if (!type || !server || !port || !name) return;

            if (type === 'vmess') {
                const vmessObj = {
                    v: "2",
                    ps: name,
                    add: server,
                    port: port,
                    id: proxy.uuid,
                    aid: proxy.alterId || "0",
                    scy: proxy.cipher || "auto",
                    net: proxy.network || 'tcp',
                    type: "none",
                    host: proxy['ws-opts']?.headers?.Host || proxy['ws-opts']?.headers?.host || '',
                    path: proxy['ws-path'] || proxy['ws-opts']?.path || '',
                    tls: proxy.tls ? 'tls' : '',
                    sni: proxy.sni || proxy['server-name'] || '',
                    alpn: proxy.alpn ? proxy.alpn.join(',') : '',
                    fp: proxy.fingerprint || (proxy.tls ? 'chrome' : '')
                };
                if (!vmessObj.id) return;
                uniqueStrings.add(`vmess://${safeBase64Encode(JSON.stringify(vmessObj))}`);
                return;
            }

            if (type === 'vless') {
                const uuid = proxy.uuid;
                const security = proxy.tls ? 'tls' : '';
                const sni = proxy.sni || proxy['server-name'] || '';
                const fp = proxy.fingerprint || (security === 'tls' ? 'chrome' : '');
                const network = proxy.network || 'tcp';
                const path = proxy['ws-path'] || proxy['ws-opts']?.path || '';
                const host = proxy['ws-opts']?.headers?.Host || proxy['ws-opts']?.headers?.host || '';
                if (!uuid) return;
                uniqueStrings.add(`vless://${uuid}@${server}:${port}?encryption=none&security=${security}&sni=${sni}&fp=${fp}&type=${network}&path=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}#${encodeURIComponent(name)}`);
                return;
            }

            if (type === 'trojan') {
                const password = proxy.password;
                const security = proxy.tls ? 'tls' : '';
                const sni = proxy.sni || proxy['server-name'] || '';
                const fp = proxy.fingerprint || (security === 'tls' ? 'chrome' : '');
                const network = proxy.network || 'tcp';
                const path = proxy['ws-path'] || proxy['ws-opts']?.path || '';
                const host = proxy['ws-opts']?.headers?.Host || proxy['ws-opts']?.headers?.host || '';
                if (!password) return;
                uniqueStrings.add(`trojan://${password}@${server}:${port}?security=${security}&sni=${sni}&fp=${fp}&type=${network}&path=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}#${encodeURIComponent(name)}`);
                return;
            }

            if (type === 'hysteria2') {
                const auth = proxy.password || proxy.auth || '';
                const insecure = proxy.insecure || proxy['skip-cert-verify'] ? 1 : 0;
                const sni = proxy.sni || proxy['server-name'] || '';
                if (!auth) return;
                uniqueStrings.add(`hysteria2://${auth}@${server}:${port}?insecure=${insecure}&sni=${sni}#${encodeURIComponent(name)}`);
                return;
            }

            if (type === 'ss') {
                const { password, cipher } = proxy;
                if (!password || !cipher) return;
                const credentials = safeBase64Encode(`${cipher}:${password}`);
                uniqueStrings.add(`ss://${credentials}@${server}:${port}#${encodeURIComponent(name)}`);
            }
        } catch (e) {}
    });
}
