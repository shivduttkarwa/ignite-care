import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api, download } from "../api/client";
import type { CareRecordDetail, FormSchema } from "../api/types";
import { AppFrame } from "../components/AppFrame";
import { Icon } from "../components/Icons";
import { PaperRecord } from "../components/PaperRecord";
import { ErrorState, FormBadges, Loading, StatusPill } from "../components/bits";
import { clock, longDate } from "../lib/format";
import { useMe } from "../lib/auth";

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
      api.get<FormSchema>(`/schemas/${record.data!.schema_key}/${record.data!.schema_version}/`),
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
            <FormBadges forms={r.forms} full />
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
              {r.is_locked ? (
                <div className="c-callout c-callout--positive">
                  <Icon name="check" />
                  <span>
                    This record is locked. Corrections are added as an amendment, never edited in
                    place.
                  </span>
                </div>
              ) : (
                <div className="c-callout">
                  <Icon name="clock" />
                  <span>
                    This record is still a draft. <Link to={`/records/${r.id}/edit`}>Continue it</Link> to
                    finish and submit.
                  </span>
                </div>
              )}

              <div className="c-card">
                <div className="c-card__body">
                  <PaperRecord record={r} schema={schema.data} />
                </div>
              </div>

              {r.has_pdf && (
                <div className="c-pageactions">
                  <Link className="c-btn c-btn--primary" to={`/records/${r.id}/preview`}>
                    <Icon name="file" className="c-btn__icon" />
                    View PDF
                  </Link>
                  <button
                    type="button"
                    className="c-btn"
                    onClick={() => download(`/records/${r.id}/pdf/`)}
                  >
                    <Icon name="download" className="c-btn__icon" />
                    Download PDF
                  </button>
                </div>
              )}
            </>
          )}

          <div className="c-pageactions">
            <Link className="c-btn" to={`/participants/${r.participant}`}>
              All records for this participant
            </Link>
          </div>
        </>
      )}
    </AppFrame>
  );
}
