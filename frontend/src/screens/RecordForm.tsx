/**
 * The daily care record, rendered entirely from the JSON schema.
 *
 * Nothing here knows what a "shower" or a "bowel" is. Add a form to
 * forms/schemas/ on the server and this screen renders it with no release.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "../api/client";
import type { Attendance, CareRecordDetail, FormSchema, SchemaField } from "../api/types";
import { AppFrame } from "../components/AppFrame";
import { Icon } from "../components/Icons";
import { ErrorState, Loading, longDate } from "../components/bits";
import { useMe } from "../lib/auth";

type Answers = Record<string, unknown>;

/* Schema helpers ------------------------------------------------------------ */

function normalise(value: unknown): unknown {
  if (value === true) return "true";
  if (value === false) return "false";
  return value;
}

function isVisible(field: SchemaField, answers: Answers): boolean {
  if (!field.show_if?.all) return true;
  return field.show_if.all.every((clause) => {
    const value = answers[clause.field];
    if ("eq" in clause) return normalise(value) === normalise(clause.eq);
    if ("filled" in clause) return Boolean(value) === clause.filled;
    return true;
  });
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return value !== "";
}

function sectionCounts(fields: SchemaField[], answers: Answers, rows: Attendance[]) {
  let filled = 0;
  let total = 0;
  for (const field of fields) {
    if (!isVisible(field, answers)) continue;
    total += 1;
    if (field.type === "repeater" ? rows.length > 0 : isFilled(answers[field.key])) filled += 1;
  }
  return { filled, total };
}

/* Screen -------------------------------------------------------------------- */

export default function RecordForm({ mode }: { mode: "new" | "edit" }) {
  const params = useParams();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const [recordId, setRecordId] = useState<number | null>(
    mode === "edit" ? Number(params.id) : null,
  );

  // Opening the form for a participant either creates the shift's draft or
  // returns the one already open.
  const start = useMutation({
    mutationFn: () => api.post<CareRecordDetail>("/records/start/", { participant: Number(params.id) }),
    onSuccess: (record) => {
      if (record.is_locked) navigate(`/records/${record.id}`, { replace: true });
      else setRecordId(record.id);
    },
  });

  const started = useRef(false);
  useEffect(() => {
    if (mode === "new" && !started.current) {
      started.current = true;
      start.mutate();
    }
  }, [mode, start]);

  const record = useQuery({
    queryKey: ["record", recordId],
    queryFn: () => api.get<CareRecordDetail>(`/records/${recordId}/`),
    enabled: recordId !== null,
  });

  const schema = useQuery({
    queryKey: ["schema", record.data?.schema_key, record.data?.schema_version],
    queryFn: () =>
      api.get<FormSchema>(`/schemas/${record.data!.schema_key}/${record.data!.schema_version}/`),
    enabled: !!record.data,
    staleTime: 60 * 60_000,
  });

  if (!me) return null;

  const busy = start.isPending || record.isPending || schema.isPending;
  const failure = start.error ?? record.error ?? schema.error;

  return (
    <AppFrame
      me={me}
      title={schema.data?.title ?? "Care record"}
      narrow
      back={{
        to: record.data ? `/participants/${record.data.participant}` : "/",
        label: "Back to participant",
      }}
    >
      {failure && <ErrorState error={failure} />}
      {busy && !failure && <Loading label="Opening the record" />}
      {record.data && schema.data && !failure && (
        <Editor
          record={record.data}
          schema={schema.data}
          onSubmitted={(saved) => {
            queryClient.setQueryData(["record", saved.id], saved);
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            queryClient.invalidateQueries({ queryKey: ["participant-records"] });
            navigate(`/records/${saved.id}`, { replace: true });
          }}
        />
      )}
    </AppFrame>
  );
}

/* Editor -------------------------------------------------------------------- */

