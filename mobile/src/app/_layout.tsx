import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DarkTheme, ThemeProvider } from "expo-router";
import { color } from "@/components/theme";

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: color.ink, card: color.ink, text: color.cream, border: color.line, primary: color.ember },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: color.ink },
            headerTintColor: color.cream,
            headerTitleStyle: { color: color.cream },
            headerBackTitle: "Back",
            contentStyle: { backgroundColor: color.ink },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "BiletFlow" }} />
          <Stack.Screen name="event/[id]" options={{ title: "Event" }} />
          <Stack.Screen name="checkout/[id]" options={{ title: "Checkout" }} />
          <Stack.Screen name="order/[id]" options={{ title: "Order" }} />
          <Stack.Screen name="sign-in" options={{ title: "Sign in", presentation: "modal" }} />
          <Stack.Screen name="register" options={{ title: "Create an account", presentation: "modal" }} />
          <Stack.Screen name="forgot-password" options={{ title: "Reset your password" }} />
          <Stack.Screen name="reset-password" options={{ title: "New password" }} />
          <Stack.Screen name="verify-email" options={{ title: "Confirm your email" }} />
          <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
          <Stack.Screen name="support/new" options={{ title: "New support request" }} />
          <Stack.Screen name="support/[id]" options={{ title: "Support case" }} />
          <Stack.Screen name="organizer/index" options={{ title: "Your events" }} />
          <Stack.Screen name="organizer/new" options={{ title: "Create event" }} />
          <Stack.Screen name="organizer/profile" options={{ title: "Organizer profile" }} />
          <Stack.Screen name="organizer/[id]" options={{ title: "Manage event" }} />
          <Stack.Screen name="check-in" options={{ title: "Check-in desk" }} />
          <Stack.Screen name="admin/index" options={{ title: "Administration" }} />
          <Stack.Screen name="admin/[view]" options={{ title: "Administration" }} />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
