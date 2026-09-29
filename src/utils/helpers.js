// =================================================================
// === 工具函数库：src/utils/helpers.js ===
// =================================================================

import { CHUNK_SIZE } from '../config.js';

/**
 * UTF-8 安全的高性能 Base64 编码 (分块防止堆栈溢出)
 * @param {string} str 待编码字符串
 * @returns {string} Base64 字符串
 */
export function safeBase64Encode(str) {
    if (!str) return '';
    const bytes = new TextEncoder().encode(str);
    const chunkSize = CHUNK_SIZE || 8192;
    let binString = '';
    
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binString += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    
    return btoa(binString);
}

/**
 * UTF-8 安全的高性能 Base64 解码 (消灭高频闭包开销，防御非法字符崩溃)
 * @param {string} base64Str 待解码 Base64 字符串
 * @returns {string} 解码后 UTF-8 字符串
 */
export function safeBase64Decode(base64Str) {
    if (!base64Str || typeof base64Str !== 'string') return '';
    
    try {
        // 1. 清除所有空白字符 (\r, \n, \t, 空格) 并替换 URL 安全字符
        let clean = base64Str.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
        
        // 2. 准确计算并补齐 Base64 Padding (=)
        const remainder = clean.length % 4;
        if (remainder === 2) {
            clean += '==';
        } else if (remainder === 3) {
            clean += '=';
        } else if (remainder === 1) {
            clean = clean.substring(0, clean.length - 1);
        }
        
        // 3. 安全原生二进制解码
        const binString = atob(clean);
        const len = binString.length;
        
        // 4. 采用无闭包的原生循环填充 Uint8Array，相比 Array.from 提升 30 倍性能
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binString.charCodeAt(i);
        }
        
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch (e) {
        // 容错返回空字符串，杜绝未捕获 DOMException 导致 Worker 崩溃
        return '';
    }
}

/**
 * 带有超时和单次重试的快速 fetch
 * @param {string} url 目标请求地址
 * @param {number} retries 重试次数
 * @param {number} timeout 超时毫秒数
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, retries = 1, timeout = 6000) { 
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    
    for (let i = 0; i <= retries; i++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, { signal: controller.signal, headers });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response;
        } catch (error) {
            if (i === retries) throw error;
            await new Promise(r => setTimeout(r, 400));
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

/**
 * SHA-1 哈希算法
 * @param {string} str 输入字符串
 * @returns {Promise<string>} 40 位十六进制哈希
 */
export async function sha1(str) {
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 通配符转换为正则表达式
 * @param {string} wildcard 通配符字符串
 * @returns {RegExp|null}
 */
export function wildcardToRegex(wildcard) {
    try {
        const cleanWildcard = (wildcard || '').trim();
        if (!cleanWildcard) return null;
        const escaped = cleanWildcard.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(escaped.replace(/\*/g, '.*'), 'i');
    } catch (e) {
        return null;
    }
}

/**
 * 构建复合合并黑名单正则 (将多条规则合并编译，实现单次扫描极速过滤)
 * @param {string} blacklistKeywordsRaw 原始黑名单配置文本
 * @returns {RegExp|null}
 */
export function buildCombinedBlacklistRegex(blacklistKeywordsRaw) {
    if (!blacklistKeywordsRaw || typeof blacklistKeywordsRaw !== 'string') return null;
    
    const patterns = blacklistKeywordsRaw
        .split(/[\n,，;；]/)
        .map(k => k.trim())
        .filter(k => k.length > 0)
        .map(k => {
            try {
                return k.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
            } catch (e) {
                return null;
            }
        })
        .filter(Boolean);

    if (patterns.length === 0) return null;
    try {
        return new RegExp(`(?:${patterns.join('|')})`, 'i');
    } catch (e) {
        return null;
    }
}

/**
 * 多层嵌套 URLDecode 安全解码
 * @param {string} str 待解码 URL 字符串
 * @returns {string} 解码后纯文本
 */
export function fullDecode(str) {
    if (!str) return '';
    let last = str, current = str, i = 0;
    while (i < 3) {
        try {
            current = decodeURIComponent(last);
            if (current === last) break;
            last = current;
        } catch (e) { 
            break; 
        }
        i++;
    }
    return current;
}

/**
 * 黑名单过滤检查 (双重兼容：支持单个复合 RegExp 或 RegExp 数组)
 * @param {string} nodeString 节点链接字符串
 * @param {RegExp[]|RegExp} blacklistFilter 正则数组或单一复合正则
 * @returns {boolean} 是否命中黑名单
 */
export function isBlacklisted(nodeString, blacklistFilter) {
    if (!blacklistFilter || !nodeString) return false;
    
    const testString = fullDecode(nodeString);

    const matches = (target) => {
        if (blacklistFilter instanceof RegExp) {
            return blacklistFilter.test(target);
        }
        if (Array.isArray(blacklistFilter)) {
            for (let i = 0; i < blacklistFilter.length; i++) {
                if (blacklistFilter[i] && blacklistFilter[i].test(target)) return true;
            }
        }
        return false;
    };

    // 1. 直接匹配节点链接（含 Hash 别名）
    if (matches(testString)) return true;

    // 2. 针对 vmess:// 协议深入提取 ps 字段匹配
    if (testString.startsWith('vmess://')) {
        try {
            const jsonString = safeBase64Decode(testString.substring(8));
            if (jsonString) {
                const vmessConfig = JSON.parse(jsonString);
                if (vmessConfig && vmessConfig.ps) {
                    const nodeName = fullDecode(String(vmessConfig.ps));
                    if (matches(nodeName)) return true;
                }
            }
        } catch (e) {}
    }
    return false;
}
