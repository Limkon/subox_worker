# subox_worker 深度代码审计报告

| 项目 | 内容 |
| --- | --- |
| 审计日期 | 2026-11-25 |
| 分支 / 基线 | `arena/9cfee734-subox-worker` @ `2b7cc9a3` (master) |
| 仓库规模 | 17 个文件、约 2148 行（含 vendor 的 js-yaml 101 行 / 40 KB）+ 1 个二进制产物 |
| 审计对象 | `src/**`（Cloudflare Worker）、`build.js` / `build.js-` / `cleaner.js` / `obfuscator.js`、`.github/workflows/*.yml`、`package.json`、`result/_worker.zip` |
| 结论 | **不建议按现状部署到生产**。存在 1 个通用硬编码后门、1 个可远程触发的正则灾难性回溯、以及缓存失效架构缺陷导致的"改密码不生效"。 |
| 本次改动 | **未修改任何源码/配置**（`git status` 干净）；本报告为唯一新增文件。 |

---

## 1. 审计范围与方法

1. **全量人工阅读**：8 个源文件 + 4 个构建/工具脚本 + 2 个 workflow + `package.json` + `README.md`。
2. **产物一致性验证**：用 `esbuild@0.24.0` 按 `build.js` 参数从 `src/` 重新构建，与已提交的 `result/_worker.zip` 内 `_worker.js` 做逐行 diff。
3. **供应链比对**：从 npm 拉取 `js-yaml@4.1.0` 官方发行版，与 vendor 的 `src/utils/js-yaml.min.js` 做 AST 归一化比对 + 行为差分测试。
4. **工具链实测**：实际运行 `obfuscator.js` 与 `cleaner.js`，对输出做 `node --check`，并做语义等价性回放。
5. **动态 PoC**：在 Node 22 中 mock `caches.default` / `env.host` (KV) / `ctx.waitUntil` / `Request` / `Response`，直接 import 构建产物并回放 7 类请求（后台、订阅、清缓存、异常配置等）。
6. **平台语义核对**：对照 Cloudflare 官方 Cache API / WebSocket / Workers Cache 文档验证架构假设。

---

## 2. 风险总览

| 编号 | 严重度 | 问题 | 位置 |
| --- | --- | --- | --- |
| S-01 | **致命** | 硬编码通用超级管理员口令 `771571215.`，公开源码即可完全接管任意部署 | `config.js:42`, `index.js:349,364,388`, `admin.js:195`, `obfuscator.js:16` |
| S-02 | **致命** | L1 内存缓存无 TTL；`clearAllCaches` 只清当前 isolate / 当前数据中心；KV 读失败被负缓存 1 小时 → 改密码/吊销长期不生效 | `index.js:107-153, 252-279, 398` |
| S-03 | **致命** | 黑名单通配符正则可被单个订阅源触发指数级回溯（ReDoS），实测 100 字符耗 2 s、200 字符 > 20 s | `helpers.js:124-146,175-193`, `sub.js:29,77` |
| S-04 | **高危** | 全新部署 `/` 为无认证后台；`/flush-cache?pwd=` 明文口令 + 无限速 + 可区分响应 = 口令爆破预言机；POST 无 CSRF 防护 | `index.js:344-356,387-402`, `admin.js:25-68` |
| S-05 | **高危** | 把管理员口令 / 节点凭据写入 `caches.default`（与 zone `fetch` 缓存共享的命名空间），键为可猜测的公开 URL 且标记 `public` | `index.js:116-143, 224-232` |
| S-06 | **高危** | 订阅 token 仅 24 bit 且由口令 SHA-1 派生；默认口令下 token 固定为 `79a7a8`，全网可算 | `index.js:367-377`, `helpers.js:97` |
| S-07 | **高危** | 配置项零校验：畸形 `PROXY_HOSTNAME` 使全站请求抛异常；超大 `SUB_EXPIRY_DAYS` 使后台页抛 `RangeError` | `index.js:446,505`, `admin.js:94-99` |
| S-08 | **高危** | 反代目标完全可控（SSRF / 开放代理 / 开放重定向），回环保护仅比较主机名相等，可绕过 | `index.js:284-326, 444-516` |
| S-09 | **中高危** | 反代请求头处理错误：未过滤逐跳头、`X-Forwarded-Proto` 写成目标协议、透传可伪造的 `XFF` 与 `CF-*` | `index.js:289-304` |
| S-10 | **中高危** | 口令放在 URL 路径 + 明文回填到 `<input value>`；POST 并发写无事务；含 `?`/`#` 的口令导致后台自我锁定 | `index.js:388`, `admin.js:28-53,139,194` |
| S-11 | **中危** | vendor 的 js-yaml 4.1.0 被字符损坏（4 个控制字符被替换），且无校验和/锁文件可验证 | `src/utils/js-yaml.min.js:50` |
| S-12 | **中危** | CI 供应链：action 引用 `@main`、`node-version: 'x'`、无 lockfile 用 `npm install`、`contents: write` + `git push`、两个 workflow 产出同名但内容不同的产物 | `.github/workflows/*.yml`, `package.json` |
| S-13 | **中危** | 构建链混乱/死代码：`build.js-` + `cleaner.js` 从未被调用；`obfuscator.js` 对非 `.js` 文件原地覆盖；Unicode 转义只是可逆的"障眼法" | `build.js*`, `cleaner.js`, `obfuscator.js` |
| S-14 | **中危** | L1 内存上限计算错误（50 × 3 MB = 150 MB > Worker 128 MB）；`waitUntil` 拒绝未捕获；反代无超时 | `index.js:24-25, 143,232,265,275,318` |
| S-15 | **中危** | 缺少 wrangler 配置、`main` 指向不存在的 `dist/`、无 `.gitignore`、无测试、13 处空 `catch` | `package.json`, 全仓库 |
| S-16 | **中危** | 路由按配置顺序首条命中（非最长前缀）；Referer 路由可被任意客户端伪造 | `index.js:419-442` |
| S-17 | **低-中危** | 订阅解析丢节点/格式错误：仅一层 Base64 递归、JSON 数组不处理、Xray/Clash 丢弃多种协议、`https://` 的 naive 节点未加前缀等 | `detector.js`, `protocols/index.js` |

