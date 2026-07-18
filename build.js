/*
  Build script for the journal.

  Reads markdown posts from blog/content/posts/*.md (written by the
  /admin CMS, or by hand), and generates:
    - blog/posts/<slug>.html   (one page per post)
    - blog/index.html          (the journal list)
    - the "From the journal" section on the home page (index.html)
    - sitemap.xml

  No npm dependencies on purpose, so there is nothing to install and
  nothing that can go out of date. Runs with plain Node.
*/

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const POSTS_SRC_DIR = path.join(ROOT, "blog", "content", "posts");
const POSTS_OUT_DIR = path.join(ROOT, "blog", "posts");
const BLOG_INDEX_PATH = path.join(ROOT, "blog", "index.html");
const HOME_PATH = path.join(ROOT, "index.html");
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");

const SITE_URL = "https://tahneehopman.com";

/* ---------------- tiny frontmatter parser ---------------- */
// Handles the simple flat fields Decap CMS writes for this collection
// (title, date, dek), plus a markdown body. Not a general YAML parser.

function parsePost(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  const [, fmBlock, body] = match;
  const data = {};
  fmBlock.split(/\r?\n/).forEach((line) => {
    const idx = line.indexOf(":");
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  });
  return { data, body: body || "" };
}

/* ---------------- tiny markdown -> html ---------------- */
// Covers what the CMS's rich-text editor produces: paragraphs, headings,
// bold/italic, links, blockquotes, bulleted and numbered lists.

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(md) {
  let s = escapeHtml(md);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*(?!\*)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  return s;
}

