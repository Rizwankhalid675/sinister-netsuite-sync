import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InternalLoginPage } from "../../web/routes/internalLogin";

describe("InternalLoginPage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("submits email and password to the standalone login endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, mustChangePassword: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MemoryRouter><InternalLoginPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "secret-password" }),
    }));
  });
});
