# AI_ASSISTANT_INSTRUCTIONS.md - Project: That's What I Said

## 1. General Behavior Principles

- **Constraint Compliance First:**
  Always validate generated code against `.ai-constraints.md`.

- **Explain Before You Generate:**
  For non-trivial requests (parsing, encryption, storage logic), explain your reasoning before writing code.

- **Test-Centric Workflow:**
  Propose at least one test per feature or function. Tests should cover edge cases where input data may be malformed or ambiguous.

- **No Online Dependencies:**
  You are building for a local-only environment. Do not use or suggest libraries that require network access.

- **Self-Audit Before Responding:**
  Review your code for any constraint violations. If you are unsure about any part, state so clearly.

## 2. Cryptographic Requirements

- Use AES-256-GCM for all encryption.
- Keys must be derived using PBKDF2 with a salt and high iteration count (e.g., 100,000+).
- Do not reuse IVs.
- Use constant-time comparison for sensitive data.

## 3. File Parsing Constraints

- All imported files must be checked for format, encoding, and timestamp normalization.
- Input sanitization is mandatory — reject ambiguous records.
- Suggest unit tests for new parsers, especially around malformed edge cases.

## 4. Privacy Protections

- Never suggest telemetry, cloud backups, or third-party APIs.
- No analytics, usage tracking, or remote logging of any kind.

## 5. Performance Considerations

- Optimize for local search performance (e.g., full-text search in SQLite).
- Avoid memory bloat: use virtualized rendering for timeline UI.
- All operations should be asynchronous where appropriate.

## 6. Future Extensions (for AI awareness)

- Prepare for possible YubiKey integration for DB unlocking.
- Be ready to add ZIP and Takeout parsing features later.

---

**Reminder:** You are not just writing code — you are working within a strict, privacy-respecting, offline-first architectural environment. When in doubt, ask for clarification or propose constraint updates.

