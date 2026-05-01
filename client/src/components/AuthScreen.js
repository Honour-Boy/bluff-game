"use client";

import { useState } from "react";
import { ShapeIcon } from "./ShapeIcon";

// ─── Shared input style helper ────────────────────────────────
const INPUT_STYLE = {
  width: "100%",
  padding: "11px 14px",
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text)",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

// ─── Google button ────────────────────────────────────────────
function GoogleButton({ onClick, label = "Continue with Google" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "11px 16px",
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        color: "var(--text)",
        fontSize: 13,
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = "var(--accent)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = "var(--border)")
      }
    >
      {/* Google G icon */}
      <svg width="18" height="18" viewBox="0 0 48 48">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
      {label}
    </button>
  );
}

// ─── Divider ──────────────────────────────────────────────────
function Divider() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: "4px 0",
      }}
    >
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      <span
        style={{
          fontSize: 10,
          color: "var(--text-dim)",
          letterSpacing: "0.1em",
        }}
      >
        OR
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

// ─── AuthScreen ───────────────────────────────────────────────
export function AuthScreen({
  onSignIn,
  onSignUp,
  onGoogleSignIn,
  error,
  setError,
}) {
  const [tab, setTab] = useState("sign-in"); // 'sign-in' | 'sign-up'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [signUpSent, setSignUpSent] = useState(false);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return setError("Enter email and password");
    await onSignIn({ email: email.trim(), password });
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError(null);
    if (username.trim().length < 4)
      return setError("Username must be at least 4 characters");
    if (username.trim().length > 20)
      return setError("Username must be 20 characters or fewer");
    if (!email.trim()) return setError("Enter your email");
    if (password.length < 6)
      return setError("Password must be at least 6 characters");
    const ok = await onSignUp({
      email: email.trim(),
      password,
      username: username.trim(),
    });
    if (ok) setSignUpSent(true);
  };

  const TAB = (key, label) => (
    <button
      type="button"
      onClick={() => {
        setTab(key);
        setError(null);
        setSignUpSent(false);
      }}
      style={{
        flex: 1,
        padding: "10px 0",
        background: tab === key ? "rgba(232,255,74,0.06)" : "transparent",
        border: "none",
        borderBottom: `2px solid ${tab === key ? "var(--accent)" : "transparent"}`,
        color: tab === key ? "var(--accent)" : "var(--text-dim)",
        fontSize: 11,
        letterSpacing: "0.12em",
        cursor: "pointer",
        transition: "color 0.15s",
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      {/* Background grid */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: `
          linear-gradient(rgba(232,255,74,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(232,255,74,0.03) 1px, transparent 1px)
        `,
          backgroundSize: "40px 40px",
          pointerEvents: "none",
        }}
      />

      <div
        className="fade-in"
        style={{
          width: "100%",
          maxWidth: 420,
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <h1
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 80,
              color: "var(--accent)",
              lineHeight: 0.9,
              letterSpacing: "0.06em",
              margin: 0,
            }}
          >
            BLUFF
          </h1>
          <div
            style={{
              color: "var(--text-dim)",
              fontSize: 11,
              letterSpacing: "0.2em",
              marginTop: 6,
            }}
          >
            Sign in to play
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 12,
              marginTop: 16,
              opacity: 0.4,
            }}
          >
            {["circle", "square", "triangle", "cross", "star"].map((shape) => (
              <ShapeIcon key={shape} shape={shape} size={18} />
            ))}
          </div>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: "0" }}>
          {/* Tabs */}
          <div
            style={{ display: "flex", borderBottom: "1px solid var(--border)" }}
          >
            {TAB("sign-in", "SIGN IN")}
            {TAB("sign-up", "CREATE ACCOUNT")}
          </div>

          <div style={{ padding: "24px 20px" }}>
            {/* Error */}
            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  background: "rgba(255,74,110,0.08)",
                  border: "1px solid var(--accent2)",
                  borderRadius: "var(--radius)",
                  color: "var(--accent2)",
                  fontSize: 12,
                  marginBottom: 16,
                }}
              >
                {error}
              </div>
            )}

            {/* Sign-up success */}
            {signUpSent && (
              <div
                style={{
                  padding: "12px 14px",
                  background: "rgba(74,255,128,0.06)",
                  border: "1px solid var(--alive)",
                  borderRadius: "var(--radius)",
                  color: "var(--alive)",
                  fontSize: 12,
                  marginBottom: 16,
                  lineHeight: 1.6,
                }}
              >
                ✅ Account created! You can now sign in.
              </div>
            )}

            {/* Google */}
            <GoogleButton onClick={onGoogleSignIn} />
            <Divider />

            {/* Sign in form */}
            {tab === "sign-in" && (
              <form
                onSubmit={handleSignIn}
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 10,
                      color: "var(--text-dim)",
                      letterSpacing: "0.1em",
                      display: "block",
                      marginBottom: 5,
                    }}
                  >
                    EMAIL
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 10,
                      color: "var(--text-dim)",
                      letterSpacing: "0.1em",
                      display: "block",
                      marginBottom: 5,
                    }}
                  >
                    PASSWORD
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    style={INPUT_STYLE}
                  />
                </div>
                <button
                  type="submit"
                  className="primary"
                  style={{ padding: "12px", marginTop: 4 }}
                >
                  Sign In →
                </button>
              </form>
            )}

            {/* Sign up form */}
            {tab === "sign-up" && !signUpSent && (
              <form
                onSubmit={handleSignUp}
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 10,
                      color: "var(--text-dim)",
                      letterSpacing: "0.1em",
                      display: "block",
                      marginBottom: 5,
                    }}
                  >
                    DISPLAY NAME
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="4–20 characters"
                    maxLength={20}
                    autoFocus
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 10,
                      color: "var(--text-dim)",
                      letterSpacing: "0.1em",
                      display: "block",
                      marginBottom: 5,
                    }}
                  >
                    EMAIL
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 10,
                      color: "var(--text-dim)",
                      letterSpacing: "0.1em",
                      display: "block",
                      marginBottom: 5,
                    }}
                  >
                    PASSWORD
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    minLength={6}
                    required
                    style={INPUT_STYLE}
                  />
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-dim)",
                      marginTop: 6,
                      lineHeight: 1.5,
                    }}
                  >
                    ⚠️ Don't use a password you use elsewhere — email addresses
                    are not verified on this app.
                  </div>
                </div>
                <button
                  type="submit"
                  className="primary"
                  style={{ padding: "12px", marginTop: 4 }}
                >
                  Create Account →
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
