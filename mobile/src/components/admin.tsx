/**
 * Platform administration (the website's admin pages), as cards for a phone:
 * search, users, organizer checks, events, orders, payments with refunds and
 * disputes, reports, activations, platform support, promo activity, settings,
 * the audit history and CSV exports.
 */
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { router } from "expo-router";
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
import { shareFile } from "./files";
import { amount, ref, stamp } from "./format";
import { failure, useLoad } from "./use-load";
import { Badge, Button, Card, Field, H2, Icon, Loaded, Notice, Row, Select, T, Toggle } from "./ui";
import { color } from "./theme";

import { useT , tk } from "@/lib/i18n";
export const ADMIN_VIEWS: [string, string, Parameters<typeof Icon>[0]["name"]][] = [
  ["overview", tk("Overview"), "grid-outline"],
  ["users", tk("Users"), "people-outline"],
  ["organizers", tk("Organizer checks"), "id-card-outline"],
  ["events", tk("Events"), "calendar-outline"],
  ["orders", tk("Orders"), "receipt-outline"],
  ["payments", tk("Payments"), "card-outline"],
  ["reviews", tk("Event reports"), "flag-outline"],
  ["activations", tk("Paid-sales activations"), "flash-outline"],
  ["support", tk("Platform support"), "chatbubbles-outline"],
  ["promotions", tk("Promo codes"), "pricetag-outline"],
  ["settings", tk("Settings"), "settings-outline"],
  ["audit", tk("Activity history"), "time-outline"],
];

const BAD = ["suspended", "failed", "disputed", "rejected", "lost", "cancelled", "open"];
const GOOD = ["paid", "succeeded", "active", "confirmed", "completed", "resolved", "won", "published", "verified", "actioned"];
function Status({ value }: { value: string }) {
  const v = value.toLowerCase();
  return <Badge tone={BAD.includes(v) ? "bad" : GOOD.includes(v) ? "live" : "neutral"} label={value.replaceAll("_", " ")} />;
}

/** One record: a title, a reference line, details, a status and actions. */
function Rec({ title, sub, lines = [], status, children, onPress }: { title: string; sub?: string; lines?: (string | null | false | undefined)[]; status?: ReactNode; children?: ReactNode; onPress?: () => void }) {
  return (
    <Card onPress={onPress}>
      <Row wrap={false} style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <T bold>{title}</T>
          {sub ? <T small muted>{sub}</T> : null}
        </View>
        {status}
      </Row>
      {lines.filter(Boolean).map((line, i) => (
        <T key={i} small>
          {line as string}
        </T>
      ))}
      {children ? <Row>{children}</Row> : null}
    </Card>
  );
}

/** A button that asks for a reason before it acts. */
function ReasonAction({ label, confirm, minLength = 3, onConfirm }: { label: string; confirm: string; minLength?: number; onConfirm: (reason: string) => Promise<void> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return <Button small kind="secondary" label={label} onPress={() => setOpen(true)} />;
  return (
    <View style={{ gap: 8, width: "100%" }}>
      <Field label={t("Reason: {action}", { action: label })} value={reason} onChangeText={setReason} maxLength={500} placeholder={t("Reason (the owner is told)")} autoFocus />
      <Row>
        <Button
          small
          kind="danger"
          label={confirm}
          busy={busy}
          disabled={reason.trim().length < minLength}
          onPress={async () => {
            setBusy(true);
            await onConfirm(reason.trim());
            setBusy(false);
            setOpen(false);
            setReason("");
          }}
        />
        <Button small kind="text" label={t("Cancel")} onPress={() => setOpen(false)} />
      </Row>
    </View>
  );
}

type Query = Record<string, string | number | boolean | undefined>;
type Act = (action: () => Promise<unknown>, message: string) => Promise<void>;
type Ctx = { k: string; q: string; filter: string; setFilter: (v: string) => void; act: Act; me: string; get: <T>(path: string, query?: Query) => (signal: AbortSignal) => Promise<T> };

function Filter({ ctx, label, options }: { ctx: Ctx; label: string; options: [string, string][] }) {
  return <Select label={label} value={ctx.filter} onChange={ctx.setFilter} options={options.map(([value, text]) => ({ value, label: text }))} />;
}

function Count({ title, n }: { title: string; n?: number }) {
  const t = useT();
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <H2>{title}</H2>
      {n !== undefined && <T muted>{t("{n} shown", { n: n })}</T>}
    </Row>
  );
}

