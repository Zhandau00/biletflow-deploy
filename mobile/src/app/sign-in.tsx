/** Sign in with email and password. */
import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { goOn } from "@/components/auth";
import { signIn } from "@/components/session";
import { failure } from "@/components/use-load";
import { Button, Field, Intro, Notice, Row, Screen, T } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function SignIn() {
  const t = useT();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      setPassword("");
      goOn(next);
    } catch (e) {
      setError(failure(e, t("Could not sign you in. Please try again.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Intro eyebrow={t("Good to see you")} title={t("Welcome back.")} description={t("Your tickets, your plans, all right here.")} />
      <Field label={t("Email address")} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder={t("you@example.com")} maxLength={255} editable={!busy} />
      <Field label={t("Password")} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" maxLength={128} editable={!busy} onSubmitEditing={submit} returnKeyType="go" />
      <Button kind="text" small label={t("Forgot your password?")} onPress={() => router.push("/forgot-password")} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }} />
      {error ? <Notice error>{error}</Notice> : null}
      <Button label={busy ? t("Signing in…") : t("Sign in")} icon="arrow-forward" busy={busy} disabled={!email.trim() || !password} onPress={submit} />
      <Row style={{ justifyContent: "center" }}>
        <T muted>{t("New around here?")}</T>
        <Button kind="text" label={t("Create an account")} onPress={() => router.replace({ pathname: "/register", params: next ? { next } : {} })} />
      </Row>
    </Screen>
  );
}
