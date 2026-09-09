import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api, download } from "../api/client";
import type { CareRecord, Paginated, Participant } from "../api/types";
import { AppFrame } from "../components/AppFrame";
import { Icon } from "../components/Icons";
import { EmptyState, ErrorState, Loading, shortDate } from "../components/bits";
import { useMe } from "../lib/auth";

const RANGES = [
  ["7", "Last 7 days"],
  ["14", "Last 14 days"],
  ["30", "Last 30 days"],
  ["all", "All time"],
];

const SHIFTS = [
  ["morning", "Morning shift"],
  ["afternoon", "Afternoon shift"],
  ["night", "Night shift"],
];

/* The yellow-highlighted fields from the client's paper form. */
const TRISTATE = [
  ["physio", "Physio"],
  ["shower", "Shower"],
  ["bed_bath", "Bed bath"],
];
const RECORDED = [
  ["bowel", "Bowel"],
  ["urine", "Urine"],
  ["fluids", "Fluids"],
];

type Filters = Record<string, string>;

const EMPTY: Filters = {
  home: "", participant: "", worker: "", shift: "", range: "7",
  physio: "", shower: "", bed_bath: "", bowel: "", urine: "", fluids: "",
};

export default function Records() {
  const { data: me } = useMe();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);

  const search = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v) as [string, string][],
  );
  search.set("page", String(page));

  const records = useQuery({
    queryKey: ["records", search.toString()],
    queryFn: () => api.get<Paginated<CareRecord>>(`/records/?${search}`),
  });

  const participants = useQuery({
    queryKey: ["participants", "", ""],
    queryFn: () => api.get<Participant[]>("/participants/"),
  });

  if (!me) return null;

  const set = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const chips = Object.entries(filters)
    .filter(([key, value]) => value && !(key === "range" && value === "7"))
    .map(([key, value]) => ({ key, label: `${label(key)}: ${choiceLabel(key, value, participants.data)}` }));

  const exportQs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v) as [string, string][],
  ).toString();

  const totalPages = Math.ceil((records.data?.count ?? 0) / 25);

  return (
    <AppFrame me={me} title="Records">
      <div className="c-pagehead">
        <div>
          <h1 className="c-pagehead__title">Records</h1>
          <p className="c-pagehead__sub">
            {records.data?.count ?? 0} record{records.data?.count === 1 ? "" : "s"} match the
            current filters.
          </p>
        </div>
        <div className="c-pagehead__actions">
          <button type="button" className="c-btn" onClick={() => download(`/records/export.csv?${exportQs}`)}>
            <Icon name="download" className="c-btn__icon" />CSV
          </button>
          <button type="button" className="c-btn" onClick={() => download(`/records/export.xlsx?${exportQs}`)}>
            <Icon name="download" className="c-btn__icon" />Excel
          </button>
        </div>
      </div>

      <div className="c-filters">
        <Select label="Property" value={filters.home} onChange={(v) => set("home", v)}
                options={me.homes.map((h) => [String(h.id), h.label])} />
        <Select label="Participant" value={filters.participant} onChange={(v) => set("participant", v)}
                options={(participants.data ?? []).map((p) => [String(p.id), p.full_name])} />
        <Select label="Shift" value={filters.shift} onChange={(v) => set("shift", v)} options={SHIFTS} />
        <Select label="Range" value={filters.range} onChange={(v) => set("range", v)}
                options={RANGES} allowAll={false} />
        {TRISTATE.map(([key, name]) => (
          <Select key={key} label={name} value={filters[key]} onChange={(v) => set(key, v)}
                  options={[["yes", "Yes"], ["no", "No"], ["blank", "Not recorded"]]} />
        ))}
        {RECORDED.map(([key, name]) => (
          <Select key={key} label={name} value={filters[key]} onChange={(v) => set(key, v)}
                  options={[["yes", "Recorded"], ["no", "Not recorded"]]} />
        ))}
      </div>

      {chips.length > 0 && (
        <div className="c-chips">
          {chips.map((chip) => (
            <span className="c-chip" key={chip.key}>
              {chip.label}
              <button type="button" className="c-chip__remove"
                      aria-label={`Remove filter ${chip.label}`}
                      onClick={() => set(chip.key, chip.key === "range" ? "7" : "")}>
                <Icon name="x" />
              </button>
            </span>
          ))}
          <button type="button" className="c-link-action c-link-action--muted"
                  onClick={() => { setFilters(EMPTY); setPage(1); }}>
            Clear all
          </button>
        </div>
      )}

      {records.isPending && <Loading />}
      {records.isError && <ErrorState error={records.error} onRetry={() => records.refetch()} />}

      {records.data && (
        <div className="c-tablewrap">
          <div className="o-scroll-x">
            <table className="c-table">
              <thead>
                <tr>
                  <th>Date</th><th>Shift</th><th>Property</th><th>Participant</th>
                  <th>Form</th><th>Care worker</th><th>Physio</th><th>Shower</th>
                  <th>Bowel</th><th className="c-table__actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.data.results.map((record) => (
                  <tr key={record.id}>
                    <td data-label="Date" className="u-nowrap">{shortDate(record.service_date)}</td>
                    <td data-label="Shift">{record.shift_label.replace(" shift", "")}</td>
                    <td data-label="Property">{record.home_label}</td>
                    <td data-label="Participant" className="c-table__name">{record.participant_name}</td>
                    <td data-label="Form">
                      <span className="c-formbadge">DCN</span>
                      {record.status === "not_required" && <span className="c-pill c-pill--none">N/R</span>}
                    </td>
                    <td data-label="Care worker">{record.submitted_by_name ?? record.created_by_name}</td>
                    <td data-label="Physio">{tri(record.physio_completed)}</td>
                    <td data-label="Shower">{tri(record.shower)}</td>
                    <td data-label="Bowel">
                      {record.bowel_recorded ? "Recorded" : <span className="u-faint">Not recorded</span>}
                    </td>
                    <td data-label="" className="c-table__actions">
                      <Link to={`/records/${record.id}`}>View</Link>
                      {record.has_pdf && (
                        <>
                          {" · "}
                          <button type="button" className="c-link-action"
                                  style={{ minHeight: "auto", padding: 0 }}
                                  onClick={() => download(`/records/${record.id}/pdf/`)}>
                            PDF
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {records.data.results.length === 0 && (
                  <tr>
                    <td colSpan={10} className="c-empty-cell">
                      <EmptyState icon="file" title="No records match these filters"
                                  body="Try widening the date range or clearing a filter." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="c-tablefoot">
            <span>{records.data.count} record{records.data.count === 1 ? "" : "s"}</span>
            <span className="c-tablefoot__end">
              <span className="u-nums">Page {page} of {Math.max(totalPages, 1)}</span>
              <button type="button" className="c-pagebtn" aria-label="Previous page"
                      aria-disabled={!records.data.previous}
                      onClick={() => records.data?.previous && setPage((p) => p - 1)}>
                <Icon name="chevron-left" />
              </button>
              <button type="button" className="c-pagebtn" aria-label="Next page"
                      aria-disabled={!records.data.next}
                      onClick={() => records.data?.next && setPage((p) => p + 1)}>
                <Icon name="chevron-right" />
              </button>
            </span>
          </div>
        </div>
      )}
    </AppFrame>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  allowAll = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: (string[] | [string, string])[];
  allowAll?: boolean;
}) {
  const id = `f-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <>
      <label className="u-visually-hidden" htmlFor={id}>{label}</label>
      <select className="c-select" id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {allowAll && <option value="">{label}: All</option>}
        {options.map(([v, text]) => (
          <option key={v} value={v}>{allowAll ? `${label}: ${text}` : text}</option>
        ))}
      </select>
    </>
  );
}

function tri(value: boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return <span className="u-faint">&mdash;</span>;
}

function label(key: string): string {
  const names: Record<string, string> = {
    home: "Property", participant: "Participant", worker: "Care worker", shift: "Shift",
    range: "Range", physio: "Physio", shower: "Shower", bed_bath: "Bed bath",
    bowel: "Bowel", urine: "Urine", fluids: "Fluids",
  };
  return names[key] ?? key;
}

function choiceLabel(key: string, value: string, participants?: Participant[]): string {
  if (key === "participant") {
    return participants?.find((p) => String(p.id) === value)?.full_name ?? value;
  }
  if (key === "range") return RANGES.find(([v]) => v === value)?.[1] ?? value;
  if (key === "shift") return SHIFTS.find(([v]) => v === value)?.[1] ?? value;
  const words: Record<string, string> = { yes: "Yes", no: "No", blank: "Not recorded" };
  return words[value] ?? value;
}
