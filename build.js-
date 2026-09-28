// build.js
const esbuild = require('esbuild');
const { cleanFile } = require('./cleaner.js'); // 引入清理脚本

const isWatch = process.argv.includes('--watch');

// 定义 Cleaner 插件
const cleanerPlugin = {
  name: 'auto-cleaner',
  setup(build) {
    // 在构建结束 (onEnd) 时执行清理
    build.onEnd(result => {
      if (result.errors.length > 0) {
        console.log('[Cleaner] Build failed, skipping clean.');
        return;
      }
      
      // 动态获取 buildOptions 中的 outfile，避免硬编码路径
      const outfile = build.initialOptions.outfile;
      
      if (outfile) {
        cleanFile(outfile);
      }
    });
  },
};

const buildOptions = {
  entryPoints: ['./src/index.js'],
  bundle: true,
  minify: false, // 保持关闭，由 cleaner 处理注释
  charset: 'utf8', // ⬅️ 新增：强制使用 utf8 编码，防止中文变量名被转义为 \uXXXX
  outfile: './result/_worker.js', // 核心修复：将输出目录由 dist 统一为 result
  format: 'esm',
  target: 'esnext',
  external: ['cloudflare:sockets'], 
  logLevel: 'info',
  plugins: [cleanerPlugin] // 注册插件
};

if (isWatch) {
  esbuild.context(buildOptions).then(ctx => {
    ctx.watch();
    console.log('Watching for changes...');
  });
} else {
  esbuild.build(buildOptions).catch(() => process.exit(1));
}
