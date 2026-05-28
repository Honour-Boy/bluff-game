# Design System Locking

> When a project's brand or visual system is part of the product, lock the design system structurally.
> Social contracts decay; pre-commit hooks don't.

---

## When to use

- Personal portfolios and brand sites
- Marketing sites where visual consistency is part of the value
- Multi-tenant SaaS where the brand stays consistent across contributors
- Any project where a design system has been deliberately specified and drift would degrade the work

Skip for internal tools, prototypes, and projects where the visual system is still evolving rapidly.

---

## The pattern

Three layers, in order of strength:

1. **Single source of truth for tokens.** Palette, typography, spacing, radii defined in one file. Imported everywhere. Never duplicated as inline values.
2. **Locked-header comment on the tokens file.** Social contract that the file is not modified without explicit approval.
3. **Pre-commit validator** that fails the build on off-system values. Structural enforcement, not voluntary discipline.

---

## Where the design system lives

When a project uses an existing design system, import the design-system repo as the source (git submodule or copy-in). The engineering bible references the design system; the design system references nothing back. One-way dependency.

```
project/
├── design-system/             ← imported as git submodule or copied in
│   ├── colors_and_type.css    ← LOCKED tokens file
│   ├── brand-spec.md
│   └── ui_kits/
├── ENGINEERING_BIBLE.md       ← references design-system rules
└── CLAUDE.md                  ← project-specific overrides
```

When starting a fresh project that doesn't reuse an existing system, build a local equivalent. Same structure, project-specific contents.

---

## Tokens file (locked)

Contains:

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

---

## Pre-commit validator

Runs as a git pre-commit hook. Scans the codebase for off-system values and fails the commit if any are found.

### Mandatory checks

- **Hex codes.** Any hex color outside the defined palette fails. Allow pure white (`#fff`, `#ffffff`) and pure black (`#000`, `#000000`) as exceptions for third-party content.
- **Font families.** Any `font-family` declaration not from the approved list fails. Allow generic fallbacks (`sans-serif`, `monospace`, `inherit`) and named tokens (`var(--font-sans)`).
- **Box shadow.** Any non-`none` value fails. Brand systems that ban shadows enforce here.
- **Border radius.** Any value above the project's max (typically 4px) fails, with one exception for `9999px` if pills are part of the system.

### Optional but recommended

- **Token reference.** Force radius and spacing values to use `var(--r-*)` and `var(--s-*)` tokens. Literal pixel values fail even if they happen to match a token, because they break atomicity when tokens change.

### Implementation

Stack-agnostic. Use a Node script (`.mjs` works across stacks) or Python — whichever fits the project. Install via `git config core.hooksPath hooks` so the hook is tracked in the repo, not buried in `.git/hooks/`.

A starter validator lives in `hooks/pre-commit-design-tokens.mjs` in this kit.

---

## Setup for new contributors

Add to README or `SETUP.md`:

```bash
# One-time setup after cloning
git config core.hooksPath hooks
```

Without this command, the hook is invisible and the validator never runs. Document visibly so fresh clones don't silently bypass the check.

---

## What the validator does NOT do

- It doesn't enforce *which* token is used, only that *some* approved token is used. Choosing `--ink` over `--stone` when `--stone` is correct is still a human review concern.
- It doesn't enforce layout rules (no cards, no shadows in the visual sense, asymmetric layouts). Those are voice/style decisions documented in the design system spec, enforced by review.
- It doesn't enforce voice rules (lowercase as accent, em-dash bans). Those need their own validator if they matter.

---

## Workflow

1. Designer specifies the system. Tokens file gets written and locked.
2. Validator script gets written. Runs against existing codebase to catch any drift before lock is finalized.
3. Findings reviewed: some intentional (third-party iframe colors), some drift to fix.
4. Validator allowlist finalized. Drift fixed in a single commit.
5. Hook installed. Future commits enforce the lock.

---

## Maintenance

When a token genuinely needs to change:

1. Update the tokens file in a dedicated commit with a clear message.
2. Update the validator if needed (e.g., new color added to allowlist).
3. Run a full sweep against the codebase to verify nothing breaks.
4. Tag the commit so the change is traceable.

Token changes are deliberate events, not casual edits.
