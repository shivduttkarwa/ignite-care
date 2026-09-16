import type { SchemaField, SchemaSection, ShowIf } from "../api/types";

export type Answers = Record<string, unknown>;

export function normalise(value: unknown): unknown {
  if (value === true) return "true";
  if (value === false) return "false";
  return value;
}

function matches(rule: ShowIf | undefined, answers: Answers): boolean {
  if (!rule?.all) return true;
  return rule.all.every((clause) => {
    const value = answers[clause.field];
    if ("eq" in clause) return normalise(value) === normalise(clause.eq);
    if ("filled" in clause) return Boolean(value) === clause.filled;
    return true;
  });
}

export function isVisible(field: SchemaField, answers: Answers): boolean {
  return field.show_if ? matches(field.show_if, answers) : true;
}

/** A required_if field stays on the form the way it is printed on paper, and
    only picks up the asterisk once the rule is met. */
export function withRequired(field: SchemaField, answers: Answers): SchemaField {
  if (field.required || !field.required_if) return field;
  return matches(field.required_if, answers) ? { ...field, required: true } : field;
}

export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  return Array.isArray(value) && value.length === 0;
}

export function sectionCounts(section: SchemaSection, answers: Answers, repeaterRows = 0) {
  let filled = 0;
  let total = 0;
  const groups = new Map<string, boolean>();

  for (const field of section.fields) {
    if (field.type === "notice" || !isVisible(field, answers)) continue;
    const done = field.type === "repeater" ? repeaterRows > 0 : !isBlank(answers[field.key]);
    if (field.group) {
      groups.set(field.group, (groups.get(field.group) ?? true) && done);
      continue;
    }
    total += 1;
    if (done) filled += 1;
  }

  for (const done of groups.values()) {
    total += 1;
    if (done) filled += 1;
  }
  return { filled, total };
}
