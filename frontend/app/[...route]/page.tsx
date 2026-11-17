import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoleApp } from "@/components/role-app";
import { BACKEND_URL } from "@/lib/server/backend";

const titles: Record<string, string> = {
  events: "What’s on",
  "sign-in": "Welcome back",
  register: "Create an account",
  "forgot-password": "Reset your password",
  "reset-password": "Choose a new password",
  "verify-email": "Confirm your email",
  profile: "Account profile",
  orders: "Your tickets",
  checkout: "Your booking",
  organizer: "Your box office",
  "check-in": "Check-in desk",
  admin: "Platform administration",
  support: "Support cases",
  notifications: "Notifications",
};
/** The event's title for the browser tab and link previews (public events only). */
async function publicEvent(id: string): Promise<{ title: string; subtitle: string | null } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const response = await fetch(`${BACKEND_URL}/events/${id}`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(3000),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ route: string[] }>;
}): Promise<Metadata> {
  const { route } = await params;
  if (route[0] === "events" && route.length === 2) {
    const event = await publicEvent(route[1]);
    if (event)
      return {
        title: `${event.title} — BiletFlow`,
        description: event.subtitle ?? undefined,
      };
  }
  return { title: `${titles[route[0]] ?? "Not found"} — BiletFlow` };
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ route: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { route } = await params;
  const valid =
    /^(events(?:\/[^/]+)?|orders(?:\/[^/]+)?|checkout\/[^/]+|sign-in|register|forgot-password|reset-password|verify-email|profile|admin|support(?:\/[^/]+)?|organizer(?:\/events\/[^/]+)?|check-in|notifications)$/.test(
      route.join("/"),
    );
  if (!valid) notFound();
  const search = await searchParams;
  const query = Object.fromEntries(
    Object.entries(search).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : (value ?? ""),
    ]),
  );
  return <RoleApp route={route} query={query} />;
}
