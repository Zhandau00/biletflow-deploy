/** Account: details, language, email confirmation, password and sign-out. */
import { useState } from "react";
import { router } from "expo-router";
import { api, client, type Language } from "@/lib/api";
import { LANGUAGES } from "@/components/auth";
import { refreshSession, signOut, useSession } from "@/components/session";
import { failure } from "@/components/use-load";
import { Button, Card, Empty, Facts, Field, H2, Intro, Loading, Notice, Screen, Select } from "@/components/ui";
import { API_URL } from "@/lib/config";

export default function Account() {
  const { user, organizer, ready, isAdmin, isOrganizer, canCheckIn } = useSession();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [name, setName] = useState(user?.full_name ?? "");
  const [language, setLanguage] = useState<Language>(user?.preferred_language ?? "en");
  const [shown, setShown] = useState(user);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  // Show the saved values again when the account changes
  if (user !== shown) {
    setShown(user);
    if (user) {
      setName(user.full_name);
      setLanguage(user.preferred_language);
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
        <Intro eyebrow="A ticket. A plan. A good night." title="Be there for the good part." description="Sign in to book tickets, keep them on your phone and run your own events." />
        <Button label="Sign in" icon="arrow-forward" onPress={() => router.push("/sign-in")} />
        <Button kind="secondary" label="Create an account" onPress={() => router.push("/register")} />
        <Empty icon="sparkles-outline" title="Made for the nights worth remembering." description="Almaty, Astana & beyond." />
      </Screen>
    );

  async function run(kind: string, action: () => Promise<string | void>) {
    setNotice("");
    setError("");
    setBusy(kind);
    try {
      const text = await action();
      if (text) setNotice(text);
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <Screen onRefresh={() => void refreshSession()}>
      <Intro eyebrow="Your account" title="Account profile." description="Your details, language and sign-in settings." />
      {notice ? <Notice onDismiss={() => setNotice("")}>{notice}</Notice> : null}
      {error ? <Notice error onDismiss={() => setError("")}>{error}</Notice> : null}
      {!user.is_email_verified && (
        <Card>
          <Notice>Please confirm your email address. Paid tickets and organizer tools need a confirmed email.</Notice>
          <Button
            kind="secondary"
            label="Send the link again"
            busy={busy === "verify"}
            onPress={() =>
              run("verify", async () => {
                const result = await api.auth.requestVerification();
                return result?.detail ?? "A new confirmation link is on its way.";
              })
            }
          />
          <Button kind="text" label="I have the link" onPress={() => router.push("/verify-email")} />
        </Card>
      )}
      <Facts
        rows={[
          ["Email address", `${user.email} · ${user.is_email_verified ? "confirmed" : "not confirmed"}`],
          ["Account type", isAdmin ? "Platform administrator" : organizer ? `Organizer · ${organizer.display_name}` : "Attendee"],
          ["Member since", new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "Asia/Almaty" }).format(new Date(user.created_at))],
        ]}
      />

      <Card>
        <H2>Shortcuts</H2>
        <Button kind="secondary" icon="notifications-outline" label="Notifications" onPress={() => router.push("/notifications")} />
        <Button kind="secondary" icon="chatbubbles-outline" label="Support cases" onPress={() => router.push("/support")} />
        {isAdmin && <Button kind="secondary" icon="shield-checkmark-outline" label="Platform administration" onPress={() => router.push("/admin")} />}
        {isOrganizer && <Button kind="secondary" icon="grid-outline" label="Organizer workspace" onPress={() => router.push("/organizer")} />}
        {canCheckIn && <Button kind="secondary" icon="qr-code-outline" label="Check-in desk" onPress={() => router.push("/check-in")} />}
        {!organizer && !isAdmin && <Button kind="secondary" icon="add-circle-outline" label="Become an organizer" onPress={() => router.push("/work")} />}
      </Card>

      <Card>
        <H2>Details</H2>
        <Field label="Full name" value={name} onChangeText={setName} maxLength={100} autoComplete="name" />
        <Select label="Language for emails and notifications" value={language} onChange={setLanguage} options={LANGUAGES} />
        <Button
          label="Save details"
          busy={busy === "details"}
          disabled={name.trim().length < 2}
          onPress={() =>
            run("details", async () => {
              await api.users.updateMe({ full_name: name.trim(), preferred_language: language });
              await refreshSession();
              return "Your details were saved.";
            })
          }
        />
      </Card>

      <Card>
        <H2>Password</H2>
        <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" maxLength={128} />
        <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" maxLength={128} hint="Use 8–128 characters." />
        <Field label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" maxLength={128} />
        <Button
          label="Change password"
          busy={busy === "password"}
          disabled={!current || next.length < 8}
          onPress={() =>
            run("password", async () => {
              if (next !== confirm) throw new Error("Your new passwords do not match.");
              await client.changePassword(current, next);
              setCurrent("");
              setNext("");
              setConfirm("");
              return "Your password was changed. Other devices have been signed out.";
            })
          }
        />
      </Card>

      <Button kind="secondary" icon="log-out-outline" label="Sign out" onPress={() => run("out", () => signOut())} />
      <Button
        kind="danger"
        label="Sign out on all devices"
        busy={busy === "everywhere"}
        onPress={() =>
          run("everywhere", async () => {
            await client.signOutEverywhere();
            await signOut();
          })
        }
      />
      <Notice>{`Connected to ${API_URL.replace(/^https?:\/\//, "").replace(/\/api\/v1$/, "")}`}</Notice>
    </Screen>
  );
}
