import assert from 'node:assert';
import {
  htmlToMarkdown,
  normalizeDate,
  parseWordPressWXR,
  parseWordPressJSON,
  parseTypechoJSON,
  parseWalineJSON,
  parseArtalkJSON,
  parseTwikooJSON,
  parseNativeJSON,
  autoDetectAndParse,
} from '../src/utils/importers.js';

console.log('🧪 开始运行评论导入引擎测试用例...\n');

// 1. HTML to Markdown
console.log('1. 测试 HTML 转 Markdown 转换...');
const htmlSample = '<p>你好 <strong>加粗</strong> <em>斜体</em> <del>删除线</del></p><p><a href="https://example.com">链接文本</a> <code>console.log(1)</code></p><blockquote>引用的内容</blockquote><pre><code class="javascript">const a = 1;\nconsole.log(a);</code></pre><img src="https://img.example.com/a.png" alt="图片描述">';
const mdResult = htmlToMarkdown(htmlSample);
assert.ok(mdResult.includes('**加粗**'), '加粗转换失败');
assert.ok(mdResult.includes('*斜体*'), '斜体转换失败');
assert.ok(mdResult.includes('~~删除线~~'), '删除线转换失败');
assert.ok(mdResult.includes('[链接文本](https://example.com)'), '链接转换失败');
assert.ok(mdResult.includes('`console.log(1)`'), '行内代码转换失败');
assert.ok(mdResult.includes('> 引用的内容'), '引用转换失败');
assert.ok(mdResult.includes('```javascript\nconst a = 1;\nconsole.log(a);\n```'), '代码块转换失败');
assert.ok(mdResult.includes('![图片描述](https://img.example.com/a.png)'), '图片转换失败');
console.log('✅ HTML to Markdown 测试通过！');

// 2. WordPress WXR (XML)
console.log('\n2. 测试 WordPress WXR (XML) 解析...');
const wpXmlSample = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/">
  <channel>
    <item>
      <title>你好，世界！</title>
      <link>https://myblog.com/2023/05/hello-world/</link>
      <wp:post_id>101</wp:post_id>
      <wp:post_name>hello-world</wp:post_name>
      <wp:comment>
        <wp:comment_id>1</wp:comment_id>
        <wp:comment_author><![CDATA[张三]]></wp:comment_author>
        <wp:comment_author_email>zhangsan@example.com</wp:comment_author_email>
        <wp:comment_author_url>https://zhangsan.com</wp:comment_author_url>
        <wp:comment_date><![CDATA[2023-05-01 10:00:00]]></wp:comment_date>
        <wp:comment_content><![CDATA[这是一条来自 <strong>WordPress</strong> 的评论！]]></wp:comment_content>
        <wp:comment_approved>1</wp:comment_approved>
        <wp:comment_parent>0</wp:comment_parent>
      </wp:comment>
      <wp:comment>
        <wp:comment_id>2</wp:comment_id>
        <wp:comment_author><![CDATA[李四]]></wp:comment_author>
        <wp:comment_author_email>lisi@example.com</wp:comment_author_email>
        <wp:comment_date><![CDATA[2023-05-01 11:00:00]]></wp:comment_date>
        <wp:comment_content><![CDATA[回复张三：<a href="https://example.com">测试</a>]]></wp:comment_content>
        <wp:comment_approved>1</wp:comment_approved>
        <wp:comment_parent>1</wp:comment_parent>
      </wp:comment>
    </item>
  </channel>
