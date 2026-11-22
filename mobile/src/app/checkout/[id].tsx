/** Checkout: seats (for numbered events), guests, promo code and the order. */
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { eventDate, eventTime, posterInfo, price, venueLine, type ApiEvent, type TicketType } from "@/lib/events";
import { parseSelection, ticketCount, type Quote, type Seat, type SeatMap, type Selection } from "@/lib/orders";
import { Poster } from "@/components/poster";
import { useSession } from "@/components/session";
import { signInFirst } from "@/components/links";
import { failure, useLoad } from "@/components/use-load";
import { Button, Card, Empty, Eyebrow, Field, H2, Intro, LoadError, Loading, Notice, Row, Screen, T, Toggle } from "@/components/ui";
import { color, poster } from "@/components/theme";
import { tr, useT } from "@/lib/i18n";

const longDate = (iso: string, zone: string) =>
  `${eventDate(iso, zone, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${eventTime(iso, zone)}`;

export default function CheckoutScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ id: string; tickets?: string; seats?: string; promo?: string; link?: string }>();
  const { user, ready } = useSession();
  const data = useLoad(`checkout-${params.id}`, async (signal) => {
    const [event, tickets] = await Promise.all([
      api.events.get(params.id, { signal }),
      api.events.ticketTypes(params.id, { signal }),
    ]);
    return { event, tickets };
  });
  if (data.status === "error" && !data.data)
    return (
      <Screen>
        <LoadError message={data.error.message} retry={data.reload} />
      </Screen>
    );
  if (!data.data || !ready)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!user)
    return (
      <Screen>
        <Empty
          title={t("Let’s put a name on your tickets.")}
          description={t("Sign in or create an account to book. Your tickets will wait for you in My tickets.")}
          action={t("Continue to sign in")}
          onAction={() => signInFirst(`/event/${params.id}`)}
        />
      </Screen>
    );
  return (
    <Checkout
      {...data.data}
      initial={parseSelection(params.tickets, params.seats)}
      initialPromo={params.promo ?? ""}
      promoToken={params.link}
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
}: {
  event: ApiEvent;
  tickets: TicketType[];
  initial: Selection;
  initialPromo: string;
  promoToken?: string;
  buyer: { name: string; email: string };
}) {
  const t = useT();
  const assigned = event.seating_type === "assigned";
  const [selection, setSelection] = useState<Selection>(initial);
  const [pickingSeats, setPickingSeats] = useState(assigned && !initial.seat_ids.length);
  const [promoInput, setPromoInput] = useState(initialPromo);
  const [promoCode, setPromoCode] = useState(initialPromo);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [nameGuests, setNameGuests] = useState(false);
  const [edited, setEdited] = useState<({ name: string; email: string } | undefined)[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const count = ticketCount(selection);
  const selectionKey = JSON.stringify(selection);

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
      .catch(() => setQuoteError(tr("That promo link is no longer valid.")));
  }, [promoToken, event.id]);

  // Prices come from the backend, including any discount
  useEffect(() => {
    if (!count || pickingSeats) return;
    let live = true;
    api.events
      .quote(event.id, JSON.parse(selectionKey) as Selection, promoCode)
      .then((result) => {
        if (!live) return;
        setQuote(result);
        setQuoteError("");
      })
      .catch((e: unknown) => {
        if (!live) return;
        setQuote(null);
        setQuoteError(failure(e));
      });
    return () => {
      live = false;
    };
  }, [event.id, selectionKey, promoCode, count, pickingSeats]);

  const typeName = (id: string) => tickets.find((t) => t.id === id)?.name ?? t("Ticket");
  const guestLabels = selection.seat_ids.length
    ? selection.seat_ids.map((_, i) => t("Seat {n0}", { n0: i + 1 }))
    : selection.items.flatMap((item) => Array.from({ length: item.quantity }, (_, i) => `${typeName(item.ticket_type_id)} · guest ${i + 1}`));

  // The guest list starts with the buyer in the first place
  const guests = guestLabels.map((_, i) => edited[i] ?? (i === 0 ? { name: buyer.name, email: buyer.email } : { name: "", email: "" }));
  const editGuest = (i: number, patch: Partial<{ name: string; email: string }>) =>
    setEdited(() => guests.map((g, j) => (j === i ? { ...g, ...patch } : g)));

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
      <Screen>
        <Empty title={t("Start with a ticket.")} description={t("Choose your ticket type and quantity before checking out.")} action={t("Choose tickets")} onAction={() => router.back()} />
      </Screen>
    );

  const total = quote?.total_kzt ?? 0;
  const guestsOk = !nameGuests || guests.every((g) => g.name.trim().length >= 2 && /.+@.+\..+/.test(g.email.trim()));

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const order = await api.orders.create(event.id, selection, {
        promo_code: quote?.promo?.applied ? promoCode : undefined,
        attendees: nameGuests ? guests.map((g) => ({ name: g.name.trim(), email: g.email.trim() })) : undefined,
      });
      router.replace({ pathname: "/order/[id]", params: { id: order.id, ...(order.status === "confirmed" ? { confirmed: "1" } : {}) } });
    } catch (e) {
      setError(failure(e));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Intro eyebrow={t("Your next good night")} title={t("Make it a date.")} description={t("Check the details, and you’re on the list.")} />
      <Card>
        <Poster event={posterInfo(event)} compact />
        <H2>{event.title}</H2>
        <T muted>{longDate(event.start_at, event.timezone)}</T>
        <T muted>{venueLine(event)}</T>
        {quote ? (
          <>
            {quote.lines.map((line) => (
              <Row key={line.ticket_type_id} style={{ justifyContent: "space-between" }}>
                <T>
                  {line.quantity} × {line.name}
                </T>
                <T>{price(line.subtotal_kzt)}</T>
              </Row>
            ))}
            {quote.discount_kzt > 0 && (
              <Row style={{ justifyContent: "space-between" }}>
                <T>{t("Discount ({code})", { code: quote.promo?.code })}</T>
                <T>−{price(quote.discount_kzt)}</T>
              </Row>
            )}
            <Row style={{ justifyContent: "space-between" }}>
              <T muted>{t("Booking fee")}</T>
              <T muted>₸0</T>
            </Row>
          </>
        ) : (
          <T muted>{quoteError ? t("Prices unavailable") : t("Working out prices…")}</T>
        )}
        <Row style={{ justifyContent: "space-between", borderTopWidth: 1, borderTopColor: color.line, paddingTop: 10 }}>
          <T bold>{t("Total · KZT")}</T>
          <T bold style={{ fontSize: 20 }}>
            {quote ? price(quote.total_kzt) : "—"}
          </T>
        </Row>
        <Button
          kind="text"
          small
          label={assigned ? t("Change seats") : t("Change tickets")}
          onPress={() => (assigned ? setPickingSeats(true) : router.back())}
          style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}
        />
      </Card>

      <Eyebrow>{t("01 · Who’s coming?")}</Eyebrow>
      <T muted>
        {t("Booking as {name} ({email}). Tickets are sent to this email and appear in My tickets.", { name: buyer.name, email: buyer.email })}</T>
      <Toggle label={t("Put each guest’s own name and email on their ticket")} value={nameGuests} onChange={setNameGuests} />
      {nameGuests &&
        guestLabels.map((label, i) => (
          <Card key={label}>
            <T bold>{label}</T>
            <Field
              label={t("Name")}
              value={guests[i]?.name ?? ""}
              maxLength={100}
              onChangeText={(name) => editGuest(i, { name })}
            />
            <Field
              label={t("Email")}
              value={guests[i]?.email ?? ""}
              maxLength={200}
              keyboardType="email-address"
              autoCapitalize="none"
              onChangeText={(email) => editGuest(i, { email })}
            />
          </Card>
        ))}

      <Eyebrow>{t("02 · Promo code")}</Eyebrow>
      <Row wrap={false}>
        <View style={{ flex: 1 }}>
          <Field label={t("Code")} value={promoInput} maxLength={40} placeholder={t("Have a code?")} autoCapitalize="characters" onChangeText={(v) => setPromoInput(v.toUpperCase())} />
        </View>
        <Button small kind="secondary" label={t("Apply")} onPress={() => setPromoCode(promoInput.trim())} style={{ marginTop: 22 }} />
      </Row>
      {promoCode ? (
        <Button
          small
          kind="text"
          label={t("Remove code")}
          onPress={() => {
            setPromoInput("");
            setPromoCode("");
          }}
          style={{ alignSelf: "flex-start" }}
        />
      ) : null}
      {quote?.promo && <Notice error={!quote.promo.applied}>{quote.promo.message}</Notice>}

      <Eyebrow>03 · {total ? t("Payment") : t("Free registration")}</Eyebrow>
      <Card>
        <T bold>{total ? t("Payment is simulated.") : t("Your place is free.")}</T>
        <T muted>
          {total
            ? t("Your places are held for 10 minutes while you pay {price}. BiletFlow is a study project: no card details are taken and no money moves.", { price: price(total) })
            : t("Confirm and your tickets are issued straight away.")}
        </T>
      </Card>
      {quoteError ? <Notice error>{quoteError}</Notice> : null}
      {error ? <Notice error>{error}</Notice> : null}
      {!guestsOk && <T small muted>{t("Give every guest a name (2+ letters) and an email.")}</T>}
      <Button
        label={busy ? t("Reserving your places…") : total ? t("Continue to payment") : t("Complete registration")}
        icon="arrow-forward"
        busy={busy}
        disabled={!quote || !guestsOk}
        onPress={submit}
      />
    </Screen>
  );
}

