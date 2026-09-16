import type { CareRecordDetail, FormSchema, SchemaField, SchemaSection } from "../api/types";
import { YesNoBoxes } from "./bits";
import { longDate, timeText } from "../lib/format";

type Answers = Record<string, unknown>;

function firstName(fullName: string) {
  return fullName.split(" ")[0];
}

function Ink({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="c-paper__off">Not recorded</span>;
  }
  return <span className="c-paper__ink">{String(value)}</span>;
}

function FieldLine({
  field,
  fields,
  record,
}: {
  field: SchemaField;
  fields: SchemaField[];
  record: CareRecordDetail;
}) {
  const answers: Answers = record.answers;

  if (field.type === "yesno") {
    return (
      <p className="c-paper__line">
        {field.label} <YesNoBoxes value={answers[field.key]} />
      </p>
    );
  }

  if (field.group) {
    const values = fields
      .filter((member) => member.group === field.group)
      .map((member) => answers[member.key])
      .filter(Boolean)
      .map((value) => timeText(String(value)));
    return (
      <p className="c-paper__line">
        {field.label} <Ink value={values.join(" to ")} />
      </p>
    );
  }

  const value = answers[field.key];
  return (
    <p className="c-paper__line">
      {field.label.replace("{participant}", firstName(record.participant_name))}{" "}
      <Ink value={field.type === "time" && value ? timeText(String(value)) : value} />
    </p>
  );
}

function Attendances({ field, record }: { field: SchemaField; record: CareRecordDetail }) {
  return (
    <>
      <p>{field.label.replace("{participant}", firstName(record.participant_name))}</p>
      {record.attendances.length > 0 ? (
        <ul className="c-paper__list">
          {record.attendances.map((row, index) => (
            <li key={index}>
              {timeText(row.time)} – {row.purpose} – {row.duration_minutes} min
            </li>
          ))}
        </ul>
      ) : (
        <p className="c-paper__off">None recorded.</p>
      )}
    </>
  );
}

function Section({ section, record }: { section: SchemaSection; record: CareRecordDetail }) {
  const fields = section.fields.filter((field) => field.type !== "notice");
  const seen = new Set<string>();
  const simple: SchemaField[] = [];
  const repeaters: SchemaField[] = [];

  for (const field of fields) {
    if (field.type === "repeater") {
      repeaters.push(field);
      continue;
    }
    if (field.group) {
      if (seen.has(field.group)) continue;
      seen.add(field.group);
    }
    simple.push(field);
  }

  const lines = simple.map((field) => (
    <FieldLine key={field.key} field={field} fields={fields} record={record} />
  ));

  return (
    <div className="c-paper__block">
      <p className="c-paper__lead">{section.title}:</p>
      {section.pdf_layout === "inline" ? (
        <div className="c-paper__plain">{lines}</div>
      ) : (
        <div className="c-paper__stack">
          {section.pdf_layout === "overnight" ? (
            lines.length > 0 && <div className="c-paper__cell">{lines}</div>
          ) : (
            simple.map((field, index) => (
              <div key={field.key} className="c-paper__cell">
                {lines[index]}
              </div>
            ))
          )}
          {repeaters.map((field) => (
            <div key={field.key} className="c-paper__cell">
              <Attendances field={field} record={record} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PaperRecord({
  record,
  schema,
  preview = false,
}: {
  record: CareRecordDetail;
  schema: FormSchema;
  preview?: boolean;
}) {
  const sections = preview ? schema.sections.slice(0, 2) : schema.sections;
  const attached = record.attachments.filter((item) => item.status === "submitted");

  return (
    <div className="c-paper">
      <p className="c-paper__title">{schema.title}</p>

      <div className="c-paper__stack">
        <div className="c-paper__cell">
          <strong>Participant:</strong>{" "}
          <span className="c-paper__ink">{record.participant_name}</span>
        </div>
        <div className="c-paper__cell">
          <strong>Date:</strong>{" "}
          <span className="c-paper__ink">{longDate(record.service_date)}</span>
        </div>
        <div className="c-paper__cell">
          <strong>Name of staff on shift:</strong>{" "}
          <span className="c-paper__ink">{record.submitted_by_name ?? record.created_by_name}</span>
        </div>
      </div>

      {sections.map((section) => (
        <Section key={section.key} section={section} record={record} />
      ))}

      {!preview && attached.length > 0 && (
        <div className="c-paper__block">
          <p className="c-paper__lead">Attached charts:</p>
          {attached.map((item) => (
            <p key={item.id} className="c-paper__line">
              <strong>{item.label}</strong>
              {item.description && ` · ${item.description}`}
            </p>
          ))}
        </div>
      )}

      {!preview && schema.footer_note && <p className="c-paper__footnote">{schema.footer_note}</p>}

      {preview && (
        <p className="c-paper__note">
          The full record continues in the PDF, laid out exactly like the paper form.
        </p>
      )}
    </div>
  );
}
