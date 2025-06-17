thats-what-i-said/
├── .eslintrc.js                    ← NEW: ESLint configuration
├── .eslintignore                   ← NEW: ESLint ignore patterns
├── .gitignore                      ← Existing
├── package.json                    ← UPDATED: Added TypeDoc, scripts
├── typedoc.json                    ← NEW: TypeDoc configuration
├── tsconfig.json                   ← Existing
├── svelte.config.js                ← Project root (confirmed location)
├── vite.config.ts                  ← Existing
├── tailwind.config.js              ← Existing
├── README.md                       ← Existing
├── LICENSE                         ← Existing
├── CHANGELOG.md                    ← Existing
│
├── src/                            ← Application source
│   ├── app.html                    ← Main HTML template
│   ├── app.pcss                    ← Global styles
│   ├── lib/                        ← Core library code
│   │   ├── types.ts                ← Type definitions
│   │   ├── crypto.ts               ← Encryption service
│   │   ├── database.ts             ← Database service
│   │   ├── fileImporter.ts         ← File import service
│   │   ├── parserRegistry.ts       ← Parser management
│   │   ├── importValidation.ts     ← Validation service
│   │   ├── components/             ← Svelte components
│   │   │   ├── ConversationCard.svelte
│   │   │   └── FileImportDialog.svelte
│   │   └── parsers/                ← Format parsers
│   │       ├── chatgpt.ts
│   │       ├── claude.ts
│   │       ├── gemini.ts
│   │       └── qwen.ts
│   ├── routes/                     ← SvelteKit routes
│   │   └── +page.svelte            ← Main timeline view
│   └── tests/                      ← Test files
│       ├── setup.ts
│       ├── crypto.test.ts
│       ├── database.test.ts
│       ├── chatgpt-parser.test.ts
│       ├── claude-parser.test.ts
│       ├── gemini-parser.test.ts
│       ├── qwen-parser.test.ts
│       ├── import-validation.test.ts
│       ├── parser-registry.test.ts
│       ├── file-importer.test.ts
│       └── file-importer-refactored.test.ts
│
├── src-tauri/                      ← Tauri backend
│   ├── Cargo.toml                  ← Rust dependencies
│   ├── tauri.conf.json             ← Tauri configuration
│   ├── build.rs                    ← Build script
│   ├── src/
│   │   └── main.rs                 ← Rust main file
│   └── icons/                      ← Application icons
│       ├── 32x32.png
│       ├── 128x128.png
│       ├── icon.icns
│       └── icon.ico
│
├── docs/                           ← Documentation
│   ├── ROADMAP.md                  ← Feature roadmap
│   ├── Technical Specifications.md ← Tech specs
│   ├── Project Concept.md          ← Project vision
│   ├── Project Orchestration Framework.md
│   ├── Parser Analysis and Transformation Guide.md
│   ├── typedoc-custom.css          ← NEW: TypeDoc styling
│   └── api/                        ← Generated API docs (TypeDoc output)
│
├── ai-constraints/                 ← CoDA Framework
│   ├── .ai-constraints.md          ← Core constraints
│   ├── AI_ASSISTANT_INSTRUCTIONS.md
│   ├── AI_CODER_SYSTEM_PROMPT.md
│   ├── AI_CODER_MASTER_PROMPT.md
│   ├── ai-metrics.md
│   └── ai-constraint-profiles.json
│
├── scripts/                        ← NEW: Utility scripts
│   └── validate-constraints.js     ← NEW: CoDA validation
│
└── .guardian-ai/                   ← Guardian AI logs
    └── constraint-history.json

DOCUMENTATION WORKFLOW:
======================

1. Development Documentation:
   npm run docs:ts          # Generate TypeScript API docs
   npm run docs:rust        # Generate Rust documentation
   npm run docs:serve       # Serve docs locally
   npm run docs:clean       # Clean generated docs

2. Code Quality:
   npm run lint             # Check code style
   npm run lint:fix         # Fix auto-fixable issues
   npm run format           # Format code with Prettier
   npm run constraint:validate  # Validate CoDA compliance

3. Pre-commit Workflow:
   npm run pre-commit       # Run all checks before commit

GENERATED DOCUMENTATION:
========================

TypeDoc Output: docs/api/
- Comprehensive API documentation
- Security constraint annotations
- Interactive navigation
- Cross-references to architecture docs

Rustdoc Output: src-tauri/target/doc/
- Complete Rust documentation
- Tauri backend API reference
- Plugin documentation

CONSTRAINT VALIDATION:
======================

The validate-constraints.js script checks:
✅ Security patterns (no eval, Function constructor)
✅ Local-only compliance (no network calls)
✅ Encryption implementation standards
✅ Test coverage requirements
✅ Documentation coverage
✅ File structure compliance

DOCUMENTATION STANDARDS:
========================

All TypeScript/JavaScript code should include:
- JSDoc comments for public functions
- @param and @returns documentation
- @security tags for security-critical code
- @constraint tags for CoDA compliance notes
- Code examples where appropriate

Example JSDoc format:
/**
 * Encrypts data before storing in database
 * @security Uses AES-256-GCM with unique IV per operation
 * @constraint SEC-CRYPTO-003 compliant implementation
 * @param data - The data to encrypt
 * @returns Base64 encoded encrypted data
 * @example
 * ```typescript
 * const encrypted = crypto.encrypt("sensitive data");
 * ```
 */