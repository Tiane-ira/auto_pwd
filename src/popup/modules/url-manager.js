/**
 * AutoFill Popup - URL 处理与管理模块
 */

// 标准化URL（移除hash和query参数，用于匹配）
export function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  } catch {
    return url;
  }
}

// URL匹配函数
export function matchUrl(currentUrl, ruleUrl) {
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

// 检查规则是否匹配当前URL（带缓存机制）
export function matchesCurrentUrl(rule, currentPageUrl, matchCache = null) {
  if (!rule.urls || rule.urls.length === 0) {
    return false;
  }

  const cacheKey = `${rule.id}_${currentPageUrl}`;
  if (matchCache && matchCache.has(cacheKey)) {
    return matchCache.get(cacheKey);
  }

  const result = rule.urls.some(url => matchUrl(currentPageUrl, url));

  if (matchCache) {
    if (matchCache.size > 200) {
      const firstKey = matchCache.keys().next().value;
      matchCache.delete(firstKey);
    }
    matchCache.set(cacheKey, result);
  }

  return result;
}

// 验证URL格式
export function isValidUrl(url) {
  try {
    if (url.startsWith('/') || url.startsWith('./')) {
      return true;
    }
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// 获取指定网址列表中已有规则的所有分组名
export function getGroupNamesForUrls(rules, urls) {
  const names = new Set();
  rules.forEach(rule => {
    if (rule.urls && rule.urls.some(u => urls.includes(u))) {
      if (rule.fillGroups) {
        rule.fillGroups.forEach(g => {
          if (g.name && g.name.trim()) names.add(g.name.trim());
        });
      }
    }
  });
  return Array.from(names);
}

// 渲染网址列表
export function renderUrlsList(urlsListEl, currentUrls) {
  if (!urlsListEl) return;
  if (currentUrls.length === 0) {
    urlsListEl.innerHTML = '<div style="color: #999; font-size: 12px; padding: 8px;">暂无网址，请添加</div>';
    return;
  }

  urlsListEl.innerHTML = currentUrls.map((url, index) => `
    <div class="url-item">
      <span>${escapeHtml(url)}</span>
      <button type="button" class="btn-remove-url" data-url-index="${index}">删除</button>
    </div>
  `).join('');
}

// 从输入框添加网址
export function addUrlFromInput(urlInputEl, currentUrls, onUpdate) {
  if (!urlInputEl) return;
  const url = urlInputEl.value.trim();
  if (!url) {
    alert('请输入网址');
    return;
  }

  if (!isValidUrl(url)) {
    alert('请输入有效的网址格式（例如: https://example.com）');
    return;
  }

  if (currentUrls.includes(url)) {
    alert('该网址已存在');
    return;
  }

  currentUrls.push(url);
  urlInputEl.value = '';
  if (onUpdate) onUpdate();
}

// 添加当前标签页网址
export async function addCurrentUrl(currentUrls, onUpdate, urlInputEl = null) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const url = normalizeUrl(tab.url);
      if (!currentUrls.includes(url)) {
        currentUrls.push(url);
        if (urlInputEl) urlInputEl.value = url;
        if (onUpdate) onUpdate();
      } else {
        alert('当前网址已存在');
      }
    } else {
      alert('无法获取当前页面网址');
    }
  } catch (error) {
    console.error('获取当前网址失败:', error);
    alert('获取当前网址失败');
  }
}

// 移除网址
export function removeUrl(index, currentUrls, onUpdate) {
  currentUrls.splice(index, 1);
  if (onUpdate) onUpdate();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}
