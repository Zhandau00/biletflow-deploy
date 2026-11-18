/** Organizer screens: become an organizer, the dashboard, the profile, event actions. */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/client";
import { eventDate, posterInfo, type ApiEvent } from "@/lib/events";
import type { MyEvent, MyOrganizerProfile, OverviewRow, PayoutAccount } from "@/lib/organizer";
import { Poster } from "../poster";
import { refreshSession, useSession } from "../session";
import { amount } from "../format";
import { failure, useLoad } from "../use-load";
import { Badge, Button, Card, Chips, Empty, Field, H2, Intro, Loaded, Notice, Progress, Row, Stat, T } from "../ui";
import { lifecycleLabel, type EventContext } from "./shared";

/* ------------------------------ Become an organizer ------------------------------ */

export function BecomeOrganizer() {
  const { user } = useSession();
  const [name, setName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api.request("/organizers/", { body: { display_name: name.trim(), contact_email: email.trim() || null } });
      await refreshSession();
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <Intro eyebrow="On the other side of the stage" title="Open your box office." description="Create an organizer profile to publish events, sell tickets and welcome your guests." />
      {!user?.is_email_verified && <Notice>Confirm your email address first; organizer tools need a confirmed email. You can resend the link from Account.</Notice>}
      <Field label="Organizer name (shown on your events)" value={name} onChangeText={setName} maxLength={255} />
      <Field label="Contact email for guests" optional value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" maxLength={255} placeholder={user?.email} />
      {error ? <Notice error>{error}</Notice> : null}
      <Button label={busy ? "Creating…" : "Create organizer profile"} busy={busy} disabled={name.trim().length < 2} onPress={submit} />
    </View>
  );
}

/* ------------------------------ Dashboard ------------------------------ */

const LIFECYCLES = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "Now" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export function EventsOverview({ version = 0 }: { version?: number }) {
  const { user, organizer } = useSession();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const data = useLoad(`organizer-events:${version}`, async (signal) => {
    const [events, overview] = await Promise.all([
      api.request<MyEvent[]>("/events/mine", { signal }),
      api.request<OverviewRow[]>("/analytics/events", { signal }).catch(() => [] as OverviewRow[]),
    ]);
    return { events, overview };
  });
  return (
    <Loaded data={data}>
      {({ events, overview }) => {
        const stats = new Map(overview.map((row) => [row.event_id, row]));
        const sold = overview.reduce((n, r) => n + r.tickets_sold, 0);
        const revenue = overview.reduce((n, r) => n + r.net_revenue_kzt, 0);
        const visible = events.filter(
          (e) => (filter === "all" || e.lifecycle === filter) && `${e.title} ${e.venue_name ?? ""} ${e.city ?? ""}`.toLowerCase().includes(search.toLowerCase()),
        );
        return (
          <View style={{ gap: 12 }}>
            <Intro eyebrow="A little planning. A full house." title={`Hello, ${user?.full_name.split(" ")[0] ?? ""}.`} description="Here’s how things are shaping up at your box office." />
            <Row>
              {organizer && <Button icon="add" label="Create event" onPress={() => router.push("/organizer/new")} />}
              {organizer && <Button kind="secondary" label="Organizer profile" onPress={() => router.push("/organizer/profile")} />}
              <Button kind="secondary" icon="qr-code-outline" label="Check-in desk" onPress={() => router.push("/check-in")} />
            </Row>
            <Row>
              <Stat label="Net revenue" value={amount(revenue)} note="After discounts and refunds (simulated)" icon="stats-chart" />
              <Stat label="Tickets sold" value={sold} note={`Across ${overview.length} ${overview.length === 1 ? "event" : "events"}`} icon="ticket-outline" />
              <Stat
                label="Live events"
                value={events.filter((e) => e.lifecycle === "upcoming" || e.lifecycle === "active").length}
                note={`${events.filter((e) => e.lifecycle === "draft").length} drafts in the wings`}
                icon="calendar-outline"
              />
            </Row>
            <H2>Your events</H2>
            <Field label="Find an event" value={search} onChangeText={setSearch} placeholder="Name, venue or city" />
            <Chips
              value={filter}
              onChange={setFilter}
              options={LIFECYCLES.map((t) => ({ value: t.value, label: `${t.label} (${events.filter((e) => t.value === "all" || e.lifecycle === t.value).length})` }))}
            />
            {visible.length ? (
              visible.map((event) => {
                const row = stats.get(event.id);
                const booked = row?.tickets_sold ?? 0;
                const capacity = row?.capacity ?? event.capacity;
                const live = event.lifecycle === "upcoming" || event.lifecycle === "active";
                return (
                  <Card key={event.id} onPress={() => (event.my_role === "owner" || event.my_role === "manager" ? router.push(`/organizer/${event.id}`) : router.push("/check-in"))}>
                    <Row wrap={false} style={{ alignItems: "flex-start" }}>
                      <View style={{ width: 74 }}>
                        <Poster event={posterInfo(event)} compact />
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Badge tone={live ? "live" : "neutral"} label={lifecycleLabel(event.lifecycle)} />
                        <H2>{event.title}</H2>
                        <T small muted>
                          {eventDate(event.start_at, event.timezone, { weekday: "short", day: "numeric", month: "short" })} · {event.venue_name ?? "Venue to be announced"}
                          {event.my_role !== "owner" ? ` · ${event.my_role.replace("_", " ")}` : ""}
                        </T>
                      </View>
                    </Row>
                    <Row style={{ justifyContent: "space-between" }}>
                      <T small>
                        {booked} / {capacity} sold
                      </T>
                      <T small bold>
                        {amount(row?.net_revenue_kzt ?? 0)} net
                      </T>
                    </Row>
                    <Progress value={capacity ? (booked / capacity) * 100 : 0} />
                  </Card>
                );
              })
            ) : (
              <Empty
                icon="calendar-outline"
                title={events.length ? "No events match just yet." : "It starts with an idea."}
                description={events.length ? "Try a different search or status." : "Give it a name, pick a date, and invite the city in."}
                action={organizer ? "Create your first event" : undefined}
                onAction={() => router.push("/organizer/new")}
              />
            )}
          </View>
        );
      }}
    </Loaded>
  );
}

