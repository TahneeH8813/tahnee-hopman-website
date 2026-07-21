/*
  Build script for the whole site.

  Reads:
    - content/pages/*.json   (Home, About, How I Work, Selected Work,
      Contact -- edited via /admin, the Decap CMS panel)
    - blog/content/posts/*.md  (Journal posts, written by /admin or by hand)

  And generates:
    - index.html, about.html, how-i-work.html, selected-work.html,
      contact.html
    - blog/posts/<slug>.html   (one page per journal post)
    - blog/index.html          (the journal list)
    - sitemap.xml

  A page's "published" flag controls whether its HTML file is written
  at all, and whether it appears in the navigation, so unchecking
  "Show this page" in the CMS effectively removes that page from the
  site on the next deploy.

  No npm dependencies on purpose, so there is nothing to install and
  nothing that can go out of date. Runs with plain Node.
*/

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PAGES_DIR = path.join(ROOT, "content", "pages");
const POSTS_SRC_DIR = path.join(ROOT, "blog", "content", "posts");
const POSTS_OUT_DIR = path.join(ROOT, "blog", "posts");
const BLOG_INDEX_PATH = path.join(ROOT, "blog", "index.html");
const HOME_PATH = path.join(ROOT, "index.html");
const ABOUT_PATH = path.join(ROOT, "about.html");
const HOW_PATH = path.join(ROOT, "how-i-work.html");
const WORK_PATH = path.join(ROOT, "selected-work.html");
const CONTACT_PATH = path.join(ROOT, "contact.html");
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");

const SITE_URL = "https://tahneehopman.com";

/* ---------------- tiny frontmatter parser (blog posts) ---------------- */
// Handles the simple flat fields Decap CMS writes for the posts
// collection (title, date, dek), plus a markdown body. Not a general
// YAML parser -- the site pages below use plain JSON instead, which
// needs no custom parsing at all.

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
// bold/italic, links, images, blockquotes, bulleted and numbered lists.

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(md) {
  let s = escapeHtml(md || "");
  s = s.replace(/!\[(.*?)\]\((.+?)\)/g, '<img src="$2" alt="$1" loading="lazy">');
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*(?!\*)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  return s;
}

