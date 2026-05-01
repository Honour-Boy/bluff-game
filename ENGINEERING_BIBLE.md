# Engineering Bible

> Canonical engineering reference. Read this before writing any code in this project.

---

## Stack

| Layer | Tool | Notes |
|-------|------|-------|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui | Always App Router. Never Pages Router. |
| Backend | Python, FastAPI, Pydantic v2 | All I/O contracts use Pydantic schemas. |
| Database | Supabase (PostgreSQL + RLS) | Supabase JS client on frontend, raw SQL or Supabase client on backend. |
| Auth | Clerk (frontend identity) → Supabase JWT (backend auth) | Clerk handles sign-in. Backend validates Supabase JWTs. |
| Caching | Redis | Session caching, rate limiting, job queues. |
| Product analytics & flags | PostHog | Product analytics, session replay, feature flags, experiments, LLM analytics. Single SDK on frontend. |
| CLI tools | Python, Typer, Rich | For developer-facing tools. |
| LLM routing | OpenRouter (model-agnostic) | Tiered: cheap models for simple tasks, frontier for reasoning. |
| Code quality | FORGE / vibe2prod | Scan before every push. See FORGE section below. |

## Infrastructure

| Component | Host | Details |
|-----------|------|---------|
| Frontend | Vercel | Auto-deploys from Git. Global CDN. |
| Backend | Oracle Cloud VM (Always Free) | 24GB RAM, 4 OCPU ARM. Docker containers via Coolify. |
| Database | Supabase Cloud | Separate staging and production databases. |
| Secrets | Doppler | All secrets managed here. Synced to Vercel and Coolify. No .env files. |
| Automation | n8n (self-hosted on Oracle VM) | Webhook routing, scheduled workflows, notification routing. |
| Monitoring (errors) | Sentry → n8n → Slack | Error tracking, crons, distributed tracing. Auto-creates GitHub Issues in #tasks. |
| Monitoring (product) | PostHog Cloud → n8n → Slack | Product analytics, session replay, feature flags, LLM analytics. Insight alerts to #product. |
| Uptime | UptimeRobot | Pings frontend + backend URLs. Alerts via Slack. |
| User feedback | Sleekplan | Webhooks → n8n → GitHub Issues. |
| Multi-tenant OAuth | Nango (when needed) | For SaaS where users connect their own external accounts. |

## Database Rules

1. **All schema changes go through Supabase CLI migrations.** Run `supabase migration new <name>`, write the SQL, commit the file.
2. Never modify the schema directly via dashboard, raw SQL, or any other method.
3. Migration files live in `supabase/migrations/` and are committed to Git.
4. Apply to staging first: `supabase db push`. Apply to production only after staging validation.
5. Both frontend and backend talk to the same database. Migrations are language-agnostic.
6. Row Level Security (RLS) must be configured on all user-facing tables.
7. Do NOT use Prisma.

## Secrets and Environment Variables

1. **All secrets live in Doppler**, organized by project and environment (staging/production).
2. Deployed apps receive secrets from Vercel (frontend) and Coolify (backend), synced from Doppler.
3. For local development: `doppler run -- <command>`. No .env files.
4. To list variables: `doppler secrets --only-names`.
5. Each directory that needs env vars has its own `.env.example`:
   - `frontend/.env.example` — frontend variables (Clerk publishable key, Supabase URL, API URL, etc.)
   - `backend/.env.example` — backend variables (Supabase service key, JWT secret, OpenRouter key, etc.)
6. Never commit secrets. Never hardcode secrets. Never access production secrets locally.

## Git Workflow

1. `main` (production) ← `staging` ← `feature/issue-N-description`.
2. Never push directly to `main` or `staging`. Always use PRs.
3. Feature branches created from `staging`: `feature/issue-<number>-<short-description>`.
4. Micro-commits: each commit does one thing with a descriptive message.
5. PR description includes `Closes #<number>` to auto-close the linked Issue.
6. Tests must pass in GitHub Actions before merge.

## Repo Structure

Separate repos per project. No monorepos. Frontend and backend may share a repo:

