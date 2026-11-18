/** Choose a new password with the code from the reset email. */
import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { tokenFrom } from "@/components/auth";
import { failure } from "@/components/use-load";
import { Button, Field, Intro, Notice, Screen } from "@/components/ui";

export default function ResetPassword() {
  const params = useLocalSearchParams<{ token?: string }>();
  const [link, setLink] = useState(params.token ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit() {
    setError("");
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Your passwords do not match.");
    setBusy(true);
    try {
      await api.auth.confirmPasswordReset(tokenFrom(link), password);
      setDone(true);
      setTimeout(() => router.replace("/sign-in"), 2000);
    } catch (e) {
      setError(failure(e, "Could not reset your password. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Intro eyebrow="Almost there" title="Choose a new password." />
      {done ? (
        <Notice>Your password was changed. Taking you to sign in…</Notice>
      ) : (
        <>
          {!params.token && (
            <Field label="Link from the email" value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} placeholder="Paste the whole link or its code" hint="Long-press the link in the email, copy it and paste it here." />
          )}
          <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" maxLength={128} hint="Use 8–128 characters. You will be signed out on other devices." />
          <Field label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" maxLength={128} />
          {error ? <Notice error>{error}</Notice> : null}
          <Button label={busy ? "Saving…" : "Save new password"} busy={busy} disabled={!link.trim() || !password} onPress={submit} />
        </>
      )}
    </Screen>
  );
}
