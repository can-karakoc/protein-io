"use client";

import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare, X } from "lucide-react";


import { ChatWorkspace } from "@/components/workbench/ChatWorkspace";
import { useWorkspace } from "@/lib/workspaceStore";

export function ChatDrawerToggle() {
  const { chatOpen, setChatOpen } = useWorkspace();

  return (
    <button
      type="button"
      onClick={() => setChatOpen(!chatOpen)}
      aria-label={chatOpen ? "Close chat" : "Open AI chat"}
      className={[
        "flex h-[34px] items-center rounded-[12px] px-3 sm:px-5 text-pio-base sm:text-pio-md font-semibold transition-colors",
        chatOpen
          ? "bg-[var(--pio-highlight)] text-[var(--pio-highlight-text)]"
          : "bg-[rgba(26,64,106,0.04)] text-[var(--pio-ink)] opacity-70 hover:opacity-100 hover:bg-[rgba(26,64,106,0.09)]",
      ].join(" ")}
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
          {/* Backdrop (mobile only) */}
          <motion.div
            key="chat-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-[rgba(17,22,16,0.3)] md:hidden"
            onClick={() => setChatOpen(false)}
          />

          {/* Drawer */}
          <motion.aside
            key="chat-drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 36 }}
            className="fixed right-0 top-0 bottom-0 z-50 flex w-[min(420px,100vw)] flex-col bg-[var(--pio-white)] shadow-[-16px_0_40px_rgba(17,22,16,0.14)] md:absolute"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-[var(--pio-line)] px-4 py-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-[var(--pio-highlight)]" />
                <p className="text-pio-sm font-bold text-[var(--pio-ink)]">AI Chat</p>
                {active && (
                  <span className="text-pio-3xs text-[var(--pio-graphite)]">
                    · {active.pdbId || active.uniprotId || active.name}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="rounded-full p-1 text-[var(--pio-graphite)] hover:bg-[var(--pio-line)] hover:text-[var(--pio-ink)] transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Chat content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <ChatWorkspace
                analysis={active?.analysis ?? null}
                compareEntry={null}
                onFocusExplore={() => setChatOpen(false)}
              />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
