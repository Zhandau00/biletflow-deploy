import { useCallback, useEffect, useState } from "react";

export type Loaded<T> =
  | { status: "loading"; data?: T }
  | { status: "ready"; data: T }
  | { status: "error"; error: Error; httpStatus: number; data?: T };

/**
 * Load data when `key` changes, cancelling the previous request. Keeps the
 * last data while a new request is on its way, so lists do not flash empty.
 * `reload` loads again (pull to refresh).
 */
export function useLoad<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<Loaded<T> & { key: string }>({ status: "loading", key });
  const [attempt, setAttempt] = useState(0);

  if (state.key !== key) setState({ status: "loading", data: state.data, key });

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => !controller.signal.aborted && setState({ status: "ready", data, key }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const failure = error instanceof Error ? error : new Error("Something went wrong.");
        const httpStatus =
          typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 0;
        setState((previous) => ({ status: "error", error: failure, httpStatus, data: previous.data, key }));
      },
    );
    return () => controller.abort();
    // `load` is re-created on each render; `key` says when to reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload, refreshing: state.status === "loading" && state.data !== undefined };
}

export const failure = (error: unknown, fallback = "That did not work. Please try again.") =>
  error instanceof Error && error.message ? error.message : fallback;
