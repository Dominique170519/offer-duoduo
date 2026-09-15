import assert from "node:assert/strict";
import test from "node:test";
import { toolActivityLabel } from "../src/features/chat/toolActivity.ts";

test("maps known agent tools to friendly labels", () => {
  assert.equal(toolActivityLabel("opportunity_search"), "正在查询校招岗位库");
  assert.equal(toolActivityLabel("knowledge_search"), "正在检索求职知识库");
  assert.equal(toolActivityLabel("application_context"), "正在读取你的投递记录");
});

test("falls back to a generic label for unknown tools", () => {
  assert.equal(toolActivityLabel("unknown_tool"), "正在处理");
  assert.equal(toolActivityLabel(""), "正在处理");
});
