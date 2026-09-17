/**
 * AutoFill Content Script - 密码管理风格浮动钥匙图标管理器模块 (Shadow DOM 隔离)
 */
(function() {
  window.__AutoFill__ = window.__AutoFill__ || {};
  const utils = window.__AutoFill__.utils;

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  class KeyAutofillManager {
    constructor() {
      this.matchingRules = [];
      this.activeInput = null;
      this.hideTimeout = null;
      this.isDropdownOpen = false;
      this.initShadowDom();
      this.bindEvents();
    }

    initShadowDom() {
      if (document.getElementById('__auto_pwd_root__')) {
        const old = document.getElementById('__auto_pwd_root__');
        old.remove();
      }

      this.host = document.createElement('div');
      this.host.id = '__auto_pwd_root__';
      this.host.style.cssText = 'all: initial; position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483646;';
      
      (document.documentElement || document.body).appendChild(this.host);
      this.shadow = this.host.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = `
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        .key-icon-btn {
          position: fixed;
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          border: 1px solid #D1D5DB;
          border-radius: 4px;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
          cursor: pointer;
          z-index: 2147483646;
          color: #4F46E5;
          opacity: 0;
          pointer-events: none;
          transform: scale(0.9);
          transition: opacity 0.15s ease, transform 0.15s ease, background-color 0.12s, border-color 0.12s;
          user-select: none;
        }

        .key-icon-btn.visible {
          opacity: 0.92;
          pointer-events: auto;
          transform: scale(1);
        }

        .key-icon-btn:hover {
          opacity: 1;
          background: #F3F4F6;
          border-color: #6366F1;
          color: #4338CA;
          transform: scale(1.06);
          box-shadow: 0 2px 8px rgba(79, 70, 229, 0.25);
        }

        .key-icon-btn svg {
          width: 14px;
          height: 14px;
          display: block;
        }

        .dropdown-popup {
          position: fixed;
          min-width: 220px;
          max-width: 320px;
          background: #ffffff;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          z-index: 2147483647;
          overflow: hidden;
          opacity: 0;
          pointer-events: none;
          transform: translateY(-4px);
          transition: opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }

        .dropdown-popup.open {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }

        .dropdown-header {
          padding: 8px 12px;
          background: #F8FAFC;
          border-bottom: 1px solid #F1F5F9;
          font-size: 11px;
          font-weight: 600;
          color: #64748B;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .dropdown-list {
          max-height: 220px;
          overflow-y: auto;
          padding: 4px 0;
        }

        .dropdown-item {
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          cursor: pointer;
          transition: background 0.12s;
          border-left: 3px solid transparent;
        }

        .dropdown-item:hover {
          background: #EEF2FF;
          border-left-color: #6366F1;
        }

        .dropdown-item.is-default-item {
          background: #FAF5FF;
        }

        .dropdown-item.is-default-item:hover {
          background: #F3E8FF;
          border-left-color: #8B5CF6;
        }

        .item-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
        }

        .item-name {
          font-size: 13px;
          font-weight: 600;
          color: #1E293B;
        }

        .item-badge {
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 4px;
          background: #E0E7FF;
          color: #4338CA;
          font-weight: 500;
        }

        .item-preview {
          font-size: 11px;
          color: #64748B;
          margin-top: 3px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .dropdown-footer {
          padding: 6px 12px;
          font-size: 11px;
          color: #94A3B8;
          border-top: 1px solid #F1F5F9;
          background: #F8FAFC;
          text-align: center;
        }

        .inpage-toast {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%) translateY(10px);
          background: #1E293B;
          color: #FFFFFF;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
          z-index: 2147483647;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s, transform 0.2s;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        .inpage-toast.show {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      `;
      this.shadow.appendChild(style);

      // 钥匙按钮
      this.keyBtn = document.createElement('button');
      this.keyBtn.className = 'key-icon-btn';
      this.keyBtn.title = '自动填充数据组 (点击选择)';
      this.keyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 2l-2 2m-1.5 1.5L14 9l-1.5-1.5L11 9l-1.5-1.5L8 9c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6c0-.8-.2-1.6-.5-2.3L21 4.5V2h-2.5z"/>
          <circle cx="8" cy="15" r="2"/>
        </svg>
      `;
      this.shadow.appendChild(this.keyBtn);

      // 下拉弹窗
      this.dropdown = document.createElement('div');
      this.dropdown.className = 'dropdown-popup';
      this.dropdown.innerHTML = `
        <div class="dropdown-header">
          <span>🔑 选择填充数据组</span>
        </div>
        <div class="dropdown-list"></div>
        <div class="dropdown-footer">点击数据组一键填充整套表单</div>
      `;
      this.shadow.appendChild(this.dropdown);

      // Toast 提示条
      this.toast = document.createElement('div');
      this.toast.className = 'inpage-toast';
      this.shadow.appendChild(this.toast);
    }

    setRules(rules) {
      this.matchingRules = rules || [];
    }

    bindEvents() {
      document.addEventListener('mouseenter', (e) => this.handleElementHover(e), true);
      document.addEventListener('focusin', (e) => this.handleElementHover(e), true);
      document.addEventListener('mouseleave', (e) => this.handleElementLeave(e), true);
      document.addEventListener('focusout', (e) => this.handleElementLeave(e), true);

      this.keyBtn.addEventListener('mouseenter', () => {
        if (this.hideTimeout) {
          clearTimeout(this.hideTimeout);
          this.hideTimeout = null;
        }
      });

      this.keyBtn.addEventListener('mouseleave', () => {
        this.scheduleHide();
      });

      this.keyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleDropdown();
      });

      this.dropdown.addEventListener('mouseenter', () => {
        if (this.hideTimeout) {
          clearTimeout(this.hideTimeout);
          this.hideTimeout = null;
        }
      });

      this.dropdown.addEventListener('mouseleave', () => {
        this.scheduleHide();
      });

      this.dropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (!item) return;
        const groupName = item.dataset.groupName;
        if (groupName) {
          this.selectGroupAndFill(groupName);
        }
      });

      document.addEventListener('click', (e) => {
        if (this.isDropdownOpen) {
          this.closeDropdown();
        }
      }, true);

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isDropdownOpen) {
          this.closeDropdown();
        }
      }, true);

      window.addEventListener('scroll', () => this.updatePositions(), { passive: true });
      window.addEventListener('resize', () => this.updatePositions(), { passive: true });
    }

    isMatchingInput(el) {
      if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) {
        return false;
      }
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'image' || el.type === 'file') {
        return false;
      }
      if (!this.matchingRules || this.matchingRules.length === 0) {
        return false;
      }

      for (const rule of this.matchingRules) {
        utils.normalizeContentRule(rule);
        const fields = rule.fields || [];
        for (const field of fields) {
          try {
            if (!field.selector) continue;
            const xpathElements = window.__AutoFill__.filler.findElementsSync(field.selector);
            if (xpathElements.includes(el)) return true;
          } catch (err) {}
        }
      }
      return false;
    }

    handleElementHover(e) {
      const target = e.target;
      if (this.isMatchingInput(target)) {
        if (this.hideTimeout) {
          clearTimeout(this.hideTimeout);
          this.hideTimeout = null;
        }
        this.activeInput = target;
        this.showKeyButton();
      }
    }

    handleElementLeave(e) {
      if (e.target === this.activeInput) {
        this.scheduleHide();
      }
    }

    scheduleHide() {
      if (this.hideTimeout) clearTimeout(this.hideTimeout);
      this.hideTimeout = setTimeout(() => {
        if (!this.isDropdownOpen) {
          this.hideKeyButton();
        }
      }, 200);
    }

    showKeyButton() {
      if (!this.activeInput) return;
      const rect = this.activeInput.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const iconSize = 22;
      const paddingRight = 6;
      const top = rect.top + (rect.height - iconSize) / 2;
      const left = rect.right - iconSize - paddingRight;

      this.keyBtn.style.top = `${top}px`;
      this.keyBtn.style.left = `${left}px`;
      this.keyBtn.classList.add('visible');
    }

    hideKeyButton() {
      this.keyBtn.classList.remove('visible');
      if (!this.isDropdownOpen) {
        this.activeInput = null;
      }
    }

    updatePositions() {
      if (this.activeInput && document.body.contains(this.activeInput)) {
        const rect = this.activeInput.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const iconSize = 22;
          const paddingRight = 6;
          const top = rect.top + (rect.height - iconSize) / 2;
          const left = rect.right - iconSize - paddingRight;
          this.keyBtn.style.top = `${top}px`;
          this.keyBtn.style.left = `${left}px`;

          if (this.isDropdownOpen) {
            this.positionDropdown();
          }
          return;
        }
      }
      this.closeDropdown();
      this.hideKeyButton();
    }

    toggleDropdown() {
      if (this.isDropdownOpen) {
        this.closeDropdown();
      } else {
        this.openDropdown();
      }
    }

    openDropdown() {
      if (!this.activeInput) return;
      this.populateDropdownList();
      this.positionDropdown();
      this.dropdown.classList.add('open');
      this.isDropdownOpen = true;
      this.keyBtn.classList.add('visible');
    }

    closeDropdown() {
      this.dropdown.classList.remove('open');
      this.isDropdownOpen = false;
      this.scheduleHide();
    }

    positionDropdown() {
      if (!this.activeInput) return;
      const rect = this.activeInput.getBoundingClientRect();
      
      let top = rect.bottom + 4;
      let left = rect.right - 240;

      if (left < 10) left = 10;
      if (top + 240 > window.innerHeight && rect.top > 240) {
        top = rect.top - 240;
      }

      this.dropdown.style.top = `${top}px`;
      this.dropdown.style.left = `${left}px`;
    }

    populateDropdownList() {
      const listContainer = this.dropdown.querySelector('.dropdown-list');
      if (!listContainer) return;
      listContainer.innerHTML = '';

      const groupMap = new Map();

      this.matchingRules.forEach(rule => {
        utils.normalizeContentRule(rule);
        const fields = rule.fields || [];

        rule.fillGroups.forEach(g => {
          const name = g.name || '默认分组';
          if (!groupMap.has(name)) {
            groupMap.set(name, {
              name,
              isDefault: g.isDefault,
              previews: []
            });
          }
          const entry = groupMap.get(name);
          if (g.isDefault) entry.isDefault = true;

          fields.forEach(f => {
            const val = (g.values && typeof g.values[f.id] === 'string') ? g.values[f.id] : '';
            if (val !== '') {
              const isPassword = (f.name && f.name.includes('密')) || (f.selector && f.selector.toLowerCase().includes('password'));
              const displayVal = isPassword ? '••••••••' : val;
              entry.previews.push(`${f.name}: ${displayVal}`);
            }
          });
        });
      });

      if (groupMap.size === 0) {
        listContainer.innerHTML = '<div style="padding: 12px; font-size: 12px; color: #94A3B8; text-align: center;">当前网址暂无配置数据组</div>';
        return;
      }

      const sortedGroups = Array.from(groupMap.values()).sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return a.name.localeCompare(b.name);
      });

      sortedGroups.forEach(group => {
        const item = document.createElement('div');
        item.className = `dropdown-item ${group.isDefault ? 'is-default-item' : ''}`;
        item.dataset.groupName = group.name;

        const previewText = group.previews.length > 0 
          ? group.previews.slice(0, 3).join(', ') + (group.previews.length > 3 ? '...' : '')
          : '(空数据组)';

        item.innerHTML = `
          <div class="item-header">
            <span class="item-name">${escapeHtml(group.name)}</span>
            ${group.isDefault ? '<span class="item-badge">默认</span>' : ''}
          </div>
          <div class="item-preview">${escapeHtml(previewText)}</div>
        `;

        listContainer.appendChild(item);
      });
    }

    async selectGroupAndFill(groupName) {
      this.closeDropdown();
      try {
        await window.__AutoFill__.filler.executeMatchingRules(groupName);
        this.showToast(`已使用「${groupName}」联动填充整套表单`);
      } catch (err) {
        console.error('填充表单失败:', err);
        this.showToast('填充失败: ' + err.message);
      }
    }

    showToast(msg) {
      if (!this.toast) return;
      this.toast.textContent = msg;
      this.toast.classList.add('show');
      setTimeout(() => {
        this.toast.classList.remove('show');
      }, 2200);
    }
  }

  let instance = null;
  function initKeyIconManager() {
    if (!instance) {
      instance = new KeyAutofillManager();
    }
    return instance;
  }

  window.__AutoFill__.keyIcon = {
    KeyAutofillManager,
    init: initKeyIconManager,
    updateRules: (rules) => {
      const mgr = initKeyIconManager();
      mgr.setRules(rules);
    }
  };
})();
