"use client";

/** The tabs of an event's workspace (organizer-pages.tsx renders them). */

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { eventDate, eventTime, posterInfo, price, type ApiEvent, type TicketType } from "@/lib/events";
import type { Order } from "@/lib/orders";
import {
  ROLE_LABELS,
  fromLocalInputs,
  toLocalInputs,
  type Activation,
  type ActivityEntry,
  type Analytics,
  type Attendee,
  type Campaign,
  type CheckInStats,
  type SalesSummary,
  type StaffMember,
  type TicketStats,
  type TicketTypeStats,
  type VenueLayout,
} from "@/lib/organizer";
import { amount, failure, Stat, type EventContext } from "./organizer-pages";
import { useLoad, type Loaded } from "./use-load";
import { EmptyState, Icon, LoadingPage, Notice, Poster } from "./primitives";

function Loading<T>({ data, children }: { data: Loaded<T> & { reload: () => void }; children: (value: T) => React.ReactNode }) {
  if (data.status === "error" && !data.data)
    return (
      <Notice error>
        {data.error.message}{" "}
        <button className="text-link" onClick={data.reload}>Try again</button>
      </Notice>
    );
  if (data.data === undefined) return <LoadingPage />;
  return <>{children(data.data)}</>;
}

const when = (iso: string, event: ApiEvent) =>
  `${eventDate(iso, event.timezone, { day: "numeric", month: "short", year: "numeric" })}, ${eventTime(iso, event.timezone)}`;

/* ------------------------------ Overview ------------------------------ */

