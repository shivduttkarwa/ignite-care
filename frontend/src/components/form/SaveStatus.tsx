import { useEffect, useState } from "react";

import type { SaveState } from "../../lib/autosave";
import { Icon } from "../Icons";
import { clock } from "../../lib/format";

function ago(at: Date) {
  const minutes = Math.floor((Date.now() - at.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `at ${clock(at.toISOString())}`;
}

export function SaveStatus({ state, savedAt }: { state: SaveState; savedAt: Date | null }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (state === "saving") {
    return <span className="c-savestate c-savestate--pending">Saving…</span>;
  }
  if (state === "error") {
    return <span className="c-savestate c-savestate--pending">Not saved yet, retrying</span>;
  }
  if (state === "locked") {
    return <span className="c-savestate c-savestate--pending">Already submitted</span>;
  }
  if (!savedAt) return null;

  return (
    <span className="c-savestate">
      <Icon name="check" />
      Draft saved {ago(savedAt)}
    </span>
  );
}
