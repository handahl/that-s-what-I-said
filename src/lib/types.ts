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
  warnings: string[];
  metadata: ImportMetadata;
}

export interface ImportMetadata {
  total_files_processed: number;
  successful_imports: number;
  failed_imports: number;
  total_conversations: number;
  total_messages: number;
  processing_time_ms: number;
  detected_formats: Record<string, number>;
  parser_fallbacks: number;
}

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  warning?: string;
  fileType?: SupportedFileType;
  confidence: number; // 0-100, confidence in format detection
  fallbackAttempted?: boolean;
}

export type SupportedFileType = 'chatgpt' | 'claude' | 'gemini' | 'qwen' | 'whatsapp' | 'unknown';

export interface ParserInterface {
  readonly name: string;
  readonly supportedTypes: SupportedFileType[];
  
  validateFile(content: string): FileValidationResult;
  parseContent(content: string): Promise<ImportResult>;
  getFormatConfidence(content: string): number;
}

export interface ImportValidationConfig {
  maxFileSize: number;
  maxConversations: number;
  maxMessages: number;
  maxContentLength: number;
  allowedFileTypes: SupportedFileType[];
  enableFallbackDetection: boolean;
}

export interface ImportError {
  type: 'validation' | 'parsing' | 'database' | 'security';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  file?: string;
  parser?: string;
  timestamp: number;
  details?: Record<string, any>;
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

// Gemini specific types for parsing
export interface GeminiExport {
  conversations: GeminiConversation[];
}

export interface GeminiConversation {
  conversation_id: string;
  conversation_title?: string;
  create_time: string; // ISO 8601 format
  update_time: string; // ISO 8601 format
  messages: GeminiMessage[];
}

export interface GeminiMessage {
  id?: string;
  author: {
    name: string;
    email?: string;
  };
  create_time: string; // ISO 8601 format
  text: string;
  message_type?: string;
}

// Alternative Gemini format (Google Takeout style)
export interface GeminiTakeoutExport {
  id: string;
  name: string;
  created_date: string; // ISO 8601 format
  updated_date: string; // ISO 8601 format
  messages: GeminiTakeoutMessage[];
}

export interface GeminiTakeoutMessage {
  creator: {
    name: string;
    email?: string;
  };
  created_date: string; // ISO 8601 format
  content: string;
  message_id?: string;
}

// Qwen (Alibaba LLM) specific types for parsing
export interface QwenExport {
  conversation_id?: string;
  session_id?: string;
  title?: string;
  name?: string;
  created_time?: string | number;
  updated_time?: string | number;
  messages?: QwenMessage[];
  chat_history?: QwenMessage[];
  dialogue?: QwenMessage[];
}

export interface QwenMessage {
  id?: string;
  message_id?: string;
  timestamp?: string | number;
  time?: string | number;
  created_at?: string | number;
  role?: string;
  sender?: string;
  author?: string;
  content?: string;
  text?: string;
  message?: string;
  type?: string;
  message_type?: string;
  model?: string;
  model_name?: string;
}

// Qwen text log format (flat file)
export interface QwenTextLogEntry {
  timestamp: string;
  role: string;
  content: string;
  raw_line: string;
}