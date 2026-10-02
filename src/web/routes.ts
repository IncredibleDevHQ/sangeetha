import { useSyncExternalStore } from "react";
const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  window.addEventListener("sangeetha-route", notify);
  return () => {
    window.removeEventListener("popstate", notify);
    window.removeEventListener("sangeetha-route", notify);
  };
};
export function navigate(values: Record<string, string>, replace = false) {
  const url = new URL(location.href);
  if (values.page && values.page !== url.searchParams.get("page")) {
    for (const key of [...url.searchParams.keys()])
      if (key !== "school") url.searchParams.delete(key);
  }
  if (
    values.school &&
    url.searchParams.get("school") &&
    values.school !== url.searchParams.get("school")
  ) {
    url.search = "";
  }
  if (values.module && values.module !== url.searchParams.get("module")) {
    for (const key of [...url.searchParams.keys()])
      if (!["school", "page"].includes(key)) url.searchParams.delete(key);
  }

  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (url.href === location.href) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
  window.dispatchEvent(new Event("sangeetha-route"));
}
export function useRouteValue(
  key: string,
  fallback = "",
): [string, (value: string) => void] {
  const search = useSyncExternalStore(subscribe, () => location.search);
  return [
    new URLSearchParams(search).get(key) || fallback,
    (value) => navigate({ [key]: value }),
  ];
}
export function resourceLink(school: string, values: Record<string, string>) {
  const url = new URL(location.origin + location.pathname);
  url.search = new URLSearchParams({ school, ...values }).toString();
  return url.href;
}

export function rememberAuthDestination() {
  sessionStorage.setItem(
    "sangeetha-auth-return",
    location.pathname + location.search,
  );
}
export function restoreAuthDestination() {
  const saved = sessionStorage.getItem("sangeetha-auth-return");
  if (!saved) return;
  sessionStorage.removeItem("sangeetha-auth-return");
  if (location.search || !saved.startsWith("/?")) return;
  const url = new URL(saved, location.origin);
  if (url.origin === location.origin) history.replaceState({}, "", url);
}
