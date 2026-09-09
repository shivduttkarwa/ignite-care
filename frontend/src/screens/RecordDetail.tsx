import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api, download } from "../api/client";
import type { CareRecordDetail, FormSchema } from "../api/types";
import { AppFrame } from "../components/AppFrame";
import { Icon } from "../components/Icons";
import { ErrorState, Loading, StatusPill, clock, longDate } from "../components/bits";
import { useMe } from "../lib/auth";

function show(value: unknown) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") {
    return <span className="c-paper__off">Not recorded</span>;
  }
  return String(value);
}

export default function RecordDetail() {
  const { id } = useParams();
  const { data: me } = useMe();

  const record = useQuery({
    queryKey: ["record", Number(id)],
    queryFn: () => api.get<CareRecordDetail>(`/records/${id}/`),
  });

  const schema = useQuery({
    queryKey: ["schema", record.data?.schema_key, record.data?.schema_version],
    queryFn: () =>
      api.get<FormSchema>(
        `/schemas/${record.data!.schema_key}/${record.data!.schema_version}/`,
      ),
    enabled: !!record.data,
    staleTime: 60 * 60_000,
  });

  if (!me) return null;
  const r = record.data;

  return (
    <AppFrame
      me={me}
      title="Care record"
      narrow
      back={{ to: r ? `/participants/${r.participant}` : "/", label: "Back to participant" }}
    >
      {record.isPending && <Loading />}
      {record.isError && <ErrorState error={record.error} onRetry={() => record.refetch()} />}

      {r && schema.data && (
        <>
          <div>
            <h1 className="c-pagehead__title">
              {r.participant_name} &middot; {longDate(r.service_date)}
            </h1>
            <p className="u-small u-muted">
              {r.shift_label} &middot; {r.submitted_by_name ?? r.created_by_name}
              {r.submitted_at && ` · submitted ${clock(r.submitted_at)}`} &middot; {r.reference}
            </p>
          </div>

          <div className="o-cluster">
            <StatusPill state={r.status} />
            <span className="c-formbadge c-formbadge--full">{r.form_title}</span>
          </div>

          {r.status === "not_required" ? (
            <div className="c-callout">
              <Icon name="alert-circle" />
              <span>
                <strong>Marked not required.</strong> {r.not_required_reason}
              </span>
            </div>
          ) : (
            <>
              {r.is_locked && (
                <div className="c-callout c-callout--positive">
                  <Icon name="check" />
                  <span>
                    This record is locked. Corrections are added as an amendment, never edited in
                    place.
                  </span>
                </div>
              )}

              <div className="c-card">
                <div className="c-card__body">
                  <div className="c-paper">
                    <p className="c-eyebrow">{schema.data.title}</p>

                    <table>
                      <tbody>
                        <tr>
                          <th>Participant</th>
                          <td>{r.participant_name}</td>
                        </tr>
                        <tr>
                          <th>Date</th>
                          <td>{longDate(r.service_date)}</td>
                        </tr>
                        <tr>
                          <th>Name of staff on shift</th>
                          <td>{r.submitted_by_name ?? r.created_by_name}</td>
                        </tr>
                      </tbody>
                    </table>

                    {schema.data.sections.map((section) => (
                      <div key={section.key}>
                        <h4>{section.title}</h4>
                        <table>
                          <tbody>
                            {section.fields
                              .filter((field) => field.type !== "repeater")
                              .map((field) => (
                                <tr key={field.key}>
                                  <th>{field.label}</th>
                                  <td>{show(r.answers[field.key])}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    ))}

                    {r.attendances.length > 0 && (
                      <table>
                        <thead>
                          <tr>
                            <th style={{ width: "22%" }}>Time</th>
                            <th style={{ width: "56%" }}>Purpose</th>
                            <th>Duration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.attendances.map((row, index) => (
                            <tr key={index}>
                              <td>{row.time}</td>
                              <td>{row.purpose}</td>
                              <td>{row.duration_minutes} min</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>

              {r.has_pdf && (
                <button
                  type="button"
                  className="c-btn c-btn--block"
                  onClick={() => download(`/records/${r.id}/pdf/`)}
                >
                  <Icon name="download" className="c-btn__icon" />
                  Download PDF
                </button>
              )}
            </>
          )}

          <Link className="c-btn c-btn--block c-btn--primary" to={`/participants/${r.participant}`}>
            All records for this participant
          </Link>
        </>
      )}
    </AppFrame>
  );
}
