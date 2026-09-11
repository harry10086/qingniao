/**
 * Multi-format Comment Importer Utility for Qingniao
 * Supports: WordPress (WXR/XML & JSON), Typecho (JSON), Waline (JSON), Artalk (Artrans/JSON), Twikoo (JSON), and Native JSON
 */

/**
 * Clean and convert HTML text to standard Markdown
 */
export function htmlToMarkdown(html) {
  if (!html) return '';
  let text = String(html);

  // Decode common HTML entities
  text = decodeHtmlEntities(text);

  // Code blocks: <pre><code class="language-xyz">...</code></pre> or <pre><code>...</code></pre>
  text = text.replace(/<pre[^>]*><code(?: class="(?:language-)?([^"]+)")?>([\s\S]*?)<\/code><\/pre>/gi, (match, lang, code) => {
    const language = lang ? lang.trim() : '';
    const cleanCode = code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    return `\n\`\`\`${language}\n${cleanCode.trim()}\n\`\`\`\n`;
  });

  // Pre blocks without code
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (match, code) => {
    return `\n\`\`\`\n${code.trim()}\n\`\`\`\n`;
  });

  // Inline code
  text = text.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');

  // Blockquotes
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (match, content) => {
    const clean = content.replace(/<[^>]+>/g, '').trim();
    return '\n' + clean.split('\n').map(line => `> ${line}`).join('\n') + '\n';
  });

  // Images: <img src="..." alt="...">
  text = text.replace(/<img\s+[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi, '![$2]($1)');
  text = text.replace(/<img\s+[^>]*alt="([^"]*)"[^>]*src="([^"]+)"[^>]*>/gi, '![$1]($2)');
  text = text.replace(/<img\s+[^>]*src="([^"]+)"[^>]*>/gi, '![]($1)');

  // Links: <a href="...">...</a>
  text = text.replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Bold & Italic & Strike
  text = text.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
  text = text.replace(/<b>(.*?)<\/b>/gi, '**$1**');
  text = text.replace(/<em>(.*?)<\/em>/gi, '*$1*');
  text = text.replace(/<i>(.*?)<\/i>/gi, '*$1*');
  text = text.replace(/<del>(.*?)<\/del>/gi, '~~$1~~');
  text = text.replace(/<s>(.*?)<\/s>/gi, '~~$1~~');

  // Paragraphs & Linebreaks
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<p[^>]*>/gi, '');
  text = text.replace(/<\/p>/gi, '\n\n');

  // Lists
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  text = text.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Normalize excessive newlines and whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#([0-9]{1,7});/g, (g, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (g, c) => String.fromCharCode(parseInt(c, 16)));
}

/**
 * Standardize timestamp to YYYY-MM-DD HH:mm:ss format
 */
