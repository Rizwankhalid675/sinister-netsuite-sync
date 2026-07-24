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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const begin = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/auth/internal-start", { credentials: "include" });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error("Internal login is unavailable.");
      window.location.assign(body.authorizationUrl);
    } catch {
      setError("Internal login is unavailable. Contact an Enshield administrator.");
      setLoading(false);
    }
  };
  return <main className="esd-auth-page">
    <section className="esd-card esd-auth-card" aria-labelledby="internal-login-title">
      <h1 id="internal-login-title">Enshield internal dashboard</h1>
      <p>Sign in with your organization identity to access assigned clients.</p>
      {error ? <p className="esd-error" role="status" aria-live="polite">{error}</p> : null}
      <button className="esd-btn" type="button" disabled={loading} onClick={begin}>
        {loading ? "Starting secure sign-in…" : "Continue to secure sign-in"}
      </button>
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
        if (mounted) {
          setError("Sign-in could not be completed. Start again.");
        }
      });
    callbackToken = null;
    return () => {
      mounted = false;
    };
  }, [navigate, token]);
  return <main className="esd-auth-page">
    <section className="esd-card esd-auth-card" role="status" aria-live="polite">
      {error || "Completing secure sign-in…"}
      {error ? <a className="esd-btn" href="/internal-login">Return to sign in</a> : null}
    </section>
  </main>;
}
