/** Unread notification count, polled once a minute while signed in. */
import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { useSession } from "./session";

let count = 0;
const listeners = new Set<() => void>();
const set = (n: number) => {
  count = n;
  listeners.forEach((l) => l());
};

/** Ask the backend again (after marking notifications read). */
export const recheckUnread = () =>
  api
    .request<{ unread: number }>("/notifications/unread-count")
    .then((r) => set(r.unread))
    .catch(() => undefined);

export function useUnread() {
  const { user } = useSession();
  useEffect(() => {
    if (!user) {
      set(0);
      return;
    }
    void recheckUnread();
    const timer = setInterval(recheckUnread, 60000);
    return () => clearInterval(timer);
  }, [user]);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => count,
    () => count,
  );
}
