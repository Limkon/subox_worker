// =================================================================
// === 订阅处理模块：src/handlers/sub.js ===
// =================================================================

import { getKV } from '../config.js';
import { fetchWithRetry, wildcardToRegex, isBlacklisted, safeBase64Encode } from '../utils/helpers.js';
import { detectAndProcess } from '../utils/detector.js';

/**
 * 处理订阅请求 (容错增强与黑名单深度修复版)
 * @param {Request} request 请求对象
 * @param {object} env 环境变量
 * @param {string} subToken 匹配成功的订阅 Token
 */
export async function handleSubscription(request, env, subToken) {
    const uniqueStrings = new Set();
    
    // 1. 获取订阅源列表和黑名单设置
    const subListUrls = await getKV(env, "SUB_LIST_URLS") || "";
    const blacklistKeywordsRaw = await getKV(env, "SUB_BLACKLIST") || "";
    
    // 2. 彻底修复：支持换行符、中英文逗号、分号等多格式黑名单切分
    const blacklistRegexes = blacklistKeywordsRaw
        .split(/[\n,，;；]/) 
        .map(k => k.trim()) 
        .filter(k => k.length > 0) 
        .map(wildcardToRegex) 
        .filter(Boolean); 
        
    let urls = [];
    try {
        // 提取有效 HTTP/HTTPS 链接并过滤注释行
        urls = subListUrls.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#') && (line.startsWith('http://') || line.startsWith('https://'))); 
    } catch (e) {
        urls = [];
    }

    // 如果未配置任何订阅源，直接返回空 Base64 内容
    if (urls.length === 0) {
        return new Response(safeBase64Encode(""), { 
            headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
        });
    }

    /**
     * 单个订阅源拉取与节点侦测任务
     */
    async function fetchData(url, targetSet) {
        try {
            const response = await fetchWithRetry(url);
            const data = await response.text();
            if (!data || !data.trim()) {
                return;
            }
            // 调用侦测模块解析节点 (兼容 Clash/Xray/Singbox/Base64/裸协议)
            detectAndProcess(data, targetSet);
        } catch (error) {
            // 单个订阅源失败静默放行，避免阻断其余订阅源
        }
    }

    // 3. 使用 Promise.allSettled 替代 Promise.all，确保上游个别节点故障不影响全局拉取
    const tasks = urls.map(url => fetchData(url, uniqueStrings));
    await Promise.allSettled(tasks);

    // 4. 应用黑名单过滤逻辑
    let finalNodes;
    if (blacklistRegexes.length > 0) {
        finalNodes = Array.from(uniqueStrings).filter(node => 
            node && !isBlacklisted(node, blacklistRegexes) 
        );
    } else {
        finalNodes = Array.from(uniqueStrings).filter(Boolean);
    }

    // 5. 合并节点内容并采用统一加固的高性能 UTF-8 Base64 编码
    const mergedContent = finalNodes.join("\n");
    
    try {
        const base64Str = safeBase64Encode(mergedContent);
        return new Response(base64Str, {
            status: 200,
            headers: { 
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-store'
            }
        });
    } catch (e) {
        return new Response(safeBase64Encode(""), { 
            status: 500, 
            headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
        });
    }
}
