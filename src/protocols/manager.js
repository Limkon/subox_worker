export function processHysteria(data, uniqueStrings) {
    const { up_mbps, down_mbps, auth_str, server_name, alpn, server } = data;
    if (!server || !up_mbps || !down_mbps || !auth_str || !server_name || !alpn) return;
    uniqueStrings.add(`hysteria://${server}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${auth_str}&insecure=1&peer=${server_name}&alpn=${alpn}`);
}

export function processHysteria2(data, uniqueStrings) {
    const auth = data.auth || '';
    const server = data.server || '';
    const insecure = data.tls?.insecure ? 1 : 0;
    const sni = data.tls?.sni || '';
    if (!server) return;
    uniqueStrings.add(`hysteria2://${auth}@${server}?insecure=${insecure}&sni=${sni}`);
}

// ... 同样迁移 processXray, processSingbox, processNaive, processSubscription, processClash ...
