// build.js —— 唯一构建入口（ESM）
// 使用 esbuild 原生 minify + legalComments 去注释，替代已删除的手写 cleaner.js。
import esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const isWatch = process.argv.includes('--watch');
const isDev = process.argv.includes('--dev') || isWatch;

const buildOptions = {
    entryPoints: ['./src/index.js'],
    bundle: true,
    minify: !isDev,                 // 压缩会移除普通注释；保留 console.* 便于排障
    charset: 'utf8',               // 强制 utf8，避免中文被转义成 \uXXXX
    outfile: './result/_worker.js',
    format: 'esm',
    target: 'esnext',
    external: ['cloudflare:sockets'],
    legalComments: 'eof',          // 保留 js-yaml 的 MIT 许可声明
    logLevel: 'info'
};

function writeChecksum() {
    try {
        const buf = readFileSync('./result/_worker.js');
        const sha = createHash('sha256').update(buf).digest('hex');
        writeFileSync('./result/_worker.js.sha256', `${sha}  _worker.js\n`, 'utf8');
        console.log(`[build] sha256: ${sha}`);
    } catch (e) {
        console.error(`[build] failed to write checksum: ${e.message}`);
    }
}

if (isWatch) {
    const ctx = await esbuild.context({
        ...buildOptions,
        plugins: [{
            name: 'checksum-on-rebuild',
            setup(build) {
                build.onEnd(result => {
                    if (result.errors.length === 0) writeChecksum();
                });
            }
        }]
    });
    await ctx.watch();
    console.log('Watching for changes...');
} else {
    try {
        await esbuild.build(buildOptions);
        writeChecksum();
    } catch (e) {
        // 不再吞掉错误信息
        console.error('[build] failed:', e.message || e);
        process.exit(1);
    }
}
