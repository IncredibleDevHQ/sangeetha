import { it, expect, vi, afterEach } from "vitest";
import {
  navigate,
  resourceLink,
  restoreAuthDestination,
} from "../src/web/routes";
afterEach(() => vi.unstubAllGlobals());
it("keeps explicit resource destinations and separates school/page navigation", () => {
  let current = new URL(
    "https://school.example/?school=one&page=operations&module=library&lesson=a",
  );
  const history = {
    pushState: vi.fn((_a, _b, url) => {
      current = new URL(url);
    }),
    replaceState: vi.fn((_a, _b, url) => {
      current = new URL(url);
    }),
  };
  vi.stubGlobal("location", {
    get href() {
      return current.href;
    },
    get origin() {
      return current.origin;
    },
    get pathname() {
      return current.pathname;
    },
  });
  vi.stubGlobal("window", { history, dispatchEvent: vi.fn() });
  navigate({ page: "lesson", lesson: "b", asset: "c" });
  expect(current.searchParams.get("lesson")).toBe("b");
  expect(current.searchParams.has("module")).toBe(false);
  expect(resourceLink("one", { page: "lesson", lesson: "a & b" })).toContain(
    "lesson=a+%26+b",
  );
  navigate({ school: "two" });
  expect(current.search).toBe("?school=two");
});
it("restores only local sign-in destinations", () => {
  const replaceState = vi.fn(),
    removeItem = vi.fn();
  vi.stubGlobal("history", { replaceState });
  vi.stubGlobal("location", { origin: "https://school.example", search: "" });
  vi.stubGlobal("sessionStorage", {
    getItem: () => "https://evil.example/",
    removeItem,
  });
  restoreAuthDestination();
  expect(replaceState).not.toHaveBeenCalled();
  vi.stubGlobal("sessionStorage", {
    getItem: () => "/?school=one&page=lesson&lesson=a",
    removeItem,
  });
  restoreAuthDestination();
  expect(String(replaceState.mock.calls[0][2])).toContain(
    "https://school.example/?school=one",
  );
});
