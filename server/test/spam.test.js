import assert from 'node:assert';
import {
  checkSpam,
  validateUsername,
  validateEmail,
  checkIpBlocked,
  BUILTIN_SPAM_KEYWORDS
} from '../src/utils/spam.js';

console.log('🧪 开始运行垃圾评论管理与敏感词过滤测试用例...\n');

// 1. 测试内置静态敏感词拦截
console.log('1. 测试内置静态敏感词拦截 (Block)...');
const res1 = checkSpam('你好，可以加微信 12345 交流吗？');
assert.strictEqual(res1.isSpam, true, '加微信 应该被判定为 spam');
assert.strictEqual(res1.action, 'block', '内置词库动作应为 block');

const res2 = checkSpam('这是一个正常的评论，博主写得很好！');
assert.strictEqual(res2.isSpam, false, '正常评论不应被拦截');
console.log('✅ 内置静态敏感词测试通过！');

// 2. 测试自定义动态敏感词 (Block & Pending)
console.log('\n2. 测试自定义动态敏感词 (Block 与 Pending 策略)...');
const dynamicRules = [
  { keyword: '淘宝兼职', action: 'block' },
  { keyword: '兼职代刷', action: 'block' },
  { keyword: '求互关', action: 'pending' },
  { keyword: '推广链接', action: 'pending' }
];

// Block 策略测试
const resBlock = checkSpam('急招淘宝兼职，日结300', dynamicRules);
assert.strictEqual(resBlock.isSpam, true, '命中淘宝兼职应被拦截');
assert.strictEqual(resBlock.action, 'block', '动作应为 block');

// Pending 策略测试
const resPending = checkSpam('博主你好，博文很棒求互关！', dynamicRules);
assert.strictEqual(resPending.isSpam, false, '命中 pending 规则 isSpam 应为 false');
assert.strictEqual(resPending.action, 'pending', '动作应为 pending 进入待审核');
console.log('✅ 自定义动态敏感词策略测试通过！');

// 3. 测试用户名敏感词拦截
console.log('\n3. 测试用户名敏感词过滤...');
const userRes1 = validateUsername('兼职代刷客服', dynamicRules);
assert.strictEqual(userRes1.valid, false, '包含兼职代刷的用户名应被拦截');

const userRes2 = validateUsername('普通读者张三', dynamicRules);
assert.strictEqual(userRes2.valid, true, '合规用户名应该通过');
console.log('✅ 用户名敏感词过滤测试通过！');

// 4. 测试过量链接与手机号拦截
console.log('\n4. 测试过量链接与手机号自动拦截...');
const resUrls = checkSpam('推荐几个网站: https://a.com https://b.com https://c.com');
assert.strictEqual(resUrls.isSpam, true, '超过2个链接应被拦截');

const resPhone = checkSpam('有需要请联系 13812345678 详谈');
assert.strictEqual(resPhone.isSpam, true, '包含国内手机号应被拦截');
console.log('✅ 链接与手机号拦截测试通过！');

// 5. 测试 IP 黑名单检查逻辑 (Mock Env)
console.log('\n5. 测试 IP 黑名单 Mock 检查...');
const mockEnv = {
  DB: {
    prepare(sql) {
      return {
        bind(hash) {
          return {
            async first() {
              if (hash === 'blocked_ip_hash_123') {
                return { id: 1, ip_hash: 'blocked_ip_hash_123' };
              }
              return null;
            }
          };
        }
      };
    }
  }
};

const isBlockedTrue = await checkIpBlocked(mockEnv, 'blocked_ip_hash_123');
assert.strictEqual(isBlockedTrue, true, '已封禁 IP Hash 应返回 true');

const isBlockedFalse = await checkIpBlocked(mockEnv, 'normal_ip_hash_456');
assert.strictEqual(isBlockedFalse, false, '正常 IP Hash 应返回 false');
console.log('✅ IP 黑名单校验逻辑测试通过！\n');

console.log('🎉 所有反垃圾与敏感词测试用例全部通过！');
