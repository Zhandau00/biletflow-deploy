/** The work tab: administration, the organizer dashboard, the check-in desk, or becoming an organizer. */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ADMIN_VIEWS } from "@/components/admin";
import { signInFirst } from "@/components/links";
import { BecomeOrganizer, EventsOverview } from "@/components/organizer/pages";
import { useSession } from "@/components/session";
import { Button, Card, Empty, Eyebrow, H2, Icon, Loading, Row, Screen, T } from "@/components/ui";
import { color } from "@/components/theme";

export default function Work() {
  const { ready, user, isAdmin, isOrganizer, canCheckIn } = useSession();
  const [version, setVersion] = useState(0);
  if (!ready)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!user)
    return (
      <Screen>
        <Empty icon="grid-outline" title="Your box office starts here." description="Sign in to create events, sell tickets, manage your guest list or work the door." action="Sign in" onAction={() => signInFirst("/work")} />
      </Screen>
    );
  return (
    <Screen onRefresh={() => setVersion((v) => v + 1)}>
      {isAdmin && (
        <View style={{ gap: 10 }}>
          <Eyebrow>BiletFlow / platform operations</Eyebrow>
          <H2>A clear view of the whole house.</H2>
          <T muted small>Every action here is recorded in the activity history.</T>
          {ADMIN_VIEWS.map(([view, label, icon]) => (
            <Card key={view} onPress={() => router.push(view === "overview" ? "/admin" : `/admin/${view}`)}>
              <Row wrap={false}>
                <Icon name={icon} tint={color.ember} />
                <T bold style={{ flex: 1 }}>{label}</T>
                <Icon name="chevron-forward" tint={color.muted} />
              </Row>
            </Card>
          ))}
          <Button kind="secondary" icon="chatbubbles-outline" label="Support inbox" onPress={() => router.push("/support")} />
        </View>
      )}
      {isOrganizer ? (
        <EventsOverview version={version} />
      ) : canCheckIn ? (
        <Empty icon="qr-code-outline" title="You're on the door team." description="Scan tickets and welcome guests at the events you were added to." action="Open the check-in desk" onAction={() => router.push("/check-in")} />
      ) : (
        !isAdmin && <BecomeOrganizer />
      )}
      {isAdmin && !isOrganizer && <Button kind="text" label="Open your own box office" onPress={() => router.push("/organizer")} />}
    </Screen>
  );
}
