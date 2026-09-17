/**
 * AutoFill Popup - 规则展示与列表视图渲染模块
 */
import { normalizeRule, generateUUID } from './storage.js';
import { matchesCurrentUrl } from './url-manager.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// 渲染单个规则卡片项（将该网址下的所有表单项作为一个整体展示）
export function renderRuleItem(rule) {
  normalizeRule(rule);
  const fields = rule.fields || [];
  const groups = rule.fillGroups || [];
  const defaultGroup = groups.find(g => g.isDefault) || groups[0];

  const defaultFieldPreviews = fields.map(f => {
    const val = (defaultGroup && defaultGroup.values && typeof defaultGroup.values[f.id] === 'string')
      ? defaultGroup.values[f.id]
      : '';
    return `<span style="margin-right: 8px;"><strong>${escapeHtml(f.name)}:</strong> <span style="color: #1A1D26;">${escapeHtml(val !== '' ? val : '(空)')}</span></span>`;
  }).join('');

  const groupsPreview = groups.map((g, gIdx) => {
    const summary = fields.map(f => {
      const val = (g.values && typeof g.values[f.id] === 'string') ? g.values[f.id] : '';
      return `${f.name}: ${val !== '' ? val : '""'}`;
    }).join(' | ');

    return `
      <span class="rule-group-tag ${g.isDefault ? 'is-default' : ''}" data-rule-id="${rule.id}" data-group-index="${gIdx}" title="点击编辑此组「${escapeHtml(g.name)}」数据: ${escapeHtml(summary)}" style="cursor: pointer;">
        <span class="rule-group-tag-name">${escapeHtml(g.name)}</span>
        ${g.isDefault ? '<span style="font-size: 9px; margin-left: 2px;">★</span>' : ''}
      </span>
    `;
  }).join('');

  const fieldsListPreview = fields.map(f => `
    <div style="font-size: 11px; color: #475569; margin-top: 2px;">
      <span style="font-weight: 500;">${escapeHtml(f.name)}:</span>
      <span style="font-family: monospace; color: #64748B;">${escapeHtml(f.selector)}</span>
    </div>
  `).join('');

  return `
    <div class="rule-item">
      <div class="rule-header">
        <div>
          <span class="rule-id">规则ID: ${rule.id.substring(0, 8)}...</span>
          <span class="rule-badge badge-xpath">${fields.length} 个表单项 · ${groups.length} 套数据</span>
        </div>
        <div class="rule-actions">
          <button class="btn btn-edit" data-rule-id="${rule.id}">编辑</button>
          <button class="btn btn-danger" data-rule-id="${rule.id}">删除</button>
        </div>
      </div>
      <div class="rule-info">
        <div>
          <div style="font-size: 11px; color: #64748B; margin-bottom: 2px;">
            默认填充值 (组: ${escapeHtml(defaultGroup ? defaultGroup.name : '默认')}):
          </div>
          <div>${defaultFieldPreviews}</div>
        </div>
        <div class="rule-groups-preview" style="margin-top: 6px;">
          ${groupsPreview}
        </div>
      </div>
      ${rule.urls && rule.urls.length > 0 ? `
        <div class="rule-urls">
          <strong>绑定网址:</strong>
          ${rule.urls.map(url => `<span class="url-tag">${escapeHtml(url)}</span>`).join('')}
        </div>
      ` : ''}
      <div class="rule-selector" style="margin-top: 6px;">
        <strong style="font-size: 11px; color: #64748B;">包含表单项:</strong>
        ${fieldsListPreview}
      </div>
    </div>
  `;
}

// 渲染当前网址数据组快捷切换工具栏
export function renderUrlGroupsToolbar(toolbarEl, pillsEl, matchingRules) {
  if (!toolbarEl || !pillsEl) return;

  if (!matchingRules || matchingRules.length === 0) {
    toolbarEl.style.display = 'none';
    return;
  }

  const groupNames = new Set();
  const groupDefaultCount = new Map();

  matchingRules.forEach(rule => {
    normalizeRule(rule);
    rule.fillGroups.forEach(g => {
      groupNames.add(g.name);
      if (g.isDefault) {
        groupDefaultCount.set(g.name, (groupDefaultCount.get(g.name) || 0) + 1);
      }
    });
  });

  const allNames = Array.from(groupNames);
  if (allNames.length === 0) {
    toolbarEl.style.display = 'none';
    return;
  }

  let currentDefaultGroup = allNames[0];
  let maxCount = -1;
  for (const name of allNames) {
    const count = groupDefaultCount.get(name) || 0;
    if (count > maxCount) {
      maxCount = count;
      currentDefaultGroup = name;
    }
  }

  pillsEl.innerHTML = allNames.map(name => {
    const isDef = (name === currentDefaultGroup);
    return `
      <button type="button" class="url-group-pill ${isDef ? 'active' : ''}" data-group-name="${escapeHtml(name)}" title="点击将「${escapeHtml(name)}」设为当前网址默认填充组">
        <span>${escapeHtml(name)}</span>
        ${isDef ? '<span class="pill-badge">默认</span>' : ''}
      </button>
    `;
  }).join('');

  toolbarEl.style.display = 'block';
}

// 渲染当前网址列表
export function renderCurrentUrlRules({
  currentRulesListEl,
  toolbarEl,
  pillsEl,
  rules,
  currentPageUrl,
  matchCache
}) {
  if (!currentRulesListEl) return;

  if (!currentPageUrl) {
    if (toolbarEl) toolbarEl.style.display = 'none';
    currentRulesListEl.innerHTML = `
      <div class="empty-state">
        <p>无法获取当前页面网址</p>
      </div>
    `;
    return;
  }

  const matchingRules = rules.filter(rule => matchesCurrentUrl(rule, currentPageUrl, matchCache));
  renderUrlGroupsToolbar(toolbarEl, pillsEl, matchingRules);

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

  currentRulesListEl.innerHTML = '';
  currentRulesListEl.appendChild(container);
}

// 按网址分组渲染所有规则
export function renderAllRulesByUrl(allRulesListEl, rules) {
  if (!allRulesListEl) return;
  if (rules.length === 0) {
    allRulesListEl.innerHTML = `
      <div class="empty-state">
        <p>还没有添加任何规则</p>
      </div>
    `;
    return;
  }

  const urlGroups = new Map();
  rules.forEach(rule => {
    if (rule.urls && rule.urls.length > 0) {
      rule.urls.forEach(url => {
        if (!urlGroups.has(url)) {
          urlGroups.set(url, []);
        }
        urlGroups.get(url).push(rule);
      });
    } else {
      if (!urlGroups.has('__no_url__')) {
        urlGroups.set('__no_url__', []);
      }
      urlGroups.get('__no_url__').push(rule);
    }
  });

  const urlKeys = Array.from(urlGroups.keys()).sort();
  const container = document.createElement('div');
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

  allRulesListEl.innerHTML = '';
  allRulesListEl.appendChild(container);
}
