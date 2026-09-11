# Hexo Butterfly 主题无缝接入 Qingniao (青鸟) 评论

只需 3 步即可在 Hexo Butterfly 主题中启用 Qingniao (青鸟) 评论系统。

---

## 步骤 1：复制模板文件

将本目录下的 `layout/` 结构复制到你的 Butterfly 主题目录中：

```
themes/butterfly/layout/includes/third-party/
├── comments/
│   └── qingniao.pug
├── newest-comments/
│   └── qingniao.pug
└── card-post-count/
    └── qingniao.pug
```

---

## 步骤 2：在主题三方引入列表添加 Case

### ① 修改 `themes/butterfly/layout/includes/third-party/comments/index.pug`
在 `case comment` 下添加：
```pug
case theme.comments.use[0]
  when 'Qingniao'
  when 'MianaoComment'
    include ./qingniao.pug
```

### ② 修改 `themes/butterfly/layout/includes/third-party/comments/js.pug`
在 `case comment` 下添加：
```pug
case theme.comments.use[0]
  when 'Qingniao'
  when 'MianaoComment'
    include ./qingniao.pug
```

### ③ 修改 `themes/butterfly/layout/includes/third-party/newest-comments/index.pug`
```pug
case theme.comments.use[0]
  when 'Qingniao'
  when 'MianaoComment'
    include ./qingniao.pug
```

### ④ 修改 `themes/butterfly/layout/includes/third-party/card-post-count/index.pug`
```pug
case theme.comments.use[0]
  when 'Qingniao'
  when 'MianaoComment'
    include ./qingniao.pug
```

---

## 步骤 3：配置主题 `_config.butterfly.yml`

```yaml
comments:
  use:
    - Qingniao
  lazyload: true
  count: true

qingniao:
  apiUrl: https://comment.yourdomain.com # 你的 Cloudflare Worker 地址
  option:
    placeholder: 蓬山此去无多路，青鸟殷勤为探看...
    maxLength: 500
    pageSize: 20
    defaultSort: newest # newest | oldest | most_upvoted
    adminBadge: 博主
    masterEmail: admin@yourdomain.com
```

将前端静态文件 `qingniao.js` 和 `qingniao.css` 放入博客的 `source/js/` 与 `source/css/` 即可！
