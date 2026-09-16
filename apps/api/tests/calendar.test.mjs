import assert from "node:assert/strict";
import test from "node:test";
import { MemoryStore } from "../src/store/memory-store.ts";
import { buildCalendarDayEvents } from "../src/calendar/aggregate.ts";
import { createCalendarAddTool } from "../src/agent/tools/calendar-add.ts";
import { createCalendarContextTool } from "../src/agent/tools/calendar-context.ts";

const USER_ID = "demo-user";

function store() {
  return new MemoryStore({ persistence: false });
}

function demoUserId(memory) {
  return memory.getDemoUser().id;
}

function event(overrides = {}) {
  return {
    id: "evt:test-1",
    type: "interview",
    title: "美团二面",
    startsAt: "2026-09-24T14:00:00+08:00",
    company: "美团",
    position: "产品运营",
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    ...overrides
  };
}

test("calendar events: create, list, update and delete round-trip", async () => {
  const memory = store();
  assert.equal(memory.listCalendarEvents(USER_ID).length, 0);

  const created = memory.createCalendarEvent(USER_ID, event());
  assert.equal(created.title, "美团二面");
  assert.equal(memory.listCalendarEvents(USER_ID).length, 1);

  const updated = memory.updateCalendarEvent(USER_ID, created.id, { title: "美团三面" });
  assert.equal(updated.title, "美团三面");
  assert.equal(updated.updatedAt, created.updatedAt === updated.updatedAt ? updated.updatedAt : updated.updatedAt);
  assert.notEqual(updated.startsAt, undefined);

  memory.deleteCalendarEvent(USER_ID, created.id);
  assert.equal(memory.listCalendarEvents(USER_ID).length, 0);
  assert.throws(
    () => memory.deleteCalendarEvent(USER_ID, created.id),
    (err) => err.code === "CALENDAR_EVENT_NOT_FOUND"
  );
});

test("calendar events stay scoped per user", async () => {
  const memory = store();
  const other = memory.createUser("other@example.com", "其他用户", "pass1234");
  memory.createCalendarEvent(USER_ID, event());
  memory.createCalendarEvent(other.id, event({ id: "evt:other-1", title: "他人事件" }));
  const mine = memory.listCalendarEvents(USER_ID);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].title, "美团二面");
});

test("calendar_add requires an explicit confirmation before writing", async () => {
  const memory = store();
  const tool = createCalendarAddTool();
  const args = {
    type: "written_test",
    title: "微博笔试",
    startsAt: "2026-09-20T10:00:00+08:00",
    confirm: false
  };

  const draft = await tool.execute(args, { userId: USER_ID, store: memory });
  assert.equal(draft.status, "draft");
  assert.equal(memory.listCalendarEvents(USER_ID).length, 0, "未确认前不允许写入");

  const created = await tool.execute({ ...args, confirm: true }, { userId: USER_ID, store: memory });
  assert.equal(created.status, "created");
  assert.equal(memory.listCalendarEvents(USER_ID).length, 1);
  assert.equal(memory.listCalendarEvents(USER_ID)[0].title, "微博笔试");
});

test("calendar_add rejects invalid input without writing", async () => {
  const memory = store();
  const tool = createCalendarAddTool();
  await assert.rejects(
    () => tool.execute({ type: "interview", title: "", startsAt: "2026-09-24", confirm: false }, { userId: USER_ID, store: memory }),
    /参数不完整/
  );
  assert.equal(memory.listCalendarEvents(USER_ID).length, 0);
});

test("calendar_context reports empty calendar and filters by window", async () => {
  const memory = store();
  const contextTool = createCalendarContextTool();
  const empty = await contextTool.execute({ days: 7 }, { userId: USER_ID, store: memory });
  assert.equal(empty.count, 0);
  assert.ok(empty.today);
  assert.ok(empty.from);
  assert.ok(empty.to);

  const today = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const inWindow = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate() + 1)}T10:00:00+08:00`;
  const outOfWindow = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate() + 60)}T00:00:00+08:00`;

  memory.createCalendarEvent(USER_ID, event({ startsAt: inWindow }));
  memory.createCalendarEvent(USER_ID, event({ id: "evt:test-2", type: "deadline", title: "新浪截止", startsAt: outOfWindow }));
  const within = await contextTool.execute({ days: 7 }, { userId: USER_ID, store: memory });
  assert.equal(within.count, 1);
  assert.equal(within.events[0].title, "美团二面");
  assert.equal(within.events[0].typeLabel, "面试");
});

test("aggregate merges manual, application and opportunity deadlines", async () => {
  const memory = store();
  memory.createCalendarEvent(USER_ID, event());
  memory.syncApplications(USER_ID, {
    deviceId: "device-a",
    cursor: "0",
    changes: [
      {
        changeId: "change-1",
        baseRevision: 0,
        application: {
          id: "application-1",
          company: "远航智能",
          position: "产品实习生",
          stage: "applied",
          sourceUrl: "https://jobs.example.com/1",
          sourceHost: "jobs.example.com",
          responsibilities: [],
          requirements: [],
          events: [],
          appliedAt: "2026-09-22T00:00:00+08:00",
          deadline: "2026-09-30T00:00:00+08:00",
          createdAt: "2026-09-16T00:00:00.000Z",
          updatedAt: "2026-09-16T00:00:00.000Z"
        }
      }
    ]
  });

  const events = await buildCalendarDayEvents(memory, USER_ID, {
    from: "2026-09-01",
    to: "2026-10-31",
    loadSnapshot: async () => ({
      sourceAvailable: true,
      snapshot: {
        fetchedAt: "2026-09-15T00:00:00.000Z",
        source: "test",
        opportunities: [
          {
            id: "opp-1",
            company: "新浪集团",
            title: "运营管培生",
            city: "北京",
            recruitmentType: "campus",
            graduateYear: "2027",
            deadline: "2026-09-18T00:00:00+08:00",
            sourceUrl: "https://example.com/job/1",
            sourceHost: "example.com",
            status: "open"
          }
        ]
      }
    })
  });

  assert.deepEqual(
    events.map((entry) => `${entry.startsAt}::${entry.title}`),
    [
      "2026-09-18::新浪集团 · 运营管培生 截止",
      "2026-09-22::投递 远航智能 · 产品实习生",
      "2026-09-24T14:00:00+08:00::美团二面",
      "2026-09-30::远航智能 · 产品实习生 投递截止"
    ]
  );
  const sources = [...new Set(events.map((entry) => entry.source))].sort();
  assert.deepEqual(sources, ["application", "manual", "opportunity"]);
  assert.deepEqual(events.filter((entry) => entry.deletable).map((entry) => entry.title), ["美团二面"]);
});

test("aggregate degrades gracefully when the opportunity feed is missing", async () => {
  const memory = store();
  memory.createCalendarEvent(USER_ID, event());
  const events = await buildCalendarDayEvents(memory, USER_ID, {
    loadSnapshot: async () => {
      throw new Error("feed unavailable");
    }
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].title, "美团二面");
});
