/** Your events (also reached from the work tab), or the become-an-organizer form. */
import { useState } from "react";
import { signInFirst } from "@/components/links";
import { BecomeOrganizer, EventsOverview } from "@/components/organizer/pages";
import { useSession } from "@/components/session";
import { Empty, Loading, Screen } from "@/components/ui";

import { useT } from "@/lib/i18n";
export default function OrganizerHome() {
  const t = useT();
  const { ready, user, isOrganizer } = useSession();
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
        <Empty icon="grid-outline" title={t("Your box office starts here.")} action={t("Sign in")} onAction={() => signInFirst("/organizer")} />
      </Screen>
    );
  return <Screen onRefresh={() => setVersion((v) => v + 1)}>{isOrganizer ? <EventsOverview version={version} /> : <BecomeOrganizer />}</Screen>;
}