/* ------------------------------ Event actions ------------------------------ */

export function EventActions({ ctx }: { ctx: EventContext }) {
  const { event, role } = ctx;
  const [busy, setBusy] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  async function act(kind: string, path: string, done: string) {
    setBusy(kind);
    try {
      const next = await api.request<ApiEvent>(`/events/${event.id}/${path}`, { method: "POST" });
      await refreshSession();
      if (kind === "duplicate") {
        router.push({ pathname: "/organizer/[id]", params: { id: next.id, tab: "Details" } });
        return;
      }
      ctx.setEvent(next);
      ctx.notify(done);
    } catch (e) {
      ctx.notify(failure(e), true);
    } finally {
      setBusy("");
      setConfirmCancel(false);
    }
  }
  const draft = event.status === "draft";
  const ended = event.lifecycle === "completed" || event.lifecycle === "cancelled";
  return (
    <View style={{ gap: 8 }}>
      <Row>
        <Button small kind="secondary" icon="open-outline" label={draft ? "Preview" : "View event"} onPress={() => router.push(`/event/${event.id}`)} />
        {!ended && (
          <Button
            small
            kind={draft ? "primary" : "secondary"}
            label={draft ? "Publish event" : "Unpublish"}
            busy={busy === "publish" || busy === "unpublish"}
            disabled={!!busy}
            onPress={() => (draft ? act("publish", "publish", "Your event is published.") : act("unpublish", "unpublish", "Event unpublished. Existing orders are kept."))}
          />
        )}
        <Button small kind="secondary" label="Duplicate" busy={busy === "duplicate"} disabled={!!busy} onPress={() => act("duplicate", "duplicate", "")} />
        {role === "owner" && !ended && !draft && !confirmCancel && <Button small kind="danger" label="Cancel event" onPress={() => setConfirmCancel(true)} />}
      </Row>
      {confirmCancel && (
        <Card>
          <T>Cancel the event and refund every order?</T>
          <Row>
            <Button
              small
              kind="danger"
              label="Yes, cancel event"
              busy={busy === "cancel"}
              disabled={!!busy}
              onPress={() => act("cancel", "cancel", "Event cancelled. Paid orders were refunded (simulated) and ticket holders were emailed.")}
            />
            <Button small kind="text" label="Keep it" onPress={() => setConfirmCancel(false)} />
          </Row>
        </Card>
      )}
    </View>
  );
}

/* ------------------------------ Organizer profile ------------------------------ */

const VERIFICATION: Record<string, string> = {
  pending: "Submitted — the BiletFlow team is checking it",
  verified: "Verified",
  rejected: "Rejected — check the details and submit again",
};

