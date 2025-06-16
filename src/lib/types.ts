/**
 * Core data structures for That's What I Said application
 * Defines the unified data model for all imported chat sources
 */

export interface ChatMessage {
  message_id: string;
  conversation_id: string;
  timestamp_utc: number; // Unix epoch timestamp
  author: string;
  content: string;
  content_type: 'text' | 'code';
}

export interface Conversation {
  id: string;
  source_app: string;
  chat_type: 'llm' | 'human';
  display_name: string;
  start_time: number; // Unix epoch timestamp
  end_time: number; // Unix epoch timestamp
  tags: string[];
}

export interface ImportResult {
  conversations: Conversation[];
  messages: ChatMessage[];
  errors: string[];
}

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  fileType?: 'chatgpt' | 'claude' | 'gemini' | 'whatsapp' | 'unknown';
}

// ChatGPT specific types for parsing
export interface ChatGPTExport {
  conversation_id: string;
  title: string;
  mapping: Record<string, ChatGPTNode>;
}

export interface ChatGPTNode {
  id: string;
  message?: ChatGPTMessage;
  parent?: string;
  children: string[];
}

export interface ChatGPTMessage {
  id: string;
  author: {
    role: 'user' | 'assistant' | 'system';
  };
  content: {
    content_type: string;
    parts: string[];
  };
  create_time: number;
}

// Claude specific types for parsing
export interface ClaudeExport {
  uuid: string;
  name: string;
  summary?: string;
  model?: string;
  created_at: string; // ISO 8601 format
  updated_at: string; // ISO 8601 format
  chat_messages: ClaudeMessage[];
}

export interface ClaudeMessage {
  uuid: string;
  text: string;
  sender: 'human' | 'assistant';
  index: number;
  created_at: string; // ISO 8601 format
  updated_at: string; // ISO 8601 format;
  attachments?: ClaudeAttachment[];
}

export interface ClaudeAttachment {
  file_name: string;
  file_type: string;
  file_size: number;
  extracted_content?: string;
}