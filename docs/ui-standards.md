# UI Standards

> How interfaces should feel. These rules apply to every project with a UI.

---

## Loading States — Use Skeleton Loaders, Not Spinners

- Never use spinners for page-level or data-fetching loading states.
- Build skeleton components that mirror the actual layout — same widths, heights, and spacing as the real content.
- Skeleton elements use a grey animated shimmer (e.g. `animate-pulse` in Tailwind or a CSS keyframe).
- Show skeletons immediately on mount, replace with real content once data resolves.

**Exception:** spinners are acceptable inside small action buttons (e.g. a submit button mid-request) because the layout is already painted and only the button state changes.

### Implementation pattern

```tsx
// Bad
{isLoading ? <Spinner /> : <UserCard user={user} />}

// Good
{isLoading ? <UserCardSkeleton /> : <UserCard user={user} />}

// Skeleton component
function UserCardSkeleton() {
  return (
    <div className="rounded-lg border p-4">
      <div className="h-12 w-12 rounded-full bg-grey-200 animate-pulse" />
      <div className="mt-3 h-4 w-32 bg-grey-200 animate-pulse" />
      <div className="mt-2 h-3 w-48 bg-grey-200 animate-pulse" />
    </div>
  )
}
```

---

## Optimistic UI

For actions with >99% success rate (likes, toggles, reorders, soft deletes), update the UI immediately without waiting for the server response.

### Rules

1. Store previous state before the mutation.
2. Apply the change to local state immediately.
3. Fire the request in the background.
4. On error: revert to the stored state and surface a toast or inline error.
5. On success: confirm with server response (in case server normalized the data).

### Pattern

```tsx
async function toggleLike(postId: string) {
  const prev = posts
  setPosts(posts.map(p => p.id === postId ? { ...p, liked: !p.liked } : p))
  try {
    await api.toggleLike(postId)
  } catch (err) {
    setPosts(prev)
    toast.error('Could not update. Try again.')
  }
}
```

### Never apply optimistic updates to:

- Destructive actions that can't be reversed (account deletion, hard deletes)
- Financial actions (payments, transfers, refunds)
- Actions with significant side effects (sending email, posting to external services)
- Anything where partial failure is hard to communicate (multi-step flows)

For those: always await server confirmation, show a spinner inside the action button, and only then update the UI.

---

## Tooltips on Icon-Only Buttons

Every button that contains only an icon (no visible label) must have a tooltip.

### Rules

- Use the native `title` attribute as a minimum.
- For styled tooltips, use a consistent `<Tooltip>` component across the project (radix-ui, shadcn/ui Tooltip, or equivalent).
- Tooltip text is short and action-oriented: "Delete item", "Copy link", "Open settings".
- Do not add tooltips to buttons that already have a visible text label — it's redundant noise.
- Tooltips appear on hover for desktop and on long-press for mobile (most libraries handle this automatically).

### Pattern

```tsx
// Bad
<button onClick={onDelete}>
  <TrashIcon />
</button>

// Good
<Tooltip content="Delete item">
  <button onClick={onDelete} aria-label="Delete item">
    <TrashIcon />
  </button>
</Tooltip>
```

**Note:** `aria-label` on the button is required even if there's a tooltip — tooltips are not accessible to screen readers in most implementations.

---

## Empty States

When a list, grid, or section has no data:

- Never show a blank area.
- Show a brief message explaining what would appear there.
- If applicable, include a CTA to create the first item.
- Use the same visual weight as a skeleton — don't make empty states feel like errors.

```tsx
// Pattern
<div className="text-center py-12">
  <Icon className="mx-auto h-12 w-12 text-grey-400" />
  <h3 className="mt-2 text-sm font-medium">No projects yet</h3>
  <p className="mt-1 text-sm text-grey-500">Get started by creating a new project.</p>
  <Button className="mt-4" onClick={onCreate}>New project</Button>
</div>
```

---

## Error States

When a request fails:

- Show inline error near the action that triggered it, not a global modal.
- The message tells the user what to do next, not just what went wrong.
- "Couldn't save. Check your connection and try again." — good.
- "500 Internal Server Error" — never.
- See `docs/backend-security.md` for what the backend should send. The frontend never displays raw error fields from the API.
