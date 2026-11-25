// =================================================================
// === 工具函数库：src/utils/helpers.js ===
// =================================================================

import { CHUNK_SIZE, LIMITS } from '../config.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

/** UTF-8 安全的 Base64 编码（分块防止堆栈溢出） */
export function safeBase64Encode(str) {
    if (!str) return '';
    const bytes = encoder.encode(String(str));
    const chunkSize = CHUNK_SIZE || 8192;
    let binString = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binString += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binString);
}

/** UTF-8 安全的 Base64 解码（容错，不抛 DOMException） */
export function safeBase64Decode(base64Str) {
    if (!base64Str || typeof base64Str !== 'string') return '';
    try {
        let clean = base64Str.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
        const remainder = clean.length % 4;
        if (remainder === 2) clean += '==';
        else if (remainder === 3) clean += '=';
        else if (remainder === 1) return ''; // 长度 1 的尾块一定非法，直接放弃

        const binString = atob(clean);
        const len = binString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binString.charCodeAt(i);
        return decoder.decode(bytes);
    } catch (e) {
        return '';
    }
}

/** 多层嵌套 URLDecode 安全解码 */
export function fullDecode(str) {
    if (!str) return '';
    let last = String(str), current = last, i = 0;
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

/** 恒定时间字符串比较（不短路，避免时序侧信道） */
export function constantTimeEqual(a, b) {
    const x = String(a ?? '');
    const y = String(b ?? '');
    let diff = x.length ^ y.length;
    const n = Math.max(x.length, y.length);
    for (let i = 0; i < n; i++) {
        diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
    }
    return diff === 0;
}

/** SHA-256 十六进制摘要（用于不可枚举的缓存键），len 为保留的 hex 字符数 */
export async function sha256Hex(str, len = 32) {
    const buf = await crypto.subtle.digest('SHA-256', encoder.encode(String(str)));
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, Math.max(8, Math.min(64, len)));
}

// HMAC key 缓存，避免每个请求都 importKey
const hmacKeyCache = new Map();

async function getHmacKey(secret) {
    if (hmacKeyCache.has(secret)) return hmacKeyCache.get(secret);
    const key = await crypto.subtle.importKey(
        'raw', encoder.encode(String(secret)),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    if (hmacKeyCache.size >= 8) hmacKeyCache.clear();
    hmacKeyCache.set(secret, key);
    return key;
}

/**
 * 订阅 token：HMAC-SHA256 派生 128 bit（32 位 hex）。
 * 替代原来「口令 SHA-1 前 6 位 = 24 bit」的可枚举 token。
 */
export async function deriveSubToken(secret, periodTag = '') {
    const key = await getHmacKey(secret);
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`subox:sub:${periodTag}`));
    return Array.from(new Uint8Array(sig))
        .slice(0, 16)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/** 流式读取文本并强制字节上限（防御超大响应体 OOM） */
async function readTextWithLimit(response, maxBytes) {
    const declared = Number(response.headers?.get?.('Content-Length') || '0');
    if (Number.isFinite(declared) && declared > maxBytes) {
        throw new Error('upstream response too large');
    }
    if (!response.body || typeof response.body.getReader !== 'function') {
        const text = await response.text();
        if (text.length > maxBytes) throw new Error('upstream response too large');
        return text;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) {
                await reader.cancel().catch(() => {});
                throw new Error('upstream response too large');
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock?.();
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return decoder.decode(bytes);
}

/**
 * 带超时 / 重试 / 响应体上限的文本抓取。
 * 返回字符串，失败抛错由调用方决定是静默跳过还是记录。
 */
export async function fetchTextWithRetry(url, options = {}) {
    const {
        retries = 1,
        timeout = 6000,
        maxBytes = LIMITS.MAX_SUB_SOURCE_BYTES
    } = options;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    let lastError = null;
    for (let i = 0; i <= retries; i++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, { signal: controller.signal, headers });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await readTextWithLimit(response, maxBytes);
            return text;
        } catch (error) {
            lastError = error;
            if (i === retries) break;
            await new Promise(r => setTimeout(r, 300));
        } finally {
            clearTimeout(timer);
        }
    }
    throw lastError || new Error('fetch failed');
}

/**
 * 构建线性时间黑名单匹配器。
 *
 * 原实现把 `*` 展开成 `.*` 再拼成单条正则，形如 (?:a.*a.*a.*b)，
 * 对长字符串存在指数级回溯（实测 200 字符 >20s）。这里改为「按 * 分段 +
 * 顺序 indexOf」的有界字面匹配，时间复杂度 O(输入长度 × 段数)，无回溯。
 */
export function buildBlacklistMatcher(blacklistKeywordsRaw) {
    if (!blacklistKeywordsRaw || typeof blacklistKeywordsRaw !== 'string') return null;

    const patterns = blacklistKeywordsRaw
        .slice(0, LIMITS.MAX_BLACKLIST_BYTES)
        .split(/[\n,，;；]/)
        .map(k => k.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, LIMITS.MAX_BLACKLIST_RULES)
        .map(k => k.slice(0, LIMITS.MAX_BLACKLIST_RULE_LENGTH))
        .map(k => k.split('*').filter(Boolean));

    if (patterns.length === 0) return null;

    return {
        patterns,
        test(target) {
            if (typeof target !== 'string' || !target) return false;
            const s = target.toLowerCase().slice(0, LIMITS.MAX_NODE_LENGTH);
            for (const segments of patterns) {
                if (segments.length === 0) return true; // 单个 "*" 命中全部
                let pos = 0;
                let matched = true;
                for (const segment of segments) {
                    const idx = s.indexOf(segment, pos);
                    if (idx === -1) { matched = false; break; }
                    pos = idx + segment.length;
                }
                if (matched) return true;
            }
            return false;
        }
    };
}

/**
 * 黑名单过滤：节点链接 + URL 解码后的文本 + vmess 的 ps 字段。
 * 所有输入都先截断到 MAX_NODE_LENGTH，避免超长串放大开销。
 */
export function isBlacklisted(nodeString, matcher) {
    if (!matcher || !nodeString) return false;

    const node = String(nodeString).slice(0, LIMITS.MAX_NODE_LENGTH);
    const decoded = fullDecode(node).slice(0, LIMITS.MAX_NODE_LENGTH);

    if (matcher.test(node) || matcher.test(decoded)) return true;

    if (/^vmess:\/\//i.test(decoded)) {
        try {
            const jsonString = safeBase64Decode(decoded.substring(8));
            if (jsonString) {
                const vmessConfig = JSON.parse(jsonString);
                if (vmessConfig && vmessConfig.ps) {
                    const name = fullDecode(String(vmessConfig.ps)).slice(0, LIMITS.MAX_NODE_LENGTH);
                    if (matcher.test(name)) return true;
                }
            }
        } catch (e) { /* 非法 vmess 配置，忽略 */ }
    }
    return false;
}
