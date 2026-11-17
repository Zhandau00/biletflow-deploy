"use client";

/**
 * Check-in desk for owners, managers and check-in staff: scan a QR code
 * (camera or a USB scanner that types), or find a guest by name, then admit
 * them. Every check-in is recorded and can be undone with a reason.
 */

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { eventDate, eventTime } from "@/lib/events";
import {
  canManageRole,
  type Attendee,
  type CheckInRecord,
  type CheckInResult,
  type CheckInStats,
  type MyEvent,
} from "@/lib/organizer";
import { failure, OrganizerShell } from "./organizer-pages";
import { useSession } from "./session-provider";
import { useLoad } from "./use-load";
import { EmptyState, Icon, LoadingPage, Notice, PageIntro } from "./primitives";

const RESULT_TONE: Record<string, string> = {
  valid: "scan-ok",
  already_used: "scan-warn",
  cancelled: "scan-bad",
  refunded: "scan-bad",
  invalid: "scan-bad",
  wrong_event: "scan-bad",
};

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

export function CheckInPage() {
  const { ready, user, organizer, staffEvents } = useSession();
  const events = useLoad(`checkin-events:${user?.id ?? ""}`, async (signal) => {
    if (!user) return [] as MyEvent[];
    const [managed, door] = await Promise.all([
      api.request<MyEvent[]>("/events/mine", { signal }),
      api.request<MyEvent[]>("/events/mine", { signal, query: { role: "checkin_staff" } }),
    ]);
    // Events still open for check-in, soonest first
    return [...managed, ...door]
      .filter((e, i, all) => all.findIndex((x) => x.id === e.id) === i)
      .filter((e) => e.lifecycle === "upcoming" || e.lifecycle === "active")
      .sort((a, b) => a.start_at.localeCompare(b.start_at));
  });
  const [selected, setSelected] = useState("");

  if (!ready) return <LoadingPage />;
  if (!user)
    return (
      <main className="workspace narrow-workspace">
        <EmptyState icon="users" title="The door list lives here." description="Sign in with the account your organizer added to the event team." href="/sign-in?next=/check-in" label="Sign in" />
      </main>
    );
  const list = events.data ?? [];
  const event = list.find((e) => e.id === selected) ?? list[0];
  const body = (
    <>
      <PageIntro eyebrow="First impressions count" title="Welcome them in." description="Scan a ticket or find a guest by name." />
      {events.status === "error" && <Notice error>{events.error.message}</Notice>}
      {!events.data ? (
        <LoadingPage />
      ) : event ? (
        <>
          <label className="checkin-event-select">
            Event
            <select value={event.id} onChange={(e) => setSelected(e.target.value)}>
              {list.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} · {eventDate(e.start_at, e.timezone)} {eventTime(e.start_at, e.timezone)}
                </option>
              ))}
            </select>
          </label>
          <Desk key={event.id} event={event} />
        </>
      ) : (
        <EmptyState
          icon="users"
          title="No door assignment yet."
          description="Events you can check guests in for appear here from the day they are published until they end. Ask the organizer to add your account's email to the team."
          href="/events"
          label="Browse events"
        />
      )}
    </>
  );
  const organizerView = !!organizer || staffEvents.some((e) => canManageRole(e.my_role));
  return organizerView ? <OrganizerShell active="check-in">{body}</OrganizerShell> : <main className="workspace narrow-workspace">{body}</main>;
}

