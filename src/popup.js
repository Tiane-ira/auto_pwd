// 规则管理界面逻辑
let rules = [];
let editingRuleId = null;
let currentUrls = []; // 当前编辑的网址列表
let currentTab = 'current'; // 当前选中的tab
let currentPageUrl = ''; // 当前页面URL
let autoFillEnabled = true; // 全局自动填充开关状态

// 性能优化：缓存
const urlCache = new Map(); // URL解析缓存
const matchCache = new Map(); // URL匹配缓存
let renderDebounceTimer = null; // 渲染防抖定时器

// DOM元素
const addRuleBtn = document.getElementById('addRuleBtn');
const moreOptionsBtn = document.getElementById('moreOptionsBtn');
const moreOptionsDropdown = document.getElementById('moreOptionsDropdown');
const exportRulesBtn = document.getElementById('exportRulesBtn');
const importRulesBtn = document.getElementById('importRulesBtn');
const importModal = document.getElementById('importModal');
const confirmImportBtn = document.getElementById('confirmImportBtn');
const cancelImportBtn = document.getElementById('cancelImportBtn');
const closeImportModal = document.querySelector('.close-import');
const currentRulesList = document.getElementById('currentRulesList');
const allRulesList = document.getElementById('allRulesList');
const ruleModal = document.getElementById('ruleModal');
const ruleForm = document.getElementById('ruleForm');
const modalTitle = document.getElementById('modalTitle');
const closeModal = document.querySelector('.close');
const cancelBtn = document.getElementById('cancelBtn');
const urlsList = document.getElementById('urlsList');
const urlInput = document.getElementById('urlInput');
const addUrlBtn = document.getElementById('addUrlBtn');
const addCurrentUrlBtn = document.getElementById('addCurrentUrlBtn');
const tabButtons = document.querySelectorAll('.tab-btn');
const autoFillToggle = document.getElementById('autoFillToggle');
const pickElementBtn = document.getElementById('pickElementBtn');
const fillValueInput = document.getElementById('fillValue'); // 填充值输入框

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentPageUrl();
  await stopActivePicker();
  await loadAutoFillStatus();
  await loadRules();
  setupEventListeners();
  renderCurrentTab();
});

// 加载当前页面URL
async function loadCurrentPageUrl() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      currentPageUrl = normalizeUrl(tab.url);
    }
  } catch (error) {
    console.error('获取当前页面URL失败:', error);
  }
}

// 加载自动填充开关状态
async function loadAutoFillStatus() {
  try {
    const result = await chrome.storage.local.get(['autoFillEnabled', 'pendingPickerXPath']);
    autoFillEnabled = result.autoFillEnabled !== false;
    if (autoFillToggle) {
      autoFillToggle.checked = autoFillEnabled;
    }

    if (result.pendingPickerXPath) {
      const xpath = result.pendingPickerXPath;
      await chrome.storage.local.remove(['pendingPickerXPath']);
      await openModal(null, xpath);
    }
  } catch (error) {
    console.error('加载自动填充状态失败:', error);
  }
}

