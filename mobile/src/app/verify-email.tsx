/** Confirm an email address with the link from the confirmation email. */
import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { tokenFrom } from "@/components/auth";
import { refreshSession, useSession } from "@/components/session";
import { failure } from "@/components/use-load";
import { Button, Field, Intro, Notice, Screen } from "@/components/ui";

export default function VerifyEmail() {
  const params = useLocalSearchParams<{ token?: string }>();
  const { user } = useSession();
  const [link, setLink] = useState("");
  const [state, setState] = useState<{ status: "idle" | "working" | "done" | "error"; text?: string }>({ status: "idle" });
  const started = useRef(false);

  async function confirm(token: string) {
    setState({ status: "working" });
    try {
      await api.auth.confirmVerification(token);
      setState({ status: "done" });
      void refreshSession();
    } catch (e) {
      setState({ status: "error", text: failure(e, "This link could not be used.") });
    }
  }

  useEffect(() => {
    if (!params.token || started.current) return;
    started.current = true;
    void confirm(params.token);
  }, [params.token]);

  return (
    <Screen>
      <Intro eyebrow="Email address" title={state.status === "done" ? "You are confirmed." : "Confirming your email."} />
      {state.status === "working" && <Notice>Checking your link…</Notice>}
      {state.status === "done" && (
        <>
          <Notice>Thank you. Your email address is confirmed.</Notice>
          <Button label={user ? "Find an event" : "Sign in"} icon="arrow-forward" onPress={() => router.replace(user ? "/" : "/sign-in")} />
        </>
      )}
      {(state.status === "idle" || state.status === "error") && (
        <>
          {state.status === "error" && <Notice error>{`${state.text} Links work once and expire; send a new one from your account.`}</Notice>}
          <Field label="Link from the email" value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} placeholder="Paste the whole link or its code" />
          <Button label="Confirm my email" disabled={!link.trim()} onPress={() => confirm(tokenFrom(link))} />
        </>
      )}
    </Screen>
  );
}
