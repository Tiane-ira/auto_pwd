/**
 * AutoFill Popup - 表单项编辑器模块（支持 XPath 自动去重与跨组件联动）
 */
import { generateUUID } from './storage.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// 渲染表单项定义列表
export function renderFieldsEditor(fieldsListEl, currentFields, activeGroupFieldsListEl, onRemoveField) {
  if (!fieldsListEl) return;
  fieldsListEl.innerHTML = '';

  currentFields.forEach((field, index) => {
    const row = document.createElement('div');
    row.className = 'field-row';
    row.dataset.fieldId = field.id;

    row.innerHTML = `
      <input type="text" class="field-name-input" placeholder="如: 用户名" value="${escapeHtml(field.name || '')}">
      <input type="text" class="field-selector-input" placeholder="//input[@id='username']" value="${escapeHtml(field.selector || '')}">
      <button type="button" class="btn-remove-field" title="删除该表单项" ${currentFields.length <= 1 ? 'disabled' : ''}>&times;</button>
    `;

    const nameInput = row.querySelector('.field-name-input');
    nameInput.addEventListener('input', (e) => {
      field.name = e.target.value;
      // 实时更新下方活动分组编辑器中对应的字段标签
      if (activeGroupFieldsListEl) {
        const targetRow = activeGroupFieldsListEl.querySelector(`.active-field-row[data-field-id="${field.id}"]`);
        if (targetRow) {
          const nameSpan = targetRow.querySelector('.active-field-name');
          if (nameSpan) {
            const labelText = (field.name || '').trim() || `表单项 ${index + 1}`;
            nameSpan.textContent = labelText;
            nameSpan.title = labelText;
          }
        }
      }
    });

    const selectorInput = row.querySelector('.field-selector-input');
    selectorInput.addEventListener('input', (e) => {
      field.selector = e.target.value;
      // 实时更新下方活动分组编辑器中对应的 XPath 预览
      if (activeGroupFieldsListEl) {
        const targetRow = activeGroupFieldsListEl.querySelector(`.active-field-row[data-field-id="${field.id}"]`);
        if (targetRow) {
          const xpathSpan = targetRow.querySelector('.active-field-xpath');
          if (xpathSpan) {
            xpathSpan.textContent = field.selector.trim() || '未设置XPath';
            xpathSpan.title = field.selector.trim() || '未设置XPath';
          }
        }
      }
    });

    const removeBtn = row.querySelector('.btn-remove-field');
    removeBtn.addEventListener('click', () => {
      if (onRemoveField) onRemoveField(field.id);
    });

    fieldsListEl.appendChild(row);
  });
}

// 同步表单项输入框内容到数据对象
export function syncCurrentFieldsFromInputs(fieldsListEl, currentFields) {
  if (!fieldsListEl) return;
  const rows = fieldsListEl.querySelectorAll('.field-row');
  rows.forEach((row, index) => {
    if (currentFields[index]) {
      const nameInput = row.querySelector('.field-name-input');
      const selectorInput = row.querySelector('.field-selector-input');
      if (nameInput) currentFields[index].name = nameInput.value;
      if (selectorInput) currentFields[index].selector = selectorInput.value;
    }
  });
}

// 新增表单项（严格进行 XPath 去重校验）
export function addNewField({ currentFields, currentFillGroups, name = '', selector = '', onUpdated, syncInputs }) {
  if (syncInputs) syncInputs();

  const trimmedSelector = selector.trim();
  if (trimmedSelector) {
    const isDuplicate = currentFields.some(f => f.selector.trim() === trimmedSelector);
    if (isDuplicate) {
      alert(`表单项已存在相同的 XPath 选择器：\n${trimmedSelector}\n\n已自动去重，请勿重复添加。`);
      return;
    }
  }

  const fieldIndex = currentFields.length + 1;
  const newField = {
    id: generateUUID(),
    name: name.trim() || `表单项 ${fieldIndex}`,
    selector: trimmedSelector
  };
  currentFields.push(newField);

  // 为所有现存数据组补充该表单项的空填充值
  currentFillGroups.forEach(g => {
    if (!g.values) g.values = {};
    g.values[newField.id] = '';
  });

  if (onUpdated) onUpdated();
}

// 移除表单项并清理各个数据组中对应字段的取值
export function removeField({ currentFields, currentFillGroups, fieldId, onUpdated, syncInputs }) {
  if (currentFields.length <= 1) return;
  if (syncInputs) syncInputs();

  const idx = currentFields.findIndex(f => f.id === fieldId);
  if (idx !== -1) {
    currentFields.splice(idx, 1);
  }

  currentFillGroups.forEach(g => {
    if (g.values && g.values[fieldId] !== undefined) {
      delete g.values[fieldId];
    }
  });

  if (onUpdated) onUpdated();
}
