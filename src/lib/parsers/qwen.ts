/**
 * Qwen (Alibaba LLM) conversation parser with enhanced encoding validation
 * Transforms Qwen export JSON/text into unified data model
 * Implements strict input sanitization and multi-language support per security constraints
 */

import type {
  QwenExport,
  QwenMessage,
  QwenTextLogEntry,
  Conversation,
  ChatMessage,
  ImportResult,
} from '../types';
import { CryptoService } from '../crypto';
import { contentSanitizer } from '../security/contentSanitizer.js';

interface Parser {
  parseQwen(fileContent: string): Promise<ImportResult>;
}

export class QwenParser implements Parser {
  private crypto: CryptoService;

  constructor() {
    this.crypto = CryptoService.getInstance();
  }

  /**
   * Parse Qwen export file with enhanced encoding and format validation
   */
  public async parseQwen(fileContent: string): Promise<ImportResult> {
    const result: ImportResult = {
      conversations: [],
      messages: [],
      errors: [],
    };

    try {
      // Strict content validation with size limits
      if (fileContent.length > 100 * 1024 * 1024) {
        // 100MB limit
        throw new Error('File too large (>100MB)');
      }

      // Detect and handle encoding issues
      const cleanedContent = this.normalizeEncoding(fileContent);

      // Detect format type and parse accordingly
      if (this.isQwenJSONFormat(cleanedContent)) {
        await this.parseJSONFormat(cleanedContent, result);
      } else if (this.isQwenTextLogFormat(cleanedContent)) {
        await this.parseTextLogFormat(cleanedContent, result);
      } else {
        throw new Error('Unrecognized Qwen format');
      }
    } catch (error) {
      result.errors.push(`Qwen parsing failed: ${error}`);
    }

    return result;
  }

  /**
   * Normalize encoding and handle BOM, UTF-8 issues, and Chinese characters
   */
  private normalizeEncoding(content: string): string {
    try {
      // Remove BOM if present
      let normalized = content.replace(/^\uFEFF/, '');

      // Handle common encoding issues with Chinese characters
      // Replace common mojibake patterns
      normalized = normalized
        .replace(/â€™/g, "'") // Smart quote
        .replace(/â€œ/g, '"') // Smart quote
        .replace(/â€/g, '"') // Smart quote
        .replace(/â€¦/g, '…') // Ellipsis
        .replace(/Ã¡/g, 'á') // Common UTF-8 encoding issue
        .replace(/Ã©/g, 'é') // Common UTF-8 encoding issue
        .replace(/Ã­/g, 'í') // Common UTF-8 encoding issue
        .replace(/Ã³/g, 'ó') // Common UTF-8 encoding issue
        .replace(/Ãº/g, 'ú'); // Common UTF-8 encoding issue

      // Validate UTF-8 by attempting to encode/decode
      try {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder('utf-8', { fatal: true });
        const encoded = encoder.encode(normalized);
        normalized = decoder.decode(encoded);
      } catch (encodingError) {
        // If UTF-8 validation fails, attempt to clean invalid sequences
        normalized = normalized.replace(/[\uFFFD]/g, ''); // Remove replacement characters
      }

      // Remove or replace dangerous control characters while preserving Chinese text
      normalized = normalized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

      return normalized;
    } catch (error) {
      throw new Error(`Encoding normalization failed: ${error}`);
    }
  }