export function AdminView({ view, me }: { view: string; me: string }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("");
  const [version, setVersion] = useState(0);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [exportKind, setExportKind] = useState("orders");
  const [exporting, setExporting] = useState(false);
  const ctx: Ctx = {
    k: `${view}:${q}:${filter}:${version}`,
    q,
    filter,
    setFilter,
    me,
    get: (path, query = {}) => (signal) => api.request(path, { signal, query: { limit: 100, ...query } }),
    act: async (action, message) => {
      setFeedback(null);
      try {
        await action();
        setVersion((v) => v + 1);
        setFeedback({ message, error: false });
      } catch (e) {
        setFeedback({ message: failure(e, t("This change could not be saved.")), error: true });
      }
    },
  };
  const searchable = ["overview", "users", "organizers", "events", "orders", "payments"].includes(view);
  return (
    <View style={{ gap: 12 }}>
      {feedback && <Notice error={feedback.error} onDismiss={() => setFeedback(null)}>{feedback.message}</Notice>}
      {searchable && (
        <View style={{ gap: 8 }}>
          <Field
            label={t("Search")}
            value={draft}
            onChangeText={setDraft}
            returnKeyType="search"
            onSubmitEditing={() => setQ(draft.trim())}
            autoCapitalize="none"
            placeholder={view === "overview" ? t("Users, events, orders, payments…") : t("Names, emails or references…")}
          />
          <Row>
            <Button small kind="secondary" icon="search" label={t("Search")} disabled={view === "overview" && draft.trim().length < 2} onPress={() => setQ(draft.trim())} />
            {q ? (
              <Button
                small
                kind="text"
                label={t("Clear")}
                onPress={() => {
                  setDraft("");
                  setQ("");
                }}
              />
            ) : null}
          </Row>
        </View>
      )}
      {view === "overview" && <Overview ctx={ctx} />}
      {view === "users" && <Users ctx={ctx} />}
      {view === "organizers" && <Organizers ctx={ctx} />}
      {view === "events" && <Events ctx={ctx} />}
      {view === "orders" && <Orders ctx={ctx} />}
      {view === "payments" && <Payments ctx={ctx} />}
      {view === "reviews" && <Reports ctx={ctx} />}
      {view === "activations" && <Activations ctx={ctx} />}
      {view === "support" && <SupportQueue ctx={ctx} />}
      {view === "promotions" && <Promotions ctx={ctx} />}
      {view === "settings" && <Settings ctx={ctx} />}
      {view === "audit" && <Audit ctx={ctx} />}
      <Card>
        <H2>{t("Take a working copy.")}</H2>
        <T small muted>{t("A CSV report built from live records. Spreadsheet formulas in cells are neutralised.")}</T>
        <Select label={t("Report")} value={exportKind} onChange={setExportKind} options={EXPORTS.map(([value, label]) => ({ value, label: t(label) }))} />
        <Button
          kind="secondary"
          icon="download-outline"
          label={t("Export CSV")}
          busy={exporting}
          onPress={async () => {
            setExporting(true);
            try {
              await shareFile(`/admin/exports/${exportKind}.csv`, `biletflow-${exportKind}.csv`);
            } catch (e) {
              setFeedback({ message: failure(e, t("Could not export this report.")), error: true });
            } finally {
              setExporting(false);
            }
          }}
        />
      </Card>
    </View>
  );
}

/* ------------------------------ Records ------------------------------ */

