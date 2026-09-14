// =================================================================
// === 数据侦测与分发模块：src/utils/detector.js ===
// =================================================================

import { 
    processXray, 
    processHysteria2, 
    processSingbox, 
    processHysteria, 
    processNaive, 
    processClash, 
    processSubscription 
} from '../protocols/index.js';
import { safeBase64Decode } from './helpers.js';
import jsyaml from './js-yaml.min.js';

export function detectAndProcess(textData, uniqueStrings) {
    try {
        const jsonData = JSON.parse(textData);
        if (jsonData.outbounds && Array.isArray(jsonData.outbounds)) {
            processXray(jsonData, uniqueStrings);
        } else if (jsonData.server && jsonData.auth && jsonData.tls) {
            processHysteria2(jsonData, uniqueStrings);
        } else if (jsonData.server_port && jsonData.up_mbps) {
            processSingbox(jsonData, uniqueStrings);
        } else if (jsonData.up_mbps && jsonData.auth_str) {
            processHysteria(jsonData, uniqueStrings);
        } else if (jsonData.proxy) {
            processNaive(jsonData, uniqueStrings);
        } else if (jsonData.proxies && Array.isArray(jsonData.proxies)) {
            processClash(jsonData, uniqueStrings);
        }
    } catch (e) {
        let processedText = textData.trim();
        let isYaml = false;

        // 尝试安全 Base64 解码
        try {
            const decoded = safeBase64Decode(processedText);
            if (decoded.includes("://") || decoded.includes("\n") || decoded.includes("proxies:")) {
                processedText = decoded;
            }
        } catch (err) {}

        // 检测 YAML 格式
        if (processedText.includes('proxies:') || processedText.includes('proxy-groups:')) {
            try {
                const yamlParser = jsyaml || globalThis.jsyaml;
                if (yamlParser && typeof yamlParser.load === 'function') {
                    const yamlData = yamlParser.load(processedText);
                    if (yamlData && yamlData.proxies) {
                        processClash(yamlData, uniqueStrings);
                        isYaml = true;
                    }
                }
            } catch (yamlErr) {}
        }

        if (!isYaml) {
            processSubscription(processedText, uniqueStrings);
        }
    }
}
