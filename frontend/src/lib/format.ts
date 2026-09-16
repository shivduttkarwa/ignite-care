const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formBadgeClass(key: string): string {
  return key === "seizure_observation" ? "c-formbadge--seizure" : "";
}

export function clock(iso: string): string {
  const d = new Date(iso);
  const hour = d.getHours() % 12 || 12;
  const minute = String(d.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}${d.getHours() < 12 ? "am" : "pm"}`;
}

export function timeText(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]}${hour < 12 ? "am" : "pm"}`;
}

function dayMonth(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function longDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function shortDate(value: string): string {
  return dayMonth(new Date(`${value}T00:00:00`));
}

export function mediumDate(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  return `${dayMonth(d)} ${d.getFullYear()}`;
}

export function stamp(iso: string): string {
  const d = new Date(iso);
  return `${dayMonth(d)} ${d.getFullYear()}, ${clock(iso)}`;
}

export function dayAndTime(iso: string): string {
  const moment = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (moment.toDateString() === today.toDateString()) return `Today ${clock(iso)}`;
  if (moment.toDateString() === yesterday.toDateString()) return `Yesterday ${clock(iso)}`;
  return `${dayMonth(moment)}, ${clock(iso)}`;
}
