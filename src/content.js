// 内容脚本 - 在页面中执行元素选择和填充

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'executeRule') {
    executeRule(request.rule)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 保持消息通道开放以支持异步响应
  }
  if (request.action === 'startPicker') {
    startElementPicker();
    return;
  }
  if (request.action === 'stopPicker') {
    stopElementPicker();
    return;
  }
});

// ========== 元素选择器 ==========
let pickerActive = false;
let pickerStyle = null;

function getFullXPath(element) {
  const parts = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let tag = current.tagName.toLowerCase();
    const parent = current.parentNode;
    if (parent) {
      let count = 0;
      let pos = 0;
      for (const child of parent.children) {
        if (child.tagName === current.tagName) {
          count++;
          if (child === current) pos = count;
        }
      }
      if (count > 1) tag += `[${pos}]`;
    }
    parts.unshift(tag);
    current = current.parentNode;
  }
  return '/' + parts.join('/');
}

function startElementPicker() {
  if (pickerActive) return;
  pickerActive = true;
  pickerStyle = document.createElement('style');
  pickerStyle.id = '__picker_style__';
  pickerStyle.textContent = 'body.__picker_active__ *:hover{outline:2px solid #5B6AF0!important;background:rgba(91,106,240,0.06)!important}';
  document.head.appendChild(pickerStyle);
  document.body.classList.add('__picker_active__');
  document.body.style.cursor = 'crosshair';
  document.addEventListener('click', onPickerClick, true);
  document.addEventListener('keydown', onPickerKeyDown, true);
}

function stopElementPicker() {
  pickerActive = false;
  document.body.classList.remove('__picker_active__');
  document.body.style.cursor = '';
  if (pickerStyle) { pickerStyle.remove(); pickerStyle = null; }
  const toast = document.getElementById('__picker_toast__');
  if (toast) toast.remove();
  document.removeEventListener('click', onPickerClick, true);
  document.removeEventListener('keydown', onPickerKeyDown, true);
}

function copyToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text).catch(() => {});
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

function onPickerClick(e) {
  if (!pickerActive) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  const xpath = getFullXPath(e.target);
  copyToClipboard(xpath);
  chrome.storage.local.set({ pendingPickerXPath: xpath });
  showPickerToast('XPath已复制,进入插件添加规则或继续选取,Esc退出');
}

function showPickerToast(message) {
  if (!document.getElementById('__picker_toast_style__')) {
    const style = document.createElement('style');
    style.id = '__picker_toast_style__';
    style.textContent = '@keyframes toastSlideIn{from{opacity:0;transform:translateX(-50%) translateY(-12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
    document.head.appendChild(style);
  }
  const old = document.getElementById('__picker_toast__');
  if (old) old.remove();
  const toast = document.createElement('div');
  toast.id = '__picker_toast__';
  toast.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: #5B6AF0; color: #fff; padding: 12px 20px; border-radius: 8px;
    font-size: 14px; z-index: 2147483647;
    box-shadow: 0 4px 20px rgba(91,106,240,0.35);
    white-space: nowrap; max-width: 90vw; overflow: hidden; text-overflow: ellipsis;
    animation: toastSlideIn 0.25s ease-out;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.2s';
    toast.addEventListener('transitionend', () => toast.remove());
    setTimeout(() => toast.remove(), 250);
  }, 2500);
}

function onPickerKeyDown(e) {
  if (e.key === 'Escape') stopElementPicker();
}

// 标准化URL（移除hash和query参数，用于匹配）
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  } catch {
    return url;
  }
}

// URL匹配函数
function matchUrl(currentUrl, ruleUrl) {
  const normalizedCurrent = normalizeUrl(currentUrl);
  const normalizedRule = normalizeUrl(ruleUrl);
  
  // 精确匹配
  if (normalizedCurrent === normalizedRule) {
    return true;
  }
  
  // 支持通配符匹配（例如: https://example.com/*）
  if (normalizedRule.endsWith('*')) {
    const prefix = normalizedRule.slice(0, -1);
    return normalizedCurrent.startsWith(prefix);
  }
  
  // 支持路径匹配（例如: /login）
  if (ruleUrl.startsWith('/')) {
    try {
      const urlObj = new URL(currentUrl);
      return urlObj.pathname === ruleUrl || urlObj.pathname.startsWith(ruleUrl);
    } catch {
      return false;
    }
  }
  
  return false;
}

// 检查当前URL是否匹配规则中的网址列表
function matchesCurrentUrl(rule) {
  if (!rule.urls || rule.urls.length === 0) {
    return false;
  }
  
  const currentUrl = window.location.href;
  
  return rule.urls.some(url => matchUrl(currentUrl, url));
}

