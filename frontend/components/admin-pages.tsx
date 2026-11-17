"use client";

/**
 * Platform administration (SRS 4.12) on the backend: search, users,
 * organizer verification, events, money monitors, reports, activations,
 * escalated support, promo activity, settings, audit history and CSV exports.
 */

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/lib/api";
import {
  EXPORTS,
  type ActivationRecord,
  type AdminEvent,
  type AdminOrder,
  type AdminOrganizer,
  type AdminPayment,
  type AdminRefund,
  type AdminSearch,
  type AdminUser,
  type AuditRow,
  type Dispute,
  type EventReport,
  type PlatformSettings,
  type PromoActivity,
} from "@/lib/admin";
import { caseRef, CATEGORY_LABELS, type CaseSummary } from "@/lib/support";
import { useSession } from "./session-provider";
import { useLoad } from "./use-load";
import { EmptyState, Icon, LoadingPage, Notice, PageIntro } from "./primitives";
import "./admin.css";

type TableRow = { id: string; cells: ReactNode[] };

const VIEWS: [string, string][] = [
  ["overview", "Overview"],
  ["users", "Users"],
  ["organizers", "Organizer checks"],
  ["events", "Events"],
  ["orders", "Orders"],
  ["payments", "Payments"],
  ["reviews", "Event reports"],
  ["activations", "Paid-sales activations"],
  ["support", "Platform support"],
  ["promotions", "Promo codes"],
  ["settings", "Settings"],
  ["audit", "Activity history"],
];

const kzt = (value: number) => `₸${value.toLocaleString("en-US")}`;
const dateTime = (value: string) =>
  new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Almaty" });
const failure = (error: unknown) => (error instanceof Error && error.message ? error.message : "This change could not be saved.");

function Status({ value }: { value: string }) {
  const v = value.toLowerCase();
  const tone = ["suspended", "failed", "disputed", "rejected", "lost", "cancelled", "open"].includes(v)
    ? "danger"
    : ["paid", "succeeded", "active", "confirmed", "completed", "resolved", "won", "published", "verified", "actioned"].includes(v)
      ? "success"
      : "neutral";
  return <span className={`admin-badge admin-badge-${tone}`}>{value.replaceAll("_", " ")}</span>;
}

function RecordName({ title, reference }: { title: ReactNode; reference?: string }) {
  return (
    <span className="admin-record-name">
      {title}
      {reference && <small>{reference}</small>}
    </span>
  );
}

