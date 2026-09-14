// =================================================================
// === 工具函数库：src/utils/helpers.js ===
// =================================================================

/**
 * UTF-8 安全的 Base64 编码
 */
export function safeBase64Encode(str) {
    const bytes = new TextEncoder().encode(str);
    const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
    return btoa(binString);
}

/**
 * UTF-8 安全的 Base64 解码 (防止中文字符乱码)
 */
export function safeBase64Decode(base64Str) {
    let clean = base64Str.replace(/-/g, '+').replace(/_/g, '/');
    const padding = clean.length % 4;
    if (padding !== 0) clean += '='.repeat(4 - padding);
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

export async function sha1(str) {
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function wildcardToRegex(wildcard) {
    try {
        const escaped = wildcard.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(escaped.replace(/\*/g, '.*'), 'i');
    } catch (e) {
        return null;
    }
}

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

    for (const regex of blacklistRegexes) {
        if (regex.test(testString)) return true;
    }

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
