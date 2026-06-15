// ============================================================
// CORS ORIGIN MATCHING — exact list + optional preview regex
// ============================================================
// Pure origin-allow logic for the game server's CORS (Express + Socket.IO).
//
// Static deployments (production on Render) set an exact CLIENT_URL allow-list.
// The staging server (Railway) ALSO faces Vercel PREVIEW deployments whose
// hostnames are dynamic (e.g. https://bluff-game-ospb35d14-honour-boys-projects
// .vercel.app), so an exact list can never enumerate them. PREVIEW_ORIGIN_REGEX
// lets that one box additionally allow any origin matching a project-scoped
// pattern — so a brand-new branch preview works with NO server redeploy.
//
// Kept pure (no env reads, no I/O) so it is fully unit-testable; index.js wires
// the env vars in.

// Split a comma-separated CLIENT_URL into trimmed exact origins. '*' / empty →
// null (handled by the caller as wildcard / unset).
function parseExactOrigins(clientUrl) {
  if (!clientUrl || clientUrl === '*') return null;
  return clientUrl.split(',').map((s) => s.trim()).filter(Boolean);
}

// Build the allow-predicate. `previewRegex` may be a RegExp or a string pattern
// (compiled here); an invalid pattern is ignored rather than crashing boot.
function makeOriginAllow({ clientUrl, previewRegex } = {}) {
  const wildcard = clientUrl === '*';
  const exact = parseExactOrigins(clientUrl);

  let rx = null;
  if (previewRegex instanceof RegExp) {
    rx = previewRegex;
  } else if (typeof previewRegex === 'string' && previewRegex.trim()) {
    try { rx = new RegExp(previewRegex.trim()); }
    catch (_) { rx = null; } // bad pattern → no preview matching, don't throw
  }

  return function originAllowed(origin) {
    // No Origin header at all (curl, server-to-server, same-origin navigations,
    // health checks) — always allow; CORS only guards cross-origin browsers.
    if (!origin) return true;
    if (wildcard) return true;
    if (exact && exact.includes(origin)) return true;
    if (rx && rx.test(origin)) return true;
    return false;
  };
}

module.exports = { parseExactOrigins, makeOriginAllow };