function Desk({ event }: { event: MyEvent }) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [undoing, setUndoing] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const bump = () => setVersion((v) => v + 1);

  const stats = useLoad(`checkin-stats:${event.id}:${version}`, (signal) =>
    api.request<CheckInStats>(`/events/${event.id}/check-in/stats`, { signal }),
  );
  const attendees = useLoad(`checkin-attendees:${event.id}:${version}`, (signal) =>
    api.request<Attendee[]>(`/events/${event.id}/attendees`, { signal }),
  );
  const history = useLoad(`checkin-history:${event.id}:${version}`, (signal) =>
    api.request<CheckInRecord[]>(`/events/${event.id}/check-in/history`, { signal, query: { limit: 20 } }),
  );

  // Other doors check guests in too: refresh the numbers every 15 seconds
  useEffect(() => {
    const timer = setInterval(bump, 15000);
    return () => clearInterval(timer);
  }, []);

  async function scan(payload: string) {
    const code = payload.trim();
    if (!code) return;
    setError("");
    try {
      setResult(await api.request<CheckInResult>(`/events/${event.id}/check-in/scan`, { body: { qr_payload: code } }));
      bump();
    } catch (e) {
      setError(failure(e));
    } finally {
      if (input.current) {
        input.current.value = "";
        input.current.focus();
      }
    }
  }

  async function admit(ticketId: string) {
    setError("");
    try {
      setResult(await api.request<CheckInResult>(`/events/${event.id}/check-in/tickets/${ticketId}`, { method: "POST" }));
      bump();
    } catch (e) {
      setError(failure(e));
    }
  }

  async function undo(e: FormEvent<HTMLFormElement>, ticketId: string) {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get("reason")).trim();
    setError("");
    try {
      setResult(await api.request<CheckInResult>(`/events/${event.id}/check-in/tickets/${ticketId}/undo`, { body: { reason } }));
      setUndoing(null);
      bump();
    } catch (err) {
      setError(failure(err));
    }
  }

  const q = search.trim().toLowerCase();
  const matches = q
    ? (attendees.data ?? []).filter((a) =>
        `${a.attendee_name} ${a.attendee_email} ${a.ticket_id} ${a.seat ?? ""}`.toLowerCase().includes(q),
      ).slice(0, 30)
    : [];
  const s = stats.data;

  return (
    <section className="checkin-desk">
      {s && (
        <div className="checkin-progress" aria-live="polite">
          <strong>
            {s.checked_in} / {s.registered}
          </strong>
          <span>checked in · {s.remaining} still to arrive</span>
          <div className="progress-track">
            <span style={{ width: `${s.checked_in_percent}%` }} />
          </div>
        </div>
      )}
      <form
        className="scan-form"
        onSubmit={(e) => {
          e.preventDefault();
          void scan(input.current?.value ?? "");
        }}
      >
        <label>
          Scan or paste a ticket code
          <input ref={input} autoFocus autoComplete="off" placeholder="Point the scanner here, or paste the code" aria-describedby="scan-hint" />
        </label>
        <div className="button-row">
          <button className="btn btn-primary">Check ticket</button>
          <button type="button" className="btn btn-secondary" onClick={() => setCamera((c) => !c)}>
            {camera ? "Stop camera" : "Use camera"}
          </button>
        </div>
        <p id="scan-hint" className="field-hint">USB and Bluetooth scanners type the code and press Enter for you.</p>
      </form>
      {camera && <CameraScanner onCode={(code) => void scan(code)} onClose={() => setCamera(false)} />}
      {result && (
        <div className={`scan-result ${RESULT_TONE[result.result] ?? "scan-bad"}`} role="status">
          <strong>{result.admitted ? "Welcome in" : result.message}</strong>
          {result.ticket && (
            <p>
              {result.ticket.attendee_name} · {result.ticket.ticket_type_name}
              {result.ticket.seat && ` · ${result.ticket.seat}`}
            </p>
          )}
          {result.admitted && <p>{result.message}</p>}
        </div>
      )}
      {error && <Notice error>{error}</Notice>}

      <div className="section-heading">
        <h2>Find a guest</h2>
      </div>
      <label className="search-input">
        <Icon name="search" size={17} />
        <input aria-label="Search guests" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, seat or ticket reference" />
      </label>
      {q && (
        <div className="attendee-list">
          {matches.length === 0 && <p className="muted">No guest matches “{search}”.</p>}
          {matches.map((a) => (
            <article className="attendee-row" key={a.ticket_id}>
              <div className="attendee-person">
                <span className="avatar">{a.attendee_name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</span>
                <div>
                  <h3>{a.attendee_name}</h3>
                  <p>
                    {a.ticket_type_name}
                    {a.seat && ` · ${a.seat}`} · <code>{a.ticket_id.slice(0, 8).toUpperCase()}</code>
                  </p>
                </div>
              </div>
              <div className="attendee-tickets">
                {a.status === "valid" && (
                  <button className="btn btn-small btn-secondary" onClick={() => admit(a.ticket_id)}>
                    <Icon name="ticket" size={14} /> Check in
                  </button>
                )}
                {a.status === "checked_in" &&
                  (undoing === a.ticket_id ? (
                    <form className="cancel-order" onSubmit={(e) => undo(e, a.ticket_id)}>
                      <input name="reason" required minLength={3} maxLength={500} placeholder="Why undo?" aria-label="Reason for undoing" />
                      <button className="text-button danger">Undo check-in</button>
                      <button type="button" className="text-button" onClick={() => setUndoing(null)}>Keep</button>
                    </form>
                  ) : (
                    <>
                      <span className="status-badge status-live">
                        Checked in {a.checked_in_at && eventTime(a.checked_in_at, event.timezone)}
                      </span>
                      <button className="text-button muted" onClick={() => setUndoing(a.ticket_id)}>Undo</button>
                    </>
                  ))}
                {(a.status === "cancelled" || a.status === "refunded") && <span className="status-badge">{a.status === "cancelled" ? "Cancelled" : "Refunded"} — do not admit</span>}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="section-heading recent-orders-heading">
        <h2>Recent at this door</h2>
        {canManageRole(event.my_role) && (
          <Link className="text-link" href={`/organizer/events/${event.id}?tab=Attendees`}>Full guest list</Link>
        )}
      </div>
      {history.data?.length ? (
        <ol className="activity-log">
          {history.data.map((h) => (
            <li key={h.id}>
              <time>{eventTime(h.created_at, event.timezone)}</time>
              <p>
                <strong>{h.attendee_name}</strong> {h.action === "undo" ? `check-in undone${h.reason ? ` (${h.reason})` : ""}` : `checked in (${h.method === "scan" ? "scanned" : "from the list"})`}
                {h.performed_by_name && ` by ${h.performed_by_name}`}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Nobody checked in yet.</p>
      )}
    </section>
  );
}

/** Reads QR codes with the camera where the browser supports BarcodeDetector. */
function CameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState("");
  const last = useRef({ code: "", at: 0 });
  // The desk re-renders often; keep the camera running across those renders
  const handler = useRef(onCode);
  useEffect(() => {
    handler.current = onCode;
  }, [onCode]);
  // Only shown after a click, so reading the browser's features here is safe
  const Ctor = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  useEffect(() => {
    if (!Ctor) return;
    const detector = new Ctor({ formats: ["qr_code"] });
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (!video.current) return;
        video.current.srcObject = s;
        void video.current.play();
        timer = setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return;
          const [code] = await detector.detect(video.current).catch(() => []);
          const now = Date.now();
          // The same code stays in view for a while: read it once per 3 seconds
          if (code?.rawValue && (code.rawValue !== last.current.code || now - last.current.at > 3000)) {
            last.current = { code: code.rawValue, at: now };
            handler.current(code.rawValue);
          }
        }, 400);
      })
      .catch(() => setProblem("Camera access was not allowed."));
    return () => {
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [Ctor]);
  const message = Ctor ? problem : "This browser cannot read QR codes from the camera. Use a scanner or type the code instead.";
  return (
    <div className="camera-scanner">
      {message ? <Notice error>{message}</Notice> : <video ref={video} muted playsInline aria-label="Camera view for scanning tickets" />}
      <button className="text-button" onClick={onClose}>Close camera</button>
    </div>
  );
}