export function OverviewTab({ ctx }: { ctx: EventContext }) {
  const { event } = ctx;
  const data = useLoad(`overview:${event.id}:${event.status}`, async (signal) => {
    const [stats, sales, checkin, activation, staff] = await Promise.all([
      api.request<TicketStats>(`/events/${event.id}/ticket-stats`, { signal }),
      api.request<SalesSummary>(`/events/${event.id}/sales`, { signal }),
      api.request<CheckInStats>(`/events/${event.id}/check-in/stats`, { signal }),
      api.request<Activation>(`/events/${event.id}/activation`, { signal }).catch(() => null),
      api.request<StaffMember[]>(`/events/${event.id}/staff`, { signal }).catch(() => [] as StaffMember[]),
    ]);
    return { stats, sales, checkin, activation, staff };
  });
  return (
    <Loading data={data}>
      {({ stats, sales, checkin, activation, staff }) => {
        const paid = stats.ticket_types.some((t) => t.price_kzt > 0);
        const checklist: [string, string, boolean][] = [
          ["The event details", "A name, a date, and a place to be.", !!event.venue_name],
          ["Your ticket types", `${stats.ticket_types.length} ${stats.ticket_types.length === 1 ? "way" : "ways"} to join.`, stats.ticket_types.length > 0],
          ["Published", "Let people discover your event.", event.status === "published"],
          ...(paid
            ? ([["Paid sales open", "Finish the activation checklist under Paid sales.", event.paid_sales_open]] as [string, string, boolean][])
            : []),
          ["A team at the door", "Add check-in staff under Team.", staff.some((s) => s.role !== "owner")],
        ];
        return (
          <>
            <div className="stats-row">
              <Stat label="Gross sales" value={amount(sales.gross_sales_kzt)} note={`Estimated payout ${amount(sales.estimated_payout_kzt)} (simulated)`} icon="chart" />
              <Stat label="Tickets sold" value={`${stats.totals.sold} / ${stats.totals.quantity}`} note={`${stats.totals.available} available · ${stats.totals.reserved} in checkouts`} icon="ticket" />
              <Stat label="Through the door" value={checkin.checked_in} note={`${checkin.remaining} guests still to arrive`} icon="users" />
            </div>
            <div className="event-overview-grid">
              <div>
                <Poster event={posterInfo(event)} />
                <p className="muted overview-caption">
                  {[event.venue_name, event.city].filter(Boolean).join(" · ")} · {event.visibility}
                </p>
                <ImagesEditor ctx={ctx} />
              </div>
              <div className="launch-checklist">
                <h2>Before the doors open</h2>
                <p className="muted">
                  {activation?.status === "suspended"
                    ? `Paid sales were suspended by the platform: ${activation.suspension_reason ?? "no reason given"}.`
                    : "A few things to have in place."}
                </p>
                {checklist.map(([title, description, done]) => (
                  <div className="checklist-item" key={title}>
                    <span className={done ? "done" : ""}>
                      <Icon name={done ? "check" : "minus"} size={14} />
                    </span>
                    <div>
                      <strong>{title}</strong>
                      <p>{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        );
      }}
    </Loading>
  );
}

function ImagesEditor({ ctx }: { ctx: EventContext }) {
  const { event } = ctx;
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const images = useLoad(`images:${event.id}:${version}`, (signal) =>
    api.request<{ id: string; url: string }[]>(`/events/${event.id}/images`, { signal }),
  );
  async function upload(file: File) {
    const form = new FormData();
    form.append("file", file);
    setBusy(true);
    try {
      await api.request(`/events/${event.id}/images`, { method: "POST", form });
      ctx.reload();
      setVersion((v) => v + 1);
      ctx.notify("Image added. The first image is the cover.");
    } catch (e) {
      ctx.notify(failure(e, "Could not upload the image."), true);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    try {
      await api.request(`/events/${event.id}/images/${id}`, { method: "DELETE" });
      ctx.reload();
      setVersion((v) => v + 1);
    } catch (e) {
      ctx.notify(failure(e), true);
    }
  }
  return (
    <div className="image-editor">
      <div className="image-thumbs">
        {images.data?.map((image) => (
          <figure key={image.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url.replace(/^(?:https?:\/\/[^/]+)?\/api\/v1/, "/api/backend")} alt="" />
            <button className="icon-button" aria-label="Remove image" onClick={() => remove(image.id)}>
              <Icon name="close" size={14} />
            </button>
          </figure>
        ))}
      </div>
      <label className="btn btn-secondary btn-small">
        <Icon name="plus" size={14} /> {busy ? "Uploading…" : "Add an image"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </label>
      <p className="field-hint">JPEG, PNG or WebP, up to 5 MB, 10 per event.</p>
    </div>
  );
}

/* ------------------------------ Tickets ------------------------------ */

export function TicketsTab({ ctx }: { ctx: EventContext }) {
  const { event } = ctx;
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const stats = useLoad(`ticket-stats:${event.id}:${version}`, (signal) =>
    api.request<TicketStats>(`/events/${event.id}/ticket-stats`, { signal }),
  );
  const refresh = () => setVersion((v) => v + 1);
  if (event.seating_type === "assigned") return <SeatingSetup ctx={ctx} stats={stats.data} onDone={refresh} />;
  return (
    <Loading data={stats}>
      {(s) => (
        <>
          <div className="ticket-types-list">
            {s.ticket_types.map((t) =>
              editing === t.id ? (
                <TicketTypeForm key={t.id} ctx={ctx} existing={t} onDone={() => { setEditing(null); refresh(); }} />
              ) : (
                <div className="ticket-type-row" key={t.id}>
                  <Icon name="ticket" size={24} />
                  <div>
                    <h3>
                      {t.name} {t.is_hidden && <small className="status-badge">Hidden</small>}
                    </h3>
                    <p>
                      {t.description}
                      {t.sale_start && ` · on sale from ${when(t.sale_start, event)}`}
                      {t.sale_end && ` · until ${when(t.sale_end, event)}`}
                      {` · up to ${t.max_per_order} per order`}
                    </p>
                  </div>
                  <strong>{price(t.price_kzt)}</strong>
                  <span>
                    {t.sold} sold · {t.reserved} held · {t.available} left of {t.quantity}
                  </span>
                  <button className="text-button" onClick={() => setEditing(t.id)}>Edit</button>
                </div>
              ),
            )}
          </div>
          <p className="muted">
            {s.totals.quantity} of {s.capacity} places assigned to ticket types.
          </p>
          {editing === "new" ? (
            <TicketTypeForm ctx={ctx} onDone={() => { setEditing(null); refresh(); }} />
          ) : (
            <button className="btn btn-secondary" onClick={() => setEditing("new")}>
              <Icon name="plus" size={16} /> Add ticket type
            </button>
          )}
        </>
      )}
    </Loading>
  );
}

function TicketTypeForm({ ctx, existing, onDone }: { ctx: EventContext; existing?: TicketTypeStats; onDone: () => void }) {
  const { event } = ctx;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const start = toLocalInputs(existing?.sale_start);
  const end = toLocalInputs(existing?.sale_end);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const text = (k: string) => String(d.get(k) ?? "").trim();
    const body = {
      name: text("name"),
      description: text("description") || null,
      price_kzt: Number(d.get("price")),
      quantity: Number(d.get("quantity")),
      max_per_order: Number(d.get("max_per_order")),
      sale_start: fromLocalInputs(text("start_date"), text("start_time") || "00:00"),
      sale_end: fromLocalInputs(text("end_date"), text("end_time") || "23:59"),
      is_hidden: d.get("is_hidden") === "on",
    };
    setBusy(true);
    setError("");
    try {
      if (existing) await api.request(`/ticket-types/${existing.id}`, { method: "PATCH", body });
      else await api.request(`/events/${event.id}/ticket-types`, { body });
      ctx.notify(existing ? "Ticket type saved." : "Ticket type added.");
      onDone();
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!existing) return;
    setBusy(true);
    try {
      await api.request(`/ticket-types/${existing.id}`, { method: "DELETE" });
      ctx.notify("Ticket type removed.");
      onDone();
    } catch (err) {
      setError(failure(err));
      setBusy(false);
    }
  }
  return (
    <form className="ticket-type-form stack-form" onSubmit={submit}>
      <div className="form-two">
        <label>
          Ticket name
          <input name="name" defaultValue={existing?.name} required minLength={2} maxLength={100} />
        </label>
        <label>
          What&apos;s included <span className="optional">Optional</span>
          <input name="description" defaultValue={existing?.description ?? ""} maxLength={500} />
        </label>
      </div>
      <div className="form-two">
        <label>
          Price · KZT
          <input name="price" type="number" min={0} defaultValue={existing?.price_kzt ?? 0} required />
          {existing && existing.sold > 0 && <span className="field-hint">Orders already placed keep their price</span>}
        </label>
        <label>
          Quantity
          <input name="quantity" type="number" min={Math.max(1, (existing?.sold ?? 0) + (existing?.reserved ?? 0))} defaultValue={existing?.quantity ?? 50} required />
        </label>
      </div>
      <div className="form-two">
        <label>
          Sales start <span className="optional">Optional</span>
          <span className="form-inline">
            <input name="start_date" type="date" defaultValue={start.date} />
            <input name="start_time" type="time" defaultValue={start.time} />
          </span>
        </label>
        <label>
          Sales end <span className="optional">Optional</span>
          <span className="form-inline">
            <input name="end_date" type="date" defaultValue={end.date} />
            <input name="end_time" type="time" defaultValue={end.time} />
          </span>
        </label>
      </div>
      <div className="form-two">
        <label>
          Most per order
          <input name="max_per_order" type="number" min={1} max={100} defaultValue={existing?.max_per_order ?? 10} required />
        </label>
        <label className="checkbox-label">
          <input name="is_hidden" type="checkbox" defaultChecked={existing?.is_hidden} /> Hidden (for guest lists and comps)
        </label>
      </div>
      {error && <Notice error>{error}</Notice>}
      <div className="button-row">
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save ticket type"}</button>
        <button type="button" className="btn btn-secondary" onClick={onDone}>Cancel</button>
        {existing && existing.sold + existing.reserved === 0 && (
          <button type="button" className="text-button danger" onClick={remove} disabled={busy}>
            Remove
          </button>
        )}
      </div>
    </form>
  );
}

function SeatingSetup({ ctx, stats, onDone }: { ctx: EventContext; stats?: TicketStats; onDone: () => void }) {
  const { event } = ctx;
  const layouts = useLoad("venue-layouts", (signal) => api.request<VenueLayout[]>("/venue-layouts", { signal }));
  const [venue, setVenue] = useState(event.venue_layout_id ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = layouts.data?.find((l) => l.id === (venue || layouts.data?.[0]?.id));
  const configured = !!event.venue_layout_id && (stats?.ticket_types.length ?? 0) > 0;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!chosen) return;
    const d = new FormData(e.currentTarget);
    const categories = Object.keys(chosen.categories).map((c) => ({
      category: c,
      name: String(d.get(`name_${c}`)).trim(),
      price_kzt: Number(d.get(`price_${c}`)),
      max_per_order: Number(d.get(`max_${c}`)),
    }));
    setBusy(true);
    setError("");
    try {
      await api.request(`/events/${event.id}/seating`, { body: { venue_id: chosen.id, categories } });
      ctx.reload();
      onDone();
      ctx.notify("Seating saved. Each seat category is now a ticket type.");
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>Numbered seats</h2>
          <p className="muted">Choose the hall, then name and price each seat category. Guests pick their seats on a map.</p>
        </div>
      </div>
      {configured && stats && (
        <div className="ticket-types-list">
          {stats.ticket_types.map((t) => (
            <div className="ticket-type-row" key={t.id}>
              <Icon name="ticket" size={24} />
              <div>
                <h3>{t.name}</h3>
                <p>Category {t.seat_category}</p>
              </div>
              <strong>{price(t.price_kzt)}</strong>
              <span>
                {t.sold} sold · {t.available} left of {t.quantity}
              </span>
            </div>
          ))}
        </div>
      )}
      <Loading data={layouts}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState title="No venue layouts yet." description="A platform admin adds halls with numbered seats." />
          ) : (
            <form className="stack-form" onSubmit={submit}>
              <label>
                Venue
                <select value={chosen?.id} onChange={(e) => setVenue(e.target.value)} disabled={configured && (stats?.totals.sold ?? 0) > 0}>
                  {list.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.city ? `, ${l.city}` : ""} · {l.total_seats} seats
                    </option>
                  ))}
                </select>
              </label>
              {chosen &&
                Object.entries(chosen.categories).map(([category, seats]) => {
                  const current = stats?.ticket_types.find((t) => t.seat_category === category);
                  return (
                    <div className="form-three" key={`${chosen.id}-${category}`}>
                      <label>
                        Category {category} · {seats} seats
                        <input name={`name_${category}`} defaultValue={current?.name ?? `Category ${category}`} required minLength={2} maxLength={100} />
                      </label>
                      <label>
                        Price · KZT
                        <input name={`price_${category}`} type="number" min={0} defaultValue={current?.price_kzt ?? 5000} required />
                      </label>
                      <label>
                        Most per order
                        <input name={`max_${category}`} type="number" min={1} max={20} defaultValue={current?.max_per_order ?? 10} required />
                      </label>
                    </div>
                  );
                })}
              {error && <Notice error>{error}</Notice>}
              <button className="btn btn-primary" disabled={busy}>
                {busy ? "Saving…" : configured ? "Update seating" : "Set up seating"}
              </button>
            </form>
          )
        }
      </Loading>
    </section>
  );
}