// 执行单个规则
async function executeRule(rule) {
  try {
    // 尝试多次查找元素，以应对页面加载缓慢的情况
    const elements = await waitForElements(rule.selector, rule.selectorType, 3000); // 减少等待时间
    
    if (elements.length === 0) {
      throw new Error(`未找到匹配的元素: ${rule.selector}`);
    }

    const results = [];
    
    for (const element of elements) {
      try {
        // 只支持填充文本操作
        await fillElement(element, rule.fillValue);
        results.push({ success: true, action: 'fill' });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }

    return {
      found: elements.length,
      executed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  } catch (error) {
    throw error;
  }
}

// 等待元素出现，最多等待指定时间
function waitForElements(selector, selectorType, timeoutMs = 3000) { // 减少默认超时时间
  return new Promise((resolve) => {
    let elements = [];
    
    // 立即尝试查找元素
    elements = findElementsSync(selector, selectorType);
    if (elements.length > 0) {
      resolve(elements);
      return;
    }
    
    // 设置轮询，定期检查元素是否存在
    const startTime = Date.now();
    const interval = setInterval(() => {
      elements = findElementsSync(selector, selectorType);
      
      if (elements.length > 0) {
        clearInterval(interval);
        resolve(elements);
      } else if (Date.now() - startTime >= timeoutMs) {
        // 超时，停止轮询
        clearInterval(interval);
        resolve([]);
      }
    }, 50); // 更频繁地检查（50ms），以更快响应
  });
}

// 同步查找元素
function findElementsSync(selector, selectorType) {
  try {
    let elements = [];
    
    if (selectorType === 'css') {
      // 使用CSS选择器
      elements = Array.from(document.querySelectorAll(selector));
    } else if (selectorType === 'xpath') {
      // 使用XPath
      const xpathResult = document.evaluate(
        selector,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      
      for (let i = 0; i < xpathResult.snapshotLength; i++) {
        elements.push(xpathResult.snapshotItem(i));
      }
    } else {
      console.error(`不支持的选择器类型: ${selectorType}`);
      return [];
    }
    
    return elements;
  } catch (error) {
    console.error('查找元素时发生错误:', error);
    return [];
  }
}

// 查找元素（保留原始方法用于向后兼容）
function findElements(selector, selectorType) {
  return new Promise((resolve, reject) => {
    try {
      const elements = findElementsSync(selector, selectorType);
      resolve(elements);
    } catch (error) {
      reject(error);
    }
  });
}

// 填充元素
function fillElement(element, value) {
  return new Promise((resolve, reject) => {
    try {
      // 确保元素可见且可交互
      if (!isElementVisible(element)) {
        // 如果元素不可见，等待一段时间再尝试
        setTimeout(() => {
          if (isElementVisible(element)) {
            performFill(element, value);
            resolve();
          } else {
            // 即使不可见也尝试填充，某些情况下仍然有效
            performFill(element, value);
            resolve();
          }
        }, 200); // 减少等待时间
      } else {
        performFill(element, value);
        resolve();
      }
    } catch (error) {
      reject(error);
    }
  });
}

// 检查元素是否可见
function isElementVisible(element) {
  return element.offsetWidth > 0 
    && element.offsetHeight > 0 
    && element.getClientRects().length > 0;
}

// 执行填充操作
function performFill(element, value) {
  // 触发focus事件
  element.focus();
  element.dispatchEvent(new Event('focus', { bubbles: true }));
  
  // 清空现有值
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    element.value = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (element.isContentEditable) {
    element.textContent = '';
  }
  
  // 设置新值
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (element.isContentEditable) {
    element.textContent = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    element.setAttribute('value', value);
  }
  
  // 触发blur事件
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

// 执行匹配当前URL的所有规则 - 优化：批量读取和缓存
let autoFillStatusCache = null;
let rulesCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000; // 缓存5秒

async function executeMatchingRules() {
  try {
    const now = Date.now();
    
    // 批量读取存储，使用缓存优化
    if (!autoFillStatusCache || !rulesCache || (now - cacheTimestamp) > CACHE_TTL) {
      const result = await chrome.storage.local.get(['autoFillEnabled', 'rules']);
      autoFillStatusCache = result.autoFillEnabled !== false;
      rulesCache = result.rules || [];
      cacheTimestamp = now;
    }
    
    if (!autoFillStatusCache) {
      return { executed: 0, message: '自动填充已关闭' };
    }
    
    if (rulesCache.length === 0) {
      return { executed: 0, message: '没有规则' };
    }
    
    // 筛选匹配当前URL的规则
    const matchingRules = rulesCache.filter(rule => matchesCurrentUrl(rule));
    
    if (matchingRules.length === 0) {
      return { executed: 0, message: '没有匹配当前URL的规则' };
    }
    
    // 串行执行规则而不是并行，避免在慢速设备上造成性能问题
    const results = [];
    for (const rule of matchingRules) {
      try {
        const result = await executeRule(rule);
        results.push({ 
          ruleId: rule.id, 
          success: true, 
          result 
        });
      } catch (error) {
        results.push({ 
          ruleId: rule.id, 
          success: false, 
          error: error.message 
        });
      }
    }
    
    return {
      executed: matchingRules.length,
      results
    };
  } catch (error) {
    console.error('执行规则失败:', error);
    throw error;
  }
}

// 页面加载完成后自动执行匹配的规则
function autoExecuteRules() {
  // 等待页面完全加载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // 不再使用延迟，立即执行
      executeMatchingRules().catch(console.error);
    });
  } else {
    // DOM已经加载，立即执行
    executeMatchingRules().catch(console.error);
  }
}

// 监听URL变化（SPA应用）- 优化：防抖和节流
let lastUrl = location.href;
let urlChangeTimer = null;
let isExecuting = false;

const urlObserver = new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    
    // 防抖：避免频繁触发
    if (urlChangeTimer) {
      clearTimeout(urlChangeTimer);
    }
    
    urlChangeTimer = setTimeout(() => {
      // 节流：避免重复执行
      if (!isExecuting) {
        isExecuting = true;
        executeMatchingRules()
          .catch(console.error)
          .finally(() => {
            isExecuting = false;
          });
      }
    }, 500); // 减少URL变化的延迟
  }
});

// 使用更精确的观察选项，减少性能开销
urlObserver.observe(document, { 
  subtree: false, 
  childList: true,
  attributes: false,
  characterData: false
});

// 初始化
autoExecuteRules();
