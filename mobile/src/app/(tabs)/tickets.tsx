/** My tickets: orders by upcoming / past / closed, plus tickets booked for me. */
import { useState } from "react";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { eventDate, eventTime, price } from "@/lib/events";
import { ORDER_STATUS_LABEL, holdLeft, orderTab, type Order, type TicketDetail } from "@/lib/orders";
import { TicketCard } from "@/components/ticket-card";
import { useSession } from "@/components/session";
import { signInFirst } from "@/components/links";
import { useLoad } from "@/components/use-load";
import { Badge, Button, Card, Chips, Empty, H2, Icon, Intro, LoadError, Loading, Row, Screen, T } from "@/components/ui";
import { color } from "@/components/theme";

type Tab = "upcoming" | "past" | "closed";

const longDate = (iso: string, zone: string) =>
  `${eventDate(iso, zone, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · ${eventTime(iso, zone)}`;

export default function Tickets() {
  const { user, ready } = useSession();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [now] = useState(Date.now);
  const data = useLoad(user ? `orders-${user.id}` : "orders-none", async (signal) => {
    if (!user) return { orders: [] as Order[], shared: [] as TicketDetail[] };
    const [orders, tickets] = await Promise.all([api.orders.mine({ signal }), api.tickets.mine({ signal })]);
    const own = new Set(orders.map((o) => o.id));
    return { orders, shared: tickets.filter((t) => !own.has(t.order_id)) };
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
        <Empty icon="ticket-outline" title="Your tickets live here." description="Sign in to see your orders and show your QR codes at the door." action="Sign in" onAction={() => signInFirst("/tickets")} />
      </Screen>
    );
  const orders = (data.data?.orders ?? []).filter((o) => orderTab(o, now) === tab);
  const shared = (data.data?.shared ?? []).filter((t) =>
    tab === "closed"
      ? t.status === "cancelled" || t.status === "refunded"
      : t.status !== "cancelled" && t.status !== "refunded" && (new Date(t.event.end_at).getTime() >= now) === (tab === "upcoming"),
  );
  return (
    <Screen onRefresh={data.reload} refreshing={data.refreshing}>
      <Intro eyebrow="Your plans, in one place" title="Good nights ahead." description={`The next chapter of your calendar, ${user.full_name.split(" ")[0]}.`} />
      <Chips
        value={tab}
        onChange={setTab}
        options={[
          { value: "upcoming", label: "Upcoming" },
          { value: "past", label: "Past events" },
          { value: "closed", label: "Cancelled & refunded" },
        ]}
      />
      {data.status === "error" && <LoadError message={data.error.message} retry={data.reload} />}
      {!data.data ? (
        data.status !== "error" && <Loading />
      ) : orders.length ? (
        orders.map((order) => <OrderCard key={order.id} order={order} now={now} />)
      ) : (
        !shared.length && (
          <Empty
            title={tab === "upcoming" ? "Your calendar has room for a good night." : tab === "past" ? "The memories are still to come." : "Nothing cancelled or refunded."}
            description={tab === "upcoming" ? "Pick an event you like. Your tickets will be waiting here." : "Orders in this category will appear here."}
            action="Explore events"
            onAction={() => router.push("/")}
          />
        )
      )}
      {shared.length > 0 && (
        <>
          <H2>Tickets in your name</H2>
          <T muted>Booked for you by someone else.</T>
          {shared.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </>
      )}
      <Button kind="secondary" label="Find your next event" icon="arrow-forward" onPress={() => router.push("/")} />
    </Screen>
  );
}

function OrderCard({ order, now }: { order: Order; now: number }) {
  const count = order.items.reduce((s, i) => s + i.quantity, 0);
  const hold = order.status === "pending" ? holdLeft(order.expires_at, now) : null;
  return (
    <Card onPress={() => router.push(`/order/${order.id}`)}>
      <Row style={{ justifyContent: "space-between" }}>
        <Badge tone={order.status === "confirmed" ? "live" : order.status === "pending" ? "warn" : "neutral"} label={order.status === "pending" && !hold ? "Hold ran out" : ORDER_STATUS_LABEL[order.status]} />
        <T small muted style={{ fontFamily: "monospace" }}>
          {order.id.slice(0, 8).toUpperCase()}
        </T>
      </Row>
      <H2>{order.event_title}</H2>
      <T muted>{longDate(order.event_start_at, order.event_timezone)}</T>
      <Row style={{ justifyContent: "space-between" }}>
        <T>
          {count} {count === 1 ? "ticket" : "tickets"} / {price(order.total_kzt)}
        </T>
        <Row>
          <T style={{ color: color.ember }}>{order.status === "pending" && hold ? "Finish payment" : "Tickets"}</T>
          <Icon name="arrow-forward" size={16} tint={color.ember} />
        </Row>
      </Row>
    </Card>
  );
}
