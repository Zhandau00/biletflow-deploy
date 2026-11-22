/** Open a support request: attendees ask the event team, organizers ask the platform. */
import { useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import type { Order } from "@/lib/orders";
import { CATEGORIES_BY_AUDIENCE, CATEGORY_LABELS, type CaseAudience, type CaseCategory, type CaseDetail } from "@/lib/support";
import { openSupport, signInFirst } from "@/components/links";
import { useSession } from "@/components/session";
import { stamp, ref } from "@/components/format";
import { failure, useLoad } from "@/components/use-load";
import { Button, Card, Empty, Facts, Field, H2, Intro, Loading, Notice, Screen, Select, T } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function NewSupportCase() {
  const t = useT();
  const query = useLocalSearchParams<{ event?: string; order?: string; ticket?: string; to?: string; category?: string }>();
  const { user, organizer, ready } = useSession();
  const hasBooking = !!(query.order || query.ticket);
  // Organizers write to the platform team unless they ask about their own booking
  const audience: CaseAudience = query.to === "platform" || (organizer && !hasBooking && !query.event) ? "organizer" : "attendee";
  const needsBooking = audience === "attendee" && !query.event && !hasBooking;
  const choices = CATEGORIES_BY_AUDIENCE[audience];
  const [category, setCategory] = useState<CaseCategory>(
    (choices as string[]).includes(query.category ?? "") ? (query.category as CaseCategory) : choices[0],
  );
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const context = useLoad(`support-context:${user?.id}:${query.event ?? ""}:${query.order ?? ""}:${needsBooking}`, async (signal) => {
    if (!user) return { event: null, order: null, orders: [] as Order[] };
    const [event, order, orders] = await Promise.all([
      query.event ? api.request<{ id: string; title: string }>(`/events/${query.event}`, { signal }).catch(() => null) : null,
      query.order ? api.request<Order>(`/orders/${query.order}`, { signal }).catch(() => null) : null,
      needsBooking ? api.request<Order[]>("/orders/mine", { signal }) : ([] as Order[]),
    ]);
    return { event, order, orders };
  });

  if (!ready)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!user)
    return (
      <Screen>
        <Empty icon="mail-outline" title={t("Sign in to ask for help.")} action={t("Sign in")} onAction={() => signInFirst("/support")} />
      </Screen>
    );

  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const created = await api.request<CaseDetail>("/support/cases", {
        body: {
          audience,
          category,
          subject: subject.trim(),
          message: body.trim(),
          event_id: query.event || null,
          order_id: query.order || null,
          ticket_id: query.ticket || null,
        },
      });
      router.replace(`/support/${created.id}`);
    } catch (e) {
      setError(failure(e, t("Could not open this support request.")));
      submitting.current = false;
      setBusy(false);
    }
  }

  if (needsBooking)
    return (
      <Screen>
        <Intro title={t("Which booking is it about?")} description={t("Attendee questions go to the team running the event, so pick the booking first.")} />
        {!context.data ? (
          <Loading />
        ) : context.data.orders.length ? (
          context.data.orders.map((o) => (
            <Card key={o.id} onPress={() => router.setParams({ event: o.event_id, order: o.id })}>
              <T small muted>
                {ref(o.id)} · {stamp(o.event_start_at)}
              </T>
              <H2>{o.event_title}</H2>
            </Card>
          ))
        ) : (
          <Empty icon="mail-outline" title={t("No bookings yet.")} description={t("For a question about an event, use “Ask about this event” on its page.")} action={t("Browse events")} onAction={() => router.replace("/")} />
        )}
        {organizer && <Button kind="text" label={t("Organizer question? Write to the BiletFlow team")} onPress={() => openSupport({ to: "platform" })} />}
      </Screen>
    );

  const event = context.data?.event;
  const order = context.data?.order;
  return (
    <Screen>
      <Intro
        eyebrow={t("BiletFlow support")}
        title={t("Tell us what happened.")}
        description={
          audience === "organizer"
            ? t("Ask the BiletFlow team about your account, paid-sales activation, payments or a technical issue.")
            : t("Your message goes to the team running the event. The event, order and ticket are included.")
        }
      />
      <Select label={t("Issue category")} value={category} onChange={setCategory} options={choices.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} disabled={busy} />
      <Field label={t("Subject")} value={subject} onChangeText={setSubject} placeholder={t("A short description of the issue")} maxLength={200} editable={!busy} />
      <Field
        label={t("What can we help with?")}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={5000}
        placeholder={t("Tell us what happened and what you need.")}
        hint={t("Up to 5,000 characters. Never share passwords or card details.")}
        editable={!busy}
      />
      <Facts
        rows={[
          [t("From"), `${user.full_name} · ${user.email}`],
          [t("Goes to"), audience === "organizer" ? t("BiletFlow platform support") : t("The event's organizer team")],
          ...(query.event ? ([[t("Event"), event?.title ?? order?.event_title ?? t("Event")]] as [string, string][]) : []),
          ...(query.order ? ([[t("Order"), ref(query.order)]] as [string, string][]) : []),
          ...(query.ticket ? ([[t("Ticket"), ref(query.ticket)]] as [string, string][]) : []),
        ]}
      />
      {error ? <Notice error>{error}</Notice> : null}
      <Button label={busy ? t("Opening request…") : t("Open support request")} icon="arrow-forward" busy={busy} disabled={subject.trim().length < 3 || !body.trim()} onPress={submit} />
    </Screen>
  );
}
