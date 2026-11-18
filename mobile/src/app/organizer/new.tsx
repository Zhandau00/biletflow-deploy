/** Create an event. */
import { router } from "expo-router";
import { signInFirst } from "@/components/links";
import { EventEditor } from "@/components/organizer/editor";
import { BecomeOrganizer } from "@/components/organizer/pages";
import { useSession } from "@/components/session";
import { Button, Empty, Intro, Loading, Notice, Screen } from "@/components/ui";

export default function NewEvent() {
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
        <Empty icon="grid-outline" title="Sign in to create events." action="Sign in" onAction={() => signInFirst("/organizer/new")} />
      </Screen>
    );
  if (!organizer)
    return (
      <Screen>
        <BecomeOrganizer />
      </Screen>
    );
  return (
    <Screen>
      <Intro eyebrow="From an idea to a full room" title="Let’s put it on the calendar." description="Start with the essentials. The rest can take shape as you go." />
      {!user.is_email_verified && (
        <Notice error>
          Please confirm your email address before creating events.
        </Notice>
      )}
      {!user.is_email_verified && <Button small kind="secondary" label="Go to your account" onPress={() => router.push("/account")} />}
      <EventEditor />
    </Screen>
  );
}
