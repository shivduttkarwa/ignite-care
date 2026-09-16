import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "../api/client";
import type { AttachedForm, FormSchema, Me } from "../api/types";
import { AppFrame } from "../components/AppFrame";
import { Icon } from "../components/Icons";
import { ErrorState, Loading } from "../components/bits";
import { mediumDate } from "../lib/format";
import { SchemaFieldControl } from "../components/form/Fields";
import { FormSection } from "../components/form/FormSection";
import { SaveStatus } from "../components/form/SaveStatus";
import { useMe } from "../lib/auth";
import { restoreDraft, useAutosave, wasSaved } from "../lib/autosave";
import { type Answers, isVisible, withRequired } from "../lib/schema";

export default function AttachmentForm() {
  const { recordId, id } = useParams();
  const { data: me } = useMe();

  const attachment = useQuery({
    queryKey: ["attachment", Number(id)],
    queryFn: () => api.get<AttachedForm>(`/attachments/${id}/`),
  });

  const schema = useQuery({
    queryKey: ["schema", attachment.data?.schema_key, attachment.data?.schema_version],
    queryFn: () =>
      api.get<FormSchema>(
        `/schemas/${attachment.data!.schema_key}/${attachment.data!.schema_version}/`,
      ),
    enabled: !!attachment.data,
    staleTime: 60 * 60_000,
  });

  if (!me) return null;

  const failure = attachment.error ?? schema.error;
  const back =
    attachment.data && attachment.data.record_status !== "draft"
      ? `/records/${recordId}`
      : `/records/${recordId}/edit`;

  return (
    <AppFrame
      me={me}
      title={schema.data?.title ?? "Chart"}
      narrow
      back={{ to: back, label: "Back to the care record" }}
    >
      {failure && <ErrorState error={failure} />}
      {!failure && (attachment.isPending || schema.isPending) && <Loading label="Opening the chart" />}
      {attachment.data && schema.data && !failure && (
        <ChartEditor
          key={attachment.data.id}
          attachment={attachment.data}
          schema={schema.data}
          me={me}
          back={back}
        />
      )}
    </AppFrame>
  );
}

