/**
 * AutoFill Content Script - 连续套索选取器模块
 */
(function() {
  window.__AutoFill__ = window.__AutoFill__ || {};
  const utils = window.__AutoFill__.utils;
  const xpathUtil = window.__AutoFill__.xpath;

  let pickerActive = false;
  let pickerStyle = null;

  async function getCurrentUrlRuleFieldsCount() {
    try {
      const result = await chrome.storage.local.get(['rules']);
      const rule = (result.rules || []).find(r => utils.matchesCurrentUrl(r));
      if (rule) {
        utils.normalizeContentRule(rule);
        return rule.fields ? rule.fields.length : 0;
      }
    } catch {}
    return 0;
  }

  function showPickerToolbar(count = 0) {
    let bar = document.getElementById('__picker_toolbar__');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = '__picker_toolbar__';
      bar.style.cssText = `
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        color: #F8FAFC;
        padding: 8px 16px 8px 20px;
        border-radius: 28px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        user-select: none;
        animation: toastSlideIn 0.25s ease-out;
      `;

      bar.innerHTML = `
        <span style="font-size: 16px;">🎯</span>
        <span id="__picker_toolbar_msg__">表单项连续选取模式已开启：点击页面输入框添加到本网址 (已添加 <strong id="__picker_count__" style="color: #38BDF8;">${count}</strong> 项)</span>
        <button id="__picker_done_btn__" type="button" style="
          background: #4F46E5;
          color: #FFFFFF;
          border: none;
          padding: 6px 14px;
          border-radius: 16px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
          white-space: nowrap;
        ">完成选取 (Esc)</button>
      `;

      (document.body || document.documentElement).appendChild(bar);

      const doneBtn = document.getElementById('__picker_done_btn__');
      if (doneBtn) {
        doneBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          stopElementPicker();
          showPickerToast('🎉 表单项选取完成！已保存本页面表单项，打开插件面板可配置填充数据');
        });
      }
    }
  }

  function updatePickerToolbar(count, latestName = null) {
    const msg = document.getElementById('__picker_toolbar_msg__');
    if (!msg) return;
    if (latestName) {
      msg.innerHTML = `已添加表单项: <strong style="color: #4ADE80;">「${escapeHtml(latestName)}」</strong> (当前共 <strong style="color: #38BDF8;">${count}</strong> 项)，可继续点击其他输入框`;
    } else {
      msg.innerHTML = `表单项连续选取中：点击页面输入框添加到本网址 (当前已添加 <strong style="color: #38BDF8;">${count}</strong> 项)`;
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function flashElementHighlight(el, color = '#10B981') {
    if (!el || !el.style) return;
    const origOutline = el.style.outline;
    const origBoxShadow = el.style.boxShadow;
    const origTransition = el.style.transition;
    el.style.transition = 'all 0.2s ease';
    el.style.outline = `3px solid ${color} !important`;
    el.style.boxShadow = `0 0 12px ${color}88 !important`;
    setTimeout(() => {
      el.style.outline = origOutline;
      el.style.boxShadow = origBoxShadow;
      el.style.transition = origTransition;
    }, 700);
  }

  async function startElementPicker() {
    if (pickerActive) return;
    pickerActive = true;
    if (!document.getElementById('__picker_style__')) {
      pickerStyle = document.createElement('style');
      pickerStyle.id = '__picker_style__';
      pickerStyle.textContent = `
        body.__picker_active__ *:hover {
          outline: 2px solid #5B6AF0 !important;
          background: rgba(91, 106, 240, 0.06) !important;
          cursor: crosshair !important;
        }
        #__picker_toolbar__ button:hover {
          background: #4338CA !important;
        }
      `;
      (document.head || document.documentElement).appendChild(pickerStyle);
    }
    if (document.body) {
      document.body.classList.add('__picker_active__');
      document.body.style.cursor = 'crosshair';
    }

    const currentCount = await getCurrentUrlRuleFieldsCount();
    showPickerToolbar(currentCount);

    document.addEventListener('click', onPickerClick, true);
    document.addEventListener('keydown', onPickerKeyDown, true);
  }

  function stopElementPicker() {
    pickerActive = false;
    if (document.body) {
      document.body.classList.remove('__picker_active__');
      document.body.style.cursor = '';
    }
    const styleEl = document.getElementById('__picker_style__');
    if (styleEl) styleEl.remove();
    pickerStyle = null;

    const toolbar = document.getElementById('__picker_toolbar__');
    if (toolbar) toolbar.remove();

    const toast = document.getElementById('__picker_toast__');
    if (toast) toast.remove();

    document.removeEventListener('click', onPickerClick, true);
    document.removeEventListener('keydown', onPickerKeyDown, true);
  }

  async function onPickerClick(e) {
    if (!pickerActive) return;
    // 忽略自身悬浮工具栏、提示框及内部 Shadow DOM
    if (e.target && (
      e.target.id === '__picker_toolbar__' ||
      e.target.closest('#__picker_toolbar__') ||
      e.target.id === '__picker_toast__' ||
      e.target.closest('#__picker_toast__') ||
      e.target.closest('#__auto_pwd_root__')
    )) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const element = e.target;
    const xpath = xpathUtil.generateSmartXPath(element);
    if (!xpath) return;

    utils.copyToClipboard(xpath);

    try {
      const result = await chrome.storage.local.get(['rules']);
      let rules = (result.rules || []).map(utils.normalizeContentRule);
      const currentUrl = utils.normalizeUrl(window.location.href);

      // 查找当前目标网址是否已存在规则（一个目标网址只有一组表单项）
      let ruleIndex = rules.findIndex(r => utils.matchesCurrentUrl(r));
      let rule;
      let isNewRule = false;

      if (ruleIndex !== -1) {
        rule = rules[ruleIndex];
      } else {
        isNewRule = true;
        rule = {
          id: utils.generateUUID(),
          urls: [currentUrl],
          selectorType: 'xpath',
          fields: [],
          selector: xpath,
          fillGroups: [
            {
              id: utils.generateUUID(),
              name: '默认分组',
              isDefault: true,
              values: {}
            }
          ],
          fillValue: '',
          createdAt: new Date().toISOString()
        };
      }

      // 检查 XPath 是否重复（通过 XPath 进行去重）
      const isDuplicate = rule.fields.some(f => f.selector && f.selector.trim() === xpath.trim());
      if (isDuplicate) {
        const existingField = rule.fields.find(f => f.selector && f.selector.trim() === xpath.trim());
        const fieldDisplayName = existingField ? existingField.name : '该表单项';
        flashElementHighlight(element, '#F59E0B');
        showPickerToast(`⚠️ ${fieldDisplayName} 已在列表中 (XPath 已去重，无需重复添加)`);
        return;
      }

      // 推断友好的表单项名称
      let fieldName = utils.inferElementLabel(element);
      if (!fieldName) {
        fieldName = `表单项 ${rule.fields.length + 1}`;
      }

      const newFieldId = utils.generateUUID();
      const newField = {
        id: newFieldId,
        name: fieldName,
        selector: xpath
      };

      rule.fields.push(newField);
      rule.selector = rule.fields[0].selector;

      // 为所有数据分组同步补充该表单项，初值为空字符串
      if (!rule.fillGroups || rule.fillGroups.length === 0) {
        rule.fillGroups = [{ id: utils.generateUUID(), name: '默认分组', isDefault: true, values: {} }];
      }
      rule.fillGroups.forEach(g => {
        if (!g.values) g.values = {};
        g.values[newFieldId] = '';
      });

      if (isNewRule) {
        rules.push(rule);
      } else {
        rules[ruleIndex] = rule;
      }

      await chrome.storage.local.set({ rules });

      // 同步更新钥匙图标管理器
      if (window.__AutoFill__.filler && window.__AutoFill__.filler.updateRulesCache) {
        window.__AutoFill__.filler.updateRulesCache(rules);
      }

      // 高亮与反馈
      flashElementHighlight(element, '#10B981');
      updatePickerToolbar(rule.fields.length, fieldName);
      showPickerToast(`✅ 已添加「${fieldName}」（本页面共 ${rule.fields.length} 个表单项，可继续选取）`);
    } catch (err) {
      console.error('套索添加表单项失败:', err);
      showPickerToast(`❌ 添加表单项失败: ${err.message}`);
    }
  }

  function showPickerToast(message) {
    if (!document.getElementById('__picker_toast_style__')) {
      const style = document.createElement('style');
      style.id = '__picker_toast_style__';
      style.textContent = '@keyframes toastSlideIn{from{opacity:0;transform:translateX(-50%) translateY(-12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
      (document.head || document.documentElement).appendChild(style);
    }
    const old = document.getElementById('__picker_toast__');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.id = '__picker_toast__';
    toast.style.cssText = `
      position: fixed; top: 68px; left: 50%; transform: translateX(-50%);
      background: #5B6AF0; color: #fff; padding: 10px 18px; border-radius: 8px;
      font-size: 13px; z-index: 2147483647;
      box-shadow: 0 4px 20px rgba(91,106,240,0.35);
      white-space: nowrap; max-width: 90vw; overflow: hidden; text-overflow: ellipsis;
      animation: toastSlideIn 0.25s ease-out;
    `;
    toast.textContent = message;
    (document.body || document.documentElement).appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s';
      toast.addEventListener('transitionend', () => toast.remove());
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  function onPickerKeyDown(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
      e.preventDefault();
      e.stopPropagation();
      stopElementPicker();
      showPickerToast('已退出元素选取模式');
      setTimeout(() => {
        const toast = document.getElementById('__picker_toast__');
        if (toast) toast.remove();
      }, 1200);
    }
  }

  window.__AutoFill__.picker = {
    startElementPicker,
    stopElementPicker,
    showPickerToast,
    isPickerActive: () => pickerActive
  };
})();
