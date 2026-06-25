'use client';

// ============================================================
// /feedback — UAT admin dashboard for tester issue reports
// ============================================================
// A UI over the issue_reports table for the controlled test reviewer. Reads via
// the normal anon key + the admin's own Supabase session; the ir_select_admin
// RLS policy (keyed to the admin uid) is what authorizes seeing every report —
// no service-role key is ever shipped to the browser. A non-admin who opens
// this URL gets RLS-filtered to their own rows and a "not authorized" gate, so
// nothing leaks. Lives only on the UAT branch.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

// UX gate only — the real enforcement is the RLS policy. Not secret (a uuid).
const ADMIN_ID = 'a7a8bc22-5855-4214-9965-4136d0c3172d';

const CATEGORY_LABEL = { bug: 'Bug', confusing: 'Confusing', idea: 'Idea', other: 'Other' };
const SEVERITY_COLOR = {
  blocker: 'var(--accent2)',
  normal: 'var(--accent)',
  minor: 'var(--text-dim)',
};

function fmtTime(ts) {
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function Badge({ children, color = 'var(--text-dim)' }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999,
      border: `1px solid ${color}`, color,
      fontFamily: "'Space Mono', monospace", fontSize: 9,
      letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function ReportRow({ r, onToggleResolved }) {
  const [open, setOpen] = useState(false);
  const ctx = r.context || {};
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 8,
      background: r.resolved ? 'rgba(63,143,122,0.05)' : 'var(--surface)',
      padding: '12px 14px', marginBottom: 10, opacity: r.resolved ? 0.72 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <Badge color="var(--text-mid)">{CATEGORY_LABEL[r.category] || r.category}</Badge>
        <Badge color={SEVERITY_COLOR[r.severity] || 'var(--text-dim)'}>{r.severity}</Badge>
        {r.resolved && <Badge color="var(--alive)">Resolved</Badge>}
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: 'var(--text-dim)' }}>
          {fmtTime(r.created_at)}
        </span>
      </div>

      <div style={{
        fontFamily: "'Crimson Text', serif", fontSize: 15, color: 'var(--text)',
        whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: 8,
      }}>
        {r.message}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: 'var(--text-dim)' }}>
          {r.username || '—'}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={linkBtn}
        >
          {open ? 'Hide context' : 'Context'}
        </button>
        <button
          type="button"
          onClick={() => onToggleResolved(r)}
          style={linkBtn}
        >
          {r.resolved ? 'Mark unresolved' : 'Mark resolved'}
        </button>
      </div>

      {open && (
        <div style={{
          marginTop: 10, padding: '10px 12px', borderRadius: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          fontFamily: "'Space Mono', monospace", fontSize: 11, color: 'var(--text-mid)',
          lineHeight: 1.7, wordBreak: 'break-word',
        }}>
          <div>screen: {ctx.screen || '—'}{ctx.roomCode ? ` · room ${ctx.roomCode}` : ''}</div>
          <div>phase: {ctx.phase || '—'} · mode: {ctx.mode || '—'}</div>
          <div>build: {ctx.appVersion || '—'} · url: {ctx.url || '—'}</div>
          <div style={{ color: 'var(--text-dim)', marginTop: 4 }}>{r.user_agent || ''}</div>
        </div>
      )}
    </div>
  );
}

const linkBtn = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color: 'var(--accent)', fontFamily: "'Space Mono', monospace", fontSize: 10,
  letterSpacing: '0.06em', textDecoration: 'underline',
};

export default function FeedbackDashboard() {
  const [status, setStatus] = useState('loading'); // loading | unauth | ready | error
  const [reports, setReports] = useState([]);
  const [catFilter, setCatFilter] = useState('all');
  const [showResolved, setShowResolved] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) { setStatus('unauth'); return; }
    if (uid !== ADMIN_ID) { setStatus('unauth'); return; }

    const { data, error } = await supabase
      .from('issue_reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error('[feedback]', error); setStatus('error'); return; }
    setReports(data || []);
    setStatus('ready');
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleResolved = useCallback(async (r) => {
    const next = !r.resolved;
    setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, resolved: next } : x)));
    const { error } = await supabase
      .from('issue_reports')
      .update({ resolved: next })
      .eq('id', r.id);
    if (error) {
      console.error('[feedback] update failed', error);
      // Revert on failure.
      setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, resolved: r.resolved } : x)));
    }
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (!showResolved && r.resolved) return false;
      if (catFilter !== 'all' && r.category !== catFilter) return false;
      if (q && !(`${r.message} ${r.username || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [reports, catFilter, showResolved, search]);

  const openCount = reports.filter((r) => !r.resolved).length;

  return (
    <div style={{ minHeight: '100vh', padding: '28px 18px', maxWidth: 760, margin: '0 auto' }}>
      <div style={{
        fontFamily: "'Cinzel', serif", fontSize: 22, fontWeight: 700,
        letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 4,
      }}>
        Tester Reports
      </div>
      <div style={{
        fontFamily: "'Space Mono', monospace", fontSize: 11, color: 'var(--text-dim)',
        letterSpacing: '0.06em', marginBottom: 20,
      }}>
        UAT issue log · admin view
      </div>

      {status === 'loading' && (
        <div style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Loading…</div>
      )}

      {status === 'unauth' && (
        <div style={{
          fontFamily: "'Crimson Text', serif", fontSize: 15, fontStyle: 'italic',
          color: 'var(--text-mid)', lineHeight: 1.6,
          padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 8,
          background: 'var(--surface)',
        }}>
          Not authorized. Sign in to the app with the admin account, then reload this page.
        </div>
      )}

      {status === 'error' && (
        <div style={{ color: '#c85050', fontStyle: 'italic' }}>
          Could not load reports — check the console.
        </div>
      )}

      {status === 'ready' && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)',
          }}>
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All types</option>
              <option value="bug">Bug</option>
              <option value="confusing">Confusing</option>
              <option value="idea">Idea</option>
              <option value="other">Other</option>
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              style={{ ...selectStyle, flex: 1, minWidth: 120 }}
            />
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: "'Space Mono', monospace", fontSize: 10,
              color: 'var(--text-dim)', cursor: 'pointer',
            }}>
              <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
              Show resolved
            </label>
            <button type="button" onClick={load} style={{ ...selectStyle, cursor: 'pointer' }}>↻</button>
          </div>

          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 10, color: 'var(--text-dim)',
            marginBottom: 12,
          }}>
            {openCount} open · {reports.length} total · {filtered.length} shown
          </div>

          {filtered.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>No reports match.</div>
          ) : (
            filtered.map((r) => (
              <ReportRow key={r.id} r={r} onToggleResolved={toggleResolved} />
            ))
          )}
        </>
      )}
    </div>
  );
}

const selectStyle = {
  background: 'var(--surface)', color: 'var(--text)',
  border: '1px solid var(--border-lit)', borderRadius: 'var(--radius)',
  padding: '7px 10px', fontFamily: "'Space Mono', monospace", fontSize: 11,
  outline: 'none',
};
