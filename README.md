# subox_worker

模块化 Cloudflare Worker：KV 配置后台 + 聚合订阅 + 全流反向代理。

## 一键开始（不需要手工配置）

```bash
npm ci
npm run setup          # 自动完成授权 / KV / secrets / 测试 / 部署 / 边缘防护
npm run setup -- --dry-run   # 只做本地构建与验证，不调用 Cloudflare API
npm run verify         # 不部署：构建 + 语法 + 47 个测试 + 真实 workerd 运行时验证
```

`npm run setup` 会自动：

1. 使用 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`，或复用已有 `wrangler login`；未登录时脚本自行拉起一次浏览器授权。
2. 查找或创建名为 `subox-worker-host` 的 KV namespace，把 id 注入 `.wrangler.generated.toml`（gitignore），**不改写仓库里的 `wrangler.toml` 模板**。
3. 生成强随机管理口令与 `BOOTSTRAP_TOKEN`，通过 `wrangler secret bulk` 上传为 Worker secrets；CI 中从 API Token 确定性派生，重复部署不会漂移。本地凭据保存在 gitignore 的 `.setup-credentials.json`。
4. 依次执行 `npm run build`、`node --check`、`npm test`、`scripts/runtime-check.mjs`。运行时脚本在真实 workerd 中验证 HTTP 反代、WebSocket 101 透传与 echo、内置超级口令、畸形配置 502。
5. 执行 `wrangler deploy`。
6. 在 API Token 权限允许时自动创建 Cloudflare WAF（内部路径拦截）、Rate Limiting（后台路径）与 Access 应用/策略；没有 Zone / IdP / API Token 时自动跳过这些可选增强，**代码内建的鉴权、CSRF、KV 分布式限流与 `/__subox/*` 403 已默认生效**。

GitHub Actions 的 `deploy.yml` 在仓库注入 Cloudflare 凭据后，每次 push 自动重跑以上流程；没有凭据时自动降级为本地验证，不会留下任何手工前置条件。

## 本地开发

```bash
npm run build     # 输出 result/_worker.js 与 result/_worker.js.sha256
npm run check     # 语法校验
npm test          # 47 个单元/回归测试（含分布式限流）
npm run test:runtime  # Miniflare/workerd：HTTP + WebSocket 101 + 超级口令
```

## 路由

| 路径 | 说明 |
| --- | --- |
| `/` | 未设置口令时为初始配置后台；已设置则按 `ROOT_REDIRECT_URL` 跳转或返回 204 |
| `/<管理口令>` | 配置后台（GET 页面 / POST 保存） |
| `/<订阅 token>` | Base64 聚合订阅（token 为 HMAC-SHA256 派生的 128 bit 值，显示在后台） |
| `/flush-cache` | 清洗缓存，口令通过 `X-Admin-Password` 头传递（兼容 `?pwd=`） |
| `/__internal_kv_cache/*`、`/__subox/*` | 一律 403 |
| `ROUTE_RULES` / `PROXY_HOSTNAME` | 反代到配置目标（最长标签优先） |

### 后台 POST 的校验要求

后台页面自动附带以下请求头；直接调用 POST 接口时由调用方带上：

```
Origin: https://<your-domain>
X-Requested-With: subox-admin
```

密码字段留空表示「不修改当前密码」。密码只允许 `A-Z a-z 0-9 . _ ~ ! * ' ( ) -`，避免「口令即路径」的后台不可达、URL 编码歧义或表达式注入。轮换天数范围 `0-365`；路由目标只允许 http/https，且禁止指向内网、元数据地址与 Worker 自身。

## 配置键（KV namespace `host`）

| 键 | 说明 |
| --- | --- |
| `ADMIN_PASSWORD` | 管理口令（由 setup 作为 secret 自动写入） |
| `BOOTSTRAP_TOKEN` | 首次配置额外令牌（由 setup 作为 secret 自动上传） |
| `SUB_EXPIRY_DAYS` | 订阅 token 轮换周期（0 = 不轮换） |
| `ROUTE_RULES` | 每行 `标签: 目标地址` |
| `PROXY_HOSTNAME` | 全局兜底反代目标 |
| `ROOT_REDIRECT_URL` | 根目录 302 跳转（仅 http/https） |
| `SUB_LIST_URLS` | 订阅源列表（最多 20 条） |
| `SUB_BLACKLIST` | 节点名黑名单，支持 `*` 通配，逗号/换行分隔 |
| `CONFIG_VERSION` | 由后台自动维护的配置版本标记 |
| `RATE:<sha256>` | 分布式限流计数（自动维护，键名不含原始 IP） |

## 限流与边缘防护

- `src/utils/ratelimit.js` 提供 **per-isolate 快速路径 + KV 跨 isolate/跨数据中心计数**，失败次数上限 8 次/分钟，成功后清零；KV 故障时 fail-open，避免存储抖动误伤正常请求。
- KV 键名使用 `RATE:` + scope/IP 的 SHA-256 摘要，不把原始 IP 写进键名；计数带 TTL 自动过期。
- `scripts/setup.mjs` 在 API Token 可用时自动创建 Zone WAF 与 `http_ratelimit` 规则；Access 仅在账户已配置 IdP 且能确定允许邮箱时自动创建，绝不生成过宽的 `everyone` 策略。
- 上述边缘规则是额外补偿，不是部署前置条件：没有 Cloudflare API Token 时代码级防护已完整生效。

## 缓存

- L1：进程内带 TTL 的内存缓存（配置 10s / 订阅 60s），有总字节上限。
- L2：`caches.open()` 的隔离命名空间 `subox:kv` / `subox:sub`，键带摘要后缀，不使用共享的 `caches.default`。
- Cloudflare 的 `cache.delete` 只在发起的数据中心生效，因此跨地区一致性依赖短 TTL（配置 30s / 订阅 120s）；可用 `Cache-Tag`（`subox-config` / `subox-sub`）做全局 purge。
- KV 读取失败不会写入缓存，避免负缓存把配置清空。
- 内部缓存路径恒为 403 且 `no-store`；自动 WAF 规则会再次在边缘拦截。

## 构建产物

- `.github/workflows/build.yml` → `result/_worker.zip` + `result/_worker.js.sha256`
- `.github/workflows/Obf.yml` → `result/_worker_obf.zip` + `result/_worker_obf.js.sha256`（可逆 Unicode 转义，非安全边界；混淆后再次跑 workerd 运行时验证）
- `.github/workflows/deploy.yml` → 凭据存在时自动部署，否则自动执行本地验证

所有 workflow 固定 action 的完整 commit SHA、Node 22、`npm ci`、测试、脚本语法校验、产物哈希比对；构建与混淆产物使用不同 zip 名，避免覆盖歧义。

## 安全审计

完整审计报告见 [`AUDIT.md`](./AUDIT.md)，修复与自动化记录见文末「后续修复」「自动化交付」章节。