function DataTable({ caption, headings, rows, empty = "No matching records." }: { caption: string; headings: string[]; rows: TableRow[]; empty?: string }) {
  return rows.length ? (
    <div className="admin-table-scroll" role="region" aria-label={caption} tabIndex={0}>
      <table className="admin-table">
        <caption className="admin-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {headings.map((h) => (
              <th key={h} scope="col">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {row.cells.map((cell, i) => (
                <td key={i}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="admin-empty">{empty}</p>
  );
}

/** A list from the backend, with a loading state and errors in place. */
function Listed<T>({ data, children }: { data: { data?: T; status: string; error?: Error }; children: (value: T) => ReactNode }) {
  if (data.status === "error" && data.data === undefined) return <Notice error>{data.error?.message ?? "Could not load this list."}</Notice>;
  if (data.data === undefined) return <LoadingPage />;
  return <>{children(data.data)}</>;
}

function Stat({ label, value, href, detail }: { label: string; value: number | undefined; href: string; detail: string }) {
  return (
    <Link href={href} className="admin-stat">
      <span>
        {label}
        <Icon name="arrow" size={16} />
      </span>
      <strong>{value ?? "–"}</strong>
      <small>{detail}</small>
    </Link>
  );
}

/** A button that asks for a reason before it acts (suspensions and the like). */
function ReasonAction({
  label,
  confirm,
  minLength = 3,
  onConfirm,
}: {
  label: string;
  confirm: string;
  minLength?: number;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button className="btn btn-small btn-secondary" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <form
      className="admin-row-actions"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onConfirm(String(new FormData(e.currentTarget).get("reason")).trim());
        setBusy(false);
        setOpen(false);
      }}
    >
      <input name="reason" required minLength={minLength} maxLength={500} placeholder="Reason (the owner is told)" aria-label={`Reason to ${label.toLowerCase()}`} autoFocus />
      <button className="btn btn-small btn-primary" disabled={busy}>{confirm}</button>
      <button type="button" className="btn btn-small btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}

export function AdminPage({ view }: { view?: string }) {
  const { user, isAdmin, ready } = useSession();
  if (!ready) return <LoadingPage />;
  if (!user || !isAdmin)
    return (
      <main className="workspace">
        <EmptyState
          icon="users"
          title="Platform administration."
          description={user ? "This area is for the BiletFlow platform team." : "Sign in with a platform administrator account."}
          href={user ? "/" : "/sign-in?next=/admin"}
          label={user ? "Back to BiletFlow" : "Sign in"}
        />
      </main>
    );
  const current = VIEWS.some(([key]) => key === view) ? view! : "overview";
  return <AdminWorkspace key={current} view={current} me={user.id} />;
}

function AdminWorkspace({ view, me }: { view: string; me: string }) {
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("");
  const [version, setVersion] = useState(0);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [exportKind, setExportKind] = useState("orders");
  const k = `${view}:${q}:${filter}:${version}`;
  const get = <T,>(path: string, query: Record<string, string | number | boolean | undefined> = {}) => (signal: AbortSignal) =>
    api.request<T>(path, { signal, query: { limit: 100, ...query } });

  async function act(action: () => Promise<unknown>, message: string) {
    setFeedback(null);
    try {
      await action();
      setVersion((v) => v + 1);
      setFeedback({ message, error: false });
    } catch (e) {
      setFeedback({ message: failure(e), error: true });
    }
  }

  const searchable = ["overview", "users", "organizers", "events", "orders", "payments"].includes(view);
  const placeholder = view === "overview" ? "Search users, events, orders and payments (name, email or reference)…" : "Search names, emails or references…";

  return (
    <main className="workspace admin-workspace">
      <PageIntro
        eyebrow="BiletFlow / platform operations"
        title="A clear view of the whole house."
        description="Review activity, resolve exceptions and keep the platform running. Every action here is recorded in the activity history."
        action={
          <Link className="btn btn-secondary" href="/support">
            Support inbox <Icon name="arrow" size={16} />
          </Link>
        }
      />
      <nav className="admin-tabs" aria-label="Administration sections">
        {VIEWS.map(([key, label]) => (
          <Link key={key} href={`/admin?view=${key}`} aria-current={view === key ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      {feedback && <Notice error={feedback.error}>{feedback.message}</Notice>}
      {searchable && (
        <form
          className="admin-toolbar"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            setQ(draft.trim());
          }}
        >
          <label className="admin-search">
            <Icon name="search" size={18} />
            <span className="admin-visually-hidden">Search</span>
            <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} minLength={view === "overview" ? 2 : undefined} />
          </label>
          <button className="btn btn-small btn-secondary">Search</button>
          {q && (
            <button
              type="button"
              className="btn btn-small btn-secondary"
              onClick={() => {
                setDraft("");
                setQ("");
              }}
            >
              Clear
            </button>
          )}
        </form>
      )}

      {view === "overview" && <Overview q={q} k={k} get={get} act={act} me={me} />}
      {view === "users" && <Users k={k} q={q} get={get} act={act} me={me} />}
      {view === "organizers" && <Organizers k={k} q={q} filter={filter} setFilter={setFilter} get={get} act={act} />}
      {view === "events" && <Events k={k} q={q} get={get} act={act} />}
      {view === "orders" && <Orders k={k} q={q} get={get} />}
      {view === "payments" && <Payments k={k} q={q} filter={filter} setFilter={setFilter} get={get} act={act} />}
      {view === "reviews" && <Reports k={k} filter={filter} setFilter={setFilter} get={get} act={act} />}
      {view === "activations" && <Activations k={k} filter={filter} setFilter={setFilter} get={get} act={act} />}
      {view === "support" && <SupportQueue k={k} filter={filter} setFilter={setFilter} />}
      {view === "promotions" && <Promotions k={k} get={get} />}
      {view === "settings" && <Settings k={k} act={act} />}
      {view === "audit" && <Audit k={k} filter={filter} setFilter={setFilter} get={get} />}

      <section className="admin-export" aria-labelledby="admin-export-title">
        <div>
          <h2 id="admin-export-title">Take a working copy.</h2>
          <p>Download a CSV report built from live records. Spreadsheet formulas in cells are neutralised.</p>
        </div>
        <label>
          <span className="admin-visually-hidden">Report</span>
          <select value={exportKind} onChange={(e) => setExportKind(e.target.value)}>
            {EXPORTS.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <a className="btn btn-secondary" href={`/api/backend/admin/exports/${exportKind}.csv`} download={`biletflow-${exportKind}.csv`}>
          <Icon name="download" size={17} />
          Export CSV
        </a>
      </section>
    </main>
  );
}

// `useLoad` with a fixed signature, so the sections stay short
function useLoadList<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  return useLoad<T>(key, load);
}

type Getter = <T>(path: string, query?: Record<string, string | number | boolean | undefined>) => (signal: AbortSignal) => Promise<T>;
type Act = (action: () => Promise<unknown>, message: string) => Promise<void>;
type FilterProps = { filter: string; setFilter: (v: string) => void };

function FilterSelect({ label, options, filter, setFilter }: FilterProps & { label: string; options: [string, string][] }) {
  return (
    <label className="admin-inline-filter">
      {label}
      <select value={filter} onChange={(e) => setFilter(e.target.value)}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>{text}</option>
        ))}
      </select>
    </label>
  );
}

function userRows(list: AdminUser[], act: Act, me: string): TableRow[] {
  return list.map((u) => ({
    id: u.id,
    cells: [
      <RecordName key="n" title={u.full_name} reference={u.id.slice(0, 8).toUpperCase()} />,
      u.email,
      u.is_platform_admin ? "Platform admin" : u.is_email_verified ? "Verified email" : "Email not verified",
      <span key="s">
        <Status value={u.is_suspended ? "suspended" : "active"} />
        {u.suspension_reason && <small className="admin-section-note"> {u.suspension_reason}</small>}
      </span>,
      u.id === me || u.is_platform_admin ? (
        "—"
      ) : u.is_suspended ? (
        <button key="a" className="btn btn-small btn-secondary" onClick={() => act(() => api.request(`/admin/users/${u.id}/restore`, { method: "POST" }), `${u.full_name} can sign in again.`)}>
          Restore
        </button>
      ) : (
        <ReasonAction key="a" label="Suspend" confirm="Confirm suspend" onConfirm={(reason) => act(() => api.request(`/admin/users/${u.id}/suspend`, { body: { reason } }), `${u.full_name} is suspended and signed out everywhere.`)} />
      ),
    ],
  }));
}

function eventRows(list: AdminEvent[], act: Act): TableRow[] {
  return list.map((e) => ({
    id: e.id,
    cells: [
      <RecordName key="n" title={<Link className="admin-case-link" href={`/events/${e.id}`}>{e.title}</Link>} reference={`${dateTime(e.start_at)}${e.city ? ` · ${e.city}` : ""}`} />,
      e.organizer_name,
      <span key="s">
        <Status value={e.is_suspended ? "suspended" : e.status} /> {e.lifecycle !== "upcoming" && e.lifecycle !== e.status && <Status value={e.lifecycle} />}
      </span>,
      e.paid_sales_open ? (
        <span key="p" className="admin-row-actions">
          Open
          <ReasonAction label="Suspend paid sales" confirm="Suspend" minLength={5} onConfirm={(reason) => act(() => api.request(`/admin/events/${e.id}/paid-sales/suspend`, { body: { reason } }), `Paid sales stopped for ${e.title}. Resume them under Paid-sales activations.`)} />
        </span>
      ) : (
        "Closed"
      ),
      e.is_suspended ? (
        <button key="a" className="btn btn-small btn-secondary" onClick={() => act(() => api.request(`/admin/events/${e.id}/restore`, { method: "POST" }), `${e.title} is back on sale.`)}>
          Restore
        </button>
      ) : (
        <ReasonAction key="a" label="Suspend" confirm="Confirm suspend" onConfirm={(reason) => act(() => api.request(`/admin/events/${e.id}/suspend`, { body: { reason } }), `${e.title} is hidden and closed to new orders. The organizer was told.`)} />
      ),
    ],
  }));
}

function OrdersTable({ data }: { data: { data?: AdminOrder[]; status: string; error?: Error } }) {
  return (
    <Listed data={data}>
      {(list) => (
        <DataTable
          caption="Orders"
          headings={["Order", "Buyer", "Event", "Total", "Status"]}
          rows={list.map((o) => ({
            id: o.id,
            cells: [
              <RecordName key="r" title={o.id.slice(0, 8).toUpperCase()} reference={dateTime(o.created_at)} />,
              o.buyer_email,
              o.event_title,
              <RecordName key="t" title={kzt(o.total_kzt)} reference={o.promo_code ? `${o.promo_code} −${kzt(o.discount_kzt)}` : undefined} />,
              <Status key="s" value={o.status} />,
            ],
          }))}
        />
      )}
    </Listed>
  );
}

function paymentRows(list: AdminPayment[], act?: Act): TableRow[] {
  return list.map((p) => ({
    id: p.id,
    cells: [
      <RecordName key="r" title={p.id.slice(0, 8).toUpperCase()} reference={dateTime(p.created_at)} />,
      <RecordName key="b" title={p.buyer_email} reference={`Order ${p.order_id.slice(0, 8).toUpperCase()}`} />,
      p.event_title,
      kzt(p.amount_kzt),
      <Status key="s" value={p.status} />,
      p.failure_reason ?? "—",
      act && p.status === "succeeded" ? (
        <ReasonAction key="d" label="Record dispute" confirm="Open dispute" onConfirm={(reason) => act(() => api.request(`/admin/payments/${p.id}/disputes`, { body: { reason } }), "Dispute recorded.")} />
      ) : (
        "—"
      ),
    ],
  }));
}

function Overview({ q, k, get, act, me }: { q: string; k: string; get: Getter; act: Act; me: string }) {
  const counts = useLoadList(`counts:${k}`, async (signal) => {
    const [reports, support, failed, suspended, organizers] = await Promise.all([
      get<EventReport[]>("/admin/reports", { status: "pending" })(signal),
      api.request<CaseSummary[]>("/support/cases", { signal, query: { scope: "handling" } }),
      get<AdminPayment[]>("/admin/payments", { status: "failed", limit: 200 })(signal),
      get<AdminUser[]>("/admin/users", { suspended: true, limit: 200 })(signal),
      get<AdminOrganizer[]>("/admin/organizers", { verification_status: "pending", limit: 200 })(signal),
    ]);
    return {
      reports: reports.length,
      support: support.filter((c) => c.status !== "resolved").length,
      failed: failed.length,
      suspended: suspended.length,
      // Profiles start as "pending"; only submitted details wait for a decision
      organizers: organizers.filter((o) => o.verification_submitted_at).length,
    };
  });
  const found = useLoadList(`search:${k}`, (signal) =>
    q.length >= 2 ? api.request<AdminSearch>("/admin/search", { signal, query: { q } }) : Promise.resolve(null),
  );
  const c = counts.data;
  if (q)
    return (
      <Listed data={found}>
        {(r) =>
          r && (
            <div className="admin-global-results">
              <section>
                <h2>Users <span>{r.users.length}</span></h2>
                <DataTable caption="Users found" headings={["User", "Email", "Account", "Status", "Action"]} rows={userRows(r.users, act, me)} />
              </section>
              <section>
                <h2>Events <span>{r.events.length}</span></h2>
                <DataTable caption="Events found" headings={["Event", "Organizer", "Status", "Paid sales", "Action"]} rows={eventRows(r.events, act)} />
              </section>
              <section>
                <h2>Orders <span>{r.orders.length}</span></h2>
                <OrdersTable data={{ data: r.orders, status: "ready" }} />
              </section>
              <section>
                <h2>Payments <span>{r.payments.length}</span></h2>
                <DataTable caption="Payments found" headings={["Payment", "Buyer / order", "Event", "Amount", "Status", "Failure reason", "Dispute"]} rows={paymentRows(r.payments, act)} />
              </section>
            </div>
          )
        }
      </Listed>
    );
  return (
    <>
      {counts.status === "error" && <Notice error>{counts.error.message}</Notice>}
      <div className="admin-stats">
        <Stat label="Event reports" value={c?.reports} href="/admin?view=reviews" detail="Awaiting review" />
        <Stat label="Platform support" value={c?.support} href="/admin?view=support" detail="Organizer and escalated cases not resolved" />
        <Stat label="Failed payments" value={c?.failed} href="/admin?view=payments" detail="Simulated payment failures" />
        <Stat label="Identity checks" value={c?.organizers} href="/admin?view=organizers" detail="Organizers waiting for a decision" />
        <Stat label="Suspended users" value={c?.suspended} href="/admin?view=users" detail="Sign-in blocked" />
      </div>
      <div className="admin-overview-grid">
        <section className="admin-panel">
          <h2>Attention, where it matters.</h2>
          <p className="muted">Work through the queues without losing sight of the people behind each record.</p>
          <Link className="admin-queue-link" href="/admin?view=reviews">
            <span>Reported events<small>Dismiss reports, or act and suspend the event.</small></span>
            <strong>{c?.reports ?? "–"}</strong>
            <Icon name="arrow" size={17} />
          </Link>
          <Link className="admin-queue-link" href="/admin?view=support">
            <span>Platform support<small>Organizer requests and escalated attendee cases.</small></span>
            <strong>{c?.support ?? "–"}</strong>
            <Icon name="arrow" size={17} />
          </Link>
          <Link className="admin-queue-link" href="/admin?view=organizers">
            <span>Organizer identity checks<small>Confirm or reject submitted legal details.</small></span>
            <strong>{c?.organizers ?? "–"}</strong>
            <Icon name="arrow" size={17} />
          </Link>
        </section>
        <SettingsSummary k={k} />
      </div>
    </>
  );
}

function SettingsSummary({ k }: { k: string }) {
  const s = useLoadList(`settings-summary:${k}`, (signal) => api.request<PlatformSettings>("/admin/settings", { signal }));
  return (
    <section className="admin-panel">
      <h2>Platform at a glance.</h2>
      <dl className="admin-summary-list">
        <div>
          <dt>New bookings</dt>
          <dd>{s.data ? <Status value={s.data.bookings_enabled ? "active" : "paused"} /> : "–"}</dd>
        </div>
        <div>
          <dt>Activation fee</dt>
          <dd>{s.data ? kzt(s.data.activation_fee_kzt) : "–"}</dd>
        </div>
        <div>
          <dt>Support email</dt>
          <dd>{s.data?.support_email ?? "–"}</dd>
        </div>
      </dl>
      <Link className="text-link" href="/admin?view=settings">
        Manage platform settings <Icon name="arrow" size={15} />
      </Link>
    </section>
  );
}

function Users({ k, q, get, act, me }: { k: string; q: string; get: Getter; act: Act; me: string }) {
  const data = useLoadList(k, get<AdminUser[]>("/admin/users", { q: q || undefined }));
  return (
    <section>
      <div className="admin-section-heading">
        <h2>Users</h2>
        <span>{data.data?.length ?? ""} shown</span>
      </div>
      <p className="admin-section-note">Suspending blocks sign-in, signs the person out everywhere and takes their events out of public view.</p>
      <Listed data={data}>{(list) => <DataTable caption="Users" headings={["User", "Email", "Account", "Status", "Action"]} rows={userRows(list, act, me)} />}</Listed>
    </section>
  );
}

function Organizers({ k, q, get, act, ...f }: { k: string; q: string; get: Getter; act: Act } & FilterProps) {
  const data = useLoadList(k, get<AdminOrganizer[]>("/admin/organizers", { q: q || undefined, verification_status: f.filter || undefined }));
  const decide = (o: AdminOrganizer, status: "verified" | "rejected") =>
    act(
      () => api.request(`/organizers/${o.id}/verification`, { method: "PATCH", body: { verification_status: status } }),
      `${o.display_name} is ${status}.`,
    );
  return (
    <section>
      <div className="admin-section-heading">
        <h2>Organizer identity checks</h2>
        <FilterSelect label="Status" options={[["", "All"], ["pending", "Pending"], ["verified", "Verified"], ["rejected", "Rejected"]]} {...f} />
      </div>
      <p className="admin-section-note">A valid IIN/BIN verifies an organizer automatically (simulated). Reject when the details look wrong; their next submission then waits for you.</p>
      <Listed data={data}>
        {(list) => (
          <DataTable
            caption="Organizers"
            headings={["Organizer", "Legal details", "Submitted", "Status", "Decision"]}
            rows={list.map((o) => ({
              id: o.id,
              cells: [
                <RecordName key="n" title={o.display_name} reference={o.email} />,
                o.legal_name ? <RecordName key="l" title={o.legal_name} reference={o.tax_id_masked ? `IIN/BIN ${o.tax_id_masked}` : undefined} /> : "Not submitted",
                o.verification_submitted_at ? dateTime(o.verification_submitted_at) : "—",
                <Status key="s" value={o.verification_status === "pending" && !o.verification_submitted_at ? "not submitted" : o.verification_status} />,
                o.legal_name ? (
                  <div key="d" className="admin-row-actions">
                    {o.verification_status !== "verified" && (
                      <button className="btn btn-small btn-primary" onClick={() => decide(o, "verified")}>Verify</button>
                    )}
                    {o.verification_status !== "rejected" && (
                      <button className="btn btn-small btn-secondary" onClick={() => decide(o, "rejected")}>Reject</button>
                    )}
                  </div>
                ) : (
                  "Waiting for details"
                ),
              ],
            }))}
          />
        )}
      </Listed>
    </section>
  );
}

function Orders({ k, q, get }: { k: string; q: string; get: Getter }) {
  const data = useLoadList(k, get<AdminOrder[]>("/admin/orders", { q: q || undefined }));
  return (
    <section>
      <div className="admin-section-heading">
        <h2>Orders</h2>
        <span>{data.data?.length ?? ""} shown</span>
      </div>
      <OrdersTable data={data} />
    </section>
  );
}

function Events({ k, q, get, act }: { k: string; q: string; get: Getter; act: Act }) {
  const data = useLoadList(k, get<AdminEvent[]>("/admin/events", { q: q || undefined }));
  return (
    <section>
      <div className="admin-section-heading">
        <h2>Events</h2>
        <span>{data.data?.length ?? ""} shown</span>
      </div>
      <p className="admin-section-note">A suspended event is hidden from attendees and takes no new orders. Issued tickets stay valid.</p>
      <Listed data={data}>{(list) => <DataTable caption="Events" headings={["Event", "Organizer", "Status", "Paid sales", "Action"]} rows={eventRows(list, act)} />}</Listed>
    </section>
  );
}

function Payments({ k, q, get, act, ...f }: { k: string; q: string; get: Getter; act: Act } & FilterProps) {
  const payments = useLoadList(k, get<AdminPayment[]>("/admin/payments", { q: q || undefined, status: f.filter || undefined }));
  const refunds = useLoadList(`refunds:${k}`, get<AdminRefund[]>("/admin/refunds"));
  const disputes = useLoadList(`disputes:${k}`, get<Dispute[]>("/admin/disputes"));
  return (
    <>
      <section>
        <div className="admin-section-heading">
          <h2>Payments</h2>
          <FilterSelect label="Status" options={[["", "All payments"], ["succeeded", "Succeeded"], ["failed", "Failed"]]} {...f} />
        </div>
        <Listed data={payments}>
          {(list) => <DataTable caption="Payments" headings={["Payment", "Buyer / order", "Event", "Amount", "Status", "Failure reason", "Dispute"]} rows={paymentRows(list, act)} />}
        </Listed>
      </section>
      <section className="admin-section">
        <h2>Refunds</h2>
        <Listed data={refunds}>
          {(list) => (
            <DataTable
              caption="Refunds"
              headings={["Refund", "Buyer / order", "Event", "Amount", "Reason", "By"]}
              rows={list.map((r) => ({
                id: r.id,
                cells: [
                  <RecordName key="r" title={r.id.slice(0, 8).toUpperCase()} reference={dateTime(r.created_at)} />,
                  <RecordName key="b" title={r.buyer_email} reference={`Order ${r.order_id.slice(0, 8).toUpperCase()}`} />,
                  r.event_title,
                  kzt(r.amount_kzt),
                  r.reason,
                  r.initiated_by_name ?? "—",
                ],
              }))}
            />
          )}
        </Listed>
      </section>
      <section className="admin-section">
        <h2>Disputes</h2>
        <Listed data={disputes}>
          {(list) => (
            <DataTable
              caption="Disputes"
              headings={["Dispute", "Order / payment", "Amount", "Reason", "Status", "Outcome"]}
              rows={list.map((d) => ({
                id: d.id,
                cells: [
                  <RecordName key="r" title={d.id.slice(0, 8).toUpperCase()} reference={dateTime(d.created_at)} />,
                  <RecordName key="o" title={`Order ${d.order_id.slice(0, 8).toUpperCase()}`} reference={`Payment ${d.payment_id.slice(0, 8).toUpperCase()}`} />,
                  kzt(d.amount_kzt),
                  d.reason,
                  <Status key="s" value={d.status} />,
                  d.status === "open" ? (
                    <div key="a" className="admin-row-actions">
                      <button className="btn btn-small btn-secondary" onClick={() => act(() => api.request(`/admin/disputes/${d.id}`, { method: "PATCH", body: { status: "won" } }), "Dispute marked as won.")}>Won</button>
                      <button className="btn btn-small btn-secondary" onClick={() => act(() => api.request(`/admin/disputes/${d.id}`, { method: "PATCH", body: { status: "lost" } }), "Dispute marked as lost.")}>Lost</button>
                    </div>
                  ) : (
                    d.resolution_note ?? (d.resolved_at ? dateTime(d.resolved_at) : "—")
                  ),
                ],
              }))}
            />
          )}
        </Listed>
      </section>
    </>
  );
}

function Reports({ k, get, act, ...f }: { k: string; get: Getter; act: Act } & FilterProps) {
  const data = useLoadList(k, get<EventReport[]>("/admin/reports", { status: f.filter || undefined }));
  const review = (r: EventReport, decision: "dismissed" | "actioned", suspend: boolean, note?: string) =>
    act(
      () => api.request(`/admin/reports/${r.id}/review`, { body: { decision, suspend_event: suspend, note: note || null } }),
      suspend ? "Report actioned and the event suspended." : decision === "dismissed" ? "Report dismissed." : "Report marked as handled.",
    );
  return (
    <section>
      <div className="admin-section-heading">
        <h2>Reported events</h2>
        <FilterSelect label="Status" options={[["", "All"], ["pending", "Pending"], ["dismissed", "Dismissed"], ["actioned", "Actioned"]]} {...f} />
      </div>
      <Listed data={data}>
        {(list) => (
          <DataTable
            caption="Event reports"
            headings={["Event", "Reason", "Status", "Review"]}
            rows={list.map((r) => ({
              id: r.id,
              cells: [
                <RecordName key="e" title={<Link className="admin-case-link" href={`/events/${r.event_id}`}>{r.event_title}</Link>} reference={dateTime(r.created_at)} />,
                r.reason,
                <Status key="s" value={r.status} />,
                r.status === "pending" ? (
                  <div key="a" className="admin-row-actions">
                    <button className="btn btn-small btn-secondary" onClick={() => review(r, "dismissed", false)}>Dismiss</button>
                    <ReasonAction label="Suspend event" confirm="Suspend" onConfirm={(note) => review(r, "actioned", true, note)} />
                  </div>
                ) : (
                  <RecordName key="d" title={r.review_note ?? "Reviewed"} reference={r.reviewed_at ? dateTime(r.reviewed_at) : undefined} />
                ),
              ],
            }))}
          />
        )}
      </Listed>
    </section>
  );
}

function Activations({ k, get, act, ...f }: { k: string; get: Getter; act: Act } & FilterProps) {
  const data = useLoadList(k, get<ActivationRecord[]>("/admin/activations", { status: f.filter || undefined, limit: undefined }));
  return (
    <section>
      <div className="admin-section-heading">
        <h2>Paid-sales activations</h2>
        <FilterSelect label="Status" options={[["", "All"], ["pending", "Pending"], ["active", "Active"], ["suspended", "Suspended"]]} {...f} />
      </div>
      <p className="admin-section-note">Fees are simulated; no money moves. Suspending paid sales leaves free tickets and sold tickets alone.</p>
      <Listed data={data}>
        {(list) => (
          <DataTable
            caption="Activation records"
            headings={["Event", "Organizer", "Fee", "Steps", "Status", "Action"]}
            rows={list.map((a) => ({
              id: a.id,
              cells: [
                <RecordName key="e" title={a.event_title} reference={dateTime(a.created_at)} />,
                a.organizer_name,
                <RecordName key="f" title={kzt(a.fee_kzt)} reference={a.fee_paid_at ? `Paid ${dateTime(a.fee_paid_at)}` : "Not paid"} />,
                a.terms_accepted_at ? `Terms ${a.terms_version ?? ""} accepted` : "Terms not accepted",
                <span key="s">
                  <Status value={a.status} />
                  {a.suspension_reason && <small className="admin-section-note"> {a.suspension_reason}</small>}
                </span>,
                a.status === "active" ? (
                  <ReasonAction key="a" label="Suspend paid sales" confirm="Suspend" minLength={5} onConfirm={(reason) => act(() => api.request(`/admin/events/${a.event_id}/paid-sales/suspend`, { body: { reason } }), "Paid sales suspended. The organizer was emailed.")} />
                ) : a.status === "suspended" ? (
                  <button key="a" className="btn btn-small btn-secondary" onClick={() => act(() => api.request(`/admin/events/${a.event_id}/paid-sales/resume`, { method: "POST" }), "Paid sales resumed.")}>
                    Resume
                  </button>
                ) : (
                  "—"
                ),
              ],
            }))}
          />
        )}
      </Listed>
    </section>
  );
}

function SupportQueue({ k, ...f }: { k: string } & FilterProps) {
  const data = useLoadList(k, (signal) => api.request<CaseSummary[]>("/support/cases", { signal, query: { scope: "handling", status: f.filter || undefined } }));
  return (
    <section>
      <div className="admin-section-heading">
        <h2>Organizer and escalated support</h2>
        <FilterSelect label="Status" options={[["", "All"], ["open", "Open"], ["in_progress", "In Progress"], ["waiting_for_customer", "Waiting for Customer"], ["resolved", "Resolved"]]} {...f} />
      </div>
      <Listed data={data}>
        {(list) => (
          <DataTable
            caption="Platform support queue"
            headings={["Case", "Requester", "Category", "Status", "Assigned to"]}
            rows={list.map((c) => ({
              id: c.id,
              cells: [
                <Link key="c" className="admin-case-link" href={`/support/${c.id}`}>
                  <RecordName title={c.subject} reference={`${caseRef(c.id)} · ${c.audience === "organizer" ? "Organizer" : `Escalated · ${c.event_title ?? "event"}`}`} />
                </Link>,
                c.requester_name,
                CATEGORY_LABELS[c.category] ?? c.category,
                <Status key="s" value={c.status_label} />,
                c.assignee_name ?? "Unassigned",
              ],
            }))}
          />
        )}
      </Listed>
    </section>
  );
}

function Promotions({ k, get }: { k: string; get: Getter }) {
  const data = useLoadList(k, get<PromoActivity[]>("/admin/promo-activity"));
  return (
    <section>
      <div className="admin-section-heading">
        <h2>Promo-code activity</h2>
        <span>{data.data?.length ?? ""} redemptions</span>
      </div>
      <Listed data={data}>
        {(list) => (
          <DataTable
            caption="Promo-code redemptions"
            headings={["Code", "Buyer", "Event", "Order", "Discount", "Used"]}
            rows={list.map((p) => ({
              id: p.redemption_id,
              cells: [
                <RecordName key="c" title={p.code} reference={p.campaign_name} />,
                p.buyer_email,
                p.event_title,
                <RecordName key="o" title={p.order_id.slice(0, 8).toUpperCase()} reference={p.order_status} />,
                kzt(p.discount_kzt),
                dateTime(p.created_at),
              ],
            }))}
          />
        )}
      </Listed>
    </section>
  );
}

function Settings({ k, act }: { k: string; act: Act }) {
  const data = useLoadList(k, (signal) => api.request<PlatformSettings>("/admin/settings", { signal }));
  const [enabled, setEnabled] = useState<boolean | null>(null);
  return (
    <section className="admin-panel">
      <h2>Platform settings</h2>
      <Listed data={data}>
        {(s) => {
          const bookings = enabled ?? s.bookings_enabled;
          return (
            <form
              key={s.updated_at ?? "initial"}
              className="stack-form admin-settings"
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                // Send only what changed, so an unchanged value is never re-validated
                const fee = Number(d.get("fee"));
                const email = String(d.get("email")).trim();
                const body = {
                  ...(fee !== s.activation_fee_kzt ? { activation_fee_kzt: fee } : {}),
                  ...(email !== s.support_email ? { support_email: email } : {}),
                  ...(bookings !== s.bookings_enabled ? { bookings_enabled: bookings } : {}),
                };
                if (!Object.keys(body).length) return;
                void act(() => api.request("/admin/settings", { method: "PATCH", body }), "Platform settings saved.");
              }}
            >
              <label>
                Paid-sales activation fee (KZT)
                <input name="fee" type="number" min={0} max={10000000} step={1} required defaultValue={s.activation_fee_kzt} />
                <span className="field-hint">Applies to activation records created from now on. Existing records keep their fee.</span>
              </label>
              <label>
                Platform support email
                <input name="email" type="email" maxLength={255} required defaultValue={s.support_email} />
              </label>
              <label className="admin-setting-toggle">
                <input type="checkbox" checked={bookings} onChange={(e) => setEnabled(e.target.checked)} />
                <span>
                  <strong>Accept new bookings</strong>
                  <small>When paused, nobody can start a checkout. Existing orders, tickets and support stay available.</small>
                </span>
              </label>
              {s.updated_at && <p className="field-hint">Last changed {dateTime(s.updated_at)}</p>}
              <button className="btn btn-primary">
                Save platform settings <Icon name="check" size={16} />
              </button>
            </form>
          );
        }}
      </Listed>
    </section>
  );
}

function Audit({ k, get, ...f }: { k: string; get: Getter } & FilterProps) {
  const data = useLoadList(k, get<AuditRow[]>("/admin/audit", { action: f.filter || undefined, limit: 200 }));
  return (
    <section>
      <div className="admin-section-heading">
        <h2>Activity history</h2>
        <FilterSelect
          label="Area"
          options={[["", "Everything"], ["platform.", "Platform admin"], ["organizer.", "Organizers"], ["event.", "Events"], ["order.", "Orders"], ["payment.", "Payments"], ["refund.", "Refunds"], ["activation.", "Activations"], ["promo.", "Promotions"], ["support.", "Support"], ["check_in.", "Check-in"]]}
          {...f}
        />
      </div>
      <p className="admin-section-note">Read-only. Entries cannot be edited or deleted.</p>
      <Listed data={data}>
        {(list) => (
          <DataTable
            caption="Activity history"
            headings={["When", "Who", "What", "Record"]}
            rows={list.map((a) => ({
              id: a.id,
              cells: [dateTime(a.created_at), a.actor_name ?? "System", a.description, <Status key="t" value={a.entity_type} />],
            }))}
          />
        )}
      </Listed>
    </section>
  );
}
