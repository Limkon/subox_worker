// =================================================================
// === 混合限流：src/utils/ratelimit.js ===
// per-isolate 快速路径 + KV 跨 isolate/跨数据中心计数。
// 不依赖 Cloudflare Rate Limiting Rules，部署后即刻生效，无需手工配置。
// =================================================================

import { getKV, putKV, deleteKV } from '../config.js';
import { sha256Hex } from './helpers.js';
import { createTTLCache, createRateLimiter } from './cache.js';

// KV 读结果在本地缓存 5s，避免每个请求都打 KV
const counterCache = createTTLCache({ maxItems: 2048, maxBytes: 256 * 1024, ttlMs: 5_000 });

function emptyRecord() {
    return { count: 0, resetAt: 0 };
}

function parseRecord(raw) {
    if (!raw) return null;
    try {
        const obj = JSON.parse(raw);
        if (obj && Number.isFinite(obj.count) && Number.isFinite(obj.resetAt)) return obj;
    } catch (e) { /* 脏数据按空计数处理 */ }
    return null;
}

/**
 * @param {object} opts
 * @param {number} opts.max 窗口内允许的最大失败次数
 * @param {number} opts.windowSec 窗口秒数（KV expirationTtl 最小 60s）
 * @param {string} opts.scope 命名空间，避免不同接口互相干扰
 */
export function createHybridRateLimiter({ max = 8, windowSec = 60, scope = 'global' } = {}) {
    const perIsolate = createRateLimiter({ max, windowMs: windowSec * 1000 });

    async function kvKey(env, key) {
        // 不把原始 IP 写进 KV 键名
        return 'RATE:' + (await sha256Hex(`${scope}|${key}`, 24));
    }

    async function readRecord(env, hashed) {
        let rec = counterCache.get(hashed);
        if (rec) return rec;
        let parsed = null;
        try {
            parsed = parseRecord(await getKV(env, hashed));
        } catch (e) {
            console.error(`[ratelimit] KV read failed: ${e.message}`);
        }
        rec = parsed || emptyRecord();
        // KV 故障时 fail-open（可用性优先），这里仍然写入本地缓存避免雪崩
        counterCache.set(hashed, rec, 64);
        return rec;
    }

    return {
        async allow(env, key) {
            if (!perIsolate.allow(key)) return false;
            if (!env?.host) return true;
            try {
                const hashed = await kvKey(env, key);
                const rec = await readRecord(env, hashed);
                if (Date.now() >= rec.resetAt) return true;
                return rec.count < max;
            } catch (e) {
                console.error(`[ratelimit] allow failed open: ${e.message}`);
                return true;
            }
        },

        async fail(env, key) {
            perIsolate.fail(key);
            if (!env?.host) return;
            let hashed = null;
            try {
                hashed = await kvKey(env, key);
                const local = counterCache.get(hashed) || emptyRecord();
                const remote = parseRecord(await getKV(env, hashed)) || emptyRecord();
                const now = Date.now();
                // 取两边较大的计数，缓解并发写丢失（KV 最终一致，属于限速而非精确计费）
                let base = local.count > remote.count ? local : remote;
                if (now >= base.resetAt) base = emptyRecord();
                const next = {
                    count: Math.min(max + 1, base.count + 1),
                    resetAt: now + windowSec * 1000
                };
                counterCache.set(hashed, next, 64);
                await putKV(env, hashed, JSON.stringify(next), {
                    expirationTtl: Math.max(60, windowSec * 2)
                });
            } catch (e) {
                console.error(`[ratelimit] fail record error: ${e.message}`);
                // KV 写入失败时彻底 fail-open：清掉本地计数，避免单点 KV 故障
                // 让同一个 isolate 误伤正常请求。边缘规则 / WAF 属于额外补偿。
                if (hashed) counterCache.set(hashed, emptyRecord(), 64);
                perIsolate.reset(key);
            }
        },

        async reset(env, key) {
            perIsolate.reset(key);
            if (!env?.host) return;
            try {
                const hashed = await kvKey(env, key);
                counterCache.set(hashed, emptyRecord(), 64);
                await deleteKV(env, hashed);
            } catch (e) {
                console.error(`[ratelimit] reset error: ${e.message}`);
            }
        },

        clear() { perIsolate.clear(); }
    };
}
