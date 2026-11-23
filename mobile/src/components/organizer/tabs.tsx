/** The tabs of an event's workspace (organizer/[id].tsx shows them). */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { eventTime, mediaUrl, posterInfo, price, type TicketType } from "@/lib/events";
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
  type StaffRole,
  type TicketStats,
  type TicketTypeStats,
  type VenueLayout,
} from "@/lib/organizer";
import { Poster } from "../poster";
import { shareCsv, shareFile } from "../files";
import { amount, ref } from "../format";
import { failure, useLoad } from "../use-load";
import { Avatar, Badge, Button, Card, Chips, Empty, Eyebrow, Field, H2, Icon, Loaded, Notice, Progress, Row, Select, Stat, T, Toggle } from "../ui";
import { color } from "../theme";
import { DateTimeFields, validDate, validTime, when, type EventContext } from "./shared";

import { useT , tk } from "@/lib/i18n";
/* ------------------------------ Overview ------------------------------ */

export function OverviewTab({ ctx }: { ctx: EventContext }) {
  const t = useT();
  const { event } = ctx;
  const data = useLoad(`overview:${event.id}:${event.status}:${event.cover_image_url}`, async (signal) => {
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
    <Loaded data={data}>
      {({ stats, sales, checkin, activation, staff }) => {
        const paid = stats.ticket_types.some((type) => type.price_kzt > 0);
        const checklist: [string, string, boolean][] = [
          [t("The event details"), t("A name, a date, and a place to be."), !!event.venue_name],
          [t("Your ticket types"), t.plural(stats.ticket_types.length, "{n} way to join.", "{n} ways to join."), stats.ticket_types.length > 0],
          [t("Published"), t("Let people discover your event."), event.status === "published"],
          ...(paid ? ([[t("Paid sales open"), t("Finish the activation checklist under Paid sales."), event.paid_sales_open]] as [string, string, boolean][]) : []),
          [t("A team at the door"), t("Add check-in staff under Team."), staff.some((s) => s.role !== "owner")],
        ];
        return (
          <View style={{ gap: 12 }}>
            <Row>
              <Stat label={t("Gross sales")} value={amount(sales.gross_sales_kzt)} note={t("Estimated payout {amount} (simulated)", { amount: amount(sales.estimated_payout_kzt) })} icon="stats-chart" />
              <Stat label={t("Tickets sold")} value={`${stats.totals.sold} / ${stats.totals.quantity}`} note={t("{available} available · {reserved} in checkouts", { available: stats.totals.available, reserved: stats.totals.reserved })} icon="ticket-outline" />
              <Stat label={t("Through the door")} value={checkin.checked_in} note={t.plural(checkin.remaining, "{n} guest still to arrive", "{n} guests still to arrive")} icon="people-outline" />
            </Row>
            <Poster event={posterInfo(event)} />
            <T small muted>
              {[event.venue_name, event.city].filter(Boolean).join(" · ")} · {event.visibility}
            </T>
            <ImagesEditor ctx={ctx} />
            <Card>
              <H2>{t("Before the doors open")}</H2>
              <T muted small>
                {activation?.status === "suspended" ? activation.suspension_reason ? t("Paid sales were suspended by the platform: {reason}.", { reason: activation.suspension_reason }) : t("Paid sales were suspended by the platform.") : t("A few things to have in place.")}
              </T>
              {checklist.map(([title, description, done]) => (
                <Row key={title} wrap={false} style={{ alignItems: "flex-start" }}>
                  <Icon name={done ? "checkmark-circle" : "ellipse-outline"} tint={done ? color.ok : color.muted} />
                  <View style={{ flex: 1 }}>
                    <T bold>{title}</T>
                    <T small muted>{description}</T>
                  </View>
                </Row>
              ))}
            </Card>
          </View>
        );
      }}
    </Loaded>
  );
}

function ImagesEditor({ ctx }: { ctx: EventContext }) {
  const t = useT();
  const { event } = ctx;
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const images = useLoad(`images:${event.id}:${version}`, (signal) => api.request<{ id: string; url: string }[]>(`/events/${event.id}/images`, { signal }));
  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    const type = asset.mimeType ?? "image/jpeg";
    if (!["image/jpeg", "image/png", "image/webp"].includes(type)) return ctx.notify(t("Choose a JPEG, PNG or WebP image."), true);
    const form = new FormData();
    const name = asset.fileName ?? `image.${type.split("/")[1]}`;
    if (asset.file) form.append("file", asset.file, name);
    // React Native sends a file from its uri
    else form.append("file", { uri: asset.uri, name, type } as unknown as Blob);
    setBusy(true);
    try {
      await api.request(`/events/${event.id}/images`, { method: "POST", form });
      ctx.reload();
      setVersion((v) => v + 1);
      ctx.notify(t("Image added. The first image is the cover."));
    } catch (e) {
      ctx.notify(failure(e, t("Could not upload the image.")), true);
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
    <Card>
      <H2>{t("Images")}</H2>
      <Row>
        {images.data?.map((image) => (
          <View key={image.id}>
            <Image source={{ uri: mediaUrl(image.url) ?? undefined }} style={{ width: 92, height: 92, borderRadius: 10, backgroundColor: color.ink700 }} contentFit="cover" />
            <Pressable
              onPress={() => remove(image.id)}
              accessibilityLabel={t("Remove image")}
              style={{ position: "absolute", top: 4, right: 4, backgroundColor: color.ink, borderRadius: 12, padding: 2 }}
            >
              <Icon name="close" size={16} />
            </Pressable>
          </View>
        ))}
      </Row>
      <Button small kind="secondary" icon="add" label={busy ? t("Uploading…") : t("Add an image")} busy={busy} onPress={pick} style={{ alignSelf: "flex-start" }} />
      <T small muted>{t("JPEG, PNG or WebP, up to 5 MB, 10 per event. Uploads on the free hosting may not last; see DEPLOY.md.")}</T>
    </Card>
  );
}

/* ------------------------------ Tickets ------------------------------ */

export function TicketsTab({ ctx, seating }: { ctx: EventContext; seating?: boolean }) {
  const t = useT();
  const { event } = ctx;
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [wantSeats, setWantSeats] = useState(!!seating);
  const stats = useLoad(`ticket-stats:${event.id}:${version}`, (signal) => api.request<TicketStats>(`/events/${event.id}/ticket-stats`, { signal }));
  const refresh = () => setVersion((v) => v + 1);
  const canSwitch = (stats.data?.ticket_types.length ?? 0) === 0 && (event.status === "draft" || event.status === "published");
  if (event.seating_type === "assigned" || (wantSeats && canSwitch))
    return (
      <SeatingSetup ctx={ctx} stats={stats.data} onDone={refresh} onCancel={event.seating_type === "assigned" ? undefined : () => setWantSeats(false)} />
    );
  return (
    <Loaded data={stats}>
      {(s) => (
        <View style={{ gap: 12 }}>
          {s.ticket_types.map((type) =>
            editing === type.id ? (
              <TicketTypeForm key={type.id} ctx={ctx} existing={type} onDone={() => { setEditing(null); refresh(); }} />
            ) : (
              <Card key={type.id}>
                <Row style={{ justifyContent: "space-between" }}>
                  <H2>{type.name}</H2>
                  <T bold>{price(type.price_kzt)}</T>
                </Row>
                {type.is_hidden && <Badge label={t("Hidden")} />}
                <T small muted>
                  {type.description ?? ""}
                  {type.sale_start ? t(" · on sale from {when}", { when: when(type.sale_start, event) }) : ""}
                  {type.sale_end ? t(" · until {when}", { when: when(type.sale_end, event) }) : ""}
                  {t(" · up to {max_per_order} per order", { max_per_order: type.max_per_order })}
                </T>
                <T small>
                  {t("{sold} sold · {reserved} held · {available} left of {quantity}", { sold: type.sold, reserved: type.reserved, available: type.available, quantity: type.quantity })}
                </T>
                <Button small kind="secondary" label={t("Edit")} onPress={() => setEditing(type.id)} style={{ alignSelf: "flex-start" }} />
              </Card>
            ),
          )}
          <T muted>
            {t("{quantity} of {capacity} places assigned to ticket types.", { quantity: s.totals.quantity, capacity: s.capacity })}</T>
          {editing === "new" ? (
            <TicketTypeForm ctx={ctx} onDone={() => { setEditing(null); refresh(); }} />
          ) : (
            <>
              <Button kind="secondary" icon="add" label={t("Add ticket type")} onPress={() => setEditing("new")} />
              {canSwitch && <Button kind="secondary" label={t("Use numbered seats instead")} onPress={() => setWantSeats(true)} />}
            </>
          )}
        </View>
      )}
    </Loaded>
  );
}

function TicketTypeForm({ ctx, existing, onDone }: { ctx: EventContext; existing?: TicketTypeStats; onDone: () => void }) {
  const t = useT();
  const { event } = ctx;
  const start = toLocalInputs(existing?.sale_start);
  const end = toLocalInputs(existing?.sale_end);
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [priceText, setPrice] = useState(String(existing?.price_kzt ?? 0));
  const [quantity, setQuantity] = useState(String(existing?.quantity ?? 50));
  const [maxPer, setMaxPer] = useState(String(existing?.max_per_order ?? 10));
  const [startDate, setStartDate] = useState(start.date);
  const [startTime, setStartTime] = useState(start.time);
  const [endDate, setEndDate] = useState(end.date);
  const [endTime, setEndTime] = useState(end.time);
  const [hidden, setHidden] = useState(!!existing?.is_hidden);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setError("");
    if ((startDate && !validDate(startDate)) || (endDate && !validDate(endDate)) || (startTime && !validTime(startTime)) || (endTime && !validTime(endTime)))
      return setError(t("Check the sale dates (2026-12-31) and times (19:30)."));
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      price_kzt: Number(priceText),
      quantity: Number(quantity),
      max_per_order: Number(maxPer),
      sale_start: fromLocalInputs(startDate, startTime || "00:00"),
      sale_end: fromLocalInputs(endDate, endTime || "23:59"),
      is_hidden: hidden,
    };
    setBusy(true);
    try {
      if (existing) await api.request(`/ticket-types/${existing.id}`, { method: "PATCH", body });
      else await api.request(`/events/${event.id}/ticket-types`, { body });
      ctx.notify(existing ? t("Ticket type saved.") : t("Ticket type added."));
      onDone();
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!existing) return;
    setBusy(true);
    try {
      await api.request(`/ticket-types/${existing.id}`, { method: "DELETE" });
      ctx.notify(t("Ticket type removed."));
      onDone();
    } catch (e) {
      setError(failure(e));
      setBusy(false);
    }
  }
  return (
    <Card>
      <H2>{existing ? t("Edit ticket type") : t("New ticket type")}</H2>
      <Field label={t("Ticket name")} value={name} onChangeText={setName} maxLength={100} />
      <Field label={t("What’s included")} optional value={description} onChangeText={setDescription} maxLength={500} />
      <Row wrap={false}>
        <View style={{ flex: 1 }}>
          <Field label={t("Price · KZT")} value={priceText} onChangeText={setPrice} keyboardType="number-pad" hint={existing && existing.sold > 0 ? t("Orders already placed keep their price") : undefined} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t("Quantity")} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
        </View>
      </Row>
      <DateTimeFields label={t("Sales start")} optional date={startDate} time={startTime} onDate={setStartDate} onTime={setStartTime} />
      <DateTimeFields label={t("Sales end")} optional date={endDate} time={endTime} onDate={setEndDate} onTime={setEndTime} />
      <Field label={t("Most per order")} value={maxPer} onChangeText={setMaxPer} keyboardType="number-pad" />
      <Toggle label={t("Hidden")} hint={t("For guest lists and comps")} value={hidden} onChange={setHidden} />
      {error ? <Notice error>{error}</Notice> : null}
      <Row>
        <Button label={t("Save ticket type")} busy={busy} disabled={name.trim().length < 2} onPress={submit} />
        <Button kind="secondary" label={t("Cancel")} onPress={onDone} />
        {existing && existing.sold + existing.reserved === 0 && <Button kind="danger" label={t("Remove")} disabled={busy} onPress={remove} />}
      </Row>
    </Card>
  );
}

