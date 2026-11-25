import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHybridRateLimiter } from '../src/utils/ratelimit.js';

function mockKV() {
    const data = new Map();
    return {
        async get(key) { return data.has(key) ? data.get(key) : null; },
        async put(key, value) { data.set(key, value); },
        async delete(key) { data.delete(key); },
        _data: data
    };
}

test('分布式限流：失败计数跨 isolate 重启仍然生效，成功后清零', async () => {
    const env = { host: mockKV() };
    const scope = 'ratelimit-persist-' + randomUUID();
    const opts = { max: 2, windowSec: 60, scope };
    const key = '203.0.113.9';

    const first = createHybridRateLimiter(opts);
    assert.equal(await first.allow(env, key), true);
    await first.fail(env, key);
    first.clear(); // 模拟新 isolate：清空 per-isolate 快速路径
    await first.fail(env, key);
    first.clear();

    const second = createHybridRateLimiter(opts);
    assert.equal(await second.allow(env, key), false, 'KV 中的失败计数应跨 isolate 生效');

    await second.reset(env, key);
    assert.equal(await second.allow(env, key), true, '认证成功后应清零分布式计数');
});

test('分布式限流：不同 scope 互不干扰', async () => {
    const env = { host: mockKV() };
    const a = createHybridRateLimiter({ max: 1, windowSec: 60, scope: 'a-' + randomUUID() });
    const b = createHybridRateLimiter({ max: 1, windowSec: 60, scope: 'b-' + randomUUID() });

    await a.fail(env, '198.51.100.2');
    assert.equal(await a.allow(env, '198.51.100.2'), false);
    assert.equal(await b.allow(env, '198.51.100.2'), true);
});

test('分布式限流：KV 故障时 fail-open，不误伤正常请求', async () => {
    const env = {
        host: {
            async get() { throw new Error('KV unavailable'); },
            async put() { throw new Error('KV unavailable'); },
            async delete() { throw new Error('KV unavailable'); }
        }
    };
    const limiter = createHybridRateLimiter({ max: 1, windowSec: 60, scope: 'down-' + randomUUID() });

    await limiter.fail(env, '192.0.2.7');
    assert.equal(await limiter.allow(env, '192.0.2.7'), true);
});

test('分布式限流：键名不写入原始 IP', async () => {
    const env = { host: mockKV() };
    const scope = 'privacy-' + randomUUID();
    const limiter = createHybridRateLimiter({ max: 3, windowSec: 60, scope });
    await limiter.fail(env, '203.0.113.77');

    const keys = [...env.host._data.keys()];
    assert.ok(keys.length > 0);
    assert.ok(keys.every(k => k.startsWith('RATE:')));
    assert.ok(keys.every(k => !k.includes('203.0.113.77')));
});
