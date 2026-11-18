/** One section of the platform administration. */
import { Stack, router, useLocalSearchParams } from "expo-router";
import { ADMIN_VIEWS, AdminView } from "@/components/admin";
import { signInFirst } from "@/components/links";
import { useSession } from "@/components/session";
import { Empty, Loading, Screen } from "@/components/ui";

export default function AdminSection({ view: fixed }: { view?: string }) {
  const params = useLocalSearchParams<{ view?: string }>();
  const { ready, user, isAdmin } = useSession();
  const view = ADMIN_VIEWS.some(([key]) => key === (fixed ?? params.view)) ? (fixed ?? params.view)! : "overview";
  const title = ADMIN_VIEWS.find(([key]) => key === view)?.[1] ?? "Administration";
  if (!ready)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!user || !isAdmin)
    return (
      <Screen>
        <Empty
          icon="shield-outline"
          title="Platform administration."
          description={user ? "This area is for the BiletFlow platform team." : "Sign in with a platform administrator account."}
          action={user ? "Back to BiletFlow" : "Sign in"}
          onAction={() => (user ? router.replace("/") : signInFirst("/admin"))}
        />
      </Screen>
    );
  return (
    <Screen>
      <Stack.Screen options={{ title: view === "overview" ? "Administration" : title }} />
      <AdminView key={view} view={view} me={user.id} />
    </Screen>
  );
}
