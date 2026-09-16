import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { CalendarDayEvent, CalendarEvent, CalendarEventType } from "@offerflow/domain";
import { CALENDAR_EVENT_TYPE_LABELS, CALENDAR_EVENT_TYPES } from "@offerflow/domain";
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { api } from "../app/api";
import { createUuid } from "../app/id";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function toDayKeyOfEvent(value: string): string {
  const match = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return value.slice(0, 10);
}

function typeTone(type: CalendarEventType): string {
  if (type === "interview") return "calendar-chip--interview";
  if (type === "written_test" || type === "assessment") return "calendar-chip--test";
  if (type === "deadline") return "calendar-chip--deadline";
  if (type === "application") return "calendar-chip--application";
  if (type === "offer_decision") return "calendar-chip--offer";
  return "calendar-chip--other";
}

function isToday(key: string): boolean {
  return key === dayKey(new Date());
}

interface EventDraft {
  type: CalendarEventType;
  title: string;
  startsAt: string;
  company: string;
  position: string;
  note: string;
}

const EMPTY_DRAFT: EventDraft = {
  type: "interview",
  title: "",
  startsAt: "",
  company: "",
  position: "",
  note: ""
};

export function CalendarPage() {
  const [monthOffset, setMonthOffset] = useState(0);
  const [events, setEvents] = useState<CalendarDayEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<CalendarDayEvent>();
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState<EventDraft>(EMPTY_DRAFT);

  const anchor = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  }, [monthOffset]);

  const monthLabel = `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月`;

  const range = useMemo(() => {
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const fromKey = dayKey(new Date(from.getTime() - 7 * 86_400_000));
    const toKey = dayKey(new Date(to.getTime() + 7 * 86_400_000));
    return { fromKey, toKey };
  }, [anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await api.calendar.aggregate(range.fromKey, range.toKey);
      setEvents(response.events ?? []);
    } catch {
      setError("日历加载失败，请确认 API 服务已启动");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarDayEvent[]>();
    for (const event of events) {
      const key = toDayKeyOfEvent(event.startsAt);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    return map;
  }, [events]);

  const cells = useMemo(() => {
    const firstWeekday = (anchor.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    const cells: Array<{ key: string; day: number; inMonth: boolean }> = [];
    for (let index = 0; index < 42; index += 1) {
      const day = index - firstWeekday + 1;
      const date = new Date(anchor.getFullYear(), anchor.getMonth(), day);
      cells.push({
        key: dayKey(date),
        day: date.getDate(),
        inMonth: day >= 1 && day <= daysInMonth
      });
    }
    return cells;
  }, [anchor]);

  const actionEvents = useMemo(() => {
    const today = new Date();
    const soon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
    const soonKey = dayKey(soon);
    const todayKey = dayKey(today);
    return events
      .filter((event) => {
        const key = toDayKeyOfEvent(event.startsAt);
        return key >= todayKey && key <= soonKey;
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 6);
  }, [events]);

  async function submitEvent(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.startsAt) return;
    const now = new Date().toISOString();
    const record: CalendarEvent = {
      id: createUuid(),
      type: draft.type,
      title: draft.title.trim(),
      startsAt: draft.startsAt,
      company: draft.company.trim() || undefined,
      position: draft.position.trim() || undefined,
      note: draft.note.trim() || undefined,
      createdAt: now,
      updatedAt: now
    };
    try {
      await api.calendar.createEvent({ event: record });
      setComposing(false);
      setDraft(EMPTY_DRAFT);
      await load();
    } catch {
      setError("保存失败，请稍后重试");
    }
  }

  async function removeEvent(event: CalendarDayEvent) {
    if (!event.deletable) return;
    try {
      await api.calendar.deleteEvent(event.id);
      setSelected(undefined);
      await load();
    } catch {
      setError("删除失败，请稍后重试");
    }
  }

  return (
    <div className="data-page calendar-page">
      <header className="page-header">
        <div>
          <span className="page-kicker">
            <CalendarDays size={14} aria-hidden="true" />
            时间维度 · 求职日历
          </span>
          <h1>求职日历</h1>
          <p>
            面试、笔试、投递与岗位截止都在一条时间轴上。日历自动聚合你的投递记录与校招岗位截止，
            也可以让陪跑助手帮你把时间安排记进来。
          </p>
        </div>
        <div className="page-header-meta">
          <button type="button" className="calendar-add-button" onClick={() => setComposing(true)}>
            <Plus size={15} aria-hidden="true" />
            添加事件
          </button>
        </div>
      </header>

      {actionEvents.length > 0 && (
        <section className="calendar-action" aria-label="近期行动">
          <div className="calendar-action__head">
            <Sparkles size={14} aria-hidden="true" />
            今天起 3 天内
          </div>
          <div className="calendar-action__list">
            {actionEvents.map((event) => (
              <button
                type="button"
                key={event.id}
                className="calendar-action__item"
                onClick={() => setSelected(event)}
              >
                <span className={`calendar-chip ${typeTone(event.type)}`}>
                  {CALENDAR_EVENT_TYPE_LABELS[event.type]}
                </span>
                <span className="calendar-action__date">{toDayKeyOfEvent(event.startsAt)}</span>
                <span className="calendar-action__title">{event.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="calendar-board" aria-label="月历">
        <div className="calendar-board__head">
          <div className="calendar-board__nav">
            <button
              type="button"
              aria-label="上个月"
              onClick={() => setMonthOffset((offset) => offset - 1)}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <strong>{monthLabel}</strong>
            <button
              type="button"
              aria-label="下个月"
              onClick={() => setMonthOffset((offset) => offset + 1)}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            {monthOffset !== 0 && (
              <button type="button" className="calendar-board__today" onClick={() => setMonthOffset(0)}>
                回到今天
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="calendar-empty">正在加载日历…</div>
        ) : error ? (
          <div className="calendar-empty">{error}</div>
        ) : (
          <>
            <div className="calendar-grid" role="grid" aria-label={monthLabel}>
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="calendar-grid__weekday" role="columnheader">
                  {label}
                </div>
              ))}
              {cells.map((cell) => {
                const dayEvents = eventsByDay.get(cell.key) ?? [];
                const today = isToday(cell.key);
                return (
                  <div
                    key={cell.key}
                    role="gridcell"
                    className={`calendar-cell${cell.inMonth ? "" : " calendar-cell--muted"}${today ? " calendar-cell--today" : ""}`}
                  >
                    <div className="calendar-cell__date">{cell.day}</div>
                    <div className="calendar-cell__events">
                      {dayEvents.slice(0, 3).map((event) => (
                        <button
                          type="button"
                          key={event.id}
                          className={`calendar-chip ${typeTone(event.type)}`}
                          title={event.title}
                          onClick={() => setSelected(event)}
                        >
                          {event.title}
                        </button>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="calendar-cell__more">+{dayEvents.length - 3} 项</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="calendar-legend">
              标注说明：<span className="calendar-chip calendar-chip--interview">面试</span>
              <span className="calendar-chip calendar-chip--test">笔试/测评</span>
              <span className="calendar-chip calendar-chip--deadline">截止</span>
              <span className="calendar-chip calendar-chip--application">投递</span>
              <span className="calendar-chip calendar-chip--offer">Offer 确认</span>
              <span className="calendar-chip calendar-chip--other">其他</span>
              <span className="calendar-legend__note">投递与截止事件由你的记录自动生成，不可删除。</span>
            </p>
          </>
        )}
      </section>

      {selected && (
        <div className="calendar-modal-backdrop" onClick={() => setSelected(undefined)}>
          <div className="calendar-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="calendar-modal__head">
              <span className={`calendar-chip ${typeTone(selected.type)}`}>
                {CALENDAR_EVENT_TYPE_LABELS[selected.type]}
              </span>
              <button
                type="button"
                aria-label="关闭"
                className="calendar-modal__close"
                onClick={() => setSelected(undefined)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <h2>{selected.title}</h2>
            <dl className="calendar-modal__meta">
              <div>
                <dt>
                  <CalendarClock size={14} aria-hidden="true" /> 时间
                </dt>
                <dd>{selected.startsAt.replace("T", " ").slice(0, 16)}</dd>
              </div>
              {selected.company && (
                <div>
                  <dt>公司</dt>
                  <dd>{selected.company}</dd>
                </div>
              )}
              {selected.position && (
                <div>
                  <dt>岗位</dt>
                  <dd>{selected.position}</dd>
                </div>
              )}
              {selected.note && (
                <div>
                  <dt>备注</dt>
                  <dd>{selected.note}</dd>
                </div>
              )}
            </dl>
            {selected.source !== "manual" && (
              <p className="calendar-modal__hint">
                <Sparkles size={13} aria-hidden="true" />
                由你的投递记录或岗位库自动生成
              </p>
            )}
            {selected.deletable && (
              <button type="button" className="calendar-modal__delete" onClick={() => void removeEvent(selected)}>
                <Trash2 size={14} aria-hidden="true" />
                删除这条事件
              </button>
            )}
          </div>
        </div>
      )}

      {composing && (
        <div className="calendar-modal-backdrop" onClick={() => setComposing(false)}>
          <div className="calendar-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="calendar-modal__head">
              <span className="page-kicker">新增日历事件</span>
              <button
                type="button"
                aria-label="关闭"
                className="calendar-modal__close"
                onClick={() => setComposing(false)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <form className="calendar-form" onSubmit={(event) => void submitEvent(event)}>
              <label>
                类型
                <select
                  value={draft.type}
                  onChange={(event) => setDraft({ ...draft, type: event.target.value as CalendarEventType })}
                >
                  {CALENDAR_EVENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {CALENDAR_EVENT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                标题
                <input
                  required
                  value={draft.title}
                  placeholder="例如：美团二面 / 微博笔试"
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
              </label>
              <label>
                时间
                <input
                  required
                  type="datetime-local"
                  value={draft.startsAt}
                  onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
                />
              </label>
              <div className="calendar-form__row">
                <label>
                  公司（可选）
                  <input
                    value={draft.company}
                    placeholder="美团"
                    onChange={(event) => setDraft({ ...draft, company: event.target.value })}
                  />
                </label>
                <label>
                  岗位（可选）
                  <input
                    value={draft.position}
                    placeholder="运营"
                    onChange={(event) => setDraft({ ...draft, position: event.target.value })}
                  />
                </label>
              </div>
              <label>
                备注（可选）
                <textarea
                  rows={2}
                  value={draft.note}
                  placeholder="准备要点、面试官线索…"
                  onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                />
              </label>
              <div className="calendar-form__actions">
                <button type="button" className="calendar-form__cancel" onClick={() => setComposing(false)}>
                  取消
                </button>
                <button type="submit" className="calendar-add-button">
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
