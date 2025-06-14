# **Parser Analysis & Transformation Guide**

This document details the structure of data exports from target services and defines the logic for transforming them into the "That's What I Said" unified data model.

## **1\. ChatGPT (OpenAI)**

* **File Recognition:**  
  * The user receives a .zip file. Inside, the primary file is conversations.json.  
  * The filename is consistent across languages. The parser should look for conversations.json.  
* **Data Structure Analysis:**  
  * The file is an array of conversation objects.  
  * Each object has a title (string) and a mapping object.  
  * The mapping is a nested dictionary where keys are node UUIDs. Each node has a message object or is a child of a parent node.  
  * The message object contains author.role (user or assistant), content.parts (an array with the message text), and create\_time (Unix timestamp).  
* **Transformation Map:**

| Our Model Field | Source & Logic |
| :---- | :---- |
| **Conversation.id** | Use the conversation\_id field from the export. |
| **Conversation.source\_app** | Hardcode to 'ChatGPT'. |
| **Conversation.chat\_type** | Hardcode to 'llm'. |
| **Conversation.display\_name** | Use the title field. |
| **Conversation.start\_time** | Find the minimum create\_time from all messages in the mapping. |
| **Conversation.end\_time** | Find the maximum create\_time from all messages in the mapping. |
| **ChatMessage.message\_id** | Use the UUID key of the message node in the mapping. |
| **ChatMessage.timestamp\_utc** | Use the create\_time field directly. |
| **ChatMessage.author** | Map author.role: 'user' \-\> 'User', 'assistant' \-\> 'ChatGPT'. |
| **ChatMessage.content** | Join the strings from the content.parts array. |
| **ChatMessage.content\_type** | If content.content\_type is code, use 'code'. Otherwise, 'text'. |

## **2\. Google Gemini (Google Takeout)**

* **File Recognition:**  
  * Comes in a Google Takeout .zip. Path is /Takeout/Google Chat/  
  * The relevant file is result.json. The filename seems consistent.  
* **Data Structure Analysis:**  
  * The JSON contains a conversations array.  
  * Each conversation has id, name (the chat title), and a messages array.  
  * Each message object contains creator.name, creator.email, created\_date (ISO 8601 format, e.g., 2024-05-15T08:30:00.123456Z), and content.  
* **Transformation Map:**

| Our Model Field | Source & Logic |
| :---- | :---- |
| **Conversation.id** | Use the id field from the conversation object. |
| **Conversation.source\_app** | Hardcode to 'Google Gemini'. |
| **Conversation.chat\_type** | Hardcode to 'llm'. |
| **Conversation.display\_name** | Use the name field. |
| **Conversation.start\_time** | Find the minimum created\_date from all messages. (Must be converted to Unix epoch). |
| **Conversation.end\_time** | Find the maximum created\_date from all messages. (Must be converted to Unix epoch). |
| **ChatMessage.message\_id** | Generate a unique ID (e.g., hash the content and timestamp). |
| **ChatMessage.timestamp\_utc** | Parse the created\_date string into a Unix epoch timestamp. |
| **ChatMessage.author** | Use the creator.name field. This will typically be the user's name or "Gemini". |
| **ChatMessage.content** | Use the content field. |
| **ChatMessage.content\_type** | Default to 'text'. Run a regex to detect code blocks (e.g., \`\`\`). |

## **3\. WhatsApp**

* **File Recognition:**  
  * Exported as a .txt file from within the app.  
  * Filename format is highly variable and localized, but often contains "WhatsApp Chat with". Examples:  
    * English: WhatsApp Chat with \[Contact Name\].txt  
    * German: WhatsApp-Chat mit \[Contact Name\].txt  
    * Spanish: Chat de WhatsApp con \[Contact Name\].txt  
  * **Strategy:** The parser should look for \*.txt and use regex on the content to confirm the format, rather than relying on the filename.  
* **Data Structure Analysis:**  
  * Plain text file, line-by-line parsing is required.  
  * Each message line follows a pattern: \[DATE, TIME\] SENDER: MESSAGE  
  * Example: \[14/06/2025, 11:24\] John Doe: Hey, how are you?  
  * Multi-line messages are lines that do not start with the \[DATE, TIME\] pattern.  
* **Transformation Map:**

| Our Model Field | Source & Logic |
| :---- | :---- |
| **Conversation.id** | Generate a unique ID from the contact name and the first timestamp. |
| **Conversation.source\_app** | Hardcode to 'WhatsApp'. |
| **Conversation.chat\_type** | Hardcode to 'human'. |
| **Conversation.display\_name** | Extract from the filename or by identifying the unique sender names. |
| **Conversation.start\_time** | Get the timestamp from the very first message line. |
| **Conversation.end\_time** | Get the timestamp from the very last message line. |
| **ChatMessage.message\_id** | Generate a unique ID (hash content and timestamp). |
| **ChatMessage.timestamp\_utc** | Parse the \[DATE, TIME\] string. This is complex due to locale differences (DD/MM/YY vs MM/DD/YY). The parser will need to try multiple formats. |
| **ChatMessage.author** | Extract the SENDER name from the line. |
| **ChatMessage.content** | The text after SENDER: . Concatenate subsequent lines that are part of a multi-line message. |
| **ChatMessage.content\_type** | Default to 'text'. |

