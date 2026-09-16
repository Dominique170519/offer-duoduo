import { randomUUID } from "node:crypto";
import type { CalendarEvent, CalendarEventType } from "@offerflow/domain";
import { CALENDAR_EVENT_TYPES, isCalendarDayEventInput } from "@offerflow/domain";
import type { AgentTool } from "../tool.ts";

export interface CalendarAddArgs {
  /** 事件类型：interview/written_test/assessment/application/deadline/offer_decision/other。 */
  type: CalendarEventType;
  /** 事件标题，例如“美团二面”“微博笔试”。 */
  title: string;
  /** 开始时间，ISO 格式，例如 2026-09-24T14:00:00+08:00；全天事件可只写日期 2026-09-24。 */
  startsAt: string;
  endsAt?: string;
  company?: string;
  position?: string;
  note?: string;
  /**
   * 确认开关：false 只返回草稿不写入；只有用户明确确认后，第二次调用传 true 才真正写入。
   */
  confirm: boolean;
}

export type CalendarAddResult =
  | { status: "draft"; message: string; event: CalendarAddArgs }
  | { status: "created"; message: string; event: CalendarEvent };

/**
 * Writes a calendar event only after explicit user confirmation. The model is
 * instructed to first present the draft and ask for confirmation with
 * `confirm: false`; only a following user confirmation may set `confirm: true`.
 */
export function createCalendarAddTool(): AgentTool<CalendarAddResult> {
  return {
    name: "calendar_add",
    description:
      "在用户求职日历中记录一个事件（面试/笔试/测评/截止/Offer确认等）。\n" +
      "【确认机制——必须遵守】本工具分两步：第一次调用必须传 confirm=false，只返回草稿不写入；你必须把草稿展示给用户并询问“确认记入日历吗”；用户明确确认后，再以相同内容调用本工具并传 confirm=true，才会真正写入。用户没有明确确认前，绝对不允许传 confirm=true。\n" +
      "【何时调用】用户要求记录时间安排，如“把 9/24 下午 2 点美团二面记到日历”“帮我记一下 9/20 微博笔试”。\n" +
      "【何时不要调用】用户只是询问日程（用 calendar_context）、或没有给出具体时间，不要调用。",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [...CALENDAR_EVENT_TYPES],
          description: "事件类型：interview 面试 / written_test 笔试 / assessment 测评 / application 投递 / deadline 截止 / offer_decision Offer确认 / other 其他"
        },
        title: { type: "string", description: "事件标题，例如“美团二面”“微博笔试”" },
        startsAt: { type: "string", description: "开始时间 ISO 格式，如 2026-09-24T14:00:00+08:00；全天事件可只写日期 2026-09-24" },
        endsAt: { type: "string", description: "结束时间（可选）" },
        company: { type: "string", description: "公司名（可选）" },
        position: { type: "string", description: "岗位名（可选）" },
        note: { type: "string", description: "备注（可选）" },
        confirm: { type: "boolean", description: "确认开关：false=只返回草稿不写入；用户明确确认后 true=写入" }
      },
      required: ["type", "title", "startsAt", "confirm"]
    },
    async execute(args, ctx) {
      const options = (args ?? {}) as unknown as CalendarAddArgs;
      if (!isCalendarDayEventInput(options)) {
        throw new Error("参数不完整：需要有效的 type、title（非空）和 startsAt（日期）");
      }
      const draft: CalendarAddArgs = {
        type: options.type,
        title: options.title.trim(),
        startsAt: options.startsAt,
        endsAt: options.endsAt,
        company: options.company,
        position: options.position,
        note: options.note,
        confirm: false
      };
      if (options.confirm !== true) {
        return {
          status: "draft",
          message: "草稿已生成，等待用户确认后写入",
          event: draft
        };
      }

      const now = new Date().toISOString();
      const event: CalendarEvent = {
        id: randomUUID(),
        type: options.type,
        title: options.title.trim(),
        startsAt: options.startsAt,
        endsAt: options.endsAt,
        company: options.company,
        position: options.position,
        applicationId: undefined,
        note: options.note,
        createdAt: now,
        updatedAt: now
      };
      await ctx.store.createCalendarEvent(ctx.userId, event);
      return {
        status: "created",
        message: `已记入日历：${options.title}`,
        event
      };
    }
  };
}
