/**
 * AutoFill Content Script - XPath 智能计算与生成模块
 */
(function() {
  window.__AutoFill__ = window.__AutoFill__ || {};

  function getFullXPath(element) {
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let tag = current.tagName.toLowerCase();
      const parent = current.parentNode;
      if (parent) {
        let count = 0;
        let pos = 0;
        for (const child of parent.children) {
          if (child.tagName === current.tagName) {
            count++;
            if (child === current) pos = count;
          }
        }
        if (count > 1) tag += `[${pos}]`;
      }
      parts.unshift(tag);
      current = current.parentNode;
    }
    return '/' + parts.join('/');
  }

  function generateSmartXPath(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = element.tagName.toLowerCase();

    // 1. 如果有合法且唯一的 id，优先使用精确 id
    if (element.id && typeof element.id === 'string' && /^[a-zA-Z0-9_\-]+$/.test(element.id)) {
      const idXpath = `//${tag}[@id='${element.id}']`;
      try {
        const match = document.evaluate(idXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (match === element) return idXpath;
      } catch {}
    }

    // 2. 表单元素如果包含 name 属性，且在该页面唯一
    if (element.getAttribute('name')) {
      const name = element.getAttribute('name');
      const nameXpath = `//${tag}[@name='${name}']`;
      try {
        const match = document.evaluate(nameXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (match === element) return nameXpath;
      } catch {}
    }

    // 3. 表单元素如果包含 placeholder
    if (element.getAttribute('placeholder')) {
      const ph = element.getAttribute('placeholder');
      const phXpath = `//${tag}[@placeholder='${ph}']`;
      try {
        const match = document.evaluate(phXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (match === element) return phXpath;
      } catch {}
    }

    // 4. 生成完整层级路径
    return getFullXPath(element);
  }

  window.__AutoFill__.xpath = {
    getFullXPath,
    generateSmartXPath
  };
})();
