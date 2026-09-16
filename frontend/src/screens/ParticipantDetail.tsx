import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api, download } from "../api/client";
import type { CareRecord, ParticipantDetail as Detail } from "../api/types";
import { AppFrame } from "../components/AppFrame";
import { Icon } from "../components/Icons";
import { ErrorState, Loading, RecordCard, Tags } from "../components/bits";
import { shortDate } from "../lib/format";
import { useMe } from "../lib/auth";

const RANGES = [7, 14, 30];

export default function ParticipantDetail() {
  const { id } = useParams();
  const { data: me } = useMe();
  const [range, setRange] = useState(7);
  const [older, setOlder] = useState(0);
  const [notesOpen, setNotesOpen] = useState(true);
  const days = range + older;

  const person = useQuery({
    queryKey: ["participant", id],
    queryFn: () => api.get<Detail>(`/participants/${id}/`),
  });

  const history = useQuery({
    queryKey: ["participant-records", id, days],
    queryFn: () =>
      api.get<{ days: number; since: string; results: CareRecord[] }>(
        `/participants/${id}/records/?days=${days}`,
      ),
    placeholderData: keepPreviousData,
  });

  if (!me) return null;

  const byDay = new Map<string, CareRecord[]>();
  for (const record of history.data?.results ?? []) {
    byDay.set(record.service_date, [...(byDay.get(record.service_date) ?? []), record]);
  }

  const timeline: { date: string; records: CareRecord[] }[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    timeline.push({ date: key, records: byDay.get(key) ?? [] });
  }

  const p = person.data;

  return (
    <AppFrame me={me} title="Participant" narrow back={{ to: "/", label: "Back to today's shift" }}>
      {person.isPending && <Loading />}
      {person.isError && <ErrorState error={person.error} onRetry={() => person.refetch()} />}

      {p && (
        <>
          <header className="c-person">
            <span className="c-avatar c-person__avatar" aria-hidden="true">
              {p.initials}
            </span>
            <div>
              <h1 className="c-person__name">{p.full_name}</h1>
              <p className="c-person__meta">
                {p.preferred_name && <>&ldquo;{p.preferred_name}&rdquo; &middot; </>}
                {p.age && <>{p.age} &middot; </>}
                {p.room && <>{p.room} &middot; </>}
                {p.home_label}
              </p>
            </div>
            {p.tags.length > 0 && (
              <div className="c-person__tags o-cluster">
                <Tags tags={p.tags} />
              </div>
            )}
          </header>

          {p.has_critical_notes && (
            <section className="c-critical">
              <button
                type="button"
                className="c-critical__toggle"
                aria-expanded={notesOpen}
                aria-controls="critical-notes"
                onClick={() => setNotesOpen((open) => !open)}
              >
                <Icon name="alert" />
                <span>Critical notes</span>
                <Icon name="chevron-down" className="c-critical__chevron" />
              </button>
              {notesOpen && (
                <div className="c-critical__body" id="critical-notes">
                  {p.allergies && <p><strong>Allergies:</strong> {p.allergies}</p>}
                  {p.mobility && <p><strong>Mobility:</strong> {p.mobility}</p>}
                  {p.communication && <p><strong>Communication:</strong> {p.communication}</p>}
                  {p.emergency_contacts && (
                    <p><strong>Emergency contacts:</strong> {p.emergency_contacts}</p>
                  )}
                </div>
              )}
            </section>
          )}

          <div className="o-stack o-stack--tight">
            <Link className="c-btn c-btn--primary c-btn--block" to={`/participants/${id}/record/new`}>
              New care record
            </Link>
            <button
              type="button"
              className="c-btn c-btn--block"
              onClick={() => download(`/participants/${id}/book.pdf`)}
            >
              <Icon name="download" className="c-btn__icon" />
              Download record book (PDF)
            </button>
          </div>

          <section className="o-stack" aria-labelledby="history-title">
            <div className="c-blockhead">
              <h2 className="c-blockhead__title" id="history-title">
                Recent records
              </h2>
              <div className="c-blockhead__meta">
                <label className="u-visually-hidden" htmlFor="history-range">
                  Show records from
                </label>
                <select
                  id="history-range"
                  className="c-select c-select--inline"
                  value={range}
                  onChange={(e) => {
                    setRange(Number(e.target.value));
                    setOlder(0);
                  }}
                >
                  {RANGES.map((option) => (
                    <option key={option} value={option}>
                      Last {option} days
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {history.isPending && <Loading />}
            {history.isError && <ErrorState error={history.error} onRetry={() => history.refetch()} />}

            {timeline.map((day) => (
              <div key={day.date}>
                <p className="c-daymark">{shortDate(day.date)}</p>
                {day.records.length === 0 ? (
                  <p className="u-small u-faint" style={{ paddingInline: "var(--space-1)" }}>
                    No record for this day
                  </p>
                ) : (
                  <div className="o-stack" style={{ marginTop: "var(--space-2)" }}>
                    {day.records.map((record) => (
                      <RecordCard key={record.id} record={record} />
                    ))}
                  </div>
                )}
              </div>
            ))}

            <button
              type="button"
              className="c-btn c-btn--block"
              disabled={history.isFetching}
              onClick={() => setOlder((value) => value + range)}
            >
              {history.isFetching && !history.isPending ? "Loading…" : "Load older"}
            </button>
          </section>
        </>
      )}
    </AppFrame>
  );
}
