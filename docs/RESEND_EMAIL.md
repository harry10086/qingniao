# 📧 Resend 邮件通知配置指南

Qingniao (青鸟) 内置了基于 [Resend](https://resend.com) 的邮件通知服务。

---

## 为什么选择 Resend？
- **极速投递**：基于现代 API 架构，发送延迟在毫秒级别。
- **高免费额度**：提供每月 3000 封免费额度（每天 100 封），完全满足个人博客与站点需求。
- **原生 Serverless**：标准 HTTPS REST API 传输，完美运行于 Cloudflare Workers 边缘环境。

---

## 配置步骤

### 1. 注册 Resend 账号并添加域名
1. 访问 [https://resend.com](https://resend.com) 注册账号。
2. 进入控制台的 **Domains** 页面，点击 **Add Domain**，填入你的域名（如 `yourdomain.com` 或子域名 `mail.yourdomain.com`）。
3. 根据提示前往你的 DNS 解析服务商（如 Cloudflare DNS），添加对应的 **DKIM / SPF / MX** 解析记录。

### 2. 生成 API Key
1. 在 Resend 控制台进入 **API Keys** 页面。
2. 点击 **Create API Key**，权限选择 **Sending access** 或 **Full access**。
3. 复制生成的 API Key（以 `re_` 开头）。

### 3. 配置 Cloudflare Workers
在 `server/` 目录下执行命令将秘钥注入 Worker：

```bash
npx wrangler secret put RESEND_API_KEY
```
在终端提示时粘贴你的 Resend API Key。

然后在 `wrangler.toml` 中的 `[vars]` 区域完善发信地址与博主收件地址：

```toml
[vars]
SITE_NAME = "我的博客"
SITE_URL = "https://yourdomain.com"
ADMIN_URL = "https://yourdomain.com/comment-admin/"
ADMIN_EMAIL = "your-personal-email@example.com"
SENDER_EMAIL = "青鸟评论通知 <noreply@yourdomain.com>"
```

重新部署 Worker 即可：
```bash
npm run deploy
```