```
project/
├── frontend/              # Next.js
│   └── .env.example       # Frontend variable names (committed)
├── backend/               # FastAPI
│   └── .env.example       # Backend variable names (committed)
├── supabase/              # Migrations
├── CLAUDE.md              # Project-specific agent context
├── ENGINEERING_BIBLE.md   # This file
└── docker-compose.yml     # Resource limits required per service
```

## Deployment

1. **Frontend**: Push → Vercel auto-deploys. Staging branch = preview. Main = production.
2. **Backend**: Push → Coolify auto-deploys Docker containers. Resource limits required:
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '1.0'
         memory: 4G
       reservations:
         memory: 2G
   ```
3. Coolify deploys from `staging` and `main` branches only.
4. GitHub Actions runs tests on every PR. Failing tests block merge.

## Testing

1. Every new API endpoint includes at least one test.
2. Every database mutation (create/update/delete) includes at least one test.
3. Authentication and payment flows are always tested.
4. Tests run in GitHub Actions on every PR. Failing tests block merge.
5. Local: `doppler run -- pytest`.

## Observability Rules

1. **Sentry owns errors. PostHog owns behaviour.** Don't cross the streams. If a thing has a stack trace, it's Sentry. If it's a user event, flag, replay, or LLM call, it's PostHog.
2. **One SDK per concern on the frontend.** `@sentry/nextjs` for errors. `posthog-js` (via `instrumentation-client.ts`) for everything else. Don't import PostHog's error tracker if Sentry is in the project.
3. **Feature flags live in PostHog.** Use them for production gradual rollout, kill switches, and experiments — not for "is this safe to ship," which is what the staging branch is for. Doppler stays for secrets and config, not flagging.
4. **LLM calls through OpenRouter are captured in PostHog LLM analytics.** Cost, latency, and prompt drift are visible per user, per feature. Wire on the OpenRouter-calling layer, not at the route handler.
5. **Provision via Vercel Marketplace where possible.** PostHog and Sentry both have Marketplace integrations that auto-write env vars. Don't hand-roll.
6. **Alerts route through n8n.** Sentry → `#tasks` (auto-Issue, follows existing pipeline). PostHog insight/error alerts → `#product` (no auto-Issue unless tagged `regression`). The "one place to look" principle still holds.

## API Design

1. REST over HTTPS between frontend and backend.
2. FastAPI with Pydantic request/response models.
3. CORS configured between Vercel origin and backend.
4. Auth: Clerk session token (frontend) → Supabase JWT validation (backend).
5. Long-running operations: background tasks + SSE for progress.

## FORGE / vibe2prod

FORGE scans code for security, quality, and architecture issues. **Run it locally via Claude Code before pushing.**

### Setup

```bash
pip install vibe2prod
vibe2prod setup          # Interactive TUI — configures CLI + registers MCP server in Claude Code
```

### CLI

```bash
vibe2prod scan ./repo    # Full scan (~$0.21, 5 LLM calls)
vibe2prod report ./repo  # View last report
vibe2prod status ./repo  # Real-time progress
vibe2prod update         # Self-update + skill/hook sync
```

### The /forge Skill

After scanning, use `/forge` in Claude Code to **autonomously fix findings**. It reads the scan report, prioritizes issues by severity, and applies fixes with micro-commits.

### MCP Tools

When registered via `vibe2prod setup`, FORGE exposes to Claude Code:
- `forge_scan` — run a scan
- `forge_status` — check progress

### Quality Gates

Three profiles: `forge-way` (default), `strict`, `startup`. Composite score: A (80+), B (60-79), C (40-59), D (20-39), F (0-19).

### Suppression

Use `.forgeignore` (YAML v2) for false positives with pattern matching, expiry dates, and audit trail.

### Workflow

1. Build feature on branch
2. `vibe2prod scan .` or use `forge_scan` MCP tool
3. `/forge` to let Claude Code fix findings with micro-commits
4. Push clean code → PR → GitHub Actions runs tests

## Architecture Coaching: /architect Skill

