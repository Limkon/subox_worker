// =================================================================
// === 缓存 / 限流基础组件：src/utils/cache.js ===
// =================================================================

/**
 * 带 TTL + 总字节上限的内存缓存。
 * 原实现只有条目数上限、永不过期（导致改密码后旧口令长期有效），
 * 且 50 × 3MB = 150MB 超过 Worker 128MB 内存限制。
 */
export function createTTLCache({ maxItems = 50, maxBytes = 16 * 1024 * 1024, ttlMs = 60_000 } = {}) {
    const map = new Map();
    let totalBytes = 0;

    function drop(key, entry) {
        totalBytes -= entry.bytes || 0;
        map.delete(key);
    }

    function prune(now = Date.now()) {
        for (const [key, entry] of map) {
            if (entry.expireAt <= now) drop(key, entry);
        }
        if (totalBytes < 0) totalBytes = 0;
    }

    return {
        has(key) {
            const entry = map.get(key);
            if (!entry) return false;
            if (entry.expireAt <= Date.now()) { drop(key, entry); return false; }
            return true;
        },
        get(key) {
            const entry = map.get(key);
            if (!entry) return undefined;
            if (entry.expireAt <= Date.now()) { drop(key, entry); return undefined; }
            // 命中时刷新插入顺序（LRU 语义），但不延长 TTL
            map.delete(key);
            map.set(key, entry);
            return entry.value;
        },
        set(key, value, bytes = 0, ttl = ttlMs) {
            const size = Math.max(0, Number(bytes) || 0);
            if (size > maxBytes) return false; // 单条就超限，直接不入缓存
            prune();
            if (map.has(key)) drop(key, map.get(key));
            while (map.size >= maxItems || totalBytes + size > maxBytes) {
                const oldest = map.keys().next();
                if (oldest.done) break;
                drop(oldest.value, map.get(oldest.value));
            }
            map.set(key, { value, bytes: size, expireAt: Date.now() + Math.max(1, ttl) });
            totalBytes += size;
            return true;
        },
        clear() {
            map.clear();
            totalBytes = 0;
        },
        get size() { return map.size; },
        get bytes() { return totalBytes; }
    };
}

/** 有上限的 Set，防止 knownCacheKeys 无界增长 */
export function createBoundedSet(limit = 256) {
    const set = new Set();
    return {
        add(key) {
            if (set.size >= limit) {
                const oldest = set.values().next();
                if (!oldest.done) set.delete(oldest.value);
            }
            set.add(key);
        },
        values() { return set.values(); },
        clear() { set.clear(); },
        get size() { return set.size; }
    };
}

/** ctx.waitUntil 的安全包装：吞掉并记录异常，避免未处理的 Promise rejection */
export function waitUntilSafe(ctx, promiseLike, label = 'background task') {
    try {
        if (!ctx || typeof ctx.waitUntil !== 'function') return;
        ctx.waitUntil(Promise.resolve(promiseLike).catch(err => {
            console.error(`[${label}] failed: ${err?.message || err}`);
        }));
    } catch (e) {
        console.error(`[${label}] scheduling failed: ${e?.message || e}`);
    }
}

/**
 * per-isolate 的简易滑动窗口限流。
 * 不是分布式限流（跨数据中心不共享），但足以消除
 * /flush-cache 与后台 POST 的无限速口令爆破预言机。
 * 生产环境建议叠加 Cloudflare Rate Limiting Rules。
 */
export function createRateLimiter({ max = 8, windowMs = 60_000 } = {}) {
    const buckets = new Map();

    function check(key, now = Date.now()) {
        let b = buckets.get(key);
        if (!b || now - b.start >= windowMs) {
            b = { start: now, count: 0 };
            buckets.set(key, b);
        }
        // 控制 Map 体积
        if (buckets.size > 4096) {
            for (const [k, v] of buckets) {
                if (now - v.start >= windowMs) buckets.delete(k);
            }
            if (buckets.size > 4096) buckets.clear();
        }
        return b.count < max;
    }

    return {
        allow(key) { return check(key); },
        fail(key) {
            const now = Date.now();
            check(key, now);
            const b = buckets.get(key);
            if (b) b.count += 1;
        },
        reset(key) { buckets.delete(key); },
        clear() { buckets.clear(); }
    };
}
