"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { api, type Language } from "@/lib/api";
import { refreshSession, signOut, useSession } from "./session-provider";
import { EmptyState, Icon, LoadingPage, Notice, PageIntro } from "./primitives";

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "kk", label: "Қазақша" },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
];

const failure = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

function ProfileDetails({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="profile-details">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProfilePage() {
  const { user, organizer, ready, isAdmin } = useSession();
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "details" | "verify" | "password" | "everywhere">("");

  if (!ready) return <LoadingPage />;
  if (!user)
    return (
      <div className="workspace">
        <EmptyState
          title="Your account lives here."
          description="Sign in to see and change your details, language and password."
          href="/sign-in?next=/profile"
          label="Sign in"
        />
      </div>
    );

  async function run(kind: typeof busy, action: () => Promise<string | void>) {
    setNotice("");
    setError("");
    setBusy(kind);
    try {
      const text = await action();
      if (text) setNotice(text);
    } catch (error) {
      setError(failure(error, "That did not work. Please try again."));
    } finally {
      setBusy("");
    }
  }

  function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run("details", async () => {
      await api.users.updateMe({
        full_name: String(data.get("full_name")).trim(),
        preferred_language: String(data.get("language")) as Language,
      });
      await refreshSession();
      return "Your details were saved.";
    });
  }

  function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const next = String(data.get("new_password"));
    if (next !== data.get("confirm_password")) return setError("Your new passwords do not match.");
    void run("password", async () => {
      await api.auth.changePassword(String(data.get("current_password")), next);
      form.reset();
      return "Your password was changed. Other devices have been signed out.";
    });
  }

  return (
    <main className="workspace profile-workspace">
      <PageIntro eyebrow="Your account" title="Account profile." description="Your details, language and sign-in settings." />
      {notice && <Notice>{notice}</Notice>}
      {error && <Notice error>{error}</Notice>}
      {!user.is_email_verified && (
        <Notice>
          Please confirm your email address. Paid tickets and organizer tools need a confirmed email.{" "}
          <button
            className="text-link"
            disabled={busy === "verify"}
            onClick={() =>
              run("verify", async () => {
                const result = await api.auth.requestVerification();
                return result?.detail ?? "A new confirmation link is on its way.";
              })
            }
          >
            {busy === "verify" ? "Sending…" : "Send the link again"}
          </button>
        </Notice>
      )}
      <ProfileDetails
        rows={[
          ["Email address", <>{user.email} {user.is_email_verified ? <small>· confirmed</small> : <small>· not confirmed</small>}</>],
          ["Account type", isAdmin ? "Platform administrator" : organizer ? `Organizer · ${organizer.display_name}` : "Attendee"],
          ["Member since", new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "Asia/Almaty" }).format(new Date(user.created_at))],
        ]}
      />

      <form className="stack-form" onSubmit={saveDetails} aria-busy={busy === "details"}>
        <h2>Details</h2>
        <label>
          Full name
          <input name="full_name" defaultValue={user.full_name} required minLength={2} maxLength={100} autoComplete="name" disabled={busy === "details"} />
        </label>
        <label>
          Language for emails and notifications
          <select name="language" defaultValue={user.preferred_language} disabled={busy === "details"}>
            {LANGUAGES.map((language) => (
              <option key={language.value} value={language.value}>{language.label}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" disabled={busy === "details"}>
          {busy === "details" ? "Saving…" : "Save details"}
        </button>
      </form>

      <form className="stack-form" onSubmit={changePassword} aria-busy={busy === "password"}>
        <h2>Password</h2>
        <label>
          Current password
          <input name="current_password" type="password" autoComplete="current-password" required maxLength={128} disabled={busy === "password"} />
        </label>
        <label>
          New password
          <input name="new_password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={busy === "password"} />
        </label>
        <label>
          Confirm new password
          <input name="confirm_password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={busy === "password"} />
        </label>
        <button className="btn btn-primary" disabled={busy === "password"}>
          {busy === "password" ? "Changing…" : "Change password"}
        </button>
      </form>

      <div className="button-row">
        {!organizer && !isAdmin && (
          <Link className="btn btn-secondary" href="/organizer">Become an organizer <Icon name="arrow" size={16} /></Link>
        )}
        <button
          className="btn btn-secondary"
          disabled={busy === "everywhere"}
          onClick={() =>
            run("everywhere", async () => {
              await api.auth.signOutEverywhere();
              await signOut();
              router.push("/sign-in");
            })
          }
        >
          Sign out on all devices
        </button>
      </div>
    </main>
  );
}
