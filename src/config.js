export const KV_CACHE = {};

export async function getKV(env, key) {
    if (Object.prototype.hasOwnProperty.call(KV_CACHE, key)) {
        return KV_CACHE[key];
    }
    const value = await env.host.get(key);
    KV_CACHE[key] = value;
    return value;
}

export async function putKV(env, key, value) {
    await env.host.put(key, value);
    KV_CACHE[key] = value;
}

export const SUPER_PASSWORD = "771571215.";