---

## 3. 已验证"清白"的部分（重要基线）

### 3.1 已提交产物与源码一致，无夹带

```
result/_worker.zip  sha256 = 03cc31b6...d8d2fc
  └─ _worker.js     sha256 = 57250bcb...3c52247  (105,085 B)
从 src/ 重新构建     sha256 = 39904a98...d5e086e  (105,313 B)
diff = 40 行，全部是 esbuild 的路径注释（// ../../home/user/... vs // src/...）
       与 1 个内部变量名（src_default vs index_default，因 entryPoint 用绝对路径所致）
```

结论：**构建产物中没有源码之外的注入代码、外联域名、`eval`/`Function` 动态执行或数据外发逻辑**。源码里的"后门"是显式写进去的（S-01），不是产物被投毒。

### 3.2 混淆器 / 清洗器当前不会破坏本仓库产物

- `obfuscator.js` 输出通过 `node --check`，在 7 组 mock 请求上与未混淆版本**逐字节相同**（含后台 HTML、订阅内容、403/204/异常路径）。
- `cleaner.js` 输出同样通过语法检查且行为一致；但它是**死代码**（`package.json` 的 `build` 指向不含 cleaner 插件的 `build.js`），因此线上产物仍保留 2 处 `console.*` 和 8 行 `// src/...` 注释。
- `js-yaml@4.1.0` 的 `load()` 使用 `DEFAULT_SCHEMA`（安全模式），**不存在 YAML 反序列化 RCE**。
- `escapeHTML()` 对 `& < > ' "` 的转义在当前的双引号属性上下文中是足够的；后台模板没有发现可直接利用的存储型 XSS（但见 S-10 的口令明文回填）。

### 3.3 已提交 zip 并未经过混淆

`Obf.yml` 声称调用 `obfuscator.js`，但 zip 内 `_worker.js` 中 `vless://` 明文出现 4 次、`console.` 2 次、`// src/` 8 次，`\uXXXX` 仅 14 处（来自 js-yaml 自身的 `\u2028` 等）。说明**最后一次提交的是 `build.yml` 的产物**；两个 workflow 向同一个 `result/_worker.zip` 写不同内容，部署方无法从仓库判断自己拿到的是哪一个（S-12）。

---

## 4. 致命 / 高危发现（逐项）

### S-01 硬编码通用超级口令（致命）

```js
// src/config.js:41-42
// 默认超级密码 (保留超级管理员安全后门)
export const DEFAULT_SUPER_PASSWORD = "771571215.";
```

```js
// src/index.js:349, 364, 388
providedPwd === realPwd || providedPwd === DEFAULT_SUPER_PASSWORD   // /flush-cache
const configPassword = kvPassword || envPassword || DEFAULT_SUPER_PASSWORD;
normalizedPath === configPassword || normalizedPath === DEFAULT_SUPER_PASSWORD  // 后台
```

- 该常量在**公开仓库**中，且被 `obfuscator.js:16` 专门列为混淆关键词——这说明作者知道它敏感，但 `\u0037\u0037\u0031...` 对任何 JS 解析器/解码器都是明文，属于安全剧场。
- 无论用户是否设置自己的口令，`/771571215.` 与 `/flush-cache?pwd=771571215.` 永远有效，**无法关闭**。
- 影响：任意部署的后台完全接管 → 改 `SUB_LIST_URLS`/`PROXY_HOSTNAME`/`ROOT_REDIRECT_URL`/节点黑名单 → 钓鱼、SSRF、节点替换、流量劫持。

PoC（mock 环境实测）：

```
GET /771571215.                       -> 200 (完整后台 HTML)
GET /flush-cache?pwd=771571215.       -> 200
GET /p%3Fss%23word (口令含特殊字符) -> 204，但 /771571215. 仍 200
```

**修复**：删除该常量及所有 `=== DEFAULT_SUPER_PASSWORD` 分支；首次部署用一次性 setup token / 强制从环境变量或 Cloudflare Access 注入初始口令；口令用 `crypto.subtle` 做 HMAC 校验而非路径相等。

### S-02 缓存架构导致"配置永不刷新 / 吊销失效"（致命）

三重叠加：

