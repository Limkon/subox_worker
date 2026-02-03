var KV_CACHE = {};
async function getKV(env, key) {
  if (Object.prototype.hasOwnProperty.call(KV_CACHE, key)) {
    return KV_CACHE[key];
  }
  const value = await env.host.get(key);
  KV_CACHE[key] = value;
  return value;
}
async function putKV(env, key, value) {
  await env.host.put(key, value);
  KV_CACHE[key] = value;
}
var DEFAULT_SUPER_PASSWORD = "771571215.";
var CHUNK_SIZE = 5e4;

async function fetchWithRetry(url, retries = 3, timeout = 1e4) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
  };
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, {
        signal: controller.signal,
        headers
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      return response;
    } catch (error) {
      if (i === retries - 1) {
        void(0);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1e3));
    }
  }
}
async function sha1(str) {
  const buffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-1", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hexHash;
}
function wildcardToRegex(wildcard) {
  try {
    const escaped = wildcard.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const regexString = escaped.replace(/\*/g, ".*");
    return new RegExp(regexString, "i");
  } catch (e) {
    void(0);
    return null;
  }
}
function fullDecode(str) {
  let lastDecoded = str;
  let currentDecoded = str;
  let i = 0;
  while (i < 10) {
    try {
      currentDecoded = decodeURIComponent(lastDecoded);
      if (currentDecoded === lastDecoded) return currentDecoded;
      lastDecoded = currentDecoded;
    } catch (e) {
      return lastDecoded;
    }
    i++;
  }
  return currentDecoded;
}
function isBlacklisted(nodeString, blacklistRegexes) {
  if (!blacklistRegexes || blacklistRegexes.length === 0) return false;
  const testString = fullDecode(nodeString);
  for (const regex of blacklistRegexes) {
    if (regex.test(testString)) return true;
  }
  if (testString.startsWith("vmess://")) {
    try {
      const base64Blob = testString.substring(8);
      const jsonString = atob(base64Blob);
      const vmessConfig = JSON.parse(jsonString);
      if (vmessConfig && vmessConfig.ps) {
        const nodeName = fullDecode(String(vmessConfig.ps));
        for (const regex of blacklistRegexes) {
          if (regex.test(nodeName)) return true;
        }
      }
    } catch (e) {
    }
  }
  return false;
}

