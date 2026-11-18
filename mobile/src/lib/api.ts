/**
 * The app's connection to BiletFlow: the client from client.ts, with tokens
 * in the device's secure storage, plus named calls shared by the screens.
 */
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";
import { createClient, type TokenPair, type TokenStore } from "./client";
import type { ApiEvent, CalendarLinks, EventImage, ListedEvent, PublicOrganizer, TicketType } from "./events";
import type { Attendee, Order, Quote, SeatMap, Selection, TicketDetail } from "./orders";

export { ApiError } from "./client";

const KEY = "biletflow.session";

const secureStore: TokenStore = {
  async load() {
    try {
      const text =
        Platform.OS === "web" ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
      return text ? (JSON.parse(text) as TokenPair) : null;
    } catch {
      return null;
    }
  },
  async save(tokens) {
    try {
      if (Platform.OS === "web") {
        if (tokens) globalThis.localStorage?.setItem(KEY, JSON.stringify(tokens));
        else globalThis.localStorage?.removeItem(KEY);
      } else if (tokens) await SecureStore.setItemAsync(KEY, JSON.stringify(tokens));
      else await SecureStore.deleteItemAsync(KEY);
    } catch {
      // Storage unavailable: the session lasts until the app closes
    }
  },
};

const signedOutListeners = new Set<() => void>();
export const onSignedOut = (listener: () => void) => {
  signedOutListeners.add(listener);
  return () => signedOutListeners.delete(listener);
};

export const client = createClient({
  baseUrl: API_URL,
  store: secureStore,
  onSignedOut: () => signedOutListeners.forEach((listener) => listener()),
});

export type EventFilters = {
  q?: string;
  city?: string;
  category?: string;
  starts_from?: string;
  starts_to?: string;
};

export type Language = "en" | "ru" | "kk";

export type ApiUser = {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
  is_email_verified: boolean;
  is_platform_admin: boolean;
  preferred_language: Language;
};

export type OrganizerProfile = { id: string; display_name: string; [key: string]: unknown };

type Signal = { signal?: AbortSignal };
const id = encodeURIComponent;
const { request } = client;

export const api = {
  request,
  url: client.url,
  users: {
    register: (input: { full_name: string; email: string; password: string; preferred_language?: Language }) =>
      request<ApiUser>("/users", { body: input, anonymous: true }),
    me: (o: Signal = {}) => request<ApiUser>("/users/me", o),
    updateMe: (input: { full_name?: string; preferred_language?: Language }) =>
      request<ApiUser>("/users/me", { method: "PATCH", body: input }),
  },
  auth: {
    requestVerification: () => request<{ detail: string }>("/auth/verify-email/request", { method: "POST" }),
    confirmVerification: (token: string) =>
      request<ApiUser>("/auth/verify-email/confirm", { body: { token }, anonymous: true }),
    requestPasswordReset: (email: string) =>
      request<{ detail: string }>("/auth/password-reset/request", { body: { email }, anonymous: true }),
    confirmPasswordReset: (token: string, new_password: string) =>
      request("/auth/password-reset/confirm", { body: { token, new_password }, anonymous: true }),
  },
  organizers: {
    me: (o: Signal = {}) => request<OrganizerProfile>("/organizers/me", o),
    get: (organizerId: string, o: Signal = {}) => request<PublicOrganizer>(`/organizers/${id(organizerId)}`, o),
  },
  events: {
    list: (filters: EventFilters = {}, o: Signal = {}) =>
      request<ListedEvent[]>("/events/", { ...o, query: { limit: 200, ...filters } }),
    get: (eventId: string, o: Signal = {}) => request<ApiEvent>(`/events/${id(eventId)}`, o),
    ticketTypes: (eventId: string, o: Signal = {}) =>
      request<TicketType[]>(`/events/${id(eventId)}/ticket-types`, o),
    images: (eventId: string, o: Signal = {}) => request<EventImage[]>(`/events/${id(eventId)}/images`, o),
    calendarLinks: (eventId: string) => request<CalendarLinks>(`/events/${id(eventId)}/calendar-links`),
    calendarFile: (eventId: string) => `/events/${id(eventId)}/calendar.ics`,
    seatMap: (eventId: string, o: Signal = {}) => request<SeatMap>(`/events/${id(eventId)}/seat-map`, o),
    quote: (eventId: string, selection: Selection, promo_code?: string) =>
      request<Quote>(`/events/${id(eventId)}/quote`, { body: { ...selection, promo_code: promo_code || null } }),
    promoLink: (token: string) =>
      request<{ event_id: string; code: string; campaign_name: string; discount_label: string }>(
        `/promo-links/${id(token)}`,
      ),
  },
  orders: {
    create: (eventId: string, selection: Selection, extra: { promo_code?: string; attendees?: Attendee[] } = {}) =>
      request<Order>(`/events/${id(eventId)}/orders`, {
        body: {
          ...selection,
          promo_code: extra.promo_code || null,
          ...(extra.attendees ? { attendees: extra.attendees } : {}),
        },
      }),
    mine: (o: Signal = {}) => request<Order[]>("/orders/mine", o),
    get: (orderId: string, o: Signal = {}) => request<Order>(`/orders/${id(orderId)}`, o),
    pay: (orderId: string, outcome: "success" | "failure" = "success") =>
      request<Order>(`/orders/${id(orderId)}/pay`, {
        body: outcome === "failure" ? { outcome, failure_reason: "Card declined (simulated)" } : { outcome },
      }),
    cancel: (orderId: string) => request<Order>(`/orders/${id(orderId)}/cancel`, { method: "POST" }),
    cancelRegistration: (orderId: string, reason?: string) =>
      request<Order>(`/orders/${id(orderId)}/cancel-registration`, { body: { reason: reason || null } }),
    pdf: (orderId: string) => `/orders/${id(orderId)}/tickets.pdf`,
  },
  tickets: {
    mine: (o: Signal = {}) => request<TicketDetail[]>("/tickets/mine", o),
    pdf: (ticketId: string) => `/tickets/${id(ticketId)}/pdf`,
  },
};
