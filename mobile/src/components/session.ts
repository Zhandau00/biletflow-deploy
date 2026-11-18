/**
 * The signed-in BiletFlow account, shared by every screen: the profile from
 * /users/me, the organizer profile (if any) and the events this person
 * works on (owner, manager or staff).
 */
import { useSyncExternalStore } from "react";
import { api, ApiError, client, onSignedOut, type ApiUser, type OrganizerProfile } from "@/lib/api";

export type StaffEvent = { id: string; title: string; my_role: string };

export type Session =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: ApiUser; organizer: OrganizerProfile | null; staffEvents: StaffEvent[] };

let snapshot: Session = { status: "loading" };
let started = false;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

async function optional<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) return fallback;
    throw error;
  }
}

async function load() {
  try {
    if (!(await client.hasSession())) {
      snapshot = { status: "signed-out" };
    } else {
      const user = await api.users.me();
      const [organizer, staffEvents] = await Promise.all([
        optional(() => api.organizers.me(), null),
        optional(() => api.request<StaffEvent[]>("/events/mine"), []),
      ]);
      snapshot = { status: "signed-in", user, organizer, staffEvents };
    }
  } catch (error) {
    // Network trouble keeps the last known state; 401 means signed out
    if (!(error instanceof ApiError) || error.status === 401 || snapshot.status === "loading")
      snapshot = { status: "signed-out" };
  }
  emit();
}

onSignedOut(() => {
  snapshot = { status: "signed-out" };
  emit();
});

/** Reload the session from the backend (after sign-in, profile changes…). */
export function refreshSession() {
  pending ??= load().finally(() => {
    pending = null;
  });
  return pending;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    void refreshSession();
  }
  return () => listeners.delete(listener);
}

export const currentSession = () => snapshot;

export async function signIn(email: string, password: string) {
  await client.signIn(email, password);
  await refreshSession();
}

export async function signOut() {
  try {
    await client.signOut();
  } finally {
    snapshot = { status: "signed-out" };
    emit();
  }
}

export function useSession() {
  const session = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const user = session.status === "signed-in" ? session.user : null;
  const organizer = session.status === "signed-in" ? session.organizer : null;
  const staffEvents = session.status === "signed-in" ? session.staffEvents : [];
  return {
    session,
    ready: session.status !== "loading",
    user,
    organizer,
    staffEvents,
    isAdmin: user?.is_platform_admin === true,
    /** Owner or manager of at least one event, or has an organizer profile. */
    isOrganizer: !!organizer || staffEvents.some((e) => e.my_role === "owner" || e.my_role === "manager"),
    /** Works the door for at least one event. */
    canCheckIn: staffEvents.length > 0,
  };
}
