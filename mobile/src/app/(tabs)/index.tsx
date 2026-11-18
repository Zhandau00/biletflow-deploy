/** What's on: published events with search, city, date and category filters. */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { CATEGORIES, CITIES, WHEN_OPTIONS, cardStatus, eventDate, eventTime, posterInfo, venueLine, whenRange, type ListedEvent, type WhenFilter } from "@/lib/events";
import { Poster } from "@/components/poster";
import { Button, Card, Chips, Empty, Field, Icon, Intro, LoadError, Loading, Row, Screen, Select, T, H2 } from "@/components/ui";
import { useLoad } from "@/components/use-load";
import { color } from "@/components/theme";

function useDebounced<T>(value: T, delay = 350) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export function EventCard({ event }: { event: ListedEvent }) {
  const status = cardStatus(event);
  return (
    <Card onPress={() => router.push(`/event/${event.id}`)} style={{ padding: 0, overflow: "hidden" }}>
      <Poster event={posterInfo(event)} />
      <View style={{ padding: 16, gap: 6 }}>
        <T small style={{ color: color.ember, letterSpacing: 0.6 }}>
          {eventDate(event.start_at, event.timezone, { weekday: "short", day: "numeric", month: "short" }).toUpperCase()} / {eventTime(event.start_at, event.timezone)}
        </T>
        <H2>{event.title}</H2>
        <T muted>{venueLine(event)}</T>
        <Row style={{ justifyContent: "space-between", marginTop: 4 }}>
          <T bold>{status.label}</T>
          <Row>
            <T style={{ color: color.ember }}>{status.action}</T>
            <Icon name="arrow-forward" size={16} tint={color.ember} />
          </Row>
        </Row>
      </View>
    </Card>
  );
}

export default function Browse() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [when, setWhen] = useState<WhenFilter>("any");
  const [sort, setSort] = useState<"date" | "price">("date");
  const q = useDebounced(search.trim());
  const events = useLoad(JSON.stringify({ q, category, city, when }), (signal) =>
    api.events.list({ q, category, city, ...whenRange(when) }, { signal }),
  );
  const list = [...(events.data ?? [])];
  if (sort === "price")
    list.sort((a, b) => (a.price_from_kzt ?? Number.MAX_SAFE_INTEGER) - (b.price_from_kzt ?? Number.MAX_SAFE_INTEGER));

  return (
    <Screen onRefresh={events.reload} refreshing={events.refreshing}>
      <Intro eyebrow="Out of the ordinary. Into the city." title="Make a night of it." description="Big stages, small rooms, and everything worth showing up for." />
      <Field label="Search" value={search} onChangeText={setSearch} placeholder="An event, an artist, a venue…" maxLength={100} returnKeyType="search" autoCorrect={false} />
      <Row wrap={false}>
        <View style={{ flex: 1 }}>
          <Select label="City" value={city} onChange={setCity} options={[{ value: "", label: "All cities" }, ...CITIES.map((c) => ({ value: c, label: c }))]} />
        </View>
        <View style={{ flex: 1 }}>
          <Select label="When" value={when} onChange={setWhen} options={WHEN_OPTIONS} />
        </View>
      </Row>
      <Chips value={category} onChange={setCategory} options={[{ value: "", label: "All events" }, ...CATEGORIES.map((c) => ({ value: c.value, label: c.label }))]} />
      <Row style={{ justifyContent: "space-between" }}>
        <T muted small>
          {events.data ? `${list.length} ${list.length === 1 ? "event" : "events"} to look forward to` : "Finding events…"}
        </T>
        <Chips scroll={false} value={sort} onChange={setSort} options={[{ value: "date", label: "Soonest" }, { value: "price", label: "Lowest price" }]} />
      </Row>
      {events.status === "error" && <LoadError message={events.error.message} retry={events.reload} />}
      {!events.data ? (
        events.status === "loading" && <Loading label="Finding events…" />
      ) : list.length ? (
        list.map((event) => <EventCard key={event.id} event={event} />)
      ) : (
        <>
          <Empty icon="search" title="Nothing on the bill just yet." description="Try a different city, category, date or search. A good night might be one filter away." />
          <Button
            kind="secondary"
            label="Clear filters"
            onPress={() => {
              setSearch("");
              setCategory("");
              setCity("");
              setWhen("any");
            }}
          />
        </>
      )}
      <Card style={{ marginTop: 12 }}>
        <T small style={{ color: color.ember, letterSpacing: 1 }}>ON THE OTHER SIDE OF THE STAGE?</T>
        <H2>Put your event on the map.</H2>
        <Button kind="secondary" label="Meet your box office" icon="arrow-forward" onPress={() => router.push("/work")} />
      </Card>
    </Screen>
  );
}