function SeatingSetup({ ctx, stats, onDone, onCancel }: { ctx: EventContext; stats?: TicketStats; onDone: () => void; onCancel?: () => void }) {
  const t = useT();
  const { event } = ctx;
  const layouts = useLoad("venue-layouts", (signal) => api.request<VenueLayout[]>("/venue-layouts", { signal }));
  const [venue, setVenue] = useState(event.venue_layout_id ?? "");
  const [values, setValues] = useState<Record<string, { name: string; price: string; max: string }>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = layouts.data?.find((l) => l.id === (venue || layouts.data?.[0]?.id));
  const configured = !!event.venue_layout_id && (stats?.ticket_types.length ?? 0) > 0;
  const value = (category: string) => {
    const current = stats?.ticket_types.find((type) => type.seat_category === category);
    return (
      values[`${chosen?.id}:${category}`] ?? {
        name: current?.name ?? t("Category {category}", { category: category }),
        price: String(current?.price_kzt ?? 5000),
        max: String(current?.max_per_order ?? 10),
      }
    );
  };
  const set = (category: string, patch: Partial<{ name: string; price: string; max: string }>) =>
    setValues((v) => ({ ...v, [`${chosen?.id}:${category}`]: { ...value(category), ...patch } }));
  async function submit() {
    if (!chosen) return;
    const categories = Object.keys(chosen.categories).map((c) => ({
      category: c,
      name: value(c).name.trim(),
      price_kzt: Number(value(c).price),
      max_per_order: Number(value(c).max),
    }));
    setBusy(true);
    setError("");
    try {
      await api.request(`/events/${event.id}/seating`, { body: { venue_id: chosen.id, categories } });
      ctx.reload();
      onDone();
      ctx.notify(t("Seating saved. Each seat category is now a ticket type."));
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <H2>{t("Numbered seats")}</H2>
      <T muted>{t("Choose the hall, then name and price each seat category. Guests pick their seats on a map.")}</T>
      {configured &&
        stats?.ticket_types.map((type) => (
          <Card key={type.id}>
            <Row style={{ justifyContent: "space-between" }}>
              <T bold>{type.name}</T>
              <T bold>{price(type.price_kzt)}</T>
            </Row>
            <T small muted>
              {t("Category {seat_category} · {sold} sold · {available} left of {quantity}", { seat_category: type.seat_category, sold: type.sold, available: type.available, quantity: type.quantity })}
            </T>
          </Card>
        ))}
      <Loaded data={layouts}>
        {(list) =>
          list.length === 0 ? (
            <Empty title={t("No venue layouts yet.")} description={t("A platform admin adds halls with numbered seats.")} />
          ) : (
            <Card>
              <Select
                label={t("Venue")}
                value={chosen?.id ?? ""}
                onChange={setVenue}
                disabled={configured && (stats?.totals.sold ?? 0) > 0}
                options={list.map((l) => ({ value: l.id, label: `${l.name}${l.city ? `, ${l.city}` : ""} · ${l.total_seats} seats` }))}
              />
              {chosen &&
                Object.entries(chosen.categories).map(([category, seats]) => (
                  <View key={`${chosen.id}-${category}`} style={{ gap: 8, borderTopWidth: 1, borderTopColor: color.line, paddingTop: 10 }}>
                    <T bold>
                      {t("Category {category} · {seats} seats", { category: category, seats: seats })}</T>
                    <Field label={t("Name")} value={value(category).name} onChangeText={(name) => set(category, { name })} maxLength={100} />
                    <Row wrap={false}>
                      <View style={{ flex: 1 }}>
                        <Field label={t("Price · KZT")} value={value(category).price} onChangeText={(p) => set(category, { price: p })} keyboardType="number-pad" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Field label={t("Most per order")} value={value(category).max} onChangeText={(max) => set(category, { max })} keyboardType="number-pad" />
                      </View>
                    </Row>
                  </View>
                ))}
              {error ? <Notice error>{error}</Notice> : null}
              <Button label={busy ? t("Saving…") : configured ? t("Update seating") : t("Set up seating")} busy={busy} onPress={submit} />
              {onCancel && <Button kind="secondary" label={t("Use general admission instead")} disabled={busy} onPress={onCancel} />}
            </Card>
          )
        }
      </Loaded>
    </View>
  );
}

/* ------------------------------ Paid sales ------------------------------ */

export function PaidSalesTab({ ctx }: { ctx: EventContext }) {
  const t = useT();
  const { event, role } = ctx;
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState("");
  const data = useLoad(`activation:${event.id}:${version}`, (signal) => api.request<Activation>(`/events/${event.id}/activation`, { signal }));
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
  const owner = role === "owner";
  return (
    <Loaded data={data}>
      {(a) => (
        <View style={{ gap: 12 }}>
          <Card>
            <Row style={{ justifyContent: "space-between" }}>
              <Eyebrow>{t("Box office")}</Eyebrow>
              <Badge tone={a.status === "active" ? "live" : a.status === "suspended" ? "bad" : "neutral"} label={a.status} />
            </Row>
            <H2>{t("Paid ticket sales")}</H2>
            <T muted>
              {a.status === "active"
                ? t("Paid sales are open. Guests can buy paid tickets (payments are simulated).")
                : a.status === "suspended"
                  ? a.suspension_reason ? t("Suspended by the platform: {reason}. Contact platform support.", { reason: a.suspension_reason }) : t("Suspended by the platform. Contact platform support.")
                  : t("Free registration works now. Paid tickets open once every step below is done.")}
            </T>
          </Card>
          {a.checklist.map((entry) => (
            <Card key={entry.item}>
              <Row wrap={false} style={{ alignItems: "flex-start" }}>
                <Icon name={entry.done ? "checkmark-circle" : "ellipse-outline"} tint={entry.done ? color.ok : color.muted} />
                <View style={{ flex: 1, gap: 6 }}>
                  <T bold>{entry.label}</T>
                  {!entry.done && entry.item === "paid_ticket_type" && <T small muted>{t("Add a ticket type with a price under Tickets.")}</T>}
                  {!entry.done && entry.item === "identity_verified" && (
                    <>
                      <T small muted>{t("Submit your legal name and IIN/BIN on your organizer profile; the platform team confirms it.")}</T>
                      <Button small kind="secondary" label={t("Organizer profile")} onPress={() => router.push("/organizer/profile")} style={{ alignSelf: "flex-start" }} />
                    </>
                  )}
                  {!entry.done && entry.item === "payout_account" && (
                    <>
                      <T small muted>{t("Add the bank account for payouts on your organizer profile.")}</T>
                      <Button small kind="secondary" label={t("Organizer profile")} onPress={() => router.push("/organizer/profile")} style={{ alignSelf: "flex-start" }} />
                    </>
                  )}
                  {!entry.done && entry.item === "activation_fee_paid" && (
                    <Button small kind="secondary" label={t("Pay the {amount} fee (simulated)", { amount: amount(a.fee_kzt) })} busy={busy === "fee"} disabled={!!busy || !owner} onPress={() => step("fee", "pay-fee", { outcome: "success" }, t("Activation fee paid (simulated)."))} style={{ alignSelf: "flex-start" }} />
                  )}
                  {!entry.done && entry.item === "terms_accepted" && (
                    <Button small kind="secondary" label={t("Accept the organizer terms ({terms_version})", { terms_version: a.terms_version })} disabled={!!busy || !owner} onPress={() => step("terms", "accept-terms", { terms_version: a.terms_version }, t("Organizer terms accepted."))} style={{ alignSelf: "flex-start" }} />
                  )}
                </View>
              </Row>
            </Card>
          ))}
          {a.status !== "active" && <Button label={t("Open paid sales")} busy={busy === "activate"} disabled={!a.can_activate || !!busy || !owner} onPress={() => step("activate", "activate", {}, t("Paid sales are open."))} />}
          {!owner && <T small muted>{t("Only the event owner can pay the fee, accept the terms and open paid sales.")}</T>}
        </View>
      )}
    </Loaded>
  );
}

/* ------------------------------ Promotions ------------------------------ */

export function PromotionsTab({ ctx }: { ctx: EventContext }) {
  const t = useT();
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
  async function qr(c: Campaign) {
    try {
      await shareFile(`/events/${event.id}/campaigns/${c.id}/qr.png`, `promo-${c.code}.png`);
    } catch (e) {
      ctx.notify(failure(e, t("Could not get the QR code.")), true);
    }
  }
  return (
    <Loaded data={data}>
      {({ campaigns, types }) => (
        <View style={{ gap: 12 }}>
          <H2>{t("Promo codes and links")}</H2>
          <T muted>{t("Each campaign has a code, a shareable link and a QR code for posters.")}</T>
          {adding ? (
            <CampaignForm
              ctx={ctx}
              types={types}
              onDone={(created) => {
                setAdding(false);
                if (created) setVersion((v) => v + 1);
              }}
            />
          ) : (
            <Button kind="secondary" icon="add" label={t("New campaign")} onPress={() => setAdding(true)} />
          )}
          {campaigns.length
            ? campaigns.map((c) => (
                <Card key={c.id}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <H2>{c.name}</H2>
                    <Badge tone={c.is_active ? "live" : "neutral"} label={c.is_active ? t("active") : t("paused")} />
                  </Row>
                  <T style={{ fontFamily: "monospace" }}>{c.code}</T>
                  <T small muted>
                    {c.discount_label} · {t("used {used}", { used: c.max_redemptions ? `${c.stats.redemptions} / ${c.max_redemptions}` : c.stats.redemptions })} · {t("net {amount}", { amount: amount(c.stats.net_revenue_kzt) })}
                  </T>
                  <Row>
                    <Button small kind="secondary" icon="copy-outline" label={t("Copy link")} onPress={() => void Clipboard.setStringAsync(c.link_url).then(() => ctx.notify(t("Link copied.")))} />
                    <Button small kind="secondary" icon="qr-code-outline" label={t("QR code")} onPress={() => qr(c)} />
                    <Button small kind="text" label={c.is_active ? t("Pause") : t("Resume")} onPress={() => toggle(c)} />
                  </Row>
                </Card>
              ))
            : !adding && <Empty icon="pricetag-outline" title={t("No campaigns yet.")} description={t("Create a code for students, early birds or partners.")} />}
        </View>
      )}
    </Loaded>
  );
}

function CampaignForm({ ctx, types, onDone }: { ctx: EventContext; types: TicketType[]; onDone: (created: boolean) => void }) {
  const t = useT();
  const { event } = ctx;
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState("percent");
  const [value, setValue] = useState("10");
  const [uses, setUses] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function create() {
    setError("");
    if ((from && !validDate(from)) || (until && !validDate(until))) return setError(t("Use dates like 2026-12-31."));
    if (code && !/^[A-Za-z0-9_-]+$/.test(code)) return setError(t("Codes use letters, numbers, - and _ only."));
    setBusy(true);
    try {
      await api.request(`/events/${event.id}/campaigns`, {
        body: {
          name: name.trim(),
          code: code.trim() || null,
          discount_type: kind,
          discount_value: Number(value),
          max_redemptions: uses.trim() ? Number(uses) : null,
          starts_at: fromLocalInputs(from, "00:00"),
          ends_at: fromLocalInputs(until, "23:59"),
          ticket_type_ids: picked,
        },
      });
      ctx.notify(t("Promo campaign created."));
      onDone(true);
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Field label={t("Campaign name")} value={name} onChangeText={setName} maxLength={100} placeholder={t("Student night")} />
      <Field label={t("Code")} optional value={code} onChangeText={(v) => setCode(v.toUpperCase())} maxLength={32} autoCapitalize="characters" placeholder="STUDENT20" hint={t("Leave empty to generate one.")} />
      <Select label={t("Discount")} value={kind} onChange={setKind} options={[{ value: "percent", label: t("Percent off") }, { value: "fixed", label: t("Tenge off per order") }]} />
      <Row wrap={false}>
        <View style={{ flex: 1 }}>
          <Field label={t("Amount")} value={value} onChangeText={setValue} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t("Uses")} optional value={uses} onChangeText={setUses} keyboardType="number-pad" />
        </View>
      </Row>
      <Row wrap={false}>
        <View style={{ flex: 1 }}>
          <Field label={t("From")} optional value={from} onChangeText={setFrom} placeholder={t("YYYY-MM-DD")} maxLength={10} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t("Until")} optional value={until} onChangeText={setUntil} placeholder={t("YYYY-MM-DD")} maxLength={10} />
        </View>
      </Row>
      <T bold>{t("Applies to (none chosen = every ticket type)")}</T>
      {types.map((type) => (
        <Toggle
          key={type.id}
          label={`${type.name} · ${price(type.price_kzt)}`}
          value={picked.includes(type.id)}
          onChange={(on) => setPicked((p) => (on ? [...p, type.id] : p.filter((x) => x !== type.id)))}
        />
      ))}
      {error ? <Notice error>{error}</Notice> : null}
      <Row>
        <Button label={t("Create campaign")} busy={busy} disabled={name.trim().length < 2 || !Number(value)} onPress={create} />
        <Button kind="secondary" label={t("Cancel")} onPress={() => onDone(false)} />
      </Row>
    </Card>
  );
}

