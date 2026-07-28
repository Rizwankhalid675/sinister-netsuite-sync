import { useState } from "react";
import { useRole } from "../lib/useRole";
import "./dashboard.css";

export function ChangePasswordPage({ forced = false }) {
  const { user, refreshIdentity } = useRole();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All fields are required.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from the current password.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.error || "Password change failed.");
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      if (typeof refreshIdentity === "function") {
        await refreshIdentity();
      } else {
        window.setTimeout(() => window.location.reload(), 600);
      }
    } catch (err) {
      setError(err.message || "Password change failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="esd-auth-page">
      <section className="esd-card esd-auth-card" aria-labelledby="change-password-title">
        <h1 id="change-password-title">
          {forced ? "Set a new password" : "Change your password"}
        </h1>
        <p>
          {forced
            ? `Welcome${user?.name ? `, ${user.name}` : ""}. Your account was created with a temporary password. Set a new password to continue.`
            : "Update the password used to sign in to the Enshield internal dashboard."}
        </p>
        {error ? (
          <p className="esd-error" role="alert" aria-live="assertive">
            {error}
          </p>
        ) : null}
        {success && !forced ? (
          <p role="status" aria-live="polite">
            Password updated successfully.
          </p>
        ) : null}
        <form onSubmit={submit}>
          <label htmlFor="esd-cp-current">
            {forced ? "Temporary password" : "Current password"}
          </label>
          <input
            id="esd-cp-current"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
          <label htmlFor="esd-cp-new">New password</label>
          <input
            id="esd-cp-new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            minLength={8}
          />
          <label htmlFor="esd-cp-confirm">Confirm new password</label>
          <input
            id="esd-cp-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={8}
          />
          <button className="esd-btn" type="submit" disabled={submitting}>
            {submitting ? "Updating…" : "Update password"}
          </button>
        </form>
      </section>
    </main>
  );
}