  /**
   * Detect if content is Qwen JSON format
   */
  private isQwenJSONFormat(content: string): boolean {
    try {
      const trimmed = content.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return false;
      }

      const data = JSON.parse(trimmed);

      // Check for Qwen-specific field patterns
      if (Array.isArray(data)) {
        return data.some((item) => this.hasQwenJSONStructure(item));
      }

      return this.hasQwenJSONStructure(data);
    } catch {
      return false;
    }
  }

  /**
   * Check if object has Qwen JSON structure
   */
  private hasQwenJSONStructure(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;

    // Check for Qwen-specific field combinations
    const hasQwenFields =
      obj.conversation_id || obj.session_id || obj.messages || obj.chat_history || obj.dialogue;

    const hasQwenMessages =
      (obj.messages &&
        Array.isArray(obj.messages) &&
        obj.messages.some((msg: any) => this.hasQwenMessageStructure(msg))) ||
      (obj.chat_history &&
        Array.isArray(obj.chat_history) &&
        obj.chat_history.some((msg: any) => this.hasQwenMessageStructure(msg))) ||
      (obj.dialogue &&
        Array.isArray(obj.dialogue) &&
        obj.dialogue.some((msg: any) => this.hasQwenMessageStructure(msg)));

    return hasQwenFields && hasQwenMessages;
  }

  /**
   * Check if object has Qwen message structure
   */
  private hasQwenMessageStructure(msg: any): boolean {
    if (!msg || typeof msg !== 'object') return false;

    const hasRole = msg.role || msg.sender || msg.author;
    const hasContent = msg.content || msg.text || msg.message;
    const hasTimestamp = msg.timestamp || msg.time || msg.created_at;

    return hasRole && hasContent && (hasTimestamp || true); // Timestamp optional for some formats
  }

  /**
   * Detect if content is Qwen text log format
   */
  private isQwenTextLogFormat(content: string): boolean {
    const lines = content.split('\n').filter((line) => line.trim());
    if (lines.length < 2) return false;

    // Check if lines match common Qwen text log patterns
    const qwenLogPatterns = [
      /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}.*?(user|assistant|human|qwen|ai).*?:/i,
      /^\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\].*?(user|assistant|human|qwen|ai).*?:/i,
      /^(user|assistant|human|qwen|ai)\s*\(\d{4}-\d{2}-\d{2}.*?\):/i,
      /^(user|assistant|human|qwen|ai):\s*\d{4}-\d{2}-\d{2}/i,
    ];

    return lines
      .slice(0, 10)
      .some((line) => qwenLogPatterns.some((pattern) => pattern.test(line)));
  }

  /**
   * Parse JSON format Qwen exports
   */
  private async parseJSONFormat(content: string, result: ImportResult): Promise<void> {
    const data = JSON.parse(content);
    const conversations = Array.isArray(data) ? data : [data];

    // Validate array size to prevent DoS
    if (conversations.length > 10000) {
      throw new Error('Too many conversations (>10,000)');
    }

    for (const conversationData of conversations) {
      try {
        const parsed = this.parseJSONConversation(conversationData);
        result.conversations.push(parsed.conversation);
        result.messages.push(...parsed.messages);
      } catch (error) {
        result.errors.push(`Failed to parse conversation: ${error}`);
      }
    }
  }

  /**
   * Parse a single JSON conversation
   */
  private parseJSONConversation(
    data: QwenExport,
  ): { conversation: Conversation; messages: ChatMessage[] } {
    // Enhanced input validation
    this.validateJSONConversationStructure(data);

    // Extract messages from various possible fields
    const rawMessages = data.messages || data.chat_history || data.dialogue || [];
    const conversationId = this.getConversationId(data);
    const messages = this.extractJSONMessages(rawMessages, conversationId);

    if (messages.length === 0) {
      throw new Error('No valid messages found in conversation');
    }

    // Validate message count to prevent resource exhaustion
    if (messages.length > 50000) {
      throw new Error('Conversation too large (>50,000 messages)');
    }

    // Calculate conversation time bounds
    const timestamps = messages.map((m) => m.timestamp_utc);
    const startTime = Math.min(...timestamps);
    const endTime = Math.max(...timestamps);

    // Validate timestamp sanity
    if (startTime < 0 || endTime < startTime) {
      throw new Error('Invalid timestamp range detected');
    }

    // Use conversation-level timestamps as fallback
    const createTimestamp = this.parseTimestamp(data.created_time);
    const updateTimestamp = this.parseTimestamp(data.updated_time);

    const conversation: Conversation = {
      id: this.sanitizeString(conversationId, 255),
      source_app: 'Qwen',
      chat_type: 'llm',
      display_name: this.sanitizeString(
        data.title || data.name || 'Untitled Qwen Chat',
        500,
      ),
      start_time: Math.min(startTime, createTimestamp || startTime),
      end_time: Math.max(endTime, updateTimestamp || endTime),
      tags: [],
    };

    return { conversation, messages };
  }

  /**
   * Get conversation ID from various possible fields
   */
  private getConversationId(data: QwenExport): string {
    return (
      data.conversation_id ||
      data.session_id ||
      `qwen-<span class="math-inline">\{Date\.now\(\)\}\-</span>{Math.random().toString(36).substring(2, 11)}`
    );
  }

  /**
   * Extract messages from JSON format
   */
  private extractJSONMessages(
    qwenMessages: QwenMessage[],
    conversationId: string,
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const qwenMessage of qwenMessages) {
      try {
        const processedMessage = this.processJSONMessage(qwenMessage, conversationId);
        messages.push(processedMessage);
      } catch (error) {
        // Log individual message parsing errors but continue processing
        console.warn(`Failed to parse Qwen JSON message:`, error);
        continue;
      }
    }

    // Sort messages chronologically
    return messages.sort((a, b) => a.timestamp_utc - b.timestamp_utc);
  }

  /**
   * Parse text log format Qwen exports
   */
  private async parseTextLogFormat(content: string, result: ImportResult): Promise<void> {
    const lines = content.split('\n').filter((line) => line.trim());

    if (lines.length > 100000) {
      throw new Error('Text log too large (>100,000 lines)');
    }

    const logEntries = this.parseTextLogLines(lines);

    if (logEntries.length === 0) {
      throw new Error('No valid log entries found');
    }

    // Group entries into conversations (simple approach: all in one conversation)
    const conversationId = `qwen-textlog-${Date.now()}`;
    const messages = this.extractTextLogMessages(logEntries, conversationId);

    if (messages.length === 0) {
      throw new Error('No valid messages extracted from log');
    }

    // Calculate conversation time bounds
    const timestamps = messages.map((m) => m.timestamp_utc);
    const startTime = Math.min(...timestamps);
    const endTime = Math.max(...timestamps);

    const conversation: Conversation = {
      id: conversationId,
      source_app: 'Qwen',
      chat_type: 'llm',
      display_name: 'Qwen Text Log Import',
      start_time: startTime,
      end_time: endTime,
      tags: ['text-log'],
    };

    result.conversations.push(conversation);
    result.messages.push(...messages);
  }

  /**
   * Parse individual text log lines
   */
  private parseTextLogLines(lines: string[]): QwenTextLogEntry[] {
    const entries: QwenTextLogEntry[] = [];
    let currentEntry: Partial<QwenTextLogEntry> | null = null;

    for (const line of lines) {
      try {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // Try to parse as new log entry
        const parsed = this.parseTextLogLine(trimmedLine);

        if (parsed) {
          // Save previous entry if exists
          if (currentEntry && currentEntry.timestamp && currentEntry.role && currentEntry.content) {
            entries.push(currentEntry as QwenTextLogEntry);
          }

          // Start new entry
          currentEntry = parsed;
        } else if (currentEntry) {
          // Continuation of previous entry
          currentEntry.content = (currentEntry.content || '') + '\n' + trimmedLine;
          currentEntry.raw_line += '\n' + line;
        }
      } catch (error) {
        // Skip malformed lines
        continue;
      }
    }

    // Add final entry
    if (currentEntry && currentEntry.timestamp && currentEntry.role && currentEntry.content) {
      entries.push(currentEntry as QwenTextLogEntry);
    }

    return entries;
  }

  /**
   * Parse a single text log line
   */
  private parseTextLogLine(line: string): Partial<QwenTextLogEntry> | null {
    // Pattern 1: 2024-01-15 10:30:00 user: message
    const pattern1 =
      /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(user|assistant|human|qwen|ai)\s*:\s*(.*)$/i;
    const match1 = line.match(pattern1);
    if (match1) {
      return {
        timestamp: match1[1],
        role: match1[2].toLowerCase(),
        content: match1[3],
        raw_line: line,
      };
    }

    // Pattern 2: [2024-01-15 10:30:00] user: message
    const pattern2 =
      /^\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\]\s+(user|assistant|human|qwen|ai)\s*:\s*(.*)$/i;
    const match2 = line.match(pattern2);
    if (match2) {
      return {
        timestamp: match2[1],
        role: match2[2].toLowerCase(),
        content: match2[3],
        raw_line: line,
      };
    }

    // Pattern 3: user (2024-01-15 10:30:00): message
    const pattern3 = /^(user|assistant|human|qwen|ai)\s*\(([^)]+)\)\s*:\s*(.*)$/i;
    const match3 = line.match(pattern3);
    if (match3) {
      return {
        timestamp: match3[2],
        role: match3[1].toLowerCase(),
        content: match3[3],
        raw_line: line,
      };
    }

    // Pattern 4: user: 2024-01-15 10:30:00 message
    const pattern4 =
      /^(user|assistant|human|qwen|ai)\s*:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.*)$/i;
    const match4 = line.match(pattern4);
    if (match4) {
      return {
        timestamp: match4[2],
        role: match4[1].toLowerCase(),
        content: match4[3],
        raw_line: line,
      };
    }

    return null;
  }

  /**
   * Extract messages from parsed text log entries
   */
  private extractTextLogMessages(
    entries: QwenTextLogEntry[],
    conversationId: string,
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const entry of entries) {
      try {
        const processedMessage = this.processTextLogMessage(entry, conversationId);
        messages.push(processedMessage);
      } catch (error) {
        console.warn(`Failed to process Qwen text log message:`, error);
        continue;
      }
    }

    return messages.sort((a, b) => a.timestamp_utc - b.timestamp_utc);
  }

  /**
   * Processes a raw JSON Qwen message into a unified ChatMessage format with sanitization.
   */
  private processJSONMessage(rawMessage: QwenMessage, conversationId: string): ChatMessage {
    if (!this.isValidJSONMessage(rawMessage)) {
      throw new Error('Invalid JSON Qwen message structure');
    }

    const timestamp = this.parseTimestamp(
      rawMessage.timestamp || rawMessage.time || rawMessage.created_at,
    );
    const author = this.mapQwenRole(
      rawMessage.role || rawMessage.sender || rawMessage.author || 'unknown',
    );
    const rawContent = rawMessage.content || rawMessage.text || rawMessage.message || '';

    // SECURITY: Sanitize content using contentSanitizer
    const sanitizedContent = contentSanitizer.sanitizeChatContent(rawContent);

    // Determine if content is code and apply code-specific sanitization if needed
    const isCodeContent = this.detectCodeContent(sanitizedContent);
    const finalContent = isCodeContent
      ? contentSanitizer.sanitizeCodeContent(sanitizedContent)
      : sanitizedContent;

    if (!finalContent.trim()) {
      throw new Error('Message content is empty after sanitization');
    }

    const messageId = this.crypto.generateHash(finalContent, timestamp);

    return {
      message_id: messageId,
      conversation_id: conversationId,
      timestamp_utc: timestamp,
      author: this.sanitizeString(author, 100),
      content: finalContent,
      content_type: isCodeContent ? 'code' : 'text',
      metadata: {
        originalAuthor: rawMessage.role || rawMessage.sender || rawMessage.author,
        sanitized: true,
        contentType: isCodeContent ? 'code' : 'text',
      },
    };
  }

  /**
   * Processes a raw text log entry into a unified ChatMessage format with sanitization.
   */
  private processTextLogMessage(
    rawEntry: QwenTextLogEntry,
    conversationId: string,
  ): ChatMessage {
    const timestamp = this.parseTimestamp(rawEntry.timestamp);
    const author = this.mapQwenRole(rawEntry.role);
    const rawContent = rawEntry.content || '';

    // SECURITY: Sanitize content using contentSanitizer
    const sanitizedContent = contentSanitizer.sanitizeChatContent(rawContent);

    // Determine if content is code and apply code-specific sanitization if needed
    const isCodeContent = this.detectCodeContent(sanitizedContent);
    const finalContent = isCodeContent
      ? contentSanitizer.sanitizeCodeContent(sanitizedContent)
      : sanitizedContent;

    if (!finalContent.trim()) {
      throw new Error('Message content is empty after sanitization');
    }

    const messageId = this.crypto.generateHash(finalContent, timestamp);

    return {
      message_id: messageId,
      conversation_id: conversationId,
      timestamp_utc: timestamp,
      author: this.sanitizeString(author, 100),
      content: finalContent,
      content_type: isCodeContent ? 'code' : 'text',
      metadata: {
        originalAuthor: rawEntry.role,
        rawLine: rawEntry.raw_line, // Keep raw line for debugging text logs
        sanitized: true,
        contentType: isCodeContent ? 'code' : 'text',
      },
    };
  }

  /**
   * Enhanced JSON conversation structure validation
   */
  private validateJSONConversationStructure(data: any): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid conversation object');
    }

    // Check for at least one message array
    const hasMessages =
      (data.messages && Array.isArray(data.messages)) ||
      (data.chat_history && Array.isArray(data.chat_history)) ||
      (data.dialogue && Array.isArray(data.dialogue));

    if (!hasMessages) {
      throw new Error('Missing or invalid messages array');
    }

    // Validate messages array size to prevent DoS
    const messageCount =
      (data.messages?.length || 0) +
      (data.chat_history?.length || 0) +
      (data.dialogue?.length || 0);

    if (messageCount > 100000) {
      throw new Error('Too many messages (>100,000)');
    }
  }

  /**
   * Enhanced JSON message validation
   */
  private isValidJSONMessage(message: any): boolean {
    if (!message || typeof message !== 'object') return false;

    const hasRole = message.role || message.sender || message.author;
    const hasContent = message.content || message.text || message.message;

    if (!hasRole || !hasContent) return false;
    if (typeof hasRole !== 'string' || typeof hasContent !== 'string') return false;

    return true;
  }

  /**
   * Parse timestamp with multiple format support
   */
  private parseTimestamp(timestamp: string | number | undefined): number {
    if (!timestamp) {
      return Math.floor(Date.now() / 1000); // Current time as fallback
    }

    try {
      // Handle Unix timestamp (seconds or milliseconds)
      if (typeof timestamp === 'number') {
        // If timestamp is in milliseconds, convert to seconds
        const ts = timestamp > 1e10 ? Math.floor(timestamp / 1000) : timestamp;
        if (ts > 0 && ts < Date.now() / 1000 + 86400) {
          // Not too far in future
          return ts;
        }
      }

      // Handle string timestamps
      if (typeof timestamp === 'string') {
        // Try parsing as number first
        const numericTimestamp = parseFloat(timestamp);
        if (!isNaN(numericTimestamp)) {
          const ts =
            numericTimestamp > 1e10 ? Math.floor(numericTimestamp / 1000) : numericTimestamp;
          if (ts > 0 && ts < Date.now() / 1000 + 86400) {
            return ts;
          }
        }

        // Try parsing as ISO date
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
          const ts = Math.floor(date.getTime() / 1000);
          if (ts > 0 && ts < Date.now() / 1000 + 86400) {
            return ts;
          }
        }
      }

      throw new Error('Invalid timestamp format');
    } catch (error) {
      // Return current time as fallback
      return Math.floor(Date.now() / 1000);
    }
  }

  /**
   * Map Qwen role names to unified format
   */
  private mapQwenRole(role: string): string {
    if (typeof role !== 'string') return 'Unknown';

    const normalizedRole = role.toLowerCase().trim();

    // Map user roles
    if (['user', 'human', 'person', '用户', '人类'].includes(normalizedRole)) {
      return 'User';
    }

    // Map AI roles
    if (
      ['assistant', 'qwen', 'ai', 'model', 'bot', 'system', '助手', '通义千问', '千问'].includes(
        normalizedRole,
      )
    ) {
      return 'Qwen';
    }

    // Return sanitized original role for other cases
    return this.sanitizeString(role, 50);
  }

  /**
   * Sanitize string input with enhanced multi-language support
   * (Kept as a general utility for non-content strings, like names/IDs)
   */
  private sanitizeString(input: string, maxLength: number): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }

    // Remove null bytes and dangerous control characters but preserve Chinese characters
    let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Normalize Unicode (important for Chinese text)
    try {
      sanitized = sanitized.normalize('NFC');
    } catch (error) {
      // If normalization fails, continue with original
    }

    // Trim and limit length (be careful with multi-byte characters)
    sanitized = sanitized.trim();

    // Use proper string slicing that respects Unicode boundaries
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
      // Ensure we don't cut in the middle of a surrogate pair
      if (
        sanitized.charCodeAt(sanitized.length - 1) >= 0xd800 &&
        sanitized.charCodeAt(sanitized.length - 1) <= 0xdbff
      ) {
        sanitized = sanitized.substring(0, sanitized.length - 1);
      }
    }

    return sanitized;
  }

 /**
   * Detect if content is code based on patterns
   */
  private detectCodeContent(content: string): 'text' | 'code' {
    // Enhanced code detection patterns including Chinese programming terms
    const codePatterns = [
      /```[\s\S]*?```/g, // Code blocks
      /`[^`\n]+`/g, // Inline code
      /^\s*(?:function|class|def|import|from|const|let|var|if|for|while|return)\s/m, // Code keywords
      /^\s*[{}\[\]();]/m, // Code punctuation at line start
      /^\s*(?:\/\/|\/\*|#|%|<!--).*$/m, // Comments (JS, CSS, Python, Shell, MATLAB, HTML)
      /^\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/im, // SQL keywords
      /^\s*(?:print|console\.log|echo|printf|System\.out\.println)\s*\(/m, // Print statements
      /(?:function|class|def|var|let|const|import|export)\s+\w+/m, // Declarations
      /\w+\s*\([^)]*\)\s*{/, // Function calls with blocks
      /^\s*(?:public|private|protected|static|final|abstract)\s+/m, // Access modifiers
      /(?:==|!=|<=|>=|&&|\|\||->|=>|::)/m, // Operators
      /^\s*(?:if|else|elif|for|while|do|switch|case|try|catch|finally|with|async|await)\s*[\(\{]/m, // Control structures
      /(?:int|str|bool|float|double|char|void|String|boolean|Number)\s+\w+/m, // Type declarations
      /(?:\.js|\.py|\.java|\.cpp|\.c|\.php|\.rb|\.go|\.rs|\.ts|\.jsx|\.tsx)$/m, // File extensions
      /^\s*(?:import|require|include|use|namespace)\s+/m, // Import statements
      /(?:\$\w+|\@\w+|&\w+)/m, // Variable prefixes (PHP, Perl, etc.)
    ];

    // Check if content matches any code patterns
    for (const pattern of codePatterns) {
      if (pattern.test(content)) {
        return 'code';
      }
    }

    // Check for high density of technical punctuation
    const technicalChars = (content.match(/[{}()\[\];:=<>!&|+\-*\/]/g) || []).length;
    const contentLength = content.length;
    
    if (contentLength > 0 && (technicalChars / contentLength) > 0.1) {
      return 'code';
    }

    // Check for indentation patterns (common in code)
    const lines = content.split('\n');
    const indentedLines = lines.filter(line => /^\s{2,}/.test(line));
    
    if (lines.length > 2 && (indentedLines.length / lines.length) > 0.3) {
      return 'code';
    }

    return 'text';
  }

  /**
   * Sanitize string input with length limits and dangerous character removal
   */
  private sanitizeString(input: string, maxLength: number): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }

    // Remove null bytes and control characters except newlines/tabs
    let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Trim and limit length
    sanitized = sanitized.trim().substring(0, maxLength);

    return sanitized;
  }

  /**
   * Validate Qwen file format
   */
  public validateQwenFile(content: string): { isValid: boolean; error?: string } {
    try {
      if (!content || content.trim().length === 0) {
        return { isValid: false, error: 'Empty file content' };
      }

      // Check if it's JSON format
      if (this.isQwenJSONFormat(content)) {
        return { isValid: true };
      }

      // Check if it's text log format
      if (this.isQwenTextLogFormat(content)) {
        return { isValid: true };
      }

      return { isValid: false, error: 'Unrecognized Qwen format' };
    } catch (error) {
      return { isValid: false, error: `Validation failed: ${error}` };
    }
  }
}