export function OrganizerProfileView() {
  const [version, setVersion] = useState(0);
  const data = useLoad(`organizer-profile:${version}`, async (signal) => {
    const [profile, payout] = await Promise.all([
      api.request<MyOrganizerProfile>("/organizers/me", { signal }),
      api.request<PayoutAccount>("/organizers/me/payout-account", { signal }).catch((e) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
    ]);
    return { profile, payout };
  });
  return (
    <Loaded data={data}>
      {({ profile, payout }) => <ProfileForms key={version} profile={profile} payout={payout} onSaved={() => setVersion((v) => v + 1)} />}
    </Loaded>
  );
}

function ProfileForms({ profile, payout, onSaved }: { profile: MyOrganizerProfile; payout: PayoutAccount | null; onSaved: () => void }) {
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState("");
  const [d, setD] = useState({
    display_name: profile.display_name,
    contact_email: profile.contact_email ?? "",
    contact_phone: profile.contact_phone ?? "",
    website_url: profile.website_url ?? "",
    description: profile.description ?? "",
  });
  const [legalName, setLegalName] = useState(profile.legal_name ?? "");
  const [taxId, setTaxId] = useState("");
  const [holder, setHolder] = useState(payout?.holder_name ?? profile.legal_name ?? "");
  const [bank, setBank] = useState(payout?.bank_name ?? "");
  const [iban, setIban] = useState("");
  const text = (v: string) => v.trim() || null;

  async function run(kind: string, action: () => Promise<unknown>, done: string) {
    setBusy(kind);
    setNotice(null);
    try {
      await action();
      if (kind === "details") await refreshSession();
      onSaved();
    } catch (e) {
      setNotice({ text: failure(e), error: true });
      setBusy("");
      return;
    }
    setBusy("");
    setNotice({ text: done, error: false });
  }

  const status =
    profile.verification_status && (profile.verification_submitted_at || profile.verification_status !== "pending")
      ? VERIFICATION[profile.verification_status]
      : "Not submitted";
  return (
    <View style={{ gap: 12 }}>
      <Intro eyebrow="How guests see you" title="Organizer profile." description="Your public details, identity check and payout account. The last two are needed before paid tickets can go on sale." />
      {notice && <Notice error={notice.error} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
      <Card>
        <H2>Public details</H2>
        <Field label="Organizer name" value={d.display_name} onChangeText={(v) => setD({ ...d, display_name: v })} maxLength={255} />
        <Field label="Contact email" optional value={d.contact_email} onChangeText={(v) => setD({ ...d, contact_email: v })} keyboardType="email-address" autoCapitalize="none" maxLength={255} />
        <Field label="Contact phone" optional value={d.contact_phone} onChangeText={(v) => setD({ ...d, contact_phone: v })} keyboardType="phone-pad" maxLength={30} placeholder="+7 700 000 0000" />
        <Field label="Website" optional value={d.website_url} onChangeText={(v) => setD({ ...d, website_url: v })} keyboardType="url" autoCapitalize="none" maxLength={500} placeholder="https://" />
        <Field label="About you" optional value={d.description} onChangeText={(v) => setD({ ...d, description: v })} multiline maxLength={2000} />
        <Button
          label="Save details"
          busy={busy === "details"}
          disabled={d.display_name.trim().length < 2}
          onPress={() =>
            run(
              "details",
              () =>
                api.request("/organizers/me", {
                  method: "PATCH",
                  body: {
                    display_name: text(d.display_name),
                    contact_email: text(d.contact_email),
                    contact_phone: text(d.contact_phone),
                    website_url: text(d.website_url),
                    description: text(d.description),
                  },
                }),
              "Profile saved.",
            )
          }
        />
      </Card>
      <Card>
        <H2>Identity check</H2>
        <T muted>
          Status: <T bold>{status}</T>
          {profile.legal_name ? ` · ${profile.legal_name}` : ""}
          {profile.tax_id_masked ? ` · IIN/BIN ${profile.tax_id_masked}` : ""}
        </T>
        {profile.verification_status !== "verified" && (
          <>
            <Field label="Legal name (person or company)" value={legalName} onChangeText={setLegalName} maxLength={255} />
            <Field label="IIN or BIN" value={taxId} onChangeText={(v) => setTaxId(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={12} placeholder="12 digits" />
            <Button
              kind="secondary"
              label="Submit for verification"
              busy={busy === "identity"}
              disabled={legalName.trim().length < 2 || taxId.length !== 12}
              onPress={() =>
                run("identity", () => api.request("/organizers/me/verification", { body: { legal_name: text(legalName), tax_id: taxId } }), "Submitted. The BiletFlow team will confirm your identity.")
              }
            />
          </>
        )}
      </Card>
      <Card>
        <H2>Payout account</H2>
        <T muted>
          {payout
            ? `${payout.holder_name} · ${payout.bank_name} · ${payout.iban_masked}${payout.is_verified ? " · verified" : ""}${payout.is_simulated ? " · payouts are simulated" : ""}`
            : "No account yet. Ticket revenue would be paid here."}
        </T>
        <Field label="Account holder" value={holder} onChangeText={setHolder} maxLength={255} />
        <Field label="Bank" value={bank} onChangeText={setBank} maxLength={255} placeholder="Halyk Bank" />
        <Field
          label="IBAN"
          value={iban}
          onChangeText={(v) => setIban(v.replace(/\s/g, "").toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={34}
          placeholder="KZ…"
          hint="Kazakhstan IBAN, 20 characters starting with KZ"
        />
        <Button
          kind="secondary"
          label={payout ? "Replace account" : "Save account"}
          busy={busy === "payout"}
          disabled={holder.trim().length < 2 || bank.trim().length < 2 || iban.length < 15}
          onPress={() =>
            run("payout", () => api.request("/organizers/me/payout-account", { method: "PUT", body: { holder_name: text(holder), bank_name: text(bank), iban } }), "Payout account saved.")
          }
        />
      </Card>
    </View>
  );
}
