# SEO and Entity Discipline

> Required for any site where discoverability matters: marketing sites, portfolios, content sites.
> Optional but recommended for SaaS landing pages.

---

## Per-page metadata

Every page must define, at minimum:

- `title` — page-specific, not site-default
- `description` — page-specific, 150-160 characters
- `canonical` — pointing to the production URL for this page
- `og:image`, `og:title`, `og:description` — for link previews
- `twitter:card`, `twitter:image` — same content, Twitter format

In Next.js App Router, this lives in `app/<route>/page.tsx` via the `metadata` export, or dynamically via `generateMetadata` for content pages.

Set `metadataBase` once in `app/layout.tsx`:

```ts
export const metadata: Metadata = {
  metadataBase: new URL('https://your-production-domain.com'),
}
```

---

## Entity schema (Person / Organization)

For sites where the subject is a person or organization, embed JSON-LD schema in the root layout. Use `alternateName` as an array for name variants. Use `knowsAbout` for topical relevance to LLM and search crawlers.

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Honour [Last Name]",
  "alternateName": ["Hman", "Honour"],
  "url": "https://your-site.com",
  "jobTitle": "Software Engineer",
  "worksFor": { "@type": "Organization", "name": "Company" },
  "knowsAbout": ["Full-stack development", "AI automation", "Internal tools"],
  "sameAs": [
    "https://github.com/username",
    "https://linkedin.com/in/username"
  ]
}
```

---

## Article schema for content pages

Every blog post, writeup, or long-form content page gets `Article` schema with:

- `datePublished` (highest-weighted signal for "recent work" queries)
- `dateModified`
- `author`
- `headline`

---

## /llms.txt

Add `/llms.txt` to the public root. Emerging convention for LLM crawler discovery.

- Auto-generate it from your content data structure, don't hardcode.
- When content changes, the file updates automatically.

Reference: https://llmstxt.org

---

## Dynamic sitemap and robots

- `app/sitemap.ts` — generates `/sitemap.xml` dynamically from routes and content data. **Static `sitemap.xml` files are an anti-pattern** because they go stale.
- `app/robots.ts` — environment-aware. Production allows all; staging and preview environments disallow all.

```ts
// app/robots.ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.VERCEL_ENV === 'production'
  if (!isProduction) {
    return { rules: { userAgent: '*', disallow: '/' } }
  }
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://your-production-domain.com/sitemap.xml',
  }
}
```

---

## What NOT to do

- Static `sitemap.xml` or `robots.txt` files in `public/`
- Per-page metadata stuffed into a single shared component (lazy, produces duplicates)
- OG images that are screenshots or generic stock — design them properly
- Schema with claimed credentials, awards, or facts that aren't real
- `noindex` on production by accident (always verify after deploy)

---

## Performance budget for SEO

For marketing and portfolio sites, Lighthouse targets are non-negotiable:

| Category | Target |
|----------|--------|
| Performance | 95+ |
| Accessibility | 95+ |
| Best Practices | 95+ |
| SEO | 100 |

SaaS apps can ship at lower performance targets because they trade off for actual product behavior. Marketing sites cannot.
