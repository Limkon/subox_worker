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
 * @param {boolean} allowBase64 是否允许尝试解 Base64 (防止死循环)
 */
function internalDetect(rawData, uniqueStrings, allowBase64 = true) {
    if (!rawData || typeof rawData !== 'string') return;

    // 1. 清洗开头的 UTF-8 BOM 字符 (\uFEFF)
    let textData = rawData.trim();
    if (textData.charCodeAt(0) === 0xFEFF) {
        textData = textData.slice(1).trim();
    }

    // 2. 优先尝试直接 JSON 解析 (Xray, Singbox, Hysteria, Clash-JSON 等)
    try {
        const jsonData = JSON.parse(textData);
        if (jsonData && typeof jsonData === 'object') {
            if (jsonData.outbounds && Array.isArray(jsonData.outbounds)) {
                processXray(jsonData, uniqueStrings);
                return;
            } else if (jsonData.server && jsonData.auth && jsonData.tls) {
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
        // 非直接 JSON 格式，向下继续流转探测
    }

    // 3. 检测是否为 Clash YAML 格式
    if (textData.includes('proxies:') || textData.includes('proxy-groups:')) {
        try {
            const yamlParser = jsyaml || globalThis.jsyaml;
            if (yamlParser && typeof yamlParser.load === 'function') {
                const yamlData = yamlParser.load(textData);
                if (yamlData && Array.isArray(yamlData.proxies)) {
                    processClash(yamlData, uniqueStrings);
                    return;
                }
            }
        } catch (yamlErr) {}
    }

    // 4. 尝试 Base64 解密并递归侦测 (支持外层套 Base64 的 JSON / YAML / 节点行)
    if (allowBase64) {
        try {
            const decoded = safeBase64Decode(textData);
            if (decoded && decoded !== textData) {
                // 如果解密后包含了明显特征，将其作为新载荷再次全面侦测 (禁用多层以防死循环)
                if (
                    decoded.includes('outbounds') || 
                    decoded.includes('proxies') || 
                    decoded.includes('://') || 
                    decoded.includes('\n')
                ) {
                    internalDetect(decoded, uniqueStrings, false);
                    return;
                }
            }
        } catch (err) {}
    }

    // 5. 兜底：作为普通纯文本订阅行按行提取 (vmess://, vless://, ss://, hy2:// 等)
    processSubscription(textData, uniqueStrings);
}

/**
 * 外部统一调用入口
 */
export function detectAndProcess(textData, uniqueStrings) {
    internalDetect(textData, uniqueStrings, true);
}