/* ------------------------------ seat map ------------------------------ */

const SEAT_COLORS = [poster.cine, poster.concert, poster.fest, poster.theatre];

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
  const t = useT();
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
  const stillFree = picked.filter((id) => !seats.size || seats.get(id)?.status === "available");
  const total = stillFree.reduce((s, id) => s + (seats.get(id)?.price_kzt ?? 0), 0);

  function toggle(seat: Seat) {
    if (seat.status !== "available") return;
    setPicked((current) =>
      current.includes(seat.id) ? current.filter((id) => id !== seat.id) : current.length >= 20 ? current : [...current, seat.id],
    );
  }

  return (
    <Screen>
      <Intro
        eyebrow={map.data?.venue_name ?? t("Choose your seats")}
        title={t("Pick your seats.")}
        description={t("Tap a seat to choose it, tap again to let it go. Up to 20 seats per order. Scroll sideways for wide rows.")}
      />
      {map.status === "error" && !map.data && <LoadError message={map.error.message} retry={map.reload} />}
      {!map.data ? map.status !== "error" && <Loading label={t("Loading the hall…")} /> : <SeatGrid map={map.data} names={names} picked={stillFree} onToggle={toggle} />}
      <Card>
        <T bold>
          {t.plural(stillFree.length, "{n} seat", "{n} seats")} · {price(total)}
        </T>
        <Button label={t("Continue with these seats")} icon="arrow-forward" disabled={!stillFree.length} onPress={() => onDone(stillFree)} />
      </Card>
    </Screen>
  );
}

