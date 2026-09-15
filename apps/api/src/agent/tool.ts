import type { OfferFlowStore } from "../store/store.ts";

/**
 * Execution context shared by every tool call. `userId` and `store` give a
 * tool access to the current user's data; the store is the only database
 * boundary, so tools never touch storage directly.
 */
export interface ToolContext {
  userId: string;
  store: OfferFlowStore;
  signal?: AbortSignal;
  now?: () => Date;
}

/**
 * A capability the agent model can choose to invoke. The description and
 * inputSchema are what the model sees; execute is the real backend work.
 * Arguments arrive as a plain object parsed from the model's JSON, so tools
 * cast them to their own shape inside `execute`.
 */
export interface AgentTool<Result = unknown> {
  readonly name: string;
  readonly description: string;
  /** JSON Schema for the arguments object, sent to the model as-is. */
  readonly inputSchema: Record<string, unknown>;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<Result>;
}

/** The tool shape sent inside the model's `tools` request parameter. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export function toToolDefinitions(tools: readonly AgentTool[]): ToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema
  }));
}

/** Serialise a tool result into the `role: "tool"` message content. */
export function serializeToolResult(result: unknown): string {
  if (typeof result === "string") return result;
  try {
    const serialized = JSON.stringify(result);
    return serialized ?? String(result);
  } catch {
    return String(result);
  }
}
