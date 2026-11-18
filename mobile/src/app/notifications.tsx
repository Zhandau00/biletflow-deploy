/** In-app notifications: order, event and support updates. */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";
import type { AppNotification } from "@/lib/support";
import { appPath, signInFirst } from "@/components/links";
import { useSession } from "@/components/session";
import { recheckUnread } from "@/components/unread";
import { failure, useLoad } from "@/components/use-load";
import { Button, Card, Empty, Intro, LoadError, Loading, Notice, Row, Screen, T, Toggle } from "@/components/ui";
import { color } from "@/components/theme";

const stamp = (value: string) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Almaty" }).format(new Date(value));

export default function Notifications() {
  const { user, ready } = useSession();
  const [version, setVersion] = useState(0);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [error, setError] = useState("");
  const list = useLoad(`notifications:${user?.id ?? ""}:${onlyUnread}:${version}`, (signal) =>
    user
      ? api.request<AppNotification[]>("/notifications", { signal, query: { unread_only: onlyUnread || undefined, limit: 100 } })
      : Promise.resolve([] as AppNotification[]),
  );

  async function act(path: string) {
    setError("");
    try {
      await api.request(path, { method: "POST" });
      setVersion((v) => v + 1);
      void recheckUnread();
    } catch (e) {
      setError(failure(e, "Could not update notifications."));
    }
  }

  if (!ready)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!user)
    return (
      <Screen>
        <Empty icon="notifications-outline" title="Nothing to miss here." description="Sign in to see updates about your tickets, events and support cases." action="Sign in" onAction={() => signInFirst("/notifications")} />
      </Screen>
    );
  const items = list.data ?? [];
  const unread = items.filter((n) => !n.is_read).length;
  return (
    <Screen onRefresh={() => setVersion((v) => v + 1)} refreshing={list.refreshing}>
      <Intro eyebrow="Keeping you posted" title="Notifications." description="Order, event and support updates, in the language set on your profile. Most of them also come by email." />
      <Toggle label="Only unread" value={onlyUnread} onChange={setOnlyUnread} />
      {unread > 0 && <Button kind="secondary" icon="checkmark-done" label="Mark all read" onPress={() => act("/notifications/read-all")} />}
      {error ? <Notice error>{error}</Notice> : null}
      {list.status === "error" && <LoadError message={list.error.message} retry={list.reload} />}
      {!list.data ? (
        list.status !== "error" && <Loading />
      ) : items.length ? (
        items.map((n) => {
          const target = appPath(n.link);
          return (
            <Card
              key={n.id}
              style={!n.is_read ? { borderColor: color.ember } : undefined}
              onPress={() => {
                if (!n.is_read) void act(`/notifications/${n.id}/read`);
                if (target) router.push(target as never);
              }}
            >
              <T>{n.message}</T>
              <Row style={{ justifyContent: "space-between" }}>
                <T small muted>
                  {stamp(n.created_at)}
                </T>
                {!n.is_read && (
                  <View>
                    <Button small kind="text" label="Mark read" onPress={() => act(`/notifications/${n.id}/read`)} />
                  </View>
                )}
              </Row>
            </Card>
          );
        })
      ) : (
        <Empty icon="notifications-outline" title={onlyUnread ? "All caught up." : "No notifications yet."} description="Updates about your orders, events and support cases appear here." />
      )}
    </Screen>
  );
}
