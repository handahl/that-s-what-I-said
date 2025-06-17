### **Prompt: Implement Full-Text Search Engine (v0.2)**

> You are operating under the existing `.ai-constraints.md` and `AI_CODER_SYSTEM_PROMPT.md`.
>
> Implement the **Global Search Engine v1** feature.
>
> **Scope of Work:**
>
> * Add full-text search capability across all stored messages in the encrypted SQLite database.
> * Design database schema changes if necessary (virtual tables, indexing, etc.).
> * Build corresponding service layer for search queries.
> * Build UI components for search interface (query input, results list, highlighting matches).
> * Enforce constraint-compliant UI behavior (local-only, performant, accessible under current rules).
> * Provide full unit tests for database search queries, service layer, and UI components.
>
> **Special Constraints:**
>
> * No remote APIs.
> * All search must occur client-side.
> * Prioritize efficient indexed search for performance.
> * Use SQLite full-text search capabilities (FTS5) where possible.
> * Include robust error handling for invalid queries.
> * Respect memory safety with large result sets.

---

### **Prompt: Implement Tagging System (v0.2)**

> Under the current constraints, implement the **Tagging System v1**.
>
> **Scope of Work:**
>
> * Design the database schema extensions for tagging support.
> * Allow adding/removing tags for conversations.
> * Implement filtering of timeline view by selected tags.
> * Enforce data model consistency in TypeScript interfaces.
> * Provide UI components for tagging interactions.
> * Provide full unit tests for tag assignment, removal, filtering, and persistence.
>
> **Special Constraints:**
>
> * Tags must be sanitized for safe storage.
> * Support multi-tag filtering logic in database queries.
> * UI must respect virtual scrolling performance principles.

---

### **Prompt: Implement Sort & Filter Controls (v0.2)**

> Extend the timeline interface to support:
>
> * Sorting by date, author, and conversation source.
> * Filtering by date range, source app.
> * Update data model and service layer as necessary.
> * Ensure consistency with existing encryption model and search layer.
> * Add full unit tests for all sorting & filtering logic.

---

### **Prompt: Expand Import Parsers (v0.2 Parser Engine v2)**

> Add import parser modules for:
>
> * Gemini JSON exports.
> * WhatsApp TXT exports.
>
> For each parser:
>
> * Follow same validation, normalization, and timestamp handling rules as ChatGPT importer.
> * Implement individual test suites with edge case coverage.
> * Update unified data model if necessary but preserve backward compatibility.
> * Report any schema design conflicts to Guardian AI for constraint revision.

---

### **Prompt: Advanced Tagging System (v0.3)**

> Expand the Tagging System to support:
>
> * Multi-level hierarchical tags (e.g. `#project/alpha/subtask`).
> * UI components for tag browsing and nested filtering.
> * Suggest tags based on message content (basic rule-based heuristics only; no AI inference yet).
> * Full test coverage for hierarchical tag parsing, storage, and UI behaviors.
> * Schema adjustments if necessary.
> * Guard against invalid characters or malformed hierarchical paths.

---

### **Prompt: Export System (v0.3)**

> Implement Export Functionality:
>
> * Export selected or full conversations to `JSON`, `Markdown (.md)`, or `TXT` formats.
> * Ensure exported data maintains encryption boundary awareness (i.e., export only decrypted content with user's active session).
> * Provide full test coverage for exported file integrity, filename safety, and encoding issues.

---

### **Prompt: Parser Engine v3 (Telegram Imports)**

> Build Telegram parser supporting `.txt` exports.
>
> Apply same parsing validation, normalization, and error handling principles as previous importers.
>
> Ensure test coverage for:
>
> * Corrupted files
> * Partial conversations
> * Encoding issues (UTF-8/BOM handling)