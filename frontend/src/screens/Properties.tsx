import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api } from "../api/client";
import { AppFrame } from "../components/AppFrame";
import { EmptyState, ErrorState, Loading, Progress } from "../components/bits";
import { useMe } from "../lib/auth";

type PropertyRow = {
  id: number;
  name: string;
  label: string;
  address: string;
  participant_count: number;
  staff_count: number;
  done: number;
  total: number;
  pct: number;
};

export default function Properties() {
  const { data: me } = useMe();
  const query = useQuery({
    queryKey: ["properties"],
    queryFn: () => api.get<{ shift_label: string; results: PropertyRow[] }>("/properties/"),
  });

  if (!me) return null;

  return (
    <AppFrame me={me} title="Properties">
      <div className="c-pagehead">
        <div>
          <h1 className="c-pagehead__title">Properties</h1>
          <p className="c-pagehead__sub">
            Completion shown for the {query.data?.shift_label.toLowerCase() ?? "current shift"}.
          </p>
        </div>
      </div>

      {query.isPending && <Loading />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}

      {query.data && query.data.results.length === 0 && (
        <div className="c-panel">
          <EmptyState
            icon="building"
            title="No properties assigned"
            body="Ask an administrator to add you to a property."
          />
        </div>
      )}

      <div className="o-grid">
        {query.data?.results.map((row) => (
          <section className="c-panel" key={row.id}>
            <div className="c-panel__head">
              <h2 className="c-panel__title">{row.label}</h2>
              <p className="c-panel__meta u-nums">{row.pct}%</p>
            </div>
            <div className="c-panel__body">
              <Progress done={row.done} total={row.total} />
              <p className="u-small u-muted">
                {row.done} of {row.total} records in for this shift
              </p>
              {row.address && <p className="u-xs u-faint">{row.address}</p>}
            </div>
            <div className="c-panel__foot">
              <span className="u-xs u-muted">
                {row.participant_count} participant{row.participant_count === 1 ? "" : "s"} ·{" "}
                {row.staff_count} staff
              </span>
              <Link className="c-link-action" to={`/participants?home=${row.id}`}>
                View
              </Link>
            </div>
          </section>
        ))}
      </div>
    </AppFrame>
  );
}
