"use client";

/**
 * Checkout, My tickets and the order page, backed by the BiletFlow API.
 * Payments are simulated by the backend: no card details are asked for.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { api } from "@/lib/api";
import {
  eventDate,
  eventTime,
  posterInfo,
  price,
  venueLine,
  zoneName,
  type ApiEvent,
  type TicketType,
} from "@/lib/events";
import {
  ORDER_STATUS_LABEL,
  TICKET_STATUS_LABEL,
  holdLeft,
  orderTab,
  parseSelection,
  ticketCount,
  type Order,
  type Quote,
  type Seat,
  type SeatMap,
  type Selection,
  type TicketDetail,
} from "@/lib/orders";
import { useSession } from "./session-provider";
import { SupportLink } from "./support-pages";
import { useLoad } from "./use-load";
import { EmptyState, Gate, Icon, LoadingPage, Notice, PageIntro, Poster } from "./primitives";

const failure = (error: unknown, fallback = "Something went wrong. Please try again.") =>
  error instanceof Error && error.message ? error.message : fallback;

const longDate = (iso: string, zone: string) =>
  `${eventDate(iso, zone, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${eventTime(iso, zone)}`;

function LoadFailed({ message, retry }: { message: string; retry: () => void }) {
  return (
    <main className="workspace">
      <Notice error>
        {message}{" "}
        <button className="text-link" onClick={retry}>
          Try again
        </button>
      </Notice>
    </main>
  );
}

/* ------------------------------ checkout ------------------------------ */

type CheckoutData = { event: ApiEvent; tickets: TicketType[] };

export function CheckoutPage({
  id,
  tickets,
  seats,
  promo,
  link,
}: {
  id: string;
  tickets?: string;
  seats?: string;
  promo?: string;
  link?: string;
}) {
  const { user, ready } = useSession();
  const data = useLoad(`checkout-${id}`, async (signal) => {
    const [event, types] = await Promise.all([
      api.events.get(id, { signal }),
      api.events.ticketTypes(id, { signal }),
    ]);
    return { event, tickets: types } satisfies CheckoutData;
  });
  const back = `/checkout/${id}?${new URLSearchParams({
    ...(tickets ? { tickets } : {}),
    ...(seats ? { seats } : {}),
    ...(promo ? { promo } : {}),
    ...(link ? { link } : {}),
  })}`;

  if (data.status === "error" && data.httpStatus === 404) return <MissingEvent />;
  if (data.status === "error") return <LoadFailed message={data.error.message} retry={data.reload} />;
  if (!data.data || !ready) return <LoadingPage />;
  if (!user)
    return (
      <div className="workspace">
        <EmptyState
          title="Let’s put a name on your tickets."
          description="Sign in or create an account to book. Your tickets will wait for you in My tickets."
          href={`/sign-in?next=${encodeURIComponent(back)}`}
          label="Continue to sign in"
        />
      </div>
    );
  return (
    <Checkout
      {...data.data}
      initial={parseSelection(tickets, seats)}
      initialPromo={promo ?? ""}
      promoToken={link}
      buyer={{ name: user.full_name, email: user.email }}
    />
  );
}

