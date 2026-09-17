/**
 * AutoFill Popup - 界面交互主控制器入口 (ES Module)
 */
import {
  generateUUID,
  normalizeRule,
  loadRulesFromStorage,
  saveRulesToStorage,
  exportRulesToFile,
  saveAutoFillStatus
} from './modules/storage.js';

import {
  normalizeUrl,
  matchesCurrentUrl,
  renderUrlsList,
  addUrlFromInput,
  addCurrentUrl,
  removeUrl,
  getGroupNamesForUrls
} from './modules/url-manager.js';

import {
  renderFieldsEditor,
  syncCurrentFieldsFromInputs,
  addNewField,
  removeField
} from './modules/fields-editor.js';

import {
  renderGroupTabs,
  renderActiveGroupEditor,
  syncActiveGroupValuesFromInputs,
  addNewFillGroup
} from './modules/groups-editor.js';

import {
  renderCurrentUrlRules,
  renderAllRulesByUrl
} from './modules/rules-renderer.js';

import {
  toggleElementPicker,
  stopActivePicker,
  showNotification
} from './modules/picker-bridge.js';

// 全局响应式状态
let rules = [];
let editingRuleId = null;
let currentUrls = [];
let currentFields = [];
let currentFillGroups = [];
let activeGroupIndex = 0;
let currentTab = 'current';
let currentPageUrl = '';
let autoFillEnabled = true;
const matchCache = new Map();

// DOM 元素引用
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
const addGroupBtn = document.getElementById('addGroupBtn');
const addFieldBtn = document.getElementById('addFieldBtn');
const fieldsList = document.getElementById('fieldsList');
const groupTabsBar = document.getElementById('groupTabsBar');
const activeGroupEditor = document.getElementById('activeGroupEditor');
const activeGroupNameInput = document.getElementById('activeGroupNameInput');
const activeGroupDefaultCheck = document.getElementById('activeGroupDefaultCheck');
const deleteActiveGroupBtn = document.getElementById('deleteActiveGroupBtn');
const activeGroupFieldsList = document.getElementById('activeGroupFieldsList');
const urlGroupsToolbar = document.getElementById('urlGroupsToolbar');
const urlGroupsPills = document.getElementById('urlGroupsPills');
const triggerFillBtn = document.getElementById('triggerFillBtn');

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentPageUrl();
  await stopActivePicker();
  await loadState();
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

// 加载存储状态
async function loadState() {
  try {
    const data = await loadRulesFromStorage();
    rules = data.rules;
    autoFillEnabled = data.autoFillEnabled;
    if (autoFillToggle) {
      autoFillToggle.checked = autoFillEnabled;
    }
    matchCache.clear();
  } catch (error) {
    console.error('加载规则失败:', error);
  }
}

// 统一保存规则
async function saveRules() {
  matchCache.clear();
  await saveRulesToStorage(rules);
  renderCurrentTab();
}

// 渲染当前Tab
function renderCurrentTab() {
  if (currentTab === 'current') {
    renderCurrentUrlRules({
      currentRulesListEl: currentRulesList,
      toolbarEl: urlGroupsToolbar,
      pillsEl: urlGroupsPills,
      rules,
      currentPageUrl,
      matchCache
    });
  } else {
    renderAllRulesByUrl(allRulesList, rules);
  }
}

// 切换Tab
function switchTab(tab) {
  currentTab = tab;
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
  });
  document.getElementById('currentTab').classList.toggle('active', tab === 'current');
  document.getElementById('allTab').classList.toggle('active', tab === 'all');
  renderCurrentTab();
}