// 保存自动填充开关状态
async function saveAutoFillStatus(enabled) {
  try {
    await chrome.storage.local.set({ autoFillEnabled: enabled });
    autoFillEnabled = enabled;
  } catch (error) {
    console.error('保存自动填充状态失败:', error);
  }
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

// 检查规则是否匹配当前URL - 优化：缓存匹配结果
function matchesCurrentUrl(rule) {
  if (!rule.urls || rule.urls.length === 0) {
    return false;
  }

  const cacheKey = `${rule.id}_${currentPageUrl}`;
  if (matchCache.has(cacheKey)) {
    return matchCache.get(cacheKey);
  }

  const result = rule.urls.some(url => matchUrl(currentPageUrl, url));

  if (matchCache.size > 200) {
    const firstKey = matchCache.keys().next().value;
    matchCache.delete(firstKey);
  }
  matchCache.set(cacheKey, result);

  return result;
}

// 获取所有唯一的填充值，用于自动完成
function getAllFillValues() {
  const values = new Set();
  rules.forEach(rule => {
    if (rule.fillValue) {
      values.add(rule.fillValue);
    }
  });
  return Array.from(values);
}

// 创建自动完成下拉菜单
function initAutocomplete() {
  const fillValueInput = document.getElementById('fillValue');
  if (!fillValueInput) return;
  
  // 创建自动完成容器
  const autocompleteContainer = document.createElement('div');
  autocompleteContainer.className = 'autocomplete-container';
  autocompleteContainer.style.position = 'relative';
  
  // 包装输入框
  fillValueInput.parentNode.insertBefore(autocompleteContainer, fillValueInput);
  autocompleteContainer.appendChild(fillValueInput);
  
  // 创建下拉列表
  const suggestionsList = document.createElement('ul');
  suggestionsList.className = 'autocomplete-suggestions';
  suggestionsList.style.display = 'none';
  autocompleteContainer.appendChild(suggestionsList);
  
  let currentFocus = -1;
  let allSuggestions = [];
  
  // 输入事件监听
  fillValueInput.addEventListener('input', function(e) {
    const inputValue = this.value.toLowerCase();
    
    // 清空之前的建议
    suggestionsList.innerHTML = '';
    currentFocus = -1;
    
    if (!inputValue) {
      suggestionsList.style.display = 'none';
      return;
    }
    
    // 获取所有填充值并过滤匹配的值
    allSuggestions = getAllFillValues().filter(value => 
      value.toLowerCase().includes(inputValue)
    );
    
    if (allSuggestions.length === 0) {
      suggestionsList.style.display = 'none';
      return;
    }
    
    // 生成建议列表项
    allSuggestions.forEach((value, index) => {
      const suggestionItem = document.createElement('li');
      suggestionItem.className = 'autocomplete-suggestion';
      suggestionItem.innerHTML = highlightMatch(value, inputValue);
      suggestionItem.addEventListener('click', function() {
        fillValueInput.value = value;
        suggestionsList.style.display = 'none';
        currentFocus = -1;
      });
      suggestionsList.appendChild(suggestionItem);
    });
    
    suggestionsList.style.display = 'block';
  });
  
  // 点击其他地方隐藏建议列表
  document.addEventListener('click', function(e) {
    if (e.target !== fillValueInput) {
      suggestionsList.style.display = 'none';
      currentFocus = -1;
    }
  });
  
  // 键盘导航
  fillValueInput.addEventListener('keydown', function(e) {
    const items = suggestionsList.querySelectorAll('.autocomplete-suggestion');
    if (!items.length) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      currentFocus = (currentFocus + 1) % items.length;
      setActive(items, currentFocus);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      currentFocus = (currentFocus - 1 + items.length) % items.length;
      setActive(items, currentFocus);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentFocus > -1 && items[currentFocus]) {
        items[currentFocus].click();
      }
    } else if (e.key === 'Escape') {
      suggestionsList.style.display = 'none';
      currentFocus = -1;
    }
  });
}

// 高亮匹配的文本
function highlightMatch(text, match) {
  const index = text.toLowerCase().indexOf(match.toLowerCase());
  if (index === -1) return text;
  
  const before = text.substring(0, index);
  const matched = text.substring(index, index + match.length);
  const after = text.substring(index + match.length);
  
  return `${escapeHtml(before)}<strong>${escapeHtml(matched)}</strong>${escapeHtml(after)}`;
}

// 设置活动项
function setActive(items, index) {
  // 移除所有活动项的高亮
  items.forEach(item => item.classList.remove('autocomplete-active'));
  
  // 高亮当前项
  if (items[index]) {
    items[index].classList.add('autocomplete-active');
  }
}

