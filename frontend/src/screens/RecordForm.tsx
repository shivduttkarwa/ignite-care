import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "../api/client";
import type {
  AttachedForm,
  Attendance,
  CareRecordDetail,
  FormSchema,
  Me,
  SchemaField,
  SchemaSection,
  SchemaSummary,
} from "../api/types";
import { AppFrame } from "../components/AppFrame";
import { Icon } from "../components/Icons";
import { ErrorState, Loading } from "../components/bits";
import { formBadgeClass, mediumDate } from "../lib/format";
import { SchemaFieldControl } from "../components/form/Fields";
import { FormSection } from "../components/form/FormSection";
import { SaveStatus } from "../components/form/SaveStatus";
import { useMe } from "../lib/auth";
import { restoreDraft, useAutosave, wasSaved } from "../lib/autosave";
import { type Answers, isVisible, sectionCounts } from "../lib/schema";

const COMING_LATER = ["Bowel Chart", "Food Chart", "Bruise Chart"];

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

  useEffect(() => {
    if (record.data?.is_locked) navigate(`/records/${record.data.id}`, { replace: true });
  }, [record.data, navigate]);

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
      {record.data && schema.data && !failure && !record.data.is_locked && (
        <Editor
          key={record.data.id}
          record={record.data}
          schema={schema.data}
          me={me}
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

function Editor({
  record,
  schema,
  me,
  onSubmitted,
}: {
  record: CareRecordDetail;
  schema: FormSchema;
  me: Me;
  onSubmitted: (saved: CareRecordDetail) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const storageKey = `ignite:draft:record-${record.id}`;

  const [initial] = useState(() =>
    restoreDraft(storageKey, record.updated_at, { answers: record.answers, rows: record.attendances }),
  );
  const [answers, setAnswers] = useState<Answers>(() => ({ ...initial.value.answers }));
  const [rows, setRows] = useState<Attendance[]>(() => initial.value.rows);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(schema.sections.map((s) => [s.key, true])),
  );

  const schemas = useQuery({
    queryKey: ["schemas"],
    queryFn: () => api.get<SchemaSummary[]>("/schemas/"),
    staleTime: 60 * 60_000,
  });

  const autosave = useAutosave({
    storageKey,
    value: { answers, rows },
    initiallyDirty: initial.restored,
    lastSavedAt: wasSaved(record.created_at, record.updated_at) ? record.updated_at : null,
    save: async (value) => {
      const saved = await api.patch<CareRecordDetail>(`/records/${record.id}/draft/`, {
        answers: value.answers,
        attendances: value.rows,
      });
      queryClient.setQueryData(["record", saved.id], saved);
    },
  });

  const submit = useMutation({
    mutationFn: () => {
      autosave.cancel();
      return api.post<CareRecordDetail>(`/records/${record.id}/submit/`, { answers, attendances: rows });
    },
    onSuccess: (saved) => {
      autosave.stop();
      onSubmitted(saved);
    },
    onError: (error) => {
      const fieldErrors = error instanceof ApiError ? error.fieldErrors : {};
      setErrors(fieldErrors);
      // Open every section holding a problem so nothing hides.
      const holding = schema.sections
        .filter((s) => s.fields.some((f) => fieldErrors[f.key]))
        .map((s) => s.key);
      if (holding.length) {
        setOpen((prev) => ({ ...prev, ...Object.fromEntries(holding.map((k) => [k, true])) }));
      }
    },
  });

  const attach = useMutation({
    mutationFn: async (schemaKey: string) => {
      await autosave.flush();
      return api.post<AttachedForm>(`/records/${record.id}/attachments/`, { schema: schemaKey });
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["record", record.id] });
      navigate(`/records/${record.id}/attachments/${created.id}`);
    },
  });

  const set = (key: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  const errorCount = useMemo(() => Object.values(errors).filter(Boolean).length, [errors]);
  const attachable = (schemas.data ?? []).filter((form) => form.attachable);

  const renderField = (section: SchemaSection, field: SchemaField) => {
    if (field.group) {
      const members = section.fields.filter((member) => member.group === field.group);
      if (members[0] !== field) return null;
      return <TimeRange key={field.group} fields={members} answers={answers} onChange={set} />;
    }
    if (field.type === "repeater") {
      return (
        <Repeater
          key={field.key}
          field={field}
          rows={rows}
          setRows={setRows}
          participant={record.participant_name}
        />
      );
    }
    if (!isVisible(field, answers)) return null;
    return (
      <SchemaFieldControl
        key={field.key}
        field={field}
        value={answers[field.key]}
        error={errors[field.key]}
        onChange={(value) => set(field.key, value)}
        context={{ setAnswer: set }}
      />
    );
  };

  return (
    <form
      className="o-stack"
      onSubmit={(event) => {
        event.preventDefault();
        submit.mutate();
      }}
    >
      <header className="c-formhead">
        <div>
          <p className="c-formhead__name">{record.participant_name}</p>
          <p className="c-formhead__meta">
            {mediumDate(record.service_date)} · {record.shift_label} · {me.full_name}
          </p>
        </div>
        <p className="c-formhead__state">
          <SaveStatus state={autosave.state} savedAt={autosave.savedAt} />
        </p>
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

      {submit.isError && errorCount === 0 && (
        <div className="c-callout c-callout--danger" role="alert">
          <Icon name="alert-circle" />
          <span>{submit.error.message}</span>
        </div>
      )}

      {schema.sections.map((section) => (
        <FormSection
          key={section.key}
          id={`section-${section.key}`}
          title={section.title}
          counts={sectionCounts(section, answers, rows.length)}
          collapsible={schema.collapsible !== false}
          open={open[section.key]}
          onToggle={() => setOpen((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
        >
          {section.fields.map((field) => renderField(section, field))}
        </FormSection>
      ))}

      {(attachable.length > 0 || record.attachments.length > 0) && (
        <section className="c-section">
          <div className="c-section__intro">
            <h2 className="c-section__title">Did anything else happen this shift?</h2>
            <p className="c-field__help">Attach extra forms to this same record.</p>
          </div>
          <div className="c-section__body">
            {record.attachments.map((item) => (
              <Link
                key={item.id}
                className="c-attach"
                to={`/records/${record.id}/attachments/${item.id}`}
              >
                <span className={["c-formbadge", formBadgeClass(item.schema_key)].filter(Boolean).join(" ")}>
                  {item.badge}
                </span>
                <span className="c-attach__text">
                  <strong>{item.label}</strong>
                  {item.description && ` · ${item.description}`}
                </span>
                {item.status === "draft" && <span className="c-pill c-pill--draft">Draft</span>}
                <span className="c-attach__open">Open</span>
              </Link>
            ))}

            {attachable.map((form) => (
              <button
                key={form.key}
                type="button"
                className="c-repeater__add"
                disabled={attach.isPending}
                onClick={() => attach.mutate(form.key)}
              >
                <Icon name="plus" className="c-btn__icon" />
                Add {form.title}
              </button>
            ))}

            {attach.isError && (
              <p className="c-field__error" role="alert">
                <Icon name="alert-circle" />
                {attach.error.message}
              </p>
            )}

            <div className="c-attach__later">
              {COMING_LATER.map((name) => (
                <span key={name} className="c-attach__soon">
                  {name} · coming later
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {schema.footer_note && <p className="c-callout c-callout--strong">{schema.footer_note}</p>}

      <div className="c-actionbar">
        <button
          type="button"
          className="c-btn"
          onClick={() => void autosave.flush()}
          disabled={autosave.state === "saving"}
        >
          {autosave.state === "saving" ? "Saving…" : "Save draft"}
        </button>
        <button type="submit" className="c-btn c-btn--primary" disabled={submit.isPending}>
          {submit.isPending ? "Submitting…" : "Submit record"}
        </button>
      </div>
    </form>
  );
}

function TimeRange({
  fields,
  answers,
  onChange,
}: {
  fields: SchemaField[];
  answers: Answers;
  onChange: (key: string, value: unknown) => void;
}) {
  const [from, to] = fields;
  return (
    <div className="c-field">
      <label className="c-field__label" htmlFor={`f_${from.key}`}>
        {from.label}
      </label>
      <div className="c-timerange">
        <input
          className="c-input c-input--time"
          type="time"
          id={`f_${from.key}`}
          value={(answers[from.key] as string) ?? ""}
          onChange={(e) => onChange(from.key, e.target.value)}
        />
        {to && (
          <>
            <span className="c-timerange__sep">{to.label}</span>
            <input
              className="c-input c-input--time"
              type="time"
              aria-label={`${from.group_label ?? from.label} until`}
              value={(answers[to.key] as string) ?? ""}
              onChange={(e) => onChange(to.key, e.target.value)}
            />
          </>
        )}
      </div>
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
