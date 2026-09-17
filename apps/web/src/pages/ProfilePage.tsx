import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  JobSeekerProfile,
  JobSeekerPhase,
  JobSeekerStatus,
  WrittenExamPreference
} from "@offerflow/domain";
import { Save, Sparkles, User } from "lucide-react";
import { api } from "../app/api";

const PHASE_OPTIONS: JobSeekerPhase[] = ["秋招", "春招", "实习", "社招", "未明确"];
const STATUS_OPTIONS: JobSeekerStatus[] = [
  "准备中", "投递中", "笔试中", "面试中", "Offer阶段", "已入职", "未明确"
];
const WRITTEN_EXAM_OPTIONS: { value: WrittenExamPreference; label: string }[] = [
  { value: "avoid", label: "尽量避开笔试" },
  { value: "acceptable", label: "可以接受笔试" },
  { value: "neutral", label: "对笔试无所谓" }
];

interface ProfileForm {
  major: string;
  degree: string;
  school: string;
  graduationYear: string;
  targetRoles: string;
  targetCities: string;
  industries: string;
  phase: string;
  status: string;
  writtenExam: string;
  companyTypes: string;
  salaryExpectation: string;
  experienceSummary: string;
}

function profileToForm(profile: JobSeekerProfile): ProfileForm {
  return {
    major: profile.background.major ?? "",
    degree: profile.background.degree ?? "",
    school: profile.background.school ?? "",
    graduationYear: profile.background.graduationYear ?? "",
    targetRoles: (profile.intention.targetRoles ?? []).join("、"),
    targetCities: (profile.intention.targetCities ?? []).join("、"),
    industries: (profile.intention.industries ?? []).join("、"),
    phase: profile.stage.phase ?? "未明确",
    status: profile.stage.status ?? "未明确",
    writtenExam: profile.preferences.writtenExam ?? "neutral",
    companyTypes: (profile.preferences.companyTypes ?? []).join("、"),
    salaryExpectation: profile.preferences.salaryExpectation ?? "",
    experienceSummary: profile.experienceSummary ?? ""
  };
}

function splitList(value: string): string[] {
  return value
    .split(/[、,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm>({
    major: "", degree: "", school: "", graduationYear: "",
    targetRoles: "", targetCities: "", industries: "",
    phase: "未明确", status: "未明确",
    writtenExam: "neutral", companyTypes: "", salaryExpectation: "",
    experienceSummary: ""
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { profile } = await api.userProfile.get();
      setForm(profileToForm(profile));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = (key: keyof ProfileForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.userProfile.update({
        background: {
          major: form.major || undefined,
          degree: form.degree || undefined,
          school: form.school || undefined,
          graduationYear: form.graduationYear || undefined
        },
        intention: {
          targetRoles: splitList(form.targetRoles),
          targetCities: splitList(form.targetCities),
          industries: splitList(form.industries)
        },
        stage: {
          phase: (form.phase as JobSeekerPhase) || undefined,
          status: (form.status as JobSeekerStatus) || undefined
        },
        preferences: {
          writtenExam: (form.writtenExam as WrittenExamPreference) || undefined,
          companyTypes: splitList(form.companyTypes),
          salaryExpectation: form.salaryExpectation || undefined
        },
        experienceSummary: form.experienceSummary || undefined
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="profile-page"><p className="profile-loading">加载中…</p></div>;
  }

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="profile-header-icon">
          <User size={20} />
        </div>
        <div>
          <h1>求职画像</h1>
          <p>这些信息会被 AI 记住，跨会话、跨设备自动用于个性化推荐和建议。</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="profile-form">
        <section className="profile-section">
          <h2><Sparkles size={16} /> 个人背景</h2>
          <div className="profile-grid">
            <label>
              <span>学校</span>
              <input value={form.school} onChange={(e) => update("school", e.target.value)} placeholder="如南京大学" />
            </label>
            <label>
              <span>专业</span>
              <input value={form.major} onChange={(e) => update("major", e.target.value)} placeholder="如计算机科学与技术" />
            </label>
            <label>
              <span>学历</span>
              <input value={form.degree} onChange={(e) => update("degree", e.target.value)} placeholder="如本科/硕士" />
            </label>
            <label>
              <span>届别</span>
              <input value={form.graduationYear} onChange={(e) => update("graduationYear", e.target.value)} placeholder="如2027届" />
            </label>
          </div>
        </section>

        <section className="profile-section">
          <h2><Sparkles size={16} /> 求职意向</h2>
          <div className="profile-grid">
            <label className="profile-span-2">
              <span>目标岗位（用顿号或逗号分隔）</span>
              <input value={form.targetRoles} onChange={(e) => update("targetRoles", e.target.value)} placeholder="如产品经理、产品运营" />
            </label>
            <label>
              <span>意向城市（用顿号或逗号分隔）</span>
              <input value={form.targetCities} onChange={(e) => update("targetCities", e.target.value)} placeholder="如杭州、上海" />
            </label>
            <label>
              <span>行业偏好（用顿号或逗号分隔）</span>
              <input value={form.industries} onChange={(e) => update("industries", e.target.value)} placeholder="如互联网、金融科技" />
            </label>
          </div>
        </section>

        <section className="profile-section">
          <h2><Sparkles size={16} /> 求职阶段</h2>
          <div className="profile-grid">
            <label>
              <span>当前阶段</span>
              <select value={form.phase} onChange={(e) => update("phase", e.target.value)}>
                {PHASE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label>
              <span>当前状态</span>
              <select value={form.status} onChange={(e) => update("status", e.target.value)}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="profile-section">
          <h2><Sparkles size={16} /> 偏好设置</h2>
          <div className="profile-grid">
            <label>
              <span>笔试偏好</span>
              <select value={form.writtenExam} onChange={(e) => update("writtenExam", e.target.value)}>
                {WRITTEN_EXAM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>
              <span>公司类型偏好（用顿号或逗号分隔）</span>
              <input value={form.companyTypes} onChange={(e) => update("companyTypes", e.target.value)} placeholder="如国企、外企、互联网" />
            </label>
            <label>
              <span>薪资预期</span>
              <input value={form.salaryExpectation} onChange={(e) => update("salaryExpectation", e.target.value)} placeholder="如15-20k" />
            </label>
          </div>
        </section>

        <section className="profile-section">
          <h2><Sparkles size={16} /> 经历摘要</h2>
          <label className="profile-span-2">
            <span>一句话概括你的核心经历（供 AI 推荐和面试准备时参考）</span>
            <textarea
              value={form.experienceSummary}
              onChange={(e) => update("experienceSummary", e.target.value)}
              rows={3}
              placeholder="如：2段互联网产品实习，主导过1个从0到1的工具类产品，擅长用户研究和数据复盘"
            />
          </label>
        </section>

        <div className="profile-actions">
          <button type="submit" disabled={saving} className="profile-save-btn">
            <Save size={16} />
            {saving ? "保存中…" : "保存画像"}
          </button>
          {saved && <span className="profile-saved">已保存 ✓</span>}
          {error && <span className="profile-error">{error}</span>}
        </div>
      </form>
    </div>
  );
}
