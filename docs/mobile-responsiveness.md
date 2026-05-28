# Mobile Responsiveness Rules

> Applies to every project, not just marketing sites.

---

## Required breakpoints

Pick one breakpoint set per project. Don't mix.

**Standard set (use unless a project demands otherwise):**

| Name | Max width | Target |
|------|-----------|--------|
| `phone` | 640px | Phones, narrow tablets in portrait |
| `tablet` | 900px | Tablets, small laptops |
| (default above) | 901px+ | Desktop |

- In Tailwind: use the default `sm:` (640px) and `md:` (768px) breakpoints, or override the config with the values above.
- In raw CSS: use `@media (max-width: 640px)` and `@media (max-width: 900px)`.

---

## Mobile-first or desktop-first

Pick one approach per project and declare it in `CLAUDE.md`. Do not mix within a project.

- **Mobile-first** (recommended for new projects): base styles target mobile. `@media (min-width: 901px)` overrides for desktop. Tailwind's default approach.
- **Desktop-first** (sometimes necessary for ports): base styles target desktop. `@media (max-width: 900px)` overrides for mobile.

If a project has been built desktop-first and is now broken on mobile, fixing it is a mobile-responsiveness pass, not a rewrite. Add the mobile overrides; do not flip the whole project.

---

## Required QA before promote to production

A staging URL is not approved until:

1. **Real phone test.** Open it on an actual phone, not just Chrome DevTools mobile emulation. Devices behave differently.
2. **Lighthouse mobile run.** Score against the mobile preset, not desktop. They are different profiles.
3. **Three viewport widths checked manually:**
   - 375px (iPhone SE)
   - 414px (iPhone Pro Max)
   - 768px (iPad portrait)
4. **Touch target check.** Every clickable element is at least 44×44 px.
5. **Horizontal scroll check.** No page should scroll horizontally on any tested viewport. If it does, something is overflowing.

---

## Common gotchas

These break first when desktop-first sites ship to mobile. Watch for them:

- **Nav stacking.** Top-right nav with multiple items collapses to a hamburger or stacks vertically. Hamburgers require an open/close state and a closing-on-route-change behavior.
- **Footer stacking.** Multi-column footers collapse to single column. Spacing between groups needs to grow.
- **Hero CTA wrapping.** Hero text wraps awkwardly on narrow screens. Type scale tightens. Long words break or get hyphenated.
- **Right-column whitespace.** Sites with deliberate desktop right-column whitespace (asymmetric layouts) lose that on mobile. Content takes full width.
- **Type scale.** Display sizes elegant at 96px on desktop become unreadable at 96px on mobile (text overflows, weird wrapping). Scale down deliberately, don't shrink proportionally.
- **Image frames.** Hairline-framed images that work on desktop need reduced padding and possibly a different aspect ratio on mobile.
- **Tables.** Tables with multiple columns either get horizontal scroll containers or get reformatted as vertically-stacked label/value pairs.
- **Forms.** Input fields go full width. Labels stack above, not beside, inputs.

---

## Reference UI kit

For the portfolio and personal site profile, the mobile implementation reference lives at `design-system/ui_kits/mobile/` — covers mobile rules, breakpoint behavior per section type (hero, work list, writing, about), and the navigation pattern (mobile menu, not hamburger by default).

When in doubt about how a portfolio surface should adapt to mobile, look there first. If a pattern doesn't exist, add it before shipping.