Before building substantial features, use the `/architect` skill. It walks through 7 questions to define what needs to be built before code is written: new data, backend endpoints, frontend pages, auth, real-time needs, background work, and external services. It never answers for you — it coaches your thinking.

**When to suggest /architect (smart intercept):**
- The user describes a NEW feature involving schema changes, new endpoints, or external services
- The user says something like "I want to add..." or "I need..." followed by a feature that touches multiple parts of the system
- The user seems unsure where to start on a feature

**When NOT to suggest /architect:**
- Bug fixes (the architecture exists, something is just broken)
- UI-only changes (styling, layout, copy, component tweaks)
- Adding a field to an existing form with an existing endpoint
- Simple additions to existing patterns (another CRUD endpoint matching existing ones)
- The user has already defined the architecture in a GitHub Issue

When suggesting, say something like: "This looks like a substantial feature. Want to run /architect to think through what's needed before we build?" — not a blocker, just a suggestion.

## Development Lifecycle

1. **Define** (15-30 min): GitHub Issue — problem, solution, definition of done.
2. **Architect** (scale to complexity): Skip for small. `/architect` for medium/large. Outputs directly into the Issue.
3. **Build**: Read Issue → read CLAUDE.md → `doppler run` → feature branch → implement → tests → FORGE scan → `/forge` fixes → PR with `Closes #N`.
4. **Review**: GitHub Actions runs tests. Agent reviews post comments. Summary in Slack #dev-feed.
5. **Deploy**: Merge to staging → Coolify → test → merge to main → Coolify → production.
6. **Verify**: Sentry for errors, PostHog for behaviour. Slack #deploys for confirmation.

## Task Tracking

- All tasks = GitHub Issues. Labels: `bug`, `feature`, `security`, `feedback`.
- Priority: `priority:high`, `priority:low`.
- Auto-created via n8n from: Sentry errors, PostHog regression-tagged alerts, Sleekplan feedback.
- GitHub Projects for kanban view.

## Orchestration

```
Triggers (Sentry errors, PostHog insight alerts, Sleekplan, manual)
    ↓
n8n → GitHub Issue (auto-labeled) → Slack (#tasks for errors/feedback, #product for behaviour)
    ↓
Triage: label priority
    ↓
Build: Claude Code → feature branch → tests → FORGE scan → /forge fixes → PR
    ↓
Review: GitHub Actions (tests) + agent reviews → Slack #dev-feed
    ↓
Deploy: Coolify → Slack #deploys
    ↓
Monitor: Sentry (errors) + PostHog (behaviour, flags, LLM) + UptimeRobot → n8n → loop back
```

## Principles

- Simple first, complex later.
- Separate what fails independently. Frontend and backend deploy separately.
- Python for brains, Next.js for faces.
- Pydantic contracts everywhere.
- Budget-aware. Free tiers first. Tiered model routing.
- No direct schema changes. Every change is a migration file.
- One place to look. Everything routes to Slack through n8n.
- One database vendor per stack. Supabase is the default for Postgres + Auth + RLS. Neon's copy-on-write branching is real but solves branch-per-PR, which this workflow does not use (staging is the shared integration DB). Self-hosted Postgres on the Oracle VM trades integrated auth for operational burden and violates "separate what fails independently." Revisit only if a project's schema churn genuinely requires per-PR isolated databases.
- Scan before you push. FORGE runs locally, not just in CI.

---

## Marketing / Portfolio Site Profile

The default stack profile in this bible assumes "frontend talks to backend." Marketing sites, portfolios, and microsites are frontend-only. Use this profile for those.

### Stack

| Layer | Tool | Notes |
|-------|------|-------|
| Frontend | Next.js (App Router), TypeScript, Tailwind | Same as default |
| Hosting | Vercel only | No Coolify, no backend tier |
| Fonts | `next/font/local` | Self-host, no Google Fonts CDN |
| Assets | `public/` | Images, OG cards, favicons, CV PDFs |
| CSS tokens | Locked tokens file with pre-commit validator | See "Design System Locking" |
| Secrets | Doppler only if env vars are needed | Most marketing sites don't need any |

