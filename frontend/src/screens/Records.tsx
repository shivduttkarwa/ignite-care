import { useCallback, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api, download } from "../api/client";
import type { CareRecord, Paginated, Participant, SchemaSummary, Worker } from "../api/types";
import { AppFrame } from "../components/AppFrame";
import { Icon } from "../components/Icons";
import { RecordDrawer } from "../components/RecordDrawer";
import { EmptyState, ErrorState, FormBadges, Loading } from "../components/bits";
import { shortDate } from "../lib/format";
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

const PAGE_SIZES = [10, 25, 50, 100];

type Filters = Record<string, string>;

const EMPTY: Filters = {
  home: "", participant: "", worker: "", form: "", shift: "", range: "7",
  physio: "", shower: "", bed_bath: "", bowel: "", urine: "", fluids: "",
};

export default function Records() {
  const { data: me } = useMe();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [drawer, setDrawer] = useState<number | null>(null);
  const closeDrawer = useCallback(() => setDrawer(null), []);

  const filterQs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v) as [string, string][],
  ).toString();
  const listQs = `${filterQs}${filterQs ? "&" : ""}page=${page}&page_size=${pageSize}`;

  const records = useQuery({
    queryKey: ["records", listQs],
    queryFn: () => api.get<Paginated<CareRecord>>(`/records/?${listQs}`),
    placeholderData: keepPreviousData,
  });

  const participants = useQuery({
    queryKey: ["participants", "", ""],
    queryFn: () => api.get<Participant[]>("/participants/"),
  });

  const workers = useQuery({
    queryKey: ["workers"],
    queryFn: () => api.get<Worker[]>("/workers/"),
  });

  const schemas = useQuery({
    queryKey: ["schemas"],
    queryFn: () => api.get<SchemaSummary[]>("/schemas/"),
    staleTime: 60 * 60_000,
  });

  if (!me) return null;

  const set = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
    setSelected(new Set());
  };

  const names: Record<string, (value: string) => string> = {
    home: (value) => me.homes.find((h) => String(h.id) === value)?.label ?? value,
    participant: (value) => participants.data?.find((p) => String(p.id) === value)?.full_name ?? value,
    worker: (value) => workers.data?.find((w) => String(w.id) === value)?.full_name ?? value,
    form: (value) => schemas.data?.find((s) => s.key === value)?.short_title ?? value,
  };

  const chips = Object.entries(filters)
    .filter(([key, value]) => value && !(key === "range" && value === "7"))
    .map(([key, value]) => ({ key, label: `${label(key)}: ${choiceLabel(key, value, names)}` }));

  const rows = records.data?.results ?? [];
  const count = records.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const first = count ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, count);
  const pageIds = rows.map((record) => record.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));
  const selection = [...selected].map((id) => `id=${id}`).join("&");

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of pageIds) {
        if (allOnPage) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  return (
    <AppFrame me={me} title="Records">
      <div className="c-pagehead">
        <div>
          <h1 className="c-pagehead__title">Records</h1>
          <p className="c-pagehead__sub">
            {count} record{count === 1 ? "" : "s"} match the current filters.
          </p>
        </div>
        <div className="c-pagehead__actions">
          <button type="button" className="c-btn" onClick={() => download(`/records/export.csv?${filterQs}`)}>
            <Icon name="download" className="c-btn__icon" />CSV
          </button>
          <button type="button" className="c-btn" onClick={() => download(`/records/export.xlsx?${filterQs}`)}>
            <Icon name="download" className="c-btn__icon" />Excel
          </button>
        </div>
      </div>

      <div className="c-filters">
        <Select label="Property" value={filters.home} onChange={(v) => set("home", v)}
                options={me.homes.map((h) => [String(h.id), h.label])} />
        <Select label="Participant" value={filters.participant} onChange={(v) => set("participant", v)}
                options={(participants.data ?? []).map((p) => [String(p.id), p.full_name])} />
        <Select label="Care worker" value={filters.worker} onChange={(v) => set("worker", v)}
                options={(workers.data ?? []).map((w) => [String(w.id), w.full_name])} />
        <Select label="Form type" value={filters.form} onChange={(v) => set("form", v)}
                options={(schemas.data ?? []).map((s) => [s.key, s.short_title])} />
        <Select label="Range" value={filters.range} onChange={(v) => set("range", v)}
                options={RANGES} allowAll={false} />
        <Select label="Shift" value={filters.shift} onChange={(v) => set("shift", v)} options={SHIFTS} />
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
                  onClick={() => { setFilters(EMPTY); setPage(1); setSelected(new Set()); }}>
            Clear all
          </button>
        </div>
      )}

      {records.isPending && <Loading />}
      {records.isError && <ErrorState error={records.error} onRetry={() => records.refetch()} />}

      {records.data && (
        <div className="c-tablewrap">
          {selected.size > 0 && (
            <div className="c-bulkbar">
              <span>{selected.size} selected</span>
              <button type="button" className="c-btn" onClick={() => download(`/records/export.xlsx?${selection}`)}>
                Export to XLSX
              </button>
              <button type="button" className="c-btn" onClick={() => download(`/records/export.csv?${selection}`)}>
                Export to CSV
              </button>
              <button type="button" className="c-btn" onClick={() => download(`/records/selection.pdf?${selection}`)}>
                Download as one PDF
              </button>
              <span className="c-bulkbar__end">
                <button type="button" className="c-link-action c-bulkbar__deselect"
                        onClick={() => setSelected(new Set())}>
                  Deselect
                </button>
              </span>
            </div>
          )}

          <div className="o-scroll-x">
            <table className="c-table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" className="c-check" aria-label="Select every record on this page"
                           checked={allOnPage} onChange={togglePage} disabled={records.isPlaceholderData}
                           ref={(input) => { if (input) input.indeterminate = someOnPage && !allOnPage; }} />
                  </th>
                  <th>Date <span aria-hidden="true">↓</span></th>
                  <th>Shift</th><th>Property</th><th>Participant</th><th>Forms</th>
                  <th>Care worker</th><th>Physio</th><th>Shower</th><th>Bowel</th>
                  <th className="c-table__actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((record) => (
                  <tr key={record.id} aria-selected={selected.has(record.id)}>
                    <td data-label="">
                      <input type="checkbox" className="c-check"
                             aria-label={`Select ${record.participant_name}, ${shortDate(record.service_date)}, ${record.shift_label}`}
                             checked={selected.has(record.id)} onChange={() => toggle(record.id)}
                             disabled={records.isPlaceholderData} />
                    </td>
                    <td data-label="Date" className="u-nowrap">{shortDate(record.service_date)}</td>
                    <td data-label="Shift">{record.shift_label.replace(" shift", "")}</td>
                    <td data-label="Property">{record.home_label}</td>
                    <td data-label="Participant" className="c-table__name">{record.participant_name}</td>
                    <td data-label="Forms">
                      <span className="c-formstack">
                        <FormBadges forms={record.forms} />
                        {record.status === "not_required" && <span className="c-pill c-pill--none">N/R</span>}
                      </span>
                    </td>
                    <td data-label="Care worker">{record.submitted_by_name ?? record.created_by_name}</td>
                    <td data-label="Physio">{tri(record.physio_completed)}</td>
                    <td data-label="Shower">{tri(record.shower)}</td>
                    <td data-label="Bowel">
                      {record.bowel_recorded ? "Recorded" : <span className="u-faint">Not recorded</span>}
                    </td>
                    <td data-label="" className="c-table__actions">
                      <button type="button" className="c-link-action c-link-action--inline"
                              onClick={() => setDrawer(record.id)}>
                        View
                      </button>
                      {record.has_pdf && (
                        <>
                          {" · "}
                          <button type="button" className="c-link-action c-link-action--inline"
                                  onClick={() => download(`/records/${record.id}/pdf/`)}>
                            PDF
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="c-empty-cell">
                      <EmptyState icon="file" title="No records match these filters"
                                  body="Try widening the date range or clearing a filter." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="c-tablefoot">
            <span>{count} record{count === 1 ? "" : "s"}</span>
            <span className="c-tablefoot__end">
              <label className="c-tablefoot__label" htmlFor="page-size">Rows per page</label>
              <select id="page-size" className="c-select c-select--compact" value={pageSize}
                      onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
              <span className="u-nums">{first}–{last} of {count}</span>
              <button type="button" className="c-pagebtn" aria-label="Previous page"
                      aria-disabled={page <= 1}
                      onClick={() => page > 1 && setPage((p) => p - 1)}>
                <Icon name="chevron-left" />
              </button>
              <button type="button" className="c-pagebtn" aria-label="Next page"
                      aria-disabled={page >= totalPages}
                      onClick={() => page < totalPages && setPage((p) => p + 1)}>
                <Icon name="chevron-right" />
              </button>
            </span>
          </div>
        </div>
      )}

      {drawer !== null && <RecordDrawer id={drawer} onClose={closeDrawer} />}
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
    home: "Property", participant: "Participant", worker: "Care worker", form: "Form type",
    shift: "Shift", range: "Range", physio: "Physio", shower: "Shower", bed_bath: "Bed bath",
    bowel: "Bowel", urine: "Urine", fluids: "Fluids",
  };
  return names[key] ?? key;
}

function choiceLabel(
  key: string,
  value: string,
  names: Record<string, (value: string) => string>,
): string {
  if (names[key]) return names[key](value);
  if (key === "range") return RANGES.find(([v]) => v === value)?.[1] ?? value;
  if (key === "shift") return SHIFTS.find(([v]) => v === value)?.[1] ?? value;
  const words: Record<string, string> = { yes: "Yes", no: "No", blank: "Not recorded" };
  return words[value] ?? value;
}
