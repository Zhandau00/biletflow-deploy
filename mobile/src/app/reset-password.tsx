/** Choose a new password with the code from the reset email. */
import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { tokenFrom } from "@/components/auth";
import { failure } from "@/components/use-load";
import { Button, Field, Intro, Notice, Screen } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function ResetPassword() {
  const t = useT();
  const params = useLocalSearchParams<{ token?: string }>();
  const [link, setLink] = useState(params.token ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit() {
    setError("");
    if (password.length < 8) return setError(t("Use at least 8 characters."));
    if (password !== confirm) return setError(t("Your passwords do not match."));
    setBusy(true);
    try {
      await api.auth.confirmPasswordReset(tokenFrom(link), password);
      setDone(true);
      setTimeout(() => router.replace("/sign-in"), 2000);
    } catch (e) {
      setError(failure(e, t("Could not reset your password. Please try again.")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Intro eyebrow={t("Almost there")} title={t("Choose a new password.")} />
      {done ? (
        <Notice>{t("Your password was changed. Taking you to sign in…")}</Notice>
      ) : (
        <>
          {!params.token && (
            <Field label={t("Link from the email")} value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} placeholder={t("Paste the whole link or its code")} hint={t("Long-press the link in the email, copy it and paste it here.")} />
          )}
          <Field label={t("New password")} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" maxLength={128} hint={t("Use 8–128 characters. You will be signed out on other devices.")} />
          <Field label={t("Confirm new password")} value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" maxLength={128} />
          {error ? <Notice error>{error}</Notice> : null}
          <Button label={busy ? t("Saving…") : t("Save new password")} busy={busy} disabled={!link.trim() || !password} onPress={submit} />
        </>
      )}
    </Screen>
  );
}
