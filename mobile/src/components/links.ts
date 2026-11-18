import { router } from "expo-router";

/** Open a new support request about an event, order or ticket. */
export function openSupport(params: { event?: string; order?: string; ticket?: string; to?: "platform" } = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>;
  router.push({ pathname: "/support/new", params: clean });
}

/** Send people to sign in, then back to where they were. */
export const signInFirst = (next?: string) => router.push({ pathname: "/sign-in", params: next ? { next } : {} });

/**
 * Notification links are website paths (/orders/…, /support/…); this maps
 * them to the app's screens, or null when there is no matching screen.
 */
export function appPath(link: string | null | undefined): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//")) return null;
  const [path, search = ""] = link.split("?");
  const parts = path.split("/").filter(Boolean);
  const query = new URLSearchParams(search);
  if (parts[0] === "orders") return parts[1] ? `/order/${parts[1]}` : "/tickets";
  if (parts[0] === "events" && parts[1]) return `/event/${parts[1]}`;
  if (parts[0] === "events") return "/";
  if (parts[0] === "support") return parts[1] && parts[1] !== "new" ? `/support/${parts[1]}` : "/support";
  if (parts[0] === "organizer" && parts[1] === "events" && parts[2])
    return `/organizer/${parts[2]}${query.get("tab") ? `?tab=${encodeURIComponent(query.get("tab")!)}` : ""}`;
  if (parts[0] === "organizer") return query.get("view") === "profile" ? "/organizer/profile" : "/organizer";
  if (parts[0] === "admin") return query.get("view") ? `/admin/${query.get("view")}` : "/admin";
  if (parts[0] === "check-in") return "/check-in";
  if (parts[0] === "profile") return "/account";
  if (parts[0] === "notifications") return "/notifications";
  return null;
}
