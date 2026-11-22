/** One order: payment (simulated), tickets with QR codes, calendar, cancel or refund. */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { eventDate, eventTime, price, zoneName } from "@/lib/events";
import { ORDER_STATUS_LABEL, holdLeft, type Order, type TicketDetail } from "@/lib/orders";
import { TicketCard } from "@/components/ticket-card";
import { openLink, shareFile } from "@/components/files";
import { openSupport, signInFirst } from "@/components/links";
import { useSession } from "@/components/session";
import { failure, useLoad } from "@/components/use-load";
import { Badge, Button, Card, Empty, Eyebrow, Facts, Field, H2, Icon, Intro, LoadError, Loading, Notice, Row, Screen, T } from "@/components/ui";
import { color } from "@/components/theme";
import { useT } from "@/lib/i18n";

const longDate = (iso: string, zone: string) =>
  `${eventDate(iso, zone, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${eventTime(iso, zone)}`;

export default function OrderScreen() {
  const t = useT();
  const { id, confirmed } = useLocalSearchParams<{ id: string; confirmed?: string }>();
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
  if (!ready)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!user)
    return (
      <Screen>
        <Empty title={t("Sign in to see this order.")} action={t("Sign in")} onAction={() => signInFirst(`/order/${id}`)} />
      </Screen>
    );
  if (data.status === "error" && !data.data && [403, 404, 422].includes(data.httpStatus))
    return (
      <Screen>
        <Empty title={t("We couldn’t find that order.")} description={t("It may belong to another account.")} action={t("My tickets")} onAction={() => router.replace("/tickets")} />
      </Screen>
    );
  if (data.status === "error" && !data.data)
    return (
      <Screen>
        <LoadError message={data.error.message} retry={data.reload} />
      </Screen>
    );
  if (!data.data)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  return (
    <OrderView
      key={version}
      {...data.data}
      confirmed={confirmed === "1"}
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
  confirmed: boolean;
  isBuyer: boolean;
  onChange: () => void;
}) {
  const t = useT();
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [unregistering, setUnregistering] = useState(false);
  const pending = order.status === "pending";
  const hold = pending ? holdLeft(order.expires_at, now) : null;
  const free = order.total_kzt === 0;
  const upcoming = new Date(order.event_start_at).getTime() > now;
  const failedPayments = order.payments.filter((p) => p.status === "failed");

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

  async function download(path: string, name: string) {
    setError("");
    try {
      await shareFile(path, name);
    } catch (e) {
      setError(failure(e, t("Could not get the file.")));
    }
  }

  return (
    <Screen onRefresh={onChange}>
      <Stack.Screen options={{ title: t("Order {toUpperCase}", { toUpperCase: order.id.slice(0, 8).toUpperCase() }) }} />
      {confirmed && order.status === "confirmed" && (
        <Card style={{ borderColor: color.ok }}>
          <Row>
            <Icon name="checkmark-circle" size={28} tint={color.ok} />
            <Eyebrow>{t("You’re on the list")}</Eyebrow>
          </Row>
          <H2>{t("That’s a night to look forward to.")}</H2>
          <T muted>{t("Your tickets are below and on their way to your inbox.")}</T>
        </Card>
      )}
      <Intro eyebrow={t("Order / {toUpperCase}", { toUpperCase: order.id.slice(0, 8).toUpperCase() })} title={order.event_title} description={`${longDate(order.event_start_at, order.event_timezone)} · ${zoneName(order.event_timezone)}`} />
      {notice ? <Notice>{notice}</Notice> : null}
      {error ? <Notice error>{error}</Notice> : null}

      {pending && isBuyer && (
        <Card style={{ borderColor: color.ember }}>
          {hold ? (
            <>
              <Eyebrow>{t("Places held for {hold}", { hold: hold })}</Eyebrow>
              <H2>{t("Pay {price} to confirm.", { price: price(order.total_kzt) })}</H2>
              <T muted>{t("Payment is simulated: no card details are taken and no money moves. Choose how the test payment should end.")}</T>
              {failedPayments.length > 0 && (
                <Notice error>
                  {t("The last payment attempt failed{n0}. Your places are still held.", { n0: failedPayments.at(-1)?.failure_reason ? `: ${failedPayments.at(-1)?.failure_reason}` : "" })}
                </Notice>
              )}
              <Button label={t("Pay now (simulated)")} busy={busy === "pay"} disabled={!!busy} onPress={() => act("pay", () => api.orders.pay(order.id), t("Payment received. Your tickets are ready."))} />
              <Button kind="secondary" label={t("Simulate a declined card")} disabled={!!busy} busy={busy === "fail"} onPress={() => act("fail", () => api.orders.pay(order.id, "failure"))} />
              <Button kind="text" label={t("Cancel checkout")} disabled={!!busy} onPress={() => act("cancel", () => api.orders.cancel(order.id), t("Checkout cancelled. The places were released."))} />
            </>
          ) : (
            <>
              <H2>{t("Your hold ran out.")}</H2>
              <T muted>{t("The places went back on sale. You can start again from the event page.")}</T>
              <Button label={t("Back to the event")} onPress={() => router.push(`/event/${order.event_id}`)} />
            </>
          )}
        </Card>
      )}

      <Facts
        rows={[
          [t("Status"), <Badge key="s" tone={order.status === "confirmed" ? "live" : "neutral"} label={pending && !hold ? t("Hold ran out") : ORDER_STATUS_LABEL[order.status]} />],
          [t("Booked by"), `${order.buyer_name} · ${order.buyer_email}`],
          [
            t("Order total"),
            `${price(order.total_kzt)}${order.discount_kzt > 0 ? t(" · {price} off with {promo_code}", { price: price(order.discount_kzt), promo_code: order.promo_code }) : ""} · ${eventDate(order.created_at, order.event_timezone, { day: "numeric", month: "short", year: "numeric" })}`,
          ],
          [
            t("Tickets"),
            <View key="i" style={{ gap: 4 }}>
              {order.items.map((item) => (
                <Row key={item.id} style={{ justifyContent: "space-between" }}>
                  <T style={{ flex: 1 }}>
                    {item.quantity} × {item.ticket_type_name}
                    {item.seats?.length ? ` (${item.seats.join("; ")})` : ""}
                  </T>
                  <T>{price(item.subtotal_kzt)}</T>
                </Row>
              ))}
            </View>,
          ],
        ]}
      />

      {order.refund && (
        <Notice>
          {t("Refunded {price} on {eventDate}{n2}. The tickets are no longer valid.{n3}", { price: price(order.refund.amount_kzt), eventDate: eventDate(order.refund.created_at, order.event_timezone, { day: "numeric", month: "long" }), n2: order.refund.reason ? ` — ${order.refund.reason}` : "", n3: order.refund.is_simulated ? t(" (Simulated refund: no money moved.)") : "" })}
        </Notice>
      )}
      {order.status === "cancelled" && !order.refund && <Notice>{t("This order was cancelled. Its tickets are no longer valid.")}</Notice>}
      {order.status === "expired" && <Notice>{t("The checkout hold ran out before payment.")}</Notice>}

      <Row>
        <Button small kind="secondary" icon="mail-outline" label={t("Get help with this order")} onPress={() => openSupport({ event: order.event_id, order: order.id })} />
        {order.status === "confirmed" && upcoming && order.calendar_links?.google && (
          <Button small kind="secondary" icon="calendar-outline" label={t("Google Calendar")} onPress={() => openLink(order.calendar_links!.google!)} />
        )}
        {order.status === "confirmed" && upcoming && (
          <Button small kind="secondary" icon="calendar-outline" label={t("Calendar file")} onPress={() => download(api.events.calendarFile(order.event_id), "event.ics")} />
        )}
        {order.status === "confirmed" && isBuyer && tickets.length > 1 && (
          <Button small kind="secondary" icon="download-outline" label={t("All tickets (PDF)")} onPress={() => download(api.orders.pdf(order.id), `tickets-${order.id.slice(0, 8)}.pdf`)} />
        )}
      </Row>

      {tickets.length > 0 && (
        <>
          <H2>{t("Your tickets")}</H2>
          <T muted>{t("Each guest has their own QR code.")}</T>
          {tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </>
      )}

      {order.status === "confirmed" && isBuyer && upcoming && (
        <Card>
          {free ? (
            unregistering ? (
              <>
                <Field label={t("Reason")} optional value={reason} onChangeText={setReason} maxLength={500} />
                <Row>
                  <Button kind="danger" label={t("Cancel registration")} busy={busy === "unregister"} onPress={() => act("unregister", () => api.orders.cancelRegistration(order.id, reason.trim()), t("Your registration was cancelled."))} />
                  <Button kind="text" label={t("Keep it")} onPress={() => setUnregistering(false)} />
                </Row>
              </>
            ) : (
              <Button kind="text" label={t("Can’t make it? Cancel this registration")} onPress={() => setUnregistering(true)} style={{ alignSelf: "flex-start" }} />
            )
          ) : (
            <>
              <T>{t("Need a refund? Refunds for paid tickets are handled by the organizer.")}</T>
              <Button kind="secondary" small label={t("Ask for a refund")} onPress={() => openSupport({ event: order.event_id, order: order.id })} style={{ alignSelf: "flex-start" }} />
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}
