#!/usr/bin/env node
// scripts/setup.mjs —— 一键部署，零手工配置
//
// 自动完成：
//   1. 安装锁定依赖
//   2. 确认 Cloudflare 授权（API Token 或已有 wrangler 登录态；否则脚本拉起一次浏览器授权）
//   3. 创建/复用 KV namespace，生成临时 wrangler 配置（不把账号相关 id 写回仓库）
//   4. 生成强随机管理口令与 BOOTSTRAP_TOKEN，作为 Worker secrets 上传
//   5. 构建 + 单元/回归测试 + 真实 workerd 运行时测试（HTTP / WebSocket 101 / 超级口令）
//   6. 部署
//   7. 凭据允许时自动创建 WAF、Rate Limiting、Access 应用与策略
//
// 用法：
//   npm run setup                       # 全自动
//   npm run setup -- --dry-run          # 仅本地演练，不调用 Cloudflare API
//   npm run setup -- --skip-verify      # CI 已经跑过 verify 时使用
//   npm run setup -- --skip-edge        # 跳过边缘规则（代码级防护仍生效）
//
// 可选环境变量：CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID、
// CLOUDFLARE_ZONE_ID、WORKER_DOMAIN、ADMIN_PASSWORD、BOOTSTRAP_TOKEN、
// SETUP_MASTER_KEY、SETUP_ROTATION_SALT、ACCESS_ALLOWED_EMAILS。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TEMPLATE = path.join(ROOT, 'wrangler.toml');
const GENERATED = path.join(ROOT, '.wrangler.generated.toml');
const STATE_FILE = path.join(ROOT, '.setup-state.json');
const CRED_FILE = path.join(ROOT, '.setup-credentials.json');
const PLACEHOLDER = 'REPLACE_WITH_YOUR_KV_NAMESPACE_ID';
const TEMP_KV_ID = '0'.repeat(32);
const KV_TITLE = 'subox-worker-host';
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const SKIP_VERIFY = args.has('--skip-verify');
const SKIP_EDGE = args.has('--skip-edge');

const log = (s) => console.log(`\n\x1b[36m[setup]\x1b[0m ${s}`);
const warn = (s) => console.warn(`\x1b[33m[setup] 提示:\x1b[0m ${s}`);

function run(cmd, cmdArgs, opts = {}) {
    const stdio = opts.capture
        ? ['pipe', 'pipe', 'pipe']
        : opts.interactive
            ? 'inherit'
            : ['pipe', 'inherit', 'inherit'];
    const res = spawnSync(cmd, cmdArgs, {
        cwd: ROOT,
        stdio,
        input: opts.interactive ? undefined : (opts.input ?? 'y\n'),
        encoding: 'utf8'
    });
    return { code: res.status ?? 1, out: `${res.stdout || ''}${res.stderr || ''}` };
}
function wrangler(sub, opts = {}) {
    return run(NPX, ['wrangler', '-c', GENERATED, ...sub], opts);
}
function must(res, what) {
    if (res.code !== 0) throw new Error(`${what} 失败 (exit ${res.code})\n${res.out.slice(-1800)}`);
    return res;
}
function readJson(file) {
    try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { return {}; }
}
function writeJson(file, obj) {
    writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
    try { chmodSync(file, 0o600); } catch (e) { /* 部分文件系统不支持 mode，不影响部署 */ }
}

// ---------------------------------------------------------------- 临时配置
function prepareConfig() {
    log('1/7 生成临时 wrangler 配置');
    const state = readJson(STATE_FILE);
    const template = readFileSync(TEMPLATE, 'utf8');
    const id = state.kvNamespaceId || TEMP_KV_ID;
    const generated = template.replace(PLACEHOLDER, id);
    writeFileSync(GENERATED, generated, 'utf8');
    console.log('    .wrangler.generated.toml 已生成（gitignore，不污染仓库）');
}

// ---------------------------------------------------------------- 依赖
function ensureDeps() {
    log('2/7 检查依赖');
    if (existsSync(path.join(ROOT, 'node_modules/.bin/wrangler'))) {
        console.log('    依赖已就绪');
        return;
    }
    must(run(NPM, ['ci']), 'npm ci');
}

