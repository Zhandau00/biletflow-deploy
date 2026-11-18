/** Date and money formatting shared by the screens (Almaty time, tenge). */
export const stamp = (value: string) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Almaty" }).format(new Date(value));

export const amount = (value: number) => `₸${value.toLocaleString("en-US")}`;

export const ref = (id: string) => id.slice(0, 8).toUpperCase();

export const caseTone = (status: string): "live" | "warn" | "bad" | "neutral" =>
  status === "resolved" ? "live" : status === "waiting_for_customer" ? "warn" : status === "open" ? "bad" : "neutral";

/** Badge tone for an admin status word. */
export function statusTone(value: string): "live" | "bad" | "neutral" {
  const v = value.toLowerCase();
  if (["suspended", "failed", "disputed", "rejected", "lost", "cancelled", "open"].includes(v)) return "bad";
  if (["paid", "succeeded", "active", "confirmed", "completed", "resolved", "won", "published", "verified", "actioned"].includes(v)) return "live";
  return "neutral";
}
