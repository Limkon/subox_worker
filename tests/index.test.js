import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createMockEnv, ORIGIN } from './_env.js';

const worker = (await import('../src/index.js')).default;

function hit(h, path, init = {}) {
    return worker.fetch(new Request(ORIGIN + path, init), h.env, h.ctx);
}

async function fresh(initial = {}, ip = '203.0.113.1') {
    const h = createMockEnv(initial);
    // 每个测试先清掉模块级 L1 缓存（超级口令保持可用）
    const res = await hit(h, '/flush-cache?pwd=771571215.', {
        headers: { 'CF-Connecting-IP': ip }
    });
    assert.equal(res.status, 200);
    return h;
}

test('超级管理员口令 771571215. 保持不变且不可被用户口令关闭', async () => {
    const h = await fresh({ ADMIN_PASSWORD: 'my-own-password' }, '198.51.100.1');

    assert.equal((await hit(h, '/771571215.')).status, 200);
    assert.equal((await hit(h, '/flush-cache?pwd=771571215.')).status, 200);
    assert.equal((await hit(h, '/my-own-password')).status, 200);
    assert.equal((await hit(h, '/flush-cache?pwd=wrong')).status, 403);
    assert.equal((await hit(h, '/nobody')).status, 204);
});

test('/flush-cache 具备限流，不再是无限速口令爆破预言机', async () => {
    const h = await fresh({}, '198.51.100.2');
    let last;
    for (let i = 0; i < 12; i++) {
        last = await hit(h, '/flush-cache?pwd=wrong', {
            headers: { 'CF-Connecting-IP': '198.51.100.99' }
        });
    }
    assert.equal(last.status, 429);
});

test('KV 变更后缓存在 TTL 过期时自动收敛（原实现永久陈旧）', async () => {
    const h = await fresh({ ADMIN_PASSWORD: 'secret1' }, '198.51.100.3');
    const realNow = Date.now;
    let offset = 0;
    Date.now = () => realNow() + offset;
    try {
        assert.equal((await hit(h, '/secret1')).status, 200);
        h.kv.set('ADMIN_PASSWORD', 'secret2');
        assert.equal((await hit(h, '/secret1')).status, 200); // 10s 内 L1 仍命中
        offset = 40_000; // 超过 L1 10s 与 L2 30s
        assert.equal((await hit(h, '/secret1')).status, 204);
        assert.equal((await hit(h, '/secret2')).status, 200);
    } finally {
        Date.now = realNow;
    }
});

test('/flush-cache 立即让旧口令失效', async () => {
    const h = await fresh({ ADMIN_PASSWORD: 'secret1' }, '198.51.100.4');
    assert.equal((await hit(h, '/secret1')).status, 200);
    h.kv.set('ADMIN_PASSWORD', 'secret2');
    assert.equal((await hit(h, '/flush-cache?pwd=771571215.')).status, 200);
    assert.equal((await hit(h, '/secret1')).status, 204);
    assert.equal((await hit(h, '/secret2')).status, 200);
});

test('畸形 / 越界配置不再让整站或后台抛异常', async () => {
    const h = await fresh({
        PROXY_HOSTNAME: 'https://',
        SUB_EXPIRY_DAYS: '999999999999'
    }, '198.51.100.5');

    const proxy = await hit(h, '/some-path');
    assert.equal(proxy.status, 502);
    const admin = await hit(h, '/771571215.');
    assert.equal(admin.status, 200);
    assert.match(await admin.text(), /KV 参数配置/);
});

test('反代目标指向私网时被拒绝；内部虚拟路径始终 403', async () => {
    const h = await fresh({ PROXY_HOSTNAME: 'http://127.0.0.1:8080' }, '198.51.100.6');
    assert.equal((await hit(h, '/x')).status, 502);
    assert.equal((await hit(h, '/__internal_kv_cache/ADMIN_PASSWORD')).status, 403);
    assert.equal((await hit(h, '/__subox/kv/anything')).status, 403);
});

test('后台页面：安全头齐全、不再明文回填管理口令', async () => {
    const h = await fresh({ ADMIN_PASSWORD: 'plaintext-secret' }, '198.51.100.7');
    const res = await hit(h, '/plaintext-secret');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('Content-Security-Policy') || '', /script-src 'nonce-/);
    assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(res.headers.get('Cache-Control') || '', /no-store/);
    const html = await res.text();
    assert.ok(!html.includes('value="plaintext-secret"'), '口令不应出现在 HTML 中');
});

