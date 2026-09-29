// =================================================================
// === 订阅处理模块：src/handlers/sub.js ===
// =================================================================

import { getKV } from '../config.js';
import { fetchWithRetry, buildCombinedBlacklistRegex, isBlacklisted, safeBase64Encode } from '../utils/helpers.js';
import { detectAndProcess } from '../utils/detector.js';

/**
 * 处理订阅请求 (并发加速与黑名单极速过滤版)
 * @param {Request} request 请求对象
 * @param {object} env 环境变量
 * @param {string} subToken 匹配成功的订阅 Token
 * @returns {Promise<Response>}
 */
export async function handleSubscription(request, env, subToken) {
    const uniqueStrings = new Set();
    
    // 1. 【并发优化】并行读取订阅源列表和黑名单设置，消除串行 I/O 等待
    const [subListUrlsRaw, blacklistKeywordsRaw] = await Promise.all([
        getKV(env, "SUB_LIST_URLS"),
        getKV(env, "SUB_BLACKLIST")
    ]);

    const subListUrls = subListUrlsRaw || "";
    const blacklistRaw = blacklistKeywordsRaw || "";

    // 2. 预编译复合黑名单正则 (单正则扫描，避免多重嵌套循环)
    const combinedBlacklistRegex = buildCombinedBlacklistRegex(blacklistRaw);
        
    // 3. 提取有效 HTTP/HTTPS 链接并过滤注释行与空行
    let urls = [];
    try {
        urls = subListUrls.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#') && (line.startsWith('http://') || line.startsWith('https://')));
    } catch (e) {
        urls = [];
    }

    // 如果未配置任何有效订阅源，直接返回空 Base64 内容
    if (urls.length === 0) {
        return new Response(safeBase64Encode(""), { 
            status: 200,
            headers: { 
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-store'
            } 
        });
    }

    /**
     * 单个订阅源拉取与节点侦测任务
     */
    async function fetchData(url) {
        try {
            const response = await fetchWithRetry(url);
            if (!response) return;
            const data = await response.text();
            if (!data || !data.trim()) return;

            // 调用侦测模块解析节点并去重注入 uniqueStrings
            detectAndProcess(data, uniqueStrings);
        } catch (error) {
            // 单个订阅源异常静默放行，避免阻断其余有效源
        }
    }

    // 4. 并发拉取所有订阅源，Promise.allSettled 确保上游个别节点故障不影响全局拉取
    await Promise.allSettled(urls.map(url => fetchData(url)));

    // 5. 应用黑名单过滤逻辑
    let finalNodes;
    if (combinedBlacklistRegex) {
        finalNodes = [];
        for (const node of uniqueStrings) {
            if (node && !isBlacklisted(node, combinedBlacklistRegex)) {
                finalNodes.push(node);
            }
        }
    } else {
        finalNodes = Array.from(uniqueStrings).filter(Boolean);
    }

    // 6. 合并节点内容并进行 UTF-8 安全 Base64 编码
    const mergedContent = finalNodes.join("\n");
    const base64Str = safeBase64Encode(mergedContent);

    return new Response(base64Str, {
        status: 200,
        headers: { 
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}
