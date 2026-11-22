import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DarkTheme, ThemeProvider } from "expo-router";
import { color } from "@/components/theme";
import { useT } from "@/lib/i18n";

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: color.ink, card: color.ink, text: color.cream, border: color.line, primary: color.ember },
};

export default function RootLayout() {
  const t = useT();
  return (
    <SafeAreaProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: color.ink },
            headerTintColor: color.cream,
            headerTitleStyle: { color: color.cream },
            headerBackTitle: t("Back"),
            contentStyle: { backgroundColor: color.ink },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t("BiletFlow") }} />
          <Stack.Screen name="event/[id]" options={{ title: t("Event") }} />
          <Stack.Screen name="checkout/[id]" options={{ title: t("Checkout") }} />
          <Stack.Screen name="order/[id]" options={{ title: t("Order") }} />
          <Stack.Screen name="sign-in" options={{ title: t("Sign in"), presentation: "modal" }} />
          <Stack.Screen name="register" options={{ title: t("Create an account"), presentation: "modal" }} />
          <Stack.Screen name="forgot-password" options={{ title: t("Reset your password") }} />
          <Stack.Screen name="reset-password" options={{ title: t("New password") }} />
          <Stack.Screen name="verify-email" options={{ title: t("Confirm your email") }} />
          <Stack.Screen name="notifications" options={{ title: t("Notifications") }} />
          <Stack.Screen name="support/new" options={{ title: t("New support request") }} />
          <Stack.Screen name="support/[id]" options={{ title: t("Support case") }} />
          <Stack.Screen name="organizer/index" options={{ title: t("Your events") }} />
          <Stack.Screen name="organizer/new" options={{ title: t("Create event") }} />
          <Stack.Screen name="organizer/profile" options={{ title: t("Organizer profile") }} />
          <Stack.Screen name="organizer/[id]" options={{ title: t("Manage event") }} />
          <Stack.Screen name="check-in" options={{ title: t("Check-in desk") }} />
          <Stack.Screen name="admin/index" options={{ title: t("Administration") }} />
          <Stack.Screen name="admin/[view]" options={{ title: t("Administration") }} />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
