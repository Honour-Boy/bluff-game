# Caching Strategy

> Two distinct layers. Don't conflate them.

---

## Client-Side Caching (React Query / SWR)

Prevents re-fetching data the user already has in the current session.

### Rules

1. Use **React Query (TanStack Query)** as the default. SWR is acceptable but pick one per project.
2. Default `staleTime`: **5 minutes** for non-realtime data.
3. Realtime data (Socket.IO-driven, live subscriptions) is **not cached** — it's live.
4. Invalidate on mutations: after a POST/PUT/DELETE, invalidate the relevant query key immediately or update the cache directly.
5. Use stable query keys: `['users', userId]`, not `['users-' + userId]`.

### Pattern

```tsx
// Query
const { data, isLoading } = useQuery({
  queryKey: ['posts', filter],
  queryFn: () => api.getPosts(filter),
  staleTime: 5 * 60 * 1000,
})

// Mutation with invalidation
const queryClient = useQueryClient()
const mutation = useMutation({
  mutationFn: api.createPost,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['posts'] })
  },
})
```

### What NOT to cache on the client

- **Auth tokens.** Never in `localStorage`. Use `httpOnly` cookies for session tokens.
- **PII or payment info.** Don't keep it in memory longer than necessary.
- **Permission-sensitive data.** When permissions change server-side, the client cache won't know — bypass cache for permission-critical reads.

### Logout / session expiry

On logout:
1. Call `queryClient.clear()` to wipe all client cache.
2. Invalidate the session server-side.
3. Redirect to login.

---

## Server-Side Caching (Redis)

Distinct from client cache. Handles concerns the client can't.

### What Redis is for

- **Session storage** for backend session state (when not using stateless JWTs).
- **Rate limiting** counters per user/IP/endpoint.
- **Job queues** for background work (BullMQ on Node, or equivalent).
- **Caching expensive computations** that are shared across users (e.g. a leaderboard computed every 60s, not per-request).
- **Pub/sub** for multi-instance Socket.IO scaling.

### What Redis is NOT for

- **Permanent storage.** Redis is volatile by default. Use Supabase for anything that must survive a restart.
- **Per-user data caching.** That's what React Query handles on the client. Don't duplicate.
- **Transactional data.** Use the database.

### Patterns

**Rate limiting:**
```ts
const key = `ratelimit:${userId}:${endpoint}`
const count = await redis.incr(key)
if (count === 1) await redis.expire(key, 60)
if (count > 100) throw new RateLimitError()
```

**Shared computation cache:**
```ts
const cached = await redis.get('leaderboard:global')
if (cached) return JSON.parse(cached)
const fresh = await computeLeaderboard()
await redis.setex('leaderboard:global', 60, JSON.stringify(fresh))
return fresh
```

---

## When you don't need Redis

If the project doesn't have:
- Rate limiting needs beyond what the platform provides
- Background job queues
- Multi-instance backend (single Coolify container is fine)
- Expensive shared computations

...skip Redis. Don't add infrastructure speculatively.
