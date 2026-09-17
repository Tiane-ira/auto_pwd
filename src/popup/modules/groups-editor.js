/**
 * AutoFill Popup - 数据分组选项卡与活动组同屏编辑器模块
 */
import { generateUUID } from './storage.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// 渲染数据分组选项卡 (Pill 胶囊栏)
export function renderGroupTabs(groupTabsBarEl, currentFillGroups, activeGroupIndex) {
  if (!groupTabsBarEl) return;
  groupTabsBarEl.innerHTML = currentFillGroups.map((group, index) => {
    const isActive = (index === activeGroupIndex);
    const displayName = (group.name || '').trim() || (index === 0 ? '默认分组' : `分组 ${index + 1}`);
    return `
      <button type="button" class="group-tab-pill ${isActive ? 'active' : ''} ${group.isDefault ? 'is-default' : ''}" data-group-index="${index}" title="${escapeHtml(displayName)}">
        <span>${escapeHtml(displayName)}</span>
        ${group.isDefault ? '<span class="group-tab-badge">默认</span>' : ''}
      </button>
    `;
  }).join('');
}

// 渲染当前活动分组编辑器（同屏展示并编辑此分组下的所有表单项取值）
export function renderActiveGroupEditor({
  activeGroupEditorEl,
  activeGroupFieldsListEl,
  activeGroupNameInputEl,
  activeGroupDefaultCheckEl,
  deleteActiveGroupBtnEl,
  currentFields,
  currentFillGroups,
  activeGroupIndex
}) {
  if (!activeGroupEditorEl || !activeGroupFieldsListEl) return;
  
  const group = currentFillGroups[activeGroupIndex];
  if (!group) return;

  if (activeGroupNameInputEl) {
    activeGroupNameInputEl.value = group.name || '';
  }
  if (activeGroupDefaultCheckEl) {
    activeGroupDefaultCheckEl.checked = Boolean(group.isDefault);
  }
  if (deleteActiveGroupBtnEl) {
    deleteActiveGroupBtnEl.disabled = currentFillGroups.length <= 1;
  }

  if (currentFields.length === 0) {
    activeGroupFieldsListEl.innerHTML = '<div style="color: #94A3B8; font-size: 12px; padding: 12px 0; text-align: center;">暂无表单项，请在上方添加表单项</div>';
    return;
  }

  activeGroupFieldsListEl.innerHTML = currentFields.map((field, fIdx) => {
    const fieldName = (field.name || '').trim() || `表单项 ${fIdx + 1}`;
    const val = (group.values && typeof group.values[field.id] === 'string') ? group.values[field.id] : '';
    const selectorDisplay = (field.selector || '').trim();

    return `
      <div class="active-field-row" data-field-id="${field.id}">
        <div class="active-field-meta">
          <span class="active-field-name" title="${escapeHtml(fieldName)}">${escapeHtml(fieldName)}</span>
          <span class="active-field-xpath" title="${escapeHtml(selectorDisplay || '未设置XPath')}">${escapeHtml(selectorDisplay || '未设置XPath')}</span>
        </div>
        <input type="text" class="active-field-input" data-field-id="${field.id}" placeholder="输入在该分组下的填充值(可留空)" value="${escapeHtml(val)}">
      </div>
    `;
  }).join('');

  // 监听输入实时同步
  const inputs = activeGroupFieldsListEl.querySelectorAll('.active-field-input');
  inputs.forEach(input => {
    const fid = input.getAttribute('data-field-id');
    input.addEventListener('input', (e) => {
      if (!group.values) group.values = {};
      group.values[fid] = e.target.value;
    });
  });
}

// 同步活动分组输入框中的名称、默认状态与各字段值
export function syncActiveGroupValuesFromInputs({
  activeGroupFieldsListEl,
  activeGroupNameInputEl,
  activeGroupDefaultCheckEl,
  currentFillGroups,
  activeGroupIndex
}) {
  if (!currentFillGroups || !currentFillGroups[activeGroupIndex]) return;
  const group = currentFillGroups[activeGroupIndex];
  if (!group.values) group.values = {};

  if (activeGroupNameInputEl) {
    group.name = activeGroupNameInputEl.value;
  }
  if (activeGroupDefaultCheckEl) {
    group.isDefault = activeGroupDefaultCheckEl.checked;
  }

  if (activeGroupFieldsListEl) {
    const inputs = activeGroupFieldsListEl.querySelectorAll('.active-field-input');
    inputs.forEach(input => {
      const fid = input.getAttribute('data-field-id');
      if (fid) {
        group.values[fid] = input.value;
      }
    });
  }
}

// 新增数据组并自动切换到新分组
export function addNewFillGroup({
  currentFields,
  currentFillGroups,
  name = '',
  onCreated,
  syncInputs
}) {
  if (syncInputs) syncInputs();

  const groupIndex = currentFillGroups.length + 1;
  const groupName = name.trim() || `分组 ${groupIndex}`;
  const isDefault = currentFillGroups.length === 0;

  const defaultValues = {};
  currentFields.forEach(f => {
    defaultValues[f.id] = '';
  });

  currentFillGroups.push({
    id: generateUUID(),
    name: groupName,
    isDefault,
    values: defaultValues
  });

  const newIndex = currentFillGroups.length - 1;
  if (onCreated) onCreated(newIndex);
}
