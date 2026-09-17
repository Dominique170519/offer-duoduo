/**
 * 轻量级求职画像（Job Seeker Profile）
 *
 * 与简历数据模型（PersonalProfile）不同：
 * - PersonalProfile 是完整简历，字段多、用于简历编辑和导出
 * - JobSeekerProfile 是 agent 用来个性化回答的精简摘要，token 开销低
 *
 * 画像按 userId 持久化在服务端，天然跨会话、跨设备。
 */

export interface JobSeekerBackground {
  /** 专业，如 "计算机科学与技术" */
  major?: string;
  /** 学历，如 "本科" / "硕士" */
  degree?: string;
  /** 学校 */
  school?: string;
  /** 毕业年份/届别，如 "2027届" */
  graduationYear?: string;
}

export interface JobSeekerIntention {
  /** 目标岗位列表，如 ["产品经理", "产品运营"] */
  targetRoles?: string[];
  /** 意向城市列表，如 ["杭州", "上海"] */
  targetCities?: string[];
  /** 行业偏好，如 ["互联网", "金融科技"] */
  industries?: string[];
}

export type JobSeekerPhase = "秋招" | "春招" | "实习" | "社招" | "未明确";
export type JobSeekerStatus =
  | "准备中"
  | "投递中"
  | "笔试中"
  | "面试中"
  | "Offer阶段"
  | "已入职"
  | "未明确";

export interface JobSeekerStage {
  /** 当前求职阶段 */
  phase?: JobSeekerPhase;
  /** 当前状态 */
  status?: JobSeekerStatus;
}

export type WrittenExamPreference = "avoid" | "acceptable" | "neutral";

export interface JobSeekerPreferences {
  /** 笔试偏好：avoid=尽量避开，acceptable=可以接受，neutral=无所谓 */
  writtenExam?: WrittenExamPreference;
  /** 公司类型偏好，如 ["国企", "外企", "互联网"] */
  companyTypes?: string[];
  /** 薪资预期，如 "15-20k" */
  salaryExpectation?: string;
}

export interface JobSeekerProfile {
  userId: string;
  /** 个人背景 */
  background: JobSeekerBackground;
  /** 求职意向 */
  intention: JobSeekerIntention;
  /** 求职阶段 */
  stage: JobSeekerStage;
  /** 偏好设置 */
  preferences: JobSeekerPreferences;
  /** 核心经历摘要（一句话概括，供推荐和面试用） */
  experienceSummary?: string;
  updatedAt: string;
}

/** 创建空画像（所有可选字段留空） */
export function createEmptyJobSeekerProfile(userId: string): JobSeekerProfile {
  return {
    userId,
    background: {},
    intention: {},
    stage: {},
    preferences: {},
    updatedAt: new Date().toISOString()
  };
}

/** 判断画像是否为空（用户从未设置过） */
export function isEmptyJobSeekerProfile(profile: JobSeekerProfile): boolean {
  const b = profile.background;
  const i = profile.intention;
  const s = profile.stage;
  const p = profile.preferences;
  return (
    !b.major && !b.degree && !b.school && !b.graduationYear &&
    (!i.targetRoles || i.targetRoles.length === 0) &&
    (!i.targetCities || i.targetCities.length === 0) &&
    (!i.industries || i.industries.length === 0) &&
    !s.phase && !s.status &&
    !p.writtenExam &&
    (!p.companyTypes || p.companyTypes.length === 0) &&
    !p.salaryExpectation &&
    !profile.experienceSummary
  );
}

/** 把画像格式化为 agent 可读的文本摘要（注入系统提示词用） */
export function formatJobSeekerProfile(profile: JobSeekerProfile): string {
  if (isEmptyJobSeekerProfile(profile)) {
    return "用户尚未设置求职画像。";
  }
  const lines: string[] = [];
  const b = profile.background;
  if (b.major || b.degree || b.school || b.graduationYear) {
    const parts = [b.school, b.major, b.degree, b.graduationYear].filter(Boolean);
    lines.push(`背景：${parts.join("，")}`);
  }
  const i = profile.intention;
  if (i.targetRoles?.length) lines.push(`目标岗位：${i.targetRoles.join("、")}`);
  if (i.targetCities?.length) lines.push(`意向城市：${i.targetCities.join("、")}`);
  if (i.industries?.length) lines.push(`行业偏好：${i.industries.join("、")}`);
  const s = profile.stage;
  if (s.phase || s.status) {
    lines.push(`求职阶段：${[s.phase, s.status].filter(Boolean).join(" / ")}`);
  }
  const p = profile.preferences;
  if (p.writtenExam) {
    const map: Record<string, string> = { avoid: "尽量避开笔试", acceptable: "可以接受笔试", neutral: "对笔试无所谓" };
    lines.push(`笔试偏好：${map[p.writtenExam] || p.writtenExam}`);
  }
  if (p.companyTypes?.length) lines.push(`公司类型偏好：${p.companyTypes.join("、")}`);
  if (p.salaryExpectation) lines.push(`薪资预期：${p.salaryExpectation}`);
  if (profile.experienceSummary) lines.push(`经历摘要：${profile.experienceSummary}`);
  return lines.join("\n");
}

/** 合并新字段到已有画像（部分更新） */
export function mergeJobSeekerProfile(
  existing: JobSeekerProfile,
  patch: Partial<Omit<JobSeekerProfile, "userId" | "updatedAt">>
): JobSeekerProfile {
  return {
    userId: existing.userId,
    background: { ...existing.background, ...(patch.background || {}) },
    intention: {
      targetRoles: patch.intention?.targetRoles ?? existing.intention.targetRoles,
      targetCities: patch.intention?.targetCities ?? existing.intention.targetCities,
      industries: patch.intention?.industries ?? existing.intention.industries
    },
    stage: { ...existing.stage, ...(patch.stage || {}) },
    preferences: {
      writtenExam: patch.preferences?.writtenExam ?? existing.preferences.writtenExam,
      companyTypes: patch.preferences?.companyTypes ?? existing.preferences.companyTypes,
      salaryExpectation: patch.preferences?.salaryExpectation ?? existing.preferences.salaryExpectation
    },
    experienceSummary: patch.experienceSummary ?? existing.experienceSummary,
    updatedAt: new Date().toISOString()
  };
}