function UserCard({ u, ctx }: { u: AdminUser; ctx: Ctx }) {
  const t = useT();
  return (
    <Rec
      title={u.full_name}
      sub={`${u.email} · ${ref(u.id)}`}
      lines={[u.is_platform_admin ? t("Platform admin") : u.is_email_verified ? t("Verified email") : t("Email not verified"), u.suspension_reason]}
      status={<Status value={u.is_suspended ? "suspended" : "active"} />}
    >
      {u.id === ctx.me || u.is_platform_admin ? null : u.is_suspended ? (
        <Button small kind="secondary" label={t("Restore")} onPress={() => ctx.act(() => api.request(`/admin/users/${u.id}/restore`, { method: "POST" }), t("{full_name} can sign in again.", { full_name: u.full_name }))} />
      ) : (
        <ReasonAction label={t("Suspend")} confirm={t("Confirm suspend")} onConfirm={(reason) => ctx.act(() => api.request(`/admin/users/${u.id}/suspend`, { body: { reason } }), t("{full_name} is suspended and signed out everywhere.", { full_name: u.full_name }))} />
      )}
    </Rec>
  );
}

function EventCard({ e, ctx }: { e: AdminEvent; ctx: Ctx }) {
  const t = useT();
  return (
    <Rec
      title={e.title}
      sub={`${stamp(e.start_at)}${e.city ? ` · ${e.city}` : ""}`}
      lines={[t("Organizer: {organizer_name}", { organizer_name: e.organizer_name }), (e.paid_sales_open ? t("Paid sales: open") : t("Paid sales: closed")), e.lifecycle !== "upcoming" && e.lifecycle !== e.status && t("Lifecycle: {lifecycle}", { lifecycle: e.lifecycle })]}
      status={<Status value={e.is_suspended ? "suspended" : e.status} />}
    >
      <Button small kind="text" label={t("Open")} onPress={() => router.push(`/event/${e.id}`)} />
      {e.paid_sales_open && (
        <ReasonAction
          label={t("Suspend paid sales")}
          confirm={t("Suspend")}
          minLength={5}
          onConfirm={(reason) => ctx.act(() => api.request(`/admin/events/${e.id}/paid-sales/suspend`, { body: { reason } }), t("Paid sales stopped for {title}. Resume them under Paid-sales activations.", { title: e.title }))}
        />
      )}
      {e.is_suspended ? (
        <Button small kind="secondary" label={t("Restore")} onPress={() => ctx.act(() => api.request(`/admin/events/${e.id}/restore`, { method: "POST" }), t("{title} is back on sale.", { title: e.title }))} />
      ) : (
        <ReasonAction label={t("Suspend")} confirm={t("Confirm suspend")} onConfirm={(reason) => ctx.act(() => api.request(`/admin/events/${e.id}/suspend`, { body: { reason } }), t("{title} is hidden and closed to new orders. The organizer was told.", { title: e.title }))} />
      )}
    </Rec>
  );
}

const OrderCard = ({ o }: { o: AdminOrder }) => (
  <Rec
    title={`${ref(o.id)} · ${amount(o.total_kzt)}`}
    sub={stamp(o.created_at)}
    lines={[o.buyer_email, o.event_title, o.promo_code && `${o.promo_code} −${amount(o.discount_kzt)}`]}
    status={<Status value={o.status} />}
  />
);

function PaymentCard({ p, ctx }: { p: AdminPayment; ctx: Ctx }) {
  const t = useT();
  return (
    <Rec
      title={`${ref(p.id)} · ${amount(p.amount_kzt)}`}
      sub={stamp(p.created_at)}
      lines={[`${p.buyer_email} · order ${ref(p.order_id)}`, p.event_title, p.failure_reason && t("Failure: {failure_reason}", { failure_reason: p.failure_reason })]}
      status={<Status value={p.status} />}
    >
      {p.status === "succeeded" && (
        <ReasonAction label={t("Record dispute")} confirm={t("Open dispute")} onConfirm={(reason) => ctx.act(() => api.request(`/admin/payments/${p.id}/disputes`, { body: { reason } }), t("Dispute recorded."))} />
      )}
    </Rec>
  );
}

/* ------------------------------ Views ------------------------------ */

