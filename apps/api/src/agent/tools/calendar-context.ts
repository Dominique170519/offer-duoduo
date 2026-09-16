import type { CalendarDayEvent } from "@offerflow/domain";
import { CALENDAR_EVENT_TYPE_LABELS } from "@offerflow/domain";
import { buildCalendarDayEvents } from "../../calendar/aggregate.ts";
import type { AgentTool } from "../tool.ts";

export interface CalendarContextArgs {
  /** 只看未来 N 天（不含今天），默认 7。 */
  days?: number;
  /** 只看某一类型：interview 面试 / written_test 笔试 / assessment 测评 / application 投递 / deadline 截止 / offer_decision Offer确认 / other。 */
  type?: string;
  /** 是否包含校招岗位库的截止事件，默认 true。 */
  includeDeadlines?: boolean;
}

export interface CalendarContextResult {
  today: string;
  from: string;
  to: string;
  count: number;
  events: CalendarDayEvent[];
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Read-only access to the user's job-hunt calendar. Returns a flattened,
 * time-sorted view of manual events, application-derived events and campus
 * opportunity deadlines within the requested window.
 */
export function createCalendarContextTool(): AgentTool<CalendarContextResult> {
  return {
    name: "calendar_context",
    description:
      "读取用户的求职日历，返回未来 N 天内的事件（面试/笔试/测评/投递/截止/Offer确认）。\n" +
      "【何时调用】用户询问日程安排、时间规划或截止提醒，如“我这周有什么安排”“最近有什么岗位要截止”“明天有什么面试”“帮我规划一下下周的投递节奏”。\n" +
      "【组合使用】用户问“最近的面试/截止”并需要准备时，先用本工具拿到具体事件，再结合 application_context / interview_prep 给出针对性建议。\n" +
      "【何时不要调用】用户只是要求推荐岗位、整理已有结论或闲聊日程之外的话题，不要调用。",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "只看未来 N 天（不含今天），默认 7，最大 90" },
        type: { type: "string", description: "按类型过滤：interview/written_test/assessment/application/deadline/offer_decision/other" },
        includeDeadlines: { type: "boolean", description: "是否包含校招岗位库的截止事件，默认 true" }
      }
    },
    async execute(args, ctx) {
      const options = (args ?? {}) as CalendarContextArgs;
      const now = ctx.now?.() ?? new Date();
      const days = Math.min(
        Math.max(1, Math.round(typeof options.days === "number" ? options.days : 7)),
        90
      );
      const from = dayKey(now);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
      const to = dayKey(end);

      const events = await buildCalendarDayEvents(ctx.store, ctx.userId, {
        from,
        to,
        loadSnapshot: undefined
      });

      const filtered = events
        .filter((event) => {
          if (options.type && event.type !== options.type) return false;
          if (options.includeDeadlines === false && event.type === "deadline" && event.source === "opportunity") {
            return false;
          }
          return true;
        })
        .map((event) => ({
          ...event,
          typeLabel: CALENDAR_EVENT_TYPE_LABELS[event.type]
        }));

      return {
        today: from,
        from,
        to,
        count: filtered.length,
        events: filtered
      };
    }
  };
}
