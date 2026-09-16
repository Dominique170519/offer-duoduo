/** Human-readable label shown while an agent tool is running in the thread. */
export function toolActivityLabel(tool: string): string {
  switch (tool) {
    case "opportunity_search":
      return "正在查询校招岗位库";
    case "knowledge_search":
      return "正在检索求职知识库";
    case "application_context":
      return "正在读取你的投递记录";
    case "interview_prep":
      return "正在准备面试内容";
    default:
      return "正在处理";
  }
}