export function normalizeDate(dateVal) {
  if (!dateVal) return new Date().toISOString().replace('T', ' ').substring(0, 19);

  // If Unix timestamp in seconds (10 digits)
  if (typeof dateVal === 'number' && dateVal < 10000000000) {
    dateVal = dateVal * 1000;
  } else if (typeof dateVal === 'string' && /^\d{10}$/.test(dateVal.trim())) {
    dateVal = parseInt(dateVal.trim(), 10) * 1000;
  } else if (typeof dateVal === 'string' && /^\d{13}$/.test(dateVal.trim())) {
    dateVal = parseInt(dateVal.trim(), 10);
  }

  const d = new Date(dateVal);
  if (isNaN(d.getTime())) {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
  }
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Extract URL pathname from full URL
 */
function extractPathname(fullUrl, fallback = '/') {
  if (!fullUrl) return fallback;
  try {
    if (fullUrl.startsWith('/') || fullUrl.startsWith('#')) return fullUrl;
    const u = new URL(fullUrl);
    let path = u.pathname;
    if (u.search) path += u.search;
    return path || fallback;
  } catch {
    return fullUrl.startsWith('/') ? fullUrl : `/${fullUrl}`;
  }
}

/**
 * Helper to extract XML tag content (handles CDATA and plain text)
 */
function getXmlTag(xmlSnippet, tagName) {
  const regex = new RegExp(`<${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xmlSnippet.match(regex);
  if (!match) return '';
  let content = match[1].trim();
  // Strip CDATA if present
  if (content.startsWith('<![CDATA[') && content.endsWith(']]>')) {
    content = content.substring(9, content.length - 3);
  }
  return content.trim();
}

/**
 * Parse WordPress WXR (XML) export file
 */
export function parseWordPressWXR(xmlString) {
  const comments = [];
  if (!xmlString || typeof xmlString !== 'string') return comments;

  // Split items
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch;

  while ((itemMatch = itemRegex.exec(xmlString)) !== null) {
    const itemXml = itemMatch[1];
    const postTitle = getXmlTag(itemXml, 'title') || '';
    const postLink = getXmlTag(itemXml, 'link') || '';
    const postName = getXmlTag(itemXml, 'wp:post_name') || '';
    const postId = getXmlTag(itemXml, 'wp:post_id') || '';

    let pagePath = extractPathname(postLink);
    if (!pagePath || pagePath === '/') {
      if (postName) pagePath = `/${postName}/`;
      else if (postId) pagePath = `/?p=${postId}`;
      else pagePath = '/';
    }

    // Split comments in this item
    const commentRegex = /<wp:comment>([\s\S]*?)<\/wp:comment>/gi;
    let commentMatch;

    while ((commentMatch = commentRegex.exec(itemXml)) !== null) {
      const commentXml = commentMatch[1];
      const commentType = getXmlTag(commentXml, 'wp:comment_type');
      // Skip pingbacks and trackbacks if type is set and not empty or 'comment'
      if (commentType && commentType !== 'comment' && commentType !== '') {
        continue;
      }

      const commentId = getXmlTag(commentXml, 'wp:comment_id');
      const author = getXmlTag(commentXml, 'wp:comment_author') || '匿名';
      const email = getXmlTag(commentXml, 'wp:comment_author_email') || '';
      const authorUrl = getXmlTag(commentXml, 'wp:comment_author_url') || '';
      const commentDate = getXmlTag(commentXml, 'wp:comment_date') || getXmlTag(commentXml, 'wp:comment_date_gmt');
      const contentRaw = getXmlTag(commentXml, 'wp:comment_content') || '';
      const approved = getXmlTag(commentXml, 'wp:comment_approved');
      const parentId = getXmlTag(commentXml, 'wp:comment_parent');

      let status = 'approved';
      if (approved === '0' || approved === 'pending') status = 'pending';
      else if (approved === 'spam' || approved === 'trash') status = 'rejected';

      comments.push({
        original_id: commentId ? String(commentId) : undefined,
        parent_original_id: parentId && parentId !== '0' ? String(parentId) : null,
        page_path: pagePath,
        page_title: postTitle,
        username: author,
        email: email,
        website: authorUrl,
        content: htmlToMarkdown(contentRaw),
        status: status,
        is_pinned: 0,
        upvotes: 0,
        downvotes: 0,
        created_at: normalizeDate(commentDate),
      });
    }
  }

  return comments;
}

/**
 * Parse WordPress JSON export
 */
export function parseWordPressJSON(data) {
  const items = Array.isArray(data) ? data : (data.comments || data.data || []);
  return items.map(item => {
    let status = 'approved';
    const app = String(item.comment_approved ?? item.status ?? '1');
    if (app === '0' || app === 'pending') status = 'pending';
    else if (app === 'spam' || app === 'trash') status = 'rejected';

    const pagePath = extractPathname(item.link || item.page_path || item.url || (item.post_name ? `/${item.post_name}/` : '/'));
    const parentId = item.comment_parent || item.parent_id || item.parent;

    return {
      original_id: item.comment_ID ? String(item.comment_ID) : (item.id ? String(item.id) : undefined),
      parent_original_id: parentId && String(parentId) !== '0' ? String(parentId) : null,
      page_path: pagePath,
      page_title: item.post_title || item.page_title || '',
      username: item.comment_author || item.author || item.username || '匿名',
      email: item.comment_author_email || item.email || item.mail || '',
      website: item.comment_author_url || item.website || item.url || '',
      content: htmlToMarkdown(item.comment_content || item.content || ''),
      status: status,
      is_pinned: item.is_pinned ? 1 : 0,
      upvotes: parseInt(item.upvotes || 0, 10),
      downvotes: parseInt(item.downvotes || 0, 10),
      created_at: normalizeDate(item.comment_date || item.created_at || item.date),
    };
  });
}

/**
 * Parse Typecho JSON export
 */
export function parseTypechoJSON(data) {
  const items = Array.isArray(data) ? data : (data.comments || data.data || []);
  return items.map(item => {
    let status = 'approved';
    const st = String(item.status || 'approved').toLowerCase();
    if (st === 'waiting' || st === 'pending' || st === '0') status = 'pending';
    else if (st === 'spam' || st === 'trash') status = 'rejected';

    let pagePath = extractPathname(item.permalink || item.path || item.url || (item.slug ? `/${item.slug}.html` : ''));
    if (!pagePath || pagePath === '/') {
      if (item.cid) pagePath = `/archives/${item.cid}/`;
      else pagePath = '/';
    }

    const parentId = item.parent || item.parent_id;

    return {
      original_id: item.coid ? String(item.coid) : (item.id ? String(item.id) : undefined),
      parent_original_id: parentId && String(parentId) !== '0' ? String(parentId) : null,
      page_path: pagePath,
      page_title: item.title || item.page_title || '',
      username: item.author || item.username || '匿名',
      email: item.mail || item.email || '',
      website: item.url || item.website || '',
      content: htmlToMarkdown(item.text || item.content || ''),
      status: status,
      is_pinned: 0,
      upvotes: 0,
      downvotes: 0,
      created_at: normalizeDate(item.created || item.created_at),
    };
  });
}

/**
 * Parse Waline JSON export
 */
export function parseWalineJSON(data) {
  const items = Array.isArray(data) ? data : (data.data || data.comments || []);
  return items.map(item => {
    let status = 'approved';
    const st = String(item.status || '').toLowerCase();
    if (st === 'waiting' || st === 'pending') status = 'pending';
    else if (st === 'spam' || st === 'deleted') status = 'rejected';

    const pagePath = extractPathname(item.url || item.path || item.href || '/');
    const parentId = item.pid || item.rid || item.parent_id;
    const originId = item.objectId || item._id || item.id;

    return {
      original_id: originId ? String(originId) : undefined,
      parent_original_id: parentId && String(parentId) !== '0' ? String(parentId) : null,
      page_path: pagePath,
      page_title: item.title || item.page_title || '',
      username: item.nick || item.author || item.username || '匿名',
      email: item.mail || item.email || '',
      website: item.link || item.website || item.url_link || '',
      content: htmlToMarkdown(item.comment || item.content || ''),
      status: status,
      is_pinned: item.sticky ? 1 : (item.is_pinned ? 1 : 0),
      upvotes: parseInt(item.like || item.upvotes || 0, 10),
      downvotes: parseInt(item.downvotes || 0, 10),
      created_at: normalizeDate(item.insertedAt || item.createdAt || item.created),
    };
  });
}

/**
 * Parse Artalk JSON (Artrans) export
 */
export function parseArtalkJSON(data) {
  let items = [];
  const pageMap = new Map();

  if (data && typeof data === 'object') {
    if (Array.isArray(data.pages)) {
      for (const p of data.pages) {
        if (p.id !== undefined) {
          pageMap.set(String(p.id), { key: p.key || p.url || '/', title: p.title || '' });
        }
        if (p.key) {
          pageMap.set(String(p.key), { key: p.key, title: p.title || '' });
        }
      }
    }
    items = Array.isArray(data.comments) ? data.comments : (Array.isArray(data) ? data : (data.data || []));
  }

  return items.map(item => {
    let status = 'approved';
    if (item.is_pending) status = 'pending';
    else if (item.is_collapsed || item.status === 'spam') status = 'rejected';

    let pagePath = item.page_key || item.page_url || item.url || '/';
    let pageTitle = item.page_title || '';

    if (item.page_id && pageMap.has(String(item.page_id))) {
      const pageInfo = pageMap.get(String(item.page_id));
      pagePath = pageInfo.key;
      if (!pageTitle) pageTitle = pageInfo.title;
    } else if (pageMap.has(pagePath)) {
      const pageInfo = pageMap.get(pagePath);
      if (!pageTitle) pageTitle = pageInfo.title;
    }

    pagePath = extractPathname(pagePath);
    const parentId = item.rid || item.parent_id;

    return {
      original_id: item.id !== undefined ? String(item.id) : undefined,
      parent_original_id: parentId && String(parentId) !== '0' ? String(parentId) : null,
      page_path: pagePath,
      page_title: pageTitle,
      username: item.nick || item.username || '匿名',
      email: item.email || item.mail || '',
      website: item.link || item.website || '',
      content: htmlToMarkdown(item.content || item.comment || ''),
      status: status,
      is_pinned: item.is_pinned ? 1 : 0,
      upvotes: parseInt(item.vote_up || item.upvotes || 0, 10),
      downvotes: parseInt(item.vote_down || item.downvotes || 0, 10),
      created_at: normalizeDate(item.created_at || item.created),
    };
  });
}

/**
 * Parse Twikoo JSON export
 */
export function parseTwikooJSON(data) {
  const items = Array.isArray(data) ? data : (data.data || data.comments || []);
  return items.map(item => {
    const isSpam = item.isSpam || item.status === 'spam';
    const status = isSpam ? 'rejected' : 'approved';
    const pagePath = extractPathname(item.url || item.href || '/');

    return {
      original_id: item._id ? String(item._id) : (item.id ? String(item.id) : undefined),
      parent_original_id: item.rid ? String(item.rid) : (item.pid ? String(item.pid) : null),
      page_path: pagePath,
      page_title: item.title || item.page_title || '',
      username: item.nick || item.username || '匿名',
      email: item.mail || item.email || '',
      website: item.link || item.website || '',
      content: htmlToMarkdown(item.comment || item.content || ''),
      status: status,
      is_pinned: item.is_pinned ? 1 : 0,
      upvotes: parseInt(item.like || item.upvotes || 0, 10),
      downvotes: parseInt(item.downvotes || 0, 10),
      created_at: normalizeDate(item.created || item.created_at),
    };
  });
}

/**
 * Parse Qingniao native JSON export
 */
export function parseNativeJSON(data) {
  const items = Array.isArray(data) ? data : (data.comments || data.data || []);
  return items.map(item => ({
    original_id: item.id ? String(item.id) : undefined,
    parent_original_id: item.parent_id ? String(item.parent_id) : null,
    page_path: item.page_path || '/',
    page_title: item.page_title || '',
    username: item.username || '匿名',
    email: item.email || '',
    website: item.website || '',
    content: item.content || '',
    status: item.status || 'approved',
    is_pinned: item.is_pinned ? 1 : 0,
    upvotes: parseInt(item.upvotes || 0, 10),
    downvotes: parseInt(item.downvotes || 0, 10),
    created_at: normalizeDate(item.created_at),
  }));
}

/**
 * Automatically detect format and parse data
 */
export function autoDetectAndParse(rawData, forcedFormat = 'auto') {
  if (!rawData) return { format: 'unknown', comments: [] };

  // If XML string (WordPress WXR)
  if (typeof rawData === 'string' && (rawData.includes('<rss') || rawData.includes('<wp:comment') || rawData.includes('xmlns:wp='))) {
    return {
      format: 'wordpress',
      comments: parseWordPressWXR(rawData)
    };
  }

  let parsed = rawData;
  if (typeof rawData === 'string') {
    try {
      parsed = JSON.parse(rawData);
    } catch {
      // If it's XML without clear headers, try WordPress WXR parser
      if (rawData.includes('<item>') && rawData.includes('</item>')) {
        return {
          format: 'wordpress',
          comments: parseWordPressWXR(rawData)
        };
      }
      throw new Error('无法解析数据：无效的 JSON 或 XML 格式');
    }
  }

  if (forcedFormat && forcedFormat !== 'auto') {
    switch (forcedFormat.toLowerCase()) {
      case 'wordpress':
        return {
          format: 'wordpress',
          comments: typeof rawData === 'string' && rawData.includes('<') ? parseWordPressWXR(rawData) : parseWordPressJSON(parsed)
        };
      case 'typecho':
        return { format: 'typecho', comments: parseTypechoJSON(parsed) };
      case 'waline':
        return { format: 'waline', comments: parseWalineJSON(parsed) };
      case 'artalk':
        return { format: 'artalk', comments: parseArtalkJSON(parsed) };
      case 'twikoo':
        return { format: 'twikoo', comments: parseTwikooJSON(parsed) };
      case 'native':
        return { format: 'native', comments: parseNativeJSON(parsed) };
    }
  }

  // Auto detection for JSON structure
  // Artalk Artrans format check
  if (parsed && typeof parsed === 'object' && (parsed.artrans || parsed.version || parsed.pages || (Array.isArray(parsed.comments) && parsed.comments[0]?.page_key !== undefined))) {
    return { format: 'artalk', comments: parseArtalkJSON(parsed) };
  }

  const sampleArray = Array.isArray(parsed) ? parsed : (parsed.comments || parsed.data || []);
  if (sampleArray.length === 0) {
    return { format: 'empty', comments: [] };
  }

  const first = sampleArray[0] || {};

  // Artalk check
  if (first.page_key !== undefined || first.is_pending !== undefined || first.vote_up !== undefined) {
    return { format: 'artalk', comments: parseArtalkJSON(parsed) };
  }

  // Typecho check
  if (first.coid !== undefined || (first.cid !== undefined && first.text !== undefined)) {
    return { format: 'typecho', comments: parseTypechoJSON(parsed) };
  }

  // Twikoo check
  if (first._id !== undefined && (first.comment !== undefined || first.nick !== undefined) && first.rid !== undefined) {
    return { format: 'twikoo', comments: parseTwikooJSON(parsed) };
  }

  // Waline check
  if (first.objectId !== undefined || first.insertedAt !== undefined || (first.comment !== undefined && (first.pid !== undefined || first.mail !== undefined))) {
    return { format: 'waline', comments: parseWalineJSON(parsed) };
  }

  // WordPress JSON check
  if (first.comment_ID !== undefined || first.comment_author !== undefined || first.comment_content !== undefined) {
    return { format: 'wordpress', comments: parseWordPressJSON(parsed) };
  }

  // Native check
  if (first.page_path !== undefined && first.username !== undefined && first.content !== undefined) {
    return { format: 'native', comments: parseNativeJSON(parsed) };
  }

  // Default fallback to native
  return { format: 'native', comments: parseNativeJSON(parsed) };
}
