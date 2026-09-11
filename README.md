# 🕊️ Qingniao

> 🚀 极简、优雅、安全且完全自主可控的无服务器开源评论系统。
> 基于 **Cloudflare Workers + D1 (SQLite) + KV** 构建，专为现代静态博客与网站设计。
>
> *“青鸟不传云外信，丁香空结雨中愁。”*

<p align="center">
  <img src="https://img.shields.io/badge/Runtime-Cloudflare%20Workers-orange?logo=cloudflare" alt="Cloudflare Workers">
  <img src="https://img.shields.io/badge/Database-Cloudflare%20D1-blue?logo=sqlite" alt="Cloudflare D1">
  <img src="https://img.shields.io/badge/Cache-Cloudflare%20KV-yellow?logo=cloudflare" alt="Cloudflare KV">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License">
</p>

---

## ✨ 核心特性

- ⚡ **极致性能**：依托 Cloudflare 全球边缘网络，配合 D1 SQLite 与 KV Edge 读写缓存，毫秒级极速响应。
- 🛡️ **安全与反垃圾**：
  - 动态轻量级数学验证码（防机刷）；
  - 基于 KV 的 IP 级别滑动窗口速率限制（Rate Limiting）；
  - 敏感词与垃圾推广内容自动拦截；
  - 隐私保护：IP 匿名脱敏单向哈希，邮箱安全加密。
- 📝 **现代化富文本体验**：
  - 内置精简 Markdown 解析引擎（支持加粗、斜体、删除线、行内代码、代码块、引用、链接等）；
  - 分类 Emoji 表情面板，一键点击插入；
  - 500 字数限制与剩余字数动态提醒。
- 💬 **强大交互功能**：
  - 多层级嵌套评论与回复树；
  - 赞成 👍 与反对 👎 投票机制（带防重复刷票与取消功能）；
  - 支持「最新发布」、「最早发布」、「最多赞成」多维度排序；
  - 置顶评论徽章与博主官方身份高亮徽章。
- 👑 **完善的独立管理后台**：
  - 单文件轻量 Web 面板，零编译直接使用；
  - 支持多状态筛选（待审核/已通过/已拒绝）；
  - **支持文章链接与页面标题关键词模糊检索**；
  - **博主在线一键快捷回复（自动免审展示 + 异步邮件提醒）**；
  - 批量通过、批量拒绝、批量删除、一键置顶；
  - 信任机制：已审核通过的用户后续发评自动免审；
  - **全面跨平台一键平滑迁移**：内置通用导入引擎，**原生支持 WordPress (WXR/XML & JSON)、Typecho、Waline、Artalk、Twikoo** 历史数据一键导入（自动递归还原回复树、HTML 智能转 Markdown、文件拖拽与实时诊断预览）与原生 JSON/CSV 导出。
- 📧 **邮件异步通知**：
  - 集成 Resend API，新评论即时提醒博主，读者被回复时自动通知作者。
- 🎨 **精美设计与主题自适应**：
  - 现代圆角微阴影设计，CSS 变量轻松定制配色；
  - 完美自适应亮色（Light）与暗色（Dark）模式。

---

## 📂 项目结构

```
qingniao/
├── server/                         # 后端 (Cloudflare Workers + D1 + KV)
│   ├── src/
│   │   ├── index.js                # 主路由与 CORS / Edge 缓存控制
│   │   ├── schema.sql              # D1 数据库建表语句
│   │   ├── routes/                 # 接口路由 (评论/管理/点赞)
│   │   ├── middleware/             # 权限/验证码/限速中间件
│   │   └── utils/                  # 加密/邮件/垃圾拦截/KV工具
│   ├── wrangler.toml.example       # Worker 配置文件模板
│   └── package.json
├── client/                         # 前端客户端 SDK 与样式
│   ├── qingniao.js                 # 原生 JS 前端 SDK (零外部依赖)
│   └── qingniao.css                # 现代响应式 CSS 样式表
├── admin/                          # 独立管理后台 Web 页面
│   └── index.html                  # 单文件开箱即用的现代化管理面板
├── integrations/                   # 博客框架与主题集成
│   ├── hexo-butterfly/             # Hexo Butterfly 主题无缝接入模板
│   └── vanilla-html/               # 原生静态网页 5 秒引入示例
└── docs/                           # 进阶配置与指南
    ├── IMPORT_GUIDE.md             # 多平台评论数据导入迁移指南 (WordPress/Typecho/Waline/Artalk/Twikoo)
    └── RESEND_EMAIL.md             # Resend 邮件通知详细配置

```

---

## 🚀 快速开始

### 1. 部署后端 (Cloudflare Workers)

