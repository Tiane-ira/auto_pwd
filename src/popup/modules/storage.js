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
  rule.selectorType = 'xpath';

  // 1. 规范化表单项列表 (fields)
  if (!rule.fields || !Array.isArray(rule.fields) || rule.fields.length === 0) {
    const fallbackSelector = typeof rule.selector === 'string' ? rule.selector : '';
    rule.fields = [
      {
        id: generateUUID(),
        name: '表单项 1',
        selector: fallbackSelector
      }
    ];
  } else {
    rule.fields = rule.fields.map((f, idx) => ({
      id: f.id || generateUUID(),
      name: (f.name || '').trim() || `表单项 ${idx + 1}`,
      selector: typeof f.selector === 'string' ? f.selector.trim() : ''
    }));
  }

  // 保持单 selector 字段与首个表单项同步（向后兼容）
  rule.selector = rule.fields[0] ? rule.fields[0].selector : '';

  // 2. 规范化数据分组列表 (fillGroups)
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
      const gValues = (g.values && typeof g.values === 'object') ? { ...g.values } : {};
      if (typeof g.value === 'string' && Object.keys(gValues).length === 0 && rule.fields[0]) {
        gValues[rule.fields[0].id] = g.value;
      }
      rule.fields.forEach(f => {
        if (typeof gValues[f.id] !== 'string') {
          gValues[f.id] = '';
        }
      });

      return {
        id: g.id || generateUUID(),
        name: (g.name || '').trim() || (idx === 0 ? '默认分组' : `分组 ${idx + 1}`),
        isDefault: Boolean(g.isDefault),
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
    version: '2.1.0',
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
