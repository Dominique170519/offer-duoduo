import assert from "node:assert/strict";
import test from "node:test";
import { runAgent } from "../src/agent/runtime.ts";

function fakeLlm(steps) {
  let index = 0;
  return {
    model: "fake",
    async *step() {
      const step = steps[Math.min(index, steps.length - 1)];
      index += 1;
      if (step.calls) yield { type: "tool_calls", calls: step.calls };
      if (step.text) {
        for (const delta of step.text) yield { type: "text", delta };
      }
    }
  };
}

test("agent loop executes a tool call, feeds back the result, then streams the final answer", async () => {
  const executed = [];
  const tool = {
    name: "opportunity_search",
    description: "fake",
    inputSchema: {},
    async execute(args, ctx) {
      executed.push({ args, userId: ctx.userId });
      return { total: 1, items: [{ title: "产品经理" }] };
    }
  };
  const llm = fakeLlm([
    { calls: [{ id: "call-1", name: "opportunity_search", args: { role: "产品经理" } }] },
    { text: ["查到了", " 1 个岗位"] }
  ]);
  const events = [];
  for await (const event of runAgent({
    prompt: "找产品经理岗位",
    history: [],
    llm,
    tools: [tool],
    toolContext: { userId: "u1", store: {} },
    systemPrompt: "test",
    maxIterations: 3
  })) {
    events.push(event);
  }
  assert.deepEqual(executed, [{ args: { role: "产品经理" }, userId: "u1" }]);
  assert.deepEqual(events.map((e) => e.type), ["tool.started", "tool.completed", "delta", "delta"]);
  assert.equal(events[2].delta, "查到了");
  assert.equal(events[3].delta, " 1 个岗位");
});

test("unknown tool is reported without crashing the loop", async () => {
  const llm = fakeLlm([
    { calls: [{ id: "call-x", name: "missing_tool", args: {} }] },
    { text: ["完成"] }
  ]);
  const events = [];
  for await (const event of runAgent({
    prompt: "hi",
    history: [],
    llm,
    tools: [],
    toolContext: { userId: "u1", store: {} },
    systemPrompt: "test",
    maxIterations: 3
  })) {
    events.push(event);
  }
  assert.deepEqual(events.map((e) => e.type), ["tool.completed", "delta"]);
  assert.ok(events[0].result.error.includes("未知工具"));
});

test("fallback streams a final answer when the model returns nothing", async () => {
  const llm = fakeLlm([{ text: [] }]);
  const events = [];
  for await (const event of runAgent({
    prompt: "hi",
    history: [],
    llm,
    tools: [],
    toolContext: { userId: "u1", store: {} },
    systemPrompt: "test",
    fallback: async () => ({ kind: "final", content: "兜底回答" }),
    maxIterations: 3
  })) {
    events.push(event);
  }
  assert.deepEqual(events.map((e) => e.type), ["delta"]);
  assert.equal(events[0].delta, "兜底回答");
});

test("iteration cap reports an incomplete run when nothing was streamed", async () => {
  const llm = fakeLlm([{ calls: [{ id: "c", name: "opportunity_search", args: {} }] }]);
  await assert.rejects(async () => {
    for await (const _event of runAgent({
      prompt: "hi",
      history: [],
      llm,
      tools: [],
      toolContext: { userId: "u1", store: {} },
      systemPrompt: "test",
      maxIterations: 2
    })) { /* Drain until the iteration limit is reported. */ }
  }, error => error.code === "AGENT_ITERATION_LIMIT");
});

test("tool logs retain operational metadata without query, result or exception payloads", async t => {
  const lines = [];
  t.mock.method(console, "log", (...args) => lines.push(args));
  for (const fail of [false, true]) {
    const tool = {
      name: "knowledge_search", description: "test", inputSchema: {},
      async execute() {
        if (fail) throw new Error("PRIVATE_EXCEPTION_SENTINEL");
        return [{ excerpt: "PRIVATE_RESUME_SENTINEL" }];
      }
    };
    for await (const _event of runAgent({
      prompt: "test", history: [], systemPrompt: "test", tools: [tool],
      toolContext: { userId: "private-user", store: {} },
      llm: fakeLlm([
        { calls: [{ id: "call", name: tool.name, args: { query: "PRIVATE_QUERY_SENTINEL" } }] },
        { text: ["完成"] }
      ])
    })) { /* Drain the real runtime, including all log writes. */ }
  }
  const serialized = JSON.stringify(lines);
  assert.doesNotMatch(serialized, /PRIVATE_|private-user/);
  const completed = lines.filter(([event]) => event === "[agent] tool.completed").map(([, metadata]) => metadata);
  assert.deepEqual(completed.map(item => item.status), ["success", "error"]);
  assert.equal(completed[0].resultCount, 1);
  assert.ok(completed.every(item => item.tool === "knowledge_search" && item.turn === 1 && Number.isFinite(item.durationMs) && item.durationMs >= 0));
});

test("combo recommendation guidance is present in opportunity_search and application_context descriptions", async () => {
  const { createOpportunitySearchTool } = await import("../src/agent/tools/opportunity-search.ts");
  const { createApplicationContextTool } = await import("../src/agent/tools/application-context.ts");
  const opp = createOpportunitySearchTool({
    loadSnapshot: async () => ({ snapshot: {}, sourceAvailable: false })
  });
  const appCtx = createApplicationContextTool();
  assert.match(opp.description, /组合推荐/);
  assert.match(opp.description, /excludeCompanies/);
  assert.match(appCtx.description, /结合投递记录做推荐或规划/);
  assert.match(appCtx.description, /供机会检索排除与分析/);
});

test("opportunity_search excludes already-applied companies when excludeCompanies is provided", async () => {
  const { createOpportunitySearchTool } = await import("../src/agent/tools/opportunity-search.ts");
  const makeOpportunity = (id, company) => ({
    id,
    company,
    title: `${company}岗位`,
    batch: "秋招",
    status: "ongoing",
    deadline: "2026-09-30",
    graduationYears: ["2027"],
    roleTags: ["运营"],
    cities: ["北京"],
    officialUrl: `https://example.com/${id}`,
    sourceUrl: `https://example.com/${id}`
  });
  const tool = createOpportunitySearchTool({
    loadSnapshot: async () => ({
      snapshot: {
        opportunities: [
          makeOpportunity("o-1", "字节跳动"),
          makeOpportunity("o-2", "美团"),
          makeOpportunity("o-3", "新浪集团")
        ]
      },
      sourceAvailable: true
    })
  });
  const result = await tool.execute({ role: "运营", excludeCompanies: ["字节跳动", "美团"] });
  assert.deepEqual(result.items.map((item) => item.company), ["新浪集团"]);
  assert.deepEqual(result.excludedCompanies, ["字节跳动", "美团"]);
  assert.equal(result.total, 1);

  const noExclude = await tool.execute({ role: "运营" });
  assert.equal(noExclude.items.length, 3);
  assert.equal(noExclude.excludedCompanies, undefined);
});
