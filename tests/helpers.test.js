import test from 'node:test';
import assert from 'node:assert/strict';
import {
    safeBase64Encode, safeBase64Decode, fullDecode, constantTimeEqual,
    deriveSubToken, sha256Hex, buildBlacklistMatcher, isBlacklisted
} from '../src/utils/helpers.js';

test('Base64: UTF-8 往返（含中文与 emoji）', () => {
    const src = '节点 #1 🇺🇸 vless://uuid@example.com:443?ed=2048';
    assert.equal(safeBase64Decode(safeBase64Encode(src)), src);
    assert.equal(safeBase64Encode(''), '');
});

test('Base64: 非法输入不抛异常', () => {
    assert.equal(safeBase64Decode(''), '');
    assert.equal(safeBase64Decode(null), '');
    assert.equal(safeBase64Decode('!!!not-base64!!!'), '');
    assert.equal(safeBase64Decode('A'), ''); // 余数 1，直接放弃
});

test('fullDecode: 最多 3 层且非法编码安全退出', () => {
    assert.equal(fullDecode('https%3A%2F%2Fa.com'), 'https://a.com');
    assert.equal(fullDecode('%E0%A4%A'), '%E0%A4%A');
});

test('constantTimeEqual: 正确/错误/长度不同', () => {
    assert.equal(constantTimeEqual('771571215.', '771571215.'), true);
    assert.equal(constantTimeEqual('771571215.', '771571215X'), false);
    assert.equal(constantTimeEqual('', ''), true);
    assert.equal(constantTimeEqual(undefined, ''), true);
});

test('deriveSubToken: 128 bit、随 secret/周期变化', async () => {
    const a = await deriveSubToken('secret', 'static');
    const b = await deriveSubToken('secret', 'static');
    const c = await deriveSubToken('secret2', 'static');
    const d = await deriveSubToken('secret', '1');
    assert.match(a, /^[0-9a-f]{32}$/);
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.notEqual(a, d);
});

test('sha256Hex: 定长且稳定', async () => {
    const a = await sha256Hex('x', 24);
    assert.equal(a.length, 24);
    assert.equal(a, await sha256Hex('x', 24));
    assert.notEqual(a, await sha256Hex('y', 24));
});

test('黑名单: 通配符语义正确', () => {
    const m = buildBlacklistMatcher('*机*, 测试, foo*bar');
    assert.equal(isBlacklisted('vless://x#香港机房01', m), true);
    assert.equal(isBlacklisted('vless://x#测试节点', m), true);
    assert.equal(isBlacklisted('vless://x#fooZZZbar', m), true);
    assert.equal(isBlacklisted('vless://x#普通节点', m), false);
    assert.equal(buildBlacklistMatcher(''), null);
    assert.equal(isBlacklisted('anything', null), false);
});

test('黑名单: 正则灾难性回溯回归（20k 字符必须线性完成）', () => {
    // 旧实现 (?:a.*a.*a.*a.*a.*b) 在 200 字符时即 >20s
    const m = buildBlacklistMatcher('a*a*a*a*a*b');
    const node = 'vless://' + 'a'.repeat(20000);
    const t = performance.now();
    const hit = isBlacklisted(node, m);
    const elapsed = performance.now() - t;
    assert.equal(hit, false);
    assert.ok(elapsed < 500, `耗时 ${elapsed.toFixed(1)}ms，疑似仍存在回溯`);
});

test('黑名单: URL 编码别名与 vmess ps 字段', () => {
    const m = buildBlacklistMatcher('机场');
    assert.equal(isBlacklisted('vless://x#' + encodeURIComponent('机场A'), m), true);
    const vmess = safeBase64Encode(JSON.stringify({ ps: '机场B', add: '1.2.3.4', port: 443, id: 'u' }));
    assert.equal(isBlacklisted('vmess://' + vmess, m), true);
});
