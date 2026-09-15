import type { ChatMessage } from "@offerflow/domain";
import type {
  AgentLlm,
  AgentLlmMessage,
  ParsedToolCall
} from "../ai/assistant.ts";
import {
  serializeToolResult,
  toToolDefinitions,
  type AgentTool,
  type ToolContext
} from "./tool.ts";

/** Events the runtime yields back to the SSE layer. */
export type AgentEvent =
  | { type: "tool.started"; tool: string; args: unknown }
  | { type: "tool.completed"; tool: string; result: unknown }
  | { type: "delta"; delta: string };

/**
 * A deterministic action used when the model produced nothing (safety net).
 * `final` streams a complete answer; `tool` executes one more tool call.
 */
export type FallbackResult =
  | { kind: "final"; content: string }
  | { kind: "tool"; tool: string; args?: Record<string, unknown> };

export class AgentRunError extends Error {
  constructor(readonly code: "AGENT_EMPTY_RESPONSE" | "AGENT_ITERATION_LIMIT", message: string) {
    super(message);
    this.name = "AgentRunError";
  }
}

export interface AgentRuntimeInput {
  prompt: string;
  history: ChatMessage[];
  llm: AgentLlm;
  tools: AgentTool[];
  toolContext: ToolContext;
  systemPrompt: string;
  fallback?: (prompt: string, history: ChatMessage[]) => Promise<FallbackResult | undefined>;
  maxIterations?: number;
  signal?: AbortSignal;
}

function buildMessages(input: AgentRuntimeInput): AgentLlmMessage[] {
  return [
    { role: "system", content: input.systemPrompt },
    ...input.history
      .filter((message) => message.role !== "system" && message.status === "complete")
      .slice(-10)
      .map((message) => ({ role: message.role, content: message.content })),
    { role: "user", content: input.prompt }
  ];
}

async function* executeToolCall(
  tool: AgentTool,
  call: ParsedToolCall,
  input: AgentRuntimeInput,
  messages: AgentLlmMessage[],
  turn: number
): AsyncGenerator<AgentEvent> {
  if (input.signal?.aborted) throw input.signal.reason;
  yield { type: "tool.started", tool: call.name, args: call.args };
  const startedAt = performance.now();
  console.log("[agent] tool.started", { tool: tool.name, turn });
  let result: unknown;
  let status: "success" | "error" = "success";
  try {
    result = await tool.execute(call.args, input.toolContext);
  } catch (error) {
    status = "error";
    result = { error: error instanceof Error ? error.message : "工具执行失败" };
  }
  // Tool inputs, result bodies and exception messages can contain private
  // resume/application data. Log only operational metadata, never payloads.
  const items = Array.isArray(result) ? result
    : result && typeof result === "object" && "items" in result && Array.isArray(result.items) ? result.items
    : undefined;
  console.log("[agent] tool.completed", {
    tool: tool.name,
    turn,
    status,
    durationMs: Math.round(performance.now() - startedAt),
    ...(items ? { resultCount: items.length } : {})
  });
  yield { type: "tool.completed", tool: call.name, result };
  messages.push({
    role: "tool",
    tool_call_id: call.id,
    content: serializeToolResult(result)
  });
}

/**
 * The agent loop: model decides -> tools run -> results feed back in -> the
 * model decides again, until it emits a final answer or the iteration cap is
 * reached (reported as an incomplete run). Text deltas are streamed as they arrive; tool lifecycle is exposed
 * as events so the SSE layer can render progress.
 */
export async function* runAgent(input: AgentRuntimeInput): AsyncGenerator<AgentEvent> {
  const maxIterations = Math.min(Math.max(1, input.maxIterations ?? 5), 10);
  const toolByName = new Map(input.tools.map((tool) => [tool.name, tool]));
  const tools = toToolDefinitions(input.tools);
  const messages = buildMessages(input);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    if (input.signal?.aborted) throw input.signal.reason;

    let text = "";
    let calls: ParsedToolCall[] = [];
    for await (const event of input.llm.step({ messages, tools, signal: input.signal })) {
      if (event.type === "text") {
        text += event.delta;
        yield { type: "delta", delta: event.delta };
      } else {
        calls = event.calls;
      }
    }

    if (calls.length) {
      console.log(`[agent] turn ${iteration + 1}: 模型发起 ${calls.length} 个工具调用`);
      messages.push({
        role: "assistant",
        content: text || null,
        tool_calls: calls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.args) }
        }))
      });
      for (const call of calls) {
        const tool = toolByName.get(call.name);
        if (!tool) {
          messages.push({ role: "tool", tool_call_id: call.id, content: `未知工具：${call.name}` });
          yield { type: "tool.completed", tool: call.name, result: { error: `未知工具：${call.name}` } };
          continue;
        }
        yield* executeToolCall(tool, call, input, messages, iteration + 1);
      }
      continue;
    }

    // The model answered directly: text has already been streamed.
    if (text.trim()) {
      console.log(`[agent] turn ${iteration + 1}: 模型直接回答`);
      return;
    }

    // Empty response: fall back to deterministic behaviour if available.
    if (input.fallback) {
      console.log(`[agent] turn ${iteration + 1}: 模型空响应，走兜底`);
      const fallback = await input.fallback(input.prompt, input.history);
      if (fallback?.kind === "final" && fallback.content.trim()) {
        yield { type: "delta", delta: fallback.content };
        return;
      }
      if (fallback?.kind === "tool") {
        const tool = toolByName.get(fallback.tool);
        if (tool) {
          yield* executeToolCall(
            tool,
            { id: `fallback-${iteration}`, name: fallback.tool, args: fallback.args ?? {} },
            input,
            messages,
            iteration + 1
          );
          continue;
        }
      }
    }
    throw new AgentRunError("AGENT_EMPTY_RESPONSE", "这次没有生成有效回答，请重试。");
  }

  throw new AgentRunError("AGENT_ITERATION_LIMIT", "查询已达到本轮上限，还没有得出完整结论。请补充目标岗位、城市或公司后重试。");
}