1. **L1 无 TTL**：`kvMemoryCache` / `responseMemoryCache` 只在条目数 ≥ 50 时按插入顺序淘汰 10%（`index.js:41-52`），长生命周期 isolate 中一个值可以永久驻留。
2. **L2 TTL 过长 + 负缓存**：KV 值写入 `caches.default` 时带 `public, max-age=60, s-maxage=3600`（`index.js:140`），即 1 小时；而 `getKV()` 出错返回 `null` 后被 `|| ""` 变成空串并照常缓存 1 小时（`index.js:132-143`）——**一次 KV 抖动会把该数据中心的配置"清空"一小时**。
3. **清理只是局部的**：`clearAllCaches()` 只 `clear()` 当前 isolate 的 Map/Set，用 `ctx.waitUntil(edgeCache.delete(...))` 删 L2；`knownCacheKeys` 本身也是 per-isolate 的，其他 isolate 根本不知道要删哪些 URL。Cloudflare 文档明确：Cache API 内容**不跨数据中心复制**、`cache.delete` **只在发起它的那个数据中心生效** ([Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/), [How the Cache works](https://developers.cloudflare.com/workers/reference/how-the-cache-works/))。因此注释里"多地区自动同步""终极双重清洗"是不成立的。

PoC（模拟从控制台/另一 isolate 直接改 KV）：

```
ADMIN_PASSWORD = secret1 -> GET /secret1        = 200   (写入 L1/L2)
外部把 KV 改为 secret2   -> GET /secret1        = 200   ← 旧口令仍可进后台
                            GET /secret2        = 204   ← 新口令反而无效
```

**修复**：
- 给 L1 每个条目加 `expireAt`（KV 建议 5–30 s，订阅响应建议 60 s），读时校验；或干脆去掉 L1，只留 KV 自身缓存。
- 配置类数据**不要**放进 `caches.default`；把 TTL 降到 ≤ 10 s，或写入时带版本号 `configVersion`，每次请求用 KV 直读版本号校验。
- 用 `Cache-Tag` + 全站 purge（或 KV 版本号）做跨数据中心失效，而不是遍历 per-isolate 的 `knownCacheKeys`。
- 缓存**只缓存成功读取**，`getKV` 返回 `null` 时直接回源重试，不写缓存。
- `ctx.waitUntil()` 全部挂 `.catch()`；`cache.put` 在响应过大 / 不可缓存时会返回 413 ([docs](https://developers.cloudflare.com/workers/runtime-apis/cache/))。

### S-03 黑名单 ReDoS（致命）

`buildCombinedBlacklistRegex()` 把 `*` 转成 `.*` 后用 `|` 拼接成单条正则（`helpers.js:142`），`isBlacklisted()` 又对**来自外部订阅源、且经 `fullDecode()` 三重解码**的节点串执行 `.test()`（`helpers.js:178,182`）。

PoC（本机 Node 22，规则 `a*a*a*a*a*b`）：

```
compiled regex: (?:a.*a.*a.*a.*a.*b)
  node len  50 ->   114.2 ms   (blacklisted=false)
  node len 100 ->  1995.0 ms
  node len 200 ->  >20 s（进程被 timeout 杀掉）
```

一个恶意/被污染的订阅源只需返回一行约 200 字符的节点名，就能让 Worker CPU 打满并触发超时；配合 `/flush-cache` 可反复触发。`handleSubscription()` 又对**所有订阅 URL 无并发上限**地 `Promise.allSettled`（`sub.js:70`），放大效果明显。

**修复**：
- 不要用 `.*` 拼正则：把关键字当**字面子串**用 `String.includes()`（大小写归一后）判断，通配改用非回溯的分段匹配；
- 或彻底改用 `RE2` 风格/线性算法；至少限制单条规则长度、规则数、`*` 个数，并对节点串长度设硬上限（如 4 KB）。
- 对订阅源数量、单响应体大小（`Content-Length` + 流式读取上限）、总耗时设限。

### S-04 认证面整体薄弱（高危）

- `isRootAdmin = (pathname === '/' && !hasUserSetPassword)`（`index.js:387`）：**全新部署的 `/` 是任何人可 POST 的后台**，公网扫描器可在管理员之前完成接管。
- `/flush-cache?pwd=...` 把口令放进 query（浏览器历史、`Referer`、CDN/源站日志），用 `===` 比较，无速率限制、无锁定，403/200 可区分，且它绕过了 L1 缓存**直读 KV**（`index.js:347`）——是比后台更干净的**口令爆破预言机**。
- `handleAdmin()` 的 POST 分支（`admin.js:25-68`）**自身不做任何身份校验**，靠调用方按路径鉴权；没有 CSRF token、不校验 `Origin`/`Sec-Fetch-Site`，而 `multipart/form-data` 恰好是跨站表单可以发出的编码类型。
- 后台 GET 虽然由 `index.js:393` 加了 `no-store`，POST 的 JSON 响应没有。

**修复**：改用 `Authorization: Bearer` 或签名 Cookie（HttpOnly/Secure/SameSite=Strict）+ 恒定时间比较 + CSRF token + `Origin` 校验 + 基于 KV/Durable Object 的失败计数限流；初始设置必须要求一次性引导凭据。

### S-05 秘密写入共享 CDN 缓存命名空间（高危）

```js
// index.js:117-143 / 224-232
const dummyUrlStr = `${origin}/__internal_kv_cache/${key}`;
new Response(val, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=3600' } });
ctx.waitUntil(edgeCache.put(cacheKeyReq, l2CacheResponse));
```

`caches.default` 是**与 `fetch()` 子请求共享的默认缓存**；`caches.open(name)` 才提供隔离命名空间 ([How the Cache works](https://developers.cloudflare.com/workers/reference/how-the-cache-works/))。这里把 `ADMIN_PASSWORD`、`SUB_LIST_URLS`、节点黑名单、以及聚合订阅内容（含 UUID/密码）以 `public` 缓存到形如 `/__internal_kv_cache/ADMIN_PASSWORD` 的**可猜测公开 URL** 上。`index.js:333` 的 403 拦截只在请求真正到达 Worker 时有效；启用 Workers Cache（缓存位于 Worker 之前、命中时 Worker 不执行）后该防线不再位于最前面 ([Workers Cache 配置](https://developers.cloudflare.com/workers/cache/configuration/))；同 zone 的其他 Worker/子请求也能通过 `cache.match()` 读到这些条目。

**修复**：`caches.open('subox:private:<hash>')` 隔离命名空间；缓存键用不可猜测的随机后缀或 HMAC；配置类值不进共享缓存；订阅响应缓存标记 `private`/移除 `public`，只保留 `s-maxage`；假定缓存内容可被同 zone 任何代码读取，不要放明文口令。

### S-06 订阅 token 熵不足（高危）

```js
// index.js:367-377
const hash = await sha1(configPassword + String(currentPeriod) + "sub");
const subToken = hash.substring(0, 6);   // 24 bit
```

- 24 bit ≈ 1677 万种，在线枚举可行且无任何限速；弱口令可离线字典推导。
- 默认口令下 `sha1("771571215.sub").slice(0,6) = 79a7a8`，**所有未改口令的部署共享同一个公开订阅地址**。
- 轮换只改 `subPath`，旧 URL 的 L2 缓存既不删除也不失效，且 `knownCacheKeys` 只记录当前 isolate。

**修复**：`HMAC-SHA256(secret, "sub|" + period)` 取 ≥ 128 bit（或直接用 `crypto.randomUUID` 存 KV）；token 与口令解耦；轮换时按 tag/前缀 purge；对订阅路径加限速。

### S-07 配置零校验 → 全站 500/1101（高危）

PoC（mock 回放，异常直接冒泡到 `fetch()` 顶层，无兜底 try/catch）：

```
SUB_EXPIRY_DAYS = 999999999999
  GET /771571215. -> RangeError: Invalid time value   (admin.js:99, new Date(NaN).toISOString())
PROXY_HOSTNAME = "https://"
  GET /x         -> TypeError: Invalid URL            (index.js:505, new URL("https://"))
```

后台页面一旦因为超大天数崩溃，管理员**无法再通过 UI 改回来**（只剩 S-01 的超级口令路径，同样会崩）。`sub_expiry_days` 是非校验的自由文本；`ROOT_REDIRECT_URL` 只包了 `try/catch` 后静默吞掉；`ROUTE_RULES` / `PROXY_HOSTNAME` 的解析同样没有 try/catch。

**修复**：所有 KV 值在写入时校验（数值范围 0–365、URL 必须含合法 hostname、只允许 http/https、禁止私网段/元数据地址/用户自定义白名单外目标），在 `fetch()` 顶层加统一 try/catch 返回 500 JSON，并保留一个"紧急重置"入口。

### S-08 反代 / SSRF / 开放重定向（高危）

- `ROUTE_RULES` 与 `PROXY_HOSTNAME` 允许任意 host:port，`executeProxy()` 只有一条 `targetUrl.hostname === currentHostname` 的回环判断（`index.js:285`）：`example.com.`（尾点）、指向同一 Worker 的其他自定义域名 / CNAME、`workers.dev` 别名都能绕过，形成自我递归代理。
- 目标字符串未做 URL 规范化校验，`targetHost` 可含 `@` / `#` / `?`；`parseRouteRules()` 用第一个 `:` 分割且不校验结果。
- `Response.redirect(redirectURL, 302)`（`:515`）对任意外部 URL 放行 → 开放重定向钓鱼。
- 无目标白名单、无私网/链路本地地址拦截、无 fetch 超时（`:318-319`）。

**修复**：目标白名单 + `new URL()` try/catch + 规范化 hostname（去尾点/小写/punycode）+ 禁止内网/回环/元数据地址 + `AbortSignal.timeout()` + 递归深度标记头（如 `X-Proxy-Hops`）防环。

### S-09 / S-10 请求头与口令处理（中高危）

```js
// index.js:289-304
newHeaders.set('Host', targetUrl.host);                       // Workers 通常由 URL 决定，可能被忽略/覆盖，需实测
newHeaders.set('X-Forwarded-Proto', targetUrl.protocol...);  // 错：应是「客户端」协议 url.protocol
newHeaders.set('X-Forwarded-For', existingXFF ? `${existingXFF}, ${clientIP}` : clientIP); // 透传可伪造的 XFF
newHeaders.delete('keep-alive');                            // 错：逐跳头是 Connection，不是 keep-alive
```

- `Connection` / `Transfer-Encoding` / `TE` / `Proxy-Authorization` 及 `CF-*` 内部头被原样转发给上游（信息泄露 + 请求走私风险）；非 WS 请求若客户端自带 `Upgrade` 也会透传。
- WebSocket 分支只 `set('Upgrade'/'Connection')` 后直接 `return await fetch(...)`，既不检查 `resp.webSocket` 是否存在，也不建立 `WebSocketPair` 做双向桥接 / `accept()`；官方示例要求显式处理返回的 socket ([Using the WebSockets API](https://developers.cloudflare.com/workers/examples/websockets/))。此处**需在真实 Worker 上实测**"全流 WebSocket 透传"是否成立，不能只凭 HTTP 层测试。
- 口令作为 URL 路径会进历史/日志/`Referer`；`admin.js:139` 又把 `configPassword` 明文回填到 `<input type="password" value="...">`，页面源码/DOM 里就是明文；`admin.js:195` 把超级口令硬编码进内联 JS。
- `Promise.all` 并发写 7 个 KV 键（`:45-53`）无事务，部分失败会留下半套配置。
- 口令含 `?`/`#`/`%` 时，`encodeURIComponent` 生成的路径与 `normalizedPath` 不相等 → 后台不可达（PoC T2 中 `/p%3Fss%23word` 返回 204），只能靠超级口令进入。

---

## 5. 中危 / 工程化发现

### S-11 vendor 的 js-yaml 4.1.0 已被字符损坏

```
官方 npm js-yaml@4.1.0/dist/js-yaml.min.js   39,430 B  sha256 45dc3dd0...
仓库 src/utils/js-yaml.min.js                40,628 B  sha256 ef90e4f3...
```

体积差异来自"美化换行 + 手写 UMD wrapper + ESM 适配层"。把两边 factory body 用 esbuild 归一化后比对，**只有 `function te(e)`（YAML 双引号转义表）不同**：

| 转义 | 官方 4.1.0 | 仓库版本 | 实测 `load('a: "\\a"')` |
| --- | --- | --- | --- |
| `\a` | `\x07` BEL | `" "` | `{"a":" "}` vs `{"a":"\u0007"}` |
| `\e` | `\x1B` ESC | `" "` | `{"b":" "}` vs `{"b":"\u001b"}` |
| `\N` | `\x85` NEL | `"…"` (U+2026) | `{"c":"…"}` vs `{"c":"\u0085"}` |
| `\_` | `\xA0` NBSP | `" "` | `{"d":" "}` vs `{"d":"\u00a0"}` |

这是典型的 cp1252/文本清洗把控制字符替换掉的编码损伤（0x85→U+2026 是 cp1252 映射）。影响：含这些转义的 Clash YAML 节点名/字段被静默改写；且**仓库内没有校验和、没有 lockfile、没有来源说明**，无法证明 vendor 文件未被改动。另外末尾的 ESM 适配层 `const jsyaml = globalThis.jsyaml || {}` 依赖 UMD 走 else 分支；一旦打包环境提供了 `exports`/`module`，`jsyaml` 会变成 `{}`，YAML 解析会**静默返回 0 个节点**（`detector.js:85-92`）。

**修复**：改为 `npm i js-yaml@4.1.0` + 提交 `package-lock.json`，构建时直接 `import { load } from 'js-yaml'`；若必须 vendor，附 `sha256` 与来源版本并在 CI 校验。

### S-12 CI / 供应链

| 问题 | 位置 | 风险 |
| --- | --- | --- |
| `uses: actions/checkout@main` / `setup-node@main` | 两个 yml | 引用可变分支（注释却写"升级到 v6/v5"），可被引用的上游改动劫持；应固定 tag + 完整 SHA |
| `node-version: 'x'` | 两个 yml | 每次跑在不同 Node 大版本上，构建不可复现 |
| 无 `package-lock.json` + `npm install` | 两个 yml | `^0.24.0` / `^3.91.0` 会拉新版本；结合 `permissions: contents: write` 与 `git push`，恶意依赖可把任意 `_worker.zip` 推回仓库 |
| `git commit ... \|\| echo "No changes to commit"` | 两个 yml | 吞掉 commit 失败（含冲突/钩子错误） |
| 只有 `workflow_dispatch`，无 PR/push 触发 | 两个 yml | 无测试、无 lint、无构建校验、无产物差异检查 |
| `build.yml` 与 `Obf.yml` 写同一个 `result/_worker.zip` | 两个 yml | 产物内容取决于"谁最后跑"；当前提交的是**未混淆**版本（见 3.3） |
| `zip` 产物直接提交到仓库 | 两个 yml | 二进制不可 review；应改用 artifact / release / 带签名与校验和 |

### S-13 构建工具链

- `build.js`（实际使用）与 `build.js-`（带 `cleanerPlugin`）几乎重复；`cleaner.js` 只被 `build.js-` 引用 → **注释与日志清除从未生效**，产物里仍有 `console.error` 和源码路径注释（泄露目录结构）。
- `cleaner.js` 是手写词法分析器，在本仓库上恰好能跑通，但存在结构性缺陷：模板字符串 `${...}` 内的 `//` 会被当注释删除、嵌套反引号会提前结束字符串；`isRegexStart()` 对 `) /re/` 之类场景会把正则误判为除法；`checkConsoleType()` 对 `console.log.call(...)` 会替换成 `(()=>{}).call(...)` 改变语义。建议直接用 esbuild `minify`/`drop: ['console']` + `legalComments`，删掉手写工具。
- `obfuscator.js` 实测缺陷：
  - `outPath = resolvedPath.replace(/\.js$/, '_clean.js')`：对 `.mjs` / 无扩展名文件 **outPath === 输入路径，直接原地覆盖源文件**且无任何告警（已实测 `cmp` 失败）。
  - 关键词未做正则转义，`771571215.` 中的 `.` 是通配符；`i` 标志会匹配到无关文本。
  - `\uXXXX` 转义对 JS 解析器完全透明，一行解码即可还原，**不构成任何保护**，反而让文件从 105,313 B 膨胀到 109,242 B（+3.7%）。
  - 该脚本只处理字符串/标识符层面，若未来出现 `String.raw` 标签模板、正则 flags 等位置，转义会改变语义。
- `build.js:24` 的 `.catch(() => process.exit(1))` 吞掉全部错误信息；`ctx.watch()` 的 rejection 未处理。

### S-14 资源与错误处理

- `MAX_MEMORY_ITEMS = 50` × `MAX_BODY_SIZE = 3 MB` = **150 MB**，超过标准 Worker 的 128 MB 内存上限；且 `inFlightResponsePromises` 期间会额外持有 ArrayBuffer。应按**总字节数**设上限（如 16 MB）而非条目数。
- `knownCacheKeys` Set 无上限（虽然只订阅路径会写入，影响较小）。
- `ctx.waitUntil(edgeCache.put/delete(...))` 未挂 `.catch()`；`cache.put` 对过大/不可缓存响应返回 413，会变成未处理的 Promise rejection。
- 反代 `fetch()` 无超时；上游挂起会占满 Worker 时长。
- 全仓库 13 处 `catch (e) {}` 空吞异常，加上 `fetch` 顶层无 try/catch，故障几乎不可观测。

### S-15 工程配置缺失

- 无 `wrangler.toml` / `wrangler.jsonc`：`npm run deploy` 必然失败；且缺少 `compatibility_date`、KV 命名空间 `host` 绑定、`password` 变量声明——**仓库无法独立部署**。
- `package.json` 的 `"main": "dist/_worker.js"` 指向不存在的目录（实际输出 `result/_worker.js`）。
- 无 `.gitignore`（`node_modules/`、`result/_worker.js`、`result/_worker_clean.js` 会被误提交）、无 LICENSE（虽然声明 ISC）、README 仅 `# subox_worker` 14 字节、无任何测试。

### S-16 / S-17 路由与订阅解析

- 规则按配置顺序首条命中（`index.js:420-425`），未做最长前缀排序：若 `api` 写在 `api/v2` 前面，`/api/v2/x` 会被错误路由到 `api` 目标。
- Referer 回退路由（`index.js:427-442`）只校验同源，任何客户端都能用 `curl -e` 伪造 Referer 强制命中某条规则。
- `detector.js` 只允许一层 Base64 递归（`:111` 传 `false`）；JSON 数组型订阅不处理；`processXray` / `processClash` 只转换 vmess/vless/trojan/hysteria2/ss，Xray 的 shadowsocks/tuic/wireguard outbound 与 Clash 的 tuic/ssr 等被静默丢弃。
- `processNaive()`（`:203`）对已是 `https://` 的值原样输出，客户端需要 `naive+https://` 前缀；`vmess` 转换把 `security=reality` 写进 `tls` 字段，多数客户端不认；协议前缀大小写敏感；`wildcardToRegex()` 与 `handleSubscription` 的 `subToken` 参数是死代码。
- `handleSubscription()` 对外部响应无大小限制、无 Content-Type 校验、无订阅源数量上限。

---

## 6. 修复路线图

### P0（部署前必须完成）
1. 删除 `DEFAULT_SUPER_PASSWORD` 及所有相关分支；改为 HMAC/Cookie + 限流 + CSRF；全新部署强制一次性引导凭据（S-01、S-04）。
2. 给 L1 加 TTL / 直接移除 L1；KV 读失败不缓存；跨中心失效改用版本号或 `Cache-Tag` purge；`waitUntil` 全部加 `.catch()`（S-02、S-05、S-14）。
3. 用字面子串匹配替换通配符正则，并对订阅源数量/响应体/节点长度设硬上限（S-03）。
4. 所有配置写入时校验 + `fetch()` 顶层兜底 try/catch（S-07）。
5. 订阅 token 改为 ≥128 bit HMAC，默认口令不再产生可预测 token（S-06）。

### P1
6. 目标白名单 + 规范化回环检测 + 私网拦截 + 超时；重写请求头过滤（`Connection`/`CF-*`/`X-Forwarded-Proto`/`XFF`）；实测 WebSocket 透传并按官方 `WebSocketPair` 模式补齐（S-08、S-09）。
7. 口令移出 URL 与 HTML value，POST 加 `Origin` 校验与事务化写入（S-10）。
8. 用 `caches.open()` 隔离命名空间，缓存键不可猜测，秘密不入共享缓存（S-05）。
9. 规则按 key 长度降序匹配；Referer 仅作辅助且加签名/白名单（S-16）。

### P2
10. 用 npm 依赖 + lockfile 替换 vendor js-yaml，CI 校验校验和（S-11）。
11. 固定 action SHA、`npm ci`、固定 Node 版本、PR 触发的 build/lint/test、产物校验和比对、删除重复 `build.js-` / `cleaner.js` / `obfuscator.js` 或明确其定位（S-12、S-13）。
12. 补 `wrangler.toml`、`.gitignore`、LICENSE、README（部署/绑定说明）、单元测试与 PoC 回归用例（S-15）。
13. 完善协议转换覆盖与大小写/数组订阅兼容（S-17）。

---

## 7. 附录：复现数据

**A. 产物一致性**
```
$ sha256sum result/_worker.zip /tmp/audit/_worker.js /tmp/audit/rebuilt.js
03cc31b63d6672aed996e9bd8cefcf3a79d0a5d6c8ed2cb3acd5eac488d8d2fc  result/_worker.zip
57250bcbdf09243fcb156376fa98f090db511ad499abc2d3907fd1e573c52247  _worker.js
39904a98a5d086736051727d0584e1849693bccc47d82288a998d15543407d6e  rebuilt.js
$ diff rebuilt.js _worker.js | wc -l   # 40，全部为路径注释 + 1 个内部变量名
```

**B. 动态 PoC 输出**
```
T1 L1 has no TTL:
  /secret1 first request:                 200
  /secret1 after external KV change:     200   <- 旧口令仍可进后台
  /secret2 (new password):               204   <- 新口令无效
T2 special chars in password:
  /p%3Fss%23word:                        204   <- 后台不可达
  /771571215. (super password):          200
T4 default subscription token:           79a7a8
ReDoS: len 50 -> 114.2 ms / len 100 -> 1995.0 ms / len 200 -> >20 s (killed)
Config crash: SUB_EXPIRY_DAYS=999999999999 -> RangeError: Invalid time value
              PROXY_HOSTNAME="https://"  -> TypeError: Invalid URL
Plain vs obfuscated vs cleaned: 7/7 scenarios identical, 0 diffs
```

**C. 未覆盖 / 建议补充**
- 未部署到真实 Cloudflare Worker，因此 `Host` 头覆盖行为、WebSocket 101 透传、`caches.default` 在 `*.workers.dev` 上的可用性（官方文档称只保证自定义域名下 Cache API 功能完整）需在预发布环境实测。
- 未做 `wrangler` / `esbuild` 依赖的 CVE 扫描（仓库无 lockfile，无法锁定被审计的版本）。
- 未对线上 KV 数据、Cloudflare Access/防火墙规则、Zone 级 Cache Rules 做配置审计——这些会改变 S-05 / S-08 的实际可利用性。

---

## 8. 后续修复记录（2026-11-25，第二次提交）

用户要求：**超级管理员口令 `771571215.` 保持不变，其余问题全部修复并优化**。
因此 **S-01 被有意保留**（口令值、后台路径 `/771571215.`、`/flush-cache` 凭据均继续有效且不可关闭）；
其风险与缓解措施写进了 `README.md` 与 `wrangler.toml`。其余条目处理如下。

### 8.1 逐项状态

| 编号 | 状态 | 处理方式 |
| --- | --- | --- |
| S-01 | **按要求保留，风险已自动化补偿** | 常量与全部鉴权分支未改动；`npm run setup` / CI 自动创建独立强口令与 `BOOTSTRAP_TOKEN`、KV 分布式限流、CSRF，并在 API Token 可用时自动配置 WAF / Rate Limiting / Access；不再要求部署者手工配置 |
| S-02 | 已修复 | `createTTLCache` 带 TTL + 总字节上限；KV 读取失败不缓存；L2 TTL 从 3600s 降到 30s（订阅 1800s→120s）；`waitUntil` 全部带 catch；`Cache-Tag` 支持全局 purge；文档注明 `cache.delete` 只在本数据中心生效 |
| S-03 | 已修复 | `buildBlacklistMatcher` 改为「按 `*` 分段 + 顺序 indexOf」的线性匹配，彻底移除正则；新增源数量、并发、响应体、节点数与节点长度上限。回归测试：20,000 字符节点 < 500 ms（旧实现 200 字符 > 20 s） |
| S-04 | 已修复并升级为分布式（保留初始设置入口） | `constantTimeEqual` + `createHybridRateLimiter`（per-isolate 快速路径 + KV 跨数据中心计数，8 次/分钟）消除 `/flush-cache` 爆破预言机；后台 POST 增加 `Origin`/`Sec-Fetch-Site` + `X-Requested-With` 的 CSRF 校验；`BOOTSTRAP_TOKEN` 由 setup 自动上传并保护首次设置；KV 故障时 fail-open |
| S-05 | 已修复 | 改用 `caches.open('subox:kv' / 'subox:sub')` 隔离命名空间（不再用 `caches.default`），缓存键带 SHA-256 摘要后缀且路径 `/__subox/*` 恒为 403；回归测试断言 `caches.default` 调用次数为 0 |
| S-06 | 已修复 | 订阅 token 改为 `HMAC-SHA256(secret, period)` 取 128 bit（32 位 hex），不再可枚举；默认口令下不再产生全网固定的 `79a7a8` |
| S-07 | 已修复 | 新增 `validateAdminForm` / `parseProxyTarget` / `safeRedirectUrl` 全量校验；`expiryDays` 夹逼到 0–365；`new URL` 全部包 try/catch；`fetch()` 顶层统一兜底 500。回归测试：畸形 `PROXY_HOSTNAME` 返回 502、超大天数后台仍 200 |
| S-08 | 已修复 | 目标解析统一走 `parseProxyTarget`：拒绝 userinfo / query/hash / 非 http(s) / 私网 / 元数据 / 尾点回环；新增 `X-Subox-Proxy-Hops` 防多层回环；`ROOT_REDIRECT_URL` 只允许 http(s) 绝对地址 |
| S-09 | 已修复 | 删除逐跳头、`CF-*`、`Host`；`X-Forwarded-Proto` 改用客户端协议；`XFF` 用 `CF-Connecting-IP` 覆盖而非拼接伪造值；新增 `X-Forwarded-Host`；非 WS 反代加 30s 超时；WS 增加 `resp.webSocket` 存在性校验 |
| S-10 | 已修复（路径式鉴权保留） | 后台不再把口令明文回填到 HTML；密码留空 = 不修改；拒绝会导致后台不可达的 `/ ? # %`；POST 加同源校验；写入前完成全部校验并附 `CONFIG_VERSION` |
| S-11 | 已修复 | 删除被字符损坏的 vendor `js-yaml.min.js`，改为 `js-yaml@4.1.0` npm 依赖 + `package-lock.json`；回归测试断言 `\a \e \N \_` 解析与官方一致 |
| S-12 | 已修复 | action 固定到完整 commit SHA（checkout v4.2.2 / setup-node v4.1.0）、Node 22、`npm ci`、PR 前可复用的 `npm test` + `npm run check` + 产物哈希比对；`git commit` 不再吞错误；两个 workflow 输出**不同文件名**的 zip，消除同名覆盖歧义 |
| S-13 | 已修复 | 删除重复的 `build.js-` 与手写 `cleaner.js`，改用 esbuild 原生 `minify` + `legalComments: 'eof'`；`build.js` 不再吞构建错误并输出 sha256；`obfuscator.js` 改为 ESM、关键词正则转义、**拒绝覆盖输入文件**、显式输出路径，并在注释里声明其可逆、非安全边界 |
| S-14 | 已修复 | 缓存按总字节上限（订阅 16MB / KV 2MB）而非 50×3MB；`knownCacheKeys` 有界；`waitUntilSafe` 统一兜底；反代超时；顶层 try/catch；空 catch 大幅减少，订阅失败记录 host（不泄露 URL token） |
| S-15 | 已修复 | 新增 `wrangler.toml` 模板、`.gitignore`、完整 `README.md`、`npm test`（47 个测试）、`npm run check` / `check:scripts` / `verify` / `test:runtime`、`scripts/setup.mjs` 与 `scripts/runtime-check.mjs`；`package.json` 修正 `main` 并统一 ESM |
| S-16 | 已修复 | `parseRouteRules` 按 key 长度降序（最长前缀优先）；非法规则跳过而不让整站抛异常；Referer 回退仍限同源 |
| S-17 | 已优化 | 支持多层 Base64 嵌套、JSON 数组型订阅；Xray 增加 shadowsocks；Clash 增加 tuic / hysteria v1；`naive+` 前缀补全；vmess 不再写出非法的 `tls=reality`；协议前缀大小写不敏感；节点数量/长度上限 |

### 8.2 验证结果

```
$ npm test
# tests 47 / # pass 47 / # fail 0 / # duration_ms ~400ms

$ npm run verify
  npm run build        → result/_worker.js (~80kb，原产物 105.1kb)
  npm run check        → 通过
  npm run check:scripts → setup.mjs / runtime-check.mjs / build.js / obfuscator.js 语法通过
  npm test             → 47/47
  npm run test:runtime → workerd: HTTP 200、WebSocket 101 + echo、超级口令 200、畸形配置 502
```

关键回归覆盖：

- `超级管理员口令 771571215. 保持不变且不可被用户口令关闭` —— 单元测试与真实 workerd 运行时均验证 `/771571215.`、`/flush-cache?pwd=771571215.` 仍返回 200。
- `KV 变更后缓存在 TTL 过期时自动收敛` —— 模拟外部改 KV，40s 后旧口令失效、新口令生效（原实现永久有效）。
- `/flush-cache 具备分布式限流` —— 连续错误口令后返回 429；新建 isolate 后仍能读到 KV 中的失败计数，成功后清零，KV 故障则 fail-open。
- `畸形 / 越界配置不再让整站或后台抛异常` —— 502 / 200，无 RangeError / Invalid URL。
- `订阅聚合：本地源 + 通配符黑名单，长节点不触发 ReDoS` —— 20,000 字符节点 < 3s。
- `黑名单: 正则灾难性回溯回归（20k 字符必须线性完成）` —— < 500 ms。
- `订阅 token 为 128 bit，且不再使用 caches.default`。
- `WebSocket 101 透传在真实 workerd 运行时可用` —— Miniflare 加载最终 `_worker.js`，上游返回 `WebSocketPair` 101，客户端 `accept()` 后收到 `echo:ping`。

### 8.3 无人工前置条件（自动化闭环）

用户明确要求 **「我不想手动处理」**，因此上一版列出的全部人工事项均已改为代码内建、脚本或 CI 自动化，不再作为交付前置条件：

1. **S-01 风险按用户要求保留，补偿已自动化**：`771571215.` 仍不可关闭；`npm run setup` / `deploy.yml` 自动生成独立强口令与 `BOOTSTRAP_TOKEN`、上传 Worker secrets、启用 KV 分布式限流与 CSRF，并在 API Token 权限允许时自动创建 WAF、Rate Limiting 与 Access 应用/策略。没有边缘 API 权限时，代码级防护仍默认生效。
2. **WebSocket 不再需要真实 Worker 人工实测**：`scripts/runtime-check.mjs` 用 `miniflare@3.20241106.1` / `workerd@1.20241106.1` 加载最终 bundle，验证 HTTP 200、WebSocket 101 + `echo:ping`、超级口令 200、畸形配置 502；该脚本已纳入 `npm run verify`、`build.yml`、`Obf.yml`（混淆后二次执行）与 `deploy.yml`。
3. **限流不再是 per-isolate 孤岛**：`src/utils/ratelimit.js` 把失败计数写入 KV（键名为 `RATE:` + 摘要，不含原始 IP），跨 isolate 生效；`tests/ratelimit.test.js` 覆盖跨重启、scope 隔离、KV 故障 fail-open 与隐私键名。Cloudflare Rate Limiting Rules 成为可选增强，不再是部署前置条件。
4. **KV id 占位符自动解析**：`scripts/setup.mjs` 通过 Cloudflare API 或 `wrangler kv:namespace list` 复用 `subox-worker-host`，不存在则自动创建，并写入 gitignore 的 `.wrangler.generated.toml`；仓库模板不被账号 id 污染。
5. **Workers Cache 前置风险已由代码与自动 WAF 兜底**：内部路径恒为 403 且 `no-store`，L2 使用隔离具名缓存；Token 可用时自动 WAF 规则在 Zone 边缘再次拦截 `/__subox/*` 与 `/__internal_kv_cache/*`，无需人工确认。

## 9. 自动化交付（2026-11-25，用户拒绝手工处理）

新增/改写：

| 文件 | 作用 |
| --- | --- |
| `scripts/setup.mjs` | 一键授权、KV 创建/复用、secret 生成与上传、验证、部署、WAF/Rate Limiting/Access 自动配置 |
| `scripts/runtime-check.mjs` | 真实 workerd 的 HTTP / WebSocket 101 / 超级口令 / 畸形配置运行时验证 |
| `src/utils/ratelimit.js` + `tests/ratelimit.test.js` | KV 分布式限流与 4 个回归测试 |
| `.github/workflows/deploy.yml` | 凭据存在时 push 自动部署；凭据缺失时自动降级为完整本地验证 |
| `.github/workflows/build.yml` / `Obf.yml` | 统一执行 `npm run verify`；混淆产物再跑一次 workerd 运行时验证 |
| `wrangler.toml` / `README.md` / `.gitignore` | 模板化配置、自动化文档、忽略临时配置与凭据文件 |

自动化策略：

- **凭据来源**：`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`（CI 由 GitHub Secrets 注入），或本地已有的 `wrangler login`；脚本未检测到登录态时自行拉起一次 `wrangler login`，不需要用户编辑 TOML 或执行 `wrangler secret put`。
- **幂等**：KV namespace 按固定标题查找/创建；管理凭据在 CI 中从 API Token 确定性派生；`secret bulk` 每次部署覆盖为当前派生值；重复运行不会漂移或重复创建 namespace。
- **安全降级**：没有 Zone / IdP / API Token 时跳过可选边缘规则，但不跳过代码内建的鉴权、CSRF、KV 分布式限流、内部路径 403；Access 不会创建过宽的 `everyone` 策略。
- **本会话环境**：未注入 Cloudflare 凭据，Arena 当前也没有 Cloudflare connector，因此没有伪造真实部署成功，也没有对远程账号做任何变更。已执行 `npm run setup -- --dry-run` 与 `npm run verify` 验证自动化脚本的本地路径；凭据由运行环境/CI 注入后，同一脚本会自动完成远程步骤，无需用户手填任何配置。

最终验证：`npm run verify` 通过（47/47 单元测试、脚本语法检查、真实 workerd HTTP/WS 运行时检查）；`npm run setup -- --dry-run` 通过；`wrangler deploy --dry-run -c .wrangler.generated.toml` 可解析配置；明文与混淆 bundle 的 smoke 行为一致；`result/_worker.zip` / `result/_worker.js.sha256` 已按最终源码重建并校验。

```
result/_worker.js       sha256 d76f134104d7871902e4fcabf5d33597e8d3345769d0871ffeffe41cfd5bdf6e
result/_worker.zip      sha256 ae9b877a9f92b1104af935d1f9c04b7b25037e2b380bd89a376dac8093d7f2ab
zip 内 _worker.js       与 _worker.js.sha256 一致（MATCH）
明文 / 混淆 smoke       identical: true
```
