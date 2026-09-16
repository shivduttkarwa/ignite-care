import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../api/client";

export type SaveState = "idle" | "saving" | "saved" | "error" | "locked";

type Stored<T> = { value: T; at: number };

export function wasSaved(createdAt: string, updatedAt: string): boolean {
  return Date.parse(updatedAt) - Date.parse(createdAt) > 2000;
}

export function restoreDraft<T>(
  key: string,
  serverUpdatedAt: string,
  fallback: T,
): { value: T; restored: boolean } {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const stored = JSON.parse(raw) as Stored<T>;
      const differs = JSON.stringify(stored.value) !== JSON.stringify(fallback);
      if (differs && stored.at > Date.parse(serverUpdatedAt)) {
        return { value: stored.value, restored: true };
      }
    }
  } catch {
    return { value: fallback, restored: false };
  }
  return { value: fallback, restored: false };
}

type Options<T> = {
  storageKey: string;
  value: T;
  save: (value: T) => Promise<unknown>;
  enabled?: boolean;
  initiallyDirty?: boolean;
  lastSavedAt?: string | null;
  delay?: number;
};

export function useAutosave<T>({
  storageKey,
  value,
  save,
  enabled = true,
  initiallyDirty = false,
  lastSavedAt = null,
  delay = 2000,
}: Options<T>) {
  const serialised = JSON.stringify(value);
  const [state, setState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(() =>
    lastSavedAt ? new Date(lastSavedAt) : null,
  );

  const latest = useRef({ value, serialised });
  const saveRef = useRef(save);
  const lastSaved = useRef(initiallyDirty ? "" : serialised);
  const stopped = useRef(!enabled);
  const running = useRef<Promise<void> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    latest.current = { value, serialised };
    saveRef.current = save;
  });

  useEffect(() => {
    if (stopped.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ value: latest.current.value, at: Date.now() }));
    } catch {
      return;
    }
  }, [storageKey, serialised]);

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    if (stopped.current) return;
    if (running.current) await running.current;

    const { value: current, serialised: snapshot } = latest.current;
    if (stopped.current || snapshot === lastSaved.current) return;

    setState("saving");
    const attempt = saveRef.current(current).then(
      () => {
        lastSaved.current = snapshot;
        setSavedAt(new Date());
        setState("saved");
      },
      (error: unknown) => {
        if (error instanceof ApiError && error.status === 409) {
          stopped.current = true;
          setState("locked");
          return;
        }
        setState("error");
        timer.current = window.setTimeout(() => void flushRef.current(), 10_000);
      },
    );
    running.current = attempt.finally(() => {
      running.current = null;
    });
    await running.current;
  }, []);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    if (stopped.current || serialised === lastSaved.current) return;
    timer.current = window.setTimeout(() => void flush(), delay);
    return () => window.clearTimeout(timer.current);
  }, [serialised, delay, flush]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  useEffect(
    () => () => {
      if (!stopped.current && latest.current.serialised !== lastSaved.current) {
        saveRef.current(latest.current.value).catch(() => undefined);
      }
    },
    [],
  );

  const cancel = useCallback(() => window.clearTimeout(timer.current), []);

  const stop = useCallback(() => {
    stopped.current = true;
    window.clearTimeout(timer.current);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      return;
    }
  }, [storageKey]);

  return { state, savedAt, flush, cancel, stop };
}
