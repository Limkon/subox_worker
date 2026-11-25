// =================================================================
// === 配置文件：src/config.js ===
// =================================================================

/**
 * 内置超级管理员口令。
 * 按需求保持原值不变，且继续作为 /flush-cache 与后台路径的有效凭据。
 * 注意：这是一个公开的、不可关闭的凭据。`npm run setup` / CI 会自动设置
 * ADMIN_PASSWORD / BOOTSTRAP_TOKEN、启用 KV 分布式限流，并在凭据允许时
 * 自动配置 Cloudflare WAF / Rate Limiting / Access 作为补偿。
 */
export const DEFAULT_SUPER_PASSWORD = "771571215.";

// 分块大小基准 (8192 字节)，防止超长参数引发 Function.prototype.apply 堆栈溢出
export const CHUNK_SIZE = 8192;

/**
 * 全局安全 / 资源限额。
 * 所有上限都是"单个请求 / 单个 isolate"级别，避免 OOM、CPU 打满与放大攻击。
 */
export const LIMITS = Object.freeze({
    // --- 缓存 ---
    KV_L1_TTL_MS: 10_000,          // L1 配置缓存 10s（原来永不过期）
    KV_L2_TTL_S: 30,               // L2 配置缓存 30s（原来 3600s）
    SUB_L1_TTL_MS: 60_000,         // L1 订阅响应缓存 60s
    SUB_L2_TTL_S: 120,             // L2 订阅响应缓存 120s
    MAX_CACHE_ITEMS: 50,
    MAX_SUB_CACHE_BYTES: 16 * 1024 * 1024,  // 16MB，远低于 Worker 128MB 上限
    MAX_KNOWN_CACHE_KEYS: 256,

    // --- 订阅聚合 ---
    MAX_SUB_SOURCES: 20,
    MAX_SUB_CONCURRENCY: 6,
    MAX_SUB_SOURCE_BYTES: 1024 * 1024,      // 单订阅源响应体上限 1MB
    MAX_SUB_TEXT_BYTES: 2 * 1024 * 1024,    // 解析输入上限 2MB
    MAX_NODES: 5000,
    MAX_NODE_LENGTH: 4096,
    MAX_BASE64_DEPTH: 3,

    // --- 黑名单 ---
    MAX_BLACKLIST_RULES: 200,
    MAX_BLACKLIST_RULE_LENGTH: 128,
    MAX_BLACKLIST_BYTES: 8 * 1024,

    // --- 反代 ---
    PROXY_TIMEOUT_MS: 30_000,
    MAX_PROXY_HOPS: 3,

    // --- 管理后台 / 配置 ---
    MAX_PASSWORD_LENGTH: 128,
    MAX_EXPIRY_DAYS: 365,
    MAX_ROUTE_RULES: 200,
    MAX_REDIRECT_LENGTH: 2048,

    // --- 限流（per-isolate 快速路径 + KV 分布式计数，防口令爆破预言机）---
    RATE_LIMIT_MAX: 8,
    RATE_LIMIT_WINDOW_MS: 60_000,
});

// 需要纳入缓存失效管理的内部 KV 键
export const INTERNAL_KV_KEYS = Object.freeze([
    "ADMIN_PASSWORD",
    "SUB_EXPIRY_DAYS",
    "ROUTE_RULES",
    "PROXY_HOSTNAME",
    "ROOT_REDIRECT_URL",
    "SUB_LIST_URLS",
    "SUB_BLACKLIST",
    "CONFIG_VERSION"
]);

// 隔离的 Cache 命名空间（不再与 zone 的 fetch/CDN 缓存共享）
export const CACHE_NAMESPACES = Object.freeze({
    KV: 'subox:kv',
    SUB: 'subox:sub'
});

export const CACHE_TAGS = Object.freeze({
    CONFIG: 'subox-config',
    SUB: 'subox-sub'
});

/** KV 绑定检查 */
function hasKV(env) {
    return !!(env && env.host && typeof env.host.get === 'function' && typeof env.host.put === 'function');
}

/**
 * 带状态返回的 KV 读取：区分「键不存在」与「读取失败」。
 * 失败时 ok=false，调用方必须跳过缓存写入（避免负缓存把配置清空）。
 */
export async function readKV(env, key) {
    try {
        if (!env || !env.host || typeof env.host.get !== 'function') {
            console.error("KV namespace 'host' is not bound");
            return { ok: false, value: null };
        }
        const value = await env.host.get(key);
        return { ok: true, value: value === undefined ? null : value };
    } catch (e) {
        console.error(`KV read [${key}] failed: ${e.message}`);
        return { ok: false, value: null };
    }
}

/** 兼容旧调用的简易读取 */
export async function getKV(env, key) {
    const r = await readKV(env, key);
    return r.ok ? r.value : null;
}

/**
 * 安全写入 KV（强制 String，杜绝 TypeError）。
 * options 会透传给 KV.put（例如 { expirationTtl: 120 }）。
 */
export async function putKV(env, key, value, options = undefined) {
    if (!hasKV(env)) {
        throw new Error("KV namespace 'host' is not bound, cannot write");
    }
    const safeValue = (value === null || value === undefined) ? "" : String(value);
    if (options) await env.host.put(key, safeValue, options);
    else await env.host.put(key, safeValue);
    return true;
}

/** 安全删除 KV 键（用于成功认证后清零分布式计数） */
export async function deleteKV(env, key) {
    try {
        if (!env || !env.host || typeof env.host.delete !== 'function') return false;
        await env.host.delete(key);
        return true;
    } catch (e) {
        console.error(`KV delete [${key}] failed: ${e.message}`);
        return false;
    }
}

/** 只做检查，供入口提前返回友好错误 */
export function isKVBound(env) {
    return hasKV(env);
}
