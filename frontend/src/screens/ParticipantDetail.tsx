import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api, download } from "../api/client";
import type { CareRecord, ParticipantDetail as Detail } from "../api/types";
import { AppFrame } from "../components/AppFrame";
import { Icon } from "../components/Icons";
import { ErrorState, Loading, RecordCard, Tags, shortDate } from "../components/bits";
import { useMe } from "../lib/auth";

const RANGES = [7, 14, 30];

export default function ParticipantDetail() {
  const { id } = useParams();
  const { data: me } = useMe();
  const [days, setDays] = useState(7);
  const [notesOpen, setNotesOpen] = useState(true);

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

  const firstName = person.data?.full_name.split(" ")[0] ?? "";

  return (
    <AppFrame
      me={me}
      title={person.data?.full_name ?? "Participant"}
      back={{ to: "/", label: "Back to today's shift" }}
      actions={
        <Link className="c-btn c-btn--sm c-btn--primary" to={`/participants/${id}/record/new`}>
          New record
        </Link>
      }
    >
      {person.isPending && <Loading />}
      {person.isError && <ErrorState error={person.error} onRetry={() => person.refetch()} />}

      {person.data && (
        <>
          <div className="c-pagehead">
            <div
              className="o-cluster"
              style={
                {
                  "--cluster-gap": "var(--space-3)",
                  flexWrap: "nowrap",
                  alignItems: "flex-start",
                } as React.CSSProperties
              }
            >
              <span
                className="c-avatar"
                style={{ width: "3.5rem", height: "3.5rem", fontSize: "var(--text-md)" }}
                aria-hidden="true"
              >
                {person.data.initials}
              </span>
              <div style={{ minWidth: 0 }}>
                <h1 className="c-pagehead__title">{person.data.full_name}</h1>
                <p className="c-pagehead__sub">
                  {person.data.preferred_name && <>&ldquo;{person.data.preferred_name}&rdquo; &middot; </>}
                  {person.data.age && <>{person.data.age} &middot; </>}
                  {person.data.room && <>{person.data.room} &middot; </>}
                  {person.data.home_label}
                </p>
                <div className="o-cluster" style={{ marginTop: "var(--space-2)" }}>
                  <Tags tags={person.data.tags} />
                </div>
              </div>
            </div>
            <div className="c-pagehead__actions">
              <button
                type="button"
                className="c-btn"
                onClick={() => download(`/participants/${id}/book.pdf`)}
              >
                <Icon name="download" className="c-btn__icon" />
                Record book
              </button>
            </div>
          </div>

          <div className="c-columns">
            <div className="o-stack">
              <div className="c-blockhead">
                <h2 className="c-blockhead__title">Recent records</h2>
                <div className="c-blockhead__meta">
                  <div className="c-switch">
                    {RANGES.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className="c-switch__item"
                        aria-current={option === days ? "true" : undefined}
                        onClick={() => setDays(option)}
                      >
                        {option} days
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {history.isPending && <Loading />}

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
            </div>

            <div className="c-columns__rail">
              {person.data.has_critical_notes && (
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
                      {person.data.allergies && (
                        <p><strong>Allergies:</strong> {person.data.allergies}</p>
                      )}
                      {person.data.mobility && (
                        <p><strong>Mobility:</strong> {person.data.mobility}</p>
                      )}
                      {person.data.communication && (
                        <p><strong>Communication:</strong> {person.data.communication}</p>
                      )}
                      {person.data.emergency_contacts && (
                        <p><strong>Emergency contacts:</strong> {person.data.emergency_contacts}</p>
                      )}
                    </div>
                  )}
                </section>
              )}

              <section className="c-panel">
                <div className="c-panel__head">
                  <h2 className="c-panel__title">Record book</h2>
                </div>
                <div className="c-panel__body">
                  <p className="u-small u-muted">
                    Every submitted record as a page, oldest first.
                  </p>
                  <button
                    type="button"
                    className="c-btn c-btn--block"
                    onClick={() => download(`/participants/${id}/book.pdf`)}
                  >
                    <Icon name="download" className="c-btn__icon" />
                    Download record book (PDF)
                  </button>
                </div>
              </section>
            </div>
          </div>

          <Link className="c-btn c-btn--block" to="/participants">
            All participants
          </Link>
          <span className="u-visually-hidden">Viewing {firstName}</span>
        </>
      )}
    </AppFrame>
  );
}
