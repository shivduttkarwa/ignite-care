import type { SchemaField, SchemaSection } from "../api/types";

export type Answers = Record<string, unknown>;

export function normalise(value: unknown): unknown {
  if (value === true) return "true";
  if (value === false) return "false";
  return value;
}

export function isVisible(field: SchemaField, answers: Answers): boolean {
  if (!field.show_if?.all) return true;
  return field.show_if.all.every((clause) => {
    const value = answers[clause.field];
    if ("eq" in clause) return normalise(value) === normalise(clause.eq);
    if ("filled" in clause) return Boolean(value) === clause.filled;
    return true;
  });
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