/* ------------------------------ Attendees ------------------------------ */

const TICKET_STATUS: Record<Attendee["status"], string> = {
  valid: tk("Not arrived"),
  checked_in: tk("Checked in"),
  cancelled: tk("Cancelled"),
  refunded: tk("Refunded"),
};

export function AttendeesTab({ ctx }: { ctx: EventContext }) {
  const t = useT();
  const { event, role } = ctx;
  const [version, setVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [refunding, setRefunding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
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
  async function refund(orderId: string) {
    try {
      await api.request(`/orders/${orderId}/refund`, { body: { reason: reason.trim() } });
      setRefunding(null);
      setReason("");
      setVersion((v) => v + 1);
      ctx.notify(t("Order refunded in full (simulated). The buyer was emailed."));
    } catch (e) {
      ctx.notify(failure(e), true);
    }
  }
  return (
    <Loaded data={data}>
      {({ attendees, orders }) => {
        const q = search.toLowerCase();
        const visible = attendees.filter(
          (a) => (filter === "all" || a.status === filter) && `${a.attendee_name} ${a.attendee_email} ${a.ticket_id} ${a.order_id} ${a.seat ?? ""}`.toLowerCase().includes(q),
        );
        const paidOrders = orders.filter((o) => o.status === "confirmed" && o.total_kzt > 0);
        return (
          <View style={{ gap: 12 }}>
            <H2>{t("The guest list")}</H2>
            <T muted>{t("One ticket, one check-in. Search by name, email, seat or ticket reference.")}</T>
            <Button
              small
              kind="secondary"
              icon="download-outline"
              label={t("Export CSV")}
              style={{ alignSelf: "flex-start" }}
              onPress={() =>
                shareCsv(`attendees-${event.id.slice(0, 8)}.csv`, [
                  [t("Ticket"), t("Order"), t("Name"), t("Email"), t("Ticket type"), t("Seat"), t("Status"), t("Checked in at")],
                  ...attendees.map((a) => [a.ticket_id, a.order_id, a.attendee_name, a.attendee_email, a.ticket_type_name, a.seat ?? "", t(TICKET_STATUS[a.status]), a.checked_in_at ?? ""]),
                ]).catch((e) => ctx.notify(failure(e), true))
              }
            />
            <Field label={t("Search guests")} value={search} onChangeText={setSearch} placeholder={t("Name, email, seat or ticket reference")} />
            <Chips
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: t("All ({length})", { length: attendees.length }) },
                { value: "valid", label: t("Not arrived") },
                { value: "checked_in", label: t("Checked in") },
                { value: "cancelled", label: t("Cancelled") },
                { value: "refunded", label: t("Refunded") },
              ]}
            />
            {visible.length ? (
              visible.map((a) => (
                <Card key={a.ticket_id}>
                  <Row wrap={false}>
                    <Avatar name={a.attendee_name} />
                    <View style={{ flex: 1 }}>
                      <T bold>{a.attendee_name}</T>
                      <T small muted>{a.attendee_email}</T>
                      <T small muted style={{ fontFamily: "monospace" }}>{ref(a.ticket_id)}</T>
                    </View>
                  </Row>
                  <T small>
                    {a.ticket_type_name}
                    {a.seat ? ` · ${a.seat}` : ""} · {t(TICKET_STATUS[a.status])}
                    {a.checked_in_at ? t(" at {eventTime}", { eventTime: eventTime(a.checked_in_at, event.timezone) }) : ""}
                  </T>
                  {a.status === "valid" && <Button small kind="secondary" icon="ticket-outline" label={t("Check in")} onPress={() => admit(a.ticket_id)} style={{ alignSelf: "flex-start" }} />}
                </Card>
              ))
            ) : (
              <Empty icon="people-outline" title={attendees.length ? t("No guests match this search.") : t("A guest list waiting to happen.")} description={attendees.length ? t("Try a different name or status.") : t("New bookings will appear here.")} />
            )}
            {role === "owner" && paidOrders.length > 0 && (
              <>
                <H2>{t("Refunds")}</H2>
                <T small muted>{t("Full refunds only; money moves are simulated.")}</T>
                {paidOrders.map((o) => (
                  <Card key={o.id}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <T bold>{o.buyer_name}</T>
                      <T bold>{amount(o.total_kzt)}</T>
                    </Row>
                    <T small muted>
                      {t("{ref} · {length} tickets · {when}", { ref: ref(o.id), length: o.tickets.length, when: when(o.created_at, event) })}
                    </T>
                    {refunding === o.id ? (
                      <>
                        <Field label={t("Reason (sent to the buyer)")} value={reason} onChangeText={setReason} maxLength={500} />
                        <Row>
                          <Button kind="danger" label={t("Refund")} disabled={reason.trim().length < 3} onPress={() => refund(o.id)} />
                          <Button kind="text" label={t("Keep")} onPress={() => setRefunding(null)} />
                        </Row>
                      </>
                    ) : (
                      <Button small kind="text" label={t("Refund order")} onPress={() => setRefunding(o.id)} style={{ alignSelf: "flex-start" }} />
                    )}
                  </Card>
                ))}
              </>
            )}
          </View>
        );
      }}
    </Loaded>
  );
}

