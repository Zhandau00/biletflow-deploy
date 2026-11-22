/** One support case: messages, reply, status and assignment, escalation. */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { CATEGORY_LABELS, STATUS_OPTIONS, caseRef, type Assignee, type CaseDetail, type CaseMessage, type CaseStatus } from "@/lib/support";
import { useSession } from "@/components/session";
import { caseTone, ref, stamp } from "@/components/format";
import { failure, useLoad } from "@/components/use-load";
import { Badge, Button, Card, Empty, Facts, Field, H2, Intro, Loading, Notice, Row, Screen, Select, T } from "@/components/ui";
import { color } from "@/components/theme";
import { useT } from "@/lib/i18n";

export default function CaseThread() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isAdmin } = useSession();
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState("");
  const [reply, setReply] = useState("");
  const [reason, setReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [status, setStatus] = useState<CaseStatus | "">("");
  const [assignee, setAssignee] = useState<string | null>(null);
  const data = useLoad(`support-case:${id}:${version}`, (signal) => api.request<CaseDetail>(`/support/cases/${id}`, { signal }));
  const sc = data.data;
  const assignees = useLoad(`support-assignees:${id}:${sc?.can_manage ?? false}`, (signal) =>
    sc?.can_manage ? api.request<Assignee[]>(`/support/cases/${id}/assignees`, { signal }) : Promise.resolve([] as Assignee[]),
  );

  // Look for new replies every 20 seconds while the case is open
  const lastAt = sc?.messages.at(-1)?.created_at;
  useEffect(() => {
    if (!lastAt) return;
    const timer = setInterval(async () => {
      try {
        const fresh = await api.request<CaseMessage[]>(`/support/cases/${id}/messages`, { query: { since: lastAt } });
        if (fresh.length) setVersion((v) => v + 1);
      } catch {
        // Try again on the next tick
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [id, lastAt]);

  async function run(kind: string, action: () => Promise<unknown>, done: string, after?: () => void) {
    setBusy(kind);
    setNotice(null);
    try {
      await action();
      after?.();
      setVersion((v) => v + 1);
      setNotice({ text: done, error: false });
    } catch (e) {
      setNotice({ text: failure(e), error: true });
    } finally {
      setBusy("");
    }
  }

  if (data.status === "error" && !sc)
    return (
      <Screen>
        <Empty icon="mail-outline" title={t("Case unavailable.")} description={t("This case does not exist or is not shared with your account.")} />
      </Screen>
    );
  if (!sc)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  const currentStatus = status || sc.status;
  const currentAssignee = assignee ?? sc.assignee_user_id ?? "";
  return (
    <Screen onRefresh={() => setVersion((v) => v + 1)} refreshing={data.refreshing}>
      <Stack.Screen options={{ title: caseRef(sc.id) }} />
      <Intro title={sc.subject} description={`${caseRef(sc.id)} · ${CATEGORY_LABELS[sc.category] ?? sc.category}`} />
      <Row>
        <Badge tone={caseTone(sc.status)} label={t(sc.status_label)} />
        {sc.is_escalated && <Badge tone="warn" label={t("Escalated to platform support")} />}
        <T small muted>
          {t("Opened {stamp}", { stamp: stamp(sc.created_at) })}
        </T>
      </Row>
      {notice && <Notice error={notice.error} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
      {sc.messages.map((m) => {
        const own = m.sender_user_id === user?.id;
        return (
          <View
            key={m.id}
            style={{
              alignSelf: own ? "flex-end" : "flex-start",
              maxWidth: "88%",
              backgroundColor: own ? color.ink700 : color.ink800,
              borderColor: m.from_staff ? color.ember : color.line,
              borderWidth: 1,
              borderRadius: 14,
              padding: 12,
              gap: 4,
            }}
          >
            <T small bold>
              {m.sender_name}
              {own ? t(" (you)") : m.from_staff ? t(" · support") : ""}
            </T>
            <T>{m.body}</T>
            <T small muted>
              {stamp(m.created_at)}
            </T>
          </View>
        );
      })}
      <Card>
        <Field label={t("Add a reply")} value={reply} onChangeText={setReply} multiline maxLength={5000} placeholder={t("Write your reply…")} hint={sc.status === "resolved" ? t("Replying reopens this case.") : t("Replies arrive by email and notification too.")} />
        <Button
          label={t("Send reply")}
          icon="send"
          busy={busy === "reply"}
          disabled={!reply.trim()}
          onPress={() =>
            run("reply", () => api.request(`/support/cases/${id}/messages`, { body: { body: reply.trim() } }), t("Reply sent. The other side gets an email and a notification."), () => setReply(""))
          }
        />
      </Card>
      <Facts
        rows={[
          [t("Requester"), sc.requester_name],
          [t("Support team"), sc.audience === "organizer" || sc.is_escalated ? t("BiletFlow platform support") : t("Event organizer team")],
          ...(sc.event_id ? ([[t("Event"), sc.event_title ?? t("Event")]] as [string, string][]) : []),
          ...(sc.order_id ? ([[t("Order"), ref(sc.order_id)]] as [string, string][]) : []),
          ...(sc.ticket_id ? ([[t("Ticket"), ref(sc.ticket_id)]] as [string, string][]) : []),
          [t("Handling"), sc.assignee_name ? t("Assigned to {assignee_name}", { assignee_name: sc.assignee_name }) : t("Waiting for a team member to pick it up.")],
        ]}
      />
      {sc.can_manage && (
        <Card>
          <H2>{t("Case handling")}</H2>
          <Select label={t("Status")} value={currentStatus} onChange={(v) => setStatus(v)} options={STATUS_OPTIONS} />
          <Select
            label={t("Assigned to")}
            value={currentAssignee}
            onChange={setAssignee}
            options={[{ value: "", label: t("Unassigned") }, ...(assignees.data ?? []).map((a) => ({ value: a.user_id, label: a.full_name }))]}
          />
          <Button
            kind="secondary"
            label={t("Save case changes")}
            busy={busy === "manage"}
            onPress={() =>
              run(
                "manage",
                () => api.request(`/support/cases/${id}`, { method: "PATCH", body: { status: currentStatus, assignee_user_id: currentAssignee || null } }),
                t("Case updated. The change is in its history."),
                () => {
                  setStatus("");
                  setAssignee(null);
                },
              )
            }
          />
        </Card>
      )}
      {sc.can_manage && !sc.is_escalated && sc.audience === "attendee" && !isAdmin && (
        <Card>
          <Field label={t("Need the platform team?")} value={reason} onChangeText={setReason} maxLength={500} placeholder={t("Why it needs them")} />
          <Button
            kind="secondary"
            label={t("Escalate to platform support")}
            busy={busy === "escalate"}
            disabled={reason.trim().length < 3}
            onPress={() => run("escalate", () => api.request(`/support/cases/${id}/escalate`, { body: { reason: reason.trim() } }), t("Passed to the BiletFlow platform team."), () => setReason(""))}
          />
        </Card>
      )}
      <Button kind="text" label={showHistory ? t("Hide case history ({length})", { length: sc.history.length }) : t("Show case history ({length})", { length: sc.history.length })} onPress={() => setShowHistory((v) => !v)} />
      {showHistory &&
        sc.history.map((h) => (
          <View key={h.id} style={{ borderLeftWidth: 2, borderLeftColor: color.line, paddingLeft: 10 }}>
            <T>{h.action}</T>
            <T small muted>
              {h.actor_name ?? t("System")} · {stamp(h.created_at)}
            </T>
          </View>
        ))}
    </Screen>
  );
}
