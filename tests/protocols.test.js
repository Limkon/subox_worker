import test from 'node:test';
import assert from 'node:assert/strict';
import { load as loadYaml } from 'js-yaml';
import {
    processClash, processXray, processNaive, processSubscription
} from '../src/protocols/index.js';
import { detectAndProcess } from '../src/utils/detector.js';
import { safeBase64Encode, safeBase64Decode } from '../src/utils/helpers.js';

test('js-yaml: 使用官方发行版，控制字符转义不再被损坏', () => {
    // 审计发现 vendor 版本把 \a \e \N \_ 解析成空格/省略号
    assert.equal(loadYaml('a: "\\a"').a, '\u0007');
    assert.equal(loadYaml('b: "\\e"').b, '\u001b');
    assert.equal(loadYaml('c: "\\N"').c, '\u0085');
    assert.equal(loadYaml('d: "\\_"').d, '\u00a0');
});

test('processClash: VLESS / VMess / SS / Hysteria2 / TUIC', () => {
    const s = new Set();
    processClash({
        proxies: [
            { name: 'V', type: 'vless', server: '1.2.3.4', port: 443, uuid: 'u-1', tls: true, 'reality-opts': { 'public-key': 'pk', 'short-id': 'sid' }, 'client-fingerprint': 'chrome' },
            { name: 'M', type: 'vmess', server: '1.2.3.4', port: 443, uuid: 'u-2', cipher: 'auto', tls: true },
            { name: 'S', type: 'ss', server: '1.2.3.4', port: 8388, cipher: 'aes-128-gcm', password: 'pw' },
            { name: 'H', type: 'hysteria2', server: '1.2.3.4', port: 443, password: 'pw', sni: 's.example' },
            { name: 'T', type: 'tuic', server: '1.2.3.4', port: 443, uuid: 'u-3', password: 'pw', 'congestion-controller': 'bbr' }
        ]
    }, s);
    const arr = [...s];
    assert.equal(arr.length, 5);
    assert.ok(arr.some(x => x.startsWith('vless://u-1@1.2.3.4:443') && x.includes('pbk=pk')));
    assert.ok(arr.some(x => x.startsWith('tuic://u-3:pw@1.2.3.4:443') && x.includes('congestion_control=bbr')));
    const vmess = arr.find(x => x.startsWith('vmess://'));
    const obj = JSON.parse(safeBase64Decode(vmess.slice(8)));
    assert.equal(obj.tls, 'tls');
    assert.equal(obj.ps, 'M');
});

test('processClash: reality 的 vmess 不再写出非法的 tls=reality', () => {
    const s = new Set();
    processClash({ proxies: [{ name: 'R', type: 'vmess', server: 'h', port: 443, uuid: 'u', reality: true }] }, s);
    const obj = JSON.parse(safeBase64Decode([...s][0].slice(8)));
    assert.equal(obj.tls, '');
});

test('processXray: shadowsocks outbound 不再被丢弃', () => {
    const s = new Set();
    processXray({
        outbounds: [{
            tag: 'SS', protocol: 'shadowsocks',
            settings: { servers: [{ address: '1.2.3.4', port: 8388, method: '2022-blake3-aes-128-gcm', password: 'pw' }] }
        }]
    }, s);
    assert.equal(s.size, 1);
    assert.match([...s][0], /^ss:\/\//);
});

test('processNaive: 自动补 naive+ 前缀', () => {
    const s = new Set();
    processNaive({ proxy: 'https://u:p@example.com' }, s);
    processNaive({ proxy: 'naive+quic://example.com' }, s);
    assert.ok([...s].some(x => x === 'naive+https://u:p@example.com'));
    assert.ok([...s].some(x => x === 'naive+quic://example.com'));
});

test('processSubscription: 协议前缀大小写不敏感', () => {
    const s = new Set();
    processSubscription('VLESS://u@h:443?type=ws#x\nvmess://abc\nnot-a-node', s);
    assert.equal(s.size, 2);
});

test('detectAndProcess: 多层 Base64 + Clash YAML + JSON 数组', () => {
    const yaml = [
        'proxies:',
        '  - name: "A\\_B"',
        '    type: ss',
        '    server: 1.2.3.4',
        '    port: 8388',
        '    cipher: aes-128-gcm',
        '    password: pw'
    ].join('\n');

    const a = new Set();
    detectAndProcess(safeBase64Encode(safeBase64Encode(yaml)), a);
    assert.equal(a.size, 1);
    assert.match([...a][0], /^ss:\/\//);

    const b = new Set();
    detectAndProcess(JSON.stringify(['vless://u@h:443#a', 'trojan://p@h:443#b']), b);
    assert.equal(b.size, 2);
});

test('detectAndProcess: 节点数量与长度有上限', () => {
    const s = new Set();
    const many = Array.from({ length: 6000 }, (_, i) => `vless://u${i}@h:443`).join('\n');
    detectAndProcess(many, s);
    assert.ok(s.size <= 5000);
});
