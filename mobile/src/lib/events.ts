/**
 * Event data as the BiletFlow backend returns it, and the helpers the event
 * pages use to show it (categories, dates in the event's own time zone,
 * prices, availability and image links).
 */

import { API_URL } from "./config";

export type EventLifecycle = "draft" | "upcoming" | "active" | "completed" | "cancelled";
export type SaleStatus = "hidden" | "scheduled" | "on_sale" | "sold_out" | "ended";

export type ApiEvent = {
  id: string;
  organizer_profile_id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_image_url: string | null;
  refund_policy: string | null;
  status: "draft" | "published" | "cancelled" | "completed";
  lifecycle: EventLifecycle;
  visibility: "public" | "unlisted" | "private";
  seating_type: "general_admission" | "assigned";
  venue_layout_id?: string | null;
  start_at: string;
  end_at: string;
  timezone: string;
  capacity: number;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  paid_sales_open: boolean;
  is_suspended: boolean;
  venue_name: string | null;
  venue_address: string | null;
  city: string | null;
  category: string | null;
  published_at: string | null;
  created_at: string;
};

/** An event in the public listing, with what an event card needs. */
export type ListedEvent = ApiEvent & {
  organizer_name: string;
  price_from_kzt: number | null;
  tickets_available: number;
  /** The most hopeful state across the ticket types; null when there are none. */
  sale_state: Exclude<SaleStatus, "hidden"> | null;
};

export type TicketType = {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price_kzt: number;
  quantity: number;
  max_per_order: number;
  sale_start: string | null;
  sale_end: string | null;
  is_hidden: boolean;
  seat_category: string | null;
  available: number;
  sale_status: SaleStatus;
};

export type EventImage = { id: string; url: string; content_type: string };
export type PublicOrganizer = { id: string; display_name: string };
export type CalendarLinks = { ics: string; google: string; outlook: string; yahoo: string };

/** Categories offered on the site: the value stored on the event, the label
 *  shown, and the poster style used when the event has no image. */
export const CATEGORIES = [
  { value: "concert", label: "Concerts", poster: "concert" },
  { value: "cinema", label: "Cinema", poster: "cine" },
  { value: "theatre", label: "Theatre", poster: "theatre" },
  { value: "festival", label: "Festivals", poster: "fest" },
  { value: "comedy", label: "Comedy", poster: "comedy" },
  { value: "sport", label: "Sport", poster: "sport" },
] as const;

export const CITIES = ["Almaty", "Astana", "Shymkent"];

const findCategory = (value?: string | null) => {
  const key = value?.trim().toLowerCase();
  return key ? CATEGORIES.find((c) => c.value === key || c.label.toLowerCase() === key) : undefined;
};

/** Category value from a link (accepts "concert" or the label "Concerts"). */
export const categoryValue = (raw?: string | null) => findCategory(raw)?.value ?? "";

export const categoryLabel = (value?: string | null) =>
  findCategory(value)?.label ?? (value ? value[0].toUpperCase() + value.slice(1) : "Event");

export const posterStyle = (value?: string | null) => findCategory(value)?.poster ?? "concert";

/** Uploaded images are served by the backend under /api/v1/media. */
export function mediaUrl(url?: string | null) {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  const local = url.match(/^\/api\/v1(\/media\/.+)$/);
  return local ? `${API_URL}${local[1]}` : null;
}

export const price = (value: number) =>
  value === 0 ? "Free" : `₸${value.toLocaleString("en-US")}`;

/** Date and time in the event's own time zone (falls back to Almaty). */
export function eventDate(
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, ...options }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Almaty", ...options }).format(
      new Date(iso),
    );
  }
}

export const eventTime = (iso: string, timeZone: string) =>
  eventDate(iso, timeZone, { hour: "2-digit", minute: "2-digit", hour12: false });

/** "Asia/Almaty" → "Almaty time". */
export const zoneName = (timeZone: string) =>
  `${timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone} time`;

