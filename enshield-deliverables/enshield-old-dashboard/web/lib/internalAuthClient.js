export function createSingleAuthExchange() {
  let exchangePromise;

  return function exchangeInternalAuthToken(token, fetchImpl = fetch) {
    if (exchangePromise) return exchangePromise;

    exchangePromise = token
      ? fetchImpl("/auth/internal-callback", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        }).then((response) => {
          if (!response.ok) throw new Error("Internal authentication failed");
          return true;
        })
      : Promise.reject(new Error("Missing internal authentication response"));

    return exchangePromise;
  };
}

export async function logoutInternalSession({
  fetchImpl = fetch,
  onFailure = () => {},
  navigate = () => {},
} = {}) {
  let succeeded = false;
  try {
    const response = await fetchImpl("/auth/internal-logout", {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) throw new Error("Internal logout failed");
    succeeded = true;
  } catch {
    try {
      onFailure();
    } catch {
      // A presentation callback must never prevent local sign-out.
    }
  } finally {
    try {
      navigate();
    } catch {
      // Navigation implementations can fail during teardown; do not leak a rejection.
    }
  }
  return succeeded;
}
