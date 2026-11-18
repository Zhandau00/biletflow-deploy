/** One event: details, calendar, ticket choice, support and reporting. */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { api, ApiError } from "@/lib/api";
import {
  categoryLabel,
  eventDate,
  eventTime,
  mediaUrl,
  posterInfo,
  price,
  ticketBlock,
  zoneName,
  type ApiEvent,
  type TicketType,
} from "@/lib/events";
import { Poster } from "@/components/poster";
import { openLink, shareFile } from "@/components/files";
import { openSupport, signInFirst } from "@/components/links";
import { useSession } from "@/components/session";
import { failure, useLoad } from "@/components/use-load";
import { Avatar, Button, Card, Empty, Eyebrow, Field, H1, H2, Icon, LoadError, Loading, Notice, Row, Screen, T } from "@/components/ui";
import { color } from "@/components/theme";

type Details = { event: ApiEvent; tickets: TicketType[]; organizer: string; images: string[] };

async function loadEvent(id: string, signal: AbortSignal): Promise<Details> {
  const event = await api.events.get(id, { signal });
  const [tickets, organizer, images] = await Promise.all([
    api.events.ticketTypes(id, { signal }),
    api.organizers.get(event.organizer_profile_id, { signal }).then((o) => o.display_name).catch(() => ""),
    api.events
      .images(id, { signal })
      .then((list) => list.map((i) => mediaUrl(i.url)).filter((u): u is string => !!u))
      .catch(() => [] as string[]),
  ]);
  return { event, tickets, organizer, images };
}

export default function EventScreen() {
  const { id, promo } = useLocalSearchParams<{ id: string; promo?: string }>();
  const details = useLoad(`event-${id}`, (signal) =>
    /^[0-9a-f-]{36}$/i.test(id) ? loadEvent(id, signal) : Promise.reject(new ApiError("Event not found", 404)),
  );
  if (details.status === "error" && (details.httpStatus === 404 || details.httpStatus === 422))
    return (
      <Screen>
        <Empty title="This one isn’t on the bill." description="The event may be a draft, private, or the link may have changed." action="See what’s on" onAction={() => router.replace("/")} />
      </Screen>
    );
  if (details.status === "error" && !details.data)
    return (
      <Screen>
        <LoadError message={details.error.message} retry={details.reload} />
      </Screen>
    );
  if (!details.data)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  return <EventView {...details.data} promoToken={promo} reload={details.reload} refreshing={details.refreshing} />;
}

