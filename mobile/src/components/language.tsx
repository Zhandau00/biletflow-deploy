/** Switch between Kazakh, Russian and English. */
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/lib/api";
import { LANG_NAMES, LANGS, setLang, useT, type Lang } from "@/lib/i18n";
import { currentSession, refreshSession } from "./session";
import { Chips, T } from "./ui";

/**
 * Change the app's language. A signed-in account keeps it on its profile, so
 * emails, notifications and the website use it too.
 */
export async function changeLanguage(lang: Lang) {
  setLang(lang);
  const session = currentSession();
  if (session.status === "signed-in" && session.user.preferred_language !== lang) {
    await api.users.updateMe({ preferred_language: lang });
    await refreshSession();
  }
}

export function LanguageSwitch() {
  const t = useT();
  const [error, setError] = useState("");
  return (
    <View style={{ gap: 6 }}>
      <Chips
        value={t.lang}
        onChange={(lang) => {
          setError("");
          changeLanguage(lang).catch(() => setError(t("The language changed here, but could not be saved to your profile.")));
        }}
        options={LANGS.map((lang) => ({ value: lang, label: LANG_NAMES[lang] }))}
      />
      <T small muted>
        {error || t("Used in the app, emails and notifications.")}
      </T>
    </View>
  );
}
