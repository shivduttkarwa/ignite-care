import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import type {
  Dashboard as DashboardData,
  ManagerDashboard,
  Notice,
  Participant,
  WorkerDashboard,
} from "../api/types";
import { AppFrame } from "../components/AppFrame";
import { Icon } from "../components/Icons";
import {
  EmptyState,
  ErrorState,
  Loading,
  ParticipantRow,
  Progress,
  StatTile,
  StatusPill,
} from "../components/bits";
import { clock, dayAndTime, longDate, shortDate } from "../lib/format";
import { useMe } from "../lib/auth";

export default function Dashboard() {
  const { data: me } = useMe();
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardData>("/dashboard/"),
  });

  if (!me) return null;

  const title = me.is_manager ? "Overview" : "Today's shift";
  const actions = me.is_manager ? (
    <Link className="c-btn c-btn--sm" to="/records">
      <Icon name="list" className="c-btn__icon" />
      <span className="u-hide-sm">All records</span>
    </Link>
  ) : (
    <Link className="c-btn c-btn--sm" to="/participants">
      <Icon name="users" className="c-btn__icon" />
      <span className="u-hide-sm">Participants</span>
    </Link>
  );

  return (
    <AppFrame me={me} title={title} actions={actions}>
      {query.isPending && <Loading label="Loading your shift" />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.data &&
        (query.data.is_manager ? (
          <ManagerView data={query.data} />
        ) : (
          <WorkerView data={query.data} />
        ))}
    </AppFrame>
  );
}

/* Worker -------------------------------------------------------------------- */

function WorkerView({ data }: { data: WorkerDashboard }) {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<Participant | null>(null);
  const [reason, setReason] = useState("");

  const switchHome = useMutation({
    mutationFn: (home: number) => api.post("/homes/switch/", { home }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["notices"] });
    },
  });

  const markNotRequired = useMutation({
    mutationFn: (vars: { participant: number; reason: string }) =>
      api.post("/records/not-required/", vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      dialogRef.current?.close();
      setReason("");
    },
  });

  function openDialog(participant: Participant) {
    setTarget(participant);
    setReason("");
    dialogRef.current?.showModal();
  }

  return (
    <>
      <dialog className="c-dialog" ref={dialogRef} onClose={() => setTarget(null)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (target) markNotRequired.mutate({ participant: target.id, reason });
          }}
        >
          <div className="c-dialog__head">
            <h2 className="c-dialog__title">Mark as not required</h2>
            <p className="c-dialog__sub">
              No care record will be expected for <strong>{target?.full_name}</strong> this shift.
            </p>
          </div>
          <div className="c-dialog__body">
            <div className="c-field">
              <label className="c-field__label" htmlFor="reason">
                Why is a record not needed?
              </label>
              <textarea
                className="c-textarea"
                id="reason"
                rows={3}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="For example: in hospital overnight, or on leave with family."
              />
              <p className="c-field__help">
                This is recorded against the shift and is visible to your manager.
              </p>
            </div>
          </div>
          <div className="c-dialog__foot">
            <button type="button" className="c-btn" onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
            <button type="submit" className="c-btn c-btn--primary" disabled={markNotRequired.isPending}>
              {markNotRequired.isPending ? "Saving…" : "Save reason"}
            </button>
          </div>
        </form>
      </dialog>

      {me && me.homes.length > 1 && (
        <nav className="c-homes c-homes--flush" aria-label="Choose the home you are working in today">
          {me.homes.map((home) => (
            <button
              key={home.id}
              type="button"
              className="c-home"
              aria-current={data.home?.id === home.id ? "true" : undefined}
              onClick={() => switchHome.mutate(home.id)}
            >
              <span>{home.label}</span>
              <span className="c-home__count">{home.participant_count}</span>
            </button>
          ))}
        </nav>
      )}

      <p className="c-shiftline c-shiftline--flush">
        {longDate(data.shift.service_date)} · <strong>{data.shift.label}</strong>
        {me?.full_name ? ` · ${me.full_name}` : ""}
      </p>

      <div className="c-columns">
        <div className="o-stack">
          <div className="c-blockhead">
            <h1 className="c-blockhead__title">Today's shift</h1>
            <p className="c-blockhead__meta u-nums">
              {data.done_count} of {data.total_count} records complete
            </p>
          </div>

          <Progress done={data.done_count} total={data.total_count} />

          {data.rows.length === 0 ? (
            <div className="c-panel">
              <EmptyState
                icon="users"
                title="No participants here yet"
                body="Once participants are added to this home, their shift records appear on this screen."
              />
            </div>
          ) : (
            data.rows.map((row, index) => (
              <ParticipantRow
                key={row.participant.id}
                index={index}
                participant={row.participant}
                state={row.state}
                isDone={row.is_done}
                recordId={row.record}
                onNotRequired={openDialog}
              />
            ))
          )}
        </div>

        <div className="c-columns__rail">
          <NoticesBlock />
          <HandoverPanel handover={data.handover} />
        </div>
      </div>
    </>
  );
}

