/**
 * AutoFill Content Script - 表单多字段联动填充引擎模块
 */
(function() {
  window.__AutoFill__ = window.__AutoFill__ || {};
  const utils = window.__AutoFill__.utils;

  let autoFillStatusCache = null;
  let rulesCache = null;
  let cacheTimestamp = 0;
  const CACHE_TTL = 5000;

  function invalidateCache() {
    cacheTimestamp = 0;
  }

  function updateRulesCache(rules) {
    rulesCache = (rules || []).map(utils.normalizeContentRule);
    cacheTimestamp = Date.now();
    const matchingRules = rulesCache.filter(r => utils.matchesCurrentUrl(r));
    if (window.__AutoFill__.keyIcon && window.__AutoFill__.keyIcon.updateRules) {
      window.__AutoFill__.keyIcon.updateRules(matchingRules);
    }
  }

  // 同步查找元素（严格使用 XPath）
  function findElementsSync(selector) {
    try {
      const xpathResult = document.evaluate(
        selector,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      
      const elements = [];
      for (let i = 0; i < xpathResult.snapshotLength; i++) {
        elements.push(xpathResult.snapshotItem(i));
      }
      return elements;
    } catch (error) {
      console.error('XPath 查找元素时发生错误:', error);
      return [];
    }
  }

  // 等待元素出现，最多等待指定时间（XPath 模式）
  function waitForElements(selector, timeoutMs = 3000) {
    return new Promise((resolve) => {
      let elements = findElementsSync(selector);
      if (elements.length > 0) {
        resolve(elements);
        return;
      }
      
      const startTime = Date.now();
      const interval = setInterval(() => {
        elements = findElementsSync(selector);
        if (elements.length > 0) {
          clearInterval(interval);
          resolve(elements);
        } else if (Date.now() - startTime >= timeoutMs) {
          clearInterval(interval);
          resolve([]);
        }
      }, 50);
    });
  }

  // 检查元素是否可见
  function isElementVisible(element) {
    return element.offsetWidth > 0 
      && element.offsetHeight > 0 
      && element.getClientRects().length > 0;
  }

  // 执行填充操作并触发原生事件
  function performFill(element, value) {
    element.focus();
    element.dispatchEvent(new Event('focus', { bubbles: true }));
    
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (element.isContentEditable) {
      element.textContent = '';
    }
    
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (element.isContentEditable) {
      element.textContent = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      element.setAttribute('value', value);
    }
    
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // 填充元素
  function fillElement(element, value) {
    return new Promise((resolve, reject) => {
      try {
        if (!isElementVisible(element)) {
          setTimeout(() => {
            performFill(element, value);
            resolve();
          }, 200);
        } else {
          performFill(element, value);
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  // 执行单个规则（包含一组表单项及联动填充）
  async function executeRule(rule, targetGroupName = null) {
    utils.normalizeContentRule(rule);
    const fields = rule.fields || [];
    if (fields.length === 0) {
      throw new Error('规则未包含任何表单项');
    }

    let group = null;
    if (targetGroupName) {
      group = rule.fillGroups.find(g => g.name === targetGroupName);
    }
    if (!group) {
      group = rule.fillGroups.find(g => g.isDefault) || rule.fillGroups[0];
    }

    const results = [];
    let foundCount = 0;
    let executedCount = 0;
    let failedCount = 0;

    for (const field of fields) {
      if (!field.selector) continue;

      const valueToFill = (group && group.values && typeof group.values[field.id] === 'string')
        ? group.values[field.id]
        : '';

      try {
        const elements = await waitForElements(field.selector, 2000);
        foundCount += elements.length;

        for (const element of elements) {
          try {
            await fillElement(element, valueToFill);
            executedCount++;
            results.push({ fieldId: field.id, fieldName: field.name, success: true });
          } catch (fillErr) {
            failedCount++;
            results.push({ fieldId: field.id, fieldName: field.name, success: false, error: fillErr.message });
          }
        }
      } catch (waitErr) {
        failedCount++;
        results.push({ fieldId: field.id, fieldName: field.name, success: false, error: waitErr.message });
      }
    }

    return {
      found: foundCount,
      executed: executedCount,
      failed: failedCount,
      results
    };
  }

  // 执行匹配当前URL的所有规则
  async function executeMatchingRules(targetGroupName = null) {
    const now = Date.now();
    
    if (!autoFillStatusCache || !rulesCache || (now - cacheTimestamp) > CACHE_TTL) {
      const result = await chrome.storage.local.get(['autoFillEnabled', 'rules']);
      autoFillStatusCache = result.autoFillEnabled !== false;
      rulesCache = (result.rules || []).map(utils.normalizeContentRule);
      cacheTimestamp = now;
    }
    
    const matchingRules = (rulesCache || []).filter(rule => utils.matchesCurrentUrl(rule));
    if (window.__AutoFill__.keyIcon && window.__AutoFill__.keyIcon.updateRules) {
      window.__AutoFill__.keyIcon.updateRules(matchingRules);
    }

    if (!autoFillStatusCache && !targetGroupName) {
      return { executed: 0, message: '自动填充已关闭' };
    }
    
    if (rulesCache.length === 0) {
      return { executed: 0, message: '没有规则' };
    }
    
    if (matchingRules.length === 0) {
      return { executed: 0, message: '没有匹配当前URL的规则' };
    }
    
    const results = [];
    for (const rule of matchingRules) {
      try {
        const result = await executeRule(rule, targetGroupName);
        results.push({ 
          ruleId: rule.id, 
          success: true, 
          result 
        });
      } catch (error) {
        results.push({ 
          ruleId: rule.id, 
          success: false, 
          error: error.message 
        });
      }
    }
    
    return {
      executed: matchingRules.length,
      results
    };
  }

  // 检查某个输入框是否匹配规则列表中的任一表单项
  function isMatchingInput(inputEl, matchingRules) {
    if (!inputEl || !matchingRules || matchingRules.length === 0) return false;
    for (const rule of matchingRules) {
      utils.normalizeContentRule(rule);
      for (const field of rule.fields) {
        if (!field.selector) continue;
        try {
          const elements = findElementsSync(field.selector);
          if (elements.includes(inputEl)) {
            return true;
          }
        } catch {}
      }
    }
    return false;
  }

  window.__AutoFill__.filler = {
    executeRule,
    executeMatchingRules,
    fillElement,
    waitForElements,
    findElementsSync,
    isMatchingInput,
    invalidateCache,
    updateRulesCache
  };
})();