/* ------------------------------ Sales & analytics ------------------------------ */

export function SalesTab({ ctx }: { ctx: EventContext }) {
  const { event } = ctx;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const f = validDate(from) ? from : "";
  const u = validDate(to) ? to : "";
  const t = useT();
  const data = useLoad(`analytics:${event.id}:${f}:${u}`, (signal) =>
    api.request<Analytics>(`/events/${event.id}/analytics`, { signal, query: { date_from: fromLocalInputs(f, "00:00"), date_to: fromLocalInputs(u, "23:59") } }),
  );
  return (
    <View style={{ gap: 12 }}>
      <Row wrap={false}>
        <View style={{ flex: 1 }}>
          <Field label={t("From")} optional value={from} onChangeText={setFrom} placeholder={t("YYYY-MM-DD")} maxLength={10} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t("Until")} optional value={to} onChangeText={setTo} placeholder={t("YYYY-MM-DD")} maxLength={10} />
        </View>
      </Row>
      <Loaded data={data}>
        {(a) => {
          const peak = Math.max(1, ...a.sales_over_time.map((d) => d.revenue_kzt));
          return (
            <View style={{ gap: 12 }}>
              <Row>
                <Stat label={t("Net revenue")} value={amount(a.revenue.net_revenue_kzt)} note={t("Gross {gross} · discounts {discounts} · refunds {refunds}", { gross: amount(a.revenue.gross_sales_kzt), discounts: amount(a.revenue.discounts_kzt), refunds: amount(a.revenue.refunds_kzt) })} icon="stats-chart" />
                <Stat label={t("Sold")} value={`${a.capacity.percent_sold}%`} note={t("{tickets_sold} of {capacity} · {tickets_remaining} left", { tickets_sold: a.capacity.tickets_sold, capacity: a.capacity.capacity, tickets_remaining: a.capacity.tickets_remaining })} icon="ticket-outline" />
                <Stat label={t("Attendance")} value={`${a.attendance.checked_in_percent}%`} note={t("{checked_in} checked in · {absent} absent", { checked_in: a.attendance.checked_in, absent: a.attendance.absent })} icon="people-outline" />
              </Row>
              <H2>{t("Sales over time")}</H2>
              {a.sales_over_time.length ? (
                <Card>
                  {a.sales_over_time.map((d) => (
                    <View key={d.date} style={{ gap: 4 }}>
                      <Row style={{ justifyContent: "space-between" }}>
                        <T small>{d.date}</T>
                        <T small muted>
                          {t("{amount} · {tickets} tickets", { amount: amount(d.revenue_kzt), tickets: d.tickets })}</T>
                      </Row>
                      <Progress value={(d.revenue_kzt / peak) * 100} />
                    </View>
                  ))}
                </Card>
              ) : (
                <T muted>{t("No sales in this period.")}</T>
              )}
              <H2>{t("By ticket type")}</H2>
              {a.by_ticket_type.map((row) => (
                <Card key={row.ticket_type_id}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <T bold>{row.name}</T>
                    <T bold>{amount(row.revenue_kzt)}</T>
                  </Row>
                  <T small muted>
                    {t("{price} · {quantity} places · {tickets_sold} sold · {checked_in} checked in", { price: price(row.price_kzt), quantity: row.quantity, tickets_sold: row.tickets_sold, checked_in: row.checked_in })}</T>
                </Card>
              ))}
              {a.campaigns.length > 0 && (
                <>
                  <H2>{t("Promo campaigns")}</H2>
                  {a.campaigns.map((c) => (
                    <Card key={c.campaign_id}>
                      <T bold>
                        {c.name} · {c.code}
                      </T>
                      <T small muted>
                        {t("{redemptions} uses · {tickets_sold} tickets · {amount}", { redemptions: c.redemptions, tickets_sold: c.tickets_sold, amount: amount(c.net_revenue_kzt) })}
                      </T>
                    </Card>
                  ))}
                </>
              )}
              {a.is_simulated && <T small muted>{t("Payments are simulated; no real money was collected.")}</T>}
            </View>
          );
        }}
      </Loaded>
    </View>
  );
}