// ---------------------------------------------------------------- 授权与 account id
function rememberAccountId(text) {
    if (process.env.CLOUDFLARE_ACCOUNT_ID) return;
    const m = text.match(/\b[0-9a-f]{32}\b/);
    if (m) process.env.CLOUDFLARE_ACCOUNT_ID = m[0];
}

function ensureAuth() {
    log('3/7 确认 Cloudflare 授权');
    if (DRY) { console.log('    dry-run：跳过'); return; }
    if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
        console.log('    使用 CLOUDFLARE_API_TOKEN（无交互）');
        return;
    }
    let who = wrangler(['whoami'], { capture: true });
    if (/not authenticated|not logged in/i.test(who.out)) {
        console.log('    未检测到登录态，脚本将拉起一次 wrangler login');
        must(wrangler(['login'], { interactive: true }), 'wrangler login');
        who = wrangler(['whoami'], { capture: true });
    }
    rememberAccountId(who.out);
    if (process.env.CLOUDFLARE_ACCOUNT_ID) {
        console.log(`    account id 已自动识别: ${process.env.CLOUDFLARE_ACCOUNT_ID.slice(0, 8)}…`);
    } else {
        warn('wrangler 已登录但无法解析 account id；KV/WAF 自动化将按 API 返回的默认值继续');
    }
}

// ---------------------------------------------------------------- Cloudflare API
async function cf(pathname, init = {}) {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!token) return null;
    try {
        const res = await fetch('https://api.cloudflare.com/client/v4' + pathname, {
            ...init,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...(init.headers || {})
            }
        });
        const json = await res.json().catch(() => ({}));
        return { ok: res.ok && json.success !== false, status: res.status, result: json.result, errors: json.errors };
    } catch (e) {
        return { ok: false, status: 0, errors: [{ message: e.message }] };
    }
}
function cfError(r) {
    return r?.errors?.map(e => e.message || e.code).join('; ') || `HTTP ${r?.status || '?'}`;
}

// ---------------------------------------------------------------- KV namespace
async function findKvByApi() {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId) return null;
    const r = await cf(`/accounts/${accountId}/storage/kv/namespaces?per_page=100`);
    if (!r?.ok || !Array.isArray(r.result)) return null;
    const found = r.result.find(n => n.title === KV_TITLE || n.id === process.env.CLOUDFLARE_KV_NAMESPACE_ID);
    return found?.id || null;
}
function findKvByWrangler() {
    const listing = wrangler(['kv:namespace', 'list'], { capture: true });
    if (listing.code !== 0) return null;
    const text = listing.out;
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start >= 0 && end > start) {
        try {
            const arr = JSON.parse(text.slice(start, end + 1));
            const found = arr.find(n => n.title === KV_TITLE);
            if (found?.id) return found.id;
        } catch (e) { /* 退化到正则解析 */ }
    }
    const m = text.match(/\{\s*"id"\s*:\s*"([0-9a-f]{32})"[\s\S]{0,200}?"title"\s*:\s*"subox-worker-host"/)
        || text.match(/"title"\s*:\s*"subox-worker-host"[\s\S]{0,200}?"id"\s*:\s*"([0-9a-f]{32})"/);
    return m?.[1] || null;
}
async function ensureKvNamespace() {
    log('4/7 配置 KV namespace');
    const state = readJson(STATE_FILE);
    if (state.kvNamespaceId) {
        writeFileSync(GENERATED, readFileSync(TEMPLATE, 'utf8').replace(PLACEHOLDER, state.kvNamespaceId), 'utf8');
        console.log('    复用 .setup-state.json 中已记录的 namespace');
        return;
    }
    if (DRY) { console.log(`    dry-run：将创建或复用 namespace "${KV_TITLE}" 并注入临时配置`); return; }

    let id = await findKvByApi();
    if (!id) id = findKvByWrangler();
    if (!id) {
        const res = must(wrangler(['kv:namespace', 'create', KV_TITLE], { capture: true }), `创建 KV namespace ${KV_TITLE}`);
        const m = res.out.match(/^\s*id\s*=\s*"([0-9a-f]{32})"/im) || res.out.match(/"id"\s*:\s*"([0-9a-f]{32})"/);
        if (!m) throw new Error(`无法解析新建 namespace id:\n${res.out.slice(-1200)}`);
        id = m[1];
        console.log(`    已创建 namespace: ${id}`);
    } else {
        console.log(`    已复用 namespace: ${id}`);
    }
    writeJson(STATE_FILE, { ...state, kvNamespaceId: id, updatedAt: new Date().toISOString() });
    writeFileSync(GENERATED, readFileSync(TEMPLATE, 'utf8').replace(PLACEHOLDER, id), 'utf8');
}

