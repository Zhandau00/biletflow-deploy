/** Create an account, then sign straight in. */
import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { getLocales } from "expo-localization";
import { api, type Language } from "@/lib/api";
import { goOn, LANGUAGES } from "@/components/auth";
import { signIn } from "@/components/session";
import { failure } from "@/components/use-load";
import { Button, Field, Intro, Notice, Row, Screen, Select, T } from "@/components/ui";

function deviceLanguage(): Language {
  try {
    const code = getLocales()[0]?.languageCode?.toLowerCase();
    return code === "kk" || code === "ru" ? code : "en";
  } catch {
    return "en";
  }
}

export default function Register() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [language, setLanguage] = useState<Language>(deviceLanguage);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setError("");
    const fullName = name.trim();
    if (fullName.length < 2 || !/^\p{L}+$/u.test(fullName.replace(/[ '-]/g, "")))
      return setError("Use at least two characters for your name, with letters, spaces, hyphens or apostrophes only.");
    if (password.length < 8) return setError("Use at least 8 characters for your password.");
    if (password !== confirm) return setError("Your passwords do not match.");
    setBusy(true);
    try {
      const address = email.trim().toLowerCase();
      await api.users.register({ full_name: fullName, email: address, password, preferred_language: language });
      await signIn(address, password);
      goOn(next);
    } catch (e) {
      setError(failure(e, "Could not create your account. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Intro eyebrow="Make yourself at home" title="Start your next chapter." description="A place for your tickets. Or a stage for your ideas." />
      <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="First and last name" maxLength={100} editable={!busy} />
      <Field label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" maxLength={255} editable={!busy} />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" maxLength={128} hint="Use 8–128 characters." editable={!busy} />
      <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" maxLength={128} editable={!busy} />
      <Select label="Language for emails and notifications" value={language} onChange={setLanguage} options={LANGUAGES} disabled={busy} />
      {error ? <Notice error>{error}</Notice> : null}
      <Button label={busy ? "Creating account…" : "Create account"} icon="arrow-forward" busy={busy} disabled={!name || !email || !password} onPress={submit} />
      <T small muted>We will email you a link to confirm your address. You can book free events right away.</T>
      <Row style={{ justifyContent: "center" }}>
        <T muted>Already have an account?</T>
        <Button kind="text" label="Sign in" onPress={() => router.replace({ pathname: "/sign-in", params: next ? { next } : {} })} />
      </Row>
    </Screen>
  );
}
