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
  messages: AgentLlmMessage[]
): AsyncGenerator<AgentEvent> {
  if (input.signal?.aborted) throw input.signal.reason;
  yield { type: "tool.started", tool: call.name, args: call.args };
  let result: unknown;
  try {
    result = await tool.execute(call.args, input.toolContext);
  } catch (error) {
    result = { error: error instanceof Error ? error.message : "工具执行失败" };
  }
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
 * reached. Text deltas are streamed as they arrive; tool lifecycle is exposed
 * as events so the SSE layer can render progress.
 */
export async function* runAgent(input: AgentRuntimeInput): AsyncGenerator<AgentEvent> {
  const maxIterations = Math.min(Math.max(1, input.maxIterations ?? 5), 10);
  const toolByName = new Map(input.tools.map((tool) => [tool.name, tool]));
  const tools = toToolDefinitions(input.tools);
  const messages = buildMessages(input);
  let emittedText = false;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    if (input.signal?.aborted) throw input.signal.reason;

    let text = "";
    let calls: ParsedToolCall[] = [];
    for await (const event of input.llm.step({ messages, tools, signal: input.signal })) {
      if (event.type === "text") {
        text += event.delta;
        emittedText = true;
        yield { type: "delta", delta: event.delta };
      } else {
        calls = event.calls;
      }
    }

    if (calls.length) {
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
        yield* executeToolCall(tool, call, input, messages);
      }
      continue;
    }

    // The model answered directly: text has already been streamed.
    if (text) return;

    // Empty response: fall back to deterministic behaviour if available.
    if (input.fallback) {
      const fallback = await input.fallback(input.prompt, input.history);
      if (fallback?.kind === "final") {
        emittedText = true;
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
            messages
          );
          continue;
        }
      }
    }
    return;
  }

  if (!emittedText) {
    yield {
      type: "delta",
      delta: "我连续查了几轮还没有得出完整结论。你可以补充目标岗位、城市或公司，我继续帮你。"
    };
  }
}
