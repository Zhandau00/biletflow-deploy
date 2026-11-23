/**
 * Check-in desk for owners, managers and check-in staff: scan a QR code with
 * the camera, type a code, or find a guest by name, then admit them. Every
 * check-in is recorded and can be undone with a reason.
 */
import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { router } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "@/lib/api";
import { eventDate, eventTime } from "@/lib/events";
import { canManageRole, type Attendee, type CheckInRecord, type CheckInResult, type CheckInStats, type MyEvent } from "@/lib/organizer";
import { signInFirst } from "@/components/links";
import { useSession } from "@/components/session";
import { failure, useLoad } from "@/components/use-load";
import { Avatar, Badge, Button, Card, Empty, Field, H2, Intro, Loading, Notice, Progress, Row, Screen, Select, T } from "@/components/ui";
import { color } from "@/components/theme";

import { useT } from "@/lib/i18n";
const TONE: Record<string, string> = {
  valid: color.ok,
  already_used: color.gold,
};

export default function CheckIn() {
  const t = useT();
  const { ready, user } = useSession();
  const [selected, setSelected] = useState("");
  const events = useLoad(`checkin-events:${user?.id ?? ""}`, async (signal) => {
    if (!user) return [] as MyEvent[];
    const [managed, door] = await Promise.all([
      api.request<MyEvent[]>("/events/mine", { signal }),
      api.request<MyEvent[]>("/events/mine", { signal, query: { role: "checkin_staff" } }),
    ]);
    // Events still open for check-in, soonest first
    return [...managed, ...door]
      .filter((e, i, all) => all.findIndex((x) => x.id === e.id) === i)
      .filter((e) => e.lifecycle === "upcoming" || e.lifecycle === "active")
      .sort((a, b) => a.start_at.localeCompare(b.start_at));
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
        <Empty icon="people-outline" title={t("The door list lives here.")} description={t("Sign in with the account your organizer added to the event team.")} action={t("Sign in")} onAction={() => signInFirst("/check-in")} />
      </Screen>
    );
  const list = events.data ?? [];
  const event = list.find((e) => e.id === selected) ?? list[0];
  return (
    <Screen>
      <Intro eyebrow={t("First impressions count")} title={t("Welcome them in.")} description={t("Scan a ticket or find a guest by name.")} />
      {events.status === "error" && <Notice error>{events.error?.message ?? t("Could not load your events.")}</Notice>}
      {!events.data ? (
        <Loading />
      ) : event ? (
        <>
          {list.length > 1 && (
            <Select
              label={t("Event")}
              value={event.id}
              onChange={setSelected}
              options={list.map((e) => ({ value: e.id, label: `${e.title} · ${eventDate(e.start_at, e.timezone)} ${eventTime(e.start_at, e.timezone)}` }))}
            />
          )}
          {list.length === 1 && <H2>{event.title}</H2>}
          <Desk key={event.id} event={event} />
        </>
      ) : (
        <Empty
          icon="people-outline"
          title={t("No door assignment yet.")}
          description={t("Events you can check guests in for appear here from the day they are published until they end. Ask the organizer to add your account's email to the team.")}
          action={t("Browse events")}
          onAction={() => router.replace("/")}
        />
      )}
    </Screen>
  );
}

function Desk({ event }: { event: MyEvent }) {
  const t = useT();
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [search, setSearch] = useState("");
  const [undoing, setUndoing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [camera, setCamera] = useState(false);
  const bump = () => setVersion((v) => v + 1);

  const stats = useLoad(`checkin-stats:${event.id}:${version}`, (signal) => api.request<CheckInStats>(`/events/${event.id}/check-in/stats`, { signal }));
  const attendees = useLoad(`checkin-attendees:${event.id}:${version}`, (signal) => api.request<Attendee[]>(`/events/${event.id}/attendees`, { signal }));
  const history = useLoad(`checkin-history:${event.id}:${version}`, (signal) =>
    api.request<CheckInRecord[]>(`/events/${event.id}/check-in/history`, { signal, query: { limit: 20 } }),
  );

  // Other doors check guests in too: refresh the numbers every 15 seconds
  useEffect(() => {
    const timer = setInterval(bump, 15000);
    return () => clearInterval(timer);
  }, []);

  async function scan(payload: string) {
    const value = payload.trim();
    if (!value) return;
    setError("");
    try {
      setResult(await api.request<CheckInResult>(`/events/${event.id}/check-in/scan`, { body: { qr_payload: value } }));
      setCode("");
      bump();
    } catch (e) {
      setError(failure(e));
    }
  }

  async function admit(ticketId: string) {
    setError("");
    try {
      setResult(await api.request<CheckInResult>(`/events/${event.id}/check-in/tickets/${ticketId}`, { method: "POST" }));
      bump();
    } catch (e) {
      setError(failure(e));
    }
  }

  async function undo(ticketId: string) {
    setError("");
    try {
      setResult(await api.request<CheckInResult>(`/events/${event.id}/check-in/tickets/${ticketId}/undo`, { body: { reason: reason.trim() } }));
      setUndoing(null);
      setReason("");
      bump();
    } catch (e) {
      setError(failure(e));
    }
  }

  const q = search.trim().toLowerCase();
  const matches = q
    ? (attendees.data ?? []).filter((a) => `${a.attendee_name} ${a.attendee_email} ${a.ticket_id} ${a.seat ?? ""}`.toLowerCase().includes(q)).slice(0, 30)
    : [];
  const s = stats.data;

  return (
    <View style={{ gap: 12 }}>
      {s && (
        <Card>
          <T style={{ fontSize: 28, fontWeight: "700" }}>
            {s.checked_in} / {s.registered}
          </T>
          <T muted>{t.plural(s.remaining, "checked in · {n} still to arrive", "checked in · {n} still to arrive")}</T>
          <Progress value={s.checked_in_percent} />
        </Card>
      )}
      <Row>
        <Button icon={camera ? "close" : "camera-outline"} label={camera ? t("Stop camera") : t("Scan with camera")} onPress={() => setCamera((c) => !c)} />
      </Row>
      {camera && <Scanner onCode={(value) => void scan(value)} />}
      <Field label={t("Or type / paste a ticket code")} value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} returnKeyType="go" onSubmitEditing={() => scan(code)} placeholder={t("The code from the ticket")} />
      <Button kind="secondary" label={t("Check ticket")} disabled={!code.trim()} onPress={() => scan(code)} />
      {result && (
        <View style={{ borderWidth: 1, borderColor: TONE[result.result] ?? color.bad, borderRadius: 14, padding: 14, gap: 4, backgroundColor: color.ink800 }}>
          <T bold style={{ color: TONE[result.result] ?? color.bad, fontSize: 18 }}>
            {result.admitted ? t("Welcome in") : result.message}
          </T>
          {result.ticket && (
            <T>
              {result.ticket.attendee_name} · {result.ticket.ticket_type_name}
              {result.ticket.seat ? ` · ${result.ticket.seat}` : ""}
            </T>
          )}
          {result.admitted && <T muted>{result.message}</T>}
        </View>
      )}
      {error ? <Notice error>{error}</Notice> : null}

      <H2>{t("Find a guest")}</H2>
      <Field label={t("Search guests")} value={search} onChangeText={setSearch} placeholder={t("Name, email, seat or ticket reference")} autoCapitalize="none" />
      {q && matches.length === 0 && <T muted>{t("No guest matches “{search}”.", { search: search })}</T>}
      {matches.map((a) => (
        <Card key={a.ticket_id}>
          <Row wrap={false}>
            <Avatar name={a.attendee_name} />
            <View style={{ flex: 1 }}>
              <T bold>{a.attendee_name}</T>
              <T small muted>
                {a.ticket_type_name}
                {a.seat ? ` · ${a.seat}` : ""} · {a.ticket_id.slice(0, 8).toUpperCase()}
              </T>
            </View>
          </Row>
          {a.status === "valid" && <Button small icon="ticket-outline" label={t("Check in")} onPress={() => admit(a.ticket_id)} style={{ alignSelf: "flex-start" }} />}
          {a.status === "checked_in" &&
            (undoing === a.ticket_id ? (
              <>
                <Field label={t("Why undo?")} value={reason} onChangeText={setReason} maxLength={500} />
                <Row>
                  <Button small kind="danger" label={t("Undo check-in")} disabled={reason.trim().length < 3} onPress={() => undo(a.ticket_id)} />
                  <Button small kind="text" label={t("Keep")} onPress={() => setUndoing(null)} />
                </Row>
              </>
            ) : (
              <Row>
                <Badge tone="live" label={a.checked_in_at ? t("Checked in {time}", { time: eventTime(a.checked_in_at, event.timezone) }) : t("Checked in")} />
                <Button small kind="text" label={t("Undo")} onPress={() => setUndoing(a.ticket_id)} />
              </Row>
            ))}
          {(a.status === "cancelled" || a.status === "refunded") && <Badge tone="bad" label={a.status === "cancelled" ? t("Cancelled — do not admit") : t("Refunded — do not admit")} />}
        </Card>
      ))}

      <Row style={{ justifyContent: "space-between" }}>
        <H2>{t("Recent at this door")}</H2>
        {canManageRole(event.my_role) && <Button small kind="text" label={t("Full guest list")} onPress={() => router.push({ pathname: "/organizer/[id]", params: { id: event.id, tab: "Attendees" } })} />}
      </Row>
      {history.data?.length ? (
        history.data.map((h) => (
          <View key={h.id} style={{ borderLeftWidth: 2, borderLeftColor: h.action === "undo" ? color.gold : color.ember, paddingLeft: 10 }}>
            <T small muted>{eventTime(h.created_at, event.timezone)}</T>
            <T>
              <T bold>{h.attendee_name}</T>{" "}
              {h.action === "undo"
                ? h.reason
                  ? t("check-in undone ({reason})", { reason: h.reason })
                  : t("check-in undone")
                : h.method === "scan"
                  ? t("checked in (scanned)")
                  : t("checked in (from the list)")}
              {h.performed_by_name ? ` · ${h.performed_by_name}` : ""}
            </T>
          </View>
        ))
      ) : (
        <T muted>{t("Nobody checked in yet.")}</T>
      )}
    </View>
  );
}

/** The camera, reading QR codes. The same code is read once per 3 seconds. */
function Scanner({ onCode }: { onCode: (code: string) => void }) {
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const last = useRef({ code: "", at: 0 });
  if (!permission) return <Loading label={t("Starting the camera…")} />;
  if (!permission.granted)
    return (
      <Card>
        <T>{permission.canAskAgain ? t("BiletFlow needs the camera to scan tickets.") : t("Camera access is off. Turn it on for BiletFlow in your phone's settings, or type the code instead.")}</T>
        {permission.canAskAgain && <Button label={t("Allow camera")} onPress={requestPermission} />}
      </Card>
    );
  return (
    <View style={{ height: 320, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: color.line }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => {
          const now = Date.now();
          if (!data || (data === last.current.code && now - last.current.at < 3000) || now - last.current.at < 1200) return;
          last.current = { code: data, at: now };
          onCode(data);
        }}
      />
      {Platform.OS === "web" && (
        <T small muted style={{ position: "absolute", bottom: 8, left: 8 }}>{t("Scanning in the browser depends on its camera support.")}</T>
      )}
    </View>
  );
}
