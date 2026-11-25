// obfuscator.js —— 轻量「Unicode 降维」混淆（ESM）
//
// 重要：\uXXXX 转义对 JS 解析器完全透明，任何解码器都能一行还原。
// 这是「降低肉眼/朴素 grep 可读性」的代码混淆，不是安全边界，
// 请勿用它来隐藏凭据或替代访问控制。
import fs from 'node:fs';
import path from 'node:path';

console.log('==========================================================');
console.log('  跨平台结构级混淆工具 v12 (Node.js ESM 版)');
console.log('  策略：关键词 + 全文件非 ASCII 字符 -> Unicode 转义');
console.log('  注意：可逆混淆，不构成安全保护');
console.log('==========================================================\n');

const targetFile = process.argv[2];
const explicitOutput = process.argv[3];
if (!targetFile) {
    console.error('[错误] 用法: node obfuscator.js <input.js> [output.js]');
    process.exit(1);
}

// 关键词里的正则元字符必须转义（原来 "771571215." 的 . 是通配符）
const KEYWORDS = [
    'shadowsocks', 'proxyip', 'singbox', 'Upgrade', 'CONNECT', 'trojan',
    'uuid', '771571215.', 'socks5', 'vless', 'vmess', 'clash', 'proxy',
    'xhttp', 'grpc', 'hysteria2', 'hysteria', 'tuic', 'anytls'
];
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp(`${KEYWORDS.map(escapeRegExp).join('|')}|[^\\x00-\\x7F]`, 'ig');

try {
    const resolvedPath = path.resolve(targetFile);
    if (!fs.existsSync(resolvedPath)) throw new Error(`文件不存在: ${resolvedPath}`);
    if (path.extname(resolvedPath).toLowerCase() !== '.js') {
        throw new Error('输入文件必须是 .js 后缀（避免旧版本原地覆盖源文件）');
    }

    const dir = path.dirname(resolvedPath);
    const base = path.basename(resolvedPath, '.js');
    // 修复：无论输入扩展名如何，输出都是独立文件，绝不覆盖输入
    const outPath = explicitOutput
        ? path.resolve(explicitOutput)
        : path.join(dir, `${base}_clean.js`);
    if (outPath === resolvedPath) {
        throw new Error('输出路径与输入路径相同，拒绝覆盖源文件');
    }

    const content = fs.readFileSync(resolvedPath, 'utf8');
    const escaped = content.replace(pattern, (match) => {
        let hexStr = '';
        for (let j = 0; j < match.length; j++) {
            hexStr += '\\u' + match.charCodeAt(j).toString(16).padStart(4, '0');
        }
        return hexStr;
    });

    fs.writeFileSync(outPath, escaped, 'utf8');
    console.log(`处理完成: ${path.basename(resolvedPath)} -> ${path.basename(outPath)}`);
    console.log(`输出大小: ${Buffer.byteLength(escaped, 'utf8')} bytes`);
} catch (error) {
    console.error(`[致命错误]: ${error.message}`);
    process.exit(1);
}