function Overview({ ctx }: { ctx: Ctx }) {
  const t = useT();
  const { get, k, q } = ctx;
  const counts = useLoad(`counts:${k}`, async (signal) => {
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
      organizers: organizers.filter((o) => o.verification_submitted_at).length,
    };
  });
  const found = useLoad(`search:${k}`, (signal) => (q.length >= 2 ? api.request<AdminSearch>("/admin/search", { signal, query: { q } }) : Promise.resolve(null)));
  const settings = useLoad(`settings-summary:${k}`, (signal) => api.request<PlatformSettings>("/admin/settings", { signal }));
  if (q)
    return (
      <Loaded data={found}>
        {(r) =>
          r && (
            <View style={{ gap: 10 }}>
              <H2>{t("Users · {length}", { length: r.users.length })}</H2>
              {r.users.map((u) => <UserCard key={u.id} u={u} ctx={ctx} />)}
              <H2>{t("Events · {length}", { length: r.events.length })}</H2>
              {r.events.map((e) => <EventCard key={e.id} e={e} ctx={ctx} />)}
              <H2>{t("Orders · {length}", { length: r.orders.length })}</H2>
              {r.orders.map((o) => <OrderCard key={o.id} o={o} />)}
              <H2>{t("Payments · {length}", { length: r.payments.length })}</H2>
              {r.payments.map((p) => <PaymentCard key={p.id} p={p} ctx={ctx} />)}
            </View>
          )
        }
      </Loaded>
    );
  const c = counts.data;
  const queue: [string, string, number | undefined, string][] = [
    ["reviews", t("Event reports"), c?.reports, t("Awaiting review")],
    ["support", t("Platform support"), c?.support, t("Organizer and escalated cases not resolved")],
    ["payments", t("Failed payments"), c?.failed, t("Simulated payment failures")],
    ["organizers", t("Identity checks"), c?.organizers, t("Organizers waiting for a decision")],
    ["users", t("Suspended users"), c?.suspended, t("Sign-in blocked")],
  ];
  return (
    <View style={{ gap: 10 }}>
      {counts.status === "error" && <Notice error>{counts.error?.message ?? t("Could not load the counts.")}</Notice>}
      {queue.map(([view, label, n, detail]) => (
        <Card key={view} onPress={() => router.push(`/admin/${view}`)}>
          <Row wrap={false} style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <T bold>{label}</T>
              <T small muted>{detail}</T>
            </View>
            <T style={{ fontSize: 24, fontWeight: "700", color: color.gold }}>{n ?? "–"}</T>
            <Icon name="chevron-forward" tint={color.muted} />
          </Row>
        </Card>
      ))}
      <Card onPress={() => router.push("/admin/settings")}>
        <H2>{t("Platform at a glance.")}</H2>
        <T small>{settings.data ? (settings.data.bookings_enabled ? t("New bookings: accepted") : t("New bookings: paused")) : t("New bookings: –")}</T>
        <T small>{t("Activation fee:")}{" "}{settings.data ? amount(settings.data.activation_fee_kzt) : "–"}</T>
        <T small>{t("Support email:")}{" "}{settings.data?.support_email ?? "–"}</T>
      </Card>
    </View>
  );
}

function Users({ ctx }: { ctx: Ctx }) {
  const t = useT();
  const data = useLoad(ctx.k, ctx.get<AdminUser[]>("/admin/users", { q: ctx.q || undefined }));
  return (
    <View style={{ gap: 10 }}>
      <Count title={t("Users")} n={data.data?.length} />
      <T small muted>{t("Suspending blocks sign-in, signs the person out everywhere and takes their events out of public view.")}</T>
      <Loaded data={data}>{(list) => (list.length ? list.map((u) => <UserCard key={u.id} u={u} ctx={ctx} />) : <T muted>{t("No matching records.")}</T>)}</Loaded>
    </View>
  );
}