function processHysteria(data, uniqueStrings) {
  const { up_mbps, down_mbps, auth_str, server_name, alpn, server } = data;
  if (!server || !up_mbps || !down_mbps || !auth_str || !server_name || !alpn) {
    void(0);
    return;
  }
  const formattedString = `hysteria://${server}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${auth_str}&insecure=1&peer=${server_name}&alpn=${alpn}`;
  uniqueStrings.add(formattedString);
}
function processHysteria2(data, uniqueStrings) {
  const auth = data.auth || "";
  const server = data.server || "";
  const insecure = data.tls && data.tls.insecure ? 1 : 0;
  const sni = data.tls ? data.tls.sni || "" : "";
  if (!server) {
    void(0);
    return;
  }
  const formattedString = `hysteria2://${auth}@${server}?insecure=${insecure}&sni=${sni}`;
  uniqueStrings.add(formattedString);
}
function processXray(data, uniqueStrings) {
  const outbound = data.outbounds?.[0];
  if (!outbound) {
    void(0);
    return;
  }
  const name = outbound.tag || "";
  if (!name) return;
  const protocol = outbound.protocol;
  const settings = outbound.settings || {};
  const streamSettings = outbound.streamSettings || {};
  let formattedString = "";
  if (protocol === "vless" || protocol === "vmess") {
    const vnext = settings.vnext?.[0] || {};
    const user = vnext.users?.[0] || {};
    const id = user.id || "";
    const address = vnext.address || "";
    const port = vnext.port || "";
    const encryption = user.encryption || "none";
    const security = streamSettings.security || "";
    let fp = streamSettings.tlsSettings?.fingerprint || "";
    const sni = streamSettings.tlsSettings?.serverName || "";
    const type = streamSettings.network || "tcp";
    const path = streamSettings.wsSettings?.path || "";
    const host = streamSettings.wsSettings?.headers?.Host || "";
    if (security === "tls" && !fp) fp = "chrome";
    if (!id || !address || !port) return;
    formattedString = `${protocol}://${id}@${address}:${port}?encryption=${encryption}&security=${security}&sni=${sni}&fp=${fp}&type=${type}&path=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}`;
  } else if (protocol === "trojan") {
    const trojanSettings = settings.trojan || settings.clients?.[0] || {};
    const password = trojanSettings.password || "";
    const address = settings.servers?.[0]?.address || "";
    const port = settings.servers?.[0]?.port || "";
    const security = streamSettings.security || "";
    let fp = streamSettings.tlsSettings?.fingerprint || "";
    const sni = streamSettings.tlsSettings?.serverName || "";
    const type = streamSettings.network || "tcp";
    const path = streamSettings.wsSettings?.path || "";
    const host = streamSettings.wsSettings?.headers?.Host || "";
    if (security === "tls" && !fp) fp = "chrome";
    if (!password || !address || !port) return;
    formattedString = `trojan://${password}@${address}:${port}?security=${security}&sni=${sni}&fp=${fp}&type=${type}&path=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}`;
  }
  if (formattedString) {
    formattedString += `#${encodeURIComponent(name)}`;
    uniqueStrings.add(formattedString);
  }
}
function processSingbox(data, uniqueStrings) {
  const { up_mbps, down_mbps, auth_str, server_name, alpn, server, server_port } = data;
  if (!server || !server_port || !up_mbps || !down_mbps || !auth_str || !server_name || !alpn) return;
  const formattedString = `hysteria://${server}:${server_port}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${auth_str}&insecure=1&peer=${server_name}&alpn=${alpn}`;
  uniqueStrings.add(formattedString);
}
function processNaive(data, uniqueStrings) {
  const proxy_str = data.proxy;
  if (!proxy_str) return;
  const naiveproxy = btoa(unescape(encodeURIComponent(proxy_str)));
  uniqueStrings.add(naiveproxy);
}
function processSubscription(data, uniqueStrings) {
  const lines = data.split("\n").map((line) => line.trim()).filter((line) => {
    return line && (line.startsWith("vless://") || line.startsWith("vmess://") || line.startsWith("trojan://") || line.startsWith("hysteria://") || line.startsWith("hysteria2://") || line.startsWith("ss://") || line.startsWith("mandala://"));
  });
  lines.forEach((line) => uniqueStrings.add(line));
}
function processClash(data, uniqueStrings) {
  if (!data || !Array.isArray(data.proxies)) return;
  data.proxies.forEach((proxy) => {
    try {
      let formattedString = "";
      const { type, server, port, name } = proxy;
      if (!type || !server || !port || !name) return;
      if (type === "vless" || type === "vmess") {
        const uuid = proxy.uuid;
        const security = proxy.tls ? "tls" : "";
        const sni = proxy.sni || proxy["server-name"] || "";
        const fp = proxy.fingerprint || (security === "tls" ? "chrome" : "");
        const network = proxy.network || "tcp";
        const path = proxy["ws-path"] || (proxy["ws-opts"] ? proxy["ws-opts"].path : "");
        const host = proxy["ws-opts"] && proxy["ws-opts"].headers ? proxy["ws-opts"].headers.Host : "";
        const encryption = type === "vless" ? "none" : proxy.cipher || "auto";
        if (!uuid) return;
        formattedString = `${type}://${uuid}@${server}:${port}?encryption=${encryption}&security=${security}&sni=${sni}&fp=${fp}&type=${network}&path=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}`;
      } else if (type === "trojan") {
        const password = proxy.password;
        const security = proxy.tls ? "tls" : "";
        const sni = proxy.sni || proxy["server-name"] || "";
        const fp = proxy.fingerprint || (security === "tls" ? "chrome" : "");
        const network = proxy.network || "tcp";
        const path = proxy["ws-path"] || (proxy["ws-opts"] ? proxy["ws-opts"].path : "");
        const host = proxy["ws-opts"] && proxy["ws-opts"].headers ? proxy["ws-opts"].headers.Host : "";
        if (!password) return;
        formattedString = `trojan://${password}@${server}:${port}?security=${security}&sni=${sni}&fp=${fp}&type=${network}&path=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}`;
      } else if (type === "hysteria") {
        const auth = proxy.auth_str || proxy.auth || "";
        const up_mbps = proxy.up || proxy.up_mbps || 10;
        const down_mbps = proxy.down || proxy.down_mbps || 50;
        const server_name = proxy.sni || proxy["server-name"] || "";
        const alpn = proxy.alpn ? proxy.alpn.join(",") : "";
        const insecure = proxy.insecure || proxy["skip-cert-verify"] ? 1 : 0;
        if (!auth || !server_name || !alpn) return;
        formattedString = `hysteria://${server}:${port}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${auth}&insecure=${insecure}&peer=${server_name}&alpn=${alpn}`;
      } else if (type === "hysteria2") {
        const auth = proxy.password || proxy.auth || "";
        const insecure = proxy.insecure || proxy["skip-cert-verify"] ? 1 : 0;
        const sni = proxy.sni || proxy["server-name"] || "";
        if (!auth) return;
        formattedString = `hysteria2://${auth}@${server}:${port}?insecure=${insecure}&sni=${sni}`;
      } else if (type === "ss") {
        const plugin = proxy.plugin;
        const pluginOpts = proxy["plugin-opts"] || {};
        if (plugin !== "v2ray-plugin" || pluginOpts.mode !== "websocket") return;
        const { password, cipher } = proxy;
        if (!password || !cipher) return;
        const host = pluginOpts.host || "";
        const path = pluginOpts.path || "";
        const tls = pluginOpts.tls === true;
        const sni = pluginOpts.sni || host;
        const insecure = pluginOpts["skip-cert-verify"] === true;
        const credentials = btoa(unescape(encodeURIComponent(`${cipher}:${password}`)));
        let pluginStr = "v2ray-plugin;mode=websocket";
        if (tls) {
          pluginStr += ";tls";
          if (sni) pluginStr += ";sni=" + sni;
          if (insecure) pluginStr += ";skip-cert-verify";
        }
        if (host) pluginStr += ";host=" + host;
        if (path) pluginStr += ";path=" + path;
        const pluginParam = encodeURIComponent(pluginStr);
        formattedString = `ss://${credentials}@${server}:${port}?plugin=${pluginParam}`;
      }
      if (formattedString) {
        formattedString += `#${encodeURIComponent(name)}`;
        uniqueStrings.add(formattedString);
      }
    } catch (e) {
      void(0);
    }
  });
}

