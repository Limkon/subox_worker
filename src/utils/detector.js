// =================================================================
// === 数据侦测与分发模块：src/utils/detector.js ===
// =================================================================

import { load as loadYaml } from 'js-yaml';
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
import { LIMITS } from '../config.js';

const PROTOCOL_PREFIXES = [
    'vless://', 'vmess://', 'trojan://', 'hysteria://', 'hysteria2://', 'hy2://',
    'ss://', 'ssr://', 'tuic://', 'naive+', 'socks5://', 'http://', 'https://'
];

function looksLikePlainLinks(text) {
    const lower = text.toLowerCase();
    return PROTOCOL_PREFIXES.some(p => lower.startsWith(p));
}

/** 处理 JSON 对象：按 Xray / Hysteria / Singbox / Naive / Clash 特征分发 */
function dispatchObject(obj, uniqueStrings) {
    if (!obj || typeof obj !== 'object') return false;
    if (Array.isArray(obj.outbounds)) { processXray(obj, uniqueStrings); return true; }
    if (obj.server && (obj.auth || obj.password) && obj.tls) { processHysteria2(obj, uniqueStrings); return true; }
    if (obj.server_port && obj.up_mbps) { processSingbox(obj, uniqueStrings); return true; }
    if (obj.up_mbps && obj.auth_str) { processHysteria(obj, uniqueStrings); return true; }
    if (obj.proxy) { processNaive(obj, uniqueStrings); return true; }
    if (Array.isArray(obj.proxies)) { processClash(obj, uniqueStrings); return true; }
    return false;
}

/**
 * 递归解析核心处理器。
 * @param {string} rawData 待解析文本
 * @param {Set} uniqueStrings 节点去重集合
 * @param {number} depth 当前 Base64 递归层数（最多 LIMITS.MAX_BASE64_DEPTH）
 */
function internalDetect(rawData, uniqueStrings, depth = 0) {
    if (!rawData || typeof rawData !== 'string') return;
    if (rawData.length > LIMITS.MAX_SUB_TEXT_BYTES) rawData = rawData.slice(0, LIMITS.MAX_SUB_TEXT_BYTES);
    if (uniqueStrings.size >= LIMITS.MAX_NODES) return;

    let textData = rawData.trim();
    if (textData.charCodeAt(0) === 0xFEFF) textData = textData.slice(1).trim();
    if (!textData) return;

    const firstChar = textData.charAt(0);

    // 1. 明文协议快速通道
    if (looksLikePlainLinks(textData)) {
        processSubscription(textData, uniqueStrings);
        return;
    }

    // 2. JSON（对象或数组）
    if (firstChar === '{' || firstChar === '[') {
        try {
            const jsonData = JSON.parse(textData);
            if (Array.isArray(jsonData)) {
                for (const item of jsonData) {
                    if (uniqueStrings.size >= LIMITS.MAX_NODES) break;
                    if (typeof item === 'string') {
                        processSubscription(item, uniqueStrings);
                    } else if (item && typeof item === 'object') {
                        if (!dispatchObject(item, uniqueStrings)) {
                            // 数组里可能直接是单条 Clash proxy 定义
                            processClash({ proxies: [item] }, uniqueStrings);
                        }
                    }
                }
                return;
            }
            if (jsonData && typeof jsonData === 'object' && dispatchObject(jsonData, uniqueStrings)) return;
        } catch (e) { /* 非合法 JSON，顺延探测 */ }
    }

    // 3. Clash YAML（js-yaml 4.x 的 load 默认使用安全的 DEFAULT_SCHEMA）
    if (textData.includes('proxies:') || textData.includes('proxy-groups:')) {
        try {
            const yamlData = loadYaml(textData);
            if (yamlData && typeof yamlData === 'object') {
                if (dispatchObject(yamlData, uniqueStrings)) return;
                if (yamlData.outbounds) { processXray(yamlData, uniqueStrings); return; }
            }
        } catch (e) { /* 非法 YAML，顺延探测 */ }
    }

    // 4. 外层 Base64 嵌套（有限层数），支持多层包裹
    if (depth < LIMITS.MAX_BASE64_DEPTH) {
        const decoded = safeBase64Decode(textData);
        if (decoded && decoded !== textData) {
            const trimmed = decoded.trim();
            const hasMarkers = trimmed.includes('://') || trimmed.includes('outbounds') ||
                trimmed.includes('proxies') || trimmed.startsWith('{') || trimmed.startsWith('[');
            // 纯 base64 字母表 = 还有一层包裹；节点链接含 ':' '/'，不会被误判
            const isBase64Layer = trimmed.length > 8 &&
                trimmed.length <= LIMITS.MAX_SUB_TEXT_BYTES &&
                /^[A-Za-z0-9+/_\-=\s]+$/.test(trimmed);
            if (hasMarkers || isBase64Layer) {
                internalDetect(trimmed, uniqueStrings, depth + 1);
                return;
            }
        }
    }

    // 5. 兜底：纯文本按行提取
    processSubscription(textData, uniqueStrings);
}

/** 外部统一入口 */
export function detectAndProcess(textData, uniqueStrings) {
    internalDetect(textData, uniqueStrings, 0);
}
