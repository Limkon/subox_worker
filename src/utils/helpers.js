// =================================================================
// === 工具函数库：src/utils/helpers.js ===
// =================================================================

/**
 * 带有重试机制的 fetch 函数
 */
export async function fetchWithRetry(url, retries = 3, timeout = 10000) { 
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
    };
    
    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            const response = await fetch(url, { 
                signal: controller.signal,
                headers: headers 
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            return response;
        } catch (error) {
            if (i === retries - 1) {
                console.log(`Failed to fetch ${url} after ${retries} attempts: ${error.message}`);
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); // 等待 1 秒后重试
        }
    }
}

/**
 * SHA-1 哈希辅助函数
 */
export async function sha1(str) {
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hexHash;
}

/**
 * 将简单通配符转换为正则表达式
 */
export function wildcardToRegex(wildcard) {
    try {
        const escaped = wildcard.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
        const regexString = escaped.replace(/\*/g, '.*'); 
        return new RegExp(regexString, 'i');
    } catch (e) {
        console.log(`Invalid wildcard pattern "${wildcard}" caused regex error: ${e.message}`);
        return null;
    }
}

/**
 * 循环解码 URL 字符串，直到其不再变化（处理多重编码）
 */
export function fullDecode(str) {
    let lastDecoded = str;
    let currentDecoded = str;
    let i = 0; 
    while (i < 10) { 
        try {
            currentDecoded = decodeURIComponent(lastDecoded);
            if (currentDecoded === lastDecoded) return currentDecoded;
            lastDecoded = currentDecoded;
        } catch (e) {
            return lastDecoded;
        }
        i++;
    }
    return currentDecoded;
}

/**
 * 检查节点是否应被黑名单过滤
 */
export function isBlacklisted(nodeString, blacklistRegexes) {
    if (!blacklistRegexes || blacklistRegexes.length === 0) return false;

    // 1. 对整个字符串进行“循环 URL 解码”
    const testString = fullDecode(nodeString);

    // 2. 第一次测试：测试解码后的完整字符串
    for (const regex of blacklistRegexes) {
        if (regex.test(testString)) return true;
    }

    // 3. [vmess 专项] 处理 JSON 内部字段
    if (testString.startsWith('vmess://')) {
        try {
            const base64Blob = testString.substring(8);
            const jsonString = atob(base64Blob);
            const vmessConfig = JSON.parse(jsonString);
            
            if (vmessConfig && vmessConfig.ps) {
                const nodeName = fullDecode(String(vmessConfig.ps));
                for (const regex of blacklistRegexes) {
                    if (regex.test(nodeName)) return true;
                }
            }
        } catch (e) {
            // 解析失败则跳过
        }
    }
    return false;
}