function Organizers({ ctx }: { ctx: Ctx }) {
  const t = useT();
  const data = useLoad(ctx.k, ctx.get<AdminOrganizer[]>("/admin/organizers", { q: ctx.q || undefined, verification_status: ctx.filter || undefined }));
  const decide = (o: AdminOrganizer, status: "verified" | "rejected") =>
    ctx.act(() => api.request(`/organizers/${o.id}/verification`, { method: "PATCH", body: { verification_status: status } }), `${o.display_name} is ${status}.`);
  return (
    <View style={{ gap: 10 }}>
      <Count title={t("Organizer identity checks")} n={data.data?.length} />
      <Filter ctx={ctx} label={t("Status")} options={[["", t("All")], ["pending", t("Pending")], ["verified", t("Verified")], ["rejected", t("Rejected")]]} />
      <T small muted>{t("A valid IIN/BIN verifies an organizer automatically (simulated). Reject when the details look wrong; their next submission then waits for you.")}</T>
      <Loaded data={data}>
        {(list) =>
          list.length ? (
            list.map((o) => (
              <Rec
                key={o.id}
                title={o.display_name}
                sub={o.email}
                lines={[
                  o.legal_name ? `${o.legal_name}${o.tax_id_masked ? ` · IIN/BIN ${o.tax_id_masked}` : ""}` : t("Details not submitted"),
                  o.verification_submitted_at && t("Submitted {stamp}", { stamp: stamp(o.verification_submitted_at) }),
                ]}
                status={<Status value={o.verification_status === "pending" && !o.verification_submitted_at ? "not submitted" : o.verification_status} />}
              >
                {o.legal_name && o.verification_status !== "verified" && <Button small label={t("Verify")} onPress={() => decide(o, "verified")} />}
                {o.legal_name && o.verification_status !== "rejected" && <Button small kind="secondary" label={t("Reject")} onPress={() => decide(o, "rejected")} />}
              </Rec>
            ))
          ) : (
            <T muted>{t("No matching records.")}</T>
          )
        }
      </Loaded>
    </View>
  );
}

function Events({ ctx }: { ctx: Ctx }) {
  const t = useT();
  const data = useLoad(ctx.k, ctx.get<AdminEvent[]>("/admin/events", { q: ctx.q || undefined }));
  return (
    <View style={{ gap: 10 }}>
      <Count title={t("Events")} n={data.data?.length} />
      <T small muted>{t("A suspended event is hidden from attendees and takes no new orders. Issued tickets stay valid.")}</T>
      <Loaded data={data}>{(list) => (list.length ? list.map((e) => <EventCard key={e.id} e={e} ctx={ctx} />) : <T muted>{t("No matching records.")}</T>)}</Loaded>
    </View>
  );
}

function Orders({ ctx }: { ctx: Ctx }) {
  const t = useT();
  const data = useLoad(ctx.k, ctx.get<AdminOrder[]>("/admin/orders", { q: ctx.q || undefined }));
  return (
    <View style={{ gap: 10 }}>
      <Count title={t("Orders")} n={data.data?.length} />
      <Loaded data={data}>{(list) => (list.length ? list.map((o) => <OrderCard key={o.id} o={o} />) : <T muted>{t("No matching records.")}</T>)}</Loaded>
    </View>
  );
}

