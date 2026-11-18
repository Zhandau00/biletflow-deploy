/** Organizer profile: public details, identity check and payout account. */
import { signInFirst } from "@/components/links";
import { BecomeOrganizer, OrganizerProfileView } from "@/components/organizer/pages";
import { useSession } from "@/components/session";
import { Empty, Loading, Screen } from "@/components/ui";

export default function OrganizerProfile() {
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
        <Empty icon="person-outline" title="Sign in to edit your organizer profile." action="Sign in" onAction={() => signInFirst("/organizer/profile")} />
      </Screen>
    );
  return <Screen>{organizer ? <OrganizerProfileView /> : <BecomeOrganizer />}</Screen>;
}
