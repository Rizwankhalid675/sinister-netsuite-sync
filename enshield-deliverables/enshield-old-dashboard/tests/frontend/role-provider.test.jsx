import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RoleProvider, useRole } from "../../web/lib/useRole";

function Probe() {
  const role = useRole();
  return (
    <>
      <output>{role.loading ? "loading" : role.selectedShopId}</output>
      <button onClick={() => role.setSelectedShopId("shop-2")}>Switch</button>
      <button onClick={() => role.setSelectedShopId("not-assigned")}>Invalid</button>
    </>
  );
}

describe("RoleProvider client context", () => {
  it("loads assigned clients, switches safely, and rejects an unassigned shop", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        roleKey: "admin",
        permissions: ["view_dashboard"],
        clients: [
          { shopId: "shop-1", name: "One" },
          { shopId: "shop-2", name: "Two", permissions: ["view_clients"] },
        ],
      }),
    }));
    render(<RoleProvider><Probe /></RoleProvider>);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("all"));
    await userEvent.click(screen.getByRole("button", { name: "Switch" }));
    expect(screen.getByRole("status")).toHaveTextContent("shop-2");
    await userEvent.click(screen.getByRole("button", { name: "Invalid" }));
    expect(screen.getByRole("status")).toHaveTextContent("shop-2");
  });
});