export const venueLine = (event: Pick<ApiEvent, "venue_name" | "city">) =>
  [event.venue_name, event.city].filter(Boolean).join(" · ") || "Venue to be announced";

/** What a card says about tickets: price, or why they cannot be bought. */
export function cardStatus(event: ListedEvent): { label: string; action: string } {
  if (event.lifecycle === "cancelled") return { label: "Cancelled", action: "Details" };
  if (event.price_from_kzt === null || !event.sale_state)
    return { label: "Tickets soon", action: "Details" };
  if (event.sale_state === "sold_out") return { label: "Sold out", action: "Details" };
  if (event.sale_state === "ended") return { label: "Sales ended", action: "Details" };
  if (event.sale_state === "scheduled") return { label: "On sale soon", action: "Details" };
  // The cheapest type is paid, so every type is: nothing to buy yet
  if (event.price_from_kzt > 0 && !event.paid_sales_open)
    return { label: "Sales open soon", action: "Details" };
  return {
    label: event.price_from_kzt ? `from ${price(event.price_from_kzt)}` : "Free",
    action: event.price_from_kzt ? "Get tickets" : "Register",
  };
}

/** Why a ticket type cannot be chosen right now, or null when it can. */
export function ticketBlock(ticket: TicketType, event: ApiEvent, now = Date.now()): string | null {
  if (event.lifecycle === "cancelled") return "Event cancelled";
  if (event.lifecycle === "completed") return "Event has ended";
  if (ticket.sale_status === "sold_out" || ticket.available <= 0) return "Sold out";
  if (ticket.sale_status === "ended") return "Sales have ended";
  if (ticket.sale_status === "scheduled")
    return ticket.sale_start && new Date(ticket.sale_start).getTime() > now
      ? `On sale ${eventDate(ticket.sale_start, event.timezone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}`
      : "Not on sale yet";
  if (ticket.sale_status !== "on_sale") return "Not available";
  if (ticket.price_kzt > 0 && !event.paid_sales_open) return "Paid sales are not open yet";
  return null;
}

/** Start and end of the date filters, in Almaty time, as ISO strings. */
export type WhenFilter = "any" | "today" | "weekend" | "week" | "month";
export const WHEN_OPTIONS: { value: WhenFilter; label: string }[] = [
  { value: "any", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "weekend", label: "This weekend" },
  { value: "week", label: "Next 7 days" },
  { value: "month", label: "Next 30 days" },
];

const ALMATY_OFFSET_HOURS = 5; // Kazakhstan has used UTC+5 nationwide since 2024
const DAY = 86_400_000;

export function whenRange(when: string, now = Date.now()): { starts_from?: string; starts_to?: string } {
  const offset = ALMATY_OFFSET_HOURS * 3_600_000;
  const localMidnight = Math.floor((now + offset) / DAY) * DAY - offset;
  const weekday = new Date(now + offset).getUTCDay(); // 0 = Sunday
  const iso = (ms: number) => new Date(ms).toISOString();
  switch (when) {
    case "today":
      return { starts_to: iso(localMidnight + DAY) };
    case "weekend": {
      // Saturday 00:00 to Monday 00:00; on a weekend, the current one
      const saturday = localMidnight + (weekday === 0 ? -1 : 6 - weekday) * DAY;
      return { starts_from: iso(saturday), starts_to: iso(saturday + 2 * DAY) };
    }
    case "week":
      return { starts_to: iso(localMidnight + 7 * DAY) };
    case "month":
      return { starts_to: iso(localMidnight + 30 * DAY) };
    default:
      return {};
  }
}

export const normaliseWhen = (raw?: string): WhenFilter =>
  WHEN_OPTIONS.some((o) => o.value === raw) ? (raw as WhenFilter) : "any";

/** What the poster component needs, from a backend event. */
export const posterInfo = (event: ApiEvent) => ({
  id: event.id,
  poster: posterStyle(event.category),
  title: event.title,
  city: event.city ?? "",
  category: categoryLabel(event.category),
  date: event.start_at,
  image: mediaUrl(event.cover_image_url),
  timeZone: event.timezone,
});
