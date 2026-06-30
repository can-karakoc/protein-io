"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bot, MessageSquare, X } from "lucide-react";

import { ChatWorkspace } from "@/components/workbench/ChatWorkspace";
import { useWorkspace } from "@/lib/workspaceStore";

export function ChatDrawerToggle() {
  const { chatOpen, setChatOpen } = useWorkspace();

  return (
    <button
      type="button"
      onClick={() => setChatOpen(!chatOpen)}
      aria-label={chatOpen ? "Close chat" : "Open AI chat"}
      className="flex h-[34px] items-center rounded-[12px] px-3 sm:px-5 text-pio-base sm:text-pio-md font-semibold transition-all duration-200"
      style={
        chatOpen
          ? {
              background: "var(--pio-lavender-deep)",
              color: "#fff",
              border: "1px solid transparent",
              boxShadow: "0 0 0 3px rgba(var(--pio-lavender-rgb), 0.18), 0 2px 14px rgba(var(--pio-lavender-rgb), 0.40)",
            }
          : {
              background: "var(--pio-lavender-pale)",
              color: "var(--pio-lavender-deep)",
              border: "1px solid rgba(var(--pio-lavender-rgb), 0.28)",
              boxShadow: "0 0 0 3px rgba(var(--pio-lavender-rgb), 0.08), 0 2px 10px rgba(var(--pio-lavender-rgb), 0.18)",
            }
      }
    >
      Chat
    </button>
  );
}

export function ChatDrawer() {
  const { chatOpen, setChatOpen, getActive } = useWorkspace();
  const active = getActive();

  return (
    <AnimatePresence>
      {chatOpen && (
        <>
          {/* Backdrop — mobile only */}
          <motion.div
            key="chat-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 z-40 bg-black/20 md:hidden"
            onClick={() => setChatOpen(false)}
          />

          {/* Panel — absolute inside the shell's relative+overflow-hidden container */}
          <motion.aside
            key="chat-drawer"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute right-0 top-0 bottom-0 z-50 flex w-[min(440px,100vw)] flex-col"
            style={{
              background: "var(--pio-white)",
              borderLeft: "1px solid var(--pio-line)",
              boxShadow: "-12px 0 40px rgba(17,22,16,0.10)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 flex-shrink-0"
              style={{
                height: 52,
                borderBottom: "1px solid var(--pio-line)",
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "rgba(199,217,236,0.4)" }}
                >
                  <Bot size={13} style={{ color: "var(--pio-highlight)" }} />
                </div>
                <p className="text-pio-sm font-bold text-[var(--pio-ink)] shrink-0">AI Chat</p>
                {active && (
                  <span
                    className="truncate text-pio-3xs font-semibold text-[var(--pio-graphite)]"
                    style={{
                      background: "var(--pio-sky)",
                      borderRadius: 6,
                      padding: "2px 8px",
                      maxWidth: 180,
                      display: "inline-block",
                    }}
                  >
                    {active.pdbId || active.uniprotId || active.name}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--pio-graphite)] hover:bg-[var(--pio-line)] hover:text-[var(--pio-ink)] transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Chat content — embedded mode strips inner card/header */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <ChatWorkspace
                analysis={active?.analysis ?? null}
                compareEntry={null}
                onFocusExplore={() => setChatOpen(false)}
                embedded
              />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
