import type {
  JobSeekerBackground,
  JobSeekerPreferences,
  JobSeekerProfile,
  JobSeekerStage,
  WrittenExamPreference
} from "@offerflow/domain";
import type { AgentTool } from "../tool.ts";

export interface UserProfileUpdateArgs {
  background?: Partial<JobSeekerBackground>;
  intention?: {
    targetRoles?: string[];
    targetCities?: string[];
    industries?: string[];
  };
  stage?: Partial<JobSeekerStage>;
  preferences?: Partial<JobSeekerPreferences>;
  experienceSummary?: string;
  /**
   * 确认开关：false 只返回草稿预览不写入；只有用户明确确认后，第二次调用传 true 才真正写入。
   */
  confirm: boolean;
}

export type UserProfileUpdateResult =
  | { status: "draft"; message: string; changes: string[]; proposed: UserProfileUpdateArgs }
  | { status: "updated"; message: string; profile: JobSeekerProfile };

function describeChanges(args: UserProfileUpdateArgs): string[] {
  const changes: string[] = [];
  const b = args.background;
  if (b) {
    if (b.major) changes.push(`专业：${b.major}`);
    if (b.degree) changes.push(`学历：${b.degree}`);
    if (b.school) changes.push(`学校：${b.school}`);
    if (b.graduationYear) changes.push(`届别：${b.graduationYear}`);
  }
  const i = args.intention;
  if (i) {
    if (i.targetRoles?.length) changes.push(`目标岗位：${i.targetRoles.join("、")}`);
    if (i.targetCities?.length) changes.push(`意向城市：${i.targetCities.join("、")}`);
    if (i.industries?.length) changes.push(`行业偏好：${i.industries.join("、")}`);
  }
  const s = args.stage;
  if (s) {
    if (s.phase) changes.push(`求职阶段：${s.phase}`);
    if (s.status) changes.push(`当前状态：${s.status}`);
  }
  const p = args.preferences;
  if (p) {
    if (p.writtenExam) {
      const map: Record<WrittenExamPreference, string> = {
        avoid: "尽量避开笔试",
        acceptable: "可以接受笔试",
        neutral: "对笔试无所谓"
      };
      changes.push(`笔试偏好：${map[p.writtenExam] || p.writtenExam}`);
    }
    if (p.companyTypes?.length) changes.push(`公司类型：${p.companyTypes.join("、")}`);
    if (p.salaryExpectation) changes.push(`薪资预期：${p.salaryExpectation}`);
  }
  if (args.experienceSummary) changes.push(`经历摘要：${args.experienceSummary}`);
  return changes;
}

/**
 * Updates the user's job-seeker profile only after explicit confirmation.
 * The model must first present a draft with confirm=false; only after the
 * user explicitly confirms may it call again with confirm=true.
 */
export function createUserProfileUpdateTool(): AgentTool<UserProfileUpdateResult> {
  return {
    name: "user_profile_update",
    description:
      "更新用户的求职画像（专业/学历/学校/届别/目标岗位/意向城市/行业/阶段/偏好/经历摘要）。\n" +
      "【确认机制——必须遵守】本工具分两步：第一次调用必须传 confirm=false，只返回草稿预览不写入；你必须把变更清单展示给用户并询问“确认更新你的求职画像吗”；用户明确确认后，再以相同内容调用本工具并传 confirm=true，才会真正写入。用户没有明确确认前，绝对不允许传 confirm=true。\n" +
      "【何时调用】对话中用户明确表达了新的背景/意向/偏好信息，如“我是南大计算机的”“我想找杭州的产品岗”“我不想笔试”“更新我的画像”。\n" +
      "【何时不要调用】用户只是在闲聊、没有提供可结构化的画像信息，不要调用。",
    inputSchema: {
      type: "object",
      properties: {
        background: {
          type: "object",
          description: "个人背景",
          properties: {
            major: { type: "string", description: "专业" },
            degree: { type: "string", description: "学历，如本科/硕士" },
            school: { type: "string", description: "学校" },
            graduationYear: { type: "string", description: "届别，如2027届" }
          }
        },
        intention: {
          type: "object",
          description: "求职意向",
          properties: {
            targetRoles: { type: "array", items: { type: "string" }, description: "目标岗位列表" },
            targetCities: { type: "array", items: { type: "string" }, description: "意向城市列表" },
            industries: { type: "array", items: { type: "string" }, description: "行业偏好列表" }
          }
        },
        stage: {
          type: "object",
          description: "求职阶段",
          properties: {
            phase: { type: "string", enum: ["秋招", "春招", "实习", "社招", "未明确"], description: "求职阶段" },
            status: { type: "string", enum: ["准备中", "投递中", "笔试中", "面试中", "Offer阶段", "已入职", "未明确"], description: "当前状态" }
          }
        },
        preferences: {
          type: "object",
          description: "偏好设置",
          properties: {
            writtenExam: { type: "string", enum: ["avoid", "acceptable", "neutral"], description: "笔试偏好：avoid避开/acceptable可接受/neutral无所谓" },
            companyTypes: { type: "array", items: { type: "string" }, description: "公司类型偏好，如国企/外企/互联网" },
            salaryExpectation: { type: "string", description: "薪资预期，如15-20k" }
          }
        },
        experienceSummary: { type: "string", description: "核心经历摘要（一句话）" },
        confirm: { type: "boolean", description: "确认开关：false=只返回草稿不写入；用户明确确认后 true=写入" }
      },
      required: ["confirm"]
    },
    async execute(args, ctx) {
      const options = (args ?? {}) as unknown as UserProfileUpdateArgs;
      const changes = describeChanges(options);
      if (changes.length === 0) {
        throw new Error("没有提供任何可更新的画像字段");
      }

      if (options.confirm !== true) {
        return {
          status: "draft",
          message: "画像更新草稿已生成，等待用户确认后写入",
          changes,
          proposed: { ...options, confirm: false }
        };
      }

      const patch: Partial<Omit<JobSeekerProfile, "userId" | "updatedAt">> = {};
      if (options.background) patch.background = options.background;
      if (options.intention) patch.intention = options.intention;
      if (options.stage) patch.stage = options.stage;
      if (options.preferences) patch.preferences = options.preferences;
      if (options.experienceSummary !== undefined) patch.experienceSummary = options.experienceSummary;

      const profile = await ctx.store.updateUserProfile(ctx.userId, patch);
      return {
        status: "updated",
        message: `求职画像已更新（${changes.length} 项变更）`,
        profile
      };
    }
  };
}
