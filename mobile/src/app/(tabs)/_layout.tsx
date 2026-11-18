import { Tabs } from "expo-router/js-tabs";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Icon, type IconName } from "@/components/ui";
import { color } from "@/components/theme";
import { useSession } from "@/components/session";
import { useUnread } from "@/components/unread";

function Bell() {
  const { user } = useSession();
  const unread = useUnread();
  if (!user) return null;
  return (
    <Pressable
      onPress={() => router.push("/notifications")}
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : "Notifications"}
      style={{ paddingHorizontal: 16 }}
    >
      <Icon name="notifications-outline" size={22} />
      {unread > 0 && (
        <View style={{ position: "absolute", right: 8, top: -4, backgroundColor: color.ember, borderRadius: 9, minWidth: 18, paddingHorizontal: 4, alignItems: "center" }}>
          <Text style={{ color: color.ink, fontSize: 11, fontWeight: "700" }}>{unread > 99 ? "99+" : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

function icon(name: IconName) {
  const TabIcon = ({ color: tint, size }: { color: unknown; size: number }) => <Icon name={name} tint={typeof tint === "string" ? tint : color.muted} size={size} />;
  return TabIcon;
}

export default function TabsLayout() {
  const { isAdmin, isOrganizer, canCheckIn } = useSession();
  const workTitle = isAdmin ? "Admin" : isOrganizer ? "Organizer" : canCheckIn ? "Check-in" : "Organize";
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: color.ink },
        headerTintColor: color.cream,
        headerShadowVisible: false,
        headerRight: () => <Bell />,
        tabBarStyle: { backgroundColor: color.ink800, borderTopColor: color.line },
        tabBarActiveTintColor: color.ember,
        tabBarInactiveTintColor: color.muted,
        sceneStyle: { backgroundColor: color.ink },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "What's on", tabBarIcon: icon("sparkles-outline") }} />
      <Tabs.Screen name="tickets" options={{ title: "My tickets", tabBarIcon: icon("ticket-outline") }} />
      <Tabs.Screen name="work" options={{ title: workTitle, tabBarIcon: icon(isAdmin ? "shield-checkmark-outline" : "grid-outline") }} />
      <Tabs.Screen name="support" options={{ title: "Support", tabBarIcon: icon("chatbubbles-outline") }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("person-circle-outline") }} />
    </Tabs>
  );
}