</rss>`;

const wpParsed = parseWordPressWXR(wpXmlSample);
assert.strictEqual(wpParsed.length, 2, 'WordPress 评论数量应为 2');
assert.strictEqual(wpParsed[0].page_path, '/2023/05/hello-world/', 'WordPress 页面路径解析错误');
assert.strictEqual(wpParsed[0].page_title, '你好，世界！', 'WordPress 页面标题解析错误');
assert.strictEqual(wpParsed[0].username, '张三', 'WordPress 评论用户名解析错误');
assert.strictEqual(wpParsed[0].content, '这是一条来自 **WordPress** 的评论！', 'WordPress HTML转MD错误');
assert.strictEqual(wpParsed[0].parent_original_id, null, '顶级评论 parent_id 应为 null');
assert.strictEqual(wpParsed[1].parent_original_id, '1', '回复评论 parent_original_id 应为 1');
console.log('✅ WordPress WXR 解析测试通过！');

// 3. Typecho JSON
console.log('\n3. 测试 Typecho JSON 解析...');
const typechoJsonSample = [
  {
    coid: "501",
    cid: "12",
    author: "小明",
    mail: "xiaoming@example.com",
    url: "https://xiaoming.me",
    created: 1680000000,
    text: "Typecho 评论测试，支持 <b>HTML</b> 与 Markdown",
    status: "approved",
    parent: "0",
    permalink: "https://myblog.com/archives/12.html",
    title: "Typecho 文章标题"
  },
  {
    coid: "502",
    cid: "12",
    author: "小红",
    mail: "xiaohong@example.com",
    created: 1680003600,
    text: "回复小明",
    status: "approved",
    parent: "501",
    permalink: "https://myblog.com/archives/12.html"
  }
];

const typechoParsed = parseTypechoJSON(typechoJsonSample);
assert.strictEqual(typechoParsed.length, 2, 'Typecho 评论数量应为 2');
assert.strictEqual(typechoParsed[0].page_path, '/archives/12.html', 'Typecho 页面路径提取错误');
assert.strictEqual(typechoParsed[0].username, '小明', 'Typecho 用户名错误');
assert.strictEqual(typechoParsed[0].parent_original_id, null, 'Typecho 顶层父 ID 应为 null');
assert.strictEqual(typechoParsed[1].parent_original_id, '501', 'Typecho 子评论父 ID 应为 501');
assert.ok(typechoParsed[0].created_at.startsWith('2023-03-28'), 'Typecho 10位时间戳转换错误');
console.log('✅ Typecho JSON 解析测试通过！');

// 4. Waline JSON
console.log('\n4. 测试 Waline JSON 解析...');
const walineJsonSample = {
  data: [
    {
      objectId: "waline_root_1",
      url: "/posts/learn-react/",
      nick: "ReactFans",
      mail: "react@fans.com",
      link: "https://react.dev",
      comment: "Waline 评论内容 <script>alert(1)</script>",
      status: "approved",
      like: 5,
      sticky: true,
      insertedAt: "2023-06-15T08:30:00.000Z"
    },
    {
      objectId: "waline_reply_2",
      url: "/posts/learn-react/",
      nick: "VueFans",
      mail: "vue@fans.com",
      comment: "回复 ReactFans",
      status: "waiting",
      pid: "waline_root_1",
      insertedAt: "2023-06-15T09:00:00.000Z"
    }
  ]
};

const walineParsed = parseWalineJSON(walineJsonSample);
assert.strictEqual(walineParsed.length, 2, 'Waline 评论数量应为 2');
assert.strictEqual(walineParsed[0].original_id, 'waline_root_1');
assert.strictEqual(walineParsed[0].is_pinned, 1, 'Waline 置顶应为 1');
assert.strictEqual(walineParsed[0].upvotes, 5, 'Waline 点赞数应为 5');
assert.strictEqual(walineParsed[1].status, 'pending', 'Waline waiting 状态应映射为 pending');
assert.strictEqual(walineParsed[1].parent_original_id, 'waline_root_1', 'Waline 回复映射错误');
console.log('✅ Waline JSON 解析测试通过！');

// 5. Artalk JSON (Artrans)
console.log('\n5. 测试 Artalk (Artrans) JSON 解析...');
const artalkJsonSample = {
  version: 2,
  pages: [
    { id: 1, key: "/about/", title: "关于我" }
  ],
  comments: [
    {
      id: 1001,
      page_id: 1,
      nick: "ArtalkUser",
      email: "artalk@user.com",
      content: "博主你好，很高兴认识你！",
      is_pending: false,
      vote_up: 3,
      vote_down: 0,
      created_at: "2023-07-20 14:00:00",
      rid: 0
    },
    {
      id: 1002,
      page_id: 1,
      nick: "博主",
      email: "admin@blog.com",
      content: "你好呀！欢迎常来！",
      is_pending: false,
      vote_up: 1,
      vote_down: 0,
      created_at: "2023-07-20 14:15:00",
      rid: 1001
    }
  ]
};

const artalkParsed = parseArtalkJSON(artalkJsonSample);
assert.strictEqual(artalkParsed.length, 2, 'Artalk 评论数量应为 2');
assert.strictEqual(artalkParsed[0].page_path, '/about/', 'Artalk page_id 关联 page_key 失败');
assert.strictEqual(artalkParsed[0].page_title, '关于我', 'Artalk page_id 关联 page_title 失败');
assert.strictEqual(artalkParsed[0].original_id, '1001');
assert.strictEqual(artalkParsed[1].parent_original_id, '1001', 'Artalk rid 关联父评论失败');
console.log('✅ Artalk JSON 解析测试通过！');

// 6. 智能自动检测 (Auto-detection)
console.log('\n6. 测试格式智能自动检测 (Auto-detection)...');
const resXml = autoDetectAndParse(wpXmlSample);
assert.strictEqual(resXml.format, 'wordpress');

const resTypecho = autoDetectAndParse(JSON.stringify(typechoJsonSample));
assert.strictEqual(resTypecho.format, 'typecho');

const resWaline = autoDetectAndParse(JSON.stringify(walineJsonSample));
assert.strictEqual(resWaline.format, 'waline');

const resArtalk = autoDetectAndParse(JSON.stringify(artalkJsonSample));
assert.strictEqual(resArtalk.format, 'artalk');

console.log('✅ 格式智能自动检测全部通过！\n');

console.log('🎉 所有测试全部顺利通过！');
