import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api, download } from "../api/client";
import type { CareRecordDetail, FormSchema } from "../api/types";
import { Icon } from "./Icons";
import { PaperRecord } from "./PaperRecord";
import { ErrorState, Loading } from "./bits";
import { clock, shortDate } from "../lib/format";

export function RecordDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const record = useQuery({
    queryKey: ["record", id],
    queryFn: () => api.get<CareRecordDetail>(`/records/${id}/`),
  });

  const schema = useQuery({
    queryKey: ["schema", record.data?.schema_key, record.data?.schema_version],
    queryFn: () =>
      api.get<FormSchema>(`/schemas/${record.data!.schema_key}/${record.data!.schema_version}/`),
    enabled: !!record.data,
    staleTime: 60 * 60_000,
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const r = record.data;

  return (
    <>
      <div className="c-overlay" onClick={onClose} />
      <aside className="c-drawer" role="dialog" aria-modal="true" aria-labelledby="record-drawer-title">
        <div className="c-drawer__head">
          <div>
            <h2 className="c-drawer__title" id="record-drawer-title">
              {r ? `${r.participant_name} · ${shortDate(r.service_date)}` : "Care record"}
            </h2>
            {r && (
              <p className="c-drawer__meta">
                {r.shift_label} · {r.submitted_by_name ?? r.created_by_name}
                {r.submitted_at && ` · submitted ${clock(r.submitted_at)}`}
              </p>
            )}
          </div>
          <button type="button" className="c-drawer__close" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>

        <div className="c-drawer__body">
          {record.isPending && <Loading />}
          {record.isError && <ErrorState error={record.error} />}
          {r?.status === "not_required" && (
            <div className="c-callout">
              <Icon name="alert-circle" />
              <span>
                <strong>Marked not required.</strong> {r.not_required_reason}
              </span>
            </div>
          )}
          {r && r.status !== "not_required" && schema.data && (
            <PaperRecord record={r} schema={schema.data} preview />
          )}
        </div>

        <div className="c-drawer__foot">
          <button
            type="button"
            className="c-btn c-btn--primary"
            disabled={!r?.has_pdf}
            onClick={() => download(`/records/${id}/pdf/`)}
          >
            Download PDF
          </button>
          <Link className="c-btn" to={r?.has_pdf ? `/records/${id}/preview` : `/records/${id}`}>
            Open full record
          </Link>
        </div>
      </aside>
    </>
  );
}
