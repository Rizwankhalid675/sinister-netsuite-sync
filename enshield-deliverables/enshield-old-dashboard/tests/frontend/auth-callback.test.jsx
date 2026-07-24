import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InternalAuthCallbackPage } from "../../web/routes/internalLogin";

const navigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigate };
});

describe("internal auth callback", () => {
  beforeEach(() => {
    navigate.mockReset();
    window.history.replaceState(null, "", "/internal-auth/callback#token=one-time");
  });

  it("exchanges a callback token only once in StrictMode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <StrictMode>
        <MemoryRouter><InternalAuthCallbackPage /></MemoryRouter>
      </StrictMode>
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard", { replace: true }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/auth/internal-callback", expect.objectContaining({ method: "POST" }));
    expect(window.location.hash).toBe("");
  });
});
