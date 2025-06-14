# **Technical Specification: MVP v0.1**

### **Document Purpose**

This document serves as the Technical Specification and initial task breakdown for the v0.1 MVP of "That's What I Said", following the principles outlined in the **Project Orchestration Framework**.

As the Orchestrator, you define the requirements and logic. As the AI Executor, I will convert these precise instructions into functional code. The following prompts constitute the build plan.

**Core Directives for AI Execution:**

* You are an expert-level software architect building a secure, high-performance desktop application.  
* You must not make independent design choices. Follow the specifications exactly.  
* You must use modern, well-maintained libraries and best practices. Avoid deprecated dependencies.  
* All code must be written in **TypeScript**.  
* The final output must be polished and feel like a custom, high-quality application, not a generic template.  
* Provide complete, runnable code for each step.

### **Step 1: Project Initialization**

**Prompt:** "Initialize a new Tauri project named 'that-s-what-i-said'. The frontend must be built with Svelte and TypeScript. Configure the project to use TailwindCSS for styling. Provide the complete file structure and the contents of tailwind.config.js, svelte.config.js, and src/app.pcss after setup."

### **Step 2: Core Data Structures**

**Prompt:** "In the src/lib/ directory, create a TypeScript file named types.ts. Define and export the core data structures for the that-s-what-i-said application. This must include:

1. An interface ChatMessage with fields: message\_id (string), conversation\_id (string), timestamp\_utc (number, Unix epoch), author (string), content (string), and content\_type ('text' | 'code').  
2. An interface Conversation with fields: id (string), source\_app (string), chat\_type ('llm' | 'human'), display\_name (string), start\_time (number), end\_time (number), and tags (string\[\])."

### **Step 3: Local Database Service**

**Prompt:** "We will use the tauri-plugin-sql for our database. Prepare it. Create a database service module at src/lib/database.ts. This module should handle all interactions with an SQLite database named **'thats\_what\_she\_said.db'**.

It must include the following async functions:

1. initializeDatabase(): Connects to the database and executes CREATE TABLE IF NOT EXISTS... statements for messages and conversations tables.  
2. saveConversation(conversation: Conversation): An upsert function to save or update a conversation.  
3. saveMessages(messages: ChatMessage\[\]): A function that efficiently inserts an array of messages in a single transaction.  
4. getConversations(sortBy: 'end\_time' | 'start\_time', limit: number, offset: number): Fetches a paginated list of conversations.  
5. getMessagesForConversation(conversation\_id: string): Fetches all messages for a specific conversation, ordered by timestamp."

### **Step 4: The ChatGPT Parser (v1)**

**Prompt:** "Create a parser module at src/lib/parsers/chatgpt.ts. It must export a single async function parseChatGPT(fileContent: string): { conversation: Conversation, messages: ChatMessage\[\] }\[\]. It returns an array as the conversations.json file contains multiple chats.

For each conversation in the input file, the function will:

1. Parse the JSON array.  
2. Use the conversation\_id as the Conversation.id.  
3. Use the title as the Conversation.display\_name.  
4. Recursively iterate through the mapping object to flatten the message tree into a chronological array of ChatMessage objects.  
5. Use its UUID node key as the ChatMessage.message\_id.  
6. Use message.create\_time for ChatMessage.timestamp\_utc.  
7. Map message.author.role ('user' or 'assistant') to a consistent author name.  
8. Use message.content.parts.join('') for the ChatMessage.content.  
9. Set ChatMessage.content\_type to 'code' if message.content.content\_type is 'code', otherwise 'text'.  
10. Calculate the start\_time and end\_time for the Conversation object by finding the min/max timestamps of its messages.  
11. Return an array containing all parsed conversation and message objects."

### **Step 5: The Main Timeline UI**

**Prompt:** "Create the main UI component at src/routes/+page.svelte. This component will display the 'Infinite Timeline'.

It must:

1. On mount (onMount), call the database.ts service to fetch the initial batch of conversations.  
2. Use the svelte-virtual-list library to render the list of conversations. This is critical for performance. **Do not just use a standard {\#each} block.**  
3. Each item in the list should be a ConversationCard.svelte component.  
4. The card must display the conversation's display\_name, source\_app, and a formatted date range (e.g., 'Jan 2023 \- Mar 2024').  
5. Clicking a card should navigate the user to a detailed chat view (use a store or context to manage the selected conversation)."