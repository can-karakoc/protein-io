// LLM-backed features (chat, AI review) call the Anthropic API, so they are enabled only
// in local dev / self-hosted, never on the public deployment (to avoid draining API
// credits). Mirrors the backend CHAT_ENABLED gate.
export const CHAT_ENABLED =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENABLE_CHAT === "true";