function ChartEditor({
  attachment,
  schema,
  me,
  back,
}: {
  attachment: AttachedForm;
  schema: FormSchema;
  me: Me;
  back: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const editable = attachment.is_editable;
  const storageKey = `ignite:draft:attachment-${attachment.id}`;

  const [initial] = useState(() =>
    editable
      ? restoreDraft(storageKey, attachment.updated_at, attachment.answers)
      : { value: attachment.answers, restored: false },
  );
  const [answers, setAnswers] = useState<Answers>(() => ({ ...initial.value }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const autosave = useAutosave({
    storageKey,
    value: answers,
    enabled: editable,
    initiallyDirty: initial.restored,
    lastSavedAt: wasSaved(attachment.created_at, attachment.updated_at) ? attachment.updated_at : null,
    save: (value) => api.patch<AttachedForm>(`/attachments/${attachment.id}/draft/`, { answers: value }),
  });

  const set = (key: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  const submit = useMutation({
    mutationFn: async (another: boolean) => {
      autosave.cancel();
      await api.post<AttachedForm>(`/attachments/${attachment.id}/submit/`, { answers });
      autosave.stop();
      queryClient.invalidateQueries({ queryKey: ["record", attachment.record] });
      queryClient.removeQueries({ queryKey: ["attachment", attachment.id] });
      if (!another) {
        navigate(back, { replace: true });
        return;
      }
      const next = await api.post<AttachedForm>(`/records/${attachment.record}/attachments/`, {
        schema: attachment.schema_key,
      });
      navigate(`/records/${attachment.record}/attachments/${next.id}`, { replace: true });
    },
    onError: (error) => {
      setErrors(error instanceof ApiError ? error.fieldErrors : {});
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  const discard = useMutation({
    mutationFn: () => api.delete(`/attachments/${attachment.id}/`),
    onSuccess: () => {
      autosave.stop();
      queryClient.invalidateQueries({ queryKey: ["record", attachment.record] });
      navigate(back, { replace: true });
    },
  });

  const errorCount = Object.values(errors).filter(Boolean).length;
  const observer = String(answers.observer_name || me.full_name);
  const itemName = (schema.item_label ?? "form").toLowerCase();

  return (
    <form
      className="o-stack"
      onSubmit={(event) => {
        event.preventDefault();
        submit.mutate(false);
      }}
    >
      <header className="c-formhead">
        <div>
          <p className="c-formhead__name">{attachment.participant_name}</p>
          <p className="c-formhead__meta">
            {mediumDate(attachment.service_date)} · Observer: {observer}
          </p>
          {schema.instruction && (
            <p className="c-formhead__hint">
              <Icon name="clock" />
              {schema.instruction}
            </p>
          )}
        </div>
        {editable && (
          <p className="c-formhead__state">
            <SaveStatus state={autosave.state} savedAt={autosave.savedAt} />
          </p>
        )}
      </header>

      {!editable && (
        <div className="c-callout">
          <Icon name="alert-circle" />
          <span>This chart is part of a submitted care record, so it can no longer change.</span>
        </div>
      )}

      {errorCount > 0 && (
        <div className="c-callout c-callout--danger" role="alert">
          <Icon name="alert-circle" />
          <span>
            {errorCount} question{errorCount === 1 ? "" : "s"} still need
            {errorCount === 1 ? "s" : ""} an answer before this chart can be submitted.
          </span>
        </div>
      )}

      {submit.isError && errorCount === 0 && (
        <div className="c-callout c-callout--danger" role="alert">
          <Icon name="alert-circle" />
          <span>{submit.error.message}</span>
        </div>
      )}

      <fieldset className="o-stack" disabled={!editable}>
        {schema.sections.map((section) => (
          <FormSection
            key={section.key}
            id={`section-${section.key}`}
            title={section.title}
            accent={section.fields.some((field) => field.type === "timer")}
          >
            {section.fields.map((field) =>
              isVisible(field, answers) ? (
                <SchemaFieldControl
                  key={field.key}
                  field={withRequired(field, answers)}
                  value={answers[field.key]}
                  error={errors[field.key]}
                  onChange={(value) => set(field.key, value)}
                  context={{
                    setAnswer: set,
                    observerName: observer,
                    timerKey: `ignite:timer:attachment-${attachment.id}`,
                    readOnly: !editable,
                  }}
                />
              ) : null,
            )}
          </FormSection>
        ))}
      </fieldset>

      {editable && (
        <button
          type="button"
          className="c-link-action c-link-action--muted"
          onClick={() => dialogRef.current?.showModal()}
        >
          Discard {attachment.label}
        </button>
      )}

      {editable && (
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
            {submit.isPending ? "Submitting…" : "Submit"}
          </button>
          <button
            type="button"
            className="c-btn c-actionbar__wide"
            disabled={submit.isPending}
            onClick={() => submit.mutate(true)}
          >
            Submit and add another {itemName}
          </button>
        </div>
      )}

      <dialog className="c-dialog" ref={dialogRef}>
        <div className="c-dialog__head">
          <h2 className="c-dialog__title">Discard {attachment.label}?</h2>
          <p className="c-dialog__sub">
            What has been entered on this chart will be removed. The care record itself is not
            affected.
          </p>
        </div>
        <div className="c-dialog__foot">
          <button type="button" className="c-btn" onClick={() => dialogRef.current?.close()}>
            Keep it
          </button>
          <button
            type="button"
            className="c-btn c-btn--danger"
            disabled={discard.isPending}
            onClick={() => discard.mutate()}
          >
            {discard.isPending ? "Discarding…" : "Discard"}
          </button>
        </div>
      </dialog>
    </form>
  );
}
