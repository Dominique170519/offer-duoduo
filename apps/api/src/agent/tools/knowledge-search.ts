import type { KnowledgeCitation } from "@offerflow/domain";
import type { KnowledgeEntry, KnowledgeService } from "../../knowledge/service.ts";
import type { AgentTool } from "../tool.ts";

export interface KnowledgeSearchArgs {
  /** 检索关键词，使用用户关心的主题，例如：简历 STAR、秋招规划、面试回答。 */
  query: string;
  /** 返回条数，默认 3，最多 6。 */
  limit?: number;
}

/**
 * Retrieves from the built-in career knowledge base plus the current
 * conversation's selected materials (resume/application/interview records and
 * attachments). The extra entries are fixed per request, so the tool never
 * sees another user's data.
 */
export function createKnowledgeSearchTool(
  knowledge: KnowledgeService,
  extraEntries: KnowledgeEntry[] = []
): AgentTool<KnowledgeCitation[]> {
  return {
    name: "knowledge_search",
    description:
      "检索求职知识库和当前会话资料（用户选中的简历、投递记录、面试记录、附件）。当用户询问简历写法、校招规划、面试答题、投递复盘等方法论，或需要引用用户自己的材料时调用。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "检索关键词，例如：简历 STAR、秋招规划、职业规划回答" },
        limit: { type: "number", description: "返回条数，默认 3，最多 6" }
      },
      required: ["query"]
    },
    async execute(args) {
      const query = typeof args?.query === "string" ? args.query.trim() : "";
      if (!query) return [];
      const limit = Math.min(Math.max(1, Number(args?.limit) || 3), 6);
      return knowledge.search(query, limit, extraEntries).map((citation) => ({
        ...citation,
        excerpt: citation.excerpt.slice(0, 1_800)
      }));
    }
  };
}
