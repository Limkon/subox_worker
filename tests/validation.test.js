import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeHostname, isForbiddenHost, parseProxyTarget, safeRedirectUrl,
    validateAdminForm, parseRouteRules, parseSubscriptionUrls, isSameOriginRequest
} from '../src/utils/validation.js';

test('normalizeHostname: 小写 + 去尾点', () => {
    assert.equal(normalizeHostname('Example.COM.'), 'example.com');
    assert.equal(normalizeHostname(' example.com '), 'example.com');
});

test('isForbiddenHost: 拦截回环/私网/元数据/内部域名', () => {
    for (const h of [
        'localhost', 'a.localhost', '127.0.0.1', '10.1.2.3', '172.16.0.1',
        '192.168.1.1', '169.254.169.254', '0.0.0.0', '[::1]', '[fd00::1]',
        'metadata.google.internal', 'svc.internal', '', 'foo.local'
    ]) assert.equal(isForbiddenHost(h), true, `${h} 应被拦截`);
    for (const h of ['example.com', '1.1.1.1', '8.8.8.8', 'cdn.example.org']) {
        assert.equal(isForbiddenHost(h), false, `${h} 不应被拦截`);
    }
});

test('parseProxyTarget: 合法目标', () => {
    const a = parseProxyTarget('https://example.com:2053/base/');
    assert.equal(a.proto, 'https:');
    assert.equal(a.host, 'example.com:2053');
    assert.equal(a.basePath, '/base');

    const b = parseProxyTarget('example.com:8080');
    assert.equal(b.proto, 'http:');
    assert.equal(b.host, 'example.com:8080');

    const c = parseProxyTarget('example.com');
    assert.equal(c.proto, 'https:');
    assert.equal(c.basePath, '');
});

test('parseProxyTarget: 拒绝危险输入', () => {
    const bad = [
        '', 'https://', 'ftp://example.com', 'javascript:alert(1)',
        'evil.com@127.0.0.1', 'example.com?x=1', 'example.com#f',
        'http://127.0.0.1:8080', 'http://169.254.169.254',
        'http://user:pass@example.com', 'http://example.com:99999'
    ];
    for (const b of bad) assert.throws(() => parseProxyTarget(b), undefined, `${b} 应被拒绝`);
});

test('safeRedirectUrl: 只允许 http(s)', () => {
    assert.equal(safeRedirectUrl(''), '');
    assert.match(safeRedirectUrl('https://example.com/a?b=1'), /^https:\/\/example\.com/);
    assert.equal(safeRedirectUrl('javascript:alert(1)'), '');
    assert.equal(safeRedirectUrl('data:text/html,x'), '');
    assert.equal(safeRedirectUrl('https://u:p@example.com'), '');
    assert.equal(safeRedirectUrl('not a url'), '');
});

test('validateAdminForm: 正常配置', () => {
    const fd = new FormData();
    fd.set('password', 'mySecret1');
    fd.set('sub_expiry_days', '7');
    fd.set('route_rules', 'v1: https://a.example.com:2053\nv1/api: b.example.com');
    fd.set('hostname', 'fallback.example.com');
    fd.set('sublist_urls', 'https://sub.example.com/list');
    fd.set('sub_blacklist', '机场, *测试*');
    fd.set('root_redirect_url', 'https://example.org');
    const r = validateAdminForm(fd, 'worker.example.com');
    assert.equal(r.ok, true);
    assert.equal(r.values.ADMIN_PASSWORD, 'mySecret1');
    assert.equal(r.values.SUB_EXPIRY_DAYS, '7');
});

test('validateAdminForm: 拒绝会导致后台不可达的口令与越界天数', () => {
    const mk = (overrides) => {
        const fd = new FormData();
        fd.set('sub_expiry_days', '0');
        for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
        return fd;
    };
    assert.equal(validateAdminForm(mk({ password: 'a?b' })).ok, false);
    assert.equal(validateAdminForm(mk({ password: 'a/b' })).ok, false);
    assert.equal(validateAdminForm(mk({ password: 'a b' })).ok, false);   // 会被 %20 编码导致后台不可达
    assert.equal(validateAdminForm(mk({ password: '中文密码' })).ok, false);
    assert.equal(validateAdminForm(mk({ password: '' })).ok, true); // 留空 = 不修改
    assert.equal(validateAdminForm(mk({ password: '771571215.' })).ok, true); // 内置超级口令字符集合法
    assert.equal(validateAdminForm(mk({ sub_expiry_days: '999999999999' })).ok, false);
    assert.equal(validateAdminForm(mk({ sub_expiry_days: '-1' })).ok, false);
    assert.equal(validateAdminForm(mk({ route_rules: 'v1: http://127.0.0.1' })).ok, false);
    assert.equal(validateAdminForm(mk({ hostname: 'https://' })).ok, false);
    assert.equal(validateAdminForm(mk({ root_redirect_url: 'javascript:alert(1)' })).ok, false);
    assert.equal(validateAdminForm(mk({ sublist_urls: 'http://169.254.169.254/latest' })).ok, false);
});

test('parseRouteRules: 最长标签优先 + 跳过非法行', () => {
    const rules = parseRouteRules([
        'api: a.example.com',
        'api/v2: https://b.example.com:2053/base',
        'bad-line',
        'evil: http://127.0.0.1',
        '# comment'
    ].join('\n'));
    assert.equal(rules.length, 2);
    assert.equal(rules[0].key, 'api/v2');
    assert.equal(rules[1].key, 'api');
    assert.equal(rules[0].host, 'b.example.com:2053');
    assert.equal(rules[0].basePath, '/base');
});

test('parseSubscriptionUrls: 过滤注释/非 http 并限制条数', () => {
    const urls = parseSubscriptionUrls('# c\nhttps://a.com\nftp://b.com\n\nhttps://c.com');
    assert.deepEqual(urls, ['https://a.com', 'https://c.com']);
});

test('isSameOriginRequest: 同源放行 / 跨站拒绝', () => {
    const ok = new Request('https://demo.example.com/secret', {
        method: 'POST', headers: { Origin: 'https://demo.example.com' }
    });
    const bad = new Request('https://demo.example.com/secret', {
        method: 'POST', headers: { Origin: 'https://evil.example' }
    });
    assert.equal(isSameOriginRequest(ok), true);
    assert.equal(isSameOriginRequest(bad), false);
});
