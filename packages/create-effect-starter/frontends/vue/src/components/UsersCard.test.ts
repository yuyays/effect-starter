import { cleanup, render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";
import UsersCard from "./UsersCard.vue";

afterEach(cleanup);

const idle = { users: undefined, errorMessage: undefined, isFetching: false };

describe("UsersCard", () => {
  it("lists users", () => {
    render(UsersCard, { props: { ...idle, users: [{ id: "1", name: "Ada" }] } });

    expect(screen.getByRole("listitem").textContent?.trim()).toBe("Ada");
  });

  it("shows a loading state before the first response", () => {
    render(UsersCard, { props: { ...idle, isFetching: true } });

    expect(screen.getByText("Loading users...")).toBeTruthy();
    expect(screen.queryByText(/No users yet/)).toBeNull();
  });

  it("explains the empty state", () => {
    render(UsersCard, { props: { ...idle, users: [] } });

    expect(screen.getByText(/No users yet/)).toBeTruthy();
  });

  it("shows an error instead of stale users", () => {
    render(UsersCard, {
      props: { ...idle, users: [{ id: "1", name: "Ada" }], errorMessage: "API unavailable" },
    });

    expect(screen.getByText("API unavailable")).toBeTruthy();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("emits refetch on click, but not while already fetching", async () => {
    const view = render(UsersCard, { props: idle });

    await userEvent.click(screen.getByRole("button", { name: "Refetch" }));
    expect(view.emitted("refetch")).toHaveLength(1);

    await view.rerender({ ...idle, isFetching: true });
    await userEvent.click(screen.getByRole("button", { name: "Loading..." }));
    expect(view.emitted("refetch")).toHaveLength(1);
  });
});
