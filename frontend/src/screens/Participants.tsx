import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "../api/client";
import type { Participant } from "../api/types";
import { AppFrame } from "../components/AppFrame";
import { Icon } from "../components/Icons";
import { EmptyState, ErrorState, Loading, ParticipantRow } from "../components/bits";
import { useMe } from "../lib/auth";

export default function Participants() {
  const { data: me } = useMe();
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [home, setHome] = useState("");

  const people = useQuery({
    queryKey: ["participants", query, home],
    queryFn: () => {
      const search = new URLSearchParams();
      if (query) search.set("q", query);
      if (home) search.set("home", home);
      const qs = search.toString();
      return api.get<Participant[]>(`/participants/${qs ? `?${qs}` : ""}`);
    },
  });

  if (!me) return null;

  const grouped = new Map<string, Participant[]>();
  for (const person of people.data ?? []) {
    const key = person.home_label || "Unassigned";
    grouped.set(key, [...(grouped.get(key) ?? []), person]);
  }

  return (
    <AppFrame me={me} title="Participants">
      <div className="c-pagehead">
        <div>
          <h1 className="c-pagehead__title">Participants</h1>
          <p className="c-pagehead__sub">
            {people.data?.length ?? 0} active participant{people.data?.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <form className="o-cluster" style={{ "--cluster-gap": "var(--space-2)" } as React.CSSProperties}
            onSubmit={(e) => { e.preventDefault(); setQuery(term); }}>
        <label className="u-visually-hidden" htmlFor="q">Search participants</label>
        <input className="c-input" id="q" type="search" placeholder="Search by name or room"
               style={{ maxWidth: "20rem" }} value={term} onChange={(e) => setTerm(e.target.value)} />
        {me.homes.length > 1 && (
          <>
            <label className="u-visually-hidden" htmlFor="home">Property</label>
            <select className="c-select" id="home" style={{ width: "auto" }}
                    value={home} onChange={(e) => setHome(e.target.value)}>
              <option value="">All properties</option>
              {me.homes.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
            </select>
          </>
        )}
        <button type="submit" className="c-btn">
          <Icon name="search" className="c-btn__icon" />Search
        </button>
        {(query || home) && (
          <button type="button" className="c-link-action c-link-action--muted"
                  onClick={() => { setTerm(""); setQuery(""); setHome(""); }}>
            Clear
          </button>
        )}
      </form>

      {people.isPending && <Loading />}
      {people.isError && <ErrorState error={people.error} onRetry={() => people.refetch()} />}

      {people.data && people.data.length === 0 && (
        <div className="c-panel">
          <EmptyState icon="users" title="No participants found"
                      body={query ? `Nothing matches "${query}". Try a different name or room.`
                                  : "No participants have been added to your homes yet."} />
        </div>
      )}

      {[...grouped.entries()].map(([label, rows]) => (
        <section className="o-stack" key={label}>
          <div className="c-blockhead">
            <h2 className="c-blockhead__title">{label}</h2>
            <p className="c-blockhead__meta">
              {rows.length} participant{rows.length === 1 ? "" : "s"}
            </p>
          </div>
          {rows.map((person) => (
            <ParticipantRow
              key={person.id}
              participant={person}
              state={person.shift_state}
              isDone={person.shift_is_done}
              recordId={person.shift_record_id ?? undefined}
            />
          ))}
        </section>
      ))}
    </AppFrame>
  );
}
