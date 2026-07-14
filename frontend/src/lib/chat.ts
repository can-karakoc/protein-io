import { buildApiUrl, fetchWithRetry } from "@/lib/api";
import type { AnalysisResponse, StructureComparisonResponse } from "@/lib/types";
import type { CompareSessionEntry } from "@/lib/compareSession";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
  error?: string;
};

type ApiMessage = { role: "user" | "assistant"; content: string };

type ChatApiResponse = {
  reply: string | null;
  tool_calls: Array<{ name: string; input: Record<string, unknown>; result: unknown }>;
  error: string | null;
};

export async function sendChatMessage(
  analysis: AnalysisResponse,
  history: ChatMessage[],
  userText: string,
  compareEntry?: CompareSessionEntry | null,
): Promise<{ reply: string; toolCalls: ChatMessage["toolCalls"]; error: string | null }> {
  // Build Anthropic-format message list from prior conversation
  const messages: ApiMessage[] = [];
  for (const m of history) {
    if (m.role === "user" || m.role === "assistant") {
      messages.push({ role: m.role, content: m.content });
    }
  }
  messages.push({ role: "user", content: userText });

  // Serialize comparison: include label_a/label_b alongside the raw comparison data
  const comparison = compareEntry
    ? { ...compareEntry.comparison, label_a: compareEntry.labelA, label_b: compareEntry.labelB }
    : null;

  const res = await fetchWithRetry(buildApiUrl("/api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis, messages, comparison }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    return { reply: "", toolCalls: [], error: detail };
  }

  const data: ChatApiResponse = await res.json();
  return {
    reply: data.reply ?? "",
    toolCalls: data.tool_calls.map((t) => ({ name: t.name, input: t.input })),
    error: data.error ?? null,
  };
}

export function makeMsgId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const TOOL_LABELS: Record<string, string> = {
  get_structure_summary: "Structure summary",
  query_contacts: "Queried contacts",
  get_ligand_details: "Ligand details",
  get_residue_contacts: "Residue contacts",
  get_chain_summary: "Chain summary",
  compare_structures: "Comparison data",
  generate_report: "Generated report",
};
