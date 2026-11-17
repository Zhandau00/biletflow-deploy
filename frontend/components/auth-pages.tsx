"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { currentSession, refreshSession, signIn, useSession } from "./session-provider";
import { Icon, LoadingPage, Notice, Poster, type PosterInfo } from "./primitives";
import { api, type Language } from "@/lib/api";

/** Kazakh or Russian when the browser prefers it, otherwise English. */
function browserLanguage(): Language {
  if (typeof navigator === "undefined") return "en";
  const code = navigator.language.slice(0, 2).toLowerCase();
  return code === "kk" || code === "ru" ? code : "en";
}

/** Only same-site paths, never back to the sign-in pages. */
export function safeNext(next?: string) {
  return next?.startsWith("/") &&
    !next.startsWith("//") &&
    !/[\\\u0000- ]/.test(next) &&
    !next.startsWith("/sign-in") &&
    !next.startsWith("/register")
    ? next
    : undefined;
}

// A decorative poster beside the sign-in form, not a real listing
const AUTH_POSTER: PosterInfo = {
  id: "auth",
  poster: "concert",
  title: "Your next night out",
  city: "Almaty",
  category: "Concerts",
  date: "2026-12-31T21:00:00+05:00",
  timeZone: "Asia/Almaty",
};

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout">
      <div className="auth-story">
        <p className="eyebrow">A ticket. A plan. A good night.</p>
        <h1>
          Be there
          <br />
          <em>for the good part.</em>
        </h1>
        <div className="auth-poster">
          <Poster event={AUTH_POSTER} />
          <div className="auth-stub">
            <Icon name="ticket" />
            <span>
              YOUR NEXT NIGHT OUT
              <br />
              <strong>Waiting to happen.</strong>
            </span>
            <span className="stub-number">№ 001</span>
          </div>
        </div>
        <p className="auth-caption">
          Made for the nights worth remembering.
          <br />
          Almaty & Astana.
        </p>
      </div>
      <div className="auth-form-side">
        <div className="auth-form-wrap">
          <Link href="/events" className="text-link muted">
            <Icon name="back" size={15} />
            Back to what&apos;s on
          </Link>
          {children}
        </div>
      </div>
    </main>
  );
}

