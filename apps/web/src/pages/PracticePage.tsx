import { useState, useMemo, useRef, useEffect } from "react";
import {
  Search,
  X,
  Zap,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  Shuffle,
  ChevronDown,
  Sparkles,
  Flame
} from "lucide-react";
import type { PracticeQuestion } from "../features/practice/types";
import rawQuestions from "../features/practice/questions-data.json";
import "../styles/practice.css";

const questions: PracticeQuestion[] = rawQuestions as PracticeQuestion[];

const QUICK_TAGS = [
  "夏天 胃气",
  "四大传统节日",
  "学习新事物 恐惧",
  "动植物 快速掩埋",
  "莫扎特效应",
  "荷尔蒙经济",
  "肥胖 疾病",
  "中国读本 十几万字",
  "面孔识别",
  "科普文章 枯燥"
];

export function PracticePage() {
  const [activeTab, setActiveTab] = useState<"flash" | "practice">("flash");

  // ==========================================
  // Flash Search State
  // ==========================================
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedAnalysis, setExpandedAnalysis] = useState<Record<string, boolean>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto focus search input when entering flash search tab
  useEffect(() => {
    if (activeTab === "flash") {
      searchInputRef.current?.focus();
    }
  }, [activeTab]);

  // Fast fuzzy match calculation
  const searchResults = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) return [];

    const keywords = trimmed.split(/[\s,，、]+/).filter(Boolean);
    if (keywords.length === 0) return [];

    const scored: Array<{ question: PracticeQuestion; score: number; matchedOption?: string }> = [];

    for (const q of questions) {
      const stemLower = q.stem.toLowerCase();
      let matchCount = 0;
      let matchedStem = false;

      for (const kw of keywords) {
        if (stemLower.includes(kw)) {
          matchCount += 3;
          matchedStem = true;
        }
      }

      // Check options
      let matchedOption: string | undefined;
      for (const opt of q.options) {
        const optLower = opt.text.toLowerCase();
        for (const kw of keywords) {
          if (optLower.includes(kw)) {
            matchCount += 2;
            matchedOption = opt.label;
          }
        }
      }

      if (matchCount > 0) {
        // Bonus for all keywords matching
        const allMatch = keywords.every(kw => stemLower.includes(kw) || q.options.some(o => o.text.toLowerCase().includes(kw)));
        if (allMatch) matchCount += 10;
        scored.push({ question: q, score: matchCount, matchedOption });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }, [searchQuery]);

  const topMatch = searchResults.length > 0 ? searchResults[0].question : null;
  const secondaryMatches = searchResults.slice(1, 6);

  const toggleAnalysis = (id: string) => {
    setExpandedAnalysis(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    searchInputRef.current?.focus();
  };

  // Helper to highlight matched keywords
  const renderHighlightedText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const keywords = query.trim().split(/[\s,，、]+/).filter(Boolean);
    if (keywords.length === 0) return text;

    const regex = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    const parts = text.split(regex);

    return parts.map((part, i) =>
      keywords.some(k => k.toLowerCase() === part.toLowerCase()) ? (
        <strong key={i} className="highlight">{part}</strong>
      ) : (
        part
      )
    );
  };

  // ==========================================
  // Practice Mode State
  // ==========================================
  const [currentPracticeIndex, setCurrentPracticeIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [timerActive, setTimerActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);

  const currentQ = questions[currentPracticeIndex] || questions[0];
  const currentAnswer = userAnswers[currentQ?.id];

  // 60-second exam countdown timer
  useEffect(() => {
    if (!timerActive || activeTab !== "practice") return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timerActive, currentPracticeIndex, activeTab]);

  const handleSelectOption = (label: string) => {
    if (userAnswers[currentQ.id]) return; // already answered
    setUserAnswers(prev => ({ ...prev, [currentQ.id]: label }));
  };

  const handleNextQuestion = () => {
    if (currentPracticeIndex < questions.length - 1) {
      setCurrentPracticeIndex(prev => prev + 1);
      setTimeLeft(60);
    }
  };

  const handlePrevQuestion = () => {
    if (currentPracticeIndex > 0) {
      setCurrentPracticeIndex(prev => prev - 1);
      setTimeLeft(60);
    }
  };

  const handleRandomQuestion = () => {
    const randomIndex = Math.floor(Math.random() * questions.length);
    setCurrentPracticeIndex(randomIndex);
    setTimeLeft(60);
  };

  // Find target option for hero display
  const targetOption = topMatch?.options.find(o => o.label === topMatch.answer);

  return (
    <div className="practice-page">
      {/* 顶部标题与模式切换 */}
      <header className="practice-header">
        <div className="practice-header__titles">
          <div className="practice-header__title-row">
            <h1>笔试练习中心</h1>
            <span className="practice-badge-pulse">
              <Flame size={13} aria-hidden="true" /> 已载入 100 道北森真题
            </span>
          </div>
          <p className="practice-header__desc">
            秋招/春招机考真题演练，支持 60 秒考场极速救急查题与大号答案秒现
          </p>
        </div>

        <div className="practice-mode-switch" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "flash"}
            className={`practice-mode-btn ${activeTab === "flash" ? "active" : ""}`}
            onClick={() => setActiveTab("flash")}
          >
            <Zap size={16} aria-hidden="true" />
            <span>⚡ 考场极速秒搜</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "practice"}
            className={`practice-mode-btn ${activeTab === "practice" ? "active" : ""}`}
            onClick={() => setActiveTab("practice")}
          >
            <BookOpen size={16} aria-hidden="true" />
            <span>📖 模拟刷题模考</span>
          </button>
        </div>
      </header>

      {/* ========================================================= */}
      {/* ⚡ 考场极速秒搜模式 (Flash Search Mode)                     */}
      {/* ========================================================= */}
      {activeTab === "flash" && (
        <section className="flash-search-container" aria-label="考场极速搜题">
          {/* 大搜索输入框 */}
          <div className="flash-search-box">
            <Search className="flash-search-icon" size={22} aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              className="flash-search-input"
              placeholder="考场急搜：敲 2~3 个生僻词（如：夏天 胃气 / 莫扎特 / 荷尔蒙）"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="极速搜题关键词"
            />
            {searchQuery && (
              <button
                type="button"
                className="flash-search-clear"
                onClick={handleClearSearch}
                title="一键清空"
                aria-label="一键清空搜索框"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* 快捷特征词标签 */}
          <div className="flash-tags">
            <span>试一试快捷词：</span>
            {QUICK_TAGS.map(tag => (
              <button
                key={tag}
                type="button"
                className="flash-tag-btn"
                onClick={() => {
                  setSearchQuery(tag);
                  searchInputRef.current?.focus();
                }}
              >
                {tag}
              </button>
            ))}
          </div>

          {/* 结果展示 */}
          {topMatch ? (
            <div className="flash-hero-card" role="region" aria-live="polite">
              <div className="flash-hero-top">
                <span className="flash-match-badge">
                  <Sparkles size={14} aria-hidden="true" /> 极速匹配命中
                </span>
                <span className="flash-question-no">
                  第 {topMatch.index} 题 · {topMatch.category}
                </span>
              </div>

              {/* 核心亮点：超大字号答案区域 */}
              <div className="flash-giant-answer-box">
                <div className="flash-giant-letter" aria-label={`正确答案是 ${topMatch.answer}`}>
                  {topMatch.answer || "?"}
                </div>
                <div className="flash-giant-content">
                  <div className="flash-giant-label">正确选项速对</div>
                  <div className="flash-giant-text">
                    {targetOption ? `${targetOption.label}: ${targetOption.text}` : `选项 ${topMatch.answer}`}
                  </div>
                </div>
              </div>

              {/* 题干展示（关键词高亮） */}
              <div className="flash-stem-box">
                {renderHighlightedText(topMatch.stem, searchQuery)}
              </div>

              {/* 所有选项列表 */}
              <div className="flash-options-list">
                {topMatch.options.map(opt => {
                  const isCorrect = opt.label === topMatch.answer;
                  return (
                    <div
                      key={opt.label}
                      className={`flash-option-item ${isCorrect ? "correct" : ""}`}
                    >
                      <span className="opt-key">{opt.label}</span>
                      <span className="opt-text">{opt.text}</span>
                      {isCorrect && (
                        <CheckCircle2 size={18} color="#10b981" aria-label="正确选项" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 解析展开/收起 */}
              {topMatch.analysis && (
                <>
                  <button
                    type="button"
                    className="flash-analysis-toggle"
                    onClick={() => toggleAnalysis(topMatch.id)}
                  >
                    <span>{expandedAnalysis[topMatch.id] ? "收起解析" : "查看深度解析"}</span>
                    <ChevronDown
                      size={14}
                      style={{
                        transform: expandedAnalysis[topMatch.id] ? "rotate(180deg)" : "none",
                        transition: "transform 0.15s"
                      }}
                      aria-hidden="true"
                    />
                  </button>
                  {expandedAnalysis[topMatch.id] && (
                    <div className="flash-analysis-content">
                      {topMatch.analysis}
                    </div>
                  )}
                </>
              )}

              {/* 次要可能匹配 */}
              {secondaryMatches.length > 0 && (
                <div className="flash-secondary-matches">
                  <h3 className="flash-secondary-title">其他可能的相关题目：</h3>
                  {secondaryMatches.map(({ question: sq }) => (
                    <div
                      key={sq.id}
                      className="flash-secondary-card"
                      onClick={() => {
                        // Switch hero to this question by prefilling search
                        setSearchQuery(sq.stem.slice(0, 15));
                      }}
                    >
                      <span className="sec-stem">第 {sq.index} 题: {sq.stem}</span>
                      <span className="sec-ans">【 {sq.answer} 】</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : searchQuery.trim() ? (
            <div className="flash-empty-state">
              <div className="flash-empty-icon">
                <AlertCircle size={28} aria-hidden="true" />
              </div>
              <h2 className="flash-empty-title">未找到完全吻合的题目</h2>
              <p className="flash-empty-desc">
                建议尝试精简关键词（例如只保留 2 个最具辨识度的词汇），或者点击上方快捷标签试搜。
              </p>
            </div>
          ) : (
            <div className="flash-empty-state">
              <div className="flash-empty-icon">
                <Zap size={28} aria-hidden="true" />
              </div>
              <h2 className="flash-empty-title">考场秒搜神器已就绪</h2>
              <p className="flash-empty-desc">
                限时 60 秒答题高压下，无需敲完整句子，仅需在搜索框敲入 2~3 个冷门特征词，0.01 秒内直出巨大字号答案！
              </p>
            </div>
          )}
        </section>
      )}

      {/* ========================================================= */}
      {/* 📖 模拟刷题模考模式 (Practice Mode)                         */}
      {/* ========================================================= */}
      {activeTab === "practice" && (
        <section className="practice-card" aria-label="题库练习">
          <div className="practice-card-header">
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span className="practice-category-tag">{currentQ.category}</span>
              <span style={{ fontSize: "0.9rem", color: "var(--of-text-muted)", fontWeight: 500 }}>
                第 {currentPracticeIndex + 1} / {questions.length} 题
              </span>
            </div>

            {/* 60秒限时倒计时器 */}
            <div className="practice-timer-container">
              <button
                type="button"
                className="practice-action-btn"
                style={{ fontSize: "0.8rem", padding: "0.3rem 0.65rem" }}
                onClick={() => {
                  setTimerActive(!timerActive);
                  setTimeLeft(60);
                }}
              >
                <Clock size={14} aria-hidden="true" />
                {timerActive ? "关闭限时" : "开启 60s 模考计时"}
              </button>

              {timerActive && (
                <span
                  className={`practice-timer-pill ${
                    timeLeft <= 10 ? "danger" : timeLeft <= 20 ? "warning" : ""
                  }`}
                >
                  ⏱️ {timeLeft}s
                </span>
              )}
            </div>
          </div>

          {/* 题干 */}
          <div className="practice-stem">
            {currentQ.stem}
          </div>

          {/* 选项列表 */}
          <div className="practice-options-grid">
            {currentQ.options.map(opt => {
              const isSelected = currentAnswer === opt.label;
              const isCorrectTarget = opt.label === currentQ.answer;

              let btnClass = "";
              if (currentAnswer) {
                if (isSelected) {
                  btnClass = isCorrectTarget ? "selected-correct" : "selected-wrong";
                } else if (isCorrectTarget) {
                  btnClass = "target-reveal";
                }
              }

              return (
                <button
                  key={opt.label}
                  type="button"
                  className={`practice-option-btn ${btnClass}`}
                  onClick={() => handleSelectOption(opt.label)}
                  disabled={Boolean(currentAnswer)}
                >
                  <span className="opt-badge">{opt.label}</span>
                  <span style={{ flex: 1, lineHeight: 1.5 }}>{opt.text}</span>
                  {currentAnswer && isCorrectTarget && (
                    <CheckCircle2 size={18} color="#10b981" aria-hidden="true" />
                  )}
                  {currentAnswer && isSelected && !isCorrectTarget && (
                    <X size={18} color="#ef4444" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>

          {/* 答题后即时反馈与解析 */}
          {currentAnswer && (
            <div
              className={`practice-feedback-banner ${
                currentAnswer === currentQ.answer ? "correct" : "wrong"
              }`}
            >
              {currentAnswer === currentQ.answer ? (
                <>
                  <CheckCircle2 size={20} aria-hidden="true" />
                  <span>回答正确！正确答案是【 {currentQ.answer} 】</span>
                </>
              ) : (
                <>
                  <AlertCircle size={20} aria-hidden="true" />
                  <span>
                    回答错误！你选择了【 {currentAnswer} 】，正确答案应为【 {currentQ.answer} 】
                  </span>
                </>
              )}
            </div>
          )}

          {currentAnswer && currentQ.analysis && (
            <div className="flash-analysis-content">
              <strong>题目解析：</strong>
              {currentQ.analysis}
            </div>
          )}

          {/* 底部导航 */}
          <div className="practice-bottom-nav">
            <div className="practice-nav-group">
              <button
                type="button"
                className="practice-action-btn"
                onClick={handlePrevQuestion}
                disabled={currentPracticeIndex === 0}
              >
                <ChevronLeft size={16} aria-hidden="true" />
                <span>上一题</span>
              </button>

              <button
                type="button"
                className="practice-action-btn primary"
                onClick={handleNextQuestion}
                disabled={currentPracticeIndex === questions.length - 1}
              >
                <span>下一题</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>

              <button
                type="button"
                className="practice-action-btn"
                onClick={handleRandomQuestion}
                title="随机刷一道题"
              >
                <Shuffle size={15} aria-hidden="true" />
                <span>随机</span>
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <select
                className="practice-jump-select"
                value={currentPracticeIndex}
                onChange={e => {
                  setCurrentPracticeIndex(Number(e.target.value));
                  setTimeLeft(60);
                }}
                aria-label="题号跳转"
              >
                {questions.map((q, idx) => (
                  <option key={q.id} value={idx}>
                    第 {idx + 1} 题 ({userAnswers[q.id] ? (userAnswers[q.id] === q.answer ? "✓ 对" : "✗ 错") : "未做"})
                  </option>
                ))}
              </select>

              {currentAnswer && (
                <button
                  type="button"
                  className="practice-action-btn"
                  onClick={() => {
                    setUserAnswers(prev => {
                      const next = { ...prev };
                      delete next[currentQ.id];
                      return next;
                    });
                  }}
                  title="重新作答本题"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  <span>重做</span>
                </button>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