/* ------------------------------ Paid sales ------------------------------ */

export function PaidSalesTab({ ctx }: { ctx: EventContext }) {
  const { event, role } = ctx;
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState("");
  const data = useLoad(`activation:${event.id}:${version}`, (signal) =>
    api.request<Activation>(`/events/${event.id}/activation`, { signal }),
  );
  async function step(kind: string, path: string, body: unknown, done: string) {
    setBusy(kind);
    try {
      await api.request(`/events/${event.id}/activation/${path}`, { body });
      setVersion((v) => v + 1);
      if (kind === "activate") ctx.reload();
      ctx.notify(done);
    } catch (e) {
      ctx.notify(failure(e), true);
    } finally {
      setBusy("");
    }
  }
  return (
    <Loading data={data}>
      {(a) => (
        <section>
          <div className="sales-switch">
            <div>
              <span className="eyebrow">Box office</span>
              <h2>Paid ticket sales</h2>
              <p>
                {a.status === "active"
                  ? "Paid sales are open. Guests can buy paid tickets (payments are simulated)."
                  : a.status === "suspended"
                    ? `Suspended by the platform: ${a.suspension_reason ?? "no reason given"}. Contact platform support.`
                    : "Free registration works now. Paid tickets open once every step below is done."}
              </p>
            </div>
            <span className={`status-badge ${a.status === "active" ? "status-live" : ""}`}>{a.status}</span>
          </div>
          <div className="launch-checklist">
            {a.checklist.map((entry) => (
              <div className="checklist-item" key={entry.item}>
                <span className={entry.done ? "done" : ""}>
                  <Icon name={entry.done ? "check" : "minus"} size={14} />
                </span>
                <div>
                  <strong>{entry.label}</strong>
                  {!entry.done && (
                    <p>
                      {entry.item === "paid_ticket_type" && "Add a ticket type with a price under Tickets."}
                      {entry.item === "identity_verified" && (
                        <>Submit your legal name and IIN/BIN on your <Link className="text-link" href="/organizer?view=profile">organizer profile</Link>; the platform team confirms it.</>
                      )}
                      {entry.item === "payout_account" && (
                        <>Add the bank account for payouts on your <Link className="text-link" href="/organizer?view=profile">organizer profile</Link>.</>
                      )}
                      {entry.item === "activation_fee_paid" && (
                        <button className="btn btn-small btn-secondary" disabled={!!busy || role !== "owner"} onClick={() => step("fee", "pay-fee", { outcome: "success" }, "Activation fee paid (simulated).")}>
                          {busy === "fee" ? "Paying…" : `Pay the ${amount(a.fee_kzt)} fee (simulated)`}
                        </button>
                      )}
                      {entry.item === "terms_accepted" && (
                        <button className="btn btn-small btn-secondary" disabled={!!busy || role !== "owner"} onClick={() => step("terms", "accept-terms", { terms_version: a.terms_version }, "Organizer terms accepted.")}>
                          Accept the organizer terms ({a.terms_version})
                        </button>
                      )}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {a.status !== "active" && (
            <button
              className="btn btn-primary"
              disabled={!a.can_activate || !!busy || role !== "owner"}
              onClick={() => step("activate", "activate", {}, "Paid sales are open.")}
            >
              {busy === "activate" ? "Opening…" : "Open paid sales"}
            </button>
          )}
          {role !== "owner" && <p className="field-hint">Only the event owner can pay the fee, accept the terms and open paid sales.</p>}
        </section>
      )}
    </Loading>
  );
}

/* ------------------------------ Promotions ------------------------------ */

export function PromotionsTab({ ctx }: { ctx: EventContext }) {
  const { event } = ctx;
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const data = useLoad(`campaigns:${event.id}:${version}`, async (signal) => {
    const [campaigns, types] = await Promise.all([
      api.request<Campaign[]>(`/events/${event.id}/campaigns`, { signal }),
      api.request<TicketType[]>(`/events/${event.id}/ticket-types`, { signal, query: { include_hidden: true } }),
    ]);
    return { campaigns, types };
  });
  async function toggle(c: Campaign) {
    try {
      await api.request(`/events/${event.id}/campaigns/${c.id}`, { method: "PATCH", body: { is_active: !c.is_active } });
      setVersion((v) => v + 1);
    } catch (e) {
      ctx.notify(failure(e), true);
    }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const text = (k: string) => String(d.get(k) ?? "").trim();
    try {
      await api.request(`/events/${event.id}/campaigns`, {
        body: {
          name: text("name"),
          code: text("code") || null,
          discount_type: text("discount_type"),
          discount_value: Number(d.get("discount_value")),
          max_redemptions: text("max_redemptions") ? Number(text("max_redemptions")) : null,
          starts_at: fromLocalInputs(text("start_date"), "00:00"),
          ends_at: fromLocalInputs(text("end_date"), "23:59"),
          ticket_type_ids: d.getAll("ticket_type_ids").map(String),
        },
      });
      setAdding(false);
      setVersion((v) => v + 1);
      ctx.notify("Promo campaign created.");
    } catch (err) {
      ctx.notify(failure(err), true);
    }
  }
  return (
    <Loading data={data}>
      {({ campaigns, types }) => (
        <section>
          <div className="section-heading">
            <div>
              <h2>Promo codes and links</h2>
              <p className="muted">Each campaign has a code, a shareable link and a QR code for posters.</p>
            </div>
            {!adding && (
              <button className="btn btn-secondary" onClick={() => setAdding(true)}>
                <Icon name="plus" size={16} /> New campaign
              </button>
            )}
          </div>
          {adding && (
            <form className="stack-form" onSubmit={create}>
              <div className="form-two">
                <label>
                  Campaign name
                  <input name="name" required minLength={2} maxLength={100} placeholder="Student night" />
                </label>
                <label>
                  Code <span className="optional">Leave empty to generate one</span>
                  <input name="code" maxLength={32} pattern="[A-Za-z0-9_-]*" placeholder="STUDENT20" />
                </label>
              </div>
              <div className="form-three">
                <label>
                  Discount
                  <select name="discount_type" defaultValue="percent">
                    <option value="percent">Percent off</option>
                    <option value="fixed">Tenge off per order</option>
                  </select>
                </label>
                <label>
                  Amount
                  <input name="discount_value" type="number" min={1} defaultValue={10} required />
                </label>
                <label>
                  Uses <span className="optional">Optional</span>
                  <input name="max_redemptions" type="number" min={1} />
                </label>
              </div>
              <div className="form-two">
                <label>
                  From <span className="optional">Optional</span>
                  <input name="start_date" type="date" />
                </label>
                <label>
                  Until <span className="optional">Optional</span>
                  <input name="end_date" type="date" />
                </label>
              </div>
              <fieldset className="checkbox-group">
                <legend>Applies to (none ticked = every ticket type)</legend>
                {types.map((t) => (
                  <label key={t.id} className="checkbox-label">
                    <input type="checkbox" name="ticket_type_ids" value={t.id} /> {t.name} · {price(t.price_kzt)}
                  </label>
                ))}
              </fieldset>
              <div className="button-row">
                <button className="btn btn-primary">Create campaign</button>
                <button type="button" className="btn btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            </form>
          )}
          {campaigns.length ? (
            <div className="table-scroll">
              <table className="sales-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Discount</th>
                    <th>Used</th>
                    <th>Net revenue</th>
                    <th>Share</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.name}</strong>
                        <small>
                          <code>{c.code}</code> {c.is_active ? "" : "· paused"}
                        </small>
                      </td>
                      <td>{c.discount_label}</td>
                      <td>
                        {c.stats.redemptions}
                        {c.max_redemptions ? ` / ${c.max_redemptions}` : ""}
                      </td>
                      <td>{amount(c.stats.net_revenue_kzt)}</td>
                      <td>
                        <button className="text-link" onClick={() => void navigator.clipboard?.writeText(c.link_url).then(() => ctx.notify("Link copied."))}>
                          Copy link
                        </button>{" "}
                        · <a className="text-link" href={`/api/backend/events/${event.id}/campaigns/${c.id}/qr.png`} download>QR code</a>
                      </td>
                      <td>
                        <button className="text-button" onClick={() => toggle(c)}>{c.is_active ? "Pause" : "Resume"}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !adding && <EmptyState icon="ticket" title="No campaigns yet." description="Create a code for students, early birds or partners." />
          )}
        </section>
      )}
    </Loading>
  );
}

/* ------------------------------ Attendees ------------------------------ */

const TICKET_STATUS: Record<Attendee["status"], string> = {
  valid: "Not arrived",
  checked_in: "Checked in",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export function AttendeesTab({ ctx }: { ctx: EventContext }) {
  const { event, role } = ctx;
  const [version, setVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [refunding, setRefunding] = useState<string | null>(null);
  const data = useLoad(`attendees:${event.id}:${version}`, async (signal) => {
    const [attendees, orders] = await Promise.all([
      api.request<Attendee[]>(`/events/${event.id}/attendees`, { signal }),
      api.request<Order[]>(`/events/${event.id}/orders`, { signal }),
    ]);
    return { attendees, orders };
  });
  async function admit(ticketId: string) {
    try {
      const result = await api.request<{ admitted: boolean; message: string }>(`/events/${event.id}/check-in/tickets/${ticketId}`, { method: "POST" });
      ctx.notify(result.message, !result.admitted);
      setVersion((v) => v + 1);
    } catch (e) {
      ctx.notify(failure(e), true);
    }
  }
  async function refund(e: FormEvent<HTMLFormElement>, orderId: string) {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get("reason")).trim();
    try {
      await api.request(`/orders/${orderId}/refund`, { body: { reason } });
      setRefunding(null);
      setVersion((v) => v + 1);
      ctx.notify("Order refunded in full (simulated). The buyer was emailed.");
    } catch (err) {
      ctx.notify(failure(err), true);
    }
  }
  return (
    <Loading data={data}>
      {({ attendees, orders }) => {
        const q = search.toLowerCase();
        const visible = attendees.filter(
          (a) =>
            (filter === "all" || a.status === filter) &&
            `${a.attendee_name} ${a.attendee_email} ${a.ticket_id} ${a.order_id} ${a.seat ?? ""}`.toLowerCase().includes(q),
        );
        const paidOrders = orders.filter((o) => o.status === "confirmed" && o.total_kzt > 0);
        return (
          <section>
            <div className="section-heading">
              <div>
                <h2>The guest list</h2>
                <p className="muted">One ticket, one check-in. Search by name, email, seat or ticket reference.</p>
              </div>
              <button
                className="btn btn-secondary btn-small"
                onClick={() =>
                  downloadCsv(`attendees-${event.id.slice(0, 8)}.csv`, [
                    ["Ticket", "Order", "Name", "Email", "Ticket type", "Seat", "Status", "Checked in at"],
                    ...attendees.map((a) => [a.ticket_id, a.order_id, a.attendee_name, a.attendee_email, a.ticket_type_name, a.seat ?? "", TICKET_STATUS[a.status], a.checked_in_at ?? ""]),
                  ])
                }
              >
                <Icon name="download" size={14} /> Export CSV
              </button>
            </div>
            <div className="attendee-filters">
              <label className="search-input">
                <Icon name="search" size={17} />
                <input aria-label="Search attendees" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, seat or ticket reference" />
              </label>
              <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Ticket status">
                <option value="all">All tickets ({attendees.length})</option>
                <option value="valid">Not arrived</option>
                <option value="checked_in">Checked in</option>
                <option value="cancelled">Cancelled</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
            {visible.length ? (
              <div className="attendee-list">
                {visible.map((a) => (
                  <article key={a.ticket_id} className="attendee-row">
                    <div className="attendee-person">
                      <span className="avatar">{a.attendee_name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</span>
                      <div>
                        <h3>{a.attendee_name}</h3>
                        <p>{a.attendee_email}</p>
                        <code>{a.ticket_id.slice(0, 8).toUpperCase()}</code>
                      </div>
                    </div>
                    <div className="attendee-tickets">
                      <div>
                        <span>
                          {a.ticket_type_name}
                          {a.seat && ` · ${a.seat}`}
                          <small>
                            {TICKET_STATUS[a.status]}
                            {a.checked_in_at && ` at ${eventTime(a.checked_in_at, event.timezone)}`}
                          </small>
                        </span>
                        {a.status === "valid" && (
                          <button className="btn btn-small btn-secondary" onClick={() => admit(a.ticket_id)}>
                            <Icon name="ticket" size={14} /> Check in
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon="users"
                title={attendees.length ? "No guests match this search." : "A guest list waiting to happen."}
                description={attendees.length ? "Try a different name or status." : "New bookings will appear here."}
              />
            )}
            {role === "owner" && paidOrders.length > 0 && (
              <>
                <div className="section-heading recent-orders-heading">
                  <h2>Refunds</h2>
                  <span className="muted">Full refunds only; money moves are simulated</span>
                </div>
                <div className="sales-orders">
                  {paidOrders.map((o) => (
                    <div key={o.id}>
                      <div>
                        <strong>{o.buyer_name}</strong>
                        <small>
                          {o.id.slice(0, 8).toUpperCase()} · {o.tickets.length} tickets · {when(o.created_at, event)}
                        </small>
                      </div>
                      <strong>{amount(o.total_kzt)}</strong>
                      {refunding === o.id ? (
                        <form className="cancel-order" onSubmit={(e) => refund(e, o.id)}>
                          <input name="reason" required minLength={3} maxLength={500} placeholder="Reason (sent to the buyer)" aria-label="Refund reason" />
                          <button className="text-button danger">Refund</button>
                          <button type="button" className="text-button" onClick={() => setRefunding(null)}>Keep</button>
                        </form>
                      ) : (
                        <button className="text-button muted" onClick={() => setRefunding(o.id)}>Refund order</button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        );
      }}
    </Loading>
  );
}

/* ------------------------------ Sales & analytics ------------------------------ */

export function SalesTab({ ctx }: { ctx: EventContext }) {
  const { event } = ctx;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const data = useLoad(`analytics:${event.id}:${from}:${to}`, (signal) =>
    api.request<Analytics>(`/events/${event.id}/analytics`, {
      signal,
      query: { date_from: fromLocalInputs(from, "00:00"), date_to: fromLocalInputs(to, "23:59") },
    }),
  );
  return (
    <section>
      <div className="attendee-filters">
        <label>
          From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Until <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <Loading data={data}>
        {(a) => {
          const peak = Math.max(1, ...a.sales_over_time.map((d) => d.revenue_kzt));
          return (
            <>
              <div className="stats-row">
                <Stat label="Net revenue" value={amount(a.revenue.net_revenue_kzt)} note={`Gross ${amount(a.revenue.gross_sales_kzt)} · discounts ${amount(a.revenue.discounts_kzt)} · refunds ${amount(a.revenue.refunds_kzt)}`} icon="chart" />
                <Stat label="Sold" value={`${a.capacity.percent_sold}%`} note={`${a.capacity.tickets_sold} of ${a.capacity.capacity} · ${a.capacity.tickets_remaining} left`} icon="ticket" />
                <Stat label="Attendance" value={`${a.attendance.checked_in_percent}%`} note={`${a.attendance.checked_in} checked in · ${a.attendance.absent} absent`} icon="users" />
              </div>
              <div className="section-heading">
                <h2>Sales over time</h2>
                <span className="muted">Revenue per day</span>
              </div>
              {a.sales_over_time.length ? (
                <div className="sales-bars" role="img" aria-label="Revenue per day">
                  {a.sales_over_time.map((d) => (
                    <div key={d.date} title={`${d.date}: ${amount(d.revenue_kzt)}, ${d.tickets} tickets`}>
                      <span style={{ height: `${Math.max(4, (d.revenue_kzt / peak) * 100)}%` }} />
                      <small>{d.date.slice(5)}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No sales in this period.</p>
              )}
              <div className="section-heading">
                <h2>By ticket type</h2>
              </div>
              <div className="table-scroll">
                <table className="sales-table">
                  <thead>
                    <tr>
                      <th>Ticket type</th>
                      <th>Sold</th>
                      <th>Checked in</th>
                      <th>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.by_ticket_type.map((t) => (
                      <tr key={t.ticket_type_id}>
                        <td>
                          <strong>{t.name}</strong>
                          <small>{price(t.price_kzt)} · {t.quantity} places</small>
                        </td>
                        <td>{t.tickets_sold}</td>
                        <td>{t.checked_in}</td>
                        <td>{amount(t.revenue_kzt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {a.campaigns.length > 0 && (
                <>
                  <div className="section-heading">
                    <h2>Promo campaigns</h2>
                  </div>
                  <div className="table-scroll">
                    <table className="sales-table">
                      <tbody>
                        {a.campaigns.map((c) => (
                          <tr key={c.campaign_id}>
                            <td><strong>{c.name}</strong><small>{c.code}</small></td>
                            <td>{c.redemptions} uses</td>
                            <td>{c.tickets_sold} tickets</td>
                            <td>{amount(c.net_revenue_kzt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {a.is_simulated && <p className="order-note">Payments are simulated; no real money was collected.</p>}
            </>
          );
        }}
      </Loading>
    </section>
  );
}

/* ------------------------------ Team ------------------------------ */

export function TeamTab({ ctx }: { ctx: EventContext }) {
  const { event, role } = ctx;
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const staff = useLoad(`staff:${event.id}:${version}`, (signal) => api.request<StaffMember[]>(`/events/${event.id}/staff`, { signal }));
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    setError("");
    try {
      await api.request(`/events/${event.id}/staff`, { body: { email: String(d.get("email")).trim(), role: d.get("role") } });
      form.reset();
      setVersion((v) => v + 1);
      ctx.notify("Team member added. They see this event the next time they sign in.");
    } catch (err) {
      setError(failure(err));
    }
  }
  async function remove(member: StaffMember) {
    try {
      await api.request(`/events/${event.id}/staff/${member.user_id}`, { method: "DELETE" });
      setVersion((v) => v + 1);
      ctx.notify(`${member.full_name} no longer works on this event.`);
    } catch (err) {
      ctx.notify(failure(err), true);
    }
  }
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>Good people at the door.</h2>
          <p className="muted">Add people by the email of their BiletFlow account. Managers can run the event; check-in staff only scan tickets.</p>
        </div>
      </div>
      <div className="team-layout">
        <div className="team-list">
          <Loading data={staff}>
            {(list) =>
              list.map((member) => (
                <div className="team-member" key={member.id}>
                  <span className="avatar">{member.full_name[0]}</span>
                  <div>
                    <strong>{member.full_name}</strong>
                    <p>{member.email}</p>
                    <small>{ROLE_LABELS[member.role]}</small>
                  </div>
                  {member.role !== "owner" && (role === "owner" || member.role !== "manager") && (
                    <button className="icon-button" aria-label={`Remove ${member.full_name}`} onClick={() => remove(member)}>
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>
              ))
            }
          </Loading>
        </div>
        <form onSubmit={add} className="stack-form team-add">
          <h3>Add a team member</h3>
          <label>
            Email of their BiletFlow account
            <input name="email" type="email" required maxLength={255} placeholder="teammate@example.com" />
          </label>
          <label>
            Role
            <select name="role" defaultValue="checkin_staff">
              <option value="checkin_staff">Check-in staff</option>
              <option value="support_staff">Support staff (answers guest questions)</option>
              {role === "owner" && <option value="manager">Manager</option>}
            </select>
          </label>
          {error && <Notice error>{error}</Notice>}
          <button className="btn btn-primary" type="submit">
            <Icon name="plus" size={16} /> Add to the team
          </button>
        </form>
      </div>
    </section>
  );
}

/* ------------------------------ Activity ------------------------------ */

export function ActivityTab({ ctx }: { ctx: EventContext }) {
  const { event } = ctx;
  const [area, setArea] = useState("");
  const log = useLoad(`activity:${event.id}:${area}`, (signal) =>
    api.request<ActivityEntry[]>(`/events/${event.id}/activity`, { signal, query: { area: area || undefined, limit: 100 } }),
  );
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>Event history</h2>
          <p className="muted">Who changed what, and when. Entries cannot be edited or deleted.</p>
        </div>
        <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Filter history">
          <option value="">Everything</option>
          <option value="event">Event details</option>
          <option value="ticket_type">Ticket types</option>
          <option value="order">Orders</option>
          <option value="payment">Payments</option>
          <option value="refund">Refunds</option>
          <option value="staff">Team</option>
          <option value="activation">Paid sales</option>
          <option value="check_in">Check-in</option>
          <option value="promo">Promotions</option>
          <option value="support">Support</option>
        </select>
      </div>
      <Loading data={log}>
        {(entries) =>
          entries.length ? (
            <ol className="activity-log">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <time>{when(entry.created_at, event)}</time>
                  <p>
                    <strong>{entry.actor_name ?? "BiletFlow"}</strong> {entry.description}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">Nothing recorded yet.</p>
          )
        }
      </Loading>
    </section>
  );
}
