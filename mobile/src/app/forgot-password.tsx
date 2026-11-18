/** Ask for a password-reset email. */
import { useState } from "react";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { failure } from "@/components/use-load";
import { Button, Field, Intro, Notice, Screen } from "@/components/ui";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setError("");
    setBusy(true);
    try {
      const result = await api.auth.requestPasswordReset(email.trim().toLowerCase());
      setSent(result?.detail ?? "If an account exists for this email, a reset link is on its way.");
    } catch (e) {
      setError(failure(e, "Could not send the reset link. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Intro eyebrow="Locked out?" title="Reset your password." description="Enter your email and we will send you a link to choose a new password." />
      {sent ? (
        <>
          <Notice>{sent}</Notice>
          <Button label="I have the link" icon="arrow-forward" onPress={() => router.push("/reset-password")} />
        </>
      ) : (
        <>
          <Field label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" maxLength={255} />
          {error ? <Notice error>{error}</Notice> : null}
          <Button label={busy ? "Sending…" : "Send reset link"} busy={busy} disabled={!email.trim()} onPress={submit} />
        </>
      )}
    </Screen>
  );
}
