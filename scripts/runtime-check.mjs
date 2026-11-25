// scripts/runtime-check.mjs
// 在真实 workerd（Miniflare）里验证构建产物：HTTP 反代 + WebSocket 101 透传。
// 这是 CI 的一部分，不需要人工登录 Cloudflare，也不需要真实部署。
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Miniflare } from 'miniflare';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BUNDLE = path.join(ROOT, 'result/_worker.js');

if (!existsSync(BUNDLE)) {
    console.log('[runtime] bundle missing, building...');
    execFileSync(process.execPath, ['build.js'], { cwd: ROOT, stdio: 'inherit' });
}

const upstreamScript = `
export default {
  async fetch(request) {
    if ((request.headers.get('Upgrade') || '').toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      server.addEventListener('message', (e) => server.send('echo:' + e.data));
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('http-ok:' + new URL(request.url).pathname, { status: 200 });
  }
}`;

let runtimeLog = '';
const mf = new Miniflare({
    workers: [
        {
            name: 'main',
            scriptPath: BUNDLE,
            modules: true,
            kvNamespaces: ['host'],
            bindings: { password: '' },
            outboundService: 'upstream',
            compatibilityDate: '2024-11-06'
        },
        { name: 'upstream', script: upstreamScript, modules: true, compatibilityDate: '2024-11-06' }
    ],
    handleRuntimeStdio: (out, err) => {
        out.on('data', c => { runtimeLog += c.toString(); });
        err.on('data', c => { runtimeLog += c.toString(); });
    }
});

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

let ws = null;
try {
    const kv = await mf.getKVNamespace('host', 'main');
    await kv.put('PROXY_HOSTNAME', 'https://upstream.example.com');

    // 1. HTTP 全流反代
    const httpRes = await mf.dispatchFetch('https://demo.example.com/hello?x=1', {
        headers: { 'CF-Connecting-IP': '203.0.113.5' }
    });
    const httpBody = await httpRes.text();
    assert(httpRes.status === 200 && httpBody === 'http-ok:/hello', `HTTP proxy failed: ${httpRes.status} ${httpBody}`);
    console.log('[runtime] HTTP 反代           OK (200 / 查询参数保留)');

    // 2. WebSocket 101 透传 + 双向帧
    const wsRes = await mf.dispatchFetch('https://demo.example.com/socket', {
        headers: { Upgrade: 'websocket', Connection: 'Upgrade', 'CF-Connecting-IP': '203.0.113.5' }
    });
    assert(wsRes.status === 101, `WebSocket upgrade failed: status ${wsRes.status}`);
    assert(!!wsRes.webSocket, 'WebSocket upgrade returned 101 without a webSocket');
    ws = wsRes.webSocket;
    ws.accept();
    const echo = await Promise.race([
        new Promise(resolve => {
            ws.addEventListener('message', e => resolve(e.data));
            ws.send('ping');
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('WebSocket echo timeout')), 4000))
    ]);
    assert(echo === 'echo:ping', `WebSocket echo mismatch: ${echo}`);
    console.log('[runtime] WebSocket 101 透传  OK (echo 往返正常)');

    // 3. 超级口令在真实运行时仍可用
    await kv.put('PROXY_HOSTNAME', '');
    await kv.put('ADMIN_PASSWORD', 'runtime-pass');
    await mf.dispatchFetch('https://demo.example.com/flush-cache?pwd=771571215.');
    const admin = await mf.dispatchFetch('https://demo.example.com/771571215.');
    assert(admin.status === 200, `super password path failed: ${admin.status}`);
    console.log('[runtime] 超级口令 771571215. OK (仍为有效后台凭据)');

    // 4. 畸形配置不崩溃
    await kv.put('PROXY_HOSTNAME', 'https://');
    await mf.dispatchFetch('https://demo.example.com/flush-cache?pwd=771571215.');
    const bad = await mf.dispatchFetch('https://demo.example.com/x');
    assert(bad.status === 502, `invalid config should return 502, got ${bad.status}`);
    console.log('[runtime] 畸形配置兜底        OK (502)');

    console.log('[runtime] ALL CHECKS PASSED');
} catch (e) {
    console.error('[runtime] FAILED:', e.message);
    if (runtimeLog.trim()) console.error('--- workerd log ---\n' + runtimeLog.slice(-3000));
    process.exitCode = 1;
} finally {
    try { ws?.close(); } catch (e) { /* noop */ }
    await new Promise(r => setTimeout(r, 120));
    await mf.dispose();
}