// 刷新编辑模态框的所有子编辑器
function updateModalEditors() {
  renderUrlsList(urlsList, currentUrls);
  renderFieldsEditor(fieldsList, currentFields, activeGroupFieldsList, handleRemoveField);
  renderGroupTabs(groupTabsBar, currentFillGroups, activeGroupIndex);
  renderActiveGroupEditor({
    activeGroupEditorEl: activeGroupEditor,
    activeGroupFieldsListEl: activeGroupFieldsList,
    activeGroupNameInputEl: activeGroupNameInput,
    activeGroupDefaultCheckEl: activeGroupDefaultCheck,
    deleteActiveGroupBtnEl: deleteActiveGroupBtn,
    currentFields,
    currentFillGroups,
    activeGroupIndex
  });
}

function syncAllModalInputs() {
  syncCurrentFieldsFromInputs(fieldsList, currentFields);
  syncActiveGroupValuesFromInputs({
    activeGroupFieldsListEl: activeGroupFieldsList,
    activeGroupNameInputEl: activeGroupNameInput,
    activeGroupDefaultCheckEl: activeGroupDefaultCheck,
    currentFillGroups,
    activeGroupIndex
  });
}

function handleRemoveField(fieldId) {
  removeField({
    currentFields,
    currentFillGroups,
    fieldId,
    onUpdated: updateModalEditors,
    syncInputs: syncAllModalInputs
  });
}

// 打开模态框（支持直达某分组进行编辑）
async function openModal(ruleId = null, targetGroupIndex = null) {
  editingRuleId = ruleId;
  currentUrls = [];
  currentFields = [];
  currentFillGroups = [];
  activeGroupIndex = 0;

  if (ruleId) {
    const rule = rules.find(r => r.id === ruleId);
    if (rule) {
      normalizeRule(rule);
      modalTitle.textContent = '编辑规则';
      currentUrls = [...(rule.urls || [])];
      currentFields = JSON.parse(JSON.stringify(rule.fields || []));
      currentFillGroups = JSON.parse(JSON.stringify(rule.fillGroups || []));

      if (targetGroupIndex !== null && targetGroupIndex !== undefined && !isNaN(targetGroupIndex)) {
        activeGroupIndex = Math.min(Math.max(0, targetGroupIndex), currentFillGroups.length - 1);
      } else {
        const defIdx = currentFillGroups.findIndex(g => g.isDefault);
        activeGroupIndex = defIdx >= 0 ? defIdx : 0;
      }

      if (currentUrls.length === 0) {
        await addCurrentUrl(currentUrls, () => renderUrlsList(urlsList, currentUrls), urlInput);
      }
    }
  } else {
    modalTitle.textContent = '添加规则';
    ruleForm.reset();
    await addCurrentUrl(currentUrls, () => renderUrlsList(urlsList, currentUrls), urlInput);

    currentFields = [
      {
        id: generateUUID(),
        name: '表单项 1',
        selector: ''
      }
    ];

    const existingGroupNames = getGroupNamesForUrls(rules, currentUrls);
    if (existingGroupNames.length > 0) {
      currentFillGroups = existingGroupNames.map((name, idx) => {
        const vals = {};
        currentFields.forEach(f => { vals[f.id] = ''; });
        return {
          id: generateUUID(),
          name,
          isDefault: idx === 0,
          values: vals
        };
      });
    } else {
      const vals = {};
      currentFields.forEach(f => { vals[f.id] = ''; });
      currentFillGroups = [
        {
          id: generateUUID(),
          name: '默认分组',
          isDefault: true,
          values: vals
        }
      ];
    }
    activeGroupIndex = 0;
  }

  updateModalEditors();
  ruleModal.style.display = 'block';
}

function closeModalWindow() {
  ruleModal.style.display = 'none';
  editingRuleId = null;
  currentUrls = [];
  currentFields = [];
  currentFillGroups = [];
  activeGroupIndex = 0;
  ruleForm.reset();
  renderUrlsList(urlsList, currentUrls);
}