function Payments({ ctx }: { ctx: Ctx }) {
  const t = useT();
  const payments = useLoad(ctx.k, ctx.get<AdminPayment[]>("/admin/payments", { q: ctx.q || undefined, status: ctx.filter || undefined }));
  const refunds = useLoad(`refunds:${ctx.k}`, ctx.get<AdminRefund[]>("/admin/refunds"));
  const disputes = useLoad(`disputes:${ctx.k}`, ctx.get<Dispute[]>("/admin/disputes"));
  const [section, setSection] = useState("payments");
  return (
    <View style={{ gap: 10 }}>
      <Select
        label={t("Show")}
        value={section}
        onChange={setSection}
        options={[
          { value: "payments", label: t("Payments") },
          { value: "refunds", label: t("Refunds") },
          { value: "disputes", label: t("Disputes") },
        ]}
      />
      {section === "payments" && (
        <>
          <Filter ctx={ctx} label={t("Status")} options={[["", t("All payments")], ["succeeded", t("Succeeded")], ["failed", t("Failed")]]} />
          <Loaded data={payments}>{(list) => (list.length ? list.map((p) => <PaymentCard key={p.id} p={p} ctx={ctx} />) : <T muted>{t("No matching records.")}</T>)}</Loaded>
        </>
      )}
      {section === "refunds" && (
        <Loaded data={refunds}>
          {(list) =>
            list.length ? (
              list.map((r) => (
                <Rec
                  key={r.id}
                  title={`${ref(r.id)} · ${amount(r.amount_kzt)}`}
                  sub={stamp(r.created_at)}
                  lines={[`${r.buyer_email} · order ${ref(r.order_id)}`, r.event_title, t("Reason: {reason}", { reason: r.reason }), `By ${r.initiated_by_name ?? "—"}`]}
                />
              ))
            ) : (
              <T muted>{t("No refunds.")}</T>
            )
          }
        </Loaded>
      )}
      {section === "disputes" && (
        <Loaded data={disputes}>
          {(list) =>
            list.length ? (
              list.map((d) => (
                <Rec
                  key={d.id}
                  title={`${ref(d.id)} · ${amount(d.amount_kzt)}`}
                  sub={stamp(d.created_at)}
                  lines={[t("Order {order} · payment {payment}", { order: ref(d.order_id), payment: ref(d.payment_id) }), t("Reason: {reason}", { reason: d.reason }), d.status !== "open" && (d.resolution_note ?? (d.resolved_at ? t("Resolved {stamp}", { stamp: stamp(d.resolved_at) }) : null))]}
                  status={<Status value={d.status} />}
                >
                  {d.status === "open" && (
                    <>
                      <Button small kind="secondary" label={t("Won")} onPress={() => ctx.act(() => api.request(`/admin/disputes/${d.id}`, { method: "PATCH", body: { status: "won" } }), t("Dispute marked as won."))} />
                      <Button small kind="secondary" label={t("Lost")} onPress={() => ctx.act(() => api.request(`/admin/disputes/${d.id}`, { method: "PATCH", body: { status: "lost" } }), t("Dispute marked as lost."))} />
                    </>
                  )}
                </Rec>
              ))
            ) : (
              <T muted>{t("No disputes.")}</T>
            )
          }
        </Loaded>
      )}
    </View>
  );
}

function Reports({ ctx }: { ctx: Ctx }) {
  const t = useT();
  const data = useLoad(ctx.k, ctx.get<EventReport[]>("/admin/reports", { status: ctx.filter || undefined }));
  const review = (r: EventReport, decision: "dismissed" | "actioned", suspend: boolean, note?: string) =>
    ctx.act(
      () => api.request(`/admin/reports/${r.id}/review`, { body: { decision, suspend_event: suspend, note: note || null } }),
      suspend ? t("Report actioned and the event suspended.") : decision === "dismissed" ? t("Report dismissed.") : t("Report marked as handled."),
    );
  return (
    <View style={{ gap: 10 }}>
      <Count title={t("Reported events")} n={data.data?.length} />
      <Filter ctx={ctx} label={t("Status")} options={[["", t("All")], ["pending", t("Pending")], ["dismissed", t("Dismissed")], ["actioned", t("Actioned")]]} />
      <Loaded data={data}>
        {(list) =>
          list.length ? (
            list.map((r) => (
              <Rec
                key={r.id}
                title={r.event_title}
                sub={stamp(r.created_at)}
                lines={[r.reason, r.status !== "pending" && `${r.review_note ?? t("Reviewed")}${r.reviewed_at ? ` · ${stamp(r.reviewed_at)}` : ""}`]}
                status={<Status value={r.status} />}
              >
                <Button small kind="text" label={t("Open event")} onPress={() => router.push(`/event/${r.event_id}`)} />
                {r.status === "pending" && (
                  <>
                    <Button small kind="secondary" label={t("Dismiss")} onPress={() => review(r, "dismissed", false)} />
                    <ReasonAction label={t("Suspend event")} confirm={t("Suspend")} onConfirm={(note) => review(r, "actioned", true, note)} />
                  </>
                )}
              </Rec>
            ))
          ) : (
            <T muted>{t("No matching records.")}</T>
          )
        }
      </Loaded>
    </View>
  );
}

