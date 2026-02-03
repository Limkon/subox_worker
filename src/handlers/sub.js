// =================================================================
// === 订阅处理模块：src/handlers/sub.js ===
// =================================================================

import { getKV, CHUNK_SIZE } from '../config.js';
import { fetchWithRetry, wildcardToRegex, isBlacklisted } from '../utils/helpers.js';
import { detectAndProcess } from '../utils/detector.js';

/**
 * 处理订阅请求
 * @param {Request} request 请求对象
 * @param {object} env 环境变量
 * @param {string} subToken 匹配成功的订阅 Token
 */
export async function handleSubscription(request, env, subToken) {
    const uniqueStrings = new Set();
    
    // 获取订阅源列表和黑名单设置
    const subListUrls = await getKV(env, "SUB_LIST_URLS") || "";
    const blacklistKeywordsRaw = await getKV(env, "SUB_BLACKLIST") || "";
    
    // 将黑名单关键字转换为正则表达式
    const blacklistRegexes = blacklistKeywordsRaw
        .split(',') 
        .map(k => k.trim()) 
        .filter(k => k.length > 0) 
        .map(wildcardToRegex) 
        .filter(Boolean); 
        
    let urls = [];
    try {
        // 提取有效的 HTTP 链接
        urls = subListUrls.split('\n')
                         .map(line => line.trim())
                         .filter(line => line.startsWith('http://') || line.startsWith('https://')); 
    } catch (e) {
        console.log('Invalid SUB_LIST_URLS in KV, returning empty list.');
        urls = [];
    }

    // 如果没有配置订阅源，返回空内容
    if (urls.length === 0) {
         return new Response(btoa(""), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    /**
     * 获取并处理单个 URL 的数据
     */
    async function fetchData(url, uniqueStrings) {
        try {
            const response = await fetchWithRetry(url);
            const data = await response.text();
            if (!data.trim()) {
                console.log(`Empty response for ${url}`);
                return;
            }
            // 调用侦测模块解析节点
            detectAndProcess(data, uniqueStrings);
        } catch (error) {
            console.log(`Error processing ${url}: ${error.message}`);
        }
    }

    // 并行处理所有站点以提高速度
    const promises = urls.map(url => fetchData(url, uniqueStrings));
    await Promise.all(promises);

    // 应用黑名单过滤逻辑
    let finalNodes;
    if (blacklistRegexes.length > 0) {
        finalNodes = Array.from(uniqueStrings).filter(node => 
            !isBlacklisted(node, blacklistRegexes) 
        );
    } else {
        finalNodes = Array.from(uniqueStrings);
    }

    // 合并节点内容
    const mergedContent = finalNodes.join("\n");
    const encoder = new TextEncoder();
    const buffer = encoder.encode(mergedContent);
    
    let binaryStr = '';
    try {
        // 分块处理，防止超大数据导致堆栈溢出
        if (buffer.length > CHUNK_SIZE) {
            for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
                binaryStr += String.fromCharCode.apply(null, buffer.subarray(i, i + CHUNK_SIZE));
            }
        } else {
            binaryStr = String.fromCharCode.apply(null, buffer);
        }
        
        const base64Str = btoa(binaryStr);
        return new Response(base64Str, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });

    } catch (e) {
         console.log(`Error encoding base64: ${e.message}`);
         return new Response(btoa(""), { 
             status: 500, 
             headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
         });
    }
}
