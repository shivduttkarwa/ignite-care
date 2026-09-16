import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { api } from "../api/client";
import type { WorkerDetail as Detail } from "../api/types";
import { AppFrame } from "../components/AppFrame";
import { EmptyState, ErrorState, Loading, RecordCard } from "../components/bits";
import { stamp } from "../lib/format";
import { useMe } from "../lib/auth";

export default function WorkerDetail() {
  const { id } = useParams();
  const { data: me } = useMe();

  const worker = useQuery({
    queryKey: ["worker", id],
    queryFn: () => api.get<Detail>(`/workers/${id}/`),
  });

  if (!me) return null;
  const w = worker.data;

  return (
    <AppFrame
      me={me}
      title="Care worker"
      narrow
      back={{ to: "/care-workers", label: "Back to care workers" }}
    >
      {worker.isPending && <Loading />}
      {worker.isError && <ErrorState error={worker.error} onRetry={() => worker.refetch()} />}

      {w && (
        <>
          <header className="c-person">
            <span
              className={`c-avatar c-person__avatar${w.is_manager ? " c-avatar--accent" : ""}`}
              style={{ viewTransitionName: "person-avatar" }}
              aria-hidden="true"
            >
              {w.initials}
            </span>
            <div>
              <h1 className="c-person__name" style={{ viewTransitionName: "person-name" }}>
                {w.full_name}
              </h1>
              <p className="c-person__meta">
                {w.role_label} &middot; {w.username}
                {w.phone && <> &middot; {w.phone}</>}
                {!w.is_active && <> &middot; access switched off</>}
              </p>
            </div>
          </header>

          <section className="c-panel">
            <div className="c-panel__head">
              <h2 className="c-panel__title">Properties</h2>
              <p className="c-panel__meta">Whose records they can open</p>
            </div>
            <div className="c-panel__body">
              {w.homes.length ? (
                <div className="o-cluster">
                  {w.homes.map((home) => (
                    <span className="c-tag" key={home.id}>
                      {home.label}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="u-small u-muted">
                  No properties assigned, so this account sees no participants.
                </p>
              )}
              <p className="u-small u-muted c-worker__note">
                Access and roles are changed in the administration area, not here.
              </p>
            </div>
          </section>

          <section className="o-stack" aria-labelledby="activity-title">
            <div className="c-blockhead">
              <h2 className="c-blockhead__title" id="activity-title">
                Recent submissions
              </h2>
              <p className="c-blockhead__meta u-nums">
                {w.submitted_30d} in the last 30 days
              </p>
            </div>

            {w.last_submitted_at && (
              <p className="u-small u-muted">Last submitted {stamp(w.last_submitted_at)}.</p>
            )}

            {w.recent.length ? (
              w.recent.map((record) => <RecordCard key={record.id} record={record} />)
            ) : (
              <div className="c-panel">
                <EmptyState
                  icon="file"
                  title="Nothing submitted yet"
                  body="Records this worker submits will appear here."
                />
              </div>
            )}
          </section>
        </>
      )}
    </AppFrame>
  );
}
