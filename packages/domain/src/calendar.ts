/**
 * Job-hunt calendar: a time-axis view of a user's application journey.
 *
 * Three sources feed the calendar:
 * - manual events (interviews, written tests, offer deadlines) created by the
 *   user or by the agent after confirmation;
 * - derived events from application records (applied date, application deadline);
 * - derived deadlines from the campus-hiring opportunity feed.
 *
 * The aggregate (`CalendarDayEvent`) flattens all three so the web page and the
 * agent tools share one shape.
 */

export const CALENDAR_EVENT_TYPES = [
  "interview",
  "written_test",
  "assessment",
  "application",
  "deadline",
  "offer_decision",
  "other"
] as const;

export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export const CALENDAR_EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  interview: "面试",
  written_test: "笔试",
  assessment: "测评",
  application: "投递",
  deadline: "截止",
  offer_decision: "Offer 确认",
  other: "其他"
};

/** Manual calendar event persisted in the store. */
export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  /** ISO datetime (or date-only string for whole-day events like deadlines). */
  startsAt: string;
  endsAt?: string;
  company?: string;
  position?: string;
  applicationId?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export type CalendarEventSource = "manual" | "application" | "opportunity";

/**
 * Flattened calendar entry returned by the aggregate endpoint and the agent
 * tools. Derived entries are not deletable and keep a stable synthetic id.
 */
export interface CalendarDayEvent {
  id: string;
  source: CalendarEventSource;
  type: CalendarEventType;
  title: string;
  startsAt: string;
  endsAt?: string;
  company?: string;
  position?: string;
  applicationId?: string;
  opportunityId?: string;
  note?: string;
  deletable: boolean;
}

export interface CalendarDayEventInput {
  type: CalendarEventType;
  title: string;
  startsAt: string;
  endsAt?: string;
  company?: string;
  position?: string;
  applicationId?: string;
  note?: string;
}

/** Sort helpers shared by the API and the agent tools. */
export function calendarEventSortKey(event: { startsAt: string }): string {
  const value = event.startsAt.replace("T", " ");
  return value.length >= 10 ? value.slice(0, 10) : value;
}

export function isCalendarDayEventInput(value: unknown): value is CalendarDayEventInput {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.title !== "string" || record.title.trim().length === 0) return false;
  if (typeof record.startsAt !== "string" || record.startsAt.length < 10) return false;
  if (
    typeof record.type !== "string" ||
    !(CALENDAR_EVENT_TYPES as readonly string[]).includes(record.type)
  ) {
    return false;
  }
  return true;
}

/** Day key "YYYY-MM-DD" from an ISO string or date string. */
export function toDayKey(value: string): string {
  const match = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return value.slice(0, 10);
}
