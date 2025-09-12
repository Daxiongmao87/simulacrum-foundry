Title: Consolidate AI response normalization and fallback parsing

Overview
- Duplicate logic exists for normalization and message sanitization in SimulacrumCore and tool-loop-handler. Create a shared utility to avoid divergence and subtle bugs.

Affected
- scripts/core/simulacrum-core.js
- scripts/core/tool-loop-handler.js
- New: scripts/utils/ai-normalization.js

Investigate
- Compare behaviors of _normalizeAIResponse/normalizeAIResponse and _sanitizeMessagesForFallback in both files.
- Confirm Core._parseInlineToolCall is used by the loop via dynamic import (circularity risk).

Fix
- Create scripts/utils/ai-normalization.js with:
  - normalizeAIResponse(raw) with unified parse-error handling and inline tool fallback.
  - sanitizeMessagesForFallback(messages).
  - parseInlineToolCall(text) moved from core.
- Refactor both modules to import these helpers; remove local duplicates.
- Remove dynamic import of Core in loop.

Verify
- Unit tests: 
  - empty content → _parseError true.
  - native tool_calls preserved; inline JSON fallback detected.
  - sanitization retains only system/user/assistant.
- Manual: legacy/native end-to-end chat still works.

