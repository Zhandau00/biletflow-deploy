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

type DraftTicket = { key: string; name: string; description: string; price: string; quantity: string };

export function EventEditor({ existing, onSaved }: { existing?: ApiEvent; onSaved?: (event: ApiEvent) => void }) {
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
    { key: "t1", name: "General admission", description: "Entry to the event.", price: "0", quantity: "100" },
  ]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const change = (index: number, patch: Partial<DraftTicket>) =>
    setTypes((items) => items.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  async function submit() {
    setError("");
    setMessage("");
    if (title.trim().length < 3) return setError("Give the event a name of at least 3 characters.");
    if (!validDate(date) || !validTime(time) || !validTime(endTime) || (endDate && !validDate(endDate)))
      return setError("Check the dates (2026-12-31) and times (19:30).");
    if (!venue.trim()) return setError("Add the venue name.");
    const startAt = fromLocalInputs(date, time);
    const endAt = fromLocalInputs(endDate || date, endTime);
    if (startAt && endAt && endAt <= startAt) return setError("The event has to end after it starts.");
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap < 1) return setError("Capacity must be a whole number of at least 1.");
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
        setMessage(existing.status === "published" ? "Changes saved. Ticket holders are told by email about date, time and venue changes." : "Changes saved.");
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
      setError(failure(e, "Could not save this event."));
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
        <Eyebrow>01 · The essentials</Eyebrow>
        <T muted small>Give people a reason to put this in their calendar.</T>
        <Field label="Event name" value={title} onChangeText={setTitle} placeholder="Something worth showing up for" maxLength={255} />
        <Field label="A line for the poster" optional value={subtitle} onChangeText={setSubtitle} placeholder="One good sentence about your event" maxLength={255} />
        <Select label="Category" value={category} onChange={setCategory} options={categoryOptions} />
        <Select
          label="Who can find it"
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: "public", label: "Public — listed on BiletFlow" },
            { value: "unlisted", label: "Unlisted — only people with the link" },
            { value: "private", label: "Private — only your team" },
          ]}
        />
        <Field label="About the event" value={description} onChangeText={setDescription} multiline maxLength={10000} placeholder="The lineup, the atmosphere, the things people should know…" />
      </Card>
      <Card>
        <Eyebrow>02 · A time & a place</Eyebrow>
        <T muted small>Times are Kazakhstan time (UTC+5).</T>
        <DateTimeFields label="Date" date={date} time={time} onDate={setDate} onTime={setTime} />
        <DateTimeFields label="Ends on" optional hint="If not the same day" date={endDate} time={endTime} onDate={setEndDate} onTime={setEndTime} />
        <Field label="Venue" value={venue} onChangeText={setVenue} placeholder="Venue name" maxLength={255} />
        <Select label="City" value={city} onChange={setCity} options={[...CITIES.map((c) => ({ value: c, label: c })), { value: "other", label: "Another city…" }]} />
        {city === "other" && <Field label="City name" value={otherCity} onChangeText={setOtherCity} maxLength={100} />}
        <Field label="Street address" optional value={address} onChangeText={setAddress} maxLength={500} />
        <Field
          label="Capacity"
          value={capacity}
          onChangeText={setCapacity}
          keyboardType="number-pad"
          hint={seating === "assigned" ? "With numbered seats, the hall you choose next sets the capacity" : "All ticket types together cannot exceed it"}
        />
        {!existing ? (
          <Select
            label="Seating"
            value={seating}
            onChange={setSeating}
            options={[
              { value: "general_admission", label: "General admission" },
              { value: "assigned", label: "Numbered seats (choose a venue next)" },
            ]}
          />
        ) : (
          <T muted>Seating: {existing.seating_type === "assigned" ? "Numbered seats" : "General admission"}</T>
        )}
        <Field label="Refund policy" optional value={refundPolicy} onChangeText={setRefundPolicy} multiline maxLength={5000} placeholder="For example: full refund up to 48 hours before the event." />
      </Card>
      {!existing && seating === "general_admission" && (
        <Card>
          <Eyebrow>03 · A way in</Eyebrow>
          <T muted small>Make it free, or set a price in tenge. Paid sales open after the activation checklist.</T>
          {types.map((t, i) => (
            <View key={t.key} style={{ gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: color.line, paddingTop: i ? 12 : 0 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <H2>Ticket type {String(i + 1).padStart(2, "0")}</H2>
                {types.length > 1 && <Button small kind="danger" label="Remove" onPress={() => setTypes((items) => items.filter((x) => x.key !== t.key))} />}
              </Row>
              <Field label="Ticket name" value={t.name} onChangeText={(name) => change(i, { name })} maxLength={100} />
              <Field label="What’s included" value={t.description} onChangeText={(description) => change(i, { description })} maxLength={500} />
              <Row wrap={false}>
                <View style={{ flex: 1 }}>
                  <Field label="Price · KZT" value={t.price} onChangeText={(price) => change(i, { price })} keyboardType="number-pad" hint="0 = free" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Quantity" value={t.quantity} onChangeText={(quantity) => change(i, { quantity })} keyboardType="number-pad" />
                </View>
              </Row>
            </View>
          ))}
          <Button
            kind="secondary"
            icon="add"
            label="Add ticket type"
            onPress={() => setTypes((items) => [...items, { key: `t${Date.now()}`, name: "", description: "", price: "0", quantity: "50" }])}
          />
        </Card>
      )}
      {error ? <Notice error>{error}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}
      <T small muted>{existing ? "Existing orders keep the price they were bought at." : "Your event starts as a draft. Publish it when you’re ready."}</T>
      <Button label={busy ? "Saving…" : existing ? "Save changes" : "Create draft"} icon={existing ? "checkmark" : "arrow-forward"} busy={busy} onPress={submit} />
      {!existing && (
        <Row>
          <Icon name="information-circle-outline" tint={color.muted} size={16} />
          <T small muted>You can add images after the event is created.</T>
        </Row>
      )}
    </View>
  );
}
