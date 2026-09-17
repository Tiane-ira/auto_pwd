/**
 * AutoFill Content Script - 主入口与消息通信模块
 */
(function() {
  if (window.__AUTO_FILL_CONTENT_SCRIPT_INITIALIZED__) {
    return;
  }
  window.__AUTO_FILL_CONTENT_SCRIPT_INITIALIZED__ = true;

  const AutoFill = window.__AutoFill__;
  const { utils, picker, filler, keyIcon } = AutoFill;

  // 监听来自 popup 和 background 的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') {
      sendResponse({ success: true, pong: true, pickerActive: picker.isPickerActive() });
      return true;
    }
    if (request.action === 'executeRule') {
      filler.executeRule(request.rule, request.groupName || null)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }
    if (request.action === 'executeAllAutoRules') {
      filler.invalidateCache();
      filler.executeMatchingRules(request.groupName || null)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }
    if (request.action === 'startPicker') {
      try {
        picker.startElementPicker();
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }
    if (request.action === 'stopPicker') {
      try {
        picker.stopElementPicker();
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }
  });

  // 页面加载完成后自动执行匹配的规则
  function autoExecuteRules() {
    keyIcon.init();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        filler.executeMatchingRules().catch(console.error);
      });
    } else {
      filler.executeMatchingRules().catch(console.error);
    }
  }

  // 监听URL变化（SPA单页应用导航）
  let lastUrl = location.href;
  let urlChangeTimer = null;
  let isExecuting = false;

  const urlObserver = new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      
      if (urlChangeTimer) {
        clearTimeout(urlChangeTimer);
      }
      
      urlChangeTimer = setTimeout(() => {
        if (!isExecuting) {
          isExecuting = true;
          filler.executeMatchingRules()
            .catch(console.error)
            .finally(() => {
              isExecuting = false;
            });
        }
      }, 500);
    }
  });

  urlObserver.observe(document, { 
    subtree: false, 
    childList: true,
    attributes: false,
    characterData: false
  });

  autoExecuteRules();
})();
