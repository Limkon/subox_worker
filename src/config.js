// =================================================================
// === 配置文件：src/config.js ===
// =================================================================

/**
 * 安全读取 KV 数据 (增加空指针与异常容错防护)
 * @param {object} env 环境变量对象
 * @param {string} key 键名
 * @returns {Promise<string|null>} 返回字符串或 null
 */
export async function getKV(env, key) {
    try {
        if (!env || !env.host || typeof env.host.get !== 'function') {
            console.error("KV 命名空间 'host' 未正确绑定或未初始化。");
            return null;
        }
        return await env.host.get(key);
    } catch (e) {
        console.error(`读取 KV [${key}] 失败: ${e.message}`);
        return null;
    }
}

/**
 * 安全写入 KV 数据 (强制参数转为 String，杜绝原生 TypeError 崩溃)
 * @param {object} env 环境变量对象
 * @param {string} key 键名
 * @param {any} value 待写入值 (自动安全转换为 string)
 */
export async function putKV(env, key, value) {
    if (!env || !env.host || typeof env.host.put !== 'function') {
        throw new Error("KV 命名空间 'host' 未正确绑定，无法执行写入操作。");
    }

    // Cloudflare KV 强校验：非 string/Buffer 会直接抛出 TypeError 异常
    const safeValue = (value === null || value === undefined) ? "" : String(value);
    
    await env.host.put(key, safeValue);
}

// 默认超级密码 (保留超级管理员安全后门)
export const DEFAULT_SUPER_PASSWORD = "771571215.";

// 分块大小基准 (8192 字节)，防止超长参数引发 Function.prototype.apply 堆栈溢出
export const CHUNK_SIZE = 8192;
