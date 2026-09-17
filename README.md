# Auto Fill Extension (自动填充浏览器插件)

[![GitHub Release](https://img.shields.io/github/v/release/Tiane-ira/auto_pwd?color=blue&logo=github)](https://github.com/Tiane-ira/auto_pwd/releases)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-success?logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0%20(Pure%20Native)-brightgreen)](#)

基于 Chrome Manifest V3 的多表单项联合自动填充浏览器扩展。支持连续套索选取、整套多表单项分组管理、Chrome 密码管理风格钥匙图标联动填充与 XPath 智能去重。纯原生 JavaScript 开发，零外部依赖，安全私密。

---

## ✨ 核心特性

- **🎯 一个网址一组表单项**：针对目标网址建立唯一的表单规则，支持同时管理多个表单字段（如用户名、密码、邮箱、验证码等）。
- **🗂️ 多数据组联动填充 (Fill Groups)**：支持配置多套填充数据（例如「管理员」、「测试账号」、「生产账号」等），可指定默认填充组。
- **🔑 钥匙图标交互体验**：参考 Chrome 原生密码管理体验，鼠标悬停在页面任一匹配输入框右侧即浮现钥匙图标，点击弹出数据组选择列表，选中后整套表单**所有字段同步联动填充**。
- **🪄 连续套索选取器 (Continuous Picker)**：
  - 点击套索工具即可在目标网页连续点击表单元素；
  - 页面顶部常驻半透明悬浮工具栏，实时统计已选表单项并支持 `Esc` 一键完成退出；
  - 智能探测表单元素标签（自动提取 `label`、`placeholder`、`aria-label` 与名称关键词）。
- **🛡️ XPath 智能去重**：无论是套索连续选取还是手动添加表单项，均严格通过 XPath 进行唯一性去重校验，杜绝冗余项。
- **📑 分组优先同屏编辑 (Group-First Editor)**：编辑弹窗顶部采用 Pills 选项卡快速切换数据分组，在当前分组面板下**同时罗列并编辑该组的所有数据项**，支持一键保存。
- **💾 本地存储与备份恢复**：数据完全持久化保存在浏览器本地 `chrome.storage.local`，无隐私泄露风险；支持全量规则的 JSON 导入与导出。

---

## 📂 项目工程结构

```text
auto_pwd/
├── .github/
│   └── workflows/
│       └── release.yml        # GitHub Actions: 推送 git tag 自动测试、打包并发布 Release
├── assets/
│   └── icons/                 # 扩展图标资源 (16x16, 48x48, 128x128)
├── dist/                      # 构建打包输出目录 (.gitignore)
│   ├── auto-fill-extension-v2.1.0-dev/      # 解压版开发目录 (供 Chrome 开发者模式直接加载)
│   ├── auto-fill-extension-v2.1.0-dev.zip  # 开发测试包 (包含内置测试页与调试资源)
│   └── auto-fill-extension-v2.1.0.zip      # 商店发布包 (纯净合规生产包)
├── scripts/
│   └── build.js               # 统一跨平台构建脚本 (纯原生 Node.js，无需额外依赖)
├── src/                       # 扩展核心源码 (模块化分层架构)
│   ├── background.js          # Service Worker (后台事件与生命周期管理)
│   ├── content/               # 页面注入脚本模块 (按职责解耦)
│   │   ├── utils.js           # 基础通用工具库 (UUID、URL匹配、规则归一化、标签提取)
│   │   ├── xpath.js           # 智能 XPath 与完整 XPath 生成器
│   │   ├── picker.js          # 连续套索选取器 (顶部悬浮工具栏、高亮闪烁、XPath去重)
│   │   ├── filler.js          # 多表单项联动填充引擎 (XPath定位与事件触发)
│   │   ├── key-icon.js        # 钥匙图标交互与 Shadow DOM 下拉数据组切换
│   │   └── main.js            # Content Script 主入口 (消息分发与 SPA 监听)
│   └── popup/                 # 插件弹窗管理界面 (原生 ES Module)
│       ├── popup.html         # 弹窗结构
│       ├── popup.css          # 现代化 UI 样式设计
│       ├── popup.js           # 弹窗主控制器
│       └── modules/           # 弹窗功能子模块
│           ├── storage.js     # 本地规则持久化存储与导入导出
│           ├── url-manager.js # URL 绑定管理与匹配
│           ├── fields-editor.js # 多表单项列表动态渲染与输入同步
│           ├── groups-editor.js # 分组切换 Pills 栏与整组多字段同屏编辑
│           ├── rules-renderer.js# 规则卡片与分组工具栏渲染
│           └── picker-bridge.js # 元素选择器跨上下文通信与动态注入桥接
├── tests/
│   ├── test-page.html         # 本地测试页面 (多表单登录与注册模拟场景)
│   ├── test-popup-ui.html     # 弹窗界面本地调试预览页面
│   └── verify-logic.js        # 自动化逻辑与数据联动单元测试 (8项核心测试)
├── .gitignore                 # Git 忽略规则
├── CHANGELOG.md               # 版本变更日志
├── manifest.json              # 扩展清单文件
├── package.json               # 标准工程配置文件 (npm scripts)
└── README.md                  # 项目说明文档
```

---

## 🚀 安装与使用

### 1. 开发者模式安装（本地调试）

1. 克隆或下载本仓库代码：
   ```bash
   git clone git@github.com:Tiane-ira/auto_pwd.git
   ```
2. 打开 Chrome / Edge 浏览器，访问扩展管理页面：
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. 开启右上角的 **「开发者模式 (Developer mode)」**；
4. 点击 **「加载已解压的扩展程序 (Load unpacked)」**，选择本项目的根目录（或 `dist/auto-fill-extension-v2.1.0-dev/` 目录）；
5. 安装完成，即可在浏览器右上角固定插件图标进行使用。

---

## 🛠️ 工程化脚本与构建

本项目使用原生 Node.js 驱动构建，**无需安装庞大的第三方依赖**，克隆即可直接执行：

```bash
# 1. 运行核心逻辑与数据联动单元测试 (8项测试)
npm test

# 2. 执行跨平台打包构建 (自动生成解压开发目录、测试包 ZIP 与发布包 ZIP)
npm run build
# 或使用:
npm run package
```

构建完成后，产物将生成在 `dist/` 目录下：
- **`dist/auto-fill-extension-v<version>-dev/`**：解压版开发目录，Chrome 可直接加载调试；
- **`dist/auto-fill-extension-v<version>-dev.zip`**：包含完整测试页面的开发调试压缩包；
- **`dist/auto-fill-extension-v<version>.zip`**：纯净无冗余文件的生产发布包，可直接上传 Chrome Web Store。

---

## 🚢 CI/CD 自动化发布流水线

项目配置了 GitHub Actions 自动化发布工作流 ([.github/workflows/release.yml](.github/workflows/release.yml))。

每当向 GitHub 仓库推送版本标签（Tag）时，流水线将自动触发：
1. 自动检出代码并初始化 Node.js 运行环境；
2. 自动运行全部自动化单元测试（`npm test`）；
3. 自动执行打包构建（`npm run build`）；
4. 自动创建对应的 **GitHub Release**，并附加构建完成的生产包与开发包 ZIP 文件。

### 发布新版本步骤：
```bash
# 1. 确保代码已提交
git add .
git commit -m "chore: release v2.1.0"

# 2. 打上对应的版本标签 (格式为 v*，如 v2.1.0)
git tag v2.1.0

# 3. 推送标签到 GitHub 远端触发自动发布
git push origin v2.1.0
```

---

## 💡 使用指南

### 方式一：使用连续套索工具选取（推荐）
1. 打开需要自动填充的目标网页；
2. 点击浏览器右上角插件图标，点击 **「选取元素」**（套索图标）；
3. 页面顶部将浮现操作工具栏；
4. 依次点击页面上的输入框（如用户名框、密码框），插件会自动识别字段并提示「已添加」，支持自动去重；
5. 选取完成后，点击工具栏的 **「完成选取」** 或按键盘 `Esc` 键退出；
6. 再次点击插件图标进入编辑页面，选择对应数据分组并填入各字段的值后保存。

### 方式二：手动配置
1. 点击插件图标，点击 **「+」** 按钮；
2. 插件会自动绑定当前页面的 URL；
3. 在「表单项设置」区域点击 **「+ 添加表单项」**，输入字段名称与对应的 XPath 路径；
4. 在「填充数据与分组」区域切换/添加分组，填写该分组下的填充值；
5. 点击 **「保存」**。

---

## 📄 开源许可证

本项目遵循 [MIT License](LICENSE) 开源协议。