function Activations({ ctx }: { ctx: Ctx }) {
  const t = useT();
  const data = useLoad(ctx.k, ctx.get<ActivationRecord[]>("/admin/activations", { status: ctx.filter || undefined, limit: undefined }));
  return (
    <View style={{ gap: 10 }}>
      <Count title={t("Paid-sales activations")} n={data.data?.length} />
      <Filter ctx={ctx} label={t("Status")} options={[["", t("All")], ["pending", t("Pending")], ["active", t("Active")], ["suspended", t("Suspended")]]} />
      <T small muted>{t("Fees are simulated; no money moves. Suspending paid sales leaves free tickets and sold tickets alone.")}</T>
      <Loaded data={data}>
        {(list) =>
          list.length ? (
            list.map((a) => (
              <Rec
                key={a.id}
                title={a.event_title}
                sub={`${a.organizer_name} · ${stamp(a.created_at)}`}
                lines={[
                  (a.fee_paid_at ? t("Fee {amount} · paid {when}", { amount: amount(a.fee_kzt), when: stamp(a.fee_paid_at) }) : t("Fee {amount} · not paid", { amount: amount(a.fee_kzt) })),
                  a.terms_accepted_at ? t("Terms {version} accepted", { version: a.terms_version ?? "" }) : t("Terms not accepted"),
                  a.suspension_reason,
                ]}
                status={<Status value={a.status} />}
              >
                {a.status === "active" && (
                  <ReasonAction
                    label={t("Suspend paid sales")}
                    confirm={t("Suspend")}
                    minLength={5}
                    onConfirm={(reason) => ctx.act(() => api.request(`/admin/events/${a.event_id}/paid-sales/suspend`, { body: { reason } }), t("Paid sales suspended. The organizer was emailed."))}
                  />
                )}
                {a.status === "suspended" && (
                  <Button small kind="secondary" label={t("Resume")} onPress={() => ctx.act(() => api.request(`/admin/events/${a.event_id}/paid-sales/resume`, { method: "POST" }), t("Paid sales resumed."))} />
                )}
              </Rec>
            ))
          ) : (
            <T muted>{t("No matching records.")}</T>
          )
        }
      </Loaded>
    </View>
  );
}

function SupportQueue({ ctx }: { ctx: Ctx }) {
  const t = useT();
  const data = useLoad(ctx.k, (signal) => api.request<CaseSummary[]>("/support/cases", { signal, query: { scope: "handling", status: ctx.filter || undefined } }));
  return (
    <View style={{ gap: 10 }}>
      <Count title={t("Organizer and escalated support")} n={data.data?.length} />
      <Filter ctx={ctx} label={t("Status")} options={[["", t("All")], ["open", t("Open")], ["in_progress", t("In Progress")], ["waiting_for_customer", t("Waiting for Customer")], ["resolved", t("Resolved")]]} />
      <Loaded data={data}>
        {(list) =>
          list.length ? (
            list.map((c) => (
              <Rec
                key={c.id}
                title={c.subject}
                sub={`${caseRef(c.id)} · ${c.audience === "organizer" ? t("Organizer") : (c.event_title ? t("Escalated · {event}", { event: c.event_title }) : t("Escalated"))}`}
                lines={[`${c.requester_name} · ${CATEGORY_LABELS[c.category] ?? c.category}`, (c.assignee_name ? t("Assigned to {name}", { name: c.assignee_name }) : t("Not assigned yet"))]}
                status={<Status value={c.status_label} />}
                onPress={() => router.push(`/support/${c.id}`)}
              />
            ))
          ) : (
            <T muted>{t("No cases in this queue.")}</T>
          )
        }
      </Loaded>
    </View>
  );
}

