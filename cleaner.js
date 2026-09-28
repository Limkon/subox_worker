/**
 * cleaner.js
 * 核心重构版：安全擦除注释与日志 (Neutralized Hijacking)
 * 功能：
 * 1. 彻底移除单行/多行注释，保留换行符防止 ASI 语法崩溃
 * 2. 精准识别 console.log/warn/error/info/debug，修复前导字符误判
 * 3. 将 console.xxx(...) 安全替换为 void Array(...)，保留表达式副作用与合法语法
 * 4. 完善正则表达式字面量解析（支持字符类 [...] 内斜杠识别）
 */

const fs = require('fs');

const STATE = {
    CODE: 0,
    STRING_SQ: 1,    // '...'
    STRING_DQ: 2,    // "..."
    STRING_TMP: 3,   // `...`
    REGEX: 4,        // /.../
    COMMENT_LINE: 5, // //...
    COMMENT_BLOCK: 6 // /*...*/
};

function isSpace(char) {
    return /\s/.test(char);
}

function isAlnum(char) {
    return /[a-zA-Z0-9_$]/.test(char);
}

function isRegexStart(text, idx) {
    let i = idx - 1;
    while (i >= 0 && isSpace(text[i])) i--;
    if (i < 0) return true;
    const last = text[i];
    if ("(=,:!&|?{};,[]*+-%<>^~".includes(last)) return true;
    
    if (isAlnum(last) || last === ')') {
        let end = i;
        while (i >= 0 && isAlnum(text[i])) i--;
        const word = text.substring(i + 1, end + 1);
        const keywords = ["return", "case", "throw", "delete", "void", "typeof", "await", "yield"];
        if (keywords.includes(word)) return true;
        return false;
    }
    return false;
}

function checkConsoleType(text, i, size) {
    // 检查前导字符：若紧跟字母、数字、_、$ 或点号 .，说明非独立 console 对象（如 myconsole 或 obj.console）
    if (i > 0) {
        const prev = text[i - 1];
        if (isAlnum(prev) || prev === '.') return { type: 0, len: 0 };
    }

    if (text.substring(i, i + 8) !== "console.") return { type: 0, len: 0 };
    
    const methods = ["log", "warn", "error", "info", "debug"];
    let matched = false;
    let mLen = 0;
    
    for (const method of methods) {
        if (text.substring(i + 8, i + 8 + method.length) === method) {
            const nextChar = text[i + 8 + method.length];
            if (!isAlnum(nextChar)) { 
                matched = true;
                mLen = 8 + method.length;
                break;
            }
        }
    }
    
    if (!matched) return { type: 0, len: 0 };
    
    let j = i + mLen;
    while (j < size && isSpace(text[j])) j++;
    
    if (j < size && text[j] === '(') return { type: 1, len: mLen };
    return { type: 2, len: mLen };
}

function processCode(input) {
    const size = input.length;
    const output = []; 
    let state = STATE.CODE;
    let i = 0;
    let inCharClass = false; // 正则表达式内部字符类 [...] 标志

    while (i < size) {
        const c = input[i];
        const next = (i + 1 < size) ? input[i + 1] : '';

        // --- 正常模式 ---
        if (state === STATE.CODE) {
            const { type: cType, len: mLen } = checkConsoleType(input, i, size);
            
            if (cType === 1) { 
                // 安全替换 console.xxx 为 void Array，保留后续括号与参数副作用
                const rep = "void Array";
                for (const char of rep) output.push(char);
                i += mLen;
                continue; 
            } else if (cType === 2) { 
                // 属性引用（如 const fn = console.log）替换为空函数
                const rep = "(()=>{})";
                for (const char of rep) output.push(char);
                i += mLen;
                continue;
            }

            if (c === '\'') { state = STATE.STRING_SQ; output.push(c); }
            else if (c === '"') { state = STATE.STRING_DQ; output.push(c); }
            else if (c === '`') { state = STATE.STRING_TMP; output.push(c); }
            else if (c === '/') {
                if (next === '/') {
                    state = STATE.COMMENT_LINE;
                    i++; 
                } else if (next === '*') {
                    state = STATE.COMMENT_BLOCK;
                    i++; 
                } else {
                    if (isRegexStart(input, i)) {
                        state = STATE.REGEX;
                        inCharClass = false;
                    }
                    output.push(c);
                }
            } else {
                output.push(c);
            }
        }
        else if (state === STATE.STRING_SQ) {
            output.push(c);
            if (c === '\\') { if (next) { output.push(next); i++; } }
            else if (c === '\'') state = STATE.CODE;
        }
        else if (state === STATE.STRING_DQ) {
            output.push(c);
            if (c === '\\') { if (next) { output.push(next); i++; } }
            else if (c === '"') state = STATE.CODE;
        }
        else if (state === STATE.STRING_TMP) {
            output.push(c);
            if (c === '\\') { if (next) { output.push(next); i++; } }
            else if (c === '`') state = STATE.CODE;
        }
        else if (state === STATE.REGEX) {
            output.push(c);
            if (c === '\\') { 
                if (next) { output.push(next); i++; } 
            } else if (c === '[') {
                inCharClass = true;
            } else if (c === ']') {
                inCharClass = false;
            } else if (c === '/' && !inCharClass) {
                state = STATE.CODE;
            } else if (c === '\n') {
                state = STATE.CODE;
                inCharClass = false;
            }
        }
        else if (state === STATE.COMMENT_LINE) {
            if (c === '\n') {
                if (i > 0 && input[i - 1] === '\r') {
                    output.push('\r');
                }
                output.push(c); // 保留换行符，确保 ASI 与行号结构不受破坏
                state = STATE.CODE;
            }
        }
        else if (state === STATE.COMMENT_BLOCK) {
            if (c === '*' && next === '/') {
                state = STATE.CODE;
                output.push(' '); 
                i++;
            } else if (c === '\n') {
                if (i > 0 && input[i - 1] === '\r') {
                    output.push('\r');
                }
                output.push(c); 
            }
        }
        i++;
    }

    return output.join('');
}

function cleanFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            console.error(`[Cleaner] File not found: ${filePath}`);
            return;
        }
        console.log(`[Cleaner] Processing: ${filePath} ...`);
        const content = fs.readFileSync(filePath, 'utf8');
        const cleaned = processCode(content);
        fs.writeFileSync(filePath, cleaned, 'utf8');
        console.log(`[Cleaner] Done. Refactored consoles and removed comments.`);
    } catch (e) {
        console.error(`[Cleaner] Error: ${e.message}`);
    }
}

module.exports = { cleanFile };
