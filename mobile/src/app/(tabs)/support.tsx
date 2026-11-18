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

export default function SupportInbox() {
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
        <Empty icon="chatbubbles-outline" title="Keep the conversation together." description="Sign in to open a support request or follow the ones you have." action="Sign in" onAction={() => signInFirst("/support")} />
      </Screen>
    );
  const query = search.trim().toLowerCase();
  const list = (cases.data ?? []).filter((c) =>
    `${caseRef(c.id)} ${c.subject} ${CATEGORY_LABELS[c.category] ?? c.category} ${c.requester_name} ${c.event_title ?? ""}`.toLowerCase().includes(query),
  );
  return (
    <Screen onRefresh={cases.reload} refreshing={cases.refreshing}>
      <Intro
        eyebrow="BiletFlow support"
        title="A little help, a better night."
        description={
          isAdmin
            ? "Organizer requests to the platform and escalated attendee cases. Attendee questions go to each event's team first."
            : "Your requests and the cases your team answers. You get a notification when someone replies."
        }
      />
      {!isAdmin && (
        <Button label="New support request" icon="add" onPress={() => openSupport(organizer ? { to: "platform" } : {})} />
      )}
      <Field label="Search cases" value={search} onChangeText={setSearch} placeholder="Subject, reference, event or requester" />
      <Chips
        value={scope}
        onChange={setScope}
        options={[
          { value: "all", label: "Everything I can see" },
          { value: "requested", label: "Requests I opened" },
          { value: "handling", label: "Cases I answer" },
        ]}
      />
      <Select label="Status" value={status} onChange={setStatus} options={[{ value: "", label: "All statuses" }, ...STATUS_OPTIONS]} />
      {cases.status === "error" && <LoadError message={cases.error.message} retry={cases.reload} />}
      {!cases.data ? (
        cases.status !== "error" && <Loading />
      ) : list.length ? (
        <>
          <T muted small>
            {list.length} {list.length === 1 ? "case" : "cases"}
          </T>
          {list.map((c) => (
            <Card key={c.id} onPress={() => router.push(`/support/${c.id}`)}>
              <Row style={{ justifyContent: "space-between" }}>
                <T small muted>
                  {caseRef(c.id)} · {CATEGORY_LABELS[c.category] ?? c.category}
                </T>
                <Badge tone={caseTone(c.status)} label={c.status_label} />
              </Row>
              <H2>{c.subject}</H2>
              <T small muted>
                {c.requester_user_id === user.id ? "You" : c.requester_name} · {c.audience === "organizer" ? "Platform support" : (c.event_title ?? "Event support")}
                {c.assignee_name ? ` · Assigned to ${c.assignee_name}` : " · Unassigned"}
              </T>
              <Row style={{ justifyContent: "space-between" }}>
                <T small muted>
                  {stamp(c.updated_at)}
                </T>
                <Row>
                  {c.is_escalated && <Badge tone="warn" label="Escalated" />}
                  <T small>
                    {c.message_count} {c.message_count === 1 ? "message" : "messages"}
                  </T>
                </Row>
              </Row>
            </Card>
          ))}
        </>
      ) : (
        <Empty
          icon="mail-outline"
          title={cases.data.length ? "No matching cases." : "Your inbox is clear."}
          description={cases.data.length ? "Try a different status or search." : "Open a request from an event, order or ticket when you need a hand."}
        />
      )}
    </Screen>
  );
}
