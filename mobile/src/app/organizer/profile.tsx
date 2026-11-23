/** Organizer profile: public details, identity check and payout account. */
import { signInFirst } from "@/components/links";
import { BecomeOrganizer, OrganizerProfileView } from "@/components/organizer/pages";
import { useSession } from "@/components/session";
import { Empty, Loading, Screen } from "@/components/ui";

import { useT } from "@/lib/i18n";
export default function OrganizerProfile() {
  const t = useT();
  const { ready, user, organizer } = useSession();
  if (!ready)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!user)
    return (
      <Screen>
        <Empty icon="person-outline" title={t("Sign in to edit your organizer profile.")} action={t("Sign in")} onAction={() => signInFirst("/organizer/profile")} />
      </Screen>
    );
  return <Screen>{organizer ? <OrganizerProfileView /> : <BecomeOrganizer />}</Screen>;
}
