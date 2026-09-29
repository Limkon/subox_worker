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

/**
 * 递归解析核心处理器
 * @param {string} rawData 待解析文本
 * @param {Set} uniqueStrings 节点输出去重集合
 * @param {boolean} allowBase64 是否允许尝试解 Base64 (防止多层循环)
 */
function internalDetect(rawData, uniqueStrings, allowBase64 = true) {
    if (!rawData || typeof rawData !== 'string') return;

    // 1. 清洗开头的 UTF-8 BOM 字符 (\uFEFF) 及首尾空字符
    let textData = rawData.trim();
    if (textData.charCodeAt(0) === 0xFEFF) {
        textData = textData.slice(1).trim();
    }
    if (!textData) return;

    const firstChar = textData.charAt(0);

    // 2. 快速判断：若是明文协议开头，走快速通道提取，跳过重型解析器
    if (
        textData.startsWith('vless://') ||
        textData.startsWith('vmess://') ||
        textData.startsWith('trojan://') ||
        textData.startsWith('hysteria://') ||
        textData.startsWith('hysteria2://') ||
        textData.startsWith('hy2://') ||
        textData.startsWith('ss://') ||
        textData.startsWith('ssr://') ||
        textData.startsWith('tuic://') ||
        textData.startsWith('naive+')
    ) {
        processSubscription(textData, uniqueStrings);
        return;
    }

    // 3. 高性能过滤：仅当首字符为 '{' 或 '[' 时才尝试 JSON 解析，避免抛出无效 SyntaxError 浪费 CPU
    if (firstChar === '{' || firstChar === '[') {
        try {
            const jsonData = JSON.parse(textData);
            if (jsonData && typeof jsonData === 'object') {
                if (jsonData.outbounds && Array.isArray(jsonData.outbounds)) {
                    processXray(jsonData, uniqueStrings);
                    return;
                } else if (jsonData.server && (jsonData.auth || jsonData.password) && jsonData.tls) {
                    processHysteria2(jsonData, uniqueStrings);
                    return;
                } else if (jsonData.server_port && jsonData.up_mbps) {
                    processSingbox(jsonData, uniqueStrings);
                    return;
                } else if (jsonData.up_mbps && jsonData.auth_str) {
                    processHysteria(jsonData, uniqueStrings);
                    return;
                } else if (jsonData.proxy) {
                    processNaive(jsonData, uniqueStrings);
                    return;
                } else if (jsonData.proxies && Array.isArray(jsonData.proxies)) {
                    processClash(jsonData, uniqueStrings);
                    return;
                }
            }
        } catch (e) {
            // 非合法 JSON，顺延探测
        }
    }

    // 4. 检测是否为 Clash YAML 格式 (特征匹配)
    if (textData.includes('proxies:') || textData.includes('proxy-groups:')) {
        try {
            const yamlParser = jsyaml || globalThis.jsyaml;
            const loadFn = yamlParser?.load || yamlParser?.default?.load;
            if (typeof loadFn === 'function') {
                const yamlData = loadFn(textData);
                if (yamlData && Array.isArray(yamlData.proxies)) {
                    processClash(yamlData, uniqueStrings);
                    return;
                }
            }
        } catch (yamlErr) {}
    }

    // 5. 尝试 Base64 解密并递归侦测 (外层 Base64 嵌套场景)
    if (allowBase64) {
        try {
            const decoded = safeBase64Decode(textData);
            if (decoded && decoded !== textData) {
                const trimmedDecoded = decoded.trim();
                // 严密特征校验：避免二进制垃圾字符中含有 \n 触发无效递归
                if (
                    trimmedDecoded.includes('://') || 
                    trimmedDecoded.includes('outbounds') || 
                    trimmedDecoded.includes('proxies') ||
                    trimmedDecoded.startsWith('{') ||
                    trimmedDecoded.startsWith('[')
                ) {
                    internalDetect(trimmedDecoded, uniqueStrings, false);
                    return;
                }
            }
        } catch (err) {}
    }

    // 6. 兜底策略：作为普通纯文本按行提取
    processSubscription(textData, uniqueStrings);
}

/**
 * 外部统一调用入口
 * @param {string} textData 待侦测订阅文本
 * @param {Set} uniqueStrings 输出节点去重集合
 */
export function detectAndProcess(textData, uniqueStrings) {
    internalDetect(textData, uniqueStrings, true);
}
