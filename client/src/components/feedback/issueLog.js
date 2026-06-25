// ============================================================
// Issue Log — UAT tester feedback capture (independent / removable)
// ============================================================
// Self-contained bug/feedback reporting for the controlled user test. The
// browser writes straight to the `issue_reports` table via the player's own
// Supabase session — no socket, no server code, no service-role key. RLS scopes
// every row to its reporter. See docs/issue-log-feature.md.
//
// Lives only on the UAT branch. To remove: delete components/feedback/, the
// onReportIssue wiring in app/page.js + SettingsGear, and drop the table.

import { supabase } from '../../lib/supabase';

// Feature flag — ON by default (so the UAT deploy just works); set
// NEXT_PUBLIC_ISSUE_LOG=0 to hide it. On staging the code isn't present at all.
export const ISSUE_LOG_ENABLED = process.env.NEXT_PUBLIC_ISSUE_LOG !== '0';

// Best-effort build id so a report can be tied to the exact deploy.
const APP_VERSION =
  process.env.NEXT_PUBLIC_COMMIT_SHA
  || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
  || 'dev';

export const ISSUE_CATEGORIES = [
  { id: 'bug', label: 'Bug' },
  { id: 'confusing', label: 'Confusing' },
  { id: 'idea', label: 'Idea' },
  { id: 'other', label: 'Other' },
];

export const ISSUE_SEVERITIES = [
  { id: 'blocker', label: 'Blocker' },
  { id: 'normal', label: 'Normal' },
  { id: 'minor', label: 'Minor' },
];

// Assemble the reproduction context blob attached to every report. All fields
// are best-effort; missing ones are simply omitted.
export function buildIssueContext({ screen, roomCode, phase, mode } = {}) {
  const ctx = { appVersion: APP_VERSION };
  if (screen) ctx.screen = screen;
  if (roomCode) ctx.roomCode = roomCode;
  if (phase) ctx.phase = phase;
  if (mode) ctx.mode = mode;
  if (typeof window !== 'undefined') ctx.url = window.location?.pathname || '';
  return ctx;
}

// Simple client-side throttle so a double-tap can't spam the table.
let _lastSubmitAt = 0;
const THROTTLE_MS = 10_000;

// Insert one report. Returns { ok } or { ok:false, error }. Sign-in is required
// (RLS needs a real auth.uid()); the caller gates guests before reaching here.
export async function submitIssueReport({ user, category, severity, message, context }) {
  const text = (message || '').trim();
  if (!text) return { ok: false, error: 'Please describe the issue.' };
  if (text.length > 4000) return { ok: false, error: 'Message is too long (4000 char max).' };
  if (!user?.id) return { ok: false, error: 'Sign in to send a report.' };

  const now = Date.now();
  if (now - _lastSubmitAt < THROTTLE_MS) {
    return { ok: false, error: 'Hang on a moment before sending another report.' };
  }

  const row = {
    user_id: user.id,
    username: user.username || user.user_metadata?.username || null,
    category: ISSUE_CATEGORIES.some((c) => c.id === category) ? category : 'bug',
    severity: ISSUE_SEVERITIES.some((s) => s.id === severity) ? severity : 'normal',
    message: text,
    context: context || {},
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  };

  const { error } = await supabase.from('issue_reports').insert(row);
  if (error) {
    console.error('[issue-log] insert failed', error);
    return { ok: false, error: 'Could not send — please try again.' };
  }
  _lastSubmitAt = now;
  return { ok: true };
}
