#!/usr/bin/env node

/**
 * 跨平台 Chrome 扩展打包构建脚本 (Node.js)
 * 支持同时生成：
 * 1. 生产发布包 (Web Store Release ZIP): dist/auto-fill-extension-v<version>.zip
 * 2. 开发测试包 (Dev Testing ZIP): dist/auto-fill-extension-v<version>-dev.zip (包含完整 tests/ 测试页面)
 * 3. 解压版开发目录 (Unpacked Dev Directory): dist/auto-fill-extension-v<version>-dev/ (供 Chrome 直接加载)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 统一指向项目根目录
const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'manifest.json');
const distDir = path.join(rootDir, 'dist');

// 1. 读取并解析 manifest.json
if (!fs.existsSync(manifestPath)) {
  console.error('❌ 错误: 未在根目录找到 manifest.json 文件！');
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
} catch (err) {
  console.error('❌ 错误: 解析 manifest.json 失败:', err.message);
  process.exit(1);
}

const version = manifest.version || '1.0.0';
const extName = manifest.name || 'auto-fill-extension';

// 产物文件名与路径
const prodZipName = `auto-fill-extension-v${version}.zip`;
const prodZipPath = path.join(distDir, prodZipName);

const devZipName = `auto-fill-extension-v${version}-dev.zip`;
const devZipPath = path.join(distDir, devZipName);

const devDirName = `auto-fill-extension-v${version}-dev`;
const devDirPath = path.join(distDir, devDirName);

console.log('\x1b[36m========================================\x1b[0m');
console.log(`\x1b[36m  Chrome 扩展打包构建: ${extName}\x1b[0m`);
console.log(`\x1b[36m  版本号: v${version}\x1b[0m`);
console.log('\x1b[36m========================================\x1b[0m');

// 2. 准备输出目录
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 辅助打包函数：调用系统原生工具创建 zip
function createZip(targets, outputZipPath) {
  if (fs.existsSync(outputZipPath)) {
    fs.unlinkSync(outputZipPath);
  }

  let success = false;
  // 优先尝试使用 tar (Windows 10+, macOS, Linux 均内置 bsdtar/GNU tar)
  try {
    const targetArgs = targets.map(t => `"${t}"`).join(' ');
    execSync(`tar -a -c -f "${outputZipPath}" ${targetArgs}`, {
      cwd: rootDir,
      stdio: 'pipe'
    });
    success = true;
  } catch (tarErr) {
    if (process.platform === 'win32') {
      try {
        const psTargets = targets.map(t => `'${path.join(rootDir, t)}'`).join(',');
        const psCmd = `Compress-Archive -Path ${psTargets} -DestinationPath '${outputZipPath}' -Force`;
        execSync(`powershell -NoProfile -Command "${psCmd}"`, {
          cwd: rootDir,
          stdio: 'pipe'
        });
        success = true;
      } catch (psErr) {
        console.error('PowerShell 打包失败:', psErr.message);
      }
    } else {
      try {
        const targetArgs = targets.map(t => `"${t}"`).join(' ');
        execSync(`zip -r "${outputZipPath}" ${targetArgs} -x "*.DS_Store"`, {
          cwd: rootDir,
          stdio: 'pipe'
        });
        success = true;
      } catch (zipErr) {
        console.error('zip 命令失败:', zipErr.message);
      }
    }
  }

  return success && fs.existsSync(outputZipPath);
}

// ==========================================
// [1/3] 生成已解压的开发目录 (Unpacked Dev Directory)
// ==========================================
console.log('\x1b[33m[1/3] 正在生成解压版开发目录 (Unpacked Dev)...');
if (fs.existsSync(devDirPath)) {
  fs.rmSync(devDirPath, { recursive: true, force: true });
}
fs.mkdirSync(devDirPath, { recursive: true });

const devCopyItems = ['manifest.json', 'src'];
if (fs.existsSync(path.join(rootDir, 'assets'))) devCopyItems.push('assets');
if (fs.existsSync(path.join(rootDir, 'tests'))) devCopyItems.push('tests');
if (fs.existsSync(path.join(rootDir, 'README.md'))) devCopyItems.push('README.md');

for (const item of devCopyItems) {
  const srcPath = path.join(rootDir, item);
  const destPath = path.join(devDirPath, item);
  fs.cpSync(srcPath, destPath, { recursive: true });
}
console.log(`\x1b[32m      已生成开发目录: dist/${devDirName}/\x1b[0m`);

// ==========================================
// [2/3] 打包开发包 ZIP (包含 tests 测试页面与文档)
// ==========================================
console.log('\x1b[33m[2/3] 正在压缩开发包 ZIP (包含测试页面与调试资源)...');
const devTargets = ['manifest.json', 'src'];
if (fs.existsSync(path.join(rootDir, 'assets'))) devTargets.push('assets');
if (fs.existsSync(path.join(rootDir, 'tests'))) devTargets.push('tests');
if (fs.existsSync(path.join(rootDir, 'README.md'))) devTargets.push('README.md');

const devZipSuccess = createZip(devTargets, devZipPath);
if (!devZipSuccess) {
  console.error('\x1b[31m❌ 开发包 ZIP 打包失败！\x1b[0m');
  process.exit(1);
}
const devStats = fs.statSync(devZipPath);
const devSizeKB = (devStats.size / 1024).toFixed(2);
console.log(`\x1b[32m      开发包 ZIP 完成: ${devZipName} (${devSizeKB} KB)\x1b[0m`);

// ==========================================
// [3/3] 打包生产发布包 ZIP (仅含核心运行文件，合规上架)
// ==========================================
console.log('\x1b[33m[3/3] 正在压缩生产发布包 ZIP (商店合规纯净版)...');
const prodTargets = ['manifest.json', 'src'];
if (fs.existsSync(path.join(rootDir, 'assets'))) prodTargets.push('assets');

const prodZipSuccess = createZip(prodTargets, prodZipPath);
if (!prodZipSuccess) {
  console.error('\x1b[31m❌ 生产发布包 ZIP 打包失败！\x1b[0m');
  process.exit(1);
}
const prodStats = fs.statSync(prodZipPath);
const prodSizeKB = (prodStats.size / 1024).toFixed(2);
console.log(`\x1b[32m      生产发布包 ZIP 完成: ${prodZipName} (${prodSizeKB} KB)\x1b[0m`);

// 总结输出
console.log('\x1b[32m========================================\x1b[0m');
console.log('\x1b[32m🎉 全部打包任务完成！产物明细如下：\x1b[0m');
console.log('\x1b[36m1. 【解压版开发目录】\x1b[0m');
console.log(`   📁 路径: ${devDirPath}`);
console.log('   👉 用途: Chrome 打开 chrome://extensions/ 直接「加载已解压的扩展程序」调试');
console.log('\x1b[36m2. 【开发测试压缩包】\x1b[0m');
console.log(`   📦 文件: dist/${devZipName} (${devSizeKB} KB)`);
console.log('   👉 用途: 包含内置 tests/ 目录与测试页面，方便团队协作与联调测试');
console.log('\x1b[36m3. 【商店发布压缩包】\x1b[0m');
console.log(`   📦 文件: dist/${prodZipName} (${prodSizeKB} KB)`);
console.log('   👉 用途: 纯净核心运行包，可直接上传 Chrome Web Store 审核发布');
console.log('\x1b[32m========================================\x1b[0m');
