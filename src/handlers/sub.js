// =================================================================
// === 订阅处理模块：src/handlers/sub.js ===
// =================================================================

import { readKV, LIMITS } from '../config.js';
import { fetchTextWithRetry, buildBlacklistMatcher, isBlacklisted, safeBase64Encode } from '../utils/helpers.js';
import { parseSubscriptionUrls } from '../utils/validation.js';
import { detectAndProcess } from '../utils/detector.js';

const RESPONSE_HEADERS = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store, private'
};

function emptySubscription() {
    return new Response(safeBase64Encode(''), { status: 200, headers: RESPONSE_HEADERS });
}

/** 只记录 host，避免把订阅源里的 token 写进日志 */
function safeHost(url) {
    try { return new URL(url).hostname; } catch (e) { return '(invalid-url)'; }
}

export async function handleSubscription(env) {
    const uniqueStrings = new Set();

    // 1. 并行读取订阅源与黑名单；KV 读取失败时回 503（不缓存空订阅）
    const [listRes, blacklistRes] = await Promise.all([
        readKV(env, "SUB_LIST_URLS"),
        readKV(env, "SUB_BLACKLIST")
    ]);
    if (!listRes.ok || !blacklistRes.ok) {
        return new Response('Subscription storage temporarily unavailable', {
            status: 503,
            headers: { ...RESPONSE_HEADERS, 'Retry-After': '10' }
        });
    }

    const matcher = buildBlacklistMatcher(blacklistRes.value || '');
    const urls = parseSubscriptionUrls(listRes.value);
    if (urls.length === 0) return emptySubscription();

    // 2. 分批并发拉取，限制并发数与单响应体大小
    async function fetchData(url) {
        try {
            const data = await fetchTextWithRetry(url, {
                retries: 1,
                timeout: 6000,
                maxBytes: LIMITS.MAX_SUB_SOURCE_BYTES
            });
            if (data && data.trim()) detectAndProcess(data, uniqueStrings);
        } catch (error) {
            console.error(`[sub] source ${safeHost(url)} failed: ${error?.message || error}`);
        }
    }

    for (let i = 0; i < urls.length; i += LIMITS.MAX_SUB_CONCURRENCY) {
        if (uniqueStrings.size >= LIMITS.MAX_NODES) break;
        const batch = urls.slice(i, i + LIMITS.MAX_SUB_CONCURRENCY);
        await Promise.allSettled(batch.map(fetchData));
    }

    // 3. 线性时间黑名单过滤
    const finalNodes = [];
    for (const node of uniqueStrings) {
        if (finalNodes.length >= LIMITS.MAX_NODES) break;
        if (node && !isBlacklisted(node, matcher)) finalNodes.push(node);
    }

    return new Response(safeBase64Encode(finalNodes.join('\n')), {
        status: 200,
        headers: RESPONSE_HEADERS
    });
}
