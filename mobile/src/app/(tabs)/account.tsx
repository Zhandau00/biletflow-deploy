/** Account: details, language, email confirmation, password and sign-out. */
import { useState } from "react";
import { router } from "expo-router";
import { api, client } from "@/lib/api";
import { LanguageSwitch } from "@/components/language";
import { refreshSession, signOut, useSession } from "@/components/session";
import { failure } from "@/components/use-load";
import { Button, Card, Empty, Facts, Field, H2, Intro, Loading, Notice, Screen } from "@/components/ui";
import { API_URL } from "@/lib/config";
import { formatDate, useT } from "@/lib/i18n";

export default function Account() {
  const t = useT();
  const { user, organizer, ready, isAdmin, isOrganizer, canCheckIn } = useSession();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [name, setName] = useState(user?.full_name ?? "");
  const [shown, setShown] = useState(user);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  // Show the saved values again when the account changes
  if (user !== shown) {
    setShown(user);
    if (user) setName(user.full_name);
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
        <Intro eyebrow={t("A ticket. A plan. A good night.")} title={t("Be there for the good part.")} description={t("Sign in to book tickets, keep them on your phone and run your own events.")} />
        <Button label={t("Sign in")} icon="arrow-forward" onPress={() => router.push("/sign-in")} />
        <Button kind="secondary" label={t("Create an account")} onPress={() => router.push("/register")} />
        <LanguageSwitch />
        <Empty icon="sparkles-outline" title={t("Made for the nights worth remembering.")} description={t("Almaty, Astana & beyond.")} />
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
      <Intro eyebrow={t("Your account")} title={t("Account profile.")} description={t("Your details, language and sign-in settings.")} />
      {notice ? <Notice onDismiss={() => setNotice("")}>{notice}</Notice> : null}
      {error ? <Notice error onDismiss={() => setError("")}>{error}</Notice> : null}
      <LanguageSwitch />
      {!user.is_email_verified && (
        <Card>
          <Notice>{t("Please confirm your email address. Paid tickets and organizer tools need a confirmed email.")}</Notice>
          <Button
            kind="secondary"
            label={t("Send the link again")}
            busy={busy === "verify"}
            onPress={() =>
              run("verify", async () => {
                const result = await api.auth.requestVerification();
                return result?.detail ?? t("A new confirmation link is on its way.");
              })
            }
          />
          <Button kind="text" label={t("I have the link")} onPress={() => router.push("/verify-email")} />
        </Card>
      )}
      <Facts
        rows={[
          [t("Email address"), `${user.email} · ${user.is_email_verified ? "confirmed" : "not confirmed"}`],
          [t("Account type"), isAdmin ? t("Platform administrator") : organizer ? t("Organizer · {display_name}", { display_name: organizer.display_name }) : t("Attendee")],
          [t("Member since"), formatDate(t.lang, new Date(user.created_at), { dateStyle: "long", timeZone: "Asia/Almaty" })],
        ]}
      />

      <Card>
        <H2>{t("Shortcuts")}</H2>
        <Button kind="secondary" icon="notifications-outline" label={t("Notifications")} onPress={() => router.push("/notifications")} />
        <Button kind="secondary" icon="chatbubbles-outline" label={t("Support cases")} onPress={() => router.push("/support")} />
        {isAdmin && <Button kind="secondary" icon="shield-checkmark-outline" label={t("Platform administration")} onPress={() => router.push("/admin")} />}
        {isOrganizer && <Button kind="secondary" icon="grid-outline" label={t("Organizer workspace")} onPress={() => router.push("/organizer")} />}
        {canCheckIn && <Button kind="secondary" icon="qr-code-outline" label={t("Check-in desk")} onPress={() => router.push("/check-in")} />}
        {!organizer && !isAdmin && <Button kind="secondary" icon="add-circle-outline" label={t("Become an organizer")} onPress={() => router.push("/work")} />}
      </Card>

      <Card>
        <H2>{t("Details")}</H2>
        <Field label={t("Full name")} value={name} onChangeText={setName} maxLength={100} autoComplete="name" />
        <Button
          label={t("Save details")}
          busy={busy === "details"}
          disabled={name.trim().length < 2}
          onPress={() =>
            run("details", async () => {
              await api.users.updateMe({ full_name: name.trim() });
              await refreshSession();
              return t("Your details were saved.");
            })
          }
        />
      </Card>

      <Card>
        <H2>{t("Password")}</H2>
        <Field label={t("Current password")} value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" maxLength={128} />
        <Field label={t("New password")} value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" maxLength={128} hint={t("Use 8–128 characters.")} />
        <Field label={t("Confirm new password")} value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" maxLength={128} />
        <Button
          label={t("Change password")}
          busy={busy === "password"}
          disabled={!current || next.length < 8}
          onPress={() =>
            run("password", async () => {
              if (next !== confirm) throw new Error("Your new passwords do not match.");
              await client.changePassword(current, next);
              setCurrent("");
              setNext("");
              setConfirm("");
              return t("Your password was changed. Other devices have been signed out.");
            })
          }
        />
      </Card>

      <Button kind="secondary" icon="log-out-outline" label={t("Sign out")} onPress={() => run("out", () => signOut())} />
      <Button
        kind="danger"
        label={t("Sign out on all devices")}
        busy={busy === "everywhere"}
        onPress={() =>
          run("everywhere", async () => {
            await client.signOutEverywhere();
            await signOut();
          })
        }
      />
      <Notice>{t("Connected to {replace}", { replace: API_URL.replace(/^https?:\/\//, "").replace(/\/api\/v1$/, "") })}</Notice>
    </Screen>
  );
}
