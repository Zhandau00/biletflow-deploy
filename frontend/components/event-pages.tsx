"use client";

/**
 * Public event pages backed by the BiletFlow API: the landing-page list,
 * browsing and search, and the event page with ticket types.
 */

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import {
  CATEGORIES,
  CITIES,
  WHEN_OPTIONS,
  cardStatus,
  categoryLabel,
  categoryValue,
  eventDate,
  eventTime,
  mediaUrl,
  normaliseWhen,
  posterInfo,
  price,
  ticketBlock,
  venueLine,
  whenRange,
  zoneName,
  type ApiEvent,
  type ListedEvent,
  type TicketType,
} from "@/lib/events";
import { useSession } from "./session-provider";
import { SupportLink } from "./support-pages";
import { useLoad } from "./use-load";
import { EmptyState, Icon, LoadingPage, Notice, PageIntro, Poster } from "./primitives";

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <Notice error>
      {message}{" "}
      <button className="text-link" onClick={retry}>
        Try again
      </button>
    </Notice>
  );
}

function CardSkeletons({ count = 6 }: { count?: number }) {
  return (
    <div className="event-grid" aria-busy="true" aria-label="Loading events">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="discovery-card">
          <div className="skeleton skeleton-poster" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

export function EventCard({ event }: { event: ListedEvent }) {
  const status = cardStatus(event);
  return (
    <Link href={`/events/${event.id}`} className="discovery-card">
      <Poster event={posterInfo(event)} />
      <div className="discovery-info">
        <p className="event-kicker">
          {eventDate(event.start_at, event.timezone, { weekday: "short", day: "numeric", month: "short" })}
          <span> / </span> {eventTime(event.start_at, event.timezone)}
        </p>
        <h2>{event.title}</h2>
        <p className="muted">{venueLine(event)}</p>
        <div className="discovery-bottom">
          <strong>{status.label}</strong>
          <span>
            {status.action}
            <Icon name="arrow" size={16} />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function LandingEvents() {
  const events = useLoad("landing", (signal) => api.events.list({}, { signal }));
  if (events.status === "error" && !events.data)
    return <LoadError message={events.error.message} retry={events.reload} />;
  if (!events.data) return <CardSkeletons />;
  const upcoming = events.data.slice(0, 6);
  return upcoming.length ? (
    <div className="event-grid">
      {upcoming.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  ) : (
    <EmptyState
      title="The next good night is taking shape."
      description="New events will appear here as soon as their organizers publish them."
    />
  );
}

/** Wait until typing pauses before searching. */
function useDebounced<T>(value: T, delay = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export function BrowsePage({
  query = "",
  category = "",
  city = "",
  when = "any",
}: {
  query?: string;
  category?: string;
  city?: string;
  when?: string;
}) {
  const [search, setSearch] = useState(query);
  const [selected, setSelected] = useState(categoryValue(category));
  const [location, setLocation] = useState(
    CITIES.find((c) => c.toLowerCase() === city.toLowerCase()) ?? "",
  );
  const [date, setDate] = useState(normaliseWhen(when));
  const [sort, setSort] = useState<"date" | "price">("date");
  const q = useDebounced(search.trim());

  const filters = { q, category: selected, city: location, when: date };
  const events = useLoad(JSON.stringify(filters), (signal) =>
    api.events.list(
      { q, category: selected, city: location, ...whenRange(date) },
      { signal },
    ),
  );

  // Keep the address shareable without reloading the page
  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (selected) params.set("category", selected);
    if (location) params.set("city", location);
    if (date !== "any") params.set("when", date);
    const next = `/events${params.size ? `?${params}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`)
      window.history.replaceState(window.history.state, "", next);
  }, [q, selected, location, date]);

  const list = [...(events.data ?? [])];
  if (sort === "price")
    list.sort(
      (a, b) =>
        (a.price_from_kzt ?? Number.MAX_SAFE_INTEGER) -
        (b.price_from_kzt ?? Number.MAX_SAFE_INTEGER),
    );

  function reset() {
    setSearch("");
    setSelected("");
    setLocation("");
    setDate("any");
  }

  return (
    <main className="workspace browse-page">
      <PageIntro
        eyebrow="Out of the ordinary. Into the city."
        title="Make a night of it."
        description="Big stages, small rooms, and everything worth showing up for."
      />
      <div className="browse-search">
        <label className="search-input">
          <Icon name="search" />
          <span className="sr-only">Search events, venues</span>
          <input
            type="search"
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="An event, an artist, a venue…"
          />
        </label>
        <label>
          <Icon name="pin" size={17} />
          <span className="sr-only">City</span>
          <select value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">All cities</option>
            {CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          <Icon name="calendar" size={17} />
          <span className="sr-only">When</span>
          <select value={date} onChange={(e) => setDate(normaliseWhen(e.target.value))}>
            {WHEN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="filter-row">
        <div className="filter-tabs" aria-label="Event categories">
          {[{ value: "", label: "All events" }, ...CATEGORIES].map((c) => (
            <button
              key={c.value}
              aria-pressed={selected === c.value}
              className={selected === c.value ? "active" : ""}
              onClick={() => setSelected(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="results-meta" aria-live="polite">
        <span>
          {events.data
            ? `${list.length} ${list.length === 1 ? "event" : "events"} to look forward to`
            : "Finding events…"}
        </span>
        <label>
          Sort by{" "}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value === "price" ? "price" : "date")}
            aria-label="Sort events"
          >
            <option value="date">Soonest first</option>
            <option value="price">Lowest price</option>
          </select>
        </label>
      </div>
      {events.status === "error" && (
        <LoadError message={events.error.message} retry={events.reload} />
      )}
      {!events.data ? (
        events.status === "loading" && <CardSkeletons />
      ) : list.length ? (
        <div className="event-grid" aria-busy={events.status === "loading"}>
          {list.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <>
          <EmptyState
            icon="search"
            title="Nothing on the bill just yet."
            description="Try a different city, category, date or search. A good night might be one filter away."
          />
          <button className="btn btn-secondary reset-filters" onClick={reset}>
            Clear filters
          </button>
        </>
      )}
      <div className="organizer-invite">
        <div>
          <span className="eyebrow">On the other side of the stage?</span>
          <h2>Put your event on the map.</h2>
        </div>
        <Link className="btn btn-secondary" href="/organizer">
          Meet your box office <Icon name="arrow" size={17} />
        </Link>
      </div>
    </main>
  );
}

type EventDetails = {
  event: ApiEvent;
  tickets: TicketType[];
  organizer: string;
  images: string[];
};

async function loadEvent(id: string, signal: AbortSignal): Promise<EventDetails> {
  const event = await api.events.get(id, { signal });
  const [tickets, organizer, images] = await Promise.all([
    api.events.ticketTypes(id, { signal }),
    api.organizers
      .get(event.organizer_profile_id, { signal })
      .then((o) => o.display_name)
      .catch(() => ""),
    api.events
      .images(id, { signal })
      .then((list) => list.map((i) => mediaUrl(i.url)).filter((u): u is string => !!u))
      .catch(() => []),
  ]);
  return { event, tickets, organizer, images };
}

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export function EventPage({ id, promo }: { id: string; promo?: string }) {
  const valid = isUuid(id);
  const details = useLoad(id, (signal) =>
    valid ? loadEvent(id, signal) : Promise.reject(new ApiError("Event not found", 404)),
  );
  if (details.status === "error" && (details.httpStatus === 404 || details.httpStatus === 422))
    return <MissingEvent />;
  if (details.status === "error")
    return (
      <main className="workspace">
        <LoadError message={details.error.message} retry={details.reload} />
      </main>
    );
  if (!details.data) return <LoadingPage />;
  return <EventView {...details.data} promoToken={promo} />;
}

function EventView({
  event,
  tickets,
  organizer,
  images,
  promoToken,
}: EventDetails & { promoToken?: string }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [promo, setPromo] = useState<{ label: string; name: string } | null>(null);
  useEffect(() => {
    if (!promoToken) return;
    api.events
      .promoLink(promoToken)
      .then((found) =>
        found.event_id === event.id && setPromo({ label: found.discount_label, name: found.campaign_name }),
      )
      .catch(() => setPromo(null));
  }, [promoToken, event.id]);
  const promoSuffix = promoToken ? `&link=${encodeURIComponent(promoToken)}` : "";
  const [now] = useState(Date.now);
  const blocks = Object.fromEntries(tickets.map((t) => [t.id, ticketBlock(t, event, now)]));
  const chosen = tickets.filter((t) => (quantities[t.id] ?? 0) > 0);
  const count = chosen.reduce((s, t) => s + quantities[t.id], 0);
  const total = chosen.reduce((s, t) => s + t.price_kzt * quantities[t.id], 0);
  const ended = event.lifecycle === "completed";
  const cancelled = event.lifecycle === "cancelled";
  const assigned = event.seating_type === "assigned";
  const sameDay =
    eventDate(event.start_at, event.timezone) === eventDate(event.end_at, event.timezone);
  const extraImages = images.filter((url) => url !== mediaUrl(event.cover_image_url));
  const mapQuery = [event.venue_name, event.venue_address, event.city].filter(Boolean).join(", ");

  return (
    <main className="workspace">
      <Link href="/events" className="text-link muted back-link">
        <Icon name="back" size={15} />
        All events
      </Link>
      {cancelled && (
        <Notice error>
          This event has been cancelled. Ticket holders are refunded automatically and were told by email.
        </Notice>
      )}
      {ended && <Notice>This event has ended.</Notice>}
      {event.lifecycle === "active" && <Notice>Happening now.</Notice>}
      {event.lifecycle === "draft" && (
        <Notice>Draft preview — only the event team can see this page until it is published.</Notice>
      )}
      <div className="event-detail-layout">
        <div className="event-story">
          <Poster event={posterInfo(event)} />
          <div className="event-title-block">
            <p className="eyebrow">
              {categoryLabel(event.category)}
              {event.city && (
                <>
                  <span> / </span> {event.city}
                </>
              )}
            </p>
            <h1>{event.title}</h1>
            {event.subtitle && <p className="event-subtitle">{event.subtitle}</p>}
          </div>
          <div className="event-facts">
            <div>
              <Icon name="calendar" />
              <span>
                <strong>
                  {eventDate(event.start_at, event.timezone, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </strong>
                <small>
                  {eventTime(event.start_at, event.timezone)} –{" "}
                  {sameDay
                    ? eventTime(event.end_at, event.timezone)
                    : `${eventDate(event.end_at, event.timezone)}, ${eventTime(event.end_at, event.timezone)}`}{" "}
                  · {zoneName(event.timezone)}
                </small>
              </span>
            </div>
            <div>
              <Icon name="pin" />
              <span>
                <strong>{event.venue_name ?? "Venue to be announced"}</strong>
                <small>
                  {[event.venue_address, event.city].filter(Boolean).join(", ") || "Kazakhstan"}
                  {mapQuery && (
                    <>
                      {" · "}
                      <a
                        className="text-link"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Map
                      </a>
                    </>
                  )}
                </small>
              </span>
            </div>
          </div>
          {!cancelled && !ended && <CalendarMenu eventId={event.id} />}
          <section className="event-about">
            <h2>A little about the event</h2>
            <p className="pre-line">
              {event.description || "The organizer has not added a description yet."}
            </p>
            {extraImages.length > 0 && (
              <div className="event-gallery">
                {extraImages.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="" loading="lazy" />
                ))}
              </div>
            )}
            <div className="good-to-know">
              <span className="eyebrow">Good to know</span>
              <p>
                Each ticket admits one person and has its own QR code. Keep it on your phone or
                print the PDF.
                {assigned && " This event has numbered seats; you choose them at checkout."}
              </p>
              {event.refund_policy && (
                <>
                  <span className="eyebrow">Refunds</span>
                  <p className="pre-line">{event.refund_policy}</p>
                </>
              )}
            </div>
          </section>
          <div className="host-line">
            <span className="avatar">{(organizer || "Organizer")[0]}</span>
            <div>
              <small>Put together by</small>
              <p>{organizer || "Independent organizer"}</p>
            </div>
          </div>
          <div className="event-support-actions">
            <SupportLink eventId={event.id} label="Ask about this event" />
            <EventReport eventId={event.id} />
          </div>
        </div>
        <aside className="booking-panel">
          <div className="booking-heading">
            <span className="eyebrow">Save your place</span>
            <Icon name="ticket" />
          </div>
          <h2>See you there.</h2>
          <p className="muted">
            {assigned ? "Numbered seats: pick yours on the seat map." : "Choose your tickets. Bring your people."}
          </p>
          <div className="ticket-options">
            {tickets.length === 0 && <p className="muted">Tickets have not been released yet.</p>}
            {tickets.map((t) => {
              const block = blocks[t.id];
              const quantity = quantities[t.id] ?? 0;
              const limit = Math.min(t.max_per_order, t.available);
              return (
                <div className="ticket-option" key={t.id}>
                  <div>
                    <strong>{t.name}</strong>
                    {t.description && <p>{t.description}</p>}
                    <small>
                      {block ?? (t.available <= 10 ? `Only ${t.available} left` : `${t.available} available`)}
                    </small>
                  </div>
                  <div className="ticket-option-bottom">
                    <span>{price(t.price_kzt)}</span>
                    {!assigned && <div className="quantity-control">
                      <button
                        disabled={!quantity}
                        onClick={() =>
                          setQuantities((q) => ({ ...q, [t.id]: Math.max(0, (q[t.id] ?? 0) - 1) }))
                        }
                        aria-label={`Remove one ${t.name} ticket`}
                      >
                        <Icon name="minus" size={14} />
                      </button>
                      <output aria-label={`${t.name} quantity`}>{quantity}</output>
                      <button
                        disabled={!!block || quantity >= limit}
                        onClick={() =>
                          setQuantities((q) => ({ ...q, [t.id]: Math.min(limit, (q[t.id] ?? 0) + 1) }))
                        }
                        aria-label={`Add one ${t.name} ticket`}
                      >
                        <Icon name="plus" size={14} />
                      </button>
                    </div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="booking-total">
            <span>
              {count} {count === 1 ? "ticket" : "tickets"}
            </span>
            <strong>{count ? price(total) : "—"}</strong>
          </div>
          {promo && (
            <Notice>
              {promo.label} with {promo.name} — applied at checkout.
            </Notice>
          )}
          {assigned && !cancelled && !ended ? (
            <Link
              className="btn btn-primary btn-full"
              aria-disabled={!tickets.some((t) => !blocks[t.id])}
              href={`/checkout/${event.id}?seats=${promoSuffix}`}
            >
              Choose your seats
              <Icon name="arrow" size={16} />
            </Link>
          ) : count ? (
            <Link
              className="btn btn-primary btn-full"
              href={`/checkout/${event.id}?tickets=${encodeURIComponent(JSON.stringify(quantities))}${promoSuffix}`}
            >
              {total ? "Continue to checkout" : "Register for free"}
              <Icon name="arrow" size={16} />
            </Link>
          ) : (
            <button className="btn btn-primary btn-full" disabled>
              {cancelled ? "Event cancelled" : ended ? "This event has ended" : "Choose your tickets"}
            </button>
          )}
          <p className="booking-footnote">Your places are held for 10 minutes while you check out.</p>
        </aside>
      </div>
    </main>
  );
}

function CalendarMenu({ eventId }: { eventId: string }) {
  const [links, setLinks] = useState<{ google: string; outlook: string; yahoo: string } | null>(null);
  const [error, setError] = useState("");
  async function open() {
    if (links || error) return;
    try {
      setLinks(await api.events.calendarLinks(eventId));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Calendar links are not available.");
    }
  }
  return (
    <details className="calendar-menu" onToggle={(e) => e.currentTarget.open && void open()}>
      <summary className="btn btn-secondary btn-small">
        <Icon name="calendar" size={16} /> Add to calendar
      </summary>
      <div className="calendar-options">
        <a href={api.events.calendarFile(eventId)} download>
          Apple / other (.ics)
        </a>
        {links ? (
          <>
            <a href={links.google} target="_blank" rel="noreferrer">Google Calendar</a>
            <a href={links.outlook} target="_blank" rel="noreferrer">Outlook</a>
            <a href={links.yahoo} target="_blank" rel="noreferrer">Yahoo</a>
          </>
        ) : (
          <span className="muted">{error || "Loading…"}</span>
        )}
      </div>
    </details>
  );
}

function EventReport({ eventId }: { eventId: string }) {
  const { user, ready } = useSession();
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const reason = String(new FormData(form).get("reason")).trim();
    setBusy(true);
    setFeedback(null);
    try {
      await api.request(`/events/${eventId}/reports`, { body: { reason } });
      setFeedback({ message: "Thank you. The BiletFlow team will review this event.", error: false });
      form.reset();
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : "Could not send the report.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="event-report">
      <summary>Report this event</summary>
      {!ready ? null : user ? (
        <form className="stack-form" onSubmit={submit}>
          <label>
            What should the platform review?
            <textarea
              name="reason"
              required
              minLength={10}
              maxLength={1000}
              rows={3}
              placeholder="Misleading information, a suspected scam, a safety concern…"
            />
          </label>
          <button className="btn btn-secondary" disabled={busy}>
            {busy ? "Sending…" : "Send report"}
          </button>
          {feedback && <Notice error={feedback.error}>{feedback.message}</Notice>}
        </form>
      ) : (
        <p className="auth-switch">
          <Link href={`/sign-in?next=${encodeURIComponent(`/events/${eventId}`)}`}>
            Sign in to report this event
          </Link>
        </p>
      )}
    </details>
  );
}

function MissingEvent() {
  return (
    <main className="workspace">
      <EmptyState
        title="This one isn’t on the bill."
        description="The event may be a draft, private, or the link may have changed."
        href="/events"
        label="See what’s on"
      />
    </main>
  );
}
