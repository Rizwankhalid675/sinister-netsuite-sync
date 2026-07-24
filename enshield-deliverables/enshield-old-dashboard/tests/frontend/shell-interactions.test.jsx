import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { InternalAppShell } from "../../web/components/InternalAppShell";

vi.mock("../../web/lib/useRole", () => ({
  useRole: () => ({
    permissions: [
      "view_dashboard", "view_clients", "view_orders", "view_claims",
      "view_errors", "view_reports", "manage_settings", "view_users",
    ],
    roleLabel: "Administrator",
    user: { name: "QA User" },
    clients: [
      { shopId: "shop-1", name: "First client" },
      { shopId: "shop-2", name: "Second client" },
    ],
    selectedShopId: "all",
    setSelectedShopId: vi.fn(),
    loading: false,
  }),
}));

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route element={<InternalAppShell />}>
          <Route path="/dashboard" element={<p>Dashboard content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("internal shell keyboard and focus", () => {
  it("opens and closes the navigation drawer with Escape and restores focus", async () => {
    const user = userEvent.setup();
    renderShell();
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("opens and closes notifications with Escape and restores trigger focus", async () => {
    const user = userEvent.setup();
    renderShell();
    const trigger = screen.getByRole("button", { name: "Notifications" });
    await user.click(trigger);
    expect(screen.getByRole("region", { name: "Notifications panel" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("region", { name: "Notifications panel" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
