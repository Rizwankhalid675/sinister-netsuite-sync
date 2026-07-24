import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ListToolbar,
  PageNavigation,
  PageStatus,
} from "../../web/components/OperationalPage";

describe("operational page states", () => {
  it.each([
    ["loading", { loading: true }, "Loading clients"],
    ["empty", { empty: true }, "No clients match this view."],
    ["forbidden", { error: "forbidden" }, "permission to view clients"],
  ])("renders the %s state", (_, state, expected) => {
    render(<PageStatus noun="clients" onRetry={() => {}} {...state} />);
    expect(screen.getByRole("status")).toHaveTextContent(expected);
  });

  it("renders an error and retries", async () => {
    const retry = vi.fn();
    render(<PageStatus noun="claims" error="network" onRetry={retry} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("changes search and status filters", async () => {
    const onSearch = vi.fn();
    const onStatus = vi.fn();
    render(
      <ListToolbar
        search=""
        onSearch={onSearch}
        status=""
        onStatus={onStatus}
        statuses={["active", "paused"]}
      />
    );
    await userEvent.type(screen.getByRole("searchbox"), "Rudy");
    await userEvent.selectOptions(screen.getByRole("combobox"), "active");
    expect(onSearch).toHaveBeenLastCalledWith("y");
    expect(onStatus).toHaveBeenCalledWith("active");
  });

  it("moves through pagination", async () => {
    const previous = vi.fn();
    const next = vi.fn();
    render(
      <PageNavigation
        hasPrevious
        hasNext
        onPrevious={previous}
        onNext={next}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Previous page" }));
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(previous).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });
});
