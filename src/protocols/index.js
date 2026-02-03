// =================================================================
// === 协议解析模块：src/protocols/index.js ===
// =================================================================

// --- Hysteria ---
export function processHysteria(data, uniqueStrings) {
    const { up_mbps, down_mbps, auth_str, server_name, alpn, server } = data;
    if (!server || !up_mbps || !down_mbps || !auth_str || !server_name || !alpn) {
        console.log(`Missing fields in hysteria data: ${JSON.stringify(data)}`);
        return;
    }
    const formattedString = `hysteria://${server}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${auth_str}&insecure=1&peer=${server_name}&alpn=${alpn}`;
    uniqueStrings.add(formattedString);
}

// --- Hysteria2 ---
export function processHysteria2(data, uniqueStrings) {
    const auth = data.auth || '';
    const server = data.server || '';
    const insecure = data.tls && data.tls.insecure ? 1 : 0;
    const sni = data.tls ? data.tls.sni || '' : '';
    if (!server) {
        console.log(`Missing server in hysteria2 data: ${JSON.stringify(data)}`);
        return;
    }
    const formattedString = `hysteria2://${auth}@${server}?insecure=${insecure}&sni=${sni}`;
    uniqueStrings.add(formattedString);
}

// --- Xray ---
export function processXray(data, uniqueStrings) {
    const outbound = data.outbounds?.[0];
    if (!outbound) {
        console.log(`No outbounds in xray data: ${JSON.stringify(data)}`);
        return;
    }
    const name = outbound.tag || '';
    if (!name) return;

    const protocol = outbound.protocol;
    const settings = outbound.settings || {};
    const streamSettings = outbound.streamSettings || {};
    let formattedString = ''; 

    if (protocol === 'vless' || protocol === 'vmess') {
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
        
        formattedString = `${protocol}://${id}@${address}:${port}?encryption=${encryption}&security=${security}&sni=${sni}&fp=${fp}&type=${type}&path=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}`;

    } else if (protocol === 'trojan') {
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

        formattedString = `trojan://${password}@${address}:${port}?security=${security}&sni=${sni}&fp=${fp}&type=${type}&path=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}`;
    }

    if (formattedString) {
        formattedString += `#${encodeURIComponent(name)}`;
        uniqueStrings.add(formattedString);
    }
}

// --- Singbox ---
export function processSingbox(data, uniqueStrings) {
    const { up_mbps, down_mbps, auth_str, server_name, alpn, server, server_port } = data;
    if (!server || !server_port || !up_mbps || !down_mbps || !auth_str || !server_name || !alpn) return;
    const formattedString = `hysteria://${server}:${server_port}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${auth_str}&insecure=1&peer=${server_name}&alpn=${alpn}`;
    uniqueStrings.add(formattedString);
}

// --- Naive ---
export function processNaive(data, uniqueStrings) {
    const proxy_str = data.proxy;
    if (!proxy_str) return;
    const naiveproxy = btoa(unescape(encodeURIComponent(proxy_str)));
    uniqueStrings.add(naiveproxy);
}

// --- Subscription (标准订阅) ---
export function processSubscription(data, uniqueStrings) {
    const lines = data.split('\n').map(line => line.trim()).filter(line => {
        return line && (
            line.startsWith('vless://') ||
            line.startsWith('vmess://') ||
            line.startsWith('trojan://') ||
            line.startsWith('hysteria://') ||
            line.startsWith('hysteria2://') ||
            line.startsWith('ss://') ||
            line.startsWith('mandala://')
        );
    });
    lines.forEach(line => uniqueStrings.add(line));
}