// ---------------------------------------------------------------- secrets
function deriveSecret(master, accountId, label) {
    const salt = process.env.SETUP_ROTATION_SALT || '';
    return createHmac('sha256', `${master}|${salt}`)
        .update(`subox-worker|${accountId || ''}|${label}`)
        .digest('base64url')
        .slice(0, 32);
}
function ensureSecrets() {
    log('5/7 生成并上传管理凭据');
    const state = readJson(STATE_FILE);
    const master = process.env.SETUP_MASTER_KEY || process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
    let creds;
    if (master) {
        // CI/API Token 场景：从已有密钥确定性派生，重复部署不会漂移，也无需手工保存凭据
        creds = {
            password: process.env.ADMIN_PASSWORD || deriveSecret(master, accountId, 'password'),
            BOOTSTRAP_TOKEN: process.env.BOOTSTRAP_TOKEN || deriveSecret(master, accountId, 'bootstrap'),
            source: 'derived-from-CLOUDFLARE_API_TOKEN'
        };
        console.log('    管理凭据由 API Token 确定性派生（无需手工设置/保存）');
    } else {
        creds = readJson(CRED_FILE);
        if (!creds.password || !creds.BOOTSTRAP_TOKEN || args.has('--rotate-secrets')) {
            creds = {
                password: process.env.ADMIN_PASSWORD || randomBytes(24).toString('base64url'),
                BOOTSTRAP_TOKEN: process.env.BOOTSTRAP_TOKEN || randomBytes(32).toString('base64url'),
                generatedAt: new Date().toISOString(),
                source: 'random-local'
            };
            if (!DRY) {
                writeJson(CRED_FILE, creds);
                console.log('    凭据已保存到 .setup-credentials.json（已 gitignore）');
            }
        } else {
            console.log('    沿用 .setup-credentials.json 中已有的凭据');
        }
    }
    if (DRY) { console.log('    dry-run：跳过 secret bulk'); return creds; }

    const tmp = path.join(tmpdir(), `subox-secrets-${process.pid}.json`);
    try {
        writeFileSync(tmp, JSON.stringify({
            password: creds.password,
            BOOTSTRAP_TOKEN: creds.BOOTSTRAP_TOKEN
        }), 'utf8');
        must(wrangler(['secret', 'bulk', tmp]), '上传 Worker secrets');
        console.log('    password / BOOTSTRAP_TOKEN 已作为 Worker secrets 上传');
    } finally {
        try { unlinkSync(tmp); } catch (e) { /* noop */ }
    }
    if (master) {
        // 记录指纹，便于审计派生凭据是否随 Token 轮换
        writeJson(STATE_FILE, { ...state, secretFingerprint: createHmac('sha256', master).update(accountId).digest('hex').slice(0, 16) });
    }
    return creds;
}

