import { Link } from "react-router-dom";

import type { CareRecord, ConditionTag, Participant, RecordStatus } from "../api/types";
import { Icon } from "./Icons";

/* Status ------------------------------------------------------------------- */

const PILLS: Record<string, { cls: string; icon: string; label: string }> = {
  submitted: { cls: "c-pill--complete", icon: "check", label: "Complete" },
  draft: { cls: "c-pill--draft", icon: "clock", label: "Draft" },
  not_required: { cls: "c-pill--none", icon: "minus", label: "Not required" },
  void: { cls: "c-pill--void", icon: "x", label: "Void" },
  none: { cls: "c-pill--pending", icon: "circle", label: "Not started" },
};

export function StatusPill({ state }: { state: RecordStatus | "none" }) {
  const pill = PILLS[state] ?? PILLS.none;
  return (
    <span className={`c-pill ${pill.cls}`}>
      <Icon name={pill.icon} className="c-pill__icon" />
      {pill.label}
    </span>
  );
}

export function Tags({ tags }: { tags: ConditionTag[] }) {
  if (!tags.length) return null;
  return (
    <>
      {tags.map((tag) => (
        <span key={tag.id} className={`c-tag${tag.tone === "caution" ? " c-tag--caution" : ""}`}>
          {tag.label}
        </span>
      ))}
    </>
  );
}

/* Participant row ----------------------------------------------------------- */

type RowProps = {
  participant: Participant;
  state: RecordStatus | "none";
  isDone: boolean;
  recordId?: number | null;
  showHome?: boolean;
  onNotRequired?: (participant: Participant) => void;
};

export function ParticipantRow({
  participant,
  state,
  isDone,
  recordId,
  showHome,
  onNotRequired,
}: RowProps) {
  const modifier = isDone
    ? " c-participant--done"
    : participant.shift_alert
      ? " c-participant--flagged"
      : "";

  return (
    <article className={`c-participant${modifier}`}>
      <div className="c-participant__grid">
        <span className="c-avatar c-participant__avatar" aria-hidden="true">
          {participant.initials}
        </span>

        <div className="c-participant__id">
          <h3 className="c-participant__name">
            <Link to={`/participants/${participant.id}`} style={{ color: "inherit", textDecoration: "none" }}>
              {participant.full_name}
            </Link>
          </h3>
          <p className="c-participant__room">
            {participant.room}
            {showHome && participant.home_label ? ` · ${participant.home_label}` : ""}
          </p>
        </div>

        <div className="c-participant__tags o-cluster">
          <Tags tags={participant.tags} />
        </div>

        <div className="c-participant__status">
          <StatusPill state={state} />
        </div>

        {participant.shift_alert && (
          <p className="c-participant__alert">
            <Icon name="bang" />
            <span>
              <span className="u-visually-hidden">Important: </span>
              {participant.shift_alert}
            </span>
          </p>
        )}

        <div className="c-participant__foot">
          {state === "not_required" ? (
            <Link className="c-link-action" to={`/participants/${participant.id}`}>
              View reason
            </Link>
          ) : state === "submitted" && recordId ? (
            <Link className="c-link-action" to={`/records/${recordId}`}>
              View record
            </Link>
          ) : recordId ? (
            <Link className="c-link-action" to={`/records/${recordId}/edit`}>
              Continue draft
            </Link>
          ) : (
            <Link className="c-link-action" to={`/participants/${participant.id}/record/new`}>
              Add record
            </Link>
          )}

          {!isDone && onNotRequired && (
            <button
              type="button"
              className="c-link-action c-link-action--muted"
              onClick={() => onNotRequired(participant)}
            >
              Not required
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/* Small pieces --------------------------------------------------------------- */

export function StatTile({
  label,
  icon,
  value,
  unit,
  note,
  tone,
}: {
  label: string;
  icon: string;
  value: React.ReactNode;
  unit?: string;
  note?: string;
  tone?: "positive" | "caution" | "accent" | "flame";
}) {
  return (
    <div className={`c-stat${tone ? ` c-stat--${tone}` : ""}`}>
      <p className="c-stat__label">
        <Icon name={icon} />
        {label}
      </p>
      <p className="c-stat__value">
        {value}
        {unit && <span className="c-stat__unit">{unit}</span>}
      </p>
      {note && <p className="c-stat__note">{note}</p>}
    </div>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div
      className="c-progress"
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label="Records complete this shift"
    >
      <div
        className={`c-progress__bar${pct < 100 ? " c-progress__bar--partial" : ""}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="c-empty">
      <Icon name={icon} className="c-empty__icon" />
      <p className="c-empty__title">{title}</p>
      <p className="c-empty__body">{body}</p>
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="o-stack" aria-busy="true" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="c-skeleton" style={{ height: "5.5rem" }} />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="c-callout c-callout--danger" role="alert">
      <Icon name="alert-circle" />
      <div className="o-stack o-stack--tight">
        <span>{message}</span>
        {onRetry && (
          <button type="button" className="c-btn c-btn--sm" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function RecordCard({ record }: { record: CareRecord }) {
  return (
    <Link className="c-record" to={`/records/${record.id}`}>
      <div className="c-record__head">
        <span className="c-record__shift">{record.shift_label}</span>
        <span className="c-record__meta">
          {record.submitted_by_name ?? record.created_by_name}
          {record.submitted_at && ` · submitted ${clock(record.submitted_at)}`}
        </span>
      </div>
      <div className="o-cluster">
        <span className="c-formbadge c-formbadge--full">{record.form_title}</span>
        {record.status === "not_required" && <StatusPill state={record.status} />}
      </div>
      {record.summary.length > 0 && (
        <p className="c-record__summary">{record.summary.join(" | ")}</p>
      )}
    </Link>
  );
}

/* Formatting ---------------------------------------------------------------- */

export function clock(iso: string): string {
  const d = new Date(iso);
  const hour = d.getHours() % 12 || 12;
  const minute = String(d.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}${d.getHours() < 12 ? "am" : "pm"}`;
}

export function longDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function shortDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
