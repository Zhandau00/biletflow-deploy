/** One event's workspace, for its owner and managers. */
import { useState } from "react";
import { View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { eventDate, eventTime, type ApiEvent } from "@/lib/events";
import { canManageRole, type StaffRole } from "@/lib/organizer";
import { EventEditor } from "@/components/organizer/editor";
import { EventActions } from "@/components/organizer/pages";
import { lifecycleLabel, type EventContext } from "@/components/organizer/shared";
import { ActivityTab, AttendeesTab, OverviewTab, PaidSalesTab, PromotionsTab, SalesTab, TeamTab, TicketsTab } from "@/components/organizer/tabs";
import { openSupport, signInFirst } from "@/components/links";
import { useSession } from "@/components/session";
import { useLoad } from "@/components/use-load";
import { Badge, Button, Chips, Empty, Eyebrow, H1, Loading, Notice, Row, Screen, T } from "@/components/ui";

import { useT , tk } from "@/lib/i18n";
const TABS = [tk("Overview"), tk("Tickets"), tk("Paid sales"), tk("Promotions"), tk("Attendees"), tk("Sales"), tk("Team"), tk("Activity"), tk("Details")];

export default function ManageEvent() {
  const t = useT();
  const params = useLocalSearchParams<{ id: string; tab?: string; seating?: string }>();
  const id = params.id;
  const { ready, user, staffEvents } = useSession();
  const [tab, setTab] = useState(TABS.includes(params.tab ?? "") ? params.tab! : "Overview");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [saved, setSaved] = useState<ApiEvent | null>(null);
  const [version, setVersion] = useState(0);
  const data = useLoad(`manage:${id}:${version}`, (signal) => api.request<ApiEvent>(`/events/${id}`, { signal }));
  const role = staffEvents.find((e) => e.id === id)?.my_role as StaffRole | undefined;

  if (!ready)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!user)
    return (
      <Screen>
        <Empty title={t("Sign in to manage this event.")} action={t("Sign in")} onAction={() => signInFirst(`/organizer/${id}`)} />
      </Screen>
    );
  if (data.status === "error" && !data.data)
    return (
      <Screen>
        <Empty
          title={t("This isn’t one of your events.")}
          description={data.httpStatus === 404 ? t("The event may have been removed, or the link is wrong.") : data.error?.message}
          action={t("Back to your events")}
          onAction={() => router.replace("/organizer")}
        />
      </Screen>
    );
  const event = saved ?? data.data;
  if (!event)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!role || !canManageRole(role))
    return (
      <Screen>
        <Empty
          title={t("This isn’t one of your events.")}
          description={t("Only the event's owner and managers can open its workspace. Check-in staff use the check-in desk.")}
          action={role ? t("Open the check-in desk") : t("Back to your events")}
          onAction={() => router.replace(role ? "/check-in" : "/organizer")}
        />
      </Screen>
    );

  const ctx: EventContext = {
    event,
    role,
    reload: () => {
      setSaved(null);
      setVersion((v) => v + 1);
    },
    setEvent: setSaved,
    notify: (text, error = false) => setNotice({ text, error }),
  };
  const live = event.lifecycle === "upcoming" || event.lifecycle === "active";
  return (
    <Screen onRefresh={ctx.reload} refreshing={data.refreshing}>
      <Stack.Screen options={{ title: event.title }} />
      <Row>
        <Badge tone={live ? "live" : "neutral"} label={lifecycleLabel(event.lifecycle)} />
        {event.is_suspended && <Badge tone="bad" label={t("Suspended by the platform")} />}
      </Row>
      <T small muted>
        {eventDate(event.start_at, event.timezone, { weekday: "short", day: "numeric", month: "short" })} · {eventTime(event.start_at, event.timezone)} · {event.city ?? t("City to be announced")}
      </T>
      <View style={{ gap: 4 }}>
        <Eyebrow>{role === "owner" ? t("Your event · owner") : t("Your event · manager")}</Eyebrow>
        <H1>{event.title}</H1>
      </View>
      <EventActions ctx={ctx} />
      <Chips
        value={tab}
        onChange={(key) => {
          setTab(key);
          setNotice(null);
        }}
        options={TABS.map((key) => ({ value: key, label: t(key) }))}
      />
      {notice && <Notice error={notice.error} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
      {tab === "Overview" && <OverviewTab ctx={ctx} />}
      {tab === "Tickets" && <TicketsTab ctx={ctx} seating={params.seating === "1"} />}
      {tab === "Paid sales" && <PaidSalesTab ctx={ctx} />}
      {tab === "Promotions" && <PromotionsTab ctx={ctx} />}
      {tab === "Attendees" && <AttendeesTab ctx={ctx} />}
      {tab === "Sales" && <SalesTab ctx={ctx} />}
      {tab === "Team" && <TeamTab ctx={ctx} />}
      {tab === "Activity" && <ActivityTab ctx={ctx} />}
      {tab === "Details" && <EventEditor existing={event} onSaved={ctx.setEvent} />}
      <Button kind="text" icon="help-buoy-outline" label={t("Get platform support for this event")} onPress={() => openSupport({ event: event.id, to: "platform" })} />
    </Screen>
  );
}