function EventView({
  event,
  tickets,
  organizer,
  images,
  promoToken,
  reload,
  refreshing,
}: Details & { promoToken?: string; reload: () => void; refreshing: boolean }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [promo, setPromo] = useState<{ label: string; name: string } | null>(null);
  const [now] = useState(Date.now);
  useEffect(() => {
    if (!promoToken) return;
    api.events
      .promoLink(promoToken)
      .then((found) => found.event_id === event.id && setPromo({ label: found.discount_label, name: found.campaign_name }))
      .catch(() => setPromo(null));
  }, [promoToken, event.id]);
  const blocks = Object.fromEntries(tickets.map((t) => [t.id, ticketBlock(t, event, now)]));
  const chosen = tickets.filter((t) => (quantities[t.id] ?? 0) > 0);
  const count = chosen.reduce((s, t) => s + quantities[t.id], 0);
  const total = chosen.reduce((s, t) => s + t.price_kzt * quantities[t.id], 0);
  const ended = event.lifecycle === "completed";
  const cancelled = event.lifecycle === "cancelled";
  const assigned = event.seating_type === "assigned";
  const sameDay = eventDate(event.start_at, event.timezone) === eventDate(event.end_at, event.timezone);
  const extraImages = images.filter((url) => url !== mediaUrl(event.cover_image_url));
  const mapQuery = [event.venue_name, event.venue_address, event.city].filter(Boolean).join(", ");
  const link = promoToken ? { link: promoToken } : {};

  function checkout() {
    if (assigned) router.push({ pathname: "/checkout/[id]", params: { id: event.id, ...link } });
    else router.push({ pathname: "/checkout/[id]", params: { id: event.id, tickets: JSON.stringify(quantities), ...link } });
  }

  return (
    <Screen onRefresh={reload} refreshing={refreshing}>
      <Stack.Screen options={{ title: event.title }} />
      {cancelled && <Notice error>This event has been cancelled. Ticket holders are refunded automatically and were told by email.</Notice>}
      {ended && <Notice>This event has ended.</Notice>}
      {event.lifecycle === "active" && <Notice>Happening now.</Notice>}
      {event.lifecycle === "draft" && <Notice>Draft preview — only the event team can see this page until it is published.</Notice>}
      <Poster event={posterInfo(event)} />
      <Eyebrow>
        {categoryLabel(event.category)}
        {event.city ? ` / ${event.city}` : ""}
      </Eyebrow>
      <H1>{event.title}</H1>
      {event.subtitle ? <T muted>{event.subtitle}</T> : null}

      <Card>
        <Row wrap={false} style={{ alignItems: "flex-start" }}>
          <Icon name="calendar-outline" tint={color.ember} />
          <View style={{ flex: 1 }}>
            <T bold>{eventDate(event.start_at, event.timezone, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</T>
            <T small muted>
              {eventTime(event.start_at, event.timezone)} –{" "}
              {sameDay
                ? eventTime(event.end_at, event.timezone)
                : `${eventDate(event.end_at, event.timezone)}, ${eventTime(event.end_at, event.timezone)}`}{" "}
              · {zoneName(event.timezone)}
            </T>
          </View>
        </Row>
        <Row wrap={false} style={{ alignItems: "flex-start" }}>
          <Icon name="location-outline" tint={color.ember} />
          <View style={{ flex: 1 }}>
            <T bold>{event.venue_name ?? "Venue to be announced"}</T>
            <T small muted>{[event.venue_address, event.city].filter(Boolean).join(", ") || "Kazakhstan"}</T>
          </View>
        </Row>
        <Row>
          {mapQuery ? (
            <Button
              small
              kind="secondary"
              icon="map-outline"
              label="Map"
              onPress={() => openLink(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`)}
            />
          ) : null}
          {!cancelled && !ended && <CalendarButtons eventId={event.id} />}
        </Row>
      </Card>

      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Eyebrow>Save your place</Eyebrow>
          <Icon name="ticket-outline" tint={color.ember} />
        </Row>
        <H2>See you there.</H2>
        <T muted>{assigned ? "Numbered seats: pick yours on the seat map." : "Choose your tickets. Bring your people."}</T>
        {tickets.length === 0 && <T muted>Tickets have not been released yet.</T>}
        {tickets.map((t) => {
          const block = blocks[t.id];
          const quantity = quantities[t.id] ?? 0;
          const limit = Math.min(t.max_per_order, t.available);
          return (
            <View key={t.id} style={{ borderTopWidth: 1, borderTopColor: color.line, paddingTop: 12, gap: 6 }}>
              <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }} wrap={false}>
                <View style={{ flex: 1 }}>
                  <T bold>{t.name}</T>
                  {t.description ? <T small muted>{t.description}</T> : null}
                  <T small muted>{block ?? (t.available <= 10 ? `Only ${t.available} left` : `${t.available} available`)}</T>
                </View>
                <T bold>{price(t.price_kzt)}</T>
              </Row>
              {!assigned && (
                <Row style={{ justifyContent: "flex-end" }}>
                  <Button
                    small
                    kind="secondary"
                    icon="remove"
                    label=""
                    disabled={!quantity}
                    onPress={() => setQuantities((q) => ({ ...q, [t.id]: Math.max(0, (q[t.id] ?? 0) - 1) }))}
                  />
                  <T bold style={{ minWidth: 24, textAlign: "center" }}>
                    {quantity}
                  </T>
                  <Button
                    small
                    kind="secondary"
                    icon="add"
                    label=""
                    disabled={!!block || quantity >= limit}
                    onPress={() => setQuantities((q) => ({ ...q, [t.id]: Math.min(limit, (q[t.id] ?? 0) + 1) }))}
                  />
                </Row>
              )}
            </View>
          );
        })}
        <Row style={{ justifyContent: "space-between", borderTopWidth: 1, borderTopColor: color.line, paddingTop: 12 }}>
          <T>
            {count} {count === 1 ? "ticket" : "tickets"}
          </T>
          <T bold style={{ fontSize: 18 }}>
            {count ? price(total) : "—"}
          </T>
        </Row>
        {promo && <Notice>{`${promo.label} with ${promo.name} — applied at checkout.`}</Notice>}
        {assigned && !cancelled && !ended ? (
          <Button label="Choose your seats" icon="arrow-forward" disabled={!tickets.some((t) => !blocks[t.id])} onPress={checkout} />
        ) : (
          <Button
            label={
              count
                ? total
                  ? "Continue to checkout"
                  : "Register for free"
                : cancelled
                  ? "Event cancelled"
                  : ended
                    ? "This event has ended"
                    : "Choose your tickets"
            }
            icon={count ? "arrow-forward" : undefined}
            disabled={!count}
            onPress={checkout}
          />
        )}
        <T small muted>
          Your places are held for 10 minutes while you check out.
        </T>
      </Card>

      <H2>A little about the event</H2>
      <T>{event.description || "The organizer has not added a description yet."}</T>
      {extraImages.map((url) => (
        <Image key={url} source={{ uri: url }} style={{ width: "100%", height: 200, borderRadius: 14 }} contentFit="cover" />
      ))}
      <Card>
        <Eyebrow>Good to know</Eyebrow>
        <T>
          Each ticket admits one person and has its own QR code. Keep it on your phone or save the PDF.
          {assigned ? " This event has numbered seats; you choose them at checkout." : ""}
        </T>
        {event.refund_policy ? (
          <>
            <Eyebrow>Refunds</Eyebrow>
            <T>{event.refund_policy}</T>
          </>
        ) : null}
      </Card>
      <Row>
        <Avatar name={organizer || "Organizer"} />
        <View>
          <T small muted>
            Put together by
          </T>
          <T>{organizer || "Independent organizer"}</T>
        </View>
      </Row>
      <Button kind="secondary" icon="mail-outline" label="Ask about this event" onPress={() => openSupport({ event: event.id })} />
      <EventReport eventId={event.id} />
    </Screen>
  );
}

function CalendarButtons({ eventId }: { eventId: string }) {
  const [error, setError] = useState("");
  async function google() {
    setError("");
    try {
      const links = await api.events.calendarLinks(eventId);
      await openLink(links.google);
    } catch (e) {
      setError(failure(e, "Calendar links are not available."));
    }
  }
  async function file() {
    setError("");
    try {
      await shareFile(api.events.calendarFile(eventId), "event.ics");
    } catch (e) {
      setError(failure(e, "Could not get the calendar file."));
    }
  }
  return (
    <>
      <Button small kind="secondary" icon="calendar-outline" label="Google Calendar" onPress={google} />
      <Button small kind="secondary" icon="download-outline" label="Calendar file" onPress={file} />
      {error ? (
        <T small style={{ color: color.bad }}>
          {error}
        </T>
      ) : null}
    </>
  );
}

function EventReport({ eventId }: { eventId: string }) {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open)
    return <Button kind="text" label="Report this event" onPress={() => (user ? setOpen(true) : signInFirst(`/event/${eventId}`))} />;
  async function submit() {
    setBusy(true);
    setFeedback(null);
    try {
      await api.request(`/events/${eventId}/reports`, { body: { reason: reason.trim() } });
      setFeedback({ message: "Thank you. The BiletFlow team will review this event.", error: false });
      setReason("");
    } catch (e) {
      setFeedback({ message: failure(e, "Could not send the report."), error: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Field
        label="What should the platform review?"
        multiline
        value={reason}
        onChangeText={setReason}
        maxLength={1000}
        placeholder="Misleading information, a suspected scam, a safety concern…"
        hint="At least 10 characters."
      />
      <Row>
        <Button kind="secondary" label="Send report" busy={busy} disabled={reason.trim().length < 10} onPress={submit} />
        <Button kind="text" label="Close" onPress={() => setOpen(false)} />
      </Row>
      {feedback && <Notice error={feedback.error}>{feedback.message}</Notice>}
    </Card>
  );
}
