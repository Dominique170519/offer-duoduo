import type { CalendarDayEvent, CalendarEvent } from "@offerflow/domain";

/** Aggregated calendar view (manual + application-derived + opportunity deadlines). */
export interface CalendarAggregateResponse {
  events: CalendarDayEvent[];
}

export interface CalendarEventListResponse {
  events: CalendarEvent[];
}

export interface CalendarEventDetailResponse {
  event: CalendarEvent;
}

export interface CreateCalendarEventRequest {
  event: CalendarEvent;
}

export type UpdateCalendarEventRequest = Partial<
  Omit<CalendarEvent, "id" | "createdAt">
>;
