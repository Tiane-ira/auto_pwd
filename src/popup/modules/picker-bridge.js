/**
 * AutoFill Popup - 元素选择器通信与控制桥接模块
 */

// 打开 popup 时自动停止当前活跃的选取模式
export async function stopActivePicker() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      await chrome.tabs.sendMessage(tab.id, { action: 'stopPicker' });
    }
  } catch {}
}

// 切换或启动元素选择器
export async function toggleElementPicker() {
  let tab;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs && tabs[0];
  } catch (e) {
    console.error('获取活动标签页失败:', e);
  }

  if (!tab || !tab.url) {
    alert('无法获取当前标签页信息');
    return;
  }

  // 1. 检查受限协议
  const restrictedProtocols = ['chrome:', 'chrome-extension:', 'edge:', 'about:', 'view-source:'];
  if (restrictedProtocols.some(proto => tab.url.startsWith(proto))) {
    alert('受浏览器安全策略限制，无法在浏览器系统/扩展管理页面使用元素选择器。\n\n请在普通的网页或测试页面上使用。');
    return;
  }

  if (tab.url.includes('chromewebstore.google.com') || tab.url.includes('chrome.google.com/webstore')) {
    alert('受 Chrome 安全策略限制，无法在 Chrome 网上应用店页面运行脚本或选取元素。\n\n请切换到普通网页后再试。');
    return;
  }

  // 2. 检查本地文件访问权限 (file:///)
  if (tab.url.startsWith('file://')) {
    const isAllowedFile = await new Promise(resolve => {
      if (chrome.extension && typeof chrome.extension.isAllowedFileSchemeAccess === 'function') {
        chrome.extension.isAllowedFileSchemeAccess(resolve);
      } else {
        resolve(true);
      }
    });

    if (!isAllowedFile) {
      alert(
        '【本地文件页面访问受限】\n\n' +
        '当前目标页面是本地文件 (file:///)。\n' +
        'Chrome 默认出于安全考量，未授予插件访问本地文件的权限。\n\n' +
        '开启步骤：\n' +
        '1. 打开扩展管理页：chrome://extensions/\n' +
        '2. 找到本插件，点击「详细信息」\n' +
        '3. 开启【允许访问文件网址】开关\n' +
        '4. 返回本地网页按 F5 刷新后即可正常选取！'
      );
      return;
    }
  }

  // 3. 尝试向目标页面发送 startPicker 消息
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'startPicker' });
    if (response && response.success) {
      window.close();
      return;
    }
  } catch (err) {
    console.warn('初次发送 startPicker 失败，尝试动态注入 content.js 模块:', err);
  }

  // 4. 若网页在重载插件前就已打开，尝试动态注入 content 脚本并重试
  try {
    if (chrome.scripting && typeof chrome.scripting.executeScript === 'function') {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [
          'src/content/utils.js',
          'src/content/xpath.js',
          'src/content/picker.js',
          'src/content/filler.js',
          'src/content/key-icon.js',
          'src/content/main.js'
        ]
      });
      await new Promise(r => setTimeout(r, 120));
      const retryResponse = await chrome.tabs.sendMessage(tab.id, { action: 'startPicker' });
      if (retryResponse && retryResponse.success) {
        window.close();
        return;
      }
    }
  } catch (injectErr) {
    console.warn('动态注入 content 脚本失败:', injectErr);
  }

  // 5. 提示刷新重试
  alert(
    '无法在此页面启动元素选择器。\n\n' +
    '可能原因：\n' +
    '1. 该网页打开于插件重载前：请在网页上按 F5 刷新页面后重试；\n' +
    '2. 若当前为本地文件(file:///)：请在扩展管理中开启「允许访问文件网址」。'
  );
}

// 简单的轻量通知条
export function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #10B981;
    color: white;
    padding: 10px 18px;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 10000;
    font-size: 13px;
    font-weight: 500;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.remove();
  }, 2200);
}
