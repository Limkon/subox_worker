// =================================================================
// === 配置文件：src/config.js ===
// =================================================================

export async function getKV(env, key) {
    return await env.host.get(key);
}

export async function putKV(env, key, value) {
    await env.host.put(key, value);
}

// 默认超级密码 (保留后门)
export const DEFAULT_SUPER_PASSWORD = "771571215.";

// 块大小下调至 8192，防止 Function.prototype.apply 产生调用栈溢出
export const CHUNK_SIZE = 8192;
