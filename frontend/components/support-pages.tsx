"use client";

/**
 * Support cases on the backend. Attendees ask the event's organizer team
 * (from an event, order or ticket); organizers ask the BiletFlow team.
 * Organizer teams can pass an attendee case on to the platform team.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Order } from "@/lib/orders";
import {
  CATEGORIES_BY_AUDIENCE,
  CATEGORY_LABELS,
  STATUS_OPTIONS,
  caseRef,
  type Assignee,
  type CaseAudience,
  type CaseCategory,
  type CaseDetail,
  type CaseMessage,
  type CaseSummary,
} from "@/lib/support";
import { useSession } from "./session-provider";
import { useLoad } from "./use-load";
import { EmptyState, Icon, LoadingPage, Notice, PageIntro } from "./primitives";
import "./support.css";

const stamp = (value: string) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Almaty" }).format(new Date(value));

const failure = (error: unknown, fallback = "That did not work. Please try again.") =>
  error instanceof Error && error.message ? error.message : fallback;

function CaseBadge({ status, label }: { status: string; label: string }) {
  return <span className={`support-status support-status-${status.replaceAll("_", "-")}`}>{label}</span>;
}

function SupportShell({ children, title, description, action }: { children: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <main className="workspace support-workspace">
      <PageIntro eyebrow="BiletFlow support" title={title} description={description} action={action} />
      {children}
    </main>
  );
}

/** "Get support" button for event, order and ticket pages. `platform` asks the BiletFlow team. */
export function SupportLink({
  eventId,
  orderId,
  ticketId,
  platform = false,
  label = "Get support",
}: {
  eventId?: string;
  orderId?: string;
  ticketId?: string;
  platform?: boolean;
  label?: string;
}) {
  const query = new URLSearchParams();
  if (eventId) query.set("event", eventId);
  if (orderId) query.set("order", orderId);
  if (ticketId) query.set("ticket", ticketId);
  if (platform) query.set("to", "platform");
  const suffix = query.toString();
  return (
    <Link className="btn btn-secondary support-launch" href={`/support/new${suffix ? `?${suffix}` : ""}`}>
      <Icon name="mail" size={16} />
      {label}
    </Link>
  );
}

