import type { KnowledgeCitation, OpportunityFeedSnapshot, RecruitmentOpportunity } from "@offerflow/domain";
import { searchOpportunitySnapshot } from "../../opportunities/search.ts";
import type { KnowledgeService } from "../../knowledge/service.ts";
import type { AgentTool } from "../tool.ts";

export interface InterviewPrepArgs {
  /** 目标公司名，例如：百度、字节跳动、美团。 */
  company?: string;
  /** 岗位方向，例如：产品经理、前端、算法、数据分析、运营、设计。 */
  role?: string;
  /** 目标城市，例如：北京、上海、杭州。 */
  city?: string;
}

export interface InterviewPrepResult {
  /** 用户想准备的面试目标。 */
  target: { company?: string; role?: string; city?: string };
  /** 匹配的岗位元数据，最多 3 条；来源受限或未命中时可能为空。 */
  items: RecruitmentOpportunity[];
  /** 面试方法论引用（高频题类型、答题框架、STAR 等），最多 3 条。 */
  knowledge: KnowledgeCitation[];
}

export interface InterviewPrepToolDeps {
  loadSnapshot: () => Promise<{ snapshot: OpportunityFeedSnapshot; sourceAvailable: boolean }>;
  knowledge: KnowledgeService;
}

function buildQuery(args: InterviewPrepArgs): string {
  const parts: string[] = [];
  if (args.company?.trim()) parts.push(args.company.trim());
  if (args.role?.trim()) parts.push(args.role.trim());
  if (args.city?.trim()) parts.push(args.city.trim());
  return parts.join(" ") || "校招岗位";
}

/**
 * Gathers what the model needs to prepare a user for an interview at a
 * specific company / role: the matching opportunity metadata (company, title,
 * city, batch, deadline, official link) plus interview methodology from the
 * knowledge base (question archetypes, STAR, self-intro framing). The tool is
 * deliberately data-only; generating targeted questions and answer skeletons
 * from these inputs is the model's job, so the output stays fresh and
 * specific to the actual opportunity.
 */
export function createInterviewPrepTool(
  deps: InterviewPrepToolDeps
): AgentTool<InterviewPrepResult> {
  return {
    name: "interview_prep",
    description:
      "为指定公司或岗位方向准备面试：返回匹配岗位的信息（公司、岗位、城市、批次、截止时间、投递链接）和面试方法论引用（高频题类型、答题框架、STAR 法则）。\n" +
      "【何时调用】用户想准备某公司或岗位的面试、问“面试会问什么”“怎么回答面试题”“帮我准备 XX 的面试”时调用。\n" +
      "【何时不要调用】用户只是找岗位或整理已有结论，没有准备面试的意图时不要调用。",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string", description: "目标公司名，例如：百度、字节跳动、美团" },
        role: { type: "string", description: "岗位方向，例如：产品经理、前端、算法、数据分析、运营、设计" },
        city: { type: "string", description: "目标城市，例如：北京、上海、杭州" }
      }
    },
    async execute(args) {
      const options = (args ?? {}) as InterviewPrepArgs;
      const query = buildQuery(options);
      const { snapshot, sourceAvailable } = await deps.loadSnapshot();
      const results = searchOpportunitySnapshot(snapshot, query, {
        limit: 3,
        sourceAvailable,
        now: new Date()
      });
      const knowledge = deps.knowledge
        .search("面试 高频问题 答题思路 STAR 自我介绍 行为面试", 3)
        .map((citation) => ({ ...citation, excerpt: citation.excerpt.slice(0, 1_200) }));
      return {
        target: {
          company: options.company?.trim() || undefined,
          role: options.role?.trim() || undefined,
          city: options.city?.trim() || undefined
        },
        items: results.items,
        knowledge
      };
    }
  };
}