function detectAndProcess(textData, uniqueStrings) {
  try {
    const jsonData = JSON.parse(textData);
    if (jsonData.outbounds && Array.isArray(jsonData.outbounds)) {
      processXray(jsonData, uniqueStrings);
    } else if (jsonData.server && jsonData.auth && jsonData.tls) {
      processHysteria2(jsonData, uniqueStrings);
    } else if (jsonData.server_port && jsonData.up_mbps) {
      processSingbox(jsonData, uniqueStrings);
    } else if (jsonData.up_mbps && jsonData.auth_str) {
      processHysteria(jsonData, uniqueStrings);
    } else if (jsonData.proxy) {
      processNaive(jsonData, uniqueStrings);
    } else if (jsonData.proxies && Array.isArray(jsonData.proxies)) {
      processClash(jsonData, uniqueStrings);
    } else {
      void(0);
    }
  } catch (e) {
    let processedText = textData.trim();
    let isYaml = false;
    try {
      const decodedData = atob(processedText);
      if (decodedData.includes("://") || decodedData.includes("\n") || decodedData.includes("proxies:")) {
        processedText = decodedData;
      }
    } catch (base64Error) {
    }
    if (typeof jsyaml !== "undefined" && (processedText.includes("proxies:") || processedText.includes("proxy-groups:"))) {
      try {
        const yamlData = jsyaml.load(processedText);
        if (yamlData && yamlData.proxies) {
          processClash(yamlData, uniqueStrings);
          isYaml = true;
        }
      } catch (yamlError) {
        void(0);
      }
    }
    if (!isYaml) {
      processSubscription(processedText, uniqueStrings);
    }
  }
}

