import type { CareRecordDetail, FormSchema, SchemaField } from "../api/types";
import { YesNoBoxes } from "./bits";
import { longDate, timeText } from "../lib/format";

function shown(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return <span className="c-paper__off">Not recorded</span>;
  }
  return String(value);
}

function SectionAnswers({ fields, answers }: { fields: SchemaField[]; answers: Record<string, unknown> }) {
  const lines = fields.filter((field) => field.type === "yesno");
  const rows = fields.filter((field) => !["yesno", "repeater", "notice"].includes(field.type));
  const grouped = new Set<string>();

  return (
    <>
      {lines.map((field) => (
        <p key={field.key} className="c-paper__line">
          {field.label} <YesNoBoxes value={answers[field.key]} />
        </p>
      ))}
      {rows.length > 0 && (
        <table>
          <tbody>
            {rows.map((field) => {
              if (field.group) {
                if (grouped.has(field.group)) return null;
                grouped.add(field.group);
                const values = rows
                  .filter((member) => member.group === field.group)
                  .map((member) => answers[member.key])
                  .filter(Boolean)
                  .map((item) => timeText(String(item)));
                return (
                  <tr key={field.group}>
                    <th>{field.group_label ?? field.label}</th>
                    <td>{values.length ? values.join(" to ") : shown(null)}</td>
                  </tr>
                );
              }
              const value = answers[field.key];
              return (
                <tr key={field.key}>
                  <th>{field.label}</th>
                  <td>{shown(field.type === "time" && value ? timeText(String(value)) : value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
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

      <table>
        <tbody>
          <tr>
            <th>Participant</th>
            <td>{record.participant_name}</td>
          </tr>
          <tr>
            <th>Date</th>
            <td>{longDate(record.service_date)}</td>
          </tr>
          <tr>
            <th>Name of staff on shift</th>
            <td>{record.submitted_by_name ?? record.created_by_name}</td>
          </tr>
        </tbody>
      </table>

      {sections.map((section) => (
        <div key={section.key}>
          <h4>{section.title}</h4>
          <SectionAnswers fields={section.fields} answers={record.answers} />
        </div>
      ))}

      {!preview && record.attendances.length > 0 && (
        <table>
          <thead>
            <tr>
              <th style={{ width: "22%" }}>Time</th>
              <th style={{ width: "56%" }}>Purpose</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {record.attendances.map((row, index) => (
              <tr key={index}>
                <td>{timeText(row.time)}</td>
                <td>{row.purpose}</td>
                <td>{row.duration_minutes} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!preview && attached.length > 0 && (
        <div>
          <h4>Attached forms</h4>
          {attached.map((item) => (
            <p key={item.id} className="c-paper__line">
              <strong>{item.label}</strong>
              {item.description && ` · ${item.description}`}
            </p>
          ))}
        </div>
      )}

      {preview && (
        <p className="c-paper__note">
          The full record continues in the PDF, laid out exactly like the paper form.
        </p>
      )}
    </div>
  );
}
