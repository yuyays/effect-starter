import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { UsersCard } from "./users-card.js";

afterEach(cleanup);

const idle = { users: undefined, errorMessage: undefined, isFetching: false, onRefetch: () => {} };

describe("UsersCard", () => {
  it("lists users", () => {
    render(<UsersCard {...idle} users={[{ id: "1", name: "Ada" }]} />);

    expect(screen.getByRole("listitem").textContent).toBe("Ada");
  });

  it("shows a loading state before the first response", () => {
    render(<UsersCard {...idle} isFetching />);

    expect(screen.getByText("Loading users...")).toBeTruthy();
    expect(screen.queryByText(/No users yet/)).toBeNull();
  });

  it("explains the empty state", () => {
    render(<UsersCard {...idle} users={[]} />);

    expect(screen.getByText(/No users yet/)).toBeTruthy();
  });

  it("shows an error instead of stale users", () => {
    render(
      <UsersCard {...idle} users={[{ id: "1", name: "Ada" }]} errorMessage="API unavailable" />,
    );

    expect(screen.getByText("API unavailable")).toBeTruthy();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("refetches on click, but not while already fetching", async () => {
    const onRefetch = vi.fn<() => void>();
    const { rerender } = render(<UsersCard {...idle} onRefetch={onRefetch} />);

    await userEvent.click(screen.getByRole("button", { name: "Refetch" }));
    expect(onRefetch).toHaveBeenCalledOnce();

    rerender(<UsersCard {...idle} onRefetch={onRefetch} isFetching />);
    await userEvent.click(screen.getByRole("button", { name: "Loading..." }));
    expect(onRefetch).toHaveBeenCalledOnce();
  });
});
