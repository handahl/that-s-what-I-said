# **That's What I Said**

**Your conversations, your data, your private universe. One timeline to bring order to your thoughts.**

"That's What I Said" is a secure, private, local-first desktop application that imports your chat histories from LLMs (ChatGPT, Gemini, etc.) and messaging apps (WhatsApp, Telegram, etc.) into a single, organized, and searchable timeline. It's designed for anyone who uses multiple platforms to think, create, and communicate, and wants to bring all those scattered conversations back into one place.

All data processing, storage, and analysis happens exclusively on your machine. **Nothing ever leaves your computer.**

## **Features Implemented (v0.1 MVP)**

### **✅ Core Infrastructure**
- **Secure Local Storage**: AES-256 encrypted SQLite database with user-defined master password
- **TypeScript Architecture**: Fully typed codebase with comprehensive interfaces
- **Modern UI**: Svelte + TailwindCSS with responsive design and dark/light theme support

### **✅ ChatGPT Import System**
- **File Validation**: Robust validation of ChatGPT conversations.json exports
- **Smart Parsing**: Handles both single conversations and arrays of conversations
- **Content Analysis**: Automatic detection of code vs. text content
- **Message Normalization**: Converts ChatGPT's tree structure to chronological timeline

### **✅ Security & Privacy**
- **Local-First**: No network calls, all processing happens on your machine
- **Encryption at Rest**: All conversations and messages encrypted before database storage
- **Secure Hashing**: SHA-256 based message IDs for deduplication
- **Memory Safety**: Encryption keys cleared when not in use

### **✅ User Interface**
- **Timeline View**: Virtualized infinite scroll for performance with large datasets
- **Import Dialog**: Drag-and-drop file selection with real-time validation
- **Conversation Cards**: Rich preview cards showing source, date range, and tags
- **Responsive Design**: Works seamlessly across different screen sizes

### **✅ Performance Optimizations**
- **Virtual Scrolling**: Handles thousands of conversations without performance degradation
- **Database Indexing**: Optimized queries for fast search and retrieval
- **Lazy Loading**: Conversations loaded on-demand as user scrolls
- **Transaction Batching**: Efficient bulk message insertion

### **✅ Comprehensive Testing**
- **Unit Tests**: Full coverage for crypto, parsing, and database operations
- **Integration Tests**: End-to-end file import workflows
- **Error Handling**: Graceful handling of malformed files and edge cases
- **Security Testing**: Validation of encryption/decryption cycles

## **Quick Start**

### **Prerequisites**
- Node.js 18+ and npm
- Rust (for Tauri desktop app)

### **Development Setup**

```bash
# Clone the repository
git clone <repository-url>
cd thats-what-i-said

# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build
```

### **First Time Setup**

1. **Launch the application**
2. **Set Master Password**: Create a secure password to encrypt your data
3. **Import Your First File**: Click "Import Files" and select a ChatGPT conversations.json file
4. **Browse Your Timeline**: View your imported conversations in the main timeline

## **Supported File Formats**

### **✅ Currently Supported**
- **ChatGPT**: conversations.json exports from OpenAI ChatGPT

### **🚧 Coming Soon (v0.2)**
- **Google Gemini**: Takeout exports
- **WhatsApp**: Text exports
- **Generic Markdown**: .md conversation files

## **Architecture Overview**

```
src/
├── lib/
│   ├── types.ts              # Core data structures
│   ├── crypto.ts             # AES-256 encryption service
│   ├── database.ts           # SQLite with encryption
│   ├── fileImporter.ts       # File selection and validation
│   ├── parsers/
│   │   └── chatgpt.ts        # ChatGPT format parser
│   └── components/
│       ├── FileImportDialog.svelte
│       └── ConversationCard.svelte
├── routes/
│   └── +page.svelte          # Main timeline interface
└── tests/                    # Comprehensive test suite
```

## **Security Model**

- **Local-First**: No data ever leaves your machine
- **Encryption at Rest**: AES-256-GCM encryption for all stored data
- **Key Derivation**: PBKDF2 with 10,000 iterations for password-based keys
- **Memory Safety**: Encryption keys cleared when application closes
- **No Telemetry**: Zero tracking, analytics, or external network calls

## **Development Philosophy**

This project adheres to a structured development methodology defined in our **Project Orchestration Framework**. The emphasis is on clear strategic direction, precise technical specifications, and systematic execution to ensure a predictable, high-quality outcome.

## **Contributing**

We welcome contributions! Please see our development roadmap in `docs/ROADMAP.md` for planned features and current priorities.

## **Licensing**

"That's What I Said" is free as in "free speech." It is distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. This means you are free to use, study, share, and modify the software. However, if you distribute a modified version or run it on a server for others to access, you must also make your source code available under the same license.

## **Roadmap**

- **v0.2**: Global search, tagging system, Gemini & WhatsApp parsers
- **v0.3**: Export functionality, advanced tagging, settings expansion  
- **v1.0**: Analytics dashboard, conversation insights, graph visualization

See `docs/ROADMAP.md` for detailed feature planning.