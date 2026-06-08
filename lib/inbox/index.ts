/**
 * Unified Inbox — public module surface (Module 09, Wave 3c).
 *
 * Importing this barrel also installs the AiAssist escalation hook (side effect
 * of `./escalate-register`) so low-confidence inbox AI is routed to a flagged
 * thread the moment any inbox code is loaded.
 */

// Side-effect import: registers the escalate hook on load.
import "./escalate-register";

export { ensureInboxEscalateHookRegistered } from "./escalate-register";

export {
  INBOX_CHANNELS,
  normalizeChannel,
  normalizeStatus,
  listThreads,
  getThreadWithMessages,
  countNeedsAttention,
  countOpenThreads,
  channelCounts,
  type InboxChannel,
  type InboxStatus,
  type ThreadListItem,
  type ThreadMessage,
  type ThreadDetail,
} from "./queries";

export {
  sendMessage,
  addInternalNote,
  setThreadStatus,
  assignThread,
  blockThreadParticipant,
  type SendMessageInput,
  type SentMessage,
} from "./conversations";

export { suggestReplies, type SuggestResult } from "./suggest";

export { softInbox, isMissingRelation } from "./fail-soft";