/* ------------------------------ Team ------------------------------ */

export function TeamTab({ ctx }: { ctx: EventContext }) {
  const t = useT();
  const { event, role } = ctx;
  const [version, setVersion] = useState(0);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<StaffRole>("checkin_staff");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const staff = useLoad(`staff:${event.id}:${version}`, (signal) => api.request<StaffMember[]>(`/events/${event.id}/staff`, { signal }));
  async function add() {
    setError("");
    setBusy(true);
    try {
      await api.request(`/events/${event.id}/staff`, { body: { email: email.trim(), role: newRole } });
      setEmail("");
      setVersion((v) => v + 1);
      ctx.notify(t("Team member added. They see this event the next time they sign in."));
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(member: StaffMember) {
    try {
      await api.request(`/events/${event.id}/staff/${member.user_id}`, { method: "DELETE" });
      setVersion((v) => v + 1);
      ctx.notify(t("{full_name} no longer works on this event.", { full_name: member.full_name }));
    } catch (e) {
      ctx.notify(failure(e), true);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <H2>{t("Good people at the door.")}</H2>
      <T muted>{t("Add people by the email of their BiletFlow account. Managers can run the event; check-in staff only scan tickets.")}</T>
      <Loaded data={staff}>
        {(list) =>
          list.map((member) => (
            <Card key={member.id}>
              <Row wrap={false}>
                <Avatar name={member.full_name} />
                <View style={{ flex: 1 }}>
                  <T bold>{member.full_name}</T>
                  <T small muted>{member.email}</T>
                  <T small>{ROLE_LABELS[member.role]}</T>
                </View>
                {member.role !== "owner" && (role === "owner" || member.role !== "manager") && (
                  <Button small kind="danger" label={t("Remove")} onPress={() => remove(member)} />
                )}
              </Row>
            </Card>
          ))
        }
      </Loaded>
      <Card>
        <H2>{t("Add a team member")}</H2>
        <Field label={t("Email of their BiletFlow account")} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" maxLength={255} placeholder="teammate@example.com" />
        <Select
          label={t("Role")}
          value={newRole}
          onChange={setNewRole}
          options={[
            { value: "checkin_staff", label: t("Check-in staff") },
            { value: "support_staff", label: t("Support staff (answers guest questions)") },
            ...(role === "owner" ? [{ value: "manager" as StaffRole, label: t("Manager") }] : []),
          ]}
        />
        {error ? <Notice error>{error}</Notice> : null}
        <Button icon="add" label={t("Add to the team")} busy={busy} disabled={!email.includes("@")} onPress={add} />
      </Card>
    </View>
  );
}

/* ------------------------------ Activity ------------------------------ */

const AREAS = [
  ["", tk("Everything")],
  ["event", tk("Event details")],
  ["ticket_type", tk("Ticket types")],
  ["order", tk("Orders")],
  ["payment", tk("Payments")],
  ["refund", tk("Refunds")],
  ["staff", tk("Team")],
  ["activation", tk("Paid sales")],
  ["check_in", "Check-in"],
  ["promo", tk("Promotions")],
  ["support", tk("Support")],
] as const;

export function ActivityTab({ ctx }: { ctx: EventContext }) {
  const t = useT();
  const { event } = ctx;
  const [area, setArea] = useState("");
  const log = useLoad(`activity:${event.id}:${area}`, (signal) =>
    api.request<ActivityEntry[]>(`/events/${event.id}/activity`, { signal, query: { area: area || undefined, limit: 100 } }),
  );
  return (
    <View style={{ gap: 12 }}>
      <H2>{t("Event history")}</H2>
      <T muted>{t("Who changed what, and when. Entries cannot be edited or deleted.")}</T>
      <Select label={t("Show")} value={area} onChange={setArea} options={AREAS.map(([value, label]) => ({ value, label: t(label) }))} />
      <Loaded data={log}>
        {(entries) =>
          entries.length ? (
            entries.map((entry) => (
              <View key={entry.id} style={{ borderLeftWidth: 2, borderLeftColor: color.ember, paddingLeft: 10, gap: 2 }}>
                <T small muted>{when(entry.created_at, event)}</T>
                <T>
                  <T bold>{entry.actor_name ?? t("BiletFlow")}</T> {entry.description}
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
