/** Support inbox: my requests and the cases my team (or the platform) answers. */
import { useState } from "react";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { CATEGORY_LABELS, STATUS_OPTIONS, caseRef, type CaseSummary } from "@/lib/support";
import { openSupport, signInFirst } from "@/components/links";
import { useSession } from "@/components/session";
import { useLoad } from "@/components/use-load";
import { caseTone, stamp } from "@/components/format";
import { Badge, Button, Card, Chips, Empty, Field, H2, Intro, LoadError, Loading, Row, Screen, Select, T } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function SupportInbox() {
  const t = useT();
  const { user, ready, organizer, isAdmin } = useSession();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [scope, setScope] = useState("all");
  const cases = useLoad(`support-cases:${user?.id ?? ""}:${scope}:${status}`, (signal) =>
    user ? api.request<CaseSummary[]>("/support/cases", { signal, query: { scope, status: status || undefined } }) : Promise.resolve([] as CaseSummary[]),
  );
  if (!ready)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!user)
    return (
      <Screen>
        <Empty icon="chatbubbles-outline" title={t("Keep the conversation together.")} description={t("Sign in to open a support request or follow the ones you have.")} action={t("Sign in")} onAction={() => signInFirst("/support")} />
      </Screen>
    );
  const query = search.trim().toLowerCase();
  const list = (cases.data ?? []).filter((c) =>
    `${caseRef(c.id)} ${c.subject} ${CATEGORY_LABELS[c.category] ?? c.category} ${c.requester_name} ${c.event_title ?? ""}`.toLowerCase().includes(query),
  );
  return (
    <Screen onRefresh={cases.reload} refreshing={cases.refreshing}>
      <Intro
        eyebrow={t("BiletFlow support")}
        title={t("A little help, a better night.")}
        description={
          isAdmin
            ? t("Organizer requests to the platform and escalated attendee cases. Attendee questions go to each event's team first.")
            : t("Your requests and the cases your team answers. You get a notification when someone replies.")
        }
      />
      {!isAdmin && (
        <Button label={t("New support request")} icon="add" onPress={() => openSupport(organizer ? { to: "platform" } : {})} />
      )}
      <Field label={t("Search cases")} value={search} onChangeText={setSearch} placeholder={t("Subject, reference, event or requester")} />
      <Chips
        value={scope}
        onChange={setScope}
        options={[
          { value: "all", label: t("Everything I can see") },
          { value: "requested", label: t("Requests I opened") },
          { value: "handling", label: t("Cases I answer") },
        ]}
      />
      <Select label={t("Status")} value={status} onChange={setStatus} options={[{ value: "", label: t("All statuses") }, ...STATUS_OPTIONS]} />
      {cases.status === "error" && <LoadError message={cases.error.message} retry={cases.reload} />}
      {!cases.data ? (
        cases.status !== "error" && <Loading />
      ) : list.length ? (
        <>
          <T muted small>
            {t.plural(list.length, "{n} case", "{n} cases")}
          </T>
          {list.map((c) => (
            <Card key={c.id} onPress={() => router.push(`/support/${c.id}`)}>
              <Row style={{ justifyContent: "space-between" }}>
                <T small muted>
                  {caseRef(c.id)} · {CATEGORY_LABELS[c.category] ?? c.category}
                </T>
                <Badge tone={caseTone(c.status)} label={t(c.status_label)} />
              </Row>
              <H2>{c.subject}</H2>
              <T small muted>
                {c.requester_user_id === user.id ? t("You") : c.requester_name} · {c.audience === "organizer" ? t("Platform support") : (c.event_title ?? t("Event support"))}
                {c.assignee_name ? t(" · Assigned to {assignee_name}", { assignee_name: c.assignee_name }) : t(" · Unassigned")}
              </T>
              <Row style={{ justifyContent: "space-between" }}>
                <T small muted>
                  {stamp(c.updated_at)}
                </T>
                <Row>
                  {c.is_escalated && <Badge tone="warn" label={t("Escalated")} />}
                  <T small>
                    {t.plural(c.message_count, "{n} message", "{n} messages")}
                  </T>
                </Row>
              </Row>
            </Card>
          ))}
        </>
      ) : (
        <Empty
          icon="mail-outline"
          title={cases.data.length ? t("No matching cases.") : t("Your inbox is clear.")}
          description={cases.data.length ? t("Try a different status or search.") : t("Open a request from an event, order or ticket when you need a hand.")}
        />
      )}
    </Screen>
  );
}
