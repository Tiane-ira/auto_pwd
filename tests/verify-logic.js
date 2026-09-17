// 测试多表单项与多数据组联动填充逻辑
const assert = require('assert');

// 模拟 generateUUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 规范化规则对象：支持多表单项（fields）与多数据组（fillGroups）
function normalizeRule(rule) {
  rule.selectorType = 'xpath';

  // 1. 规范化表单项列表 (fields)
  if (!rule.fields || !Array.isArray(rule.fields) || rule.fields.length === 0) {
    // 兼容历史单选择器规则
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

  // 保持 fillValue 兼容
  const defaultGroup = rule.fillGroups.find(g => g.isDefault) || rule.fillGroups[0];
  rule.fillValue = defaultGroup && rule.fields[0] ? (defaultGroup.values[rule.fields[0].id] || '') : '';

  return rule;
}

// 获取规则在指定组名下的所有表单项填充值集合
function getRuleGroupValues(rule, targetGroupName = null) {
  normalizeRule(rule);
  let group = null;
  if (targetGroupName) {
    group = rule.fillGroups.find(g => g.name === targetGroupName);
  }
  if (!group) {
    group = rule.fillGroups.find(g => g.isDefault) || rule.fillGroups[0];
  }

  const result = {};
  rule.fields.forEach(f => {
    result[f.id] = (group && group.values && typeof group.values[f.id] === 'string') ? group.values[f.id] : '';
  });
  return result;
}

console.log('--- 运行多表单项与多数据组联动测试 ---');

// 测试 1: 旧版单字段规则平滑迁移为多表单项结构
const legacyRule = {
  id: 'rule-legacy',
  urls: ['https://example.com/login'],
  selector: "//input[@id='username']",
  fillGroups: [
    { name: '默认分组', value: 'admin', isDefault: true },
    { name: '测试账号', value: 'test_user', isDefault: false }
  ]
};

normalizeRule(legacyRule);
assert.strictEqual(legacyRule.fields.length, 1);
assert.strictEqual(legacyRule.fields[0].selector, "//input[@id='username']");
assert.strictEqual(legacyRule.fillGroups.length, 2);
const legacyFieldId = legacyRule.fields[0].id;
assert.strictEqual(legacyRule.fillGroups[0].values[legacyFieldId], 'admin');
assert.strictEqual(legacyRule.fillGroups[1].values[legacyFieldId], 'test_user');
console.log('✅ 测试 1 (旧版单字段规则平滑迁移) 通过');

// 测试 2: 完整多表单项 + 多数据组联动填充
const multiFieldRule = {
  id: 'rule-multi',
  urls: ['https://example.com/login'],
  fields: [
    { id: 'f_user', name: '用户名', selector: "//input[@id='username']" },
    { id: 'f_pass', name: '密码', selector: "//input[@id='password']" },
    { id: 'f_email', name: '邮箱', selector: "//input[@id='email']" }
  ],
  fillGroups: [
    {
      id: 'g_admin',
      name: '管理员',
      isDefault: true,
      values: {
        f_user: 'admin',
        f_pass: 'admin123',
        f_email: 'admin@corp.com'
      }
    },
    {
      id: 'g_tester',
      name: '测试员',
      isDefault: false,
      values: {
        f_user: 'tester1',
        f_pass: 'testpass',
        f_email: ''
      }
    }
  ]
};

normalizeRule(multiFieldRule);

// 提取默认组（管理员）取值：所有表单项一起获取
const defaultValues = getRuleGroupValues(multiFieldRule);
assert.strictEqual(defaultValues.f_user, 'admin');
assert.strictEqual(defaultValues.f_pass, 'admin123');
assert.strictEqual(defaultValues.f_email, 'admin@corp.com');

// 提取测试员组取值：所有表单项一起获取
const testerValues = getRuleGroupValues(multiFieldRule, '测试员');
assert.strictEqual(testerValues.f_user, 'tester1');
assert.strictEqual(testerValues.f_pass, 'testpass');
assert.strictEqual(testerValues.f_email, '');

console.log('✅ 测试 2 (多表单项多分组联动取值) 通过');

// 测试 3: 动态增加新表单项后自动同步至各个分组
multiFieldRule.fields.push({
  id: 'f_phone',
  name: '手机号',
  selector: "//input[@id='phone']"
});
normalizeRule(multiFieldRule);
const updatedValues = getRuleGroupValues(multiFieldRule, '管理员');
assert.strictEqual(updatedValues.f_phone, '', '新增字段默认值应为空字符串');

console.log('✅ 测试 3 (新增表单项后数据组自动同步缺省值) 通过');

// 测试 4: 删除表单项后，组内 values 对应 key 清理
const fieldToRemoveId = 'f_phone';
multiFieldRule.fields = multiFieldRule.fields.filter(f => f.id !== fieldToRemoveId);
multiFieldRule.fillGroups.forEach(g => {
  delete g.values[fieldToRemoveId];
});
normalizeRule(multiFieldRule);
assert.strictEqual(multiFieldRule.fields.length, 3);
assert.strictEqual(multiFieldRule.fillGroups[0].values[fieldToRemoveId], undefined);
console.log('✅ 测试 4 (删除表单项后数据组自动清理对应字段) 通过');

// 测试 5: 模拟输入框元素匹配（检查是否属于任一字段的 selector）
function mockIsMatching(rule, targetSelector) {
  normalizeRule(rule);
  return rule.fields.some(f => f.selector === targetSelector);
}
assert.strictEqual(mockIsMatching(multiFieldRule, "//input[@id='username']"), true);
assert.strictEqual(mockIsMatching(multiFieldRule, "//input[@id='password']"), true);
assert.strictEqual(mockIsMatching(multiFieldRule, "//input[@id='unknown']"), false);
console.log('✅ 测试 5 (元素选择器匹配任意表单项) 通过');

// 测试 6: 套索连续选取逻辑（一个目标网址只有一组表单项，通过 XPath 去重）
function mockPickerCollect(rules, pageUrl, fieldName, xpath) {
  let rule = rules.find(r => r.urls && r.urls.includes(pageUrl));
  if (!rule) {
    const newField = {
      id: generateUUID(),
      name: fieldName,
      selector: xpath
    };
    rule = {
      id: generateUUID(),
      urls: [pageUrl],
      selectorType: 'xpath',
      fields: [newField],
      selector: xpath,
      fillGroups: [{ id: generateUUID(), name: '默认分组', isDefault: true, values: { [newField.id]: '' } }]
    };
    rules.push(rule);
    normalizeRule(rule);
    return { success: true, count: 1 };
  }
  normalizeRule(rule);

  // XPath 去重检查
  const isDuplicate = rule.fields.some(f => f.selector.trim() === xpath.trim());
  if (isDuplicate) {
    return { success: false, reason: 'duplicate', count: rule.fields.length };
  }

  const newField = {
    id: generateUUID(),
    name: fieldName,
    selector: xpath
  };
  rule.fields.push(newField);
  rule.fillGroups.forEach(g => {
    if (!g.values) g.values = {};
    g.values[newField.id] = '';
  });
  return { success: true, count: rule.fields.length };
}

const mockRules = [];
const page = 'https://example.com/login';
// 依次选取项 A
const resA = mockPickerCollect(mockRules, page, '用户名', "//input[@id='username']");
assert.strictEqual(resA.success, true);
assert.strictEqual(resA.count, 1);
// 再次选取项 B
const resB = mockPickerCollect(mockRules, page, '密码', "//input[@id='password']");
assert.strictEqual(resB.success, true);
assert.strictEqual(resB.count, 2);
// 再次点击项 A（重复 XPath）
const resDup = mockPickerCollect(mockRules, page, '用户框重复', "//input[@id='username']");
assert.strictEqual(resDup.success, false);
assert.strictEqual(resDup.reason, 'duplicate');
assert.strictEqual(resDup.count, 2);
// 确保同一网址只有 1 条规则，该规则下有 2 个字段
assert.strictEqual(mockRules.length, 1);
assert.strictEqual(mockRules[0].fields.length, 2);
console.log('✅ 测试 6 (套索连续选取与同一网址聚合去重) 通过');

// 测试 7: 分组优先编辑流程（先选择分组，同时编辑该分组下的全部表单数据项）
const targetRule = mockRules[0];
// 添加第 2 个分组「测试账号」
targetRule.fillGroups.push({
  id: generateUUID(),
  name: '测试账号',
  isDefault: false,
  values: {}
});
normalizeRule(targetRule);

// 模拟进入「测试账号」分组进行编辑
const activeGroup = targetRule.fillGroups.find(g => g.name === '测试账号');
assert(activeGroup !== undefined);

// 模拟同时修改「测试账号」下所有数据项
const fieldUser = targetRule.fields.find(f => f.name === '用户名');
const fieldPass = targetRule.fields.find(f => f.name === '密码');
activeGroup.values[fieldUser.id] = 'test_tester';
activeGroup.values[fieldPass.id] = 'pass_test_123';

// 验证默认组不受影响，测试组拥有完整独立的所有数据项
assert.strictEqual(targetRule.fillGroups[0].values[fieldUser.id], '');
assert.strictEqual(targetRule.fillGroups[1].values[fieldUser.id], 'test_tester');
assert.strictEqual(targetRule.fillGroups[1].values[fieldPass.id], 'pass_test_123');
console.log('✅ 测试 7 (分组优先编辑：先选分组并同时编辑该组所有数据项) 通过');

// 测试 8: 手动添加表单项去重校验
function mockManualAddField(rule, name, selector) {
  if (!selector || !selector.trim()) {
    throw new Error('XPath不能为空');
  }
  if (rule.fields.some(f => f.selector.trim() === selector.trim())) {
    throw new Error('XPath重复');
  }
  const newF = { id: generateUUID(), name: name.trim(), selector: selector.trim() };
  rule.fields.push(newF);
  rule.fillGroups.forEach(g => {
    g.values[newF.id] = '';
  });
  return newF;
}

assert.throws(() => {
  mockManualAddField(targetRule, '重复用户名', "//input[@id='username']");
}, /XPath重复/);

const newEmailField = mockManualAddField(targetRule, '邮箱', "//input[@id='email']");
assert.strictEqual(targetRule.fields.length, 3);
assert.strictEqual(targetRule.fillGroups[0].values[newEmailField.id], '');
assert.strictEqual(targetRule.fillGroups[1].values[newEmailField.id], '');
console.log('✅ 测试 8 (手动添加表单项去重与各组同步) 通过');

console.log('全部逻辑测试通过！🎉');