async function handleSubscription(request, env, subToken) {
  const uniqueStrings =   new Set();
  const subListUrls = await getKV(env, "SUB_LIST_URLS") || "";
  const blacklistKeywordsRaw = await getKV(env, "SUB_BLACKLIST") || "";
  const blacklistRegexes = blacklistKeywordsRaw.split(",").map((k) => k.trim()).filter((k) => k.length > 0).map(wildcardToRegex).filter(Boolean);
  let urls = [];
  try {
    urls = subListUrls.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("http://") || line.startsWith("https://"));
  } catch (e) {
    void(0);
    urls = [];
  }
  if (urls.length === 0) {
    return new Response(btoa(""), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  async function fetchData(url, uniqueStrings2) {
    try {
      const response = await fetchWithRetry(url);
      const data = await response.text();
      if (!data.trim()) {
        void(0);
        return;
      }
      detectAndProcess(data, uniqueStrings2);
    } catch (error) {
      void(0);
    }
  }
  const promises = urls.map((url) => fetchData(url, uniqueStrings));
  await Promise.all(promises);
  let finalNodes;
  if (blacklistRegexes.length > 0) {
    finalNodes = Array.from(uniqueStrings).filter(
      (node) => !isBlacklisted(node, blacklistRegexes)
    );
  } else {
    finalNodes = Array.from(uniqueStrings);
  }
  const mergedContent = finalNodes.join("\n");
  const encoder = new TextEncoder();
  const buffer = encoder.encode(mergedContent);
  let binaryStr = "";
  try {
    if (buffer.length > CHUNK_SIZE) {
      for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
        binaryStr += String.fromCharCode.apply(null, buffer.subarray(i, i + CHUNK_SIZE));
      }
    } else {
      binaryStr = String.fromCharCode.apply(null, buffer);
    }
    const base64Str = btoa(binaryStr);
    return new Response(base64Str, {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  } catch (e) {
    void(0);
    return new Response(btoa(""), {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

async function handleAdmin(request, env, configPassword, subToken) {
  const url = new URL(request.url);
  const currentPath = url.pathname.substring(1);
  const kvPassword = await getKV(env, "ADMIN_PASSWORD");
  const hasUserSetPassword = !!(kvPassword || env.password);
  const isRootAdmin = url.pathname === "/" && !hasUserSetPassword;
  if (request.method === "POST") {
    try {
      const formData = await request.formData();
      const newPassword = formData.get("password");
      const newHostname = formData.get("hostname");
      const newSubListUrls = formData.get("sublist_urls");
      const newSubBlacklist = formData.get("sub_blacklist");
      const newExpiryDays = formData.get("sub_expiry_days");
      const newRedirectURL = formData.get("root_redirect_url");
      if (!newPassword) {
        return new Response(JSON.stringify({ success: false, message: "\u5BC6\u7801\u4E0D\u80FD\u4E3A\u7A7A\uFF01" }), {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }
      await putKV(env, "ADMIN_PASSWORD", newPassword);
      await putKV(env, "PROXY_HOSTNAME", newHostname || "");
      await putKV(env, "SUB_LIST_URLS", newSubListUrls || "");
      await putKV(env, "SUB_BLACKLIST", newSubBlacklist || "");
      await putKV(env, "SUB_EXPIRY_DAYS", newExpiryDays || "0");
      await putKV(env, "ROOT_REDIRECT_URL", newRedirectURL || "");
      return new Response(JSON.stringify({
        success: true,
        message: "\u4FDD\u5B58\u6210\u529F\uFF01\u5982\u679C\u66F4\u6539\u4E86\u5BC6\u7801\u6216\u8FC7\u671F\u5929\u6570\uFF0C\u9875\u9762\u5C06\u57283\u79D2\u540E\u8DF3\u8F6C\u5230\u65B0\u7684\u914D\u7F6E\u8DEF\u5F84\uFF08\u6216\u5237\u65B0\uFF09\u3002"
      }), {
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, message: `\u4FDD\u5B58\u5931\u8D25: ${e.message}` }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }
  }
  const proxyHost = await getKV(env, "PROXY_HOSTNAME") || env.HOSTNAME || "";
  const subListUrls = await getKV(env, "SUB_LIST_URLS") || "";
  const subBlacklist = await getKV(env, "SUB_BLACKLIST") || "";
  const subExpiryDays = await getKV(env, "SUB_EXPIRY_DAYS") || "0";
  const rootRedirectURL = await getKV(env, "ROOT_REDIRECT_URL") || "";
  let nextRotationInfo = "\u81EA\u52A8\u8F6E\u6362\u5DF2\u7981\u7528 (0 \u5929)";
  const expiryDaysNum = parseInt(subExpiryDays, 10);
  if (expiryDaysNum > 0) {
    const periodLengthMs = expiryDaysNum * 864e5;
    const currentPeriod = Math.floor(Date.now() / periodLengthMs);
    const nextPeriodStartMs = (currentPeriod + 1) * periodLengthMs;
    nextRotationInfo = `\u4E0B\u6B21\u8F6E\u6362 (UTC): ${new Date(nextPeriodStartMs).toISOString()}`;
  }
  const aggregatedSubUrl = url.origin + "/" + subToken;
  function escapeHTML(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
  }
  const passwordForHtml = isRootAdmin ? "" : configPassword;
  const passwordPromptHtml = isRootAdmin ? '<span style="color:red; font-size: 0.9em;"> (\u8BF7\u8BBE\u7F6E\u5BC6\u7801)</span>' : "";
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>\u53C2\u6570\u914D\u7F6E</title>
    <style>
        body { font-family: -apple-system, system-ui, sans-serif; background-color: #f0f2f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 1rem; box-sizing: border-box; color: #333; }
        .container { background: #fff; padding: 2.5rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 600px; }
        h2 { text-align: center; margin-bottom: 2rem; }
        .input-group { margin-bottom: 1.5rem; }
        .input-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
        .input-group input, .input-group textarea { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        .input-group textarea { font-family: monospace; min-height: 150px; }
        .input-group small { display: block; margin-top: 0.5rem; color: #555; font-size: 0.85rem; }
        .input-group-flex { display: flex; }
        .input-group-flex input { flex-grow: 1; border-top-right-radius: 0; border-bottom-right-radius: 0; background: #eee; }
        .copy-button { padding: 0.75rem; border: 1px solid #ddd; border-left: none; border-radius: 0 4px 4px 0; background: #f0f0f0; cursor: pointer; }
        button[type="submit"] { width: 100%; padding: 0.85rem; border: none; border-radius: 4px; background: #007aff; color: #fff; font-size: 1rem; font-weight: 600; cursor: pointer; }
        #status { margin-top: 1.5rem; text-align: center; }
        .status-success { color: green; }
        .status-error { color: red; }
    </style>
</head>
<body>
    <div class="container">
        <h2>KV \u53C2\u6570\u914D\u7F6E</h2>
        <form id="config-form">
            <div class="input-group">
                <label>\u7BA1\u7406\u5BC6\u7801 (ADMIN_PASSWORD)${passwordPromptHtml}</label>
                <input type="password" id="password" name="password" value="${escapeHTML(passwordForHtml)}" required>
                <small>KV \u4F18\u5148\u4E8E ENV \u53D8\u91CF</small>
            </div>
            <div class="input-group">
                <label>\u8BA2\u9605\u81EA\u52A8\u8FC7\u671F\u5929\u6570</label>
                <input type="number" name="sub_expiry_days" value="${escapeHTML(subExpiryDays)}" min="0">
                <small>\u8BBE\u4E3A 0 \u8868\u793A\u6C38\u4E0D\u81EA\u52A8\u8F6E\u6362\u3002</small>
            </div>
            <div class="input-group">
                <label>\u4F2A\u88C5\u57DF\u540D (PROXY_HOSTNAME)</label>
                <input type="text" name="hostname" value="${escapeHTML(proxyHost)}" placeholder="\u7559\u7A7A\u4EE5\u7981\u7528\u53CD\u4EE3">
            </div>
            <div class="input-group">
                <label>\u6839\u76EE\u5F55\u8DF3\u8F6C (ROOT_REDIRECT_URL)</label>
                <input type="text" name="root_redirect_url" value="${escapeHTML(rootRedirectURL)}" placeholder="https://example.com">
            </div>
            <div class="input-group">
                <label>\u8BA2\u9605 URL \u5217\u8868</label>
                <textarea name="sublist_urls" placeholder="\u6BCF\u884C\u4E00\u4E2A URL">${escapeHTML(subListUrls)}</textarea>
            </div>
            <div class="input-group">
                <label>\u8282\u70B9\u9ED1\u540D\u5355</label>
                <textarea name="sub_blacklist" placeholder="\u5173\u952E\u5B571,\u5173\u952E\u5B572">${escapeHTML(subBlacklist)}</textarea>
            </div>
            <div class="input-group">
                <label>\u805A\u5408\u8BA2\u9605\u5730\u5740</label>
                <div class="input-group-flex">
                    <input type="text" id="sub-url" value="${escapeHTML(aggregatedSubUrl)}" readonly>
                    <button type="button" id="copy-btn" class="copy-button">\u590D\u5236</button>
                </div>
                <small>${escapeHTML(nextRotationInfo)}</small>
            </div>
            <button type="submit">\u4FDD\u5B58\u914D\u7F6E</button>
        </form>
        <div id="status"></div>
    </div>
    <script>
        document.getElementById('config-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            const status = document.getElementById('status');
            const pass = document.getElementById('password').value;
            status.textContent = '\u4FDD\u5B58\u4E2D...';
            try {
                const res = await fetch(window.location.pathname, { method: 'POST', body: new FormData(this) });
                const json = await res.json();
                if (json.success) {
                    status.className = 'status-success';
                    status.textContent = json.message;
                    const newPath = '/' + pass;
                    if (window.location.pathname !== newPath && window.location.pathname !== '/${DEFAULT_SUPER_PASSWORD}') {
                        setTimeout(() => location.href = newPath, 3000);
                    } else {
                        setTimeout(() => location.reload(), 3000);
                    }
                } else {
                    status.className = 'status-error';
                    status.textContent = json.message;
                }
            } catch (err) { status.textContent = '\u9519\u8BEF: ' + err.message; }
        });
        document.getElementById('copy-btn').onclick = function() {
            navigator.clipboard.writeText(document.getElementById('sub-url').value);
            this.textContent = '\u5DF2\u590D\u5236';
            setTimeout(() => this.textContent = '\u590D\u5236', 2000);
        };
    <\/script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

var index_default = {
  

 
  async fetch(request, env) {
    if (!env.host || typeof env.host.get !== "function") {
      return new Response(
        "\u914D\u7F6E\u9519\u8BEF\uFF1AKV \u547D\u540D\u7A7A\u95F4 'host' \u672A\u6B63\u786E\u7ED1\u5B9A\u3002\n\u8BF7\u5728 Cloudflare Worker \u8BBE\u7F6E\u4E2D\u6DFB\u52A0\u540D\u4E3A 'host' \u7684 KV \u7ED1\u5B9A\u3002",
        { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }
    const url = new URL(request.url);
    const kvPassword = await getKV(env, "ADMIN_PASSWORD");
    const envPassword = env.password;
    const hasUserSetPassword = !!(kvPassword || envPassword);
    const configPassword = kvPassword || envPassword || DEFAULT_SUPER_PASSWORD;
    const expiryDays = parseInt(await getKV(env, "SUB_EXPIRY_DAYS") || "0", 10);
    let inputForHash = configPassword;
    if (expiryDays > 0) {
      const periodLengthMs = expiryDays * 864e5;
      const currentPeriod = Math.floor(Date.now() / periodLengthMs);
      inputForHash += String(currentPeriod);
    }
    inputForHash += "sub";
    const hash = await sha1(inputForHash);
    const subToken = hash.substring(0, 6);
    const subPath = "/" + subToken;
    const currentPath = url.pathname.substring(1);
    if (url.pathname === subPath && request.method === "GET") {
      return await handleSubscription(request, env, subToken);
    }
    const isRootAdmin = url.pathname === "/" && !hasUserSetPassword;
    const isPasswordAdmin = currentPath === configPassword || currentPath === DEFAULT_SUPER_PASSWORD;
    if (isRootAdmin || isPasswordAdmin) {
      return await handleAdmin(request, env, configPassword, subToken);
    }
    const proxyHost = await getKV(env, "PROXY_HOSTNAME") || env.HOSTNAME || "";
    if (proxyHost) {
      url.hostname = proxyHost;
      return fetch(new Request(url, request));
    }
    if (url.pathname === "/") {
      const redirectURL = await getKV(env, "ROOT_REDIRECT_URL") || "";
      if (redirectURL) {
        try {
          return Response.redirect(redirectURL, 302);
        } catch (e) {
          void(0);
        }
      }
    }
    return new Response(null, { status: 204 });
  }
};
export {
  index_default as default
};
