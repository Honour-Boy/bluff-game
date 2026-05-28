# Observability

> Two tools, two concerns. Don't cross the streams.

---

## The split

| Concern | Tool | Why |
|---------|------|-----|
| Errors and stack traces | **Sentry** | Built for crash reporting, distributed tracing, source-mapped errors |
| Behaviour, events, flags, replays | **PostHog** | Built for product analytics, session replay, experiments, LLM analytics |

**Rule:** If a thing has a stack trace, it's Sentry. If it's a user event, flag, replay, or LLM call, it's PostHog.

---

## Frontend SDKs

One SDK per concern. Don't import PostHog's error tracker if Sentry is in the project.

- `@sentry/nextjs` — errors only
- `posthog-js` (via `instrumentation-client.ts`) — events, replays, flags, LLM

---

## Feature flags

**Feature flags live in PostHog.** Use them for:

- Production gradual rollout
- Kill switches
- A/B experiments

**Do not use feature flags for** "is this safe to ship" — that's what the `staging` branch is for. Doppler stays for secrets and config, not flagging.

---

## LLM analytics

LLM calls through OpenRouter are captured in PostHog LLM analytics. Cost, latency, and prompt drift are visible per user, per feature.

**Wire on the OpenRouter-calling layer**, not at the route handler. This catches every LLM call regardless of which route triggered it.

```ts
// llm/client.ts — the only place LLM calls happen
import { PostHog } from 'posthog-node'

const posthog = new PostHog(process.env.POSTHOG_KEY!)

export async function callLLM(model: string, prompt: string, userId: string) {
  const start = Date.now()
  const response = await openrouter.chat.completions.create({ model, messages: [...] })
  posthog.capture({
    distinctId: userId,
    event: 'llm_call',
    properties: {
      model,
      latency_ms: Date.now() - start,
      input_tokens: response.usage?.prompt_tokens,
      output_tokens: response.usage?.completion_tokens,
      cost_usd: calculateCost(model, response.usage),
    },
  })
  return response
}
```

---

## Provisioning

**Provision via Vercel Marketplace where possible.** PostHog and Sentry both have Marketplace integrations that auto-write env vars. Don't hand-roll.

---

## Alert routing

All alerts route through n8n. The "one place to look" principle holds.

| Source | Destination | Action |
|--------|-------------|--------|
| Sentry error | Slack `#tasks` | Auto-create GitHub Issue (existing pipeline) |
| PostHog insight alert | Slack `#product` | No auto-Issue unless tagged `regression` |
| PostHog `regression` tagged | Slack `#tasks` | Auto-create GitHub Issue |
| UptimeRobot down | Slack `#tasks` | Auto-create GitHub Issue with `priority:high` |
| Sleekplan feedback | Slack `#feedback` | Auto-create GitHub Issue with `feedback` label |

---

## What to instrument on the frontend

**Default events to track:**

- Page views (automatic with PostHog)
- Sign-up, sign-in, sign-out
- Core conversion events (subscribe, purchase, create-first-X)
- Feature flag exposures (automatic when reading flags)
- Errors not caught by Sentry (network failures, validation errors at scale)

**Don't track:**

- Every button click — noise
- PII in event properties
- Anything the user hasn't been told about (respect privacy policy)

---

## Session replay

PostHog session replay is enabled selectively:

- Always on for free-tier users (small sample, high value for debugging)
- Sampled (e.g. 10%) for paid users
- Off entirely for admin/staff sessions (privacy)
- Off for any page handling payment or PII forms (mask the field by default)