**Removed from default profile:** FastAPI, Supabase, Coolify, Redis, Nango, Clerk, n8n, Sentry. None of these belong in a static marketing site. PostHog is optional — add only if the site needs web analytics or session replay; most portfolios don't.

### When to use

- Personal portfolios
- Pre-launch and coming-soon sites
- Microsites for product launches
- Brand or campaign pages
- Any site that's frontend-only with no user accounts and no backend

### Asset patterns

- Fonts: self-hosted via `next/font/local`. Never CDN-loaded fonts on marketing sites — they break on slow networks and add render-blocking.
- Images: optimized via `next/image` where dynamic, raw `<img>` for static brand assets where the optimizer adds no value.
- Design tokens: single locked file (e.g. `lib/design-tokens.ts` or `tokens.css`), enforced by pre-commit validator. See "Design System Locking" section below.
- OG cards and favicons: live in `public/`, referenced from `app/layout.tsx` metadata.

### What this profile shares with the default

- Git workflow (main ← staging ← feature/*)
- Micro-commits and conventional commit messages
- GitHub Actions for CI
- FORGE / vibe2prod scanning before push
- `/architect` skill for substantial features

### What this profile drops

- Backend deployment via Coolify
- Database migrations via Supabase CLI
- Doppler unless env vars genuinely needed
- API design rules (no API)
- Background job patterns (no jobs)

---

## SEO and Entity Discipline

The default bible has no SEO discipline. Every content site needs this. These rules are non-optional for marketing sites, portfolios, and any site where discoverability matters.

### Per-page metadata

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
  // ...
}
```

### Entity schema (Person / Organization)

For sites where the subject is a person or organization, embed JSON-LD schema in the root layout. Use `alternateName` as an array for name variants. Use `knowsAbout` for topical relevance to LLM and search crawlers.

Example shape (adapt to actual person/org):

```ts
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Full Name",
  "alternateName": ["Short Name", "Nickname", "Other Variants"],
  "url": "https://your-site.com",
  "jobTitle": "Role",
  "worksFor": { "@type": "Organization", "name": "Company" },
  "knowsAbout": ["Topic 1", "Topic 2", "Topic 3"],
  "sameAs": [
    "https://github.com/username",
    "https://linkedin.com/in/username"
  ]
}
```

### Article schema for content pages

Every blog post, writeup, or long-form content page gets `Article` schema with `datePublished`, `dateModified`, `author`, and `headline`. The `datePublished` field is the highest-weighted signal for "recent work" queries.

### /llms.txt

Add `/llms.txt` to the public root. It's an emerging convention for LLM crawler discovery. Auto-generate it from your content data structure rather than hardcoding — when content changes, the file updates automatically.

Reference: https://llmstxt.org

### Dynamic sitemap and robots

- `app/sitemap.ts` — generates `/sitemap.xml` dynamically from your routes and content data. Static `sitemap.xml` files are an anti-pattern because they go stale.
- `app/robots.ts` — environment-aware. Production allows all, staging and preview environments disallow all (see staging isolation pattern).

Keying off `process.env.VERCEL_ENV`:

```ts
// app/robots.ts
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

### What not to do

- Static `sitemap.xml` or `robots.txt` files in `public/`
- Per-page metadata stuffed into a single shared component (lazy and produces duplicates)
- OG images that are screenshots or generic stock — design them properly
- Schema with claimed credentials, awards, or facts that aren't real
- `noindex` on production by accident (always check after deploy)

### Performance budget for SEO

For marketing and portfolio sites, Lighthouse targets are non-negotiable:

- Performance: 95+
- Accessibility: 95+
- Best Practices: 95+
- SEO: 100

These are the only categories that earn the asset its place in search results. SaaS apps can ship at lower performance targets because they trade off for actual product behavior. Marketing sites cannot.

---

## Mobile Responsiveness Rules

The default bible says nothing about responsive design. This is a gap that has cost real time. These rules apply to every project, not just marketing sites.

### Required breakpoints

Pick one breakpoint set per project. Don't mix.

**Standard set (use this unless a specific project demands otherwise):**

| Name | Max width | Target |
|------|-----------|--------|
| `phone` | 640px | Phones, narrow tablets in portrait |
| `tablet` | 900px | Tablets, small laptops |
| (default above) | 901px+ | Desktop |

In Tailwind: use the default `sm:` (640px) and `md:` (768px) breakpoints, or override the config with the values above.

In raw CSS: use `@media (max-width: 640px)` and `@media (max-width: 900px)`.

### Mobile-first or desktop-first

Pick one approach per project and declare it in `CLAUDE.md`. Do not mix within a single project.

- **Mobile-first** (recommended for new projects): base styles target mobile. `@media (min-width: 901px)` overrides for desktop. Tailwind's default approach.
- **Desktop-first** (sometimes necessary for ports): base styles target desktop. `@media (max-width: 900px)` overrides for mobile.

If a project has been built desktop-first and is now broken on mobile, fixing it is a mobile-responsiveness pass, not a rewrite. Add the mobile overrides; do not flip the whole project.

### Required QA before promote

A staging URL is not approved until:

1. **Real phone test.** Open it on an actual phone, not just Chrome DevTools mobile emulation. Devices behave differently.
2. **Lighthouse mobile run.** Score against the mobile preset, not desktop. They are different profiles.
3. **Three viewport widths checked manually:** 375px (iPhone SE), 414px (iPhone Pro Max), 768px (iPad portrait). One of each, eyeballed.
4. **Touch target check.** Every clickable element is at least 44×44 px.
5. **Horizontal scroll check.** No page should scroll horizontally on any tested viewport. If it does, something is overflowing.

### Common gotchas

These break first when desktop-first sites ship to mobile. Watch for them:

- **Nav stacking.** Top-right nav with multiple items collapses to a hamburger or stacks vertically. Hamburgers require an open/close state and a closing-on-route-change behavior.
- **Footer stacking.** Multi-column footers collapse to single column. Spacing between groups needs to grow.
- **Hero CTA wrapping.** Hero text wraps awkwardly on narrow screens. Type scale tightens. Long words break or get hyphenated.
- **Right-column whitespace.** Sites with deliberate desktop right-column whitespace (asymmetric layouts) lose that on mobile. Content takes full width.
- **Type scale.** Display sizes that look elegant at 96px on desktop become unreadable at 96px on mobile (text overflows, weird wrapping). Scale down deliberately, don't just shrink proportionally.
- **Image frames.** Hairline-framed images that work on desktop need reduced padding and possibly a different aspect ratio on mobile.
- **Tables.** Tables with multiple columns either get horizontal scroll containers or get reformatted as vertically-stacked label/value pairs.
- **Forms.** Input fields go full width. Labels stack above, not beside, inputs.

### Reference UI kit

For the portfolio and personal site profile specifically, the mobile implementation reference lives at `design-system/ui_kits/mobile/` — covers Config 01 mobile rules, breakpoint behavior for each section type (hero, work list, writing, about), and the navigation pattern (mobile menu, not hamburger by default).

When in doubt about how a Config 01 surface should adapt to mobile, look there first. If a pattern doesn't exist, add it before shipping the implementation.

For Config 02 (carousels) and Config 03 (products), mobile rules are embedded in their respective kits — not a separate mobile kit, because those configs have different responsive considerations than the portfolio.

---

## Design System Locking

When a project's brand or visual system is part of the product (portfolios, marketing sites, brand-driven SaaS), lock the design system structurally. Social contracts decay; pre-commit hooks don't. This section documents the pattern so any new project can implement it.

### When to use

- Personal portfolios and brand sites
- Marketing sites where visual consistency is part of the value
- Multi-tenant SaaS where the brand needs to stay consistent across team contributors
- Any project where a design system has been deliberately specified and drift would degrade the work

Skip for internal tools, prototypes, and projects where the visual system will keep evolving rapidly.

### The pattern

Three layers, in order of strength:

1. **Single source of truth for tokens.** Palette, typography, spacing, radii defined in one file. Imported everywhere. Never duplicated as inline values.
2. **Locked-header comment on the tokens file.** Social contract that the file is not modified without explicit approval.
3. **Pre-commit validator** that fails the build on off-system values. Structural enforcement, not voluntary discipline.

### Where the design system lives

When a project uses Christopher's existing design system, import the design-system repo as the source. The engineering bible references the design system; the design system references nothing back. One-way dependency.

```
project/
├── design-system/             ← imported as git submodule or copied in
│   ├── colors_and_type.css    ← LOCKED tokens file
│   ├── christopher-igweze-brand-spec.md
│   └── ui_kits/
├── ENGINEERING_BIBLE.md       ← references design-system rules
└── CLAUDE.md                  ← project-specific overrides
```

When starting a fresh project that doesn't reuse Christopher's system, build a local equivalent. The structure is the same; the contents are project-specific.

### Tokens file (locked)

The tokens file contains:

- Color palette (limited set, named tokens)
- Type system (font families, weights allowed, line-height tokens)
- Spacing scale
- Radii (with explicit max)
- Motion tokens if applicable

Header comment, non-negotiable:

```css
/* ============================================================
   DESIGN SYSTEM — LOCKED

   This file defines the visual system. Do not modify color
   values, typography, spacing tokens, or radii without explicit
   instruction from the project owner.

   Silent drift is how design systems die. The pre-commit
   validator catches most of it; the social contract catches
   the rest.
   ============================================================ */
```

### Pre-commit validator

The validator is a small script that runs as a git pre-commit hook. It scans the codebase for off-system values and fails the commit if any are found.

Mandatory checks:

- **Hex codes.** Any hex color outside the defined palette fails. Allow pure white (`#fff`, `#ffffff`) and pure black (`#000`, `#000000`) as exceptions for third-party content where needed.
- **Font families.** Any `font-family` declaration that isn't from the approved list fails. Allow generic fallbacks (`sans-serif`, `monospace`, `inherit`) and the named tokens (`var(--font-sans)`, `var(--font-mono)`).
- **Box shadow.** Any non-`none` value fails. Brand systems that ban shadows enforce this here.
- **Border radius.** Any value above the project's max (typically 4px) fails, with one exception for `9999px` if pills are part of the system.

Optional but recommended:

- **Token reference.** Force radius and spacing values to use `var(--r-*)` and `var(--s-*)` tokens. Literal pixel values fail even if they happen to match a token, because they break atomicity when tokens change.

### Implementation: stack-agnostic

The validator runs as a Node script (`.mjs` works across stacks) or a Python script — pick whichever fits the project's existing tooling. Install via `git config core.hooksPath hooks` so the hook is tracked in the repo, not buried in `.git/hooks/`.

### Setup instructions for new contributors

Add to the project README or a `SETUP.md` file:

```bash
# One-time setup after cloning
git config core.hooksPath hooks
```

Without this command, the hook is invisible and the validator never runs. Document it visibly so fresh clones don't silently bypass the check.

### What the validator does NOT do

- It doesn't enforce *which* token is used, only that *some* approved token is used. Choosing `--ink` over `--stone` when `--stone` is correct is still a human review concern.
- It doesn't enforce layout rules (no cards, no shadows in the visual sense, asymmetric layouts). Those are voice/style decisions documented in the design system spec, enforced by review.
- It doesn't enforce voice rules (lowercase as accent, em-dash bans). Those need their own validator if they matter, or they remain a review concern.

### Workflow

1. Designer specifies the system. Tokens file gets written and locked.
2. Validator script gets written. Runs against the existing codebase to catch any drift before the lock is finalized.
3. Findings get reviewed: some are intentional (third-party iframe colors), some are drift to fix.
4. Validator allowlist is finalized. Drift gets fixed in a single commit.
5. Hook is installed. Future commits enforce the lock.

### Maintenance

When a token genuinely needs to change (palette evolution, new spacing need, motion update):

1. Update the tokens file in a dedicated commit with a clear message.
2. Update the validator if needed (e.g., new color added to allowlist).
3. Run a full sweep against the codebase to verify nothing breaks.
4. Tag the commit so the change is traceable.

Token changes are deliberate events, not casual edits.