function Editor({
  record,
  schema,
  onSubmitted,
}: {
  record: CareRecordDetail;
  schema: FormSchema;
  onSubmitted: (saved: CareRecordDetail) => void;
}) {
  const [answers, setAnswers] = useState<Answers>(() => ({ ...record.answers }));
  const [rows, setRows] = useState<Attendance[]>(() => record.attendances ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(schema.sections.map((s) => [s.key, true])),
  );
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const queryClient = useQueryClient();

  const draftKey = `ignite:draft:record-${record.id}`;

  // A dropped connection mid-shift must not lose what was typed.
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ answers, rows, at: Date.now() }));
    } catch {
      /* private mode, or storage full - the server copy is still authoritative */
    }
  }, [answers, rows, draftKey]);

  const save = useMutation({
    mutationFn: () => api.patch<CareRecordDetail>(`/records/${record.id}/draft/`, { answers, attendances: rows }),
    onSuccess: (saved) => {
      setSavedAt(new Date());
      queryClient.setQueryData(["record", saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const submit = useMutation({
    mutationFn: () =>
      api.post<CareRecordDetail>(`/records/${record.id}/submit/`, { answers, attendances: rows }),
    onSuccess: (saved) => {
      try {
        localStorage.removeItem(draftKey);
      } catch { /* nothing to clear */ }
      onSubmitted(saved);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        // Open every section holding a problem so nothing hides.
        const holding = schema.sections
          .filter((s) => s.fields.some((f) => error.fieldErrors[f.key]))
          .map((s) => s.key);
        if (holding.length) setOpen((prev) => ({ ...prev, ...Object.fromEntries(holding.map((k) => [k, true])) }));
      }
    },
  });

  const set = (key: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  const errorCount = useMemo(
    () => Object.values(errors).filter(Boolean).length,
    [errors],
  );

  return (
    <form
      className="o-stack"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      <header className="c-formhead">
        <div>
          <p className="c-formhead__name">{record.participant_name}</p>
          <p className="c-formhead__meta">
            {longDate(record.service_date)} · {record.shift_label}
          </p>
        </div>
        {savedAt && (
          <p className="c-formhead__state">
            <span className="c-savestate">
              <Icon name="check" />
              Draft saved
            </span>
          </p>
        )}
      </header>

      {errorCount > 0 && (
        <div className="c-callout c-callout--danger" role="alert">
          <Icon name="alert-circle" />
          <span>
            {errorCount} question{errorCount === 1 ? "" : "s"} still need
            {errorCount === 1 ? "s" : ""} an answer before this record can be submitted.
          </span>
        </div>
      )}

      {schema.sections.map((section) => {
        const counts = sectionCounts(section.fields, answers, rows);
        const done = counts.total > 0 && counts.filled === counts.total;
        return (
          <section key={section.key} className="c-section">
            <button
              type="button"
              className="c-section__toggle"
              aria-expanded={open[section.key]}
              aria-controls={`section-${section.key}`}
              onClick={() => setOpen((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
            >
              <span className="c-section__title">{section.title}</span>
              <span className={`c-section__count${done ? " c-section__count--done" : ""}`}>
                {counts.filled} of {counts.total} answered
              </span>
              <Icon name="chevron-down" className="c-section__chevron" />
            </button>

            {open[section.key] && (
              <div className="c-section__body" id={`section-${section.key}`}>
                {section.fields.map((field) => {
                  if (field.group === "sleep" && field.key !== "sleep_from") return null;
                  if (field.group === "sleep") {
                    return (
                      <div className="c-field" key={field.key}>
                        <label className="c-field__label" htmlFor="sleep_from">{field.label}</label>
                        <div className="c-timerange">
                          <input className="c-input c-input--time" type="time" id="sleep_from"
                                 value={(answers.sleep_from as string) ?? ""}
                                 onChange={(e) => set("sleep_from", e.target.value)} />
                          <span className="c-timerange__sep">to</span>
                          <input className="c-input c-input--time" type="time" aria-label="Slept until"
                                 value={(answers.sleep_to as string) ?? ""}
                                 onChange={(e) => set("sleep_to", e.target.value)} />
                        </div>
                      </div>
                    );
                  }
                  if (field.type === "repeater") {
                    return (
                      <Repeater key={field.key} field={field} rows={rows} setRows={setRows}
                                participant={record.participant_name} />
                    );
                  }
                  if (!isVisible(field, answers)) return null;
                  return (
                    <Field key={field.key} field={field} value={answers[field.key]}
                           error={errors[field.key]} onChange={(v) => set(field.key, v)} />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <div className="c-callout">
        <Icon name="alert-circle" />
        <span>{schema.footer_note}</span>
      </div>

      <div className="c-actionbar">
        <button type="button" className="c-btn" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save draft"}
        </button>
        <button type="submit" className="c-btn c-btn--primary" disabled={submit.isPending}>
          {submit.isPending ? "Submitting…" : "Submit record"}
        </button>
      </div>
    </form>
  );
}

/* Fields --------------------------------------------------------------------- */

function Field({
  field,
  value,
  error,
  onChange,
}: {
  field: SchemaField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const invalid = Boolean(error);
  const describedBy = invalid ? `${field.key}_error` : undefined;

  return (
    <div className={`c-field${invalid ? " c-field--invalid" : ""}`}>
      {field.type === "yesno" ? (
        <fieldset>
          <legend className="c-field__label">
            {field.label}
            {field.required && <span aria-hidden="true"> *</span>}
          </legend>
          <div className="c-yesno">
            {[
              { v: "true", label: "Yes" },
              { v: "false", label: "No" },
            ].map((option) => (
              <div className="c-yesno__option" key={option.v}>
                <input
                  className="c-yesno__input"
                  type="radio"
                  id={`${field.key}_${option.v}`}
                  name={field.key}
                  value={option.v}
                  checked={normalise(value) === option.v}
                  onChange={() => onChange(option.v)}
                  aria-describedby={describedBy}
                />
                <label className="c-yesno__face" htmlFor={`${field.key}_${option.v}`}>
                  <Icon name="check" />
                  {option.label}
                </label>
              </div>
            ))}
          </div>
        </fieldset>
      ) : (
        <>
          <label className="c-field__label" htmlFor={`f_${field.key}`}>
            {field.label}
            {field.required && <span aria-hidden="true"> *</span>}
          </label>
          {field.type === "textarea" ? (
            <textarea
              className="c-textarea"
              id={`f_${field.key}`}
              rows={2}
              placeholder={field.placeholder}
              value={(value as string) ?? ""}
              onChange={(e) => onChange(e.target.value)}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            />
          ) : (
            <input
              className={`c-input${field.type === "time" ? " c-input--time" : ""}`}
              id={`f_${field.key}`}
              type={field.type === "number" ? "number" : field.type === "time" ? "time" : "text"}
              inputMode={field.type === "number" ? "numeric" : undefined}
              placeholder={field.placeholder}
              value={(value as string) ?? ""}
              onChange={(e) => onChange(e.target.value)}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            />
          )}
        </>
      )}

      {field.help && <p className="c-field__help">{field.help}</p>}
      {error && (
        <p className="c-field__error" id={`${field.key}_error`} role="alert">
          <Icon name="alert-circle" />
          {error}
        </p>
      )}
    </div>
  );
}

function Repeater({
  field,
  rows,
  setRows,
  participant,
}: {
  field: SchemaField;
  rows: Attendance[];
  setRows: (rows: Attendance[]) => void;
  participant: string;
}) {
  const label = field.label.replace("{participant}", participant.split(" ")[0]);

  return (
    <div className="c-field">
      <p className="c-field__label">{label}</p>
      {field.help && <p className="c-field__help">{field.help}</p>}

      <div className="c-repeater">
        {rows.map((row, index) => (
          <div className="c-repeater__row" key={index}>
            <input className="c-input c-input--time" type="time" value={row.time}
                   aria-label={`Attendance ${index + 1} time`}
                   onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, time: e.target.value } : r)))} />
            <input className="c-input" type="text" placeholder="Purpose" value={row.purpose}
                   aria-label={`Attendance ${index + 1} purpose`}
                   onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, purpose: e.target.value } : r)))} />
            <input className="c-input" type="number" inputMode="numeric" placeholder="min" min={1} max={480}
                   value={row.duration_minutes}
                   aria-label={`Attendance ${index + 1} duration in minutes`}
                   onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, duration_minutes: e.target.value } : r)))} />
            <button type="button" className="c-repeater__remove"
                    aria-label={`Remove attendance ${index + 1}`}
                    onClick={() => setRows(rows.filter((_, i) => i !== index))}>
              <Icon name="trash" />
            </button>
          </div>
        ))}

        <button type="button" className="c-repeater__add"
                onClick={() => setRows([...rows, { time: "", purpose: "", duration_minutes: "" }])}>
          <Icon name="plus" style={{ width: "1rem", height: "1rem" }} />
          {field.add_label ?? "Add row"}
        </button>
      </div>
    </div>
  );
}
