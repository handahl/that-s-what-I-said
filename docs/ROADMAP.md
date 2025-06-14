# **“That’s What I Said” Development Roadmap**

This document outlines the planned features and development phases for That’s What I Said. The guiding principle is to build a robust, secure, and responsive core product first, then expand with advanced features.

### **v0.1 \- The Foundation (MVP)**

* **Core Application Shell:** Setup a secure, cross-platform desktop application using Tauri.  
* **Parser Engine v1:**  
  * Implement parsers for **ChatGPT (.json)** and **generic Markdown (.md)**.  
  * Robust timestamp normalization and content-type detection (text, code).  
* **Storage Engine v1:**  
  * Implement a local, encrypted database using SQLite via tauri-plugin-sql.  
  * Define the unified data model (message\_id, conversation\_id, author, chat\_type, etc.).  
* **UI v1 \- The Core Experience:**  
  * Main window with a virtualized "Infinite Timeline" view.  
  * Drill-down "Chat View" for reading individual conversations with proper Markdown and code rendering.  
  * File import screen supporting single, multi-file, and folder uploads.  
* **Basic Settings:**  
  * Light/Dark/System theme switching.

### **v0.2 \- Organization & Search**

* **Global Search Engine v1:**  
  * Implement a fast, full-text search across all imported messages.  
  * UI for displaying search results.  
* **Tagging System v1:**  
  * Ability to add/remove tags to conversations.  
  * Filter the main timeline view by one or more tags.  
* **Filter & Sort Controls:**  
  * Add UI controls to sort the timeline (by date, author, etc.).  
  * Add basic filters (by source app, date range).  
* **Parser Engine v2:**  
  * Add parsers for **Gemini (.json)** and **WhatsApp (.txt)**.

### **v0.3 \- Quality of Life & Export**

* **Advanced Tagging:**  
  * Implement multi-level tagging (e.g., \#project/alpha).  
  * Develop a system for suggesting tags based on content or a pre-defined database.  
* **Export Functionality:**  
  * Export single or multiple conversations to clean .json, .md, or .txt formats.  
* **Settings Expansion:**  
  * Add font size and font family options (including support for EN, DE, VI, ZH-TW).  
* **Parser Engine v3:**  
  * Add parsers for Telegram and other user-requested formats.

### **v1.0 \- The Insights Engine**

* **Dashboard View:**  
  * A new section in the app for analytics.  
  * Global statistics (total messages, activity heatmap, etc.).  
* **Per-Conversation Insights:**  
  * Detailed analytics for individual human chats (response time, message length distribution).  
* **Graph Visualization:**  
  * An optional view showing a graph network of conversations.

### **Future & Research**

* **AI-Powered Features:**  
  * On-device, local summarization of conversations.  
  * Automated PII (Personally Identifiable Information) detection and redaction/encryption.  
* **Advanced Security:**  
  * Integration with hardware keys (YubiKey) via WebAuthn/platform authenticators for database unlocking.  
* **ZIP Archive Handling:**  
  * Native support for importing zipped Takeout files directly.