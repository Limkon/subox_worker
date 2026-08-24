// obfuscator.js
const fs = require('fs');
const path = require('path');

console.log('==========================================================');
console.log('  跨平台结构级混淆工具 v11 (Node.js 重构版)');
console.log('  策略：关键词 + 全文件非 ASCII(中文) 无差别 Unicode 转义');
console.log('==========================================================\n');

const targetFile = process.argv[2];
if (!targetFile) {
    console.error('[错误] 请提供要混淆的 .js 文件路径！');
    process.exit(1);
}

const keywords = ['shadowsocks','proxyip','singbox','Upgrade','CONNECT','trojan','uuid','771571215.','socks5','vless','vmess','clash','proxy','xhttp','grpc'];
// 正则匹配：关键字 或 非 ASCII 字符 (如中文)
const pattern = new RegExp(keywords.join('|') + '|[^\\x00-\\x7F]', 'ig');

try {
    const resolvedPath = path.resolve(targetFile);
    let content = fs.readFileSync(resolvedPath, 'utf8');

    // 执行 Unicode 转义替换
    content = content.replace(pattern, function(match) {
        let hexStr = '';
        for(let j = 0; j < match.length; j++) {
            let hex = match.charCodeAt(j).toString(16);
            while(hex.length !== 4) {
                hex = '0' + hex;
            }
            hexStr += '\\u' + hex;
        }
        return hexStr;
    });

    // 遵循原有逻辑：输出为 _clean.js
    const outPath = resolvedPath.replace(/\.js$/, '_clean.js');
    fs.writeFileSync(outPath, content, 'utf8');
    
    console.log(`处理完成：已启用 Unicode 降维混淆，输出文件 -> ${path.basename(outPath)}`);
} catch (error) {
    console.error(`[致命错误]: ${error.message}`);
    process.exit(1);
}
