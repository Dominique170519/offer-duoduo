import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { createOfferFlowServer } from "../src/server.ts";
import { loadApiConfig } from "../src/config.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

const toolCall = (name, args, id = "call-1") => ({
  tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }]
});

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

// Replace only the external model service; keep the HTTP API, model stream
// parser, registered tools, SSE serialization and message storage real.
async function harness(t, reply) {
  const requests = [];
  const model = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    response.setHeader("content-type", "text/event-stream");
    for (const delta of reply(body, requests.length)) {
      response.write(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`);
    }
    response.end("data: [DONE]\n\n");
  });
  const modelUrl = await listen(model);
  t.after(() => close(model));
  const store = new MemoryStore({ persistence: false, allowDemoAuth: false });
  const config = {
    ...loadApiConfig({ NODE_ENV: "test" }),
    aiApiKey: "synthetic-test-key",
    aiBaseUrl: modelUrl,
    opportunitySourceUrl: undefined,
    opportunitySeedPath: undefined
  };
  const app = createOfferFlowServer({ config, store });
  await app.ready;
  const baseUrl = await listen(app.server);
  t.after(() => close(app.server));
  const user = await store.createUser("agent-test@example.invalid", "测试用户", "synthetic-pass-2026");
  const session = await store.createSession(user.id, "user", "2099-01-01T00:00:00.000Z");
  const now = new Date().toISOString();
  await store.replaceOpportunityFeed({
    fetchedAt: now,
    sourceUpdatedAt: now,
    opportunities: ["上海", "北京"].map((city, index) => ({
      id: `job-${index}`, company: `测试公司${index}`, title: "产品经理",
      roleTags: ["产品经理"], cities: [city], graduationYears: ["2027届"],
      officialUrl: `https://jobs.example.invalid/${index}`, deadline: "2099-01-01", updatedAt: now
    }))
  });
  async function chat(prompt = "你好") {
    const conversation = await store.createConversation(user.id);
    const response = await fetch(`${baseUrl}/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ clientMessageId: `user-${conversation.id}`, content: prompt })
    });
    assert.equal(response.status, 200);
    const wire = await response.text();
    const events = wire.split("\n").filter(line => line.startsWith("data:")).map(line => JSON.parse(line.slice(5)));
    const savedResponse = await fetch(`${baseUrl}/v1/conversations/${conversation.id}`, {
      headers: { authorization: `Bearer ${session.accessToken}` }
    });
    const saved = await savedResponse.json();
    const message = saved.data.messages.find(item => item.role === "assistant");
    return { events, message };
  }
  return { chat, requests };
}

test("agent persists the latest searched opportunities for cards and conversation reload", async t => {
  const { chat } = await harness(t, (_body, turn) => turn < 3
    ? [toolCall("opportunity_search", { role: "产品经理", city: turn === 1 ? "上海" : "北京" }, `call-${turn}`)]
    : [{ content: "找到北京的产品经理岗位。" }]);
  const { events, message } = await chat("帮我找岗位");
  assert.equal(message.status, "complete");
  assert.equal(message.opportunityResults?.total, 1);
  assert.equal(message.opportunityResults.items[0].id, "job-1");
  assert.deepEqual(message.opportunityResults.items[0].roleTags, ["产品经理"]);
  assert.equal(message.opportunityResults.items[0].officialUrl, "https://jobs.example.invalid/1");
  assert.ok(message.opportunityResults.fetchedAt);
  assert.deepEqual(events.find(event => event.type === "message.completed").message, message);
});

test("agent publishes and persists new tool citations without duplicates", async t => {
  const { chat } = await harness(t, (_body, turn) => turn < 3
    ? [toolCall("knowledge_search", { query: "STAR", limit: 1 }, `call-${turn}`)]
    : [{ content: "可以使用 STAR 结构。" }]);
  const { events, message } = await chat();
  assert.deepEqual(message.citations.map(citation => citation.id), ["resume-star"]);
  assert.equal(events.filter(event => event.type === "citation" && event.citation.id === "resume-star").length, 1);
  assert.deepEqual(events.find(event => event.type === "message.completed").message.citations, message.citations);
});

test("empty agent answers are stored as errors and expose a retryable error event", async t => {
  const { chat } = await harness(t, () => [{}]);
  const { events, message } = await chat();
  assert.equal(message.status, "error");
  assert.equal(events.some(event => event.type === "message.completed" && event.message.status === "complete"), false);
  const error = events.find(event => event.type === "error");
  assert.equal(error?.error.code, "AGENT_EMPTY_RESPONSE");
  assert.match(error.error.message, /重试/);
});

test("tool prefaces do not turn an exhausted agent loop into a successful answer", async t => {
  const { chat, requests } = await harness(t, (_body, turn) => [
    { content: "我先查一下。" },
    toolCall("knowledge_search", { query: "STAR" }, `call-${turn}`)
  ]);
  const { events, message } = await chat();
  assert.equal(requests.length, 5);
  assert.equal(message.status, "error");
  assert.equal(events.find(event => event.type === "error")?.error.code, "AGENT_ITERATION_LIMIT");
  assert.ok(message.citations.some(citation => citation.id === "resume-star"));
});

test("successful direct agent answers remain complete", async t => {
  const { chat } = await harness(t, () => [{ content: "你好，有什么求职问题需要一起处理？" }]);
  const { events, message } = await chat();
  assert.equal(message.status, "complete");
  assert.ok(message.content.length > 0);
  assert.equal(events.at(-1).type, "done");
});

test("empty model responses still persist opportunity cards when deterministic fallback succeeds", async t => {
  const { chat } = await harness(t, () => [{}]);
  const { message } = await chat("帮我找上海产品经理岗位");
  assert.equal(message.status, "complete");
  assert.equal(message.opportunityResults?.items[0]?.id, "job-0");
  assert.ok(message.content.trim().length > 0);
});
