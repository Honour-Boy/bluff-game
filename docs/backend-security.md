# Backend Security Rules

> Non-negotiable. Every endpoint must satisfy all three rules below.

---

## 1. Authentication on Every Route

No open endpoints that touch the database. Every route must verify the caller's identity.

### Implementation

- Apply auth middleware at the **router level**, not per handler. Mounting middleware on individual handlers leads to forgotten routes.
- Read identity from the verified token, never from the request body or params.
- Return `401 Unauthorized` for missing/invalid tokens.
- Return `403 Forbidden` for valid tokens with insufficient permissions.
- Public endpoints (e.g. `/health`, `/login`) live on a separate router with no auth middleware.

### Pattern (Express + Supabase JWT)

```ts
// middleware/requireAuth.ts
export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return res.status(401).json({ error: 'Unauthorized' })

  req.user = data.user
  next()
}

// router setup
const protectedRouter = Router()
protectedRouter.use(requireAuth)
protectedRouter.get('/posts', getPostsHandler)
protectedRouter.post('/posts', createPostHandler)

app.use('/api', protectedRouter)
app.use('/public', publicRouter) // no auth
```

### Authorization (beyond authentication)

- Authentication = "who are you" — handled by middleware.
- Authorization = "can you do this" — handled per handler or via per-resource checks.
- For Supabase, **prefer RLS policies** to enforce row-level access. The backend then just passes the user's JWT to Supabase and lets RLS do its job.

---

## 2. Pagination Required

Returning an unbounded list from the database is not allowed. Period.

### Rules

- Every endpoint that returns a collection accepts `page` and `limit` (or `cursor`) query params.
- Default `limit`: **20**. Maximum `limit`: **100**.
- Requests exceeding the max are rejected with `400 Bad Request`.
- Validate with Zod at the route level.

### Response shape

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 340,
    "hasMore": true
  }
}
```

### Pattern

```ts
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

router.get('/posts', async (req, res) => {
  const { page, limit } = querySchema.parse(req.query)
  const offset = (page - 1) * limit

  const { data, count } = await supabase
    .from('posts')
    .select('*', { count: 'exact' })
    .range(offset, offset + limit - 1)

  res.json({
    data,
    pagination: {
      page,
      limit,
      total: count,
      hasMore: offset + data.length < count,
    },
  })
})
```

### Cursor pagination (preferred for large datasets)

For infinite scroll, very large tables, or feed-like endpoints, prefer cursor-based pagination:

```json
GET /posts?cursor=eyJpZCI6MTIzfQ&limit=20

{
  "data": [...],
  "pagination": {
    "nextCursor": "eyJpZCI6MTQzfQ",
    "hasMore": true
  }
}
```

Cursors are opaque to the client. Encode as base64 of the last item's sort key.

---

## 3. Safe Error Responses

Never return raw error objects, stack traces, database errors, or ORM output to the client.

### Rules

- Production response shape for unknown errors: `{ "error": "Something went wrong" }`. Generic. No internals.
- Log the full error server-side (Sentry, console, or logging service). Only the safe message goes to the client.
- Known, expected errors (validation, not found, etc.) get specific user-facing messages.
- Never expose: table names, column names, query strings, file paths, library versions, stack traces.
- Different status codes for different error types (`400`, `401`, `403`, `404`, `409`, `422`, `500`).

### Pattern: centralized error handler

```ts
// errors.ts
export class AppError extends Error {
  constructor(public statusCode: number, public clientMessage: string) {
    super(clientMessage)
  }
}

// middleware/errorHandler.ts (must be last middleware)
export function errorHandler(err, req, res, next) {
  // Log full error server-side
  Sentry.captureException(err)
  console.error(err)

  // Known error → specific message
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.clientMessage })
  }

  // Zod validation error → 400 with safe message
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: 'Invalid request', issues: err.flatten().fieldErrors })
  }

  // Unknown → generic 500
  res.status(500).json({ error: 'Something went wrong' })
}
```

### Validation errors are OK to expose (selectively)

Field-level validation errors (`{ email: ["Invalid format"] }`) are safe to return — they help the user fix their input. But:

- Don't leak DB constraint names (`users_email_unique`). Translate to `"Email already in use"`.
- Don't leak schema field names that aren't in the public API.

---

## Bonus: Other security defaults

These aren't the "three rules" but apply to every backend:

- **CORS:** allowlist only the Vercel origin (production + preview). No `*` in production.
- **Helmet:** use `helmet()` middleware in Express for sensible default security headers.
- **Rate limiting:** every public endpoint (login, signup, password reset) is rate-limited via Redis.
- **Input size limits:** `express.json({ limit: '100kb' })`. Larger uploads go through a dedicated upload handler.
- **No console.log of user input.** Logs end up in many places. Treat them like client-side exposures.