// ---------------------------------------------------------------- 验证与部署
function verifyAndDeploy() {
    log('6/7 构建 / 测试 / 部署');
    if (SKIP_VERIFY) {
        if (!existsSync(path.join(ROOT, 'result/_worker.js'))) must(run(NPM, ['run', 'build']), 'npm run build');
        console.log('    --skip-verify：沿用外部已完成的验证');
    } else {
        must(run(NPM, ['run', 'verify']), 'npm run verify');
    }

    if (DRY) { console.log('    dry-run：跳过 wrangler deploy'); return null; }
    const res = must(wrangler(['deploy'], { capture: true }), 'wrangler deploy');
    console.log(res.out.trim());

    const urls = [...res.out.matchAll(/https:\/\/[^\s"'<>]+/g)]
        .map(m => m[0].replace(/[),.;]+$/, ''));
    const custom = domainFromToml();
    return urls.find(u => custom && safeHost(u) === custom)
        || urls.find(u => u.includes('.workers.dev'))
        || urls[0]
        || null;
}

// ---------------------------------------------------------------- 域名 / Zone
function safeHost(value) {
    try { return new URL(value.startsWith('http') ? value : 'https://' + value).hostname; }
    catch (e) { return null; }
}
function domainFromToml() {
    if (process.env.WORKER_DOMAIN) return safeHost(process.env.WORKER_DOMAIN);
    try {
        const toml = readFileSync(TEMPLATE, 'utf8');
        const m = toml.match(/^\s*pattern\s*=\s*"([^"]+)"/m);
        if (!m) return null;
        const p = m[1].replace(/\*/g, 'x');
        return safeHost(p);
    } catch (e) { return null; }
}
async function resolveZoneId(domain) {
    if (process.env.CLOUDFLARE_ZONE_ID) return process.env.CLOUDFLARE_ZONE_ID;
    if (!domain) return null;
    const r = await cf(`/zones?name=${encodeURIComponent(domain)}`);
    return r?.ok && Array.isArray(r.result) && r.result.length ? r.result[0].id : null;
}

// ---------------------------------------------------------------- WAF / Rate Limiting
async function ensureRule(zoneId, phase, rule) {
    const base = `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`;
    const existing = await cf(base);
    if (existing?.ok) {
        const found = (existing.result?.rules || []).find(r => r.description === rule.description);
        if (found) return '已存在';
        const added = await cf(`${base}/rules`, { method: 'POST', body: JSON.stringify(rule) });
        return added?.ok ? '已创建' : `跳过(${added?.status}: ${cfError(added)})`;
    }
    if (existing?.status === 404 || existing?.status === 400) {
        const created = await cf(base, {
            method: 'PUT',
            body: JSON.stringify({ description: `subox-worker ${phase} defaults`, rules: [rule] })
        });
        return created?.ok ? '已创建' : `跳过(${created?.status}: ${cfError(created)})`;
    }
    return `跳过(${existing?.status ?? '无 API Token'}: ${cfError(existing)})`;
}

// ---------------------------------------------------------------- Cloudflare Access（best-effort）
function adminPaths(creds) {
    const paths = ['/771571215.', '/flush-cache'];
    if (creds?.password && /^[A-Za-z0-9._~!*'()-]+$/.test(creds.password)) {
        paths.push('/' + creds.password);
    }
    return [...new Set(paths)];
}
async function ensureAccessProtection(domain, creds) {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId || !domain) {
        console.log('    Access：无 account id / 域名，跳过（代码级鉴权、CSRF、限流仍生效）');
        return;
    }
    if (!process.env.CLOUDFLARE_API_TOKEN) {
        console.log('    Access：当前为 wrangler 登录态，无 API Token，跳过（代码级防护仍生效）');
        return;
    }

    const idpsRes = await cf(`/accounts/${accountId}/access/identity_providers`);
    const idps = Array.isArray(idpsRes?.result) ? idpsRes.result : [];
    if (!idps.length) {
        console.log('    Access：账户未启用 IdP，跳过（不创建过宽的 everyone 策略）');
        return;
    }
    const userRes = await cf('/user');
    const owner = userRes?.result?.email;
    const emails = (process.env.ACCESS_ALLOWED_EMAILS || owner || '')
        .split(',').map(s => s.trim()).filter(Boolean);
    if (!emails.length) {
        console.log('    Access：无法确定允许邮箱，跳过（不创建过宽的 everyone 策略）');
        return;
    }

    const appsRes = await cf(`/accounts/${accountId}/access/apps?per_page=100`);
    if (!appsRes?.ok || !Array.isArray(appsRes.result)) {
        console.log(`    Access：无法列出应用，跳过(${appsRes?.status}: ${cfError(appsRes)})`);
        return;
    }

    let created = 0;
    for (const [i, p] of adminPaths(creds).entries()) {
        const target = domain + p;
        const existing = appsRes.result.find(a => a.domain === target || (a.self_hosted_domains || []).includes(target));
        let appId = existing?.id;
        if (!appId) {
            const add = await cf(`/accounts/${accountId}/access/apps`, {
                method: 'POST',
                body: JSON.stringify({
                    name: `subox-worker admin guard ${i + 1}`,
                    domain: target,
                    type: 'self_hosted',
                    session_duration: '24h',
                    allowed_idps: idps.map(x => x.id),
                    auto_redirect_to_identity: idps.length === 1,
                    app_launcher_visible: false,
                    http_only_cookie_attribute: true,
                    same_site_cookie_attribute: 'lax'
                })
            });
            if (!add?.ok) {
                console.log(`    Access：${p} 创建失败(${add?.status}: ${cfError(add)})`);
                continue;
            }
            appId = add.result?.id;
            created++;
        }
        if (!appId) continue;
        const policiesRes = await cf(`/accounts/${accountId}/access/apps/${appId}/policies`);
        const policies = Array.isArray(policiesRes?.result) ? policiesRes.result : [];
        if (policies.some(policy => policy.name === 'subox-worker account owner')) continue;
        await cf(`/accounts/${accountId}/access/apps/${appId}/policies`, {
            method: 'POST',
            body: JSON.stringify({
                name: 'subox-worker account owner',
                decision: 'allow',
                precedence: 1,
                include: emails.map(email => ({ email: { email } }))
            })
        });
    }
    console.log(`    Access：自动保护 ${adminPaths(creds).length} 个后台路径（新建 ${created} 个应用，策略仅允许 ${emails.length} 个邮箱）`);
}

async function configureEdgeProtection(deployedUrl, creds) {
    log('7/7 配置边缘防护（WAF / Rate Limiting / Access）');
    if (DRY) { console.log('    dry-run：跳过'); return; }
    if (SKIP_EDGE) { console.log('    --skip-edge：跳过（代码级防护仍生效）'); return; }
    if (!process.env.CLOUDFLARE_API_TOKEN) {
        console.log('    当前为 wrangler 登录态、无 API Token：跳过边缘 API；代码内建的分布式限流、CSRF、/ __subox/* 403 已自动生效');
        return;
    }

    const domain = domainFromToml() || safeHost(deployedUrl);
    const zoneId = await resolveZoneId(domain);
    if (zoneId) {
        const wafRule = {
            description: 'subox-worker: block internal cache paths',
            expression: '(http.request.uri.path contains "/__subox/") or (http.request.uri.path contains "/__internal_kv_cache/")',
            action: 'block',
            enabled: true
        };
        const rateRule = {
            description: 'subox-worker: rate limit admin endpoints',
            expression: '(http.request.uri.path eq "/flush-cache") or (http.request.method eq "POST")',
            action: 'block',
            ratelimit: {
                characteristics: ['ip.src', 'cf.colo.id'],
                period: 60,
                requests_per_period: 20,
                mitigation_timeout: 60
            },
            enabled: true
        };
        console.log('    WAF 内部路径拦截:', await ensureRule(zoneId, 'http_request_firewall_custom', wafRule));
        console.log('    后台路径限速:', await ensureRule(zoneId, 'http_ratelimit', rateRule));
    } else {
        console.log('    未解析到 Zone：自动跳过 WAF/Rate Limiting API；代码级分布式限流仍生效');
    }
    await ensureAccessProtection(domain, creds);
}

// ---------------------------------------------------------------- main
async function main() {
    console.log('\n=== subox-worker 一键部署 ===');
    if (DRY) console.log('（dry-run：不会调用任何 Cloudflare API，也不会部署）');

    prepareConfig();
    ensureDeps();
    ensureAuth();
    await ensureKvNamespace();
    const creds = ensureSecrets();
    const deployedUrl = verifyAndDeploy();
    await configureEdgeProtection(deployedUrl, creds);

    log('完成 ✅ 全程无需手工编辑配置');
    console.log('  Worker 名称      : subox-worker');
    console.log('  临时配置          : .wrangler.generated.toml（gitignore）');
    console.log('  KV namespace      : subox-worker-host（自动创建/复用）');
    console.log('  管理凭据          : Worker secrets；CI 由 API Token 派生，本地见 .setup-credentials.json');
    console.log('  后台地址          : /<管理口令>  （内置超级口令 771571215. 仍有效）');
    if (deployedUrl) console.log(`  部署 URL          : ${deployedUrl}`);
    console.log('\n  说明：内置超级口令按要求保留且不可关闭；脚本已自动叠加独立强口令、分布式限流、CSRF 与可用的边缘防护。\n');
}

main().catch(e => {
    console.error(`\n\x1b[31m[setup] 失败:\x1b[0m ${e.message}`);
    process.exit(1);
});
