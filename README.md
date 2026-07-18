# Your website

Plain HTML and CSS for the main pages, plus a small, free content management system for the journal, so you can write and publish new posts yourself at yoursite.com/admin without touching any code.

## What's in here

- `index.html`, `about.html`, `how-i-work.html`, `selected-work.html`, `contact.html`: the main pages, hand-written, edit these as plain HTML if you ever want to change them
- `blog/index.html`: the journal list. Generated automatically, don't edit this by hand, changes will be overwritten
- `blog/posts/`: one HTML page per journal post. Also generated automatically
- `blog/content/posts/`: where your actual posts live, as plain text files with a bit of structure. This is what the CMS writes to
- `admin/`: the CMS itself (Decap CMS). This is the page you'll log into to write posts
- `build.js`: the script that turns what's in `blog/content/posts/` into the actual web pages. You never need to open this
- `css/style.css`: all the styling in one place
- `favicon.svg`: the small pilcrow mark used as the site icon

There's currently nothing in the journal. It's empty and ready for your first post.

The placeholder domain `tahneehopman.com` appears in a few places (meta tags, sitemap, the CMS backend). Once a real domain is connected, that text should be updated to match.

## Writing a new post

1. Go to your site's `/admin` address and log in.
2. Click "New Journal Post." Fill in a title, a publish date, an optional short description (used as the teaser on the journal list, if left blank the start of the post is used instead), and write the body in the text box, using the toolbar for bold, italic, links, headings, quotes and lists.
3. Click "Publish." The site rebuilds automatically, usually live within a minute or two.

The post will appear on the journal page and, if it's one of the three most recent, on the home page too. Nothing goes live without clicking publish, there's no auto-posting. Posts can also be saved as a draft first.

## A few things worth knowing

- No photo is used anywhere on the site. It works fine without one, but a headshot can be added to the header or About page later if wanted.
- The contact form on the Contact page uses Netlify's free form handling (100 submissions a month at no cost) and switches on automatically once the site is hosted on Netlify.
- Fonts (Lora and Source Sans 3) load from Google Fonts over the internet.
