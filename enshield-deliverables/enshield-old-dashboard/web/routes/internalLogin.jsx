import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { createSingleAuthExchange } from "../lib/internalAuthClient";
import "./dashboard.css";

const exchangeInternalAuthToken = createSingleAuthExchange();
let callbackToken;

function readAndClearCallbackToken() {
  if (callbackToken !== undefined) return callbackToken;
  callbackToken = new URLSearchParams(window.location.hash.slice(1)).get("token");
  window.history.replaceState(null, "", "/internal-auth/callback");
  return callbackToken;
}

export function InternalLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const begin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Sign-in failed.");
      navigate(body.mustChangePassword ? "/change-password" : "/dashboard", { replace: true });
    } catch (loginError) {
      setError(loginError.message || "Sign-in failed. Contact an Enshield administrator.");
      setLoading(false);
    }
  };

  return <main className="esd-auth-page">
    <section className="esd-card esd-auth-card" aria-labelledby="internal-login-title">
      <h1 id="internal-login-title">Enshield internal dashboard</h1>
      <p>Sign in with your Enshield account to access assigned clients.</p>
      {error ? <p className="esd-error" role="status" aria-live="polite">{error}</p> : null}
      <form onSubmit={begin}>
        <label htmlFor="internal-email">Email</label>
        <input id="internal-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <label htmlFor="internal-password">Password</label>
        <input id="internal-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        <button className="esd-btn" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </section>
  </main>;
}

export function InternalAuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [token] = useState(readAndClearCallbackToken);
  useEffect(() => {
    if (!token) {
      setError("The authentication response is incomplete.");
      return undefined;
    }
    let mounted = true;
    exchangeInternalAuthToken(token)
      .then(() => {
        if (mounted) navigate("/dashboard", { replace: true });
      })
      .catch(() => {
        if (mounted) setError("Sign-in could not be completed. Start again.");
      });
    callbackToken = null;
    return () => {
      mounted = false;
    };
  }, [navigate, token]);
  return <main className="esd-auth-page">
    <section className="esd-card esd-auth-card" role="status" aria-live="polite">
      {error || "Completing secure sign-in..."}
      {error ? <a className="esd-btn" href="/internal-login">Return to sign in</a> : null}
    </section>
  </main>;
}