// 设置事件监听器
function setupEventListeners() {
  addRuleBtn.addEventListener('click', () => openModal());
  moreOptionsBtn.addEventListener('click', toggleMoreOptions);
  exportRulesBtn.addEventListener('click', exportRules);
  importRulesBtn.addEventListener('click', importRules);
  closeModal.addEventListener('click', () => closeModalWindow());
  cancelBtn.addEventListener('click', () => closeModalWindow());
  ruleForm.addEventListener('submit', handleFormSubmit);
  addUrlBtn.addEventListener('click', addUrlFromInput);
  addCurrentUrlBtn.addEventListener('click', addCurrentUrl);
  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addUrlFromInput();
    }
  });
  
  // 导入确认模态框事件
  confirmImportBtn.addEventListener('click', confirmImportRules);
  cancelImportBtn.addEventListener('click', () => hideImportModal());
  closeImportModal.addEventListener('click', () => hideImportModal());
  
  // 元素选择器按钮
  pickElementBtn.addEventListener('click', toggleElementPicker);

  // 自动完成初始化
  initAutocomplete();
  
  // Tab切换
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    });
  });
  
  // 自动填充开关
  if (autoFillToggle) {
    autoFillToggle.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      await saveAutoFillStatus(enabled);
      // showNotification(enabled ? '自动填充已开启' : '自动填充已关闭');
    });
  }
  
  // 使用事件委托处理规则列表中的按钮点击
  currentRulesList.addEventListener('click', handleRuleListClick);
  allRulesList.addEventListener('click', handleRuleListClick);
  
  // 使用事件委托处理网址列表中的删除按钮
  urlsList.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-remove-url')) {
      const index = parseInt(e.target.getAttribute('data-url-index'));
      if (!isNaN(index)) {
        removeUrl(index);
      }
    }
  });
  
  // 点击模态框外部关闭
  window.addEventListener('click', (e) => {
    if (e.target === ruleModal) {
      closeModalWindow();
    }
    if (e.target === importModal) {
      hideImportModal();
    }
    // 点击下拉菜单外部关闭
    if (!moreOptionsBtn.contains(e.target) && !moreOptionsDropdown.contains(e.target)) {
      closeMoreOptions();
    }
  });
}

// 切换更多选项下拉菜单
function toggleMoreOptions() {
  moreOptionsDropdown.classList.toggle('show');
}

// 关闭更多选项下拉菜单
function closeMoreOptions() {
  moreOptionsDropdown.classList.remove('show');
}

// 导出规则
function exportRules() {
  if (rules.length === 0) {
    alert('没有规则可以导出');
    return;
  }
  
  // 创建包含规则数据的对象
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    rules: JSON.parse(JSON.stringify(rules)) // 深拷贝，防止意外修改
  };
  
  // 创建Blob对象
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  
  // 创建下载链接
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `auto-fill-rules-backup-${new Date().toISOString().slice(0, 19)}.json`;
  document.body.appendChild(a);
  a.click();
  
  // 清理
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
  // 关闭下拉菜单
  closeMoreOptions();
}

// 导入规则
function importRules() {
  // 创建文件输入元素
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.onchange = handleFileSelect;
  document.body.appendChild(fileInput);
  fileInput.click();
  document.body.removeChild(fileInput);
  // 关闭下拉菜单
  closeMoreOptions();
}

// 处理文件选择
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      
      // 验证数据格式
      if (!data.rules || !Array.isArray(data.rules)) {
        alert('无效的规则文件格式');
        return;
      }
      
      // 保存待导入的规则
      window.tempImportedRules = data.rules;
      
      // 显示确认对话框
      showImportModal();
    } catch (error) {
      console.error('解析规则文件失败:', error);
      alert('解析规则文件失败，请检查文件格式');
    }
  };
  reader.readAsText(file);
}

// 显示导入确认模态框
function showImportModal() {
  importModal.style.display = 'block';
}

// 隐藏导入确认模态框
function hideImportModal() {
  importModal.style.display = 'none';
  window.tempImportedRules = null;
}

