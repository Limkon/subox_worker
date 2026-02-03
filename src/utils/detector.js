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

/**
 * 自动检测并处理数据类型
 * @param {string} textData 原始文本数据
 * @param {Set} uniqueStrings 用于存储去重后的节点字符串
 */
export function detectAndProcess(textData, uniqueStrings) {
    try {
        // 尝试解析为 JSON
        const jsonData = JSON.parse(textData);
        
        if (jsonData.outbounds && Array.isArray(jsonData.outbounds)) {
            processXray(jsonData, uniqueStrings); // Xray (sing-box outbound)
        } else if (jsonData.server && jsonData.auth && jsonData.tls) {
            processHysteria2(jsonData, uniqueStrings); // Hysteria2 (config.json)
        } else if (jsonData.server_port && jsonData.up_mbps) {
            processSingbox(jsonData, uniqueStrings); // Singbox (Hysteria 1)
        } else if (jsonData.up_mbps && jsonData.auth_str) {
            processHysteria(jsonData, uniqueStrings); // Hysteria (config.json)
        } else if (jsonData.proxy) {
            processNaive(jsonData, uniqueStrings); // Naive (config.json)
        } else if (jsonData.proxies && Array.isArray(jsonData.proxies)) {
            processClash(jsonData, uniqueStrings); // Clash JSON
        } else {
            console.log("Unknown JSON format. Skipping.");
        }
    } catch (e) {
        // 非 JSON 格式，尝试处理 Base64 或 YAML
        let processedText = textData.trim();
        let isYaml = false;
        
        // 尝试 Base64 解码
        try {
            const decodedData = atob(processedText);
            // 简单启发式判断：如果解码后包含协议头或关键字段，则使用解码后的内容
            if (decodedData.includes("://") || decodedData.includes("\n") || decodedData.includes("proxies:")) {
                 processedText = decodedData;
            }
        } catch (base64Error) {
            // 解码失败说明是纯文本或 YAML，继续处理
        }
        
        // 检查全局作用域下的 jsyaml 是否存在（兼容原代码库粘贴模式）
        // 如果使用了构建工具，建议在此处 import jsyaml from 'js-yaml'
        if (typeof jsyaml !== 'undefined' && (processedText.includes('proxies:') || processedText.includes('proxy-groups:'))) {
            try {
                const yamlData = jsyaml.load(processedText);
                if (yamlData && yamlData.proxies) {
                    processClash(yamlData, uniqueStrings);
                    isYaml = true;
                }
            } catch (yamlError) {
                console.log("YAML parsing failed, falling back to subscription.");
            }
        }
        
        // 如果不是 YAML，则作为标准订阅（Base64 或 纯文本链接列表）处理
        if (!isYaml) {
            processSubscription(processedText, uniqueStrings);
        }
    }
}
