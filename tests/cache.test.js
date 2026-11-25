import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createTTLCache, createBoundedSet, createRateLimiter, waitUntilSafe
} from '../src/utils/cache.js';

test('createTTLCache: 到期自动失效（原实现永不过期）', async () => {
    const c = createTTLCache({ maxItems: 10, maxBytes: 1000, ttlMs: 20 });
    c.set('k', 'v', 1);
    assert.equal(c.get('k'), 'v');
    await new Promise(r => setTimeout(r, 35));
    assert.equal(c.has('k'), false);
    assert.equal(c.get('k'), undefined);
});

test('createTTLCache: 总字节上限与单条超限', () => {
    const c = createTTLCache({ maxItems: 100, maxBytes: 100, ttlMs: 60_000 });
    assert.equal(c.set('big', 'x', 101), false); // 单条超限不入缓存
    assert.equal(c.size, 0);
    for (let i = 0; i < 20; i++) c.set('k' + i, 'v', 10);
    assert.ok(c.bytes <= 100);
    assert.ok(c.size <= 10);
});

test('createBoundedSet: 有上限', () => {
    const s = createBoundedSet(3);
    for (let i = 0; i < 10; i++) s.add('k' + i);
    assert.equal(s.size, 3);
    s.clear();
    assert.equal(s.size, 0);
});

test('createRateLimiter: 达到阈值后拒绝，窗口过后恢复', () => {
    const now0 = Date.now();
    const l = createRateLimiter({ max: 3, windowMs: 1000 });
    const key = '1.2.3.4';
    assert.equal(l.allow(key), true);
    l.fail(key); l.fail(key); l.fail(key);
    assert.equal(l.allow(key), false);
    l.reset(key);
    assert.equal(l.allow(key), true);
    assert.ok(Date.now() - now0 >= 0);
});

test('waitUntilSafe: 吞掉 rejection 且不抛出', async () => {
    const tasks = [];
    const ctx = { waitUntil: (p) => tasks.push(Promise.resolve(p).catch(() => {})) };
    waitUntilSafe(ctx, Promise.reject(new Error('cache.put 413')), 'test');
    await Promise.all(tasks);
    assert.equal(tasks.length, 1);
    assert.doesNotThrow(() => waitUntilSafe(null, Promise.resolve(1)));
});