// 确认导入规则
async function confirmImportRules() {
  if (!window.tempImportedRules) {
    alert('没有待导入的规则');
    return;
  }
  
  // 将导入的规则赋值给全局rules变量
  rules = window.tempImportedRules;
  
  // 保存规则
  await saveRules();
  
  // 关闭模态框并清理临时数据
  hideImportModal();
  window.tempImportedRules = null;
  
  // 显示成功消息
  showNotification(`成功导入 ${rules.length} 条规则`);
}

// 处理规则列表点击事件
function handleRuleListClick(e) {
  const target = e.target;
  
  // 编辑按钮
  if (target.classList.contains('btn-edit') || target.closest('.btn-edit')) {
    const button = target.classList.contains('btn-edit') ? target : target.closest('.btn-edit');
    const ruleId = button.getAttribute('data-rule-id');
    if (ruleId) {
      editRule(ruleId);
    }
  }
  
  // 删除按钮
  if (target.classList.contains('btn-danger') || target.closest('.btn-danger')) {
    const button = target.classList.contains('btn-danger') ? target : target.closest('.btn-danger');
    const ruleId = button.getAttribute('data-rule-id');
    if (ruleId) {
      deleteRule(ruleId);
    }
  }
}

// 切换Tab
function switchTab(tab) {
  currentTab = tab;
  
  // 更新按钮状态
  tabButtons.forEach(btn => {
    if (btn.getAttribute('data-tab') === tab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // 更新内容显示
  document.getElementById('currentTab').classList.toggle('active', tab === 'current');
  document.getElementById('allTab').classList.toggle('active', tab === 'all');
  
  // 渲染对应tab的内容
  renderCurrentTab();
}

// 渲染当前Tab
function renderCurrentTab() {
  if (currentTab === 'current') {
    renderCurrentUrlRules();
  } else {
    renderAllRulesByUrl();
  }
}

// 加载规则 - 优化：批量读取
async function loadRules() {
  try {
    // 批量读取所有需要的数据
    const result = await chrome.storage.local.get(['rules', 'autoFillEnabled']);
    rules = result.rules || [];
    // 清空缓存，因为规则可能已更新
    matchCache.clear();
    renderCurrentTab();
  } catch (error) {
    console.error('加载规则失败:', error);
  }
}

// 保存规则 - 优化：防抖渲染
async function saveRules() {
  try {
    await chrome.storage.local.set({ rules });
    // 清空匹配缓存
    matchCache.clear();
    // 防抖渲染，避免频繁更新
    debounceRender();
  } catch (error) {
    console.error('保存规则失败:', error);
    alert('保存规则失败，请重试');
  }
}

// 防抖渲染函数
function debounceRender() {
  if (renderDebounceTimer) {
    clearTimeout(renderDebounceTimer);
  }
  renderDebounceTimer = setTimeout(() => {
    renderCurrentTab();
    renderDebounceTimer = null;
  }, 100);
}

// 渲染当前网址匹配的规则 - 优化：使用DocumentFragment减少重排
function renderCurrentUrlRules() {
  if (!currentPageUrl) {
    currentRulesList.innerHTML = `
      <div class="empty-state">
        <p>无法获取当前页面网址</p>
      </div>
    `;
    return;
  }

  const matchingRules = rules.filter(rule => matchesCurrentUrl(rule));

  // 使用DocumentFragment优化DOM操作
  const fragment = document.createDocumentFragment();
  const container = document.createElement('div');

  if (matchingRules.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>当前网址没有匹配的规则</p>
        <p style="font-size: 12px; color: #999; margin-top: 10px;">当前网址: ${escapeHtml(currentPageUrl)}</p>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="current-url-info">
        <p><strong>当前网址:</strong> <span style="color: #666; font-size: 12px;">${escapeHtml(currentPageUrl)}</span></p>
        <p style="font-size: 12px; color: #999; margin-top: 5px;">找到 ${matchingRules.length} 个匹配的规则</p>
      </div>
      ${matchingRules.map(rule => renderRuleItem(rule)).join('')}
    `;
  }

  fragment.appendChild(container);
  currentRulesList.innerHTML = '';
  currentRulesList.appendChild(fragment.firstElementChild);
}

// 按网址分组渲染所有规则 - 优化：使用DocumentFragment和批量操作
function renderAllRulesByUrl() {
  if (rules.length === 0) {
    allRulesList.innerHTML = `
      <div class="empty-state">
        <p>还没有添加任何规则</p>
      </div>
    `;
    return;
  }

  // 按网址分组 - 优化：使用Map提高性能
  const urlGroups = new Map();
  for (const rule of rules) {
    if (rule.urls && rule.urls.length > 0) {
      for (const url of rule.urls) {
        if (!urlGroups.has(url)) {
          urlGroups.set(url, []);
        }
        urlGroups.get(url).push(rule);
      }
    } else {
      // 没有绑定网址的规则
      if (!urlGroups.has('__no_url__')) {
        urlGroups.set('__no_url__', []);
      }
      urlGroups.get('__no_url__').push(rule);
    }
  }

  // 渲染分组 - 使用DocumentFragment优化
  const fragment = document.createDocumentFragment();
  const container = document.createElement('div');
  const urlKeys = Array.from(urlGroups.keys()).sort();
  
  container.innerHTML = urlKeys.map(url => {
    const urlRules = urlGroups.get(url);
    const displayUrl = url === '__no_url__' ? '未绑定网址' : url;
    
    return `
      <div class="url-group">
        <div class="url-group-header">
          <h3 class="url-group-title">${escapeHtml(displayUrl)}</h3>
          <span class="url-group-count">${urlRules.length} 个规则</span>
        </div>
        <div class="url-group-rules">
          ${urlRules.map(rule => renderRuleItem(rule)).join('')}
        </div>
      </div>
    `;
  }).join('');

  fragment.appendChild(container);
  allRulesList.innerHTML = '';
  allRulesList.appendChild(fragment.firstElementChild);
}

// 渲染单个规则项
function renderRuleItem(rule) {
  return `
    <div class="rule-item">
      <div class="rule-header">
        <div>
          <span class="rule-id">规则ID: ${rule.id.substring(0, 8)}...</span>
          <span class="rule-badge badge-${rule.selectorType}">${rule.selectorType.toUpperCase()}</span>
        </div>
        <div class="rule-actions">
          <button class="btn btn-edit" data-rule-id="${rule.id}">编辑</button>
          <button class="btn btn-danger" data-rule-id="${rule.id}">删除</button>
        </div>
      </div>
      <div class="rule-info">
        <span><strong>填充值:</strong> ${escapeHtml(rule.fillValue || '-')}</span>
      </div>
      ${rule.urls && rule.urls.length > 0 ? `
        <div class="rule-urls">
          <strong>绑定网址:</strong>
          ${rule.urls.map(url => `<span class="url-tag">${escapeHtml(url)}</span>`).join('')}
        </div>
      ` : ''}
      <div class="rule-selector">${escapeHtml(rule.selector)}</div>
    </div>
  `;
}

// 渲染网址列表
function renderUrlsList() {
  if (currentUrls.length === 0) {
    urlsList.innerHTML = '<div style="color: #999; font-size: 12px; padding: 8px;">暂无网址，请添加</div>';
    return;
  }

  urlsList.innerHTML = currentUrls.map((url, index) => `
    <div class="url-item">
      <span>${escapeHtml(url)}</span>
      <button type="button" class="btn-remove-url" data-url-index="${index}">删除</button>
    </div>
  `).join('');
}

// 添加网址
function addUrlFromInput() {
  const url = urlInput.value.trim();
  if (!url) {
    alert('请输入网址');
    return;
  }

  // 验证URL格式
  if (!isValidUrl(url)) {
    alert('请输入有效的网址格式（例如: https://example.com）');
    return;
  }

  // 检查是否已存在
  if (currentUrls.includes(url)) {
    alert('该网址已存在');
    return;
  }

  currentUrls.push(url);
  urlInput.value = '';
  renderUrlsList();
}

// 添加当前网址
async function addCurrentUrl() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const url = normalizeUrl(tab.url);
      if (!currentUrls.includes(url)) {
        currentUrls.push(url);
        renderUrlsList();
        urlInput.value = url; // 将当前网址填入输入框
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
function removeUrl(index) {
  currentUrls.splice(index, 1);
  renderUrlsList();
}

// 验证URL格式
function isValidUrl(url) {
  try {
    // 允许相对路径和完整URL
    if (url.startsWith('/') || url.startsWith('./')) {
      return true;
    }
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// 打开模态框
async function openModal(ruleId = null, prefillXPath = null) {
  editingRuleId = ruleId;
  currentUrls = [];

  if (ruleId) {
    const rule = rules.find(r => r.id === ruleId);
    if (rule) {
      modalTitle.textContent = '编辑规则';
      currentUrls = [...(rule.urls || [])];
      document.getElementById('selectorType').value = rule.selectorType;
      document.getElementById('selector').value = rule.selector;
      document.getElementById('fillValue').value = rule.fillValue || '';

      // 如果编辑时没有网址，自动添加当前网址
      if (currentUrls.length === 0) {
        await addCurrentUrl();
      }
    }
  } else {
    modalTitle.textContent = '添加规则';
    ruleForm.reset();
    await addCurrentUrl();
    if (prefillXPath) {
      document.getElementById('selectorType').value = 'xpath';
      document.getElementById('selector').value = prefillXPath;
    }
  }

  renderUrlsList();
  ruleModal.style.display = 'block';
  document.getElementById('fillValue').focus();
}

// 关闭模态框
function closeModalWindow() {
  ruleModal.style.display = 'none';
  editingRuleId = null;
  currentUrls = [];
  ruleForm.reset();
  renderUrlsList();
}

// 处理表单提交
async function handleFormSubmit(e) {
  e.preventDefault();
  
  if (currentUrls.length === 0) {
    alert('请至少添加一个网址');
    return;
  }

  const ruleData = {
    selectorType: document.getElementById('selectorType').value,
    selector: document.getElementById('selector').value.trim(),
    fillValue: document.getElementById('fillValue').value.trim(),
    urls: [...currentUrls]
  };

  if (editingRuleId) {
    // 编辑规则
    const index = rules.findIndex(r => r.id === editingRuleId);
    if (index !== -1) {
      rules[index] = { ...rules[index], ...ruleData };
    }
  } else {
    // 添加新规则
    const newRule = {
      id: generateUUID(),
      ...ruleData,
      createdAt: new Date().toISOString()
    };
    rules.push(newRule);
  }

  await saveRules();
  closeModalWindow();
}

// 编辑规则
function editRule(ruleId) {
  openModal(ruleId);
}

// 删除规则
async function deleteRule(ruleId) {
  if (confirm('确定要删除这个规则吗？')) {
    rules = rules.filter(r => r.id !== ruleId);
    await saveRules();
  }
}

// 生成UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 打开popup时自动停止选择模式
async function stopActivePicker() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      await chrome.tabs.sendMessage(tab.id, { action: 'stopPicker' });
    }
  } catch {}
}

// 切换元素选择器模式
async function toggleElementPicker() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
    alert('无法在此页面上使用元素选择器');
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'startPicker' });
  } catch {
    alert('无法在此页面使用元素选择器，请刷新页面后重试');
    return;
  }
  window.close();
}

function showNotification(message) {
  // 简单的通知实现
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 12px 20px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 10000;
    font-size: 14px;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 2000);
}

// 将函数暴露到全局作用域（保留以兼容可能的其他调用）
window.editRule = editRule;
window.deleteRule = deleteRule;
window.removeUrl = removeUrl;