确保已安装 [Node.js](https://nodejs.org/) 与 [Wrangler](https://developers.cloudflare.com/workers/wrangler/)：

```bash
cd server
npm install
```

#### ① 创建 D1 数据库与 KV 命名空间
```bash
# 创建 D1 数据库
npx wrangler d1 create qingniao-comments

# 创建 KV 命名空间
npx wrangler kv namespace create qingniaoKV
```

将命令行输出的 `database_id` 与 `kv id` 复制并填入 `server/wrangler.toml` 中。

#### ② 初始化数据库表结构
```bash
# 线上 D1 数据库建表
npm run db:init:remote
```

#### ③ 配置环境变量与 Secrets
```bash
# 设置验证码加密盐 (必填，输入任意安全随机字符串)
npx wrangler secret put CAPTCHA_SECRET

# (可选) 设置 Resend 邮件 API Key
npx wrangler secret put RESEND_API_KEY
```

在 `server/wrangler.toml` 中按需完善你的站点信息：
```toml
[vars]
CORS_ORIGIN = "*"
SITE_NAME = "我的博客"
SITE_URL = "https://yourblog.com"
ADMIN_EMAIL = "admin@yourblog.com"
```

#### ④ 部署 Worker
```bash
npm run deploy
```
部署完成后，你将获得一个 Worker API 访问地址，如 `https://qingniao-comments.<your-account>.workers.dev`（或在 Cloudflare 控制台绑定自定义域名）。

#### ⑤ 初始化管理员账号
```bash
curl -X POST https://your-worker-domain/api/admin/init \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YourStrongPassword123"}'
```

---

### 2. 网页前台集成

#### 原生 HTML / 任意静态网页
在网页中引入 `qingniao.css` 与 `qingniao.js`：

```html
<!-- 1. 引入样式 -->
<link rel="stylesheet" href="https://your-domain/path/to/qingniao.css">

<!-- 2. 评论挂载容器 -->
<div id="qingniao-wrap"></div>

<!-- 3. 引入脚本并初始化 -->
<script src="https://your-domain/path/to/qingniao.js"></script>
<script>
  Qingniao.init({
    el: '#qingniao-wrap',
    apiUrl: 'https://your-worker-domain', // 你的 Worker API 地址
    placeholder: '蓬山此去无多路，青鸟殷勤为探看...',
    adminBadge: '博主',
    masterEmail: 'admin@yourblog.com'
  });
</script>
```

#### Hexo Butterfly 主题
详见 [Butterfly 集成说明文档](integrations/hexo-butterfly/README.md)。

---

### 3. 管理后台

1. 打开 `admin/index.html`（可直接在浏览器双击打开，或放置于博客 `source/comment-admin/index.html` 下随静态站发布）。
2. 在登录页面输入你的 **后端 API 地址** 以及 **管理员账号与密码** 登录。
3. 登录后即可：
   - 审阅待审核评论，一键通过/拒绝/删除/置顶；
   - 关键词即时检索文章路径或标题；
   - 💬 **直接在线回复留言**（自动免审 + 邮件通知作者）；
   - 📥 **跨平台数据导入**：一键拖入或粘贴 WordPress、Typecho、Waline、Artalk、Twikoo 历史评论文件进行平滑迁移；
   - 📤 **数据导出与备份**：一键导出 JSON / CSV 格式数据。

---

## ⚙️ 前端 SDK 配置参数

| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `el` | String / HTMLElement | 必填 | 挂载的目标 DOM 元素或 CSS 选择器 |
| `apiUrl` | String | 必填 | Cloudflare Worker 后端 API 接口根地址 |
| `path` | String | `location.pathname` | 当前页面的评论路径标识 |
| `placeholder` | String | `'蓬山此去无多路，青鸟殷勤为探看...'` | 评论输入框占位提示语 |
| `maxLength` | Number | `500` | 允许发表的最大字符数 |
| `pageSize` | Number | `20` | 每页展示的顶级评论数量 |
| `defaultSort` | String | `'newest'` | 默认排序：`newest` (最新) / `oldest` (最早) / `most_upvoted` (赞最多) |
| `adminBadge` | String | `'博主'` | 博主评论专属徽章文字 |
| `masterEmail` | String | `''` | 博主邮箱（匹配成功时自动渲染博主徽章） |

---

## 📖 相关文档

- 🔄 [多平台评论数据导入迁移指南 (WordPress / Typecho / Waline / Artalk / Twikoo)](docs/IMPORT_GUIDE.md)
- 📧 [Resend 邮件通知配置指南](docs/RESEND_EMAIL.md)
- 🦋 [Hexo Butterfly 主题接入指引](integrations/hexo-butterfly/README.md)

---

## 📄 开源协议

本项目基于 [GPL v3](LICENSE) 开源。欢迎 Star、Issue 与 PR！