function Promotions({ ctx }: { ctx: Ctx }) {
  const t = useT();
  const data = useLoad(ctx.k, ctx.get<PromoActivity[]>("/admin/promo-activity"));
  return (
    <View style={{ gap: 10 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <H2>{t("Promo-code activity")}</H2>
        <T muted>{t("Redemptions: {n}", { n: data.data?.length ?? "" })}</T>
      </Row>
      <Loaded data={data}>
        {(list) =>
          list.length ? (
            list.map((p) => (
              <Rec
                key={p.redemption_id}
                title={`${p.code} · −${amount(p.discount_kzt)}`}
                sub={`${p.campaign_name} · ${stamp(p.created_at)}`}
                lines={[p.buyer_email, p.event_title, t("Order {ref} · {order_status}", { ref: ref(p.order_id), order_status: p.order_status })]}
              />
            ))
          ) : (
            <T muted>{t("No redemptions yet.")}</T>
          )
        }
      </Loaded>
    </View>
  );
}

function Settings({ ctx }: { ctx: Ctx }) {
  const data = useLoad(ctx.k, (signal) => api.request<PlatformSettings>("/admin/settings", { signal }));
  return <Loaded data={data}>{(s) => <SettingsForm key={s.updated_at ?? "initial"} s={s} act={ctx.act} />}</Loaded>;
}

function SettingsForm({ s, act }: { s: PlatformSettings; act: Act }) {
  const t = useT();
  const [fee, setFee] = useState(String(s.activation_fee_kzt));
  const [email, setEmail] = useState(s.support_email);
  const [bookings, setBookings] = useState(s.bookings_enabled);
  const [busy, setBusy] = useState(false);
  // Send only what changed, so an unchanged value is never re-validated
  const body = {
    ...(Number(fee) !== s.activation_fee_kzt ? { activation_fee_kzt: Number(fee) } : {}),
    ...(email.trim() !== s.support_email ? { support_email: email.trim() } : {}),
    ...(bookings !== s.bookings_enabled ? { bookings_enabled: bookings } : {}),
  };
  return (
    <Card>
      <H2>{t("Platform settings")}</H2>
      <Field label={t("Paid-sales activation fee (KZT)")} value={fee} onChangeText={setFee} keyboardType="number-pad" hint={t("Applies to activation records created from now on. Existing records keep their fee.")} />
      <Field label={t("Platform support email")} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" maxLength={255} />
      <Toggle label={t("Accept new bookings")} hint={t("When paused, nobody can start a checkout. Existing orders, tickets and support stay available.")} value={bookings} onChange={setBookings} />
      {s.updated_at ? <T small muted>{t("Last changed {stamp}", { stamp: stamp(s.updated_at) })}</T> : null}
      <Button
        icon="checkmark"
        label={t("Save platform settings")}
        busy={busy}
        disabled={!Object.keys(body).length || !Number.isFinite(Number(fee)) || Number(fee) < 0}
        onPress={async () => {
          setBusy(true);
          await act(() => api.request("/admin/settings", { method: "PATCH", body }), t("Platform settings saved."));
          setBusy(false);
        }}
      />
    </Card>
  );
}

function Audit({ ctx }: { ctx: Ctx }) {
  const t = useT();
  const data = useLoad(ctx.k, ctx.get<AuditRow[]>("/admin/audit", { action: ctx.filter || undefined, limit: 200 }));
  return (
    <View style={{ gap: 10 }}>
      <H2>{t("Activity history")}</H2>
      <Filter
        ctx={ctx}
        label={t("Area")}
        options={[["", t("Everything")], ["platform.", t("Platform admin")], ["organizer.", t("Organizers")], ["event.", t("Events")], ["order.", t("Orders")], ["payment.", t("Payments")], ["refund.", t("Refunds")], ["activation.", t("Activations")], ["promo.", t("Promotions")], ["support.", t("Support")], ["check_in.", t("Check-in")]]}
      />
      <T small muted>{t("Read-only. Entries cannot be edited or deleted.")}</T>
      <Loaded data={data}>
        {(list) =>
          list.length ? (
            list.map((a) => (
              <View key={a.id} style={{ borderLeftWidth: 2, borderLeftColor: color.ember, paddingLeft: 10, gap: 2 }}>
                <T small muted>
                  {stamp(a.created_at)} · {a.entity_type.replaceAll("_", " ")}
                </T>
                <T>
                  <T bold>{a.actor_name ?? t("System")}</T> {a.description}
                </T>
              </View>
            ))
          ) : (
            <T muted>{t("Nothing recorded yet.")}</T>
          )
        }
      </Loaded>
    </View>
  );
}
