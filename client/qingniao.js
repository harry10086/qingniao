/**
 * Qingniao (青鸟) - Modern Self-hosted Comment System
 * Frontend SDK - Zero dependency, pure modern JavaScript
 * Version: 1.0.0
 * License: MIT
 */
;(function () {
  'use strict'

  // ============ Emoji Data ============
  const EMOJI_LIST = [
    { category: '表情', emojis: ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','🤩','😏','😒','😞','😔','😟','😕','😣','😖','😫','😩','😢','😭','😤','😠','😡','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾'] },
    { category: '手势', emojis: ['👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤝','🙏','✍️','💪','🦾','🖕'] },
    { category: '符号', emojis: ['❤️','🧡','💛','💚','💙','💜','🤎','🖤','🤍','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','⭐','🌟','✨','⚡','🔥','💯','🎉','🎊','👏','🏆','🎵','🎶','💬','💭','🗯️','✅','❌','⚠️','❓','❗','💡','🔔'] },
  ]

  // ============ Markdown Simple Parser ============
  function renderMarkdown(text) {
    if (!text) return ''
    let html = escapeHtml(text)

    // Code blocks (```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="mc-code-block">$2</code></pre>')
    // Inline code
    html = html.replace(/`([^`\n]+)`/g, '<code class="mc-inline-code">$1</code>')
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>')
    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="nofollow noopener">$1</a>')
    // Blockquote
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="mc-blockquote">$1</blockquote>')
    // Newlines to <br>
    html = html.replace(/\n/g, '<br>')

    return html
  }

  function escapeHtml(str) {
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }

  // ============ Time Formatting ============
  function timeAgo(dateStr) {
    const date = new Date(dateStr.includes('T') ? dateStr : dateStr + 'Z')
    const now = new Date()
    const diff = Math.floor((now - date) / 1000)

    if (diff < 60) return '刚刚'
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'
    if (diff < 2592000) return Math.floor(diff / 86400) + ' 天前'
    if (diff < 31536000) return Math.floor(diff / 2592000) + ' 个月前'
    return Math.floor(diff / 31536000) + ' 年前'
  }

  // ============ Main Class ============
  class Qingniao {
    constructor(options) {
      this.apiUrl = options.apiUrl || ''
      this.el = typeof options.el === 'string' ? document.querySelector(options.el) : options.el
      this.path = options.path || location.pathname
      this.maxLength = options.maxLength || 500
      this.pageSize = options.pageSize || 20
      this.defaultSort = options.defaultSort || 'newest'
      this.enableMarkdown = options.markdown !== false
      this.enableEmoji = options.emoji !== false
      this.currentPage = 1
      this.currentSort = this.defaultSort
      this.captchaToken = ''
      this.captchaQuestion = ''
      this.replyTo = null

      if (!this.el) {
        console.error('Qingniao: element not found')
        return
      }

      this.render()
      this.loadComments()
    }

    // ============ Main Render ============
    render() {
      this.el.innerHTML = ''
      this.el.classList.add('mc-container')

      // Comment form
      this.el.appendChild(this.createCommentForm())

      // Sort bar
      this.el.appendChild(this.createSortBar())

      // Comments list container
      const list = document.createElement('div')
      list.id = 'mc-comments-list'
      list.className = 'mc-comments-list'
      this.el.appendChild(list)

      // Pagination container
      const pager = document.createElement('div')
      pager.id = 'mc-pagination'
      pager.className = 'mc-pagination'
      this.el.appendChild(pager)

      // Load captcha
      this.refreshCaptcha()
    }

    // ============ Comment Form ============
    createCommentForm(parentId = null) {
      const form = document.createElement('div')
      form.className = 'mc-form' + (parentId ? ' mc-reply-form' : '')
      form.dataset.parentId = parentId || ''

      // User info row
      const infoRow = document.createElement('div')
      infoRow.className = 'mc-form-info'

      const nameInput = this.createInput('mc-input-name', '昵称 *', 'text', true)
      const emailInput = this.createInput('mc-input-email', '邮箱 *', 'email', true)
      const siteInput = this.createInput('mc-input-site', '网站 (如 mianao.info)', 'text', false)

      infoRow.appendChild(nameInput)
      infoRow.appendChild(emailInput)
      infoRow.appendChild(siteInput)
      form.appendChild(infoRow)

      // Toolbar
      const toolbar = document.createElement('div')
      toolbar.className = 'mc-toolbar'

      if (this.enableMarkdown) {
        const mdBtns = [
          { icon: 'B', title: '粗体', action: () => this.insertFormat('**', '**') },
          { icon: 'I', title: '斜体', action: () => this.insertFormat('*', '*') },
          { icon: '~', title: '删除线', action: () => this.insertFormat('~~', '~~') },
          { icon: '</>', title: '代码', action: () => this.insertFormat('`', '`') },
          { icon: '❝', title: '引用', action: () => this.insertFormat('> ', '') },
          { icon: '🔗', title: '链接', action: () => this.insertFormat('[', '](https://)') },
        ]
        mdBtns.forEach(btn => {
          const el = document.createElement('button')
          el.type = 'button'
          el.className = 'mc-toolbar-btn'
          el.title = btn.title
          el.textContent = btn.icon
          el.addEventListener('click', btn.action)
          toolbar.appendChild(el)
        })
      }

      if (this.enableEmoji) {
        const emojiBtn = document.createElement('button')
        emojiBtn.type = 'button'
        emojiBtn.className = 'mc-toolbar-btn mc-emoji-trigger'
        emojiBtn.title = '表情'
        emojiBtn.textContent = '😊'
        emojiBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          this.toggleEmojiPicker(form)
        })
        toolbar.appendChild(emojiBtn)
      }

      // Preview toggle
      const previewBtn = document.createElement('button')
      previewBtn.type = 'button'
      previewBtn.className = 'mc-toolbar-btn mc-preview-toggle'
      previewBtn.title = '预览'
      previewBtn.textContent = '👁️'
      previewBtn.addEventListener('click', () => this.togglePreview(form))
      toolbar.appendChild(previewBtn)

      form.appendChild(toolbar)

      // Emoji picker (hidden by default)
      const emojiPicker = document.createElement('div')
      emojiPicker.className = 'mc-emoji-picker mc-hidden'
      form.appendChild(emojiPicker)

      // Textarea
      const textWrap = document.createElement('div')
      textWrap.className = 'mc-textarea-wrap'

      const textarea = document.createElement('textarea')
      textarea.className = 'mc-textarea'
      textarea.placeholder = parentId ? '写下你的回复...' : '写下你的评论...（支持 Markdown 语法）'
      textarea.maxLength = this.maxLength
      textarea.rows = parentId ? 3 : 5
      textarea.addEventListener('input', () => this.updateCharCount(form))
      textWrap.appendChild(textarea)

      // Character count
      const charCount = document.createElement('div')
      charCount.className = 'mc-char-count'
      charCount.textContent = `剩余 ${this.maxLength} 字`
      textWrap.appendChild(charCount)

      form.appendChild(textWrap)

      // Preview area (hidden)
      const previewArea = document.createElement('div')
      previewArea.className = 'mc-preview mc-hidden'
      form.appendChild(previewArea)

      // Bottom row: captcha + submit
      const bottomRow = document.createElement('div')
      bottomRow.className = 'mc-form-bottom'

      // Captcha section
      const captchaWrap = document.createElement('div')
      captchaWrap.className = 'mc-captcha-wrap'

      const captchaQ = document.createElement('span')
      captchaQ.className = 'mc-captcha-question'
      captchaQ.textContent = '加载验证码...'
      captchaQ.title = '点击刷新验证码'
      captchaQ.style.cursor = 'pointer'
      captchaQ.addEventListener('click', () => this.refreshCaptcha())
      captchaWrap.appendChild(captchaQ)

      const captchaInput = document.createElement('input')
      captchaInput.type = 'number'
      captchaInput.className = 'mc-captcha-input'
      captchaInput.placeholder = '答案'
      captchaWrap.appendChild(captchaInput)

      bottomRow.appendChild(captchaWrap)

      // Submit button
      const submitBtn = document.createElement('button')
      submitBtn.type = 'button'
      submitBtn.className = 'mc-submit-btn'
      submitBtn.textContent = parentId ? '回复' : '发表评论'
      submitBtn.addEventListener('click', () => this.submitComment(form))
      bottomRow.appendChild(submitBtn)

      if (parentId) {
        const cancelBtn = document.createElement('button')
        cancelBtn.type = 'button'
        cancelBtn.className = 'mc-cancel-btn'
        cancelBtn.textContent = '取消'
        cancelBtn.addEventListener('click', () => {
          form.remove()
          this.replyTo = null
        })
        bottomRow.appendChild(cancelBtn)
      }

      form.appendChild(bottomRow)

      // Restore saved user info from localStorage
      this.restoreUserInfo(form)

      return form
    }

    createInput(className, placeholder, type, required) {
      const wrap = document.createElement('div')
      wrap.className = 'mc-input-wrap'
      const input = document.createElement('input')
      input.type = type
      input.className = className
      input.placeholder = placeholder
      if (required) input.required = true
      wrap.appendChild(input)
      return wrap
    }

    // ============ Emoji Picker ============
    toggleEmojiPicker(form) {
      const picker = form.querySelector('.mc-emoji-picker')
      if (picker.classList.contains('mc-hidden')) {
        this.buildEmojiPicker(form, picker)
        picker.classList.remove('mc-hidden')
        // Close when clicking elsewhere
        const closeHandler = (e) => {
          if (!picker.contains(e.target) && !e.target.classList.contains('mc-emoji-trigger')) {
            picker.classList.add('mc-hidden')
            document.removeEventListener('click', closeHandler)
          }
        }
        setTimeout(() => document.addEventListener('click', closeHandler), 0)
      } else {
        picker.classList.add('mc-hidden')
      }
    }

    buildEmojiPicker(form, picker) {
      if (picker.children.length > 0) return // already built

      const tabs = document.createElement('div')
      tabs.className = 'mc-emoji-tabs'

      const content = document.createElement('div')
      content.className = 'mc-emoji-content'

      EMOJI_LIST.forEach((cat, idx) => {
        const tab = document.createElement('button')
        tab.type = 'button'
        tab.className = 'mc-emoji-tab' + (idx === 0 ? ' mc-active' : '')
        tab.textContent = cat.category
        tab.addEventListener('click', () => {
          tabs.querySelectorAll('.mc-emoji-tab').forEach(t => t.classList.remove('mc-active'))
          tab.classList.add('mc-active')
          showCategory(idx)
        })
        tabs.appendChild(tab)
      })

      const grid = document.createElement('div')
      grid.className = 'mc-emoji-grid'
      content.appendChild(grid)

      const showCategory = (idx) => {
        grid.innerHTML = ''
        EMOJI_LIST[idx].emojis.forEach(emoji => {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'mc-emoji-item'
          btn.textContent = emoji
          btn.addEventListener('click', () => {
            const textarea = form.querySelector('.mc-textarea')
            const pos = textarea.selectionStart
            textarea.value = textarea.value.substring(0, pos) + emoji + textarea.value.substring(pos)
            textarea.focus()
            textarea.selectionStart = textarea.selectionEnd = pos + emoji.length
            this.updateCharCount(form)
            picker.classList.add('mc-hidden')
          })
          grid.appendChild(btn)
        })
      }

      picker.appendChild(tabs)
      picker.appendChild(content)
      showCategory(0)
    }

    // ============ Markdown Toolbar Actions ============
    insertFormat(prefix, suffix) {
      const form = this.el.querySelector('.mc-form:not(.mc-reply-form)') || this.el.querySelector('.mc-form')
      const textarea = form.querySelector('.mc-textarea')
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const selected = textarea.value.substring(start, end)
      const replacement = prefix + (selected || '文本') + suffix
      textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end)
      textarea.focus()
      if (!selected) {
        textarea.selectionStart = start + prefix.length
        textarea.selectionEnd = start + prefix.length + 2 // "文本" length
      } else {
        textarea.selectionStart = start
        textarea.selectionEnd = start + replacement.length
      }
      this.updateCharCount(form)
    }

    // ============ Preview ============
    togglePreview(form) {
      const textarea = form.querySelector('.mc-textarea-wrap')
      const preview = form.querySelector('.mc-preview')
      const btn = form.querySelector('.mc-preview-toggle')

      if (preview.classList.contains('mc-hidden')) {
        const content = form.querySelector('.mc-textarea').value
        preview.innerHTML = content ? renderMarkdown(content) : '<span class="mc-preview-empty">预览区域（请输入内容）</span>'
        textarea.classList.add('mc-hidden')
        preview.classList.remove('mc-hidden')
        btn.classList.add('mc-active')
      } else {
        textarea.classList.remove('mc-hidden')
        preview.classList.add('mc-hidden')
        btn.classList.remove('mc-active')
      }
    }

    // ============ Character Count ============
    updateCharCount(form) {
      const textarea = form.querySelector('.mc-textarea')
      const counter = form.querySelector('.mc-char-count')
      const remaining = this.maxLength - textarea.value.length
      counter.textContent = `剩余 ${remaining} 字`
      counter.classList.toggle('mc-char-warn', remaining <= 50)
      counter.classList.toggle('mc-char-danger', remaining <= 0)
    }

    // ============ Captcha ============
    async refreshCaptcha() {
      try {
        const res = await fetch(`${this.apiUrl}/api/captcha`)
        const data = await res.json()
        this.captchaToken = data.token
        this.captchaQuestion = data.question
        // Update all captcha displays
        this.el.querySelectorAll('.mc-captcha-question').forEach(el => {
          el.textContent = data.question
        })
        this.el.querySelectorAll('.mc-captcha-input').forEach(el => {
          el.value = ''
        })
      } catch (err) {
        console.error('Failed to load captcha:', err)
      }
    }

    // ============ User Info Persistence ============
    restoreUserInfo(form) {
      try {
        const saved = JSON.parse(localStorage.getItem('mc-user') || '{}')
        if (saved.name) form.querySelector('.mc-input-name').value = saved.name
        if (saved.email) form.querySelector('.mc-input-email').value = saved.email
        if (saved.site) form.querySelector('.mc-input-site').value = saved.site
      } catch (e) { /* ignore */ }
    }

    saveUserInfo(name, email, site) {
      try {
        localStorage.setItem('mc-user', JSON.stringify({ name, email, site }))
      } catch (e) { /* ignore */ }
    }

    // ============ Sort Bar ============
    createSortBar() {
      const bar = document.createElement('div')
      bar.className = 'mc-sort-bar'

      const label = document.createElement('span')
      label.className = 'mc-sort-label'
      label.textContent = '排序：'
      bar.appendChild(label)

      const sorts = [
        { key: 'newest', text: '最新' },
        { key: 'oldest', text: '最早' },
        { key: 'most_upvoted', text: '最多赞成' },
      ]

      sorts.forEach(s => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'mc-sort-btn' + (s.key === this.currentSort ? ' mc-active' : '')
        btn.textContent = s.text
        btn.addEventListener('click', () => {
          this.currentSort = s.key
          this.currentPage = 1
          bar.querySelectorAll('.mc-sort-btn').forEach(b => b.classList.remove('mc-active'))
          btn.classList.add('mc-active')
          this.loadComments()
        })
        bar.appendChild(btn)
      })

      return bar
    }

    // ============ Load Comments ============
    async loadComments() {
      const list = this.el.querySelector('#mc-comments-list')
      list.innerHTML = '<div class="mc-loading">加载评论中...</div>'

      try {
        const res = await fetch(
          `${this.apiUrl}/api/comments?path=${encodeURIComponent(this.path)}&page=${this.currentPage}&limit=${this.pageSize}&sort=${this.currentSort}`
        )
        const data = await res.json()

        if (data.comments.length === 0 && this.currentPage === 1) {
          list.innerHTML = '<div class="mc-empty">还没有评论，来发表第一条吧！</div>'
        } else {
          list.innerHTML = ''
          data.comments.forEach(comment => {
            list.appendChild(this.renderComment(comment, 0))
          })
        }

        this.renderPagination(data.pagination)
      } catch (err) {
        console.error('Failed to load comments:', err)
        list.innerHTML = '<div class="mc-error">加载评论失败，请刷新重试</div>'
      }
    }

    // ============ Render Single Comment ============
    renderComment(comment, depth) {
      const item = document.createElement('div')
      item.className = 'mc-comment' + (comment.is_pinned ? ' mc-pinned' : '')
      item.dataset.id = comment.id
      item.id = 'qn-comment-' + comment.id
      if (depth > 0) item.classList.add('mc-reply')
      item.style.setProperty('--depth', Math.min(depth, 4))

      // Header
      const header = document.createElement('div')
      header.className = 'mc-comment-header'

      // Avatar
      const avatar = document.createElement('div')
      avatar.className = 'mc-avatar'
      if (comment.email_hash) {
        const img = document.createElement('img')
        img.src = `https://weavatar.com/avatar/${comment.email_hash}?d=identicon`
        img.alt = comment.username || ''
        img.onerror = () => {
          avatar.innerHTML = ''
          avatar.textContent = (comment.username || '?')[0].toUpperCase()
          avatar.style.backgroundColor = this.stringToColor(comment.username || '')
        }
        avatar.appendChild(img)
      } else {
        avatar.textContent = (comment.username || '?')[0].toUpperCase()
        avatar.style.backgroundColor = this.stringToColor(comment.username || '')
      }
      header.appendChild(avatar)

      const meta = document.createElement('div')
      meta.className = 'mc-comment-meta'

      const nameEl = document.createElement('span')
      nameEl.className = 'mc-comment-name'
      if (comment.website) {
        let siteUrl = comment.website.trim()
        if (siteUrl && !/^https?:\/\//i.test(siteUrl) && !/^\/\//.test(siteUrl)) {
          siteUrl = 'https://' + siteUrl
        }
        const link = document.createElement('a')
        link.href = siteUrl
        link.target = '_blank'
        link.rel = 'nofollow noopener'
        link.textContent = comment.username
        nameEl.appendChild(link)
      } else {
        nameEl.textContent = comment.username
      }
      meta.appendChild(nameEl)

      if (comment.is_admin || comment.is_author) {
        const adminBadge = document.createElement('span')
        adminBadge.className = 'mc-badge mc-badge-admin'
        adminBadge.textContent = '博主'
        meta.appendChild(adminBadge)
      }

      if (comment.is_pinned) {
        const pin = document.createElement('span')
        pin.className = 'mc-badge mc-badge-pin'
        pin.textContent = '置顶'
        meta.appendChild(pin)
      }

      const timeEl = document.createElement('time')
      timeEl.className = 'mc-comment-time'
      timeEl.dateTime = comment.created_at
      timeEl.textContent = timeAgo(comment.created_at)
      timeEl.title = new Date(comment.created_at.includes('T') ? comment.created_at : comment.created_at + 'Z').toLocaleString('zh-CN')
      meta.appendChild(timeEl)

      header.appendChild(meta)
      item.appendChild(header)

      // Content
      const content = document.createElement('div')
      content.className = 'mc-comment-content'
      content.innerHTML = this.enableMarkdown ? renderMarkdown(comment.content) : escapeHtml(comment.content).replace(/\n/g, '<br>')
      item.appendChild(content)

      // Actions
      const actions = document.createElement('div')
      actions.className = 'mc-comment-actions'

      // Upvote
      const upBtn = document.createElement('button')
      upBtn.type = 'button'
      upBtn.className = 'mc-vote-btn mc-vote-up'
      upBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4l-8 8h5v8h6v-8h5z"/></svg> <span>${comment.upvotes || 0}</span>`
      upBtn.addEventListener('click', () => this.vote(comment.id, 'up', upBtn, downBtn))
      actions.appendChild(upBtn)

      // Downvote
      const downBtn = document.createElement('button')
      downBtn.type = 'button'
      downBtn.className = 'mc-vote-btn mc-vote-down'
      downBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20l8-8h-5v-8h-6v8h-5z"/></svg> <span>${comment.downvotes || 0}</span>`
      downBtn.addEventListener('click', () => this.vote(comment.id, 'down', upBtn, downBtn))
      actions.appendChild(downBtn)

      // Reply button
      const replyBtn = document.createElement('button')
      replyBtn.type = 'button'
      replyBtn.className = 'mc-reply-btn'
      replyBtn.textContent = '回复'
      replyBtn.addEventListener('click', () => this.showReplyForm(item, comment.id))
      actions.appendChild(replyBtn)

      item.appendChild(actions)

      // Replies (recursive)
      if (comment.replies && comment.replies.length > 0) {
        const repliesWrap = document.createElement('div')
        repliesWrap.className = 'mc-replies'
        comment.replies.forEach(reply => {
          repliesWrap.appendChild(this.renderComment(reply, depth + 1))
        })
        item.appendChild(repliesWrap)
      }

      return item
    }

    // ============ Show Reply Form ============
    showReplyForm(commentEl, parentId) {
      // Remove any existing reply forms
      this.el.querySelectorAll('.mc-reply-form').forEach(f => f.remove())
      this.replyTo = parentId

      const form = this.createCommentForm(parentId)
      // Update captcha in reply form
      const captchaQ = form.querySelector('.mc-captcha-question')
      if (captchaQ && this.captchaQuestion) {
        captchaQ.textContent = this.captchaQuestion
      }
      commentEl.appendChild(form)
      form.querySelector('.mc-textarea').focus()
    }

    // ============ Submit Comment ============
    async submitComment(form) {
      const name = form.querySelector('.mc-input-name').value.trim()
      const email = form.querySelector('.mc-input-email').value.trim()
      let site = form.querySelector('.mc-input-site').value.trim()
      if (site && !/^https?:\/\//i.test(site) && !/^\/\//.test(site)) {
        site = 'https://' + site
      }
      const content = form.querySelector('.mc-textarea').value.trim()
      const captchaAnswer = form.querySelector('.mc-captcha-input').value.trim()
      const parentId = form.dataset.parentId || null

      // Validate
      if (!name) return this.showFormError(form, '请输入昵称')
      if (!email) return this.showFormError(form, '请输入邮箱')
      if (!content) return this.showFormError(form, '请输入评论内容')
      if (content.length > this.maxLength) return this.showFormError(form, `评论不能超过${this.maxLength}字`)
      if (!captchaAnswer) return this.showFormError(form, '请输入验证码答案')

      const submitBtn = form.querySelector('.mc-submit-btn')
      const originalText = submitBtn.textContent
      submitBtn.textContent = '提交中...'
      submitBtn.disabled = true

      try {
        const cleanTitle = document.title ? document.title.replace(/\s*\|?\s*不吐不快$/, '').trim() : ''
        const res = await fetch(`${this.apiUrl}/api/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: this.path,
            pageTitle: cleanTitle,
            parentId: parentId ? parseInt(parentId) : null,
            username: name,
            email,
            website: site || '',
            content,
            captchaAnswer,
            captchaToken: this.captchaToken,
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          this.showFormError(form, data.error || '提交失败')
          this.refreshCaptcha()
          return
        }

        // Success
        this.saveUserInfo(name, email, site)
        this.showFormSuccess(form, data.message || '评论已提交')

        // Clear form
        form.querySelector('.mc-textarea').value = ''
        form.querySelector('.mc-captcha-input').value = ''
        this.updateCharCount(form)
        this.refreshCaptcha()

        // If reply form, remove it
        if (parentId) {
          setTimeout(() => form.remove(), 1500)
          this.replyTo = null
        }

        // If auto-approved, reload comments
        if (data.status === 'approved') {
          setTimeout(() => this.loadComments(), 1000)
        }
      } catch (err) {
        console.error('Submit error:', err)
        this.showFormError(form, '网络错误，请重试')
      } finally {
        submitBtn.textContent = originalText
        submitBtn.disabled = false
      }
    }

    showFormError(form, msg) {
      this.showFormMessage(form, msg, 'mc-msg-error')
    }

    showFormSuccess(form, msg) {
      this.showFormMessage(form, msg, 'mc-msg-success')
    }

    showFormMessage(form, msg, cls) {
      // Remove existing messages
      form.querySelectorAll('.mc-form-msg').forEach(el => el.remove())

      const msgEl = document.createElement('div')
      msgEl.className = 'mc-form-msg ' + cls
      msgEl.textContent = msg
      form.querySelector('.mc-form-bottom').before(msgEl)

      setTimeout(() => msgEl.remove(), 4000)
    }

    // ============ Voting ============
    async vote(commentId, voteType, upBtn, downBtn) {
      try {
        const res = await fetch(`${this.apiUrl}/api/comments/${commentId}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voteType }),
        })
        const data = await res.json()

        if (data.success) {
          upBtn.querySelector('span').textContent = data.upvotes
          downBtn.querySelector('span').textContent = data.downvotes

          upBtn.classList.toggle('mc-voted', data.userVote === 'up')
          downBtn.classList.toggle('mc-voted', data.userVote === 'down')

          // Animate
          const btn = voteType === 'up' ? upBtn : downBtn
          btn.classList.add('mc-vote-animate')
          setTimeout(() => btn.classList.remove('mc-vote-animate'), 300)
        }
      } catch (err) {
        console.error('Vote error:', err)
      }
    }

    // ============ Pagination ============
    renderPagination(pagination) {
      const pager = this.el.querySelector('#mc-pagination')
      pager.innerHTML = ''

      if (pagination.totalPages <= 1) return

      const createPageBtn = (text, page, active = false, disabled = false) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'mc-page-btn' + (active ? ' mc-active' : '')
        btn.textContent = text
        btn.disabled = disabled
        if (!disabled && !active) {
          btn.addEventListener('click', () => {
            this.currentPage = page
            this.loadComments()
            this.el.querySelector('#mc-comments-list').scrollIntoView({ behavior: 'smooth', block: 'start' })
          })
        }
        return btn
      }

      // Previous
      pager.appendChild(createPageBtn('‹', this.currentPage - 1, false, this.currentPage <= 1))

      // Page numbers
      const { totalPages } = pagination
      let start = Math.max(1, this.currentPage - 2)
      let end = Math.min(totalPages, this.currentPage + 2)

      if (start > 1) {
        pager.appendChild(createPageBtn('1', 1))
        if (start > 2) {
          const dots = document.createElement('span')
          dots.className = 'mc-page-dots'
          dots.textContent = '...'
          pager.appendChild(dots)
        }
      }

      for (let i = start; i <= end; i++) {
        pager.appendChild(createPageBtn(String(i), i, i === this.currentPage))
      }

      if (end < totalPages) {
        if (end < totalPages - 1) {
          const dots = document.createElement('span')
          dots.className = 'mc-page-dots'
          dots.textContent = '...'
          pager.appendChild(dots)
        }
        pager.appendChild(createPageBtn(String(totalPages), totalPages))
      }

      // Next
      pager.appendChild(createPageBtn('›', this.currentPage + 1, false, this.currentPage >= totalPages))
    }

    // ============ Utility ============
    stringToColor(str) {
      let hash = 0
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash)
      }
      const h = Math.abs(hash) % 360
      return `hsl(${h}, 55%, 50%)`
    }
  }

  // ============ Static init method ============
  Qingniao.init = function (options) {
    return new Qingniao(options)
  }

  // ============ Static method: get comment count for paths ============
  Qingniao.getCount = async function (apiUrl, paths) {
    try {
      const res = await fetch(`${apiUrl}/api/count?paths=${encodeURIComponent(paths.join(','))}`)
      const data = await res.json()
      return data.counts || {}
    } catch (err) {
      console.error('Qingniao.getCount error:', err)
      return {}
    }
  }

  // ============ Static method: get recent comments ============
  Qingniao.getRecent = async function (apiUrl, limit) {
    try {
      const res = await fetch(`${apiUrl}/api/recent?limit=${limit || 6}`)
      const data = await res.json()
      return data.comments || []
    } catch (err) {
      console.error('Qingniao.getRecent error:', err)
      return []
    }
  }

  // Export
  window.Qingniao = Qingniao
})()
