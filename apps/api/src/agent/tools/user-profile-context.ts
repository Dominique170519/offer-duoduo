import { formatJobSeekerProfile, isEmptyJobSeekerProfile, type JobSeekerProfile } from "@offerflow/domain";
import type { AgentTool } from "../tool.ts";

export interface UserProfileContextResult {
  hasProfile: boolean;
  summary: string;
  profile: JobSeekerProfile;
}

/**
 * Read-only access to the user's job-seeker profile. The agent calls this at
 * the start of every conversation so recommendations and advice are
 * personalized. This tool never modifies data.
 */
export function createUserProfileContextTool(): AgentTool<UserProfileContextResult> {
  return {
    name: "user_profile_context",
    description:
      "读取用户的求职画像（专业/学历/学校/届别/目标岗位/意向城市/行业/阶段/偏好/经历摘要）。\n" +
      "【何时调用】每轮对话开始时自动调用一次，用于了解用户背景；用户询问“我的画像是什么”“你记得我是谁吗”时也调用。\n" +
      "【如何使用】把返回的 summary 融入回答，推荐岗位时自动带上意向城市和目标岗位，准备面试时自动基于专业和岗位调整方向。\n" +
      "【何时不要调用】不需要用户背景信息的纯知识性问题（如“STAR原则是什么”）可以不调用。",
    inputSchema: {
      type: "object",
      properties: {}
    },
    async execute(_args, ctx) {
      const profile = await ctx.store.getUserProfile(ctx.userId);
      return {
        hasProfile: !isEmptyJobSeekerProfile(profile),
        summary: formatJobSeekerProfile(profile),
        profile
      };
    }
  };
}
