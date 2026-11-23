/** Create or edit an event (the website's EventEditor). */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { CATEGORIES, CITIES, categoryLabel, type ApiEvent } from "@/lib/events";
import { fromLocalInputs, toLocalInputs } from "@/lib/organizer";
import { refreshSession } from "../session";
import { failure } from "../use-load";
import { Button, Card, Eyebrow, Field, H2, Icon, Notice, Row, Select, T } from "../ui";
import { color } from "../theme";
import { DateTimeFields, validDate, validTime } from "./shared";

import { useT } from "@/lib/i18n";
type DraftTicket = { key: string; name: string; description: string; price: string; quantity: string };

export function EventEditor({ existing, onSaved }: { existing?: ApiEvent; onSaved?: (event: ApiEvent) => void }) {
  const t = useT();
  const start = toLocalInputs(existing?.start_at);
  const end = toLocalInputs(existing?.end_at);
  const knownCity = !existing?.city || CITIES.includes(existing.city);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [subtitle, setSubtitle] = useState(existing?.subtitle ?? "");
  const [category, setCategory] = useState(existing?.category ?? "concert");
  const [visibility, setVisibility] = useState<string>(existing?.visibility ?? "public");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time || "19:00");
  const [endDate, setEndDate] = useState(end.date !== start.date ? end.date : "");
  const [endTime, setEndTime] = useState(end.time || "22:00");
  const [venue, setVenue] = useState(existing?.venue_name ?? "");
  const [city, setCity] = useState(knownCity ? (existing?.city ?? "Almaty") : "other");
  const [otherCity, setOtherCity] = useState(knownCity ? "" : (existing?.city ?? ""));
  const [address, setAddress] = useState(existing?.venue_address ?? "");
  const [capacity, setCapacity] = useState(String(existing?.capacity ?? 100));
  const [refundPolicy, setRefundPolicy] = useState(existing?.refund_policy ?? "");
  const [seating, setSeating] = useState<string>(existing?.seating_type ?? "general_admission");
  const [types, setTypes] = useState<DraftTicket[]>([
    { key: "t1", name: t("General admission"), description: t("Entry to the event."), price: "0", quantity: "100" },
  ]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const change = (index: number, patch: Partial<DraftTicket>) =>
    setTypes((items) => items.map((type, i) => (i === index ? { ...type, ...patch } : type)));

  async function submit() {
    setError("");
    setMessage("");
    if (title.trim().length < 3) return setError(t("Give the event a name of at least 3 characters."));
    if (!validDate(date) || !validTime(time) || !validTime(endTime) || (endDate && !validDate(endDate)))
      return setError(t("Check the dates (2026-12-31) and times (19:30)."));
    if (!venue.trim()) return setError(t("Add the venue name."));
    const startAt = fromLocalInputs(date, time);
    const endAt = fromLocalInputs(endDate || date, endTime);
    if (startAt && endAt && endAt <= startAt) return setError(t("The event has to end after it starts."));
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap < 1) return setError(t("Capacity must be a whole number of at least 1."));
    const finalCity = city === "other" ? otherCity.trim() : city;
    const body = {
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      description: description.trim() || null,
      category: category || null,
      city: finalCity || null,
      venue_name: venue.trim() || null,
      venue_address: address.trim() || null,
      start_at: startAt,
      end_at: endAt,
      timezone: existing?.timezone ?? "Asia/Almaty",
      capacity: cap,
      visibility,
      refund_policy: refundPolicy.trim() || null,
      // Numbered seats are set up after creation (POST /events/{id}/seating)
    };
    setBusy(true);
    try {
      if (existing) {
        const saved = await api.request<ApiEvent>(`/events/${existing.id}`, { method: "PATCH", body });
        setMessage(existing.status === "published" ? t("Changes saved. Ticket holders are told by email about date, time and venue changes.") : t("Changes saved."));
        onSaved?.(saved);
      } else {
        const created = await api.request<ApiEvent>("/events/", { body });
        if (seating === "general_admission")
          for (const t of types)
            await api.request(`/events/${created.id}/ticket-types`, {
              body: { name: t.name.trim(), description: t.description.trim() || null, price_kzt: Number(t.price) || 0, quantity: Number(t.quantity) || 0 },
            });
        await refreshSession();
        router.replace({ pathname: "/organizer/[id]", params: { id: created.id, ...(seating === "assigned" ? { tab: "Tickets", seating: "1" } : {}) } });
      }
    } catch (e) {
      setError(failure(e, t("Could not save this event.")));
    } finally {
      setBusy(false);
    }
  }

  const categoryOptions = [
    ...CATEGORIES.map((c) => ({ value: c.value as string, label: c.label })),
    ...(existing?.category && !CATEGORIES.some((c) => c.value === existing.category) ? [{ value: existing.category, label: categoryLabel(existing.category) }] : []),
  ];

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <Eyebrow>{t("01 · The essentials")}</Eyebrow>
        <T muted small>{t("Give people a reason to put this in their calendar.")}</T>
        <Field label={t("Event name")} value={title} onChangeText={setTitle} placeholder={t("Something worth showing up for")} maxLength={255} />
        <Field label={t("A line for the poster")} optional value={subtitle} onChangeText={setSubtitle} placeholder={t("One good sentence about your event")} maxLength={255} />
        <Select label={t("Category")} value={category} onChange={setCategory} options={categoryOptions} />
        <Select
          label={t("Who can find it")}
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: "public", label: t("Public — listed on BiletFlow") },
            { value: "unlisted", label: t("Unlisted — only people with the link") },
            { value: "private", label: t("Private — only your team") },
          ]}
        />
        <Field label={t("About the event")} value={description} onChangeText={setDescription} multiline maxLength={10000} placeholder={t("The lineup, the atmosphere, the things people should know…")} />
      </Card>
      <Card>
        <Eyebrow>{t("02 · A time & a place")}</Eyebrow>
        <T muted small>{t("Times are Kazakhstan time (UTC+5).")}</T>
        <DateTimeFields label={t("Date")} date={date} time={time} onDate={setDate} onTime={setTime} />
        <DateTimeFields label={t("Ends on")} optional hint={t("If not the same day")} date={endDate} time={endTime} onDate={setEndDate} onTime={setEndTime} />
        <Field label={t("Venue")} value={venue} onChangeText={setVenue} placeholder={t("Venue name")} maxLength={255} />
        <Select label={t("City")} value={city} onChange={setCity} options={[...CITIES.map((c) => ({ value: c, label: t(c) })), { value: "other", label: t("Another city…") }]} />
        {city === "other" && <Field label={t("City name")} value={otherCity} onChangeText={setOtherCity} maxLength={100} />}
        <Field label={t("Street address")} optional value={address} onChangeText={setAddress} maxLength={500} />
        <Field
          label={t("Capacity")}
          value={capacity}
          onChangeText={setCapacity}
          keyboardType="number-pad"
          hint={seating === "assigned" ? t("With numbered seats, the hall you choose next sets the capacity") : t("All ticket types together cannot exceed it")}
        />
        {!existing ? (
          <Select
            label={t("Seating")}
            value={seating}
            onChange={setSeating}
            options={[
              { value: "general_admission", label: t("General admission") },
              { value: "assigned", label: t("Numbered seats (choose a venue next)") },
            ]}
          />
        ) : (
          <T muted>{t("Seating:")}{" "}{existing.seating_type === "assigned" ? t("Numbered seats") : t("General admission")}</T>
        )}
        <Field label={t("Refund policy")} optional value={refundPolicy} onChangeText={setRefundPolicy} multiline maxLength={5000} placeholder={t("For example: full refund up to 48 hours before the event.")} />
      </Card>
      {!existing && seating === "general_admission" && (
        <Card>
          <Eyebrow>{t("03 · A way in")}</Eyebrow>
          <T muted small>{t("Make it free, or set a price in tenge. Paid sales open after the activation checklist.")}</T>
          {types.map((type, i) => (
            <View key={type.key} style={{ gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: color.line, paddingTop: i ? 12 : 0 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <H2>{t("Ticket type")}{" "}{String(i + 1).padStart(2, "0")}</H2>
                {types.length > 1 && <Button small kind="danger" label={t("Remove")} onPress={() => setTypes((items) => items.filter((x) => x.key !== type.key))} />}
              </Row>
              <Field label={t("Ticket name")} value={type.name} onChangeText={(name) => change(i, { name })} maxLength={100} />
              <Field label={t("What’s included")} value={type.description} onChangeText={(description) => change(i, { description })} maxLength={500} />
              <Row wrap={false}>
                <View style={{ flex: 1 }}>
                  <Field label={t("Price · KZT")} value={type.price} onChangeText={(price) => change(i, { price })} keyboardType="number-pad" hint={t("0 = free")} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label={t("Quantity")} value={type.quantity} onChangeText={(quantity) => change(i, { quantity })} keyboardType="number-pad" />
                </View>
              </Row>
            </View>
          ))}
          <Button
            kind="secondary"
            icon="add"
            label={t("Add ticket type")}
            onPress={() => setTypes((items) => [...items, { key: `t${Date.now()}`, name: "", description: "", price: "0", quantity: "50" }])}
          />
        </Card>
      )}
      {error ? <Notice error>{error}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}
      <T small muted>{existing ? t("Existing orders keep the price they were bought at.") : t("Your event starts as a draft. Publish it when you’re ready.")}</T>
      <Button label={busy ? t("Saving…") : existing ? t("Save changes") : t("Create draft")} icon={existing ? "checkmark" : "arrow-forward"} busy={busy} onPress={submit} />
      {!existing && (
        <Row>
          <Icon name="information-circle-outline" tint={color.muted} size={16} />
          <T small muted>{t("You can add images after the event is created.")}</T>
        </Row>
      )}
    </View>
  );
}