function Checkout({
  event,
  tickets,
  initial,
  initialPromo,
  promoToken,
  buyer,
}: CheckoutData & {
  initial: Selection;
  initialPromo: string;
  promoToken?: string;
  buyer: { name: string; email: string };
}) {
  const router = useRouter();
  const assigned = event.seating_type === "assigned";
  const [selection, setSelection] = useState<Selection>(initial);
  const [pickingSeats, setPickingSeats] = useState(assigned && !initial.seat_ids.length);
  const [promoInput, setPromoInput] = useState(initialPromo);
  const [promoCode, setPromoCode] = useState(initialPromo);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [nameGuests, setNameGuests] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const count = ticketCount(selection);
  const selectionKey = JSON.stringify(selection);

  // A promo link (?link=token) fills in its code
  useEffect(() => {
    if (!promoToken) return;
    api.events
      .promoLink(promoToken)
      .then((found) => {
        if (found.event_id === event.id) {
          setPromoInput(found.code);
          setPromoCode(found.code);
        }
      })
      .catch(() => setQuoteError("That promo link is no longer valid."));
  }, [promoToken, event.id]);

  // Prices come from the backend, including any discount
  useEffect(() => {
    if (!count || pickingSeats) return;
    let live = true;
    api.events
      .quote(event.id, JSON.parse(selectionKey) as Selection, promoCode)
      .then((result) => live && (setQuote(result), setQuoteError("")))
      .catch((e: unknown) => live && (setQuote(null), setQuoteError(failure(e))));
    return () => {
      live = false;
    };
  }, [event.id, selectionKey, promoCode, count, pickingSeats]);

  if (pickingSeats)
    return (
      <SeatPicker
        event={event}
        names={Object.fromEntries(tickets.map((t) => [t.id, t.name]))}
        chosen={selection.seat_ids}
        onDone={(seat_ids) => {
          setSelection({ items: [], seat_ids });
          setPickingSeats(false);
        }}
      />
    );

  if (!count)
    return (
      <div className="workspace">
        <EmptyState
          title="Start with a ticket."
          description="Choose your ticket type and quantity before checking out."
          href={`/events/${event.id}`}
          label="Choose tickets"
        />
      </div>
    );

  const typeName = (ticketTypeId: string) =>
    tickets.find((t) => t.id === ticketTypeId)?.name ?? "Ticket";
  const guestLabels = selection.seat_ids.length
    ? selection.seat_ids.map((_, i) => `Seat ${i + 1}`)
    : selection.items.flatMap((item) =>
        Array.from({ length: item.quantity }, (_, i) => `${typeName(item.ticket_type_id)} · guest ${i + 1}`),
      );
  const total = quote?.total_kzt ?? 0;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const attendees = nameGuests
      ? guestLabels.map((_, i) => ({
          name: String(form.get(`guest-name-${i}`)).trim(),
          email: String(form.get(`guest-email-${i}`)).trim(),
        }))
      : undefined;
    setBusy(true);
    setError("");
    try {
      const order = await api.orders.create(event.id, selection, {
        promo_code: quote?.promo?.applied ? promoCode : undefined,
        attendees,
      });
      router.push(`/orders/${order.id}${order.status === "confirmed" ? "?confirmed=1" : ""}`);
    } catch (e) {
      setError(failure(e));
      setBusy(false);
    }
  }

  return (
    <main className="workspace narrow-workspace">
      <Link className="text-link muted back-link" href={`/events/${event.id}`}>
        <Icon name="back" size={15} />
        Back to the event
      </Link>
      <PageIntro
        eyebrow="Your next good night"
        title="Make it a date."
        description="Check the details, and you’re on the list."
      />
      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={submit}>
          <div className="section-heading">
            <span className="step-number">01</span>
            <h2>Who&apos;s coming?</h2>
          </div>
          <div className="stack-form">
            <p className="muted">
              Booking as <strong>{buyer.name}</strong> ({buyer.email}). Tickets are sent to this email
              and appear in My tickets.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={nameGuests}
                onChange={(e) => setNameGuests(e.target.checked)}
              />
              Put each guest&apos;s own name and email on their ticket
            </label>
            {nameGuests &&
              guestLabels.map((label, i) => (
                <fieldset className="guest-fields" key={label}>
                  <legend>{label}</legend>
                  <label>
                    Name
                    <input
                      name={`guest-name-${i}`}
                      required
                      minLength={2}
                      maxLength={100}
                      defaultValue={i === 0 ? buyer.name : ""}
                    />
                  </label>
                  <label>
                    Email
                    <input
                      name={`guest-email-${i}`}
                      type="email"
                      required
                      maxLength={200}
                      defaultValue={i === 0 ? buyer.email : ""}
                    />
                  </label>
                </fieldset>
              ))}
          </div>
          <div className="section-heading checkout-step">
            <span className="step-number">02</span>
            <h2>Promo code</h2>
          </div>
          <div className="promo-row">
            <input
              aria-label="Promo code"
              value={promoInput}
              maxLength={40}
              placeholder="Have a code?"
              onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
            />
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => setPromoCode(promoInput.trim())}
            >
              Apply
            </button>
            {promoCode && (
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setPromoInput("");
                  setPromoCode("");
                }}
              >
                Remove
              </button>
            )}
          </div>
          {quote?.promo && (
            <Notice error={!quote.promo.applied}>{quote.promo.message}</Notice>
          )}
          <div className="section-heading checkout-step">
            <span className="step-number">03</span>
            <h2>{total ? "Payment" : "Free registration"}</h2>
          </div>
          <div className="payment-preview">
            <Icon name="ticket" size={25} />
            <div>
              <strong>{total ? "Payment is simulated." : "Your place is free."}</strong>
              <p>
                {total
                  ? `Your places are held for 10 minutes while you pay ${price(total)}. BiletFlow is a study project: no card details are taken and no money moves.`
                  : "Confirm and your tickets are issued straight away."}
              </p>
            </div>
          </div>
          {quoteError && <Notice error>{quoteError}</Notice>}
          {error && <Notice error>{error}</Notice>}
          <button className="btn btn-primary btn-full" disabled={busy || !quote}>
            {busy ? "Reserving your places…" : total ? "Continue to payment" : "Complete registration"}
            <Icon name="arrow" size={17} />
          </button>
        </form>
        <aside className="order-summary">
          <Poster event={posterInfo(event)} compact />
          <div className="summary-body">
            <span className="eyebrow">Your night, at a glance</span>
            <h2>{event.title}</h2>
            <p className="muted">{longDate(event.start_at, event.timezone)}</p>
            <p className="muted">{venueLine(event)}</p>
            <div className="summary-lines">
              {quote ? (
                <>
                  {quote.lines.map((line) => (
                    <div key={line.ticket_type_id}>
                      <span>
                        {line.quantity} × {line.name}
                      </span>
                      <span>{price(line.subtotal_kzt)}</span>
                    </div>
                  ))}
                  {quote.discount_kzt > 0 && (
                    <div>
                      <span>Discount ({quote.promo?.code})</span>
                      <span>−{price(quote.discount_kzt)}</span>
                    </div>
                  )}
                  <div>
                    <span>Booking fee</span>
                    <span>₸0</span>
                  </div>
                </>
              ) : (
                <div>
                  <span>{quoteError ? "Prices unavailable" : "Working out prices…"}</span>
                </div>
              )}
            </div>
            <div className="booking-total">
              <span>Total · KZT</span>
              <strong>{quote ? price(quote.total_kzt) : "—"}</strong>
            </div>
            {assigned ? (
              <button className="text-link" onClick={() => setPickingSeats(true)}>
                Change seats
              </button>
            ) : (
              <Link className="text-link" href={`/events/${event.id}`}>
                Change tickets
              </Link>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

/* ------------------------------ seat map ------------------------------ */

function SeatPicker({
  event,
  names,
  chosen,
  onDone,
}: {
  event: ApiEvent;
  names: Record<string, string>;
  chosen: string[];
  onDone: (seatIds: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>(chosen);
  const [refresh, setRefresh] = useState(0);
  const map = useLoad(`seats-${event.id}-${refresh}`, (signal) => api.events.seatMap(event.id, { signal }));

  // Keep availability current while choosing
  useEffect(() => {
    const timer = setInterval(() => setRefresh((n) => n + 1), 20_000);
    return () => clearInterval(timer);
  }, []);

  const seats = useMemo(() => {
    const all = new Map<string, Seat>();
    map.data?.sections.forEach((s) => s.rows.forEach((r) => r.seats.forEach((seat) => all.set(seat.id, seat))));
    return all;
  }, [map.data]);
  // Seats taken by someone else since they were picked drop out
  const stillFree = picked.filter((id) => !seats.size || seats.get(id)?.status === "available");
  const total = stillFree.reduce((s, id) => s + (seats.get(id)?.price_kzt ?? 0), 0);

  function toggle(seat: Seat) {
    if (seat.status !== "available") return;
    setPicked((current) =>
      current.includes(seat.id)
        ? current.filter((id) => id !== seat.id)
        : current.length >= 20
          ? current
          : [...current, seat.id],
    );
  }

  return (
    <main className="workspace">
      <Link className="text-link muted back-link" href={`/events/${event.id}`}>
        <Icon name="back" size={15} />
        Back to the event
      </Link>
      <PageIntro
        eyebrow={map.data?.venue_name ?? "Choose your seats"}
        title="Pick your seats."
        description="Tap a seat to choose it, tap again to let it go. Up to 20 seats per order."
      />
      {map.status === "error" && !map.data && (
        <Notice error>{map.error.message}</Notice>
      )}
      {!map.data ? (
        map.status !== "error" && <div className="skeleton skeleton-panel" />
      ) : (
        <SeatGrid map={map.data} names={names} picked={stillFree} onToggle={toggle} />
      )}
      <div className="seat-footer">
        <span>
          {stillFree.length} {stillFree.length === 1 ? "seat" : "seats"} · {price(total)}
        </span>
        <button
          className="btn btn-primary"
          disabled={!stillFree.length}
          onClick={() => onDone(stillFree)}
        >
          Continue with these seats <Icon name="arrow" size={16} />
        </button>
      </div>
    </main>
  );
}

function SeatGrid({
  map,
  names,
  picked,
  onToggle,
}: {
  map: SeatMap;
  names: Record<string, string>;
  picked: string[];
  onToggle: (seat: Seat) => void;
}) {
  const categories = [...new Set(map.sections.flatMap((s) => s.rows.flatMap((r) => r.seats.map((x) => x.category))))];
  const prices = new Map<string, number | null>();
  const labels = new Map<string, string>();
  map.sections.forEach((s) =>
    s.rows.forEach((r) =>
      r.seats.forEach((x) => {
        prices.set(x.category, x.price_kzt);
        if (x.ticket_type_id && names[x.ticket_type_id]) labels.set(x.category, names[x.ticket_type_id]);
      }),
    ),
  );
  return (
    <div className="seat-map">
      <div className="seat-stage">Stage</div>
      <div className="seat-legend">
        {categories.map((c, i) => (
          <span key={c}>
            <i className={`seat seat-cat-${i % 4}`} /> {labels.get(c) ?? c} · {prices.get(c) != null ? price(prices.get(c)!) : "—"}
          </span>
        ))}
        <span>
          <i className="seat seat-taken" /> Taken
        </span>
        <span>
          <i className="seat seat-picked" /> Your choice
        </span>
      </div>
      {map.sections.map((section) => (
        <section key={section.name} className="seat-section" aria-label={section.name}>
          <h3>{section.name}</h3>
          {section.rows.map((row) => (
            <div className="seat-row" key={row.label}>
              <span className="seat-row-label">{row.label}</span>
              {row.seats.map((seat) => {
                const mine = picked.includes(seat.id);
                const cat = categories.indexOf(seat.category) % 4;
                return (
                  <button
                    key={seat.id}
                    type="button"
                    className={`seat seat-cat-${cat} ${mine ? "seat-picked" : ""} ${seat.status !== "available" ? "seat-taken" : ""}`}
                    disabled={seat.status !== "available"}
                    aria-pressed={mine}
                    aria-label={seat.label}
                    title={seat.label}
                    onClick={() => onToggle(seat)}
                  >
                    {seat.is_accessible ? "♿" : seat.number}
                  </button>
                );
              })}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/* ------------------------------ my tickets ------------------------------ */

type Tab = "upcoming" | "past" | "closed";

export function OrdersPage() {
  const { user, ready } = useSession();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [now] = useState(Date.now);
  const data = useLoad(user ? `orders-${user.id}` : "orders-none", async (signal) => {
    if (!user) return { orders: [] as Order[], shared: [] as TicketDetail[] };
    const [orders, tickets] = await Promise.all([
      api.orders.mine({ signal }),
      api.tickets.mine({ signal }),
    ]);
    const own = new Set(orders.map((o) => o.id));
    return { orders, shared: tickets.filter((t) => !own.has(t.order_id)) };
  });
  if (!ready) return <LoadingPage />;
  if (!user) return <Gate />;
  if (data.status === "error") return <LoadFailed message={data.error.message} retry={data.reload} />;
  if (!data.data) return <LoadingPage />;
  const orders = data.data.orders.filter((o) => orderTab(o, now) === tab);
  const shared = data.data.shared.filter((t) =>
    tab === "closed"
      ? t.status === "cancelled" || t.status === "refunded"
      : t.status !== "cancelled" &&
        t.status !== "refunded" &&
        (new Date(t.event.end_at).getTime() >= now) === (tab === "upcoming"),
  );
  return (
    <main className="workspace">
      <PageIntro
        eyebrow="Your plans, in one place"
        title="Good nights ahead."
        description={`The next chapter of your calendar, ${user.full_name.split(" ")[0]}.`}
        action={
          <Link className="btn btn-secondary" href="/events">
            Find your next event <Icon name="arrow" size={16} />
          </Link>
        }
      />
      <div className="line-tabs">
        {(["upcoming", "past", "closed"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === "upcoming" ? "Upcoming" : t === "past" ? "Past events" : "Cancelled & refunded"}
          </button>
        ))}
      </div>
      {orders.length ? (
        <div className="order-list">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} now={now} />
          ))}
        </div>
      ) : (
        !shared.length && (
          <EmptyState
            title={
              tab === "upcoming"
                ? "Your calendar has room for a good night."
                : tab === "past"
                  ? "The memories are still to come."
                  : "Nothing cancelled or refunded."
            }
            description={
              tab === "upcoming"
                ? "Pick an event you like. Your tickets will be waiting here."
                : "Orders in this category will appear here."
            }
            href="/events"
            label="Explore events"
          />
        )
      )}
      {shared.length > 0 && (
        <>
          <div className="section-heading tickets-section-heading">
            <h2>Tickets in your name</h2>
            <span className="muted">Booked for you by someone else.</span>
          </div>
          <div className="admission-grid">
            {shared.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function OrderCard({ order, now }: { order: Order; now: number }) {
  const count = order.items.reduce((s, i) => s + i.quantity, 0);
  const hold = order.status === "pending" ? holdLeft(order.expires_at, now) : null;
  return (
    <article className="order-card">
      <div className="order-card-body">
        <div className="order-card-top">
          <span className={`status-badge ${order.status === "confirmed" ? "status-live" : ""}`}>
            {order.status === "pending" && !hold ? "Hold ran out" : ORDER_STATUS_LABEL[order.status]}
          </span>
          <span className="order-reference">{order.id.slice(0, 8).toUpperCase()}</span>
        </div>
        <h2>
          <Link href={`/orders/${order.id}`}>{order.event_title}</Link>
        </h2>
        <p className="muted">{longDate(order.event_start_at, order.event_timezone)}</p>
        <div className="order-card-bottom">
          <span>
            {count} {count === 1 ? "ticket" : "tickets"}
            <span className="dot-separator">/</span>
            {price(order.total_kzt)}
          </span>
          <Link className="text-link" href={`/orders/${order.id}`}>
            {order.status === "pending" && hold ? "Finish payment" : "View order & tickets"}{" "}
            <Icon name="arrow" size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------ one order ------------------------------ */

function useQr(value: string | null) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    if (!value) return;
    let live = true;
    QRCode.toString(value, { type: "svg", errorCorrectionLevel: "M", margin: 2 }).then(
      (text) => live && setSvg(text),
      () => live && setSvg(""),
    );
    return () => {
      live = false;
    };
  }, [value]);
  return value ? svg : "";
}

function TicketCard({ ticket }: { ticket: TicketDetail }) {
  const qr = useQr(ticket.qr_payload);
  const usable = ticket.status === "valid";
  return (
    <article className={`admission-ticket ${usable ? "" : "admission-closed"}`}>
      <div className="admission-body">
        <span className="eyebrow">BILETFLOW / ADMIT ONE</span>
        <h3>{ticket.ticket_type_name}</h3>
        <p>
          {ticket.attendee_name}
          {ticket.seat && ` · ${ticket.seat.section}, row ${ticket.seat.row}, seat ${ticket.seat.number}`}
        </p>
        <p className="muted">
          {ticket.event.title} · {eventDate(ticket.event.start_at, ticket.event.timezone, { day: "numeric", month: "short" })},{" "}
          {eventTime(ticket.event.start_at, ticket.event.timezone)}
        </p>
        <div className="admission-code">
          {qr ? (
            <span
              className="qr-box"
              role="img"
              aria-label={`QR code for ticket ${ticket.id.slice(0, 8)}`}
              dangerouslySetInnerHTML={{ __html: qr }}
            />
          ) : (
            <span className="qr-box qr-empty" aria-hidden="true">
              <Icon name="ticket" size={30} />
            </span>
          )}
          <span>
            <strong>{TICKET_STATUS_LABEL[ticket.status]}</strong>
            <small>
              {usable ? "Show this code at the door." : "This ticket can no longer be used for entry."}
            </small>
          </span>
        </div>
        <code>{ticket.id.slice(0, 8).toUpperCase()}</code>
        <SupportLink
          eventId={ticket.event.id}
          orderId={ticket.order_id}
          ticketId={ticket.id}
          label="Get help with this ticket"
        />
      </div>
      {usable && (
        <a className="admission-download" href={api.tickets.pdf(ticket.id)} download>
          <Icon name="download" size={17} />
          Download ticket <span>PDF</span>
        </a>
      )}
    </article>
  );
}

export function OrderPage({ id, confirmed }: { id: string; confirmed?: boolean }) {
  const { user, ready } = useSession();
  const [version, setVersion] = useState(0);
  const data = useLoad(user ? `order-${id}-${version}` : "order-none", async (signal) => {
    if (!user) return null;
    const order = await api.orders.get(id, { signal });
    const tickets =
      order.status === "confirmed" || order.tickets.length
        ? (await api.tickets.mine({ signal })).filter((t) => t.order_id === id)
        : [];
    return { order, tickets };
  });
  if (!ready) return <LoadingPage />;
  if (!user) return <Gate />;
  if (data.status === "error" && [403, 404, 422].includes(data.httpStatus))
    return (
      <div className="workspace">
        <EmptyState
          title="We couldn’t find that order."
          description="It may belong to another account. Your own tickets are one click away."
          href="/orders"
          label="My tickets"
        />
      </div>
    );
  if (data.status === "error") return <LoadFailed message={data.error.message} retry={data.reload} />;
  if (!data.data) return <LoadingPage />;
  return (
    <OrderView
      key={version}
      {...data.data}
      confirmed={confirmed}
      isBuyer={data.data.order.user_id === user.id}
      onChange={() => setVersion((v) => v + 1)}
    />
  );
}

function OrderView({
  order,
  tickets,
  confirmed,
  isBuyer,
  onChange,
}: {
  order: Order;
  tickets: TicketDetail[];
  confirmed?: boolean;
  isBuyer: boolean;
  onChange: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = order.status === "pending";
  const hold = pending ? holdLeft(order.expires_at, now) : null;
  const free = order.total_kzt === 0;
  const upcoming = new Date(order.event_start_at).getTime() > now;
  const failedPayments = order.payments.filter((p) => p.status === "failed");

  // Count down the hold
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pending]);

  async function act(kind: string, action: () => Promise<unknown>, done?: string) {
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      await action();
      if (done) setNotice(done);
      onChange();
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="workspace narrow-workspace">
      <Link className="text-link muted back-link" href="/orders">
        <Icon name="back" size={15} />
        All orders
      </Link>
      {confirmed && order.status === "confirmed" && (
        <div className="confirmation-banner">
          <span className="confirmation-check">
            <Icon name="check" size={24} />
          </span>
          <div>
            <span className="eyebrow">You&apos;re on the list</span>
            <h2>That&apos;s a night to look forward to.</h2>
            <p>Your tickets are below and on their way to your inbox.</p>
          </div>
        </div>
      )}
      <PageIntro
        eyebrow={`Order / ${order.id.slice(0, 8).toUpperCase()}`}
        title={order.event_title}
        description={`${longDate(order.event_start_at, order.event_timezone)} · ${zoneName(order.event_timezone)}`}
      />
      {notice && <Notice>{notice}</Notice>}
      {error && <Notice error>{error}</Notice>}

      {pending && isBuyer && (
        <section className="payment-panel">
          {hold ? (
            <>
              <span className="eyebrow">Places held for {hold}</span>
              <h2>Pay {price(order.total_kzt)} to confirm.</h2>
              <p className="muted">
                Payment is simulated: no card details are taken and no money moves. Choose how the
                test payment should end.
              </p>
              {failedPayments.length > 0 && (
                <Notice error>
                  The last payment attempt failed
                  {failedPayments.at(-1)?.failure_reason ? `: ${failedPayments.at(-1)?.failure_reason}` : ""}. Your
                  places are still held.
                </Notice>
              )}
              <div className="button-row">
                <button
                  className="btn btn-primary"
                  disabled={!!busy}
                  onClick={() => act("pay", () => api.orders.pay(order.id), "Payment received. Your tickets are ready.")}
                >
                  {busy === "pay" ? "Paying…" : "Pay now (simulated)"}
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={!!busy}
                  onClick={() => act("fail", () => api.orders.pay(order.id, "failure"))}
                >
                  Simulate a declined card
                </button>
                <button
                  className="text-link"
                  disabled={!!busy}
                  onClick={() => act("cancel", () => api.orders.cancel(order.id), "Checkout cancelled. The places were released.")}
                >
                  Cancel checkout
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>Your hold ran out.</h2>
              <p className="muted">The places went back on sale. You can start again from the event page.</p>
              <Link className="btn btn-primary" href={`/events/${order.event_id}`}>
                Back to the event
              </Link>
            </>
          )}
        </section>
      )}

      <div className="order-detail-meta">
        <div>
          <small>Booked by</small>
          <strong>{order.buyer_name}</strong>
          <span>{order.buyer_email}</span>
        </div>
        <div>
          <small>Order total</small>
          <strong>{price(order.total_kzt)}</strong>
          <span>
            {order.discount_kzt > 0 && `${price(order.discount_kzt)} off with ${order.promo_code} · `}
            {eventDate(order.created_at, order.event_timezone, { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </div>
        <span className={`status-badge ${order.status === "confirmed" ? "status-live" : ""}`}>
          {pending && !hold ? "Hold ran out" : ORDER_STATUS_LABEL[order.status]}
        </span>
      </div>

      <div className="summary-lines order-lines">
        {order.items.map((item) => (
          <div key={item.id}>
            <span>
              {item.quantity} × {item.ticket_type_name}
              {item.seats?.length ? ` (${item.seats.join("; ")})` : ""}
            </span>
            <span>{price(item.subtotal_kzt)}</span>
          </div>
        ))}
      </div>

      {order.refund && (
        <Notice>
          Refunded {price(order.refund.amount_kzt)} on{" "}
          {eventDate(order.refund.created_at, order.event_timezone, { day: "numeric", month: "long" })}
          {order.refund.reason ? ` — ${order.refund.reason}` : ""}. The tickets are no longer valid.
          {order.refund.is_simulated && " (Simulated refund: no money moved.)"}
        </Notice>
      )}
      {order.status === "cancelled" && !order.refund && (
        <Notice>This order was cancelled. Its tickets are no longer valid.</Notice>
      )}
      {order.status === "expired" && <Notice>The checkout hold ran out before payment.</Notice>}

      <div className="button-row">
        <SupportLink eventId={order.event_id} orderId={order.id} label="Get help with this order" />
        {order.status === "confirmed" && upcoming && order.calendar_links?.google && (
          <a className="btn btn-secondary" href={order.calendar_links.google} target="_blank" rel="noreferrer">
            <Icon name="calendar" size={16} /> Google Calendar
          </a>
        )}
        {order.status === "confirmed" && upcoming && (
          <a className="btn btn-secondary" href={api.events.calendarFile(order.event_id)} download>
            <Icon name="calendar" size={16} /> Calendar file
          </a>
        )}
        {order.status === "confirmed" && isBuyer && tickets.length > 1 && (
          <a className="btn btn-secondary" href={api.orders.pdf(order.id)} download>
            <Icon name="download" size={16} /> All tickets (PDF)
          </a>
        )}
      </div>

      {tickets.length > 0 && (
        <>
          <div className="section-heading tickets-section-heading">
            <h2>Your tickets</h2>
            <span className="muted">Each guest has their own QR code.</span>
          </div>
          <div className="admission-grid">
            {tickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </div>
        </>
      )}

      {order.status === "confirmed" && isBuyer && upcoming && (
        <div className="order-note">
          {free ? (
            <details>
              <summary>Can’t make it? Cancel this registration</summary>
              <form
                className="stack-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const reason = String(new FormData(e.currentTarget).get("reason") ?? "").trim();
                  void act("unregister", () => api.orders.cancelRegistration(order.id, reason), "Your registration was cancelled.");
                }}
              >
                <label>
                  Reason (optional)
                  <input name="reason" maxLength={500} />
                </label>
                <button className="btn btn-secondary" disabled={!!busy}>
                  {busy === "unregister" ? "Cancelling…" : "Cancel registration"}
                </button>
              </form>
            </details>
          ) : (
            <p>
              Need a refund? Refunds for paid tickets are handled by the organizer.{" "}
              <Link className="text-link" href={`/support/new?event=${order.event_id}&order=${order.id}`}>
                Ask for a refund
              </Link>
            </p>
          )}
        </div>
      )}
    </main>
  );
}

function MissingEvent() {
  return (
    <main className="workspace">
      <EmptyState
        title="This one isn’t on the bill."
        description="The event may be a draft, or the link may have changed."
        href="/events"
        label="See what’s on"
      />
    </main>
  );
}
