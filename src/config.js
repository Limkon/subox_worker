// =================================================================
// === 配置文件：src/config.js ===
// =================================================================

// --- 全局缓存对象 ---
// Cloudflare Worker 在实例保活期间会保留全局变量，减少对 KV 的读取次数
export const KV_CACHE = {};

/**
 * 带有缓存机制的 KV 读取函数
 * @param {object} env Worker 环境变量
 * @param {string} key KV 键名
 * @returns {Promise<string|null>} 值
 */
export async function getKV(env, key) {
    // 如果缓存中存在该 key (包括值为 null 的情况)，直接返回缓存值
    if (Object.prototype.hasOwnProperty.call(KV_CACHE, key)) {
        return KV_CACHE[key];
    }
    // 缓存未命中，从 KV 读取
    const value = await env.host.get(key);
    // 写入缓存
    KV_CACHE[key] = value;
    return value;
}

/**
 * 带有缓存更新机制的 KV 写入函数
 * @param {object} env Worker 环境变量
 * @param {string} key KV 键名
 * @param {string} value 值
 */
export async function putKV(env, key, value) {
    // 写入 KV 存储
    await env.host.put(key, value);
    // 同步更新缓存 (Write-through)，确保下次读取为最新值
    KV_CACHE[key] = value;
}

// 默认超级密码
export const DEFAULT_SUPER_PASSWORD = "771571215.";

// 块大小限制，用于处理超大订阅数据以防 Base64 转换时堆栈溢出
export const CHUNK_SIZE = 50000;
