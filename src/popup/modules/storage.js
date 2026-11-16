/**
 * AutoFill Popup - 规则数据持久化与导入导出模块
 */

export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 规范化规则对象：支持多表单项（fields）与多数据组（fillGroups）
export function normalizeRule(rule) {
  if (!rule || typeof rule !== 'object') {
    rule = {};
  }

  // 确保 rule.id 始终存在且非空
  rule.id = (typeof rule.id === 'string' && rule.id.trim()) ? rule.id.trim() : generateUUID();
  rule.selectorType = 'xpath';

  // 1. 规范化 urls 列表
  if (!Array.isArray(rule.urls)) {
    if (typeof rule.url === 'string' && rule.url.trim()) {
      rule.urls = [rule.url.trim()];
    } else {
      rule.urls = [];
    }
  } else {
    rule.urls = rule.urls.map(u => (typeof u === 'string' ? u.trim() : '')).filter(Boolean);
  }

  // 2. 规范化表单项列表 (fields)
  if (!rule.fields || !Array.isArray(rule.fields) || rule.fields.length === 0) {
    const fallbackSelector = typeof rule.selector === 'string' ? rule.selector.trim() : '';
    rule.fields = [
      {
        id: generateUUID(),
        name: '表单项 1',
        selector: fallbackSelector
      }
    ];
  } else {
    rule.fields = rule.fields.map((f, idx) => ({
      id: (f && f.id) || generateUUID(),
      name: (f && typeof f.name === 'string' ? f.name.trim() : '') || `表单项 ${idx + 1}`,
      selector: (f && typeof f.selector === 'string') ? f.selector.trim() : ''
    }));
  }

  // 保持单 selector 字段与首个表单项同步（向后兼容）
  rule.selector = rule.fields[0] ? rule.fields[0].selector : '';

  // 3. 规范化数据分组列表 (fillGroups)
  if (!rule.fillGroups || !Array.isArray(rule.fillGroups) || rule.fillGroups.length === 0) {
    const defaultValues = {};
    rule.fields.forEach(f => {
      defaultValues[f.id] = typeof rule.fillValue === 'string' ? rule.fillValue : '';
    });
    rule.fillGroups = [
      {
        id: generateUUID(),
        name: '默认分组',
        isDefault: true,
        values: defaultValues
      }
    ];
  } else {
    rule.fillGroups = rule.fillGroups.map((g, idx) => {
      const gValues = (g && g.values && typeof g.values === 'object') ? { ...g.values } : {};
      if (g && typeof g.value === 'string' && Object.keys(gValues).length === 0 && rule.fields[0]) {
        gValues[rule.fields[0].id] = g.value;
      }
      rule.fields.forEach(f => {
        if (typeof gValues[f.id] !== 'string') {
          gValues[f.id] = '';
        }
      });

      return {
        id: (g && g.id) || generateUUID(),
        name: (g && typeof g.name === 'string' ? g.name.trim() : '') || (idx === 0 ? '默认分组' : `分组 ${idx + 1}`),
        isDefault: Boolean(g && g.isDefault),
        values: gValues
      };
    });
  }

  // 确保至少有一个默认组
  if (!rule.fillGroups.some(g => g.isDefault) && rule.fillGroups.length > 0) {
    rule.fillGroups[0].isDefault = true;
  }

  const defaultGroup = rule.fillGroups.find(g => g.isDefault) || rule.fillGroups[0];
  rule.fillValue = defaultGroup && rule.fields[0] ? (defaultGroup.values[rule.fields[0].id] || '') : '';

  return rule;
}

/**
 * 解析并校验导入的规则文本（支持 JSON 字符串，兼容包装格式、纯数组及 BOM 头）
 * 返回 { success: boolean, rules?: Array, message?: string }
 */
export function parseImportRules(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    return { success: false, message: '导入内容为空' };
  }

  // 去除 UTF-8 BOM 和首尾空白
  const cleanContent = rawContent.replace(/^\uFEFF/, '').trim();
  if (!cleanContent) {
    return { success: false, message: '导入内容为空' };
  }

  let data;
  try {
    data = JSON.parse(cleanContent);
  } catch (err) {
    return { success: false, message: `JSON 语法解析失败: ${err.message}` };
  }

  let rawList = null;
  if (Array.isArray(data)) {
    rawList = data;
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data.rules)) {
      rawList = data.rules;
    } else if (Array.isArray(data.data)) {
      rawList = data.data;
    } else if (data.fields || data.selector || data.urls || data.url) {
      // 单条规则直接包装为数组
      rawList = [data];
    }
  }

  if (!rawList || !Array.isArray(rawList) || rawList.length === 0) {
    return { success: false, message: '未找到规则数组，请确保 JSON 包含 rules 列表或直接为规则数组' };
  }

  const validRules = rawList
    .filter(item => item && typeof item === 'object')
    .map(item => normalizeRule(JSON.parse(JSON.stringify(item))));

  if (validRules.length === 0) {
    return { success: false, message: '规则列表中无可用有效规则' };
  }

  return { success: true, rules: validRules };
}

/**
 * 合并导入规则与现有规则
 * @param {Array} existingRules 现有规则列表
 * @param {Array} importedRules 待导入的新规则列表
 * @returns {Array} 合并后的规则列表
 */
export function mergeRules(existingRules, importedRules) {
  const result = [...existingRules];
  importedRules.forEach(newRule => {
    let index = result.findIndex(r => r.id === newRule.id);
    if (index === -1 && newRule.urls && newRule.urls.length > 0) {
      index = result.findIndex(r => r.urls && r.urls.some(u => newRule.urls.includes(u)));
    }

    if (index !== -1) {
      result[index] = newRule;
    } else {
      result.push(newRule);
    }
  });
  return result;
}

// 从存储中加载规则与自动填充状态
export async function loadRulesFromStorage() {
  const result = await chrome.storage.local.get(['rules', 'autoFillEnabled']);
  const rules = (result.rules || []).map(normalizeRule);
  const autoFillEnabled = result.autoFillEnabled !== false;
  return { rules, autoFillEnabled };
}

// 保存规则到存储
export async function saveRulesToStorage(rules) {
  await chrome.storage.local.set({ rules });
}

// 保存自动填充开关状态
export async function saveAutoFillStatus(enabled) {
  await chrome.storage.local.set({ autoFillEnabled: enabled });
}

// 导出规则为 JSON 文件下载
export function exportRulesToFile(rules) {
  if (!rules || rules.length === 0) {
    alert('没有规则可以导出');
    return;
  }
  const exportData = {
    version: '2.1.1',
    exportedAt: new Date().toISOString(),
    rules: JSON.parse(JSON.stringify(rules))
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `auto-fill-rules-backup-${new Date().toISOString().slice(0, 19)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
