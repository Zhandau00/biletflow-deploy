import { router } from "expo-router";
import type { Language } from "@/lib/api";

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: "kk", label: "Қазақша" },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
];

/** Where to go after signing in: back, or to an app path passed as ?next=. */
export function goOn(next?: string) {
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    if (router.canDismiss()) router.dismissAll();
    router.replace(next as never);
  } else if (router.canGoBack()) router.back();
  else router.replace("/");
}

/** Email links carry ?token=…; accept the whole pasted link or just the code. */
export function tokenFrom(text: string) {
  const value = text.trim();
  const match = value.match(/[?&]token=([^&#\s]+)/);
  return match ? decodeURIComponent(match[1]) : value;
}
