import { STAGE_LABELS } from "@offerflow/domain";
import {
  applicationKnowledgeEntry,
  applicationOverviewEntry
} from "../../knowledge/application-context.ts";
import { searchKnowledgeEntries } from "../../knowledge/service.ts";
import type { AgentTool } from "../tool.ts";

export interface ApplicationContextArgs {
  /** 可选的关注点，例如某家公司或某个阶段；不传则返回全部概览。 */
  query?: string;
}

export interface ApplicationContextResult {
  overview: string;
  applications: Array<{
    company: string;
    position: string;
    stage: string;
    city?: string;
    nextAction?: string;
    deadline?: string;
    updatedAt: string;
    sourceUrl: string;
  }>;
  /** 与 query 匹配的具体投递记录片段。 */
  matches?: Array<{ title: string; excerpt: string; url?: string }>;
}

/**
 * Reads the current user's application management records. User scoping is
 * handled by the store call, so the tool never sees another user's data.
 */
export function createApplicationContextTool(): AgentTool<ApplicationContextResult> {
  return {
    name: "application_context",
    description:
      "读取当前登录用户的投递管理记录：已投递的公司、岗位、阶段、下一步、截止时间。当用户询问自己的投递进度、待办、复盘、已投了哪些公司，或需要结合用户的投递记录回答时调用。回复率、通过率等未记录指标不能编造。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "可选的关注点，例如公司名或阶段；不传则返回全部概览" }
      }
    },
    async execute(args, ctx) {
      const applications = (await ctx.store.listApplications(ctx.userId))
        .filter((item) => !item.deletedAt)
        .map((item) => item.application);
      const result: ApplicationContextResult = {
        overview: applicationOverviewEntry(applications).content,
        applications: applications.slice(0, 30).map((application) => ({
          company: application.company,
          position: application.position,
          stage: STAGE_LABELS[application.stage],
          city: application.city,
          nextAction: application.nextAction,
          deadline: application.deadline,
          updatedAt: application.updatedAt,
          sourceUrl: application.sourceUrl
        }))
      };
      const query = typeof args?.query === "string" ? args.query.trim() : "";
      if (query && applications.length) {
        result.matches = searchKnowledgeEntries(
          query,
          applications.map(applicationKnowledgeEntry),
          6
        ).map(({ title, excerpt, url }) => ({
          title,
          excerpt: excerpt.slice(0, 1_200),
          url
        }));
      }
      return result;
    }
  };
}
