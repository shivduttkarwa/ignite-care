import { useQuery } from "@tanstack/react-query";

import { api } from "../api/client";
import { AppFrame } from "../components/AppFrame";
import { EmptyState, ErrorState, Loading } from "../components/bits";
import { useMe } from "../lib/auth";

type Worker = {
  id: number;
  full_name: string;
  initials: string;
  role: string;
  is_manager: boolean;
  homes: { id: number; label: string }[];
};

export default function Workers() {
  const { data: me } = useMe();
  const query = useQuery({
    queryKey: ["workers"],
    queryFn: () => api.get<Worker[]>("/workers/"),
  });

  if (!me) return null;

  return (
    <AppFrame me={me} title="Care workers">
      <div className="c-pagehead">
        <div>
          <h1 className="c-pagehead__title">Care workers</h1>
          <p className="c-pagehead__sub">Who has access, and to which properties.</p>
        </div>
      </div>

      {query.isPending && <Loading />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}

      {query.data && (
        <div className="c-tablewrap">
          <div className="o-scroll-x">
            <table className="c-table" style={{ minWidth: "40rem" }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Properties</th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((person) => (
                  <tr key={person.id}>
                    <td data-label="Name">
                      <span
                        className="o-cluster"
                        style={
                          { "--cluster-gap": "var(--space-2)", flexWrap: "nowrap" } as React.CSSProperties
                        }
                      >
                        <span
                          className={`c-avatar c-avatar--sm${person.is_manager ? " c-avatar--accent" : ""}`}
                          aria-hidden="true"
                        >
                          {person.initials}
                        </span>
                        <span className="c-table__name">{person.full_name}</span>
                      </span>
                    </td>
                    <td data-label="Role">
                      {person.is_manager ? (
                        <span className="c-rolebadge">Manager</span>
                      ) : (
                        <span className="u-muted">Support worker</span>
                      )}
                    </td>
                    <td data-label="Properties">
                      <span className="o-cluster">
                        {person.homes.length ? (
                          person.homes.map((home) => (
                            <span className="c-tag" key={home.id}>
                              {home.label}
                            </span>
                          ))
                        ) : (
                          <span className="u-faint">None</span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
                {query.data.length === 0 && (
                  <tr>
                    <td colSpan={3} className="c-empty-cell">
                      <EmptyState
                        icon="badge"
                        title="No care workers yet"
                        body="Accounts are created by an administrator."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppFrame>
  );
}