test('后台 POST：CSRF 校验 + 配置校验 + 保存生效', async () => {
    const h = await fresh({}, '198.51.100.8');

    const bad = await hit(h, '/', { method: 'POST', body: new FormData() });
    assert.equal(bad.status, 403);

    const mkForm = (days) => {
        const fd = new FormData();
        fd.set('password', 'newPassword1');
        fd.set('sub_expiry_days', days);
        fd.set('route_rules', 'v1: https://upstream.example.com');
        fd.set('hostname', '');
        fd.set('sublist_urls', '');
        fd.set('sub_blacklist', '');
        fd.set('root_redirect_url', '');
        return fd;
    };
    const headers = { Origin: ORIGIN, 'X-Requested-With': 'subox-admin', 'CF-Connecting-IP': '198.51.100.88' };

    const invalid = await hit(h, '/', { method: 'POST', headers, body: mkForm('999999') });
    assert.equal(invalid.status, 400);

    const ok = await hit(h, '/', { method: 'POST', headers, body: mkForm('7') });
    assert.equal(ok.status, 200);
    assert.equal(h.kv.get('ADMIN_PASSWORD'), 'newPassword1');
    assert.equal(h.kv.get('SUB_EXPIRY_DAYS'), '7');
    assert.ok(h.kv.has('CONFIG_VERSION'));
    assert.equal((await hit(h, '/newPassword1')).status, 200);
});

test('首次配置必须设置口令；BOOTSTRAP_TOKEN 提供抢先接管保护', async () => {
    const h = await fresh({}, '198.51.100.11');
    h.env.BOOTSTRAP_TOKEN = 'bootstrap-secret';
    const headers = { Origin: ORIGIN, 'X-Requested-With': 'subox-admin', 'CF-Connecting-IP': '198.51.100.111' };

    const fd1 = new FormData();
    fd1.set('sub_expiry_days', '0');
    assert.equal((await hit(h, '/', { method: 'POST', headers, body: fd1 })).status, 400); // 未设密码

    const fd2 = new FormData();
    fd2.set('password', 'newpass2');
    fd2.set('sub_expiry_days', '0');
    assert.equal((await hit(h, '/', { method: 'POST', headers, body: fd2 })).status, 403); // 缺引导令牌

    const fd3 = new FormData();
    fd3.set('password', 'newpass2');
    fd3.set('sub_expiry_days', '0');
    fd3.set('bootstrap_token', 'bootstrap-secret');
    assert.equal((await hit(h, '/', { method: 'POST', headers, body: fd3 })).status, 200);
    assert.equal(h.kv.get('ADMIN_PASSWORD'), 'newpass2');
});

test('订阅 token 为 128 bit，且不再使用 caches.default', async () => {
    const h = await fresh({ ADMIN_PASSWORD: 'p' }, '198.51.100.9');
    const html = await (await hit(h, '/p')).text();
    const m = html.match(/id="sub-url" value="([^"]+)"/);
    assert.ok(m);
    const token = m[1].split('/').pop();
    assert.match(token, /^[0-9a-f]{32}$/);
    assert.equal((await hit(h, '/' + token)).status, 200);
    assert.equal(globalThis.caches.default._used, 0, '不应使用共享的 caches.default');
});

test('订阅聚合：本地源 + 通配符黑名单，长节点不触发 ReDoS', async () => {
    const yaml = 'vless://u@h:443#' + 'a'.repeat(20000) + '\n' +
        'trojan://pw@h:443#good';
    const srv = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(yaml);
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const port = srv.address().port;

    try {
        const h = await fresh({
            ADMIN_PASSWORD: 'p',
            SUB_LIST_URLS: `http://127.0.0.1:${port}/sub`,
            SUB_BLACKLIST: 'a*a*a*a*a*b'
        }, '198.51.100.10');

        const html = await (await hit(h, '/p')).text();
        const token = html.match(/id="sub-url" value="([^"]+)"/)[1].split('/').pop();

        const t = performance.now();
        const res = await hit(h, '/' + token);
        const elapsed = performance.now() - t;
        assert.equal(res.status, 200);
        assert.ok(elapsed < 3000, `耗时 ${elapsed.toFixed(0)}ms，疑似 ReDoS 回归`);
        assert.match(Buffer.from(await res.text(), 'base64').toString('utf8'), /trojan:\/\//);
    } finally {
        srv.close();
    }
});