function mdToHtml(md) {
  const blocks = md.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  const html = blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = Math.min(headingMatch[1].length + 1, 6); // shift down one level, h1 is the post title
        return `<h${level}>${inline(headingMatch[2])}</h${level}>`;
      }

      if (/^>\s?/.test(trimmed)) {
        const text = trimmed
          .split("\n")
          .map((l) => l.replace(/^>\s?/, ""))
          .join(" ");
        return `<blockquote><p>${inline(text)}</p></blockquote>`;
      }

      const lines = trimmed.split("\n");
      if (lines.every((l) => /^[-*]\s+/.test(l.trim()))) {
        const items = lines
          .map((l) => `<li>${inline(l.trim().replace(/^[-*]\s+/, ""))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      if (lines.every((l) => /^\d+\.\s+/.test(l.trim()))) {
        const items = lines
          .map((l) => `<li>${inline(l.trim().replace(/^\d+\.\s+/, ""))}</li>`)
          .join("");
        return `<ol>${items}</ol>`;
      }

      return `<p>${inline(lines.join(" "))}</p>`;
    })
    .filter(Boolean)
    .join("\n");
  return html;
}

function plainTextExcerpt(md, len) {
  const text = md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .replace(/\n+/g, " ")
    .trim();
  return text.length > len ? text.slice(0, len).trim() + "…" : text;
}

function formatDate(d) {
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* ---------------- read posts ---------------- */

function readPosts() {
  if (!fs.existsSync(POSTS_SRC_DIR)) return [];
  const files = fs
    .readdirSync(POSTS_SRC_DIR)
    .filter((f) => f.endsWith(".md"));

  const posts = files
    .map((file) => {
      const raw = fs.readFileSync(path.join(POSTS_SRC_DIR, file), "utf8");
      const { data, body } = parsePost(raw);
      if (!data.title || !data.title.trim() || !body.trim()) {
        // Skip empty, blank or placeholder files rather than publishing
        // an "Untitled" post. Lets us safely neutralise a stray file by
        // just clearing its contents.
        return null;
      }
      const slug = file.replace(/\.md$/, "");
      const date = data.date ? new Date(data.date) : new Date();
      const dek = (data.dek && data.dek.trim()) || plainTextExcerpt(body, 160);
      return {
        slug,
        title: data.title.trim(),
        date: isNaN(date.getTime()) ? new Date() : date,
        dek,
        bodyHtml: mdToHtml(body),
      };
    })
    .filter(Boolean);

  posts.sort((a, b) => b.date - a.date);
  return posts;
}

/* ---------------- templates ---------------- */

function headBlock({ title, description, canonical, depth, type }) {
  const p = "../".repeat(depth);
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="${type || "website"}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<link rel="icon" href="${p}favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@500;600&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${p}css/style.css">`;
}

function headerNav(depth, current) {
  const p = "../".repeat(depth);
  const link = (href, label, key) =>
    `<a href="${p}${href}"${current === key ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="${p}index.html"><span class="pilcrow">&#182;</span> The Editorial Layer</a>
    <button class="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">Menu</button>
    <nav class="site-nav">
      ${link("index.html", "Home", "home")}
      ${link("about.html", "About", "about")}
      ${link("how-i-work.html", "How I Work", "how")}
      ${link("selected-work.html", "Selected Work", "work")}
      ${link("blog/index.html", "Journal", "journal")}
      ${link("contact.html", "Contact", "contact")}
    </nav>
  </div>
</header>`;
}

function footer(depth) {
  const p = "../".repeat(depth);
  return `<footer class="site-footer">
  <div class="footer-inner">
    <div>Tahnee Hopman &middot; Melbourne, Australia</div>
    <div class="footer-links">
      <a href="mailto:tahnee.hopman@gmail.com">tahnee.hopman@gmail.com</a>
      <a href="https://www.linkedin.com/in/tahneehopman/">LinkedIn</a>
    </div>
  </div>
</footer>
<script src="${p}js/main.js"></script>`;
}

function postPage(post) {
  const depth = 2;
  const canonical = `${SITE_URL}/blog/posts/${post.slug}.html`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
${headBlock({
    title: `${post.title} | The Editorial Layer`,
    description: post.dek,
    canonical,
    depth,
    type: "article",
  })}
</head>
<body>

${headerNav(depth, "journal")}

<main>
  <section class="hero">
    <div class="wrap">
      <a class="back-link" href="../index.html">&larr; Back to the journal</a>
      <article class="post">
        <h1>${post.title}</h1>
        <p class="post-date">${formatDate(post.date)}</p>
${post.bodyHtml}
      </article>
    </div>
  </section>
</main>

${footer(depth)}
</body>
</html>
`;
}

function blogIndexPage(posts) {
  const depth = 1;
  const canonical = `${SITE_URL}/blog/index.html`;
  const list = posts.length
    ? posts
        .map(
          (post) => `      <div class="post-item">
        <div class="post-date">${formatDate(post.date)}</div>
        <h3><a href="posts/${post.slug}.html">${post.title}</a></h3>
        <p class="post-dek">${post.dek}</p>
      </div>`
        )
        .join("\n")
    : `      <p class="muted">Nothing published here yet. First post is on its way.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
${headBlock({
    title: "Journal | The Editorial Layer",
    description:
      "Short, occasional essays on how editing actually works, from Tahnee Hopman.",
    canonical,
    depth,
  })}
</head>
<body>

${headerNav(depth, "journal")}

<main>
  <section class="hero">
    <div class="wrap">
      <span class="eyebrow">Journal</span>
      <h1>Notes on editing</h1>
      <p class="lead">Short, occasional essays on how editing actually works. No listicles, no "ten proofreading tips."</p>
    </div>
  </section>

  <hr class="rule">

  <section>
    <div class="wrap">
${list}
    </div>
  </section>
</main>

${footer(depth)}
</body>
</html>
`;
}

function latestPostsSnippet(posts) {
  const latest = posts.slice(0, 3);
  if (!latest.length) {
    return `      <p class="muted">Nothing published here yet. First post is on its way. In the meantime, feel free to <a href="blog/index.html">visit the journal</a>.</p>`;
  }
  return latest
    .map(
      (post) => `      <div class="post-item">
        <h3><a href="blog/posts/${post.slug}.html">${post.title}</a></h3>
        <p class="post-dek">${post.dek}</p>
      </div>`
    )
    .join("\n");
}

function updateHomePage(posts) {
  if (!fs.existsSync(HOME_PATH)) return;
  let html = fs.readFileSync(HOME_PATH, "utf8");
  const startMarker = "<!-- LATEST_POSTS:START -->";
  const endMarker = "<!-- LATEST_POSTS:END -->";
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start === -1 || end === -1) return;
  const before = html.slice(0, start + startMarker.length);
  const after = html.slice(end);
  html = `${before}\n${latestPostsSnippet(posts)}\n${after}`;
  fs.writeFileSync(HOME_PATH, html);
}

function updateSitemap(posts) {
  const staticUrls = [
    "/",
    "/about.html",
    "/how-i-work.html",
    "/selected-work.html",
    "/blog/index.html",
    "/contact.html",
  ];
  const postUrls = posts.map((p) => `/blog/posts/${p.slug}.html`);
  const urls = staticUrls.concat(postUrls);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE_URL}${u}</loc></url>`).join("\n")}
</urlset>
`;
  fs.writeFileSync(SITEMAP_PATH, xml);
}

/* ---------------- run ---------------- */

function clearOutputDir() {
  try {
    if (fs.existsSync(POSTS_OUT_DIR)) {
      fs.rmSync(POSTS_OUT_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(POSTS_OUT_DIR, { recursive: true });
  } catch (err) {
    // Some environments don't allow deleting files. Falling back to
    // overwriting individual files still keeps the output correct,
    // it just won't clean up posts that were removed from the CMS.
    fs.mkdirSync(POSTS_OUT_DIR, { recursive: true });
    console.warn("Could not clear old post files, continuing:", err.message);
  }
}

function main() {
  const posts = readPosts();
  clearOutputDir();
  posts.forEach((post) => {
    fs.writeFileSync(
      path.join(POSTS_OUT_DIR, `${post.slug}.html`),
      postPage(post)
    );
  });
  fs.writeFileSync(BLOG_INDEX_PATH, blogIndexPage(posts));
  updateHomePage(posts);
  updateSitemap(posts);
  console.log(`Built ${posts.length} journal post(s).`);
}

main();
