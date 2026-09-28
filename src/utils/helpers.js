// =================================================================
// === 工具函数库：src/utils/helpers.js ===
// =================================================================

import { CHUNK_SIZE } from '../config.js';

/**
 * UTF-8 安全的高性能 Base64 编码 (分块防止堆栈溢出与 OOM)
 */
export function safeBase64Encode(str) {
    const bytes = new TextEncoder().encode(str);
    const chunkSize = CHUNK_SIZE || 8192;
    let binString = '';
    
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binString += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    
    return btoa(binString);
}

/**
 * UTF-8 安全的 Base64 解码 (完美清洗换行/空格，精准补齐 Padding，杜绝解析崩溃)
 */
export function safeBase64Decode(base64Str) {
    if (!base64Str || typeof base64Str !== 'string') return '';
    
    // 1. 清除所有空白字符 (\r, \n, \t, 空格) 并处理 URL 安全字符
    let clean = base64Str.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    
    // 2. 准确计算并补齐 Base64 Padding (=)
    const remainder = clean.length % 4;
    if (remainder === 2) {
        clean += '==';
    } else if (remainder === 3) {
        clean += '=';
    } else if (remainder === 1) {
        // 非法长度容错截断
        clean = clean.substring(0, clean.length - 1);
    }
    
    // 3. 安全解码二进制
    const binString = atob(clean);
    const bytes = Uint8Array.from(binString, (m) => m.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
}

/**
 * 带有超时和单次重试的快速 fetch
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
            await new Promise(r => setTimeout(r, 500));
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

/**
 * SHA-1 哈希算法
 */
export async function sha1(str) {
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 通配符转换为正则表达式
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
 * 多层嵌套 URLDecode 安全解码
 */
export function fullDecode(str) {
    let last = str, current = str, i = 0;
    while (i < 5) {
        try {
            current = decodeURIComponent(last);
            if (current === last) return current;
            last = current;
        } catch (e) { return last; }
        i++;
    }
    return current;
}

/**
 * 黑名单过滤检查
 */
export function isBlacklisted(nodeString, blacklistRegexes) {
    if (!blacklistRegexes || blacklistRegexes.length === 0) return false;
    const testString = fullDecode(nodeString);

    // 1. 直接匹配节点链接（含 Hash 中的节点名称）
    for (const regex of blacklistRegexes) {
        if (regex.test(testString)) return true;
    }

    // 2. 深度穿透匹配 vmess 的 ps 别名字段
    if (testString.startsWith('vmess://')) {
        try {
            const jsonString = safeBase64Decode(testString.substring(8));
            const vmessConfig = JSON.parse(jsonString);
            if (vmessConfig && vmessConfig.ps) {
                const nodeName = fullDecode(String(vmessConfig.ps));
                for (const regex of blacklistRegexes) {
                    if (regex.test(nodeName)) return true;
                }
            }
        } catch (e) {}
    }
    return false;
}
