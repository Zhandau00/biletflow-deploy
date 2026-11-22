/** Create an account, then sign straight in. */
import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { goOn } from "@/components/auth";
import { LanguageSwitch } from "@/components/language";
import { signIn } from "@/components/session";
import { failure } from "@/components/use-load";
import { Button, Field, Intro, Notice, Row, Screen, T } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function Register() {
  const t = useT();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setError("");
    const fullName = name.trim();
    if (fullName.length < 2 || !/^\p{L}+$/u.test(fullName.replace(/[ '-]/g, "")))
      return setError(t("Use at least two characters for your name, with letters, spaces, hyphens or apostrophes only."));
    if (password.length < 8) return setError(t("Use at least 8 characters for your password."));
    if (password !== confirm) return setError(t("Your passwords do not match."));
    setBusy(true);
    try {
      const address = email.trim().toLowerCase();
      await api.users.register({ full_name: fullName, email: address, password, preferred_language: t.lang });
      await signIn(address, password);
      goOn(next);
    } catch (e) {
      setError(failure(e, t("Could not create your account. Please try again.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Intro eyebrow={t("Make yourself at home")} title={t("Start your next chapter.")} description={t("A place for your tickets. Or a stage for your ideas.")} />
      <Field label={t("Your name")} value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder={t("First and last name")} maxLength={100} editable={!busy} />
      <Field label={t("Email address")} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder={t("you@example.com")} maxLength={255} editable={!busy} />
      <Field label={t("Password")} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" maxLength={128} hint={t("Use 8–128 characters.")} editable={!busy} />
      <Field label={t("Confirm password")} value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" maxLength={128} editable={!busy} />
      <LanguageSwitch />
      {error ? <Notice error>{error}</Notice> : null}
      <Button label={busy ? t("Creating account…") : t("Create account")} icon="arrow-forward" busy={busy} disabled={!name || !email || !password} onPress={submit} />
      <T small muted>{t("We will email you a link to confirm your address. You can book free events right away.")}</T>
      <Row style={{ justifyContent: "center" }}>
        <T muted>{t("Already have an account?")}</T>
        <Button kind="text" label={t("Sign in")} onPress={() => router.replace({ pathname: "/sign-in", params: next ? { next } : {} })} />
      </Row>
    </Screen>
  );
}
