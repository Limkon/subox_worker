// 测试辅助：mock Cloudflare KV / caches.open / ctx
export const ORIGIN = 'https://demo.example.com';

export function createMockEnv(initial = {}) {
    const kv = new Map(Object.entries(initial));
    const namespaces = new Map();

    function makeCache() {
        const store = new Map();
        return {
            async match(req) {
                const e = store.get(req.url);
                if (!e) return undefined;
                if (e.expiresAt <= Date.now()) { store.delete(req.url); return undefined; }
                return e.res.clone();
            },
            async put(req, res) {
                const cc = res.headers.get('Cache-Control') || '';
                const m = cc.match(/s-maxage=(\d+)/);
                const ttl = m ? Number(m[1]) * 1000 : 0;
                store.set(req.url, { res: res.clone(), expiresAt: Date.now() + ttl });
            },
            async delete(req) { return store.delete(req.url); },
            _store: store
        };
    }

    // 模拟 Cloudflare 的具名缓存命名空间；同时保留 default 以验证代码不会使用它
    globalThis.caches = {
        open: async (name) => {
            if (!namespaces.has(name)) namespaces.set(name, makeCache());
            return namespaces.get(name);
        },
        default: {
            _used: 0,
            async match() { this._used++; return undefined; },
            async put() { this._used++; },
            async delete() { this._used++; return false; }
        }
    };

    const env = {
        host: {
            get: async (k) => kv.has(k) ? kv.get(k) : null,
            put: async (k, v) => { kv.set(k, String(v)); }
        },
        password: ''
    };
    const ctx = {
        tasks: [],
        waitUntil(p) { this.tasks.push(Promise.resolve(p).catch(() => {})); }
    };

    return { env, ctx, kv, namespaces };
}
