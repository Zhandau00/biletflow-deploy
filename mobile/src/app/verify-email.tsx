/** Confirm an email address with the link from the confirmation email. */
import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { tokenFrom } from "@/components/auth";
import { refreshSession, useSession } from "@/components/session";
import { failure } from "@/components/use-load";
import { Button, Field, Intro, Notice, Screen } from "@/components/ui";
import { tk, useT } from "@/lib/i18n";

export default function VerifyEmail() {
  const t = useT();
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
      setState({ status: "error", text: failure(e, tk("This link could not be used.")) });
    }
  }

  useEffect(() => {
    if (!params.token || started.current) return;
    started.current = true;
    void confirm(params.token);
  }, [params.token]);

  return (
    <Screen>
      <Intro eyebrow={t("Email address")} title={state.status === "done" ? t("You are confirmed.") : t("Confirming your email.")} />
      {state.status === "working" && <Notice>{t("Checking your link…")}</Notice>}
      {state.status === "done" && (
        <>
          <Notice>{t("Thank you. Your email address is confirmed.")}</Notice>
          <Button label={user ? t("Find an event") : t("Sign in")} icon="arrow-forward" onPress={() => router.replace(user ? "/" : "/sign-in")} />
        </>
      )}
      {(state.status === "idle" || state.status === "error") && (
        <>
          {state.status === "error" && <Notice error>{t("{text} Links work once and expire; send a new one from your account.", { text: state.text })}</Notice>}
          <Field label={t("Link from the email")} value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} placeholder={t("Paste the whole link or its code")} />
          <Button label={t("Confirm my email")} disabled={!link.trim()} onPress={() => confirm(tokenFrom(link))} />
        </>
      )}
    </Screen>
  );
}