function HandoverPanel({ handover }: { handover: WorkerDashboard["handover"] }) {
  return (
    <section className="c-panel u-desktop-only">
      <div className="c-panel__head">
        <h2 className="c-panel__title">Handover</h2>
        <p className="c-panel__meta">
          {handover.shift_label}, {shortDate(handover.service_date)}
        </p>
      </div>
      {handover.records.length ? (
        <div className="c-plist">
          {handover.records.map((record) => (
            <Link key={record.id} className="c-plist__item" to={`/records/${record.id}`} viewTransition>
              <span className="c-avatar c-avatar--sm" aria-hidden="true">
                {record.participant_initials}
              </span>
              <span className="c-plist__main">
                <span className="c-plist__title">{record.participant_name}</span>
                <span className="c-plist__sub">{record.summary.join(" · ")}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="c-panel__body">
          <p className="u-small u-muted">
            No records were lodged on the {handover.shift_label.toLowerCase()}.
          </p>
        </div>
      )}
    </section>
  );
}

/* Manager -------------------------------------------------------------------- */

function ManagerView({ data }: { data: ManagerDashboard }) {
  return (
    <>
      <div className="c-pagehead">
        <div>
          <h1 className="c-pagehead__title">Service overview</h1>
          <p className="c-pagehead__sub">
            {longDate(data.shift.service_date)} · <strong>{data.shift.label}</strong> across{" "}
            {data.by_property.length} propert{data.by_property.length === 1 ? "y" : "ies"}
          </p>
        </div>
        <div className="c-pagehead__actions">
          <a className="c-btn" href="/api/records/export.xlsx?range=7" download>
            <Icon name="download" className="c-btn__icon" />
            Export week
          </a>
          <Link className="c-btn c-btn--primary" to="/records">
            Open records
          </Link>
        </div>
      </div>

      <div className="c-stats">
        <StatTile
          label="This shift" icon="shield"
          tone={data.compliance_pct === 100 ? "positive" : data.compliance_pct < 60 ? "caution" : undefined}
          value={data.compliance_pct} unit="%"
          note={`${data.done_count} of ${data.expected_count} records in`}
        />
        <StatTile
          label="Outstanding" icon="circle"
          tone={data.outstanding_count ? "caution" : undefined}
          value={data.outstanding_count}
          note={data.outstanding_count ? "needs a record or a reason" : "every record is in"}
        />
        <StatTile label="Last 7 days" icon="trend" tone="flame" value={data.week_count} note="records submitted" />
        <StatTile label="Participants" icon="users" value={data.participant_count} note="across the service" />
        <StatTile label="On shift" icon="badge" tone="accent" value={data.workers_on_shift} note="workers have lodged today" />
      </div>

      <div className="c-columns">
        <div className="o-stack">
          <section className="c-panel">
            <div className="c-panel__head">
              <h2 className="c-panel__title">Completion by property</h2>
              <p className="c-panel__meta">{data.shift.label}</p>
            </div>
            <div className="c-panel__body">
              {data.by_property.map((row) => (
                <div key={row.home.id} className="c-meter">
                  <p className="c-meter__row">
                    <span className="c-meter__name">{row.home.label}</span>
                    <span className="c-meter__value u-nums">
                      {row.done} of {row.total} · {row.pct}%
                    </span>
                  </p>
                  <Progress done={row.done} total={row.total} />
                </div>
              ))}
            </div>
          </section>

          <section className="c-panel">
            <div className="c-panel__head">
              <h2 className="c-panel__title">Outstanding this shift</h2>
              <p className="c-panel__meta">{data.outstanding_count} to chase</p>
            </div>
            {data.outstanding.length ? (
              <div className="c-plist">
                {data.outstanding.map((row) => (
                  <Link key={row.participant.id} className="c-plist__item" to={`/participants/${row.participant.id}`} viewTransition>
                    <span className="c-avatar c-avatar--sm" aria-hidden="true">
                      {row.participant.initials}
                    </span>
                    <span className="c-plist__main">
                      <span className="c-plist__title">{row.participant.full_name}</span>
                      <span className="c-plist__sub">
                        {row.participant.home_label}
                        {row.participant.room && ` · ${row.participant.room}`}
                      </span>
                    </span>
                    <span className="c-plist__end">
                      <StatusPill state={row.state} />
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon="check" title="Every record is in" body="Nothing outstanding for this shift." />
            )}
          </section>

          <section className="c-panel">
            <div className="c-panel__head">
              <h2 className="c-panel__title">Recently submitted</h2>
              <p className="c-panel__meta">latest first</p>
            </div>
            <div className="c-plist">
              {data.recent.map((record) => (
                <Link key={record.id} className="c-plist__item" to={`/records/${record.id}`} viewTransition>
                  <span className="c-avatar c-avatar--sm" aria-hidden="true">
                    {record.participant_initials}
                  </span>
                  <span className="c-plist__main">
                    <span className="c-plist__title">{record.participant_name}</span>
                    <span className="c-plist__sub">
                      {record.shift_label} · {record.home_label} ·{" "}
                      {record.submitted_by_name ?? record.created_by_name}
                    </span>
                  </span>
                  <span className="c-plist__end u-xs u-muted u-nowrap">
                    {shortDate(record.service_date)}
                    <br />
                    {record.submitted_at && clock(record.submitted_at)}
                  </span>
                </Link>
              ))}
            </div>
            <div className="c-panel__foot">
              <Link className="c-link-action" to="/records">
                All records
              </Link>
            </div>
          </section>
        </div>

        <div className="c-columns__rail">
          <NoticesBlock />
        </div>
      </div>
    </>
  );
}

/* Notices ------------------------------------------------------------------- */

function NoticesBlock() {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const notices = useQuery({
    queryKey: ["notices"],
    queryFn: () => api.get<{ unread_count: number; results: Notice[] }>("/notices/"),
  });

  const all = notices.data?.results ?? [];
  const unread = notices.data?.unread_count ?? 0;
  const shown = (filter === "unread" ? all.filter((notice) => notice.is_unread) : all).slice(0, 3);

  return (
    <section className="o-stack o-stack--tight" aria-labelledby="notices-title">
      <div className="c-blockhead">
        <h2 className="c-blockhead__title" id="notices-title">
          Notices
        </h2>
        <div className="c-blockhead__meta">
          <div className="c-switch" role="group" aria-label="Show notices">
            <button
              type="button"
              className="c-switch__item"
              aria-current={filter === "all" ? "true" : undefined}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className="c-switch__item"
              aria-current={filter === "unread" ? "true" : undefined}
              onClick={() => setFilter("unread")}
            >
              Unread
              {unread > 0 && <span className="c-switch__count">{unread}</span>}
            </button>
          </div>
        </div>
      </div>

      {shown.map((notice) => (
        <article key={notice.id} className={`c-notice${notice.is_unread ? " c-notice--unread" : ""}`}>
          <p className="c-notice__meta">
            {notice.is_unread && <span className="c-notice__dot" aria-hidden="true" />}
            {notice.author_name}
            {notice.author_is_manager && " (Manager)"} · {dayAndTime(notice.published_at)}
          </p>
          <h3 className="c-notice__title">{notice.title}</h3>
          <p className="c-notice__body">{notice.body}</p>
        </article>
      ))}

      {!notices.isPending && shown.length === 0 && (
        <p className="u-small u-muted">
          {filter === "unread" ? "You are up to date." : "No notices right now."}
        </p>
      )}

      <Link className="c-link-action" to="/notices">
        All notices
      </Link>
    </section>
  );
}
