/**
 * AutoFill Content Script - 基础工具与规则模型模块
 */
(function() {
  window.__AutoFill__ = window.__AutoFill__ || {};

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
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

  // 规范化规则对象，确保 fields 与 fillGroups 结构完整
  function normalizeContentRule(rule) {
    rule.selectorType = 'xpath';

    // 1. 规范化表单项列表 (fields)
    if (!rule.fields || !Array.isArray(rule.fields) || rule.fields.length === 0) {
      const fallbackSelector = typeof rule.selector === 'string' ? rule.selector : '';
      rule.fields = [
        {
          id: 'f_default',
          name: '表单项 1',
          selector: fallbackSelector
        }
      ];
    } else {
      rule.fields = rule.fields.map((f, idx) => ({
        id: f.id || `f_${idx}`,
        name: (f.name || '').trim() || `表单项 ${idx + 1}`,
        selector: typeof f.selector === 'string' ? f.selector.trim() : ''
      }));
    }

    // 保持单 selector 与首个表单项同步（向后兼容）
    rule.selector = rule.fields[0] ? rule.fields[0].selector : '';

    // 2. 规范化数据分组列表 (fillGroups)
    if (!rule.fillGroups || !Array.isArray(rule.fillGroups) || rule.fillGroups.length === 0) {
      const defaultValues = {};
      rule.fields.forEach(f => {
        defaultValues[f.id] = typeof rule.fillValue === 'string' ? rule.fillValue : '';
      });
      rule.fillGroups = [
        {
          id: 'g_default',
          name: '默认分组',
          isDefault: true,
          values: defaultValues
        }
      ];
    } else {
      rule.fillGroups = rule.fillGroups.map((g, idx) => {
        const gValues = (g.values && typeof g.values === 'object') ? { ...g.values } : {};
        // 如果是旧版单值分组，将旧值映射到第一个表单项
        if (typeof g.value === 'string' && Object.keys(gValues).length === 0 && rule.fields[0]) {
          gValues[rule.fields[0].id] = g.value;
        }
        // 确保每个表单项在 values 中都有定义
        rule.fields.forEach(f => {
          if (typeof gValues[f.id] !== 'string') {
            gValues[f.id] = '';
          }
        });

        return {
          id: g.id || `g_${idx}`,
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

  // 复制到剪贴板
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      ta.style.opacity = '0';
      (document.body || document.documentElement).appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      ta.remove();
    } catch {}
  }

  function cleanLabelText(text) {
    return (text || '').replace(/[:：*]/g, '').replace(/\s+/g, ' ').trim();
  }

  // 智能推断表单元素的名称
  function inferElementLabel(el) {
    if (!el) return '';
    try {
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) {
          const text = (label.innerText || label.textContent || '').trim();
          if (text) return cleanLabelText(text);
        }
      }
      const parentLabel = el.closest('label');
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true);
        clone.querySelectorAll('input, select, textarea, button').forEach(n => n.remove());
        const text = (clone.innerText || clone.textContent || '').trim();
        if (text) return cleanLabelText(text);
      }
      if (el.getAttribute('aria-label')) {
        return cleanLabelText(el.getAttribute('aria-label'));
      }
      if (el.getAttribute('placeholder')) {
        return cleanLabelText(el.getAttribute('placeholder'));
      }
      let prev = el.previousElementSibling;
      while (prev) {
        if (['LABEL', 'SPAN', 'DIV', 'P'].includes(prev.tagName)) {
          const text = (prev.innerText || prev.textContent || '').trim();
          if (text && text.length <= 15) {
            return cleanLabelText(text);
          }
        }
        prev = prev.previousElementSibling;
      }
      const name = (el.getAttribute('name') || el.id || '').toLowerCase();
      if (name.includes('user') || name.includes('account') || name.includes('login') || name.includes('phone') || name.includes('mobile')) return '账号/用户名';
      if (name.includes('pass') || name.includes('pwd')) return '密码';
      if (name.includes('mail')) return '邮箱';
      if (name.includes('code') || name.includes('captcha') || name.includes('verify')) return '验证码';
      if (el.getAttribute('name')) return el.getAttribute('name').trim();
    } catch {}
    return '';
  }

  window.__AutoFill__.utils = {
    generateUUID,
    normalizeUrl,
    matchUrl,
    matchesCurrentUrl,
    normalizeContentRule,
    copyToClipboard,
    cleanLabelText,
    inferElementLabel
  };
})();