function SupportInbox() {
  const { user, organizer, isAdmin } = useSession();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [scope, setScope] = useState("all");
  const cases = useLoad(`support-cases:${scope}:${status}`, (signal) =>
    api.request<CaseSummary[]>("/support/cases", { signal, query: { scope, status: status || undefined } }),
  );
  const query = search.trim().toLowerCase();
  const list = (cases.data ?? []).filter((c) =>
    `${caseRef(c.id)} ${c.subject} ${CATEGORY_LABELS[c.category] ?? c.category} ${c.requester_name} ${c.event_title ?? ""}`.toLowerCase().includes(query),
  );
  return (
    <SupportShell
      title="A little help, a better night."
      description="Your requests and the cases your team answers. Replies stay here, and you get an email and a notification when someone answers."
      action={
        !isAdmin && (
          <Link className="btn btn-primary" href={organizer ? "/support/new?to=platform" : "/support/new"}>
            <Icon name="plus" size={16} />
            New support request
          </Link>
        )
      }
    >
      <div className="support-filters">
        <label className="support-search">
          Search cases
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Subject, reference, event or requester" />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label>
          Show
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">Everything I can see</option>
            <option value="requested">Requests I opened</option>
            <option value="handling">Cases I answer</option>
          </select>
        </label>
      </div>
      {cases.status === "error" && <Notice error>{cases.error.message}</Notice>}
      {!cases.data ? (
        <LoadingPage />
      ) : (
        <>
          <p className="support-results" role="status">
            {list.length} {list.length === 1 ? "case" : "cases"}
          </p>
          {list.length ? (
            <div className="support-case-list">
              {list.map((c) => (
                <Link className="support-case-card" key={c.id} href={`/support/${c.id}`}>
                  <div className="support-case-main">
                    <div className="support-case-meta">
                      <span>{caseRef(c.id)}</span>
                      <span>{CATEGORY_LABELS[c.category] ?? c.category}</span>
                      {c.is_escalated && <span className="support-escalated">Escalated</span>}
                    </div>
                    <h2>{c.subject}</h2>
                    <p>
                      {c.requester_user_id === user?.id ? "You" : c.requester_name} ·{" "}
                      {c.audience === "organizer" ? "Platform support" : c.event_title ?? "Event support"}
                      {c.assignee_name ? ` · Assigned to ${c.assignee_name}` : " · Unassigned"}
                    </p>
                  </div>
                  <div className="support-case-side">
                    <CaseBadge status={c.status} label={c.status_label} />
                    <time dateTime={c.updated_at}>{stamp(c.updated_at)}</time>
                    <span>
                      {c.message_count} {c.message_count === 1 ? "message" : "messages"}
                      <Icon name="arrow" size={15} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="mail"
              title={cases.data.length ? "No matching cases." : "Your inbox is clear."}
              description={
                cases.data.length
                  ? "Try a different status or search."
                  : "Open a request from an event, order or ticket page when you need a hand."
              }
            />
          )}
        </>
      )}
    </SupportShell>
  );
}

function NewSupportCase({ query }: { query: Record<string, string> }) {
  const { user, organizer } = useSession();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const hasBooking = !!(query.order || query.ticket);
  // Organizers write to the platform team unless they ask about their own booking
  const audience: CaseAudience = query.to === "platform" || (organizer && !hasBooking && !query.event) ? "organizer" : "attendee";
  const needsBooking = audience === "attendee" && !query.event && !hasBooking;
  const context = useLoad(`support-context:${query.event ?? ""}:${query.order ?? ""}:${needsBooking}`, async (signal) => {
    const [event, order, orders] = await Promise.all([
      query.event ? api.request<{ id: string; title: string }>(`/events/${query.event}`, { signal }).catch(() => null) : null,
      query.order ? api.request<Order>(`/orders/${query.order}`, { signal }).catch(() => null) : null,
      needsBooking ? api.request<Order[]>("/orders/mine", { signal }) : ([] as Order[]),
    ]);
    return { event, order, orders };
  });
  const choices = CATEGORIES_BY_AUDIENCE[audience];
  const initial = (choices as string[]).includes(query.category) ? query.category : choices[0];

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting.current) return;
    const d = new FormData(e.currentTarget);
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const created = await api.request<CaseDetail>("/support/cases", {
        body: {
          audience,
          category: String(d.get("category")) as CaseCategory,
          subject: String(d.get("subject")).trim(),
          message: String(d.get("body")).trim(),
          event_id: query.event || null,
          order_id: query.order || null,
          ticket_id: query.ticket || null,
        },
      });
      router.push(`/support/${created.id}`);
    } catch (err) {
      setError(failure(err, "Could not open this support request."));
      submitting.current = false;
      setBusy(false);
    }
  }

  const back = (
    <Link className="text-link" href="/support">
      <Icon name="back" size={16} />
      All support cases
    </Link>
  );
  if (needsBooking)
    return (
      <SupportShell title="Which booking is it about?" description="Attendee questions go to the team running the event, so pick the booking first." action={back}>
        {!context.data ? (
          <LoadingPage />
        ) : context.data.orders.length ? (
          <div className="support-case-list">
            {context.data.orders.map((o) => (
              <Link className="support-case-card" key={o.id} href={`/support/new?event=${o.event_id}&order=${o.id}`}>
                <div className="support-case-main">
                  <div className="support-case-meta">
                    <span>{o.id.slice(0, 8).toUpperCase()}</span>
                    <span>{stamp(o.event_start_at)}</span>
                  </div>
                  <h2>{o.event_title}</h2>
                </div>
                <div className="support-case-side">
                  <Icon name="arrow" size={15} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon="mail" title="No bookings yet." description="For a question about an event, use “Ask about this event” on its page." href="/events" label="Browse events" />
        )}
        {organizer && (
          <p className="muted">
            Organizer question? <Link className="text-link" href="/support/new?to=platform">Write to the BiletFlow team</Link>.
          </p>
        )}
      </SupportShell>
    );

  const event = context.data?.event;
  const order = context.data?.order;
  return (
    <SupportShell
      title="Tell us what happened."
      description={
        audience === "organizer"
          ? "Ask the BiletFlow team about your account, paid-sales activation, payments or a technical issue."
          : "Your message goes to the team running the event. The event, order and ticket are included."
      }
      action={back}
    >
      <div className="support-compose-layout">
        <form className="stack-form support-compose" onSubmit={submit} aria-busy={busy}>
          <label>
            Issue category
            <select name="category" defaultValue={initial} required disabled={busy}>
              {choices.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </label>
          <label>
            Subject
            <input name="subject" placeholder="A short description of the issue" minLength={3} maxLength={200} required disabled={busy} />
          </label>
          <label>
            What can we help with?
            <textarea name="body" placeholder="Tell us what happened and what you need." rows={7} minLength={1} maxLength={5000} required disabled={busy} />
            <span className="field-hint">Up to 5,000 characters. Never share passwords or card details.</span>
          </label>
          {error && <Notice error>{error}</Notice>}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Opening request…" : "Open support request"}
            <Icon name="arrow" size={16} />
          </button>
        </form>
        <section className="support-context" aria-label="Included with this request">
          <h2>Included with this request</h2>
          <dl>
            <div>
              <dt>From</dt>
              <dd>
                {user?.full_name}
                <small>{user?.email}</small>
              </dd>
            </div>
            <div>
              <dt>Goes to</dt>
              <dd>{audience === "organizer" ? "BiletFlow platform support" : "The event's organizer team"}</dd>
            </div>
            {query.event && (
              <div>
                <dt>Event</dt>
                <dd>{event?.title ?? order?.event_title ?? "Event"}</dd>
              </div>
            )}
            {query.order && (
              <div>
                <dt>Order</dt>
                <dd>{query.order.slice(0, 8).toUpperCase()}</dd>
              </div>
            )}
            {query.ticket && (
              <div>
                <dt>Ticket</dt>
                <dd>{query.ticket.slice(0, 8).toUpperCase()}</dd>
              </div>
            )}
          </dl>
          <p>These references stay with the conversation.</p>
        </section>
      </div>
    </SupportShell>
  );
}

function CaseThread({ id }: { id: string }) {
  const { user, isAdmin } = useSession();
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState("");
  const data = useLoad(`support-case:${id}:${version}`, (signal) => api.request<CaseDetail>(`/support/cases/${id}`, { signal }));
  const sc = data.data;
  const assignees = useLoad(`support-assignees:${id}:${sc?.can_manage ?? false}`, (signal) =>
    sc?.can_manage ? api.request<Assignee[]>(`/support/cases/${id}/assignees`, { signal }) : Promise.resolve([] as Assignee[]),
  );

  // Poll for new replies every 20 seconds while the case is open on screen
  const lastAt = sc?.messages.at(-1)?.created_at;
  useEffect(() => {
    if (!lastAt) return;
    const timer = setInterval(async () => {
      try {
        const fresh = await api.request<CaseMessage[]>(`/support/cases/${id}/messages`, { query: { since: lastAt } });
        if (fresh.length) setVersion((v) => v + 1);
      } catch {
        // Try again on the next tick
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [id, lastAt]);

  async function run(kind: string, action: () => Promise<CaseDetail>, done: string, form?: HTMLFormElement) {
    setBusy(kind);
    setNotice(null);
    try {
      await action();
      form?.reset();
      setVersion((v) => v + 1);
      setNotice({ text: done, error: false });
    } catch (e) {
      setNotice({ text: failure(e), error: true });
    } finally {
      setBusy("");
    }
  }

  if (data.status === "error" && !sc)
    return (
      <SupportShell title="Case unavailable." description="This case does not exist or is not shared with your account.">
        <EmptyState icon="mail" title="Return to your support inbox." description="Your requests and the cases your team answers are listed there." href="/support" label="All support cases" />
      </SupportShell>
    );
  if (!sc) return <LoadingPage />;
  const messages = sc.messages;
  return (
    <SupportShell
      title={sc.subject}
      description={`${caseRef(sc.id)} · ${CATEGORY_LABELS[sc.category] ?? sc.category}`}
      action={
        <Link className="text-link" href="/support">
          <Icon name="back" size={16} />
          All support cases
        </Link>
      }
    >
      <div className="support-thread-heading">
        <CaseBadge status={sc.status} label={sc.status_label} />
        {sc.is_escalated && <span className="support-escalated">Escalated to platform support</span>}
        <span>Opened {stamp(sc.created_at)}</span>
      </div>
      {notice && <Notice error={notice.error}>{notice.text}</Notice>}
      <div className="support-thread-layout">
        <div>
          <section className="support-messages" role="log" aria-label="Case messages" aria-live="polite" aria-relevant="additions">
            {messages.map((m) => {
              const own = m.sender_user_id === user?.id;
              return (
                <article className={`support-message ${own ? "support-message-own" : ""}`} key={m.id}>
                  <header>
                    <strong>
                      {m.sender_name}
                      {own ? " (you)" : m.from_staff ? " · support" : ""}
                    </strong>
                    <time dateTime={m.created_at}>{stamp(m.created_at)}</time>
                  </header>
                  <p>{m.body}</p>
                </article>
              );
            })}
          </section>
          <form
            className="stack-form support-reply"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const body = String(new FormData(form).get("body")).trim();
              if (!body) return;
              void run("reply", () => api.request<CaseDetail>(`/support/cases/${id}/messages`, { body: { body } }), "Reply sent. The other side gets an email and a notification.", form);
            }}
          >
            <label>
              Add a reply
              <textarea name="body" rows={4} required maxLength={5000} placeholder="Write your reply…" />
            </label>
            <p className="field-hint">
              {sc.status === "resolved" ? "Replying reopens this case." : "You can leave this page; replies arrive by email too."}
            </p>
            <button className="btn btn-primary" disabled={busy === "reply"}>
              {busy === "reply" ? "Sending…" : "Send reply"}
              <Icon name="arrow" size={16} />
            </button>
          </form>
          <details className="support-history">
            <summary>
              Case history <span>{sc.history.length} entries</span>
            </summary>
            <ol>
              {sc.history.map((h) => (
                <li key={h.id}>
                  <span>{h.action}</span>
                  <small>
                    {h.actor_name ?? "System"} · <time dateTime={h.created_at}>{stamp(h.created_at)}</time>
                  </small>
                </li>
              ))}
            </ol>
          </details>
        </div>
        <aside className="support-case-aside">
          <section className="support-context" aria-label="Case details">
            <h2>About this case</h2>
            <dl>
              <div>
                <dt>Requester</dt>
                <dd>{sc.requester_name}</dd>
              </div>
              <div>
                <dt>Support team</dt>
                <dd>{sc.audience === "organizer" || sc.is_escalated ? "BiletFlow platform support" : "Event organizer team"}</dd>
              </div>
              {sc.event_id && (
                <div>
                  <dt>Event</dt>
                  <dd>{sc.event_title ?? "Event"}</dd>
                </div>
              )}
              {sc.order_id && (
                <div>
                  <dt>Order</dt>
                  <dd>{sc.order_id.slice(0, 8).toUpperCase()}</dd>
                </div>
              )}
              {sc.ticket_id && (
                <div>
                  <dt>Ticket</dt>
                  <dd>{sc.ticket_id.slice(0, 8).toUpperCase()}</dd>
                </div>
              )}
            </dl>
          </section>
          <section className="support-assignment">
            <h2>Case handling</h2>
            <p>{sc.assignee_name ? `Assigned to ${sc.assignee_name}` : "Waiting for a team member to pick it up."}</p>
            {sc.can_manage && (
              <form
                key={`${sc.status}-${sc.assignee_user_id ?? ""}`}
                className="stack-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  void run(
                    "manage",
                    () =>
                      api.request<CaseDetail>(`/support/cases/${id}`, {
                        method: "PATCH",
                        body: { status: d.get("status"), assignee_user_id: String(d.get("assignee")) || null },
                      }),
                    "Case updated. The change is in its history.",
                  );
                }}
              >
                <label>
                  Status
                  <select name="status" defaultValue={sc.status}>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Assigned to
                  <select name="assignee" defaultValue={sc.assignee_user_id ?? ""}>
                    <option value="">Unassigned</option>
                    {assignees.data?.map((a) => (
                      <option key={a.user_id} value={a.user_id}>{a.full_name}</option>
                    ))}
                  </select>
                </label>
                <button className="btn btn-secondary" disabled={busy === "manage"}>Save case changes</button>
              </form>
            )}
            {sc.can_manage && !sc.is_escalated && sc.audience === "attendee" && !isAdmin && (
              <form
                className="stack-form support-escalate-button"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const reason = String(new FormData(form).get("reason")).trim();
                  void run("escalate", () => api.request<CaseDetail>(`/support/cases/${id}/escalate`, { body: { reason } }), "Passed to the BiletFlow platform team.", form);
                }}
              >
                <label>
                  Need the platform team?
                  <input name="reason" required minLength={3} maxLength={500} placeholder="Why it needs them" />
                </label>
                <button className="btn btn-secondary" disabled={busy === "escalate"}>Escalate to platform support</button>
              </form>
            )}
          </section>
        </aside>
      </div>
    </SupportShell>
  );
}

export function SupportPage({ id, query = {} }: { id?: string; query?: Record<string, string> }) {
  const { user, ready } = useSession();
  if (!ready) return <LoadingPage />;
  if (!user)
    return (
      <div className="workspace">
        <EmptyState
          icon="mail"
          title="Keep the conversation together."
          description="Sign in to open a support request or follow the ones you have."
          href={`/sign-in?next=${encodeURIComponent(id ? `/support/${id}` : "/support")}`}
          label="Sign in"
        />
      </div>
    );
  if (id === "new") return <NewSupportCase key={new URLSearchParams(query).toString()} query={query} />;
  if (id) return <CaseThread key={id} id={id} />;
  return <SupportInbox key={user.id} />;
}
