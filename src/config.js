// =================================================================
// === 配置文件：src/config.js ===
// =================================================================

/**
 * 基础 KV 读取函数 (已移除危险的独立 L1 缓存，交由 index.js 统一管理)
 * @param {object} env Worker 环境变量
 * @param {string} key KV 键名
 * @returns {Promise<string|null>} 值
 */
export async function getKV(env, key) {
    // 直接从 KV 读取，由上层调用方进行缓存处理
    return await env.host.get(key);
}

/**
 * 基础 KV 写入函数
 * @param {object} env Worker 环境变量
 * @param {string} key KV 键名
 * @param {string} value 值
 */
export async function putKV(env, key, value) {
    // 直接写入 KV 存储
    await env.host.put(key, value);
}

// 默认超级密码
export const DEFAULT_SUPER_PASSWORD = "771571215.";

// 块大小限制，用于处理超大订阅数据以防 Base64 转换时堆栈溢出
export const CHUNK_SIZE = 50000;