function mdToHtml(md) {
  const blocks = (md || "").replace(/\r\n/g, "\n").split(/\n\s*\n/);
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

/* ---------------- read content ---------------- */

function readPageJson(name, defaults) {
  const file = path.join(PAGES_DIR, `${name}.json`);
  if (!fs.existsSync(file)) return defaults;
  try {
    return Object.assign({}, defaults, JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (err) {
    console.warn(`Could not parse content/pages/${name}.json, using defaults:`, err.message);
    return defaults;
  }
}

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

/* ---------------- navigation ---------------- */

function getNavItems(pages) {
  const items = [{ href: "index.html", label: "Home", key: "home" }];
  if (pages.about.published !== false) items.push({ href: "about.html", label: "About", key: "about" });
  if (pages.howIWork.published !== false) items.push({ href: "how-i-work.html", label: "How I Work", key: "how" });
  if (pages.selectedWork.published !== false) items.push({ href: "selected-work.html", label: "Selected Work", key: "work" });
  items.push({ href: "blog/index.html", label: "Journal", key: "journal" });
  if (pages.contact.published !== false) items.push({ href: "contact.html", label: "Contact", key: "contact" });
  return items;
}

/* ---------------- shared templates ---------------- */

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

function headerNav(depth, current, navItems) {
  const p = "../".repeat(depth);
  const links = navItems
    .map(
      (item) =>
        `<a href="${p}${item.href}"${current === item.key ? ' aria-current="page"' : ""}>${item.label}</a>`
    )
    .join("\n      ");
  return `<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="${p}index.html"><span class="pilcrow">&#182;</span> The Editorial Layer</a>
    <button class="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">Menu</button>
    <nav class="site-nav">
      ${links}
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

function heroImage(image) {
  return image ? `\n      <img class="hero-image" src="${image}" alt="" loading="lazy">` : "";
}

function pillarsHtml(pillars) {
  return (pillars || [])
    .map(
      (p) => `        <div class="pillar">
          <h3>${inline(p.heading)}</h3>
          <p>${inline(p.body)}</p>
        </div>`
    )
    .join("\n");
}

function workItemsHtml(items) {
  return (items || [])
    .map(
      (item) => `      <div class="work-item">
        <div class="work-meta">${inline(item.meta)}</div>
        <h3>${inline(item.title)}</h3>
        <p>${inline(item.body)}</p>
      </div>`
    )
    .join("\n");
}

function howIWorkSectionsHtml(sections) {
  return (sections || [])
    .map(
      (s) => `  <section id="${s.id}">
    <div class="wrap">
      <h2>${inline(s.heading)}</h2>
      <p>${inline(s.body)}</p>
      <ul class="service-list">
${(s.items || []).map((i) => `        <li>${inline(i)}</li>`).join("\n")}
      </ul>
    </div>
  </section>`
    )
    .join("\n\n");
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

/* ---------------- pages ---------------- */

function homePage(data, posts, navItems) {
  const canonical = `${SITE_URL}/`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
${headBlock({
    title: `${data.hero_heading} | ${data.hero_eyebrow}`,
    description: data.meta_description,
    canonical,
    depth: 0,
  })}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Tahnee Hopman",
  "jobTitle": "Editor",
  "url": "${SITE_URL}/",
  "email": "mailto:tahnee.hopman@gmail.com",
  "sameAs": ["https://www.linkedin.com/in/tahneehopman/"],
  "address": { "@type": "PostalAddress", "addressLocality": "Melbourne", "addressCountry": "AU" },
  "description": "Editor specialising in editorial strategy, structural and analytical editing, copyediting, style guides and publication production."
}
</script>
</head>
<body>

${headerNav(0, "home", navItems)}

<main>

  <section class="hero">
    <div class="wrap">
      <span class="eyebrow">${inline(data.hero_eyebrow)}</span>
      <h1>${inline(data.hero_heading)}</h1>
      <p class="lead">${inline(data.hero_lead)}</p>${heroImage(data.hero_image)}
      <div class="cta-row">
        <a class="btn btn-primary" href="#practice">${inline(data.cta_primary_label)}</a>
        <a class="btn btn-secondary" href="contact.html">${inline(data.cta_secondary_label)}</a>
      </div>
    </div>
  </section>

  <hr class="rule">

  <section>
    <div class="wrap">
      <h2>${inline(data.intro_heading)}</h2>
${mdToHtml(data.intro_body)}
    </div>
  </section>

  <section id="practice">
    <div class="wrap-wide">
      <h2>${inline(data.practice_heading)}</h2>
      <div class="pillar-grid">
${pillarsHtml(data.pillars)}
      </div>
    </div>
  </section>

  <hr class="rule">

  <section>
    <div class="wrap">
      <h2>${inline(data.selected_work_heading)}</h2>
      <p class="muted">${inline(data.selected_work_intro)}</p>
${workItemsHtml(data.selected_work_items)}
    </div>
  </section>

  <section class="tight">
    <div class="wrap">
      <h2>From the journal</h2>
${latestPostsSnippet(posts)}
      <p><a href="blog/index.html">Visit the journal &rarr;</a></p>
    </div>
  </section>

</main>

${footer(0)}
<script src="https://identity.netlify.com/v1/netlify-identity-widget.js"></script>
<script>
  if (window.netlifyIdentity) {
    window.netlifyIdentity.on("init", function (user) {
      if (!user) {
        window.netlifyIdentity.on("login", function () {
          document.location.href = "/admin/";
        });
      }
    });
  }
</script>
</body>
</html>
`;
}

function aboutPage(data, navItems) {
  const canonical = `${SITE_URL}/about.html`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
${headBlock({
    title: `${data.hero_eyebrow} | The Editorial Layer`,
    description: data.meta_description,
    canonical,
    depth: 0,
    type: "article",
  })}
</head>
<body>

${headerNav(0, "about", navItems)}

<main>
  <section class="hero">
    <div class="wrap">
      <span class="eyebrow">${inline(data.hero_eyebrow)}</span>
      <h1>${inline(data.hero_heading)}</h1>

      <p class="lead">${inline(data.hero_lead)}</p>${heroImage(data.hero_image)}

${mdToHtml(data.body)}

      <h2>${inline(data.credentials_heading)}</h2>
      <p class="muted">${inline(data.credentials_text)}</p>
    </div>
  </section>
</main>

${footer(0)}
</body>
</html>
`;
}

function howIWorkPage(data, navItems) {
  const canonical = `${SITE_URL}/how-i-work.html`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
${headBlock({
    title: `${data.hero_eyebrow} | The Editorial Layer`,
    description: data.meta_description,
    canonical,
    depth: 0,
    type: "article",
  })}
</head>
<body>

${headerNav(0, "how", navItems)}

<main>
  <section class="hero">
    <div class="wrap">
      <span class="eyebrow">${inline(data.hero_eyebrow)}</span>
      <h1>${inline(data.hero_heading)}</h1>
      <p class="lead">${inline(data.hero_lead)}</p>${heroImage(data.hero_image)}
    </div>
  </section>

  <hr class="rule">

${howIWorkSectionsHtml(data.sections)}

  <hr class="rule">

  <section class="tight">
    <div class="wrap">
      <h2>${inline(data.closing_heading)}</h2>
      <p>${inline(data.closing_body)}</p>
      <div class="cta-row">
        <a class="btn btn-primary" href="contact.html">${inline(data.closing_cta_label)}</a>
      </div>
    </div>
  </section>
</main>

${footer(0)}
</body>
</html>
`;
}

function selectedWorkPage(data, navItems) {
  const canonical = `${SITE_URL}/selected-work.html`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
${headBlock({
    title: `${data.hero_eyebrow} | The Editorial Layer`,
    description: data.meta_description,
    canonical,
    depth: 0,
    type: "article",
  })}
</head>
<body>

${headerNav(0, "work", navItems)}

<main>
  <section class="hero">
    <div class="wrap">
      <span class="eyebrow">${inline(data.hero_eyebrow)}</span>
      <h1>${inline(data.hero_heading)}</h1>
      <p class="lead">${inline(data.hero_lead)}</p>${heroImage(data.hero_image)}
    </div>
  </section>

  <hr class="rule">

  <section>
    <div class="wrap">

${workItemsHtml(data.items)}

    </div>
  </section>

  <section class="tight">
    <div class="wrap">
      <p>${inline(data.closing_text)}</p>
    </div>
  </section>
</main>

${footer(0)}
</body>
</html>
`;
}

function contactPage(data, navItems) {
  const canonical = `${SITE_URL}/contact.html`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
${headBlock({
    title: `${data.hero_eyebrow} | The Editorial Layer`,
    description: data.meta_description,
    canonical,
    depth: 0,
    type: "article",
  })}
</head>
<body>

${headerNav(0, "contact", navItems)}

<main>
  <section class="hero">
    <div class="wrap">
      <span class="eyebrow">${inline(data.hero_eyebrow)}</span>
      <h1>${inline(data.hero_heading)}</h1>
      <p class="lead">${inline(data.hero_lead)}</p>${heroImage(data.hero_image)}

      <p>
        <a href="mailto:${data.email}">${data.email}</a><br>
        <a href="${data.linkedin_url}">${inline(data.linkedin_label)}</a><br>
        ${inline(data.location)}
      </p>

      <form class="contact-form" name="contact" method="POST" data-netlify="true" netlify-honeypot="bot-field">
        <input type="hidden" name="form-name" value="contact">
        <p class="hp-field"><label>Don't fill this in: <input name="bot-field"></label></p>

        <label for="name">Name</label>
        <input type="text" id="name" name="name" required>

        <label for="email">Email</label>
        <input type="email" id="email" name="email" required>

        <label for="message">What are you working on?</label>
        <textarea id="message" name="message" required></textarea>

        <button class="btn btn-primary" type="submit">Send</button>
      </form>
      <p class="muted" style="margin-top: 1em; font-size: 0.85rem;">This form works automatically if the site is hosted on Netlify. See the README for details.</p>
    </div>
  </section>
</main>

${footer(0)}
</body>
</html>
`;
}

function postPage(post, navItems) {
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

${headerNav(depth, "journal", navItems)}

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

function blogIndexPage(posts, navItems) {
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

${headerNav(depth, "journal", navItems)}

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

/* ---------------- sitemap ---------------- */

function updateSitemap(posts, pages) {
  const staticUrls = ["/"];
  if (pages.about.published !== false) staticUrls.push("/about.html");
  if (pages.howIWork.published !== false) staticUrls.push("/how-i-work.html");
  if (pages.selectedWork.published !== false) staticUrls.push("/selected-work.html");
  staticUrls.push("/blog/index.html");
  if (pages.contact.published !== false) staticUrls.push("/contact.html");
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

function removeIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn(`Could not remove ${filePath}, continuing:`, err.message);
  }
}

function main() {
  const pages = {
    home: readPageJson("home", {}),
    about: readPageJson("about", { published: true }),
    howIWork: readPageJson("how-i-work", { published: true }),
    selectedWork: readPageJson("selected-work", { published: true }),
    contact: readPageJson("contact", { published: true }),
  };
  const navItems = getNavItems(pages);

  const posts = readPosts();
  clearOutputDir();
  posts.forEach((post) => {
    fs.writeFileSync(path.join(POSTS_OUT_DIR, `${post.slug}.html`), postPage(post, navItems));
  });
  fs.writeFileSync(BLOG_INDEX_PATH, blogIndexPage(posts, navItems));

  fs.writeFileSync(HOME_PATH, homePage(pages.home, posts, navItems));

  if (pages.about.published !== false) {
    fs.writeFileSync(ABOUT_PATH, aboutPage(pages.about, navItems));
  } else {
    removeIfExists(ABOUT_PATH);
  }

  if (pages.howIWork.published !== false) {
    fs.writeFileSync(HOW_PATH, howIWorkPage(pages.howIWork, navItems));
  } else {
    removeIfExists(HOW_PATH);
  }

  if (pages.selectedWork.published !== false) {
    fs.writeFileSync(WORK_PATH, selectedWorkPage(pages.selectedWork, navItems));
  } else {
    removeIfExists(WORK_PATH);
  }

  if (pages.contact.published !== false) {
    fs.writeFileSync(CONTACT_PATH, contactPage(pages.contact, navItems));
  } else {
    removeIfExists(CONTACT_PATH);
  }

  updateSitemap(posts, pages);
  console.log(`Built ${posts.length} journal post(s) and ${Object.keys(pages).length} site pages.`);
}

main();
