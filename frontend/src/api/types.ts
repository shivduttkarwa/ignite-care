/** Shapes returned by the Django API. Kept flat and close to the JSON. */

export type Home = {
  id: number;
  name: string;
  label: string;
  address?: string;
  participant_count: number;
};

export type ConditionTag = {
  id: number;
  label: string;
  tone: "neutral" | "caution";
};

export type Participant = {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  preferred_name: string;
  initials: string;
  room: string;
  home: number;
  home_label: string;
  tags: ConditionTag[];
  shift_alert: string;
  shift_state: RecordStatus | "none";
  shift_record_id: number | null;
  shift_is_done: boolean;
};

export type ParticipantDetail = Participant & {
  date_of_birth: string | null;
  age: number | null;
  has_critical_notes: boolean;
  allergies: string;
  mobility: string;
  communication: string;
  emergency_contacts: string;
};

export type RecordStatus = "draft" | "submitted" | "not_required" | "void";

export type CareRecord = {
  id: number;
  reference: string;
  participant: number;
  participant_name: string;
  participant_initials: string;
  home: number;
  home_label: string;
  service_date: string;
  shift: string;
  shift_label: string;
  status: RecordStatus;
  not_required_reason: string;
  schema_key: string;
  schema_version: string;
  form_title: string;
  submitted_at: string | null;
  submitted_by_name: string | null;
  created_by_name: string | null;
  shower: boolean | null;
  bed_bath: boolean | null;
  physio_completed: boolean | null;
  bowel_recorded: boolean;
  urine_recorded: boolean;
  fluids_recorded: boolean;
  has_pdf: boolean;
  summary: string[];
  is_locked: boolean;
};

export type Attendance = {
  time: string;
  purpose: string;
  duration_minutes: number | string;
};

export type CareRecordDetail = CareRecord & {
  answers: Record<string, unknown>;
  attendances: Attendance[];
  amendments: { reason: string; body: string; author: string; created_at: string }[];
};

/* Form schemas -------------------------------------------------------------
   The client renders forms from these, so a new form needs no release. */

export type FieldType =
  | "yesno"
  | "text"
  | "textarea"
  | "time"
  | "number"
  | "repeater";

export type ShowIf = {
  all?: { field: string; eq?: unknown; filled?: boolean }[];
};

export type SchemaField = {
  key: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  help?: string;
  error?: string;
  required?: boolean;
  required_when_shown?: boolean;
  show_if?: ShowIf;
  promote?: string;
  group?: string;
  add_label?: string;
  suffix?: string;
  columns?: { key: string; type: FieldType; label: string; placeholder?: string }[];
};

export type SchemaSection = {
  key: string;
  title: string;
  fields: SchemaField[];
};

export type FormSchema = {
  key: string;
  version: string;
  title: string;
  short_title: string;
  badge: string;
  footer_note: string;
  sections: SchemaSection[];
};

/* Screens ------------------------------------------------------------------ */

export type Me = {
  id: number;
  username: string;
  full_name: string;
  initials: string;
  role: "worker" | "manager" | null;
  is_manager: boolean;
  homes: Home[];
  active_home: number | null;
  shift: { key: string; label: string; service_date: string };
};

export type ShiftRow = {
  participant: Participant;
  state: RecordStatus | "none";
  is_done: boolean;
  record: number | null;
};

export type WorkerDashboard = {
  is_manager: false;
  shift: { key: string; label: string; service_date: string };
  home: Home | null;
  done_count: number;
  total_count: number;
  outstanding_count: number;
  progress_pct: number;
  rows: ShiftRow[];
  handover: { shift_label: string; service_date: string; records: CareRecord[] };
};

export type ManagerDashboard = {
  is_manager: true;
  shift: { key: string; label: string; service_date: string };
  compliance_pct: number;
  done_count: number;
  expected_count: number;
  outstanding_count: number;
  week_count: number;
  participant_count: number;
  workers_on_shift: number;
  by_property: { home: Home; done: number; total: number; pct: number }[];
  outstanding: { participant: Participant; state: RecordStatus | "none" }[];
  recent: CareRecord[];
};

export type Dashboard = WorkerDashboard | ManagerDashboard;

export type Notice = {
  id: number;
  title: string;
  body: string;
  author_name: string;
  author_is_manager: boolean;
  homes: number[];
  is_pinned: boolean;
  published_at: string;
  is_unread: boolean;
};

export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};
