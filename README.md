# Auto Fill Extension

一个 Manifest V3 Chrome 扩展，支持使用 CSS Selector 和 XPath 自动填充网页表单字段。零依赖，纯原生 JavaScript。

## 功能

- **规则管理** — 添加、编辑、删除填充规则，每条规则绑定一组网址
- **双模式选择器** — 支持 CSS Selector 和 XPath 两种元素定位方式
- **可视化元素选取** — 点击页面元素自动生成 XPath 并复制到剪贴板
- **URL 匹配** — 精确匹配、通配符（`*`）前缀匹配、路径前缀匹配
- **自动填充** — 页面加载后自动执行匹配的规则，支持 SPA 应用的 URL 变化检测
- **全局开关** — 一键开启/关闭自动填充
- **导入导出** — 规则数据支持 JSON 格式导入导出备份
- **填充值自动补全** — 输入填充值时根据已有规则提供建议

## 项目结构

```
auto_pwd/
├── manifest.json          # Chrome 扩展清单 (Manifest V3)
├── src/
│   ├── popup.html         # 弹出窗口界面
│   ├── popup.css          # 弹出窗口样式
│   ├── popup.js           # 弹出窗口逻辑（规则 CRUD）
│   ├── content.js         # 内容脚本（元素查找、填充、选取器）
│   └── background.js      # Service Worker（页面加载触发）
├── assets/icons/          # 扩展图标
├── tests/
│   └── test-page.html     # 功能测试页面
├── tools/
│   └── generate-icons.html
├── dist/                  # 打包产物
└── package.sh             # 打包脚本
```

## 安装使用

### 开发模式加载

1. 打开 `chrome://extensions/`，启用「开发者模式」
2. 点击「加载已解压的扩展程序」，选择项目根目录
3. 修改源码后，在扩展卡片上点击刷新图标即可重载

### 打包

```bash
./package.sh
```

打包产物输出到 `dist/` 目录。

## 数据流

```
┌──────────┐  读/写 rules    ┌──────────────────┐
│  Popup   │ ←─────────────→ │ chrome.storage    │
│ (规则CRUD)│                 │   .local          │
└──────────┘                 └──────┬───────────┘
                                    │ 读取 rules
┌──────────────┐  executeAllAuto   │ + autoFillEnabled
│  Background  │ ────Rules──────→  │
│ (tabs.onUpdated)                 │
└──────────────┘                   ▼
                          ┌──────────────────┐
                          │  Content Script   │
                          │  (元素查找/填充)    │
                          └──────────────────┘
```

1. **Popup** 直接读写 `chrome.storage.local` 管理规则
2. **Content Script** 在页面加载和 SPA URL 变化时读取规则并执行匹配
3. **Background** 通过 `tabs.onUpdated` 通知 Content Script 执行规则（兜底触发）

## 规则结构

```js
{
  id: "uuid-v4",          // 唯一标识
  urls: ["https://..."],  // 绑定的网址列表
  selectorType: "css" | "xpath",
  selector: "...",        // CSS/XPath 表达式
  fillValue: "...",       // 要填充的文本
  createdAt: "ISO 8601"   // 创建时间
}
```

## 测试

在浏览器中打开 `tests/test-page.html` 验证填充功能，或直接在实际目标页面上测试。