// 表单提交保存
async function handleFormSubmit(e) {
  e.preventDefault();

  if (currentUrls.length === 0) {
    alert('请至少添加一个网址');
    return;
  }

  // 校验：一个目标网址只有一组表单项
  for (const url of currentUrls) {
    const existingRule = rules.find(r => r.id !== editingRuleId && r.urls && r.urls.includes(url));
    if (existingRule) {
      alert(`网址「${url}」已存在规则。\n一个目标网址只能有一组表单项，请在对应已有规则中添加表单项或修改网址。`);
      return;
    }
  }

  syncAllModalInputs();

  if (currentFields.length === 0) {
    alert('请至少添加一个表单项');
    return;
  }

  // 校验每个表单项的 XPath 是否非空且唯一（通过 XPath 去重）
  const seenSelectors = new Set();
  for (const field of currentFields) {
    const sel = (field.selector || '').trim();
    if (!sel) {
      alert(`请为表单项「${field.name || '未命名'}」填写 XPath 选择器`);
      return;
    }
    if (seenSelectors.has(sel)) {
      alert(`表单项中存在重复的 XPath 选择器：\n${sel}\n\n表单项需通过 XPath 去重，请修改后再保存。`);
      return;
    }
    seenSelectors.add(sel);
  }

  if (currentFillGroups.length === 0) {
    alert('请至少添加一个填充数据组');
    return;
  }

  currentFillGroups.forEach((g, idx) => {
    g.name = (g.name || '').trim() || (idx === 0 ? '默认分组' : `分组 ${idx + 1}`);
    if (!g.values || typeof g.values !== 'object') g.values = {};
  });

  if (!currentFillGroups.some(g => g.isDefault)) {
    currentFillGroups[0].isDefault = true;
  }

  const defaultGroup = currentFillGroups.find(g => g.isDefault) || currentFillGroups[0];
  const ruleData = {
    selectorType: 'xpath',
    fields: currentFields,
    selector: currentFields[0] ? currentFields[0].selector : '',
    fillGroups: currentFillGroups,
    fillValue: (defaultGroup && currentFields[0]) ? (defaultGroup.values[currentFields[0].id] || '') : '',
    urls: [...currentUrls]
  };

  if (editingRuleId) {
    const index = rules.findIndex(r => r.id === editingRuleId);
    if (index !== -1) {
      rules[index] = { ...rules[index], ...ruleData };
    }
  } else {
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

// 删除规则
async function deleteRule(ruleId) {
  if (confirm('确定要删除这个规则吗？')) {
    rules = rules.filter(r => r.id !== ruleId);
    await saveRules();
  }
}

// 立即填充当前页面
async function handleTriggerFill() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      await chrome.tabs.sendMessage(tab.id, { action: 'executeAllAutoRules' });
      showNotification('已触发页面表单填充');
    }
  } catch (err) {
    console.error('触发页面填充失败:', err);
    showNotification('无法填充：请确保页面已加载完成并支持脚本注入');
  }
}

// 网址数据组胶囊点击切换默认组
async function handleUrlGroupPillClick(e) {
  const pill = e.target.closest('.url-group-pill');
  if (!pill) return;
  const targetGroupName = pill.getAttribute('data-group-name');
  if (!targetGroupName) return;

  const matchingRules = rules.filter(rule => matchesCurrentUrl(rule, currentPageUrl, matchCache));
  matchingRules.forEach(rule => {
    normalizeRule(rule);
    let matched = false;
    rule.fillGroups.forEach(g => {
      if (g.name === targetGroupName) {
        g.isDefault = true;
        matched = true;
      } else {
        g.isDefault = false;
      }
    });
    if (!matched) {
      const defaultVals = {};
      rule.fields.forEach(f => {
        defaultVals[f.id] = '';
      });
      rule.fillGroups.push({
        id: generateUUID(),
        name: targetGroupName,
        values: defaultVals,
        isDefault: true
      });
      rule.fillGroups.forEach(g => {
        if (g.name !== targetGroupName) g.isDefault = false;
      });
    }
    const def = rule.fillGroups.find(g => g.isDefault) || rule.fillGroups[0];
    rule.fillValue = (def && rule.fields[0]) ? (def.values[rule.fields[0].id] || '') : '';
  });

  await saveRules();
  showNotification(`已切换默认填充组为「${targetGroupName}」`);
}

