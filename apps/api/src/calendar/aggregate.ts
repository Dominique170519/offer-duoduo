import type {
  CalendarDayEvent,
  CalendarEvent,
  OpportunityFeedSnapshot,
  RecruitmentOpportunity
} from "@offerflow/domain";
import { toDayKey } from "@offerflow/domain";
import type { OfferFlowStore } from "../store/store.ts";

export interface CalendarAggregateOptions {
  /** Include only entries on or after this day (YYYY-MM-DD). */
  from?: string;
  /** Include only entries on or before this day (YYYY-MM-DD). */
  to?: string;
  /** Loads the campus-hiring feed so opportunity deadlines can be derived. */
  loadSnapshot?: () => Promise<{ snapshot: OpportunityFeedSnapshot; sourceAvailable: boolean }>;
  /** Hard cap on returned entries, newest deadlines/interviews first. */
  limit?: number;
}

function inRange(dayKey: string, from?: string, to?: string): boolean {
  if (from && dayKey < from) return false;
  if (to && dayKey > to) return false;
  return true;
}

function manualToDayEvent(event: CalendarEvent): CalendarDayEvent {
  return {
    id: event.id,
    source: "manual",
    type: event.type,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    company: event.company,
    position: event.position,
    applicationId: event.applicationId,
    note: event.note,
    deletable: true
  };
}

function applicationEvents(application: {
  id: string;
  company: string;
  position: string;
  appliedAt?: string;
  deadline?: string;
  createdAt: string;
}): CalendarDayEvent[] {
  const events: CalendarDayEvent[] = [];
  const appliedKey = application.appliedAt ? toDayKey(application.appliedAt) : undefined;
  if (appliedKey) {
    events.push({
      id: `app:${application.id}:applied`,
      source: "application",
      type: "application",
      title: `投递 ${application.company} · ${application.position}`,
      startsAt: appliedKey,
      company: application.company,
      position: application.position,
      applicationId: application.id,
      deletable: false
    });
  }
  if (application.deadline) {
    events.push({
      id: `app:${application.id}:deadline`,
      source: "application",
      type: "deadline",
      title: `${application.company} · ${application.position} 投递截止`,
      startsAt: toDayKey(application.deadline),
      company: application.company,
      position: application.position,
      applicationId: application.id,
      deletable: false
    });
  }
  return events;
}

function opportunityEvents(opportunity: RecruitmentOpportunity): CalendarDayEvent[] {
  if (!opportunity.deadline) return [];
  if (opportunity.status === "closed") return [];
  return [
    {
      id: `opp:${opportunity.id}:deadline`,
      source: "opportunity",
      type: "deadline",
      title: `${opportunity.company} · ${opportunity.title} 截止`,
      startsAt: toDayKey(opportunity.deadline),
      company: opportunity.company,
      position: opportunity.title,
      opportunityId: opportunity.id,
      deletable: false
    }
  ];
}

/**
 * Flattens manual calendar events, application-derived entries and campus
 * opportunity deadlines into one time-sorted list. The web calendar page and
 * the agent calendar_context tool both consume this single shape.
 */
export async function buildCalendarDayEvents(
  store: OfferFlowStore,
  userId: string,
  options: CalendarAggregateOptions = {}
): Promise<CalendarDayEvent[]> {
  const { from, to, loadSnapshot, limit = 300 } = options;
  const entries: CalendarDayEvent[] = [];

  const manual = await store.listCalendarEvents(userId);
  for (const event of manual) {
    const dayKey = toDayKey(event.startsAt);
    if (inRange(dayKey, from, to)) entries.push(manualToDayEvent(event));
  }

  const applications = await store.listApplications(userId);
  for (const item of applications) {
    const events = applicationEvents(item.application);
    for (const event of events) {
      if (inRange(toDayKey(event.startsAt), from, to)) entries.push(event);
    }
  }

  if (loadSnapshot) {
    try {
      const { snapshot } = await loadSnapshot();
      for (const opportunity of snapshot.opportunities ?? []) {
        const events = opportunityEvents(opportunity);
        for (const event of events) {
          if (inRange(toDayKey(event.startsAt), from, to)) entries.push(event);
        }
      }
    } catch {
      // Opportunity feed unavailable (e.g. no seed data): derived deadlines are
      // simply omitted; manual and application events still work.
    }
  }

  entries.sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  return entries.slice(0, limit);
}