const message = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export function AuthPage({
  register,
  next,
  initialRole,
}: {
  register: boolean;
  next?: string;
  initialRole?: string;
}) {
  const { user, ready } = useSession();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const role = initialRole === "organizer" ? "organizer" : initialRole === "platform_admin" ? "platform_admin" : "attendee";

  function goOn(created: boolean) {
    const target = safeNext(next);
    if (target) return router.push(target);
    if (created) return router.push(role === "organizer" ? "/organizer" : "/events");
    const session = currentSession();
    if (session.status === "signed-in" && session.user.is_platform_admin) return router.push("/admin");
    if (session.status === "signed-in" && session.organizer) return router.push("/organizer");
    router.push("/orders");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email")).trim().toLowerCase();
    const password = String(data.get("password"));
    if (register) {
      const name = String(data.get("name")).trim();
      if (name.length < 2 || !/^\p{L}+$/u.test(name.replace(/[ '-]/g, "")))
        return setError(
          "Use at least two characters for your name, with letters, spaces, hyphens or apostrophes only.",
        );
      if (password !== data.get("confirm-password"))
        return setError("Your passwords do not match.");
    }
    submitting.current = true;
    setBusy(true);
    try {
      if (register)
        await api.users.register({
          full_name: String(data.get("name")).trim(),
          email,
          password,
          preferred_language: (String(data.get("language")) || "en") as Language,
        });
      await signIn(email, password);
      form.reset();
      goOn(register);
    } catch (error) {
      setError(message(error, register ? "Could not create your account. Please try again." : "Could not sign you in. Please try again."));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const suffix = `${next ? `&next=${encodeURIComponent(next)}` : ""}&role=${role}`;
  if (!ready) return <LoadingPage />;
  return (
    <AuthLayout>
      <p className="eyebrow">{register ? "Make yourself at home" : "Good to see you"}</p>
      <h2>{register ? "Start your next chapter." : "Welcome back."}</h2>
      <p className="muted">
        {register
          ? "A place for your tickets. Or a stage for your ideas."
          : "Your tickets, your plans, all right here."}
      </p>
      {user && (
        <Notice>
          You are signed in as {user.full_name}.{" "}
          <Link href={safeNext(next) ?? "/orders"}>Continue</Link>
        </Notice>
      )}
      <form onSubmit={submit} className="stack-form" aria-busy={busy}>
        {register && (
          <label>
            Your name
            <input name="name" autoComplete="name" placeholder="First and last name" required minLength={2} maxLength={100} disabled={busy} />
          </label>
        )}
        <label>
          Email address
          <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={255} disabled={busy} />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            required
            minLength={register ? 8 : 1}
            maxLength={128}
            disabled={busy}
            aria-describedby={register ? "password-hint" : undefined}
          />
          {register && (
            <span className="field-hint" id="password-hint">Use 8–128 characters.</span>
          )}
        </label>
        {register && (
          <label>
            Confirm password
            <input name="confirm-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={busy} />
          </label>
        )}
        {register && (
          <label>
            Language for emails and notifications
            <select name="language" defaultValue={browserLanguage()} disabled={busy}>
              <option value="kk">Қазақша</option>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </label>
        )}
        {!register && (
          <Link className="text-link muted" href="/forgot-password">Forgot your password?</Link>
        )}
        {error && <Notice error>{error}</Notice>}
        <button className="btn btn-primary btn-full" disabled={busy}>
          {busy ? (register ? "Creating account…" : "Signing in…") : register ? "Create account" : "Sign in"}
          <Icon name="arrow" size={17} />
        </button>
      </form>
      {register && (
        <p className="field-hint">We will email you a link to confirm your address. You can book free events right away.</p>
      )}
      <p className="auth-switch">
        {register ? "Already have an account?" : "New around here?"}{" "}
        <Link href={`${register ? "/sign-in" : "/register"}?${suffix.slice(1)}`}>
          {register ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const email = String(new FormData(event.currentTarget).get("email")).trim().toLowerCase();
      const result = await api.auth.requestPasswordReset(email);
      setSent(result?.detail ?? "If an account exists for this email, a reset link is on its way.");
    } catch (error) {
      setError(message(error, "Could not send the reset link. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout>
      <p className="eyebrow">Locked out?</p>
      <h2>Reset your password.</h2>
      <p className="muted">Enter your email and we will send you a link to choose a new password.</p>
      {sent ? (
        <Notice>{sent}</Notice>
      ) : (
        <form onSubmit={submit} className="stack-form" aria-busy={busy}>
          <label>
            Email address
            <input name="email" type="email" autoComplete="email" required maxLength={255} disabled={busy} />
          </label>
          {error && <Notice error>{error}</Notice>}
          <button className="btn btn-primary btn-full" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"} <Icon name="arrow" size={17} />
          </button>
        </form>
      )}
      <p className="auth-switch">
        Remembered it? <Link href="/sign-in">Sign in</Link>
      </p>
    </AuthLayout>
  );
}

export function ResetPasswordPage({ token }: { token?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));
    if (password !== data.get("confirm-password")) return setError("Your passwords do not match.");
    setBusy(true);
    try {
      await api.auth.confirmPasswordReset(token ?? "", password);
      setDone(true);
      setTimeout(() => router.push("/sign-in"), 2500);
    } catch (error) {
      setError(message(error, "Could not reset your password. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout>
      <p className="eyebrow">Almost there</p>
      <h2>Choose a new password.</h2>
      {!token ? (
        <Notice error>
          This link is missing its code. Open the link from the email again, or{" "}
          <Link href="/forgot-password">ask for a new one</Link>.
        </Notice>
      ) : done ? (
        <Notice>Your password was changed. Taking you to sign in…</Notice>
      ) : (
        <form onSubmit={submit} className="stack-form" aria-busy={busy}>
          <label>
            New password
            <input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={busy} />
            <span className="field-hint">Use 8–128 characters. You will be signed out on other devices.</span>
          </label>
          <label>
            Confirm new password
            <input name="confirm-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={busy} />
          </label>
          {error && <Notice error>{error}</Notice>}
          <button className="btn btn-primary btn-full" disabled={busy}>
            {busy ? "Saving…" : "Save new password"} <Icon name="arrow" size={17} />
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

export function VerifyEmailPage({ token }: { token?: string }) {
  const { user } = useSession();
  const [state, setState] = useState<{ status: "working" | "done" | "error"; text?: string }>(
    token ? { status: "working" } : { status: "error", text: "This link is missing its code." },
  );
  const started = useRef(false);
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api.auth.confirmVerification(token).then(
      () => {
        setState({ status: "done" });
        void refreshSession();
      },
      (error: unknown) => setState({ status: "error", text: message(error, "This link could not be used.") }),
    );
  }, [token]);
  return (
    <AuthLayout>
      <p className="eyebrow">Email address</p>
      <h2>{state.status === "done" ? "You are confirmed." : "Confirming your email."}</h2>
      {state.status === "working" && <Notice>Checking your link…</Notice>}
      {state.status === "done" && (
        <>
          <Notice>Thank you. Your email address is confirmed.</Notice>
          <Link className="btn btn-primary btn-full" href={user ? "/events" : "/sign-in"}>
            {user ? "Find an event" : "Sign in"} <Icon name="arrow" size={17} />
          </Link>
        </>
      )}
      {state.status === "error" && (
        <>
          <Notice error>{state.text}</Notice>
          <p className="muted">
            Links work once and expire. {user ? "Send a new one from your " : "Sign in, then send a new one from your "}
            <Link href="/profile">profile</Link>.
          </p>
        </>
      )}
    </AuthLayout>
  );
}