// 设置全部事件监听
function setupEventListeners() {
  addRuleBtn.addEventListener('click', () => {
    const matched = rules.find(r => matchesCurrentUrl(r, currentPageUrl, matchCache));
    if (matched) {
      openModal(matched.id);
    } else {
      openModal(null);
    }
  });

  moreOptionsBtn.addEventListener('click', () => moreOptionsDropdown.classList.toggle('show'));
  exportRulesBtn.addEventListener('click', () => {
    exportRulesToFile(rules);
    moreOptionsDropdown.classList.remove('show');
  });

  // 导入规则
  importRulesBtn.addEventListener('click', () => {
    moreOptionsDropdown.classList.remove('show');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.onchange = (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (re) => {
        try {
          const data = JSON.parse(re.target.result);
          if (!data.rules || !Array.isArray(data.rules)) {
            alert('无效的规则文件格式');
            return;
          }
          window.tempImportedRules = data.rules;
          importModal.style.display = 'block';
        } catch (err) {
          alert('解析规则文件失败，请检查文件格式');
        }
      };
      reader.readAsText(file);
    };
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
  });

  confirmImportBtn.addEventListener('click', async () => {
    if (window.tempImportedRules) {
      rules = window.tempImportedRules.map(normalizeRule);
      await saveRules();
      importModal.style.display = 'none';
      window.tempImportedRules = null;
      showNotification(`成功导入 ${rules.length} 条规则`);
    }
  });
  cancelImportBtn.addEventListener('click', () => { importModal.style.display = 'none'; });
  closeImportModal.addEventListener('click', () => { importModal.style.display = 'none'; });

  closeModal.addEventListener('click', closeModalWindow);
  cancelBtn.addEventListener('click', closeModalWindow);
  ruleForm.addEventListener('submit', handleFormSubmit);

  // 网址添加
  addUrlBtn.addEventListener('click', () => addUrlFromInput(urlInput, currentUrls, () => renderUrlsList(urlsList, currentUrls)));
  addCurrentUrlBtn.addEventListener('click', () => addCurrentUrl(currentUrls, () => renderUrlsList(urlsList, currentUrls), urlInput));
  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addUrlFromInput(urlInput, currentUrls, () => renderUrlsList(urlsList, currentUrls));
    }
  });

  // 元素选取
  pickElementBtn.addEventListener('click', toggleElementPicker);

  // 表单项与分组添加
  if (addFieldBtn) {
    addFieldBtn.addEventListener('click', () => {
      addNewField({
        currentFields,
        currentFillGroups,
        onUpdated: updateModalEditors,
        syncInputs: syncAllModalInputs
      });
    });
  }

  if (addGroupBtn) {
    addGroupBtn.addEventListener('click', () => {
      addNewFillGroup({
        currentFields,
        currentFillGroups,
        onCreated: (newIdx) => {
          activeGroupIndex = newIdx;
          updateModalEditors();
        },
        syncInputs: syncAllModalInputs
      });
    });
  }

  // 分组选项卡切换
  if (groupTabsBar) {
    groupTabsBar.addEventListener('click', (e) => {
      const pill = e.target.closest('.group-tab-pill');
      if (!pill) return;
      const index = parseInt(pill.getAttribute('data-group-index'), 10);
      if (!isNaN(index) && index !== activeGroupIndex && index < currentFillGroups.length) {
        syncAllModalInputs();
        activeGroupIndex = index;
        renderGroupTabs(groupTabsBar, currentFillGroups, activeGroupIndex);
        renderActiveGroupEditor({
          activeGroupEditorEl: activeGroupEditor,
          activeGroupFieldsListEl: activeGroupFieldsList,
          activeGroupNameInputEl: activeGroupNameInput,
          activeGroupDefaultCheckEl: activeGroupDefaultCheck,
          deleteActiveGroupBtnEl: deleteActiveGroupBtn,
          currentFields,
          currentFillGroups,
          activeGroupIndex
        });
      }
    });
  }

  // 组名与默认组事件
  if (activeGroupNameInput) {
    activeGroupNameInput.addEventListener('input', (e) => {
      if (currentFillGroups[activeGroupIndex]) {
        currentFillGroups[activeGroupIndex].name = e.target.value;
        renderGroupTabs(groupTabsBar, currentFillGroups, activeGroupIndex);
      }
    });
  }

  if (activeGroupDefaultCheck) {
    activeGroupDefaultCheck.addEventListener('change', (e) => {
      syncAllModalInputs();
      if (e.target.checked) {
        currentFillGroups.forEach((g, idx) => {
          g.isDefault = (idx === activeGroupIndex);
        });
      } else {
        currentFillGroups[activeGroupIndex].isDefault = true;
        e.target.checked = true;
      }
      renderGroupTabs(groupTabsBar, currentFillGroups, activeGroupIndex);
    });
  }

  if (deleteActiveGroupBtn) {
    deleteActiveGroupBtn.addEventListener('click', () => {
      if (currentFillGroups.length <= 1) {
        alert('至少需要保留一个填充数据组');
        return;
      }
      syncAllModalInputs();
      const wasDefault = currentFillGroups[activeGroupIndex].isDefault;
      currentFillGroups.splice(activeGroupIndex, 1);
      if (wasDefault && currentFillGroups.length > 0) {
        currentFillGroups[0].isDefault = true;
      }
      activeGroupIndex = Math.max(0, activeGroupIndex - 1);
      updateModalEditors();
    });
  }

  if (urlGroupsPills) {
    urlGroupsPills.addEventListener('click', handleUrlGroupPillClick);
  }

  if (triggerFillBtn) {
    triggerFillBtn.addEventListener('click', handleTriggerFill);
  }

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  if (autoFillToggle) {
    autoFillToggle.addEventListener('change', async (e) => {
      await saveAutoFillStatus(e.target.checked);
    });
  }

  // 规则列表点击事件代理
  const handleListClick = (e) => {
    const target = e.target;
    const groupTag = target.closest('.rule-group-tag');
    if (groupTag) {
      const ruleId = groupTag.getAttribute('data-rule-id');
      const groupIdx = parseInt(groupTag.getAttribute('data-group-index'), 10);
      if (ruleId) {
        openModal(ruleId, isNaN(groupIdx) ? 0 : groupIdx);
        return;
      }
    }
    if (target.classList.contains('btn-edit') || target.closest('.btn-edit')) {
      const btn = target.classList.contains('btn-edit') ? target : target.closest('.btn-edit');
      const ruleId = btn.getAttribute('data-rule-id');
      if (ruleId) openModal(ruleId);
    }
    if (target.classList.contains('btn-danger') || target.closest('.btn-danger')) {
      const btn = target.classList.contains('btn-danger') ? target : target.closest('.btn-danger');
      const ruleId = btn.getAttribute('data-rule-id');
      if (ruleId) deleteRule(ruleId);
    }
  };

  currentRulesList.addEventListener('click', handleListClick);
  allRulesList.addEventListener('click', handleListClick);

  // 网址删除按钮代理
  urlsList.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-remove-url')) {
      const index = parseInt(e.target.getAttribute('data-url-index'), 10);
      if (!isNaN(index)) {
        removeUrl(index, currentUrls, () => renderUrlsList(urlsList, currentUrls));
      }
    }
  });

  // 点击外部关闭模态框
  window.addEventListener('click', (e) => {
    if (e.target === ruleModal) closeModalWindow();
    if (e.target === importModal) importModal.style.display = 'none';
    if (!moreOptionsBtn.contains(e.target) && !moreOptionsDropdown.contains(e.target)) {
      moreOptionsDropdown.classList.remove('show');
    }
  });
}
