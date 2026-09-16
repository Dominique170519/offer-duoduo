import type { ChatOpportunityResults, OpportunityFeedSnapshot, RecruitmentOpportunity } from "@offerflow/domain";
import {
  searchOpportunitySnapshot
} from "../../opportunities/search.ts";
import type { AgentTool } from "../tool.ts";

export interface OpportunitySearchArgs {
  /** 岗位方向，例如：产品经理、前端、算法、数据分析、运营。 */
  role?: string;
  /** 目标城市，例如：北京、上海、杭州。 */
  city?: string;
  /** 招聘批次：春招、秋招、实习、提前批、补录。 */
  batch?: string;
  /** 毕业届别，例如：2026（会匹配 2026届）。 */
  graduationYear?: string;
  /** 目标公司名，例如：字节跳动、美团。 */
  company?: string;
  /** 只看最近 N 天更新/发布的岗位。 */
  days?: number;
  /** 自由关键词，追加到检索条件中。 */
  keyword?: string;
  /** 组合推荐场景：用户已投递的公司名列表，检索结果将实际排除这些公司的岗位。 */
  excludeCompanies?: string[];
}

export interface OpportunitySearchResultItem extends RecruitmentOpportunity {
  /** Keep the model-facing link alias while retaining the full card data. */
  url: string;
}

export interface OpportunitySearchResult extends ChatOpportunityResults {
  items: OpportunitySearchResultItem[];
}

export interface OpportunitySearchToolDeps {
  loadSnapshot: () => Promise<{ snapshot: OpportunityFeedSnapshot; sourceAvailable: boolean }>;
  now?: () => Date;
}

function graduationYearPrompt(value: string): string {
  const year = value.trim().match(/^(20\d{2})/)?.[1];
  return year ? `${year}届` : value.trim();
}

function buildQuery(args: OpportunitySearchArgs): string {
  const parts: string[] = [];
  if (args.role?.trim()) parts.push(args.role.trim());
  if (args.city?.trim()) parts.push(args.city.trim());
  if (args.batch?.trim()) parts.push(args.batch.trim());
  if (args.graduationYear?.trim()) parts.push(graduationYearPrompt(args.graduationYear));
  if (typeof args.days === "number" && Number.isFinite(args.days) && args.days > 0) {
    parts.push(`最近 ${Math.min(Math.max(1, Math.round(args.days)), 90)} 天更新`);
  }
  if (args.company?.trim()) parts.push(args.company.trim());
  if (args.keyword?.trim()) parts.push(args.keyword.trim());
  return parts.join(" ") || "校招岗位";
}

/**
 * Wraps the existing campus-hiring search. Structured arguments from the
 * model are composed into a query that the existing filter/scoring pipeline
 * understands, so ranking and source-availability behaviour stay unchanged.
 */
export function createOpportunitySearchTool(
  deps: OpportunitySearchToolDeps
): AgentTool<OpportunitySearchResult> {
  return {
    name: "opportunity_search",
    description:
      "查询校招岗位库，返回最多 5 条带真实投递链接的岗位。岗位卡片和投递链接只能来自本工具，不能编造。\n" +
      "【何时调用】用户明确要求找新岗位或查可投机会：如“帮我找北京的产品经理岗位”“有哪些公司在招前端”“字节今年秋招有什么岗位”。\n" +
      "【组合推荐】当用户要求结合投递记录推荐岗位（如“结合我的投递记录推荐岗位”“还有哪些我没投过的合适岗位”）时：先调用 application_context 获取已投公司/岗位，再调用本工具并把已投公司名传入 excludeCompanies 参数，本工具会实际排除这些公司的岗位；回答中说明排除逻辑。\n" +
      "【何时不要调用】用户没有要求查新岗位，而是在整理、总结、比较、规划或追问已有结果的细节，如“把刚才的结论整理成行动清单”“这些岗位里哪个更适合我”——此时应直接根据对话历史回答，不要调用本工具；同一诉求也不要反复调用。",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string", description: "岗位方向，例如：产品经理、前端、算法、数据分析、运营、设计" },
        city: { type: "string", description: "目标城市，例如：北京、上海、杭州" },
        batch: { type: "string", description: "招聘批次：春招、秋招、实习、提前批、补录" },
        graduationYear: { type: "string", description: "毕业届别，例如：2026（匹配 2026届）" },
        company: { type: "string", description: "目标公司名，例如：字节跳动、美团" },
        days: { type: "number", description: "只看最近 N 天更新/发布的岗位，1-90" },
        keyword: { type: "string", description: "自由关键词" },
        excludeCompanies: { type: "array", items: { type: "string" }, description: "组合推荐场景：用户已投递的公司名列表，结果将实际排除这些公司的岗位" }
      }
    },
    async execute(args) {
      const now = deps.now?.() ?? new Date();
      const options = (args ?? {}) as OpportunitySearchArgs;
      const query = buildQuery(options);
      const { snapshot, sourceAvailable } = await deps.loadSnapshot();
      const results = searchOpportunitySnapshot(snapshot, query, {
        limit: 5,
        sourceAvailable,
        now
      });
      const excludedNames = (options.excludeCompanies ?? [])
        .map((name) => (typeof name === "string" ? name.trim() : ""))
        .filter((name) => name.length > 0);
      const normalize = (value: string) => value.toLowerCase().replace(/[（(].*?[)）]/g, "").trim();
      const excludedKeys = new Set(excludedNames.map(normalize));
      const items = results.items.map((opportunity) => ({
        ...opportunity,
        url: opportunity.officialUrl
      }));
      const filteredItems =
        excludedKeys.size > 0
          ? items.filter((item) => {
              const companyKey = normalize(item.company ?? "");
              return ![...excludedKeys].some((key) => companyKey.includes(key) || key.includes(companyKey));
            })
          : items;
      return {
        ...results,
        total: filteredItems.length,
        items: filteredItems,
        excludedCompanies: excludedKeys.size > 0 ? excludedNames : undefined
      };
    }
  };
}
