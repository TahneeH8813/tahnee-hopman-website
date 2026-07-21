# Your website

Plain HTML and CSS, plus a small, free content management system (Decap CMS) so you can edit every page and write journal posts yourself at yoursite.com/admin, without touching any code.

## What's in here

- `content/pages/*.json`: the text for Home, About, How I Work, Selected Work and Contact. This is what `/admin` edits. Don't edit these by hand unless you're comfortable with JSON, use the CMS instead
- `index.html`, `about.html`, `how-i-work.html`, `selected-work.html`, `contact.html`: the actual pages, generated automatically from `content/pages/*.json`. Don't edit these directly, changes will be overwritten on the next build
- `blog/index.html`: the journal list. Also generated automatically
- `blog/posts/`: one HTML page per journal post. Also generated automatically
- `blog/content/posts/`: where your actual posts live, as plain text files with a bit of structure. This is what the CMS writes to
- `admin/`: the CMS itself (Decap CMS). This is the page you'll log into to edit pages and write posts
- `build.js`: the script that turns `content/pages/*.json` and `blog/content/posts/` into the actual web pages. You never need to open this
- `css/style.css`: all the styling in one place
- `favicon.svg`: the small pilcrow mark used as the site icon

The placeholder domain `tahneehopman.com` appears in a few places (meta tags, sitemap, the CMS backend). Once a real domain is connected, that text should be updated to match.

## Editing a page

1. Go to your site's `/admin` address and log in.
2. Click "Site pages" in the sidebar, then choose the page you want (Home, About, How I Work, Selected Work or Contact).
3. Edit any text field, add or remove list items (like the work items on Selected Work, or the sections on How I Work), or upload a photo using an image field.
4. Click "Publish." The site rebuilds automatically, usually live within a minute or two.

### Removing a page

Every page except Home has a "Show this page" switch. Turn it off and publish, and that page (and its link in the navigation menu) disappears from the site on the next build. Turn it back on any time to bring it back, nothing is deleted.

### Adding images

Any image field (including inside the main body text areas, via the image button in the toolbar) uploads straight from your computer and inserts automatically, no file handling required.

## Writing a new post

1. Go to your site's `/admin` address and log in.
2. Click "New Journal Post." Fill in a title, a publish date, an optional short description (used as the teaser on the journal list, if left blank the start of the post is used instead), and write the body in the text box, using the toolbar for bold, italic, links, images, headings, quotes and lists.
3. Click "Publish." The site rebuilds automatically, usually live within a minute or two.

The post will appear on the journal page and, if it's one of the three most recent, on the home page too. Nothing goes live without clicking publish, there's no auto-posting. Posts can also be saved as a draft first.

## A few things worth knowing

- The "How I Work" page's four sections each have an anchor id, used by the links on the Home page's pillar grid (e.g. `how-i-work.html#strategy`). Renaming a section is fine, but changing its id will break that link until the Home page's pillar links are updated too.
- The contact form on the Contact page uses Netlify's free form handling (100 submissions a month at no cost) and switches on automatically once the site is hosted on Netlify.
- Fonts (Lora and Source Sans 3) load from Google Fonts over the internet.