function SeatGrid({ map, names, picked, onToggle }: { map: SeatMap; names: Record<string, string>; picked: string[]; onToggle: (seat: Seat) => void }) {
  const t = useT();
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
    <View style={{ gap: 12 }}>
      <View style={{ backgroundColor: color.ink700, borderRadius: 8, padding: 8, alignItems: "center" }}>
        <T small muted>{t("STAGE")}</T>
      </View>
      <Row>
        {categories.map((c, i) => (
          <Row key={c} wrap={false}>
            <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: SEAT_COLORS[i % 4] }} />
            <T small>
              {labels.get(c) ?? c} · {prices.get(c) != null ? price(prices.get(c)!) : "—"}
            </T>
          </Row>
        ))}
        <Row wrap={false}>
          <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: color.ink700 }} />
          <T small>{t("Taken")}</T>
        </Row>
        <Row wrap={false}>
          <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: color.ember }} />
          <T small>{t("Your choice")}</T>
        </Row>
      </Row>
      {map.sections.map((section) => (
        <View key={section.name} style={{ gap: 6 }}>
          <T bold>{section.name}</T>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={{ gap: 6 }}>
              {section.rows.map((row) => (
                <View key={row.label} style={{ flexDirection: "row", gap: 5, alignItems: "center" }}>
                  <Text style={{ color: color.muted, width: 22, fontSize: 12 }}>{row.label}</Text>
                  {row.seats.map((seat) => {
                    const mine = picked.includes(seat.id);
                    const free = seat.status === "available";
                    const tint = SEAT_COLORS[categories.indexOf(seat.category) % 4];
                    return (
                      <Pressable
                        key={seat.id}
                        disabled={!free}
                        onPress={() => onToggle(seat)}
                        accessibilityRole="button"
                        accessibilityLabel={free ? seat.label : t("{label}, taken", { label: seat.label })}
                        accessibilityState={{ selected: mine, disabled: !free }}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 7,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: mine ? color.ember : free ? tint : color.ink700,
                          opacity: free || mine ? 1 : 0.6,
                        }}
                      >
                        <Text style={{ fontSize: 10, color: color.ink, fontWeight: "700" }}>{seat.is_accessible ? "♿" : seat.number}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      ))}
    </View>
  );
}