// --- Clash (YAML/JSON) ---
export function processClash(data, uniqueStrings) {
    if (!data || !Array.isArray(data.proxies)) return;

    data.proxies.forEach(proxy => {
        try {
            let formattedString = '';
            const { type, server, port, name } = proxy;
            if (!type || !server || !port || !name) return;

            if (type === 'vless' || type === 'vmess') {
                const uuid = proxy.uuid;
                const security = proxy.tls ? 'tls' : '';
                const sni = proxy.sni || proxy['server-name'] || '';
                const fp = proxy.fingerprint || (security === 'tls' ? 'chrome' : '');
                const network = proxy.network || 'tcp';
                const path = proxy['ws-path'] || (proxy['ws-opts'] ? proxy['ws-opts'].path : '');
                const host = (proxy['ws-opts'] && proxy['ws-opts'].headers) ? proxy['ws-opts'].headers.Host : '';
                const encryption = (type === 'vless') ? 'none' : (proxy.cipher || 'auto'); 
                if (!uuid) return;
                formattedString = `${type}://${uuid}@${server}:${port}?encryption=${encryption}&security=${security}&sni=${sni}&fp=${fp}&type=${network}&path=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}`;
            
            } else if (type === 'trojan') {
                const password = proxy.password;
                const security = proxy.tls ? 'tls' : '';
                const sni = proxy.sni || proxy['server-name'] || '';
                const fp = proxy.fingerprint || (security === 'tls' ? 'chrome' : '');
                const network = proxy.network || 'tcp';
                const path = proxy['ws-path'] || (proxy['ws-opts'] ? proxy['ws-opts'].path : '');
                const host = (proxy['ws-opts'] && proxy['ws-opts'].headers) ? proxy['ws-opts'].headers.Host : '';
                if (!password) return;
                formattedString = `trojan://${password}@${server}:${port}?security=${security}&sni=${sni}&fp=${fp}&type=${network}&path=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}`;
            
            } else if (type === 'hysteria') {
                const auth = proxy.auth_str || proxy.auth || '';
                const up_mbps = proxy.up || proxy.up_mbps || 10;
                const down_mbps = proxy.down || proxy.down_mbps || 50;
                const server_name = proxy.sni || proxy['server-name'] || '';
                const alpn = proxy.alpn ? proxy.alpn.join(',') : '';
                const insecure = proxy.insecure || proxy['skip-cert-verify'] ? 1 : 0;
                if (!auth || !server_name || !alpn) return;
                formattedString = `hysteria://${server}:${port}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${auth}&insecure=${insecure}&peer=${server_name}&alpn=${alpn}`;
            
            } else if (type === 'hysteria2') {
                const auth = proxy.password || proxy.auth || '';
                const insecure = proxy.insecure || proxy['skip-cert-verify'] ? 1 : 0;
                const sni = proxy.sni || proxy['server-name'] || '';
                if (!auth) return;
                formattedString = `hysteria2://${auth}@${server}:${port}?insecure=${insecure}&sni=${sni}`;

            } else if (type === 'ss') {
                const plugin = proxy.plugin;
                const pluginOpts = proxy['plugin-opts'] || {};
                if (plugin !== 'v2ray-plugin' || pluginOpts.mode !== 'websocket') return; 

                const { password, cipher } = proxy;
                if (!password || !cipher) return;

                const host = pluginOpts.host || '';
                const path = pluginOpts.path || '';
                const tls = pluginOpts.tls === true;
                const sni = pluginOpts.sni || host;
                const insecure = pluginOpts['skip-cert-verify'] === true;

                const credentials = btoa(unescape(encodeURIComponent(`${cipher}:${password}`)));
                let pluginStr = 'v2ray-plugin;mode=websocket';
                if (tls) {
                    pluginStr += ';tls';
                    if (sni) pluginStr += ';sni=' + sni;
                    if (insecure) pluginStr += ';skip-cert-verify'; 
                }
                if (host) pluginStr += ';host=' + host;
                if (path) pluginStr += ';path=' + path;
                const pluginParam = encodeURIComponent(pluginStr);
                formattedString = `ss://${credentials}@${server}:${port}?plugin=${pluginParam}`;
            }

            if (formattedString) {
                formattedString += `#${encodeURIComponent(name)}`;
                uniqueStrings.add(formattedString);
            }
        } catch (e) {
            console.log(`Error processing clash proxy item: ${e.message}`);
        }
    });
}
