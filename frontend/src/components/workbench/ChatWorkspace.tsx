"use client";

import { Bot, Check, ChevronDown, MessageSquare, Search, Send, Trash2, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { AnalysisResponse } from "@/lib/types";
import type { CompareSessionEntry } from "@/lib/compareSession";
import { type ChatMessage, TOOL_LABELS, makeMsgId, sendChatMessage } from "@/lib/chat";

type Phase = "thinking" | "tracing" | "done";

type LiveState = {
  phase: Phase;
  toolSteps: Array<{ name: string; input: Record<string, unknown>; done: boolean }>;
};

type ChatWorkspaceProps = {
  analysis: AnalysisResponse | null;
  compareEntry: CompareSessionEntry | null;
  onFocusExplore: () => void;
};

export function ChatWorkspace({ analysis, compareEntry, onFocusExplore }: ChatWorkspaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [live, setLive] = useState<LiveState | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, live]);

  async function handleSend() {
    const text = input.trim();
    if (!text || !analysis || live) return;

    const userMsg: ChatMessage = { id: makeMsgId(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    textareaRef.current?.focus();

    // Phase 1: thinking
    setLive({ phase: "thinking", toolSteps: [] });

    const { reply, toolCalls, error } = await sendChatMessage(analysis, messages, text, compareEntry);

    // Phase 2: animate tool steps if any
    if (toolCalls && toolCalls.length > 0) {
      setLive({ phase: "tracing", toolSteps: toolCalls.map((t) => ({ ...t, done: false })) });
      for (let i = 0; i < toolCalls.length; i++) {
        await delay(380);
        setLive((prev) =>
          prev
            ? {
                ...prev,
                toolSteps: prev.toolSteps.map((s, idx) => (idx === i ? { ...s, done: true } : s)),
              }
            : prev,
        );
      }
      await delay(260);
    }

    // Phase 3: commit message, clear live state
    const assistantMsg: ChatMessage = {
      id: makeMsgId(),
      role: "assistant",
      content: reply,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      error: error ?? undefined,
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setLive(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  if (!analysis) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <div className="w-full max-w-[440px] rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] p-10 text-center shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10)]">
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(199,217,236,0.4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <MessageSquare size={22} color="var(--pio-highlight)" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--pio-ink)" }}>No structure loaded</h2>
          <p style={{ fontSize: 13.5, color: "var(--pio-graphite)", lineHeight: 1.6, marginTop: 8 }}>
            Load and analyze a structure in Explore first, then ask questions about it here.
          </p>
          <button type="button" onClick={onFocusExplore}
            className="mt-5 rounded-[12px] bg-[var(--pio-highlight)] px-5 py-2 text-pio-base font-semibold text-[var(--pio-highlight-text)] hover:opacity-90">
            Go to Explore
          </button>
        </div>
      </div>
    );
  }

  const structureName =
    analysis.metadata?.title?.slice(0, 48) ??
    analysis.metadata?.pdb_id ??
    analysis.metadata?.uniprot_id ??
    "Loaded structure";

  return (
    <div className="h-full flex flex-col">
      <div className="mx-auto w-full max-w-[800px] flex-1 min-h-0 flex flex-col rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10),0_1px_0px_rgba(17,22,16,0.04)] overflow-clip">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--pio-line)] px-5 py-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Bot size={15} className="text-[var(--pio-highlight)] shrink-0" />
            <span className="text-pio-base font-semibold text-[var(--pio-ink)] shrink-0">Structure Chat</span>
            <span className="pio-badge pio-badge-metadata text-pio-2xs ml-1 truncate max-w-[200px]">{structureName}</span>
            {compareEntry && (
              <span className="pio-badge pio-badge-active text-pio-2xs ml-0.5 shrink-0">
                + {compareEntry.labelB}
              </span>
            )}
          </div>
          {messages.length > 0 && !live && (
            <button type="button" onClick={() => setMessages([])}
              className="flex items-center gap-1 text-pio-xs text-[var(--pio-ink-muted)] hover:text-[var(--pio-coral-deep)] transition-colors shrink-0">
              <Trash2 size={11} />
              Clear
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-5 scrollbar-thin-report">
          {messages.length === 0 && !live && (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-12 text-center">
              <Bot size={32} className="text-[var(--pio-highlight)] opacity-30" />
              <p className="text-pio-base text-[var(--pio-graphite)] max-w-[340px] leading-relaxed">
                Ask anything about the loaded structure — contacts, ligands, chains, confidence scores, interaction types.
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {[...STARTER_PROMPTS, ...(compareEntry ? COMPARE_PROMPTS : [])].map((p) => (
                  <button key={p} type="button"
                    onClick={() => { setInput(p); textareaRef.current?.focus(); }}
                    className="rounded-[10px] border border-[var(--pio-line)] bg-[var(--pio-paper)] px-3 py-1.5 text-pio-xs text-[var(--pio-ink)] hover:bg-[var(--pio-sand)] transition-colors">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}

          {live && <LiveIndicator live={live} />}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-[var(--pio-line)] px-4 py-3 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about contacts, ligands, residues, confidence…"
              rows={1}
              disabled={!!live}
              className="flex-1 resize-none rounded-[12px] border border-[var(--pio-line)] bg-[var(--pio-paper)] px-3 py-2.5 text-pio-base text-[var(--pio-ink)] placeholder:text-[var(--pio-ink-muted)] focus:outline-none focus:border-[var(--pio-highlight)] disabled:opacity-40 transition-colors"
              style={{ minHeight: 40, maxHeight: 120 }}
            />
            <button type="button" onClick={() => void handleSend()}
              disabled={!input.trim() || !!live}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--pio-highlight)] text-[var(--pio-highlight-text)] hover:opacity-90 disabled:opacity-35 transition-opacity">
              <Send size={15} />
            </button>
          </div>
          <p className="mt-1.5 text-pio-2xs text-[var(--pio-ink-muted)]">
            Enter to send · Shift+Enter for newline · Answers are grounded in the loaded structure only
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Live indicator (thinking / tracing steps) ────────────────────────────────

function LiveIndicator({ live }: { live: LiveState }) {
  return (
    <div className="flex flex-col gap-2">
      {/* Tool steps */}
      {live.toolSteps.map((step, i) => (
        <div key={i} className="flex items-center gap-2.5 text-pio-sm text-[var(--pio-graphite)]"
          style={{ animation: "chat-fade-in 0.25s ease-out both" }}>
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--pio-line)] bg-[var(--pio-paper)]">
            {step.done
              ? <Check size={10} className="text-[var(--pio-highlight)]" />
              : <Search size={10} className="text-[var(--pio-graphite)] opacity-50" style={{ animation: "thinking-dot 1s ease-in-out infinite" }} />
            }
          </div>
          <span className={step.done ? "text-[var(--pio-ink)]" : "text-[var(--pio-graphite)]"}>
            {TOOL_LABELS[step.name] ?? step.name}
            {Object.keys(step.input).length > 0 && (
              <span className="ml-1 opacity-50">
                ({Object.entries(step.input).map(([k, v]) => `${k}: ${String(v)}`).join(", ")})
              </span>
            )}
          </span>
        </div>
      ))}

      {/* Thinking / generating pulse */}
      <div className="flex items-center gap-2.5" style={{ animation: "chat-fade-in 0.2s ease-out both" }}>
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--pio-line)] bg-[var(--pio-paper)]">
          <Zap size={10} className="text-[var(--pio-highlight)]" style={{ animation: "thinking-dot 1s ease-in-out infinite" }} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-pio-sm text-[var(--pio-graphite)]">
            {live.phase === "thinking" ? "Thinking" : "Generating"}
          </span>
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span key={i} style={{
                display: "inline-block", width: 3, height: 3, borderRadius: "50%",
                background: "var(--pio-graphite)", opacity: 0.4,
                animation: `thinking-dot 1.2s ${i * 0.18}s ease-in-out infinite`,
              }} />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";

  return (
    <div className={`flex flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}
      style={{ animation: "chat-fade-in 0.22s ease-out both" }}>

      {/* Tool steps above assistant reply */}
      {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
        <div className="flex flex-col gap-1.5 w-full">
          {msg.toolCalls.map((tc, i) => (
            <ToolStep key={i} name={tc.name} input={tc.input} />
          ))}
        </div>
      )}

      <div className={[
        "max-w-[88%] rounded-[16px] px-4 py-3 text-pio-md leading-relaxed",
        isUser
          ? "bg-[var(--pio-highlight)] text-[var(--pio-highlight-text)] rounded-br-[4px]"
          : "bg-[var(--pio-paper)] border border-[var(--pio-line)] text-[var(--pio-ink)] rounded-bl-[4px] w-full",
      ].join(" ")}>
        {msg.error ? (
          <span className="text-[var(--pio-coral-deep)]">{msg.error}</span>
        ) : isUser ? (
          msg.content
        ) : (
          <MarkdownMessage content={msg.content} />
        )}
      </div>
    </div>
  );
}

function ToolStep({ name, input }: { name: string; input: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[name] ?? name;
  const hasInput = Object.keys(input).length > 0;

  return (
    <div className="flex items-start gap-2 text-pio-xs text-[var(--pio-graphite)]">
      <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[rgba(199,217,236,0.4)]">
        <Check size={8} className="text-[var(--pio-highlight)]" />
      </div>
      <div>
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 hover:text-[var(--pio-ink)] transition-colors">
          <span className="font-medium">{label}</span>
          {hasInput && (
            <ChevronDown size={10} className="transition-transform"
              style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
          )}
        </button>
        {open && hasInput && (
          <div className="mt-1 rounded-[6px] border border-[var(--pio-line)] bg-[var(--pio-white)] px-2 py-1.5 font-mono text-pio-2xs text-[var(--pio-graphite)]">
            {Object.entries(input).map(([k, v]) => (
              <div key={k}><span className="text-[var(--pio-highlight)]">{k}</span>{": "}{String(v)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="mb-2 mt-3 text-pio-xl font-bold text-[var(--pio-ink)] first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-1.5 mt-3 text-pio-lg font-bold text-[var(--pio-ink)] first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 mt-2.5 text-pio-base font-semibold text-[var(--pio-ink)] first:mt-0">{children}</h3>,
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-[var(--pio-ink)]">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-pio-base">{children}</li>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          return isBlock
            ? <code className="block rounded-[6px] bg-[var(--pio-white)] border border-[var(--pio-line)] px-3 py-2 font-mono text-pio-xs text-[var(--pio-ink)] my-1.5 whitespace-pre-wrap">{children}</code>
            : <code className="rounded-[4px] bg-[var(--pio-white)] border border-[var(--pio-line)] px-1 py-0.5 font-mono text-pio-xs text-[var(--pio-highlight)]">{children}</code>;
        },
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto rounded-[8px] border border-[var(--pio-line)]">
            <table className="w-full text-pio-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-[rgba(199,217,236,0.15)] text-[var(--pio-ink)]">{children}</thead>,
        th: ({ children }) => <th className="border-b border-[var(--pio-line)] px-3 py-1.5 text-left text-pio-xs font-semibold uppercase tracking-wide">{children}</th>,
        td: ({ children }) => <td className="border-b border-[var(--pio-line)] px-3 py-1.5 last:border-b-0 font-mono text-pio-xs">{children}</td>,
        tr: ({ children }) => <tr className="last:border-b-0 hover:bg-[var(--pio-sand)] transition-colors">{children}</tr>,
        hr: () => <hr className="my-3 border-[var(--pio-line)]" />,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-[var(--pio-highlight)] pl-3 text-[var(--pio-graphite)] my-2">{children}</blockquote>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

const STARTER_PROMPTS = [
  "What ligands are present and how many contacts does each have?",
  "Which residues form the most contacts?",
  "Are there any h-bonds in this structure?",
  "Generate a full report of this structure",
];

const COMPARE_PROMPTS = [
  "What contacts were gained and lost between the two structures?",
  "Summarize the structural differences",
];
