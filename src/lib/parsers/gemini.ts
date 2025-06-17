/**
 * Gemini (Google AI) conversation parser with enhanced security validation
 * Transforms Gemini export JSON into unified data model
 * Implements strict input sanitization per security constraints
 */

import type {
  GeminiExport,
  GeminiConversation,
  GeminiMessage,
  GeminiTakeoutExport,
  GeminiTakeoutMessage,
  Conversation,
  ChatMessage,
  ImportResult,
} from '../types';
import { CryptoService } from '../crypto';
import { contentSanitizer } from '../security/contentSanitizer.js';

// Define a common Parser interface for consistency if not already present
interface Parser {
  parseGemini(fileContent: string): Promise<ImportResult>;
}

export class GeminiParser implements Parser {
  private crypto: CryptoService;

  constructor() {
    this.crypto = CryptoService.getInstance();
  }

  /**
   * Parse Gemini export JSON file with enhanced validation
   */
  public async parseGemini(fileContent: string): Promise<ImportResult> {
    const result: ImportResult = {
      conversations: [],
      messages: [],
      errors: [],
    };

    try {
      // Strict JSON parsing with size limits
      if (fileContent.length > 100 * 1024 * 1024) {
        // 100MB limit
        throw new Error('File too large (>100MB)');
      }

      const data = JSON.parse(fileContent);

      // Detect format type and parse accordingly
      if (this.isGeminiStandardFormat(data)) {
        await this.parseStandardFormat(data, result);
      } else if (this.isGeminiTakeoutFormat(data)) {
        await this.parseTakeoutFormat(data, result);
      } else {
        throw new Error('Unrecognized Gemini format');
      }
    } catch (error) {
      result.errors.push(`Invalid JSON format: ${error}`);
    }

    return result;
  }

  /**
   * Parse standard Gemini format with conversations array
   */
  private async parseStandardFormat(
    data: GeminiExport,
    result: ImportResult,
  ): Promise<void> {
    if (!Array.isArray(data.conversations)) {
      throw new Error('Invalid conversations array');
    }

    // Validate array size to prevent DoS
    if (data.conversations.length > 10000) {
      throw new Error('Too many conversations (>10,000)');
    }

    for (const conversationData of data.conversations) {
      try {
        const parsed = this.parseStandardConversation(conversationData);
        result.conversations.push(parsed.conversation);
        result.messages.push(...parsed.messages);
      } catch (error) {
        result.errors.push(`Failed to parse conversation: ${error}`);
      }
    }
  }

  /**
   * Parse Google Takeout format (single conversation or array)
   */
  private async parseTakeoutFormat(
    data: GeminiTakeoutExport | GeminiTakeoutExport[],
    result: ImportResult,
  ): Promise<void> {
    const conversations = Array.isArray(data) ? data : [data];

    // Validate array size to prevent DoS
    if (conversations.length > 10000) {
      throw new Error('Too many conversations (>10,000)');
    }

    for (const conversationData of conversations) {
      try {
        const parsed = this.parseTakeoutConversation(conversationData);
        result.conversations.push(parsed.conversation);
        result.messages.push(...parsed.messages);
      } catch (error) {
        result.errors.push(`Failed to parse conversation: ${error}`);
      }
    }
  }

  /**
   * Parse a single standard Gemini conversation
   */
  private parseStandardConversation(
    data: GeminiConversation,
  ): { conversation: Conversation; messages: ChatMessage[] } {
    // Enhanced input validation
    this.validateStandardConversationStructure(data);

    // Extract and validate messages
    const messages = this.extractStandardMessages(
      data.messages,
      data.conversation_id,
    );

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
    const createTimestamp = this.parseISOTimestamp(data.create_time);
    const updateTimestamp = this.parseISOTimestamp(data.update_time);

    const conversation: Conversation = {
      id: this.sanitizeString(data.conversation_id, 255),
      source_app: 'Google Gemini',
      chat_type: 'llm',
      display_name: this.sanitizeString(
        data.conversation_title || 'Untitled Gemini Chat',
        500,
      ),
      start_time: Math.min(startTime, createTimestamp),
      end_time: Math.max(endTime, updateTimestamp),
      tags: [],
    };

    return { conversation, messages };
  }

  /**
   * Parse a single Takeout format conversation
   */
  private parseTakeoutConversation(
    data: GeminiTakeoutExport,
  ): { conversation: Conversation; messages: ChatMessage[] } {
    // Enhanced input validation
    this.validateTakeoutConversationStructure(data);

    // Extract and validate messages
    const messages = this.extractTakeoutMessages(data.messages, data.id);

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
    const createTimestamp = this.parseISOTimestamp(data.created_date);
    const updateTimestamp = this.parseISOTimestamp(data.updated_date);

    const conversation: Conversation = {
      id: this.sanitizeString(data.id, 255),
      source_app: 'Google Gemini',
      chat_type: 'llm',
      display_name: this.sanitizeString(data.name || 'Untitled Gemini Chat', 500),
      start_time: Math.min(startTime, createTimestamp),
      end_time: Math.max(endTime, updateTimestamp),
      tags: [],
    };

    return { conversation, messages };
  }

  /**
   * Extract messages from standard Gemini format
   */
  private extractStandardMessages(
    geminiMessages: GeminiMessage[],
    conversationId: string,
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const geminiMessage of geminiMessages) {
      try {
        const processedMessage = this.processStandardMessage(
          geminiMessage,
          conversationId,
        );
        messages.push(processedMessage);
      } catch (error) {
        // Log individual message parsing errors but continue processing
        console.warn(`Failed to parse Gemini standard message:`, error);
        continue;
      }
    }

    // Sort messages chronologically
    return messages.sort((a, b) => a.timestamp_utc - b.timestamp_utc);
  }

  /**
   * Extract messages from Takeout format
   */
  private extractTakeoutMessages(
    geminiMessages: GeminiTakeoutMessage[],
    conversationId: string,
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const geminiMessage of geminiMessages) {
      try {
        const processedMessage = this.processTakeoutMessage(
          geminiMessage,
          conversationId,
        );
        messages.push(processedMessage);
      } catch (error) {
        // Log individual message parsing errors but continue processing
        console.warn(`Failed to parse Gemini Takeout message:`, error);
        continue;
      }
    }

    // Sort messages chronologically
    return messages.sort((a, b) => a.timestamp_utc - b.timestamp_utc);
  }

  /**
   * Processes a raw standard Gemini message into a unified ChatMessage format with sanitization.
   */
  private processStandardMessage(
    rawMessage: GeminiMessage,
    conversationId: string,
  ): ChatMessage {
    if (!this.isValidStandardMessage(rawMessage)) {
      throw new Error('Invalid standard Gemini message structure');
    }

    const timestamp = this.parseISOTimestamp(rawMessage.create_time);
    const author = this.mapGeminiAuthor(rawMessage.author.name);
    const rawContent = rawMessage.text || '';

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
        originalAuthor: rawMessage.author.name,
        sanitized: true,
        contentType: isCodeContent ? 'code' : 'text',
      },
    };
  }

  /**
   * Processes a raw Gemini Takeout message into a unified ChatMessage format with sanitization.
   */
  private processTakeoutMessage(
    rawMessage: GeminiTakeoutMessage,
    conversationId: string,
  ): ChatMessage {
    if (!this.isValidTakeoutMessage(rawMessage)) {
      throw new Error('Invalid Takeout Gemini message structure');
    }

    const timestamp = this.parseISOTimestamp(rawMessage.created_date);
    const author = this.mapGeminiAuthor(rawMessage.creator.name);
    const rawContent = rawMessage.content || '';

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
        originalAuthor: rawMessage.creator.name,
        sanitized: true,
        contentType: isCodeContent ? 'code' : 'text',
      },
    };
  }

  /**
   * Detect if data is standard Gemini format
   */
  private isGeminiStandardFormat(data: any): data is GeminiExport {
    return (
      data &&
      typeof data === 'object' &&
      Array.isArray(data.conversations) &&
      data.conversations.length > 0 &&
      data.conversations[0].conversation_id !== undefined
    );
  }

  /**
   * Detect if data is Gemini Takeout format
   */
  private isGeminiTakeoutFormat(
    data: any,
  ): data is GeminiTakeoutExport | GeminiTakeoutExport[] {
    const items = Array.isArray(data) ? data : [data];
    return (
      items.length > 0 &&
      items[0] &&
      typeof items[0] === 'object' &&
      (items[0].id !== undefined || items[0].name !== undefined) &&
      Array.isArray(items[0].messages) &&
      items[0].messages.length > 0 &&
      items[0].messages[0].creator !== undefined
    );
  }

  /**
   * Enhanced standard conversation structure validation
   */
  private validateStandardConversationStructure(data: any): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid conversation object');
    }

    if (!data.conversation_id || typeof data.conversation_id !== 'string') {
      throw new Error('Missing or invalid conversation_id');
    }

    if (data.conversation_id.length > 255) {
      throw new Error('conversation_id too long');
    }

    if (!data.create_time || typeof data.create_time !== 'string') {
      throw new Error('Missing or invalid create_time');
    }

    if (!data.update_time || typeof data.update_time !== 'string') {
      throw new Error('Missing or invalid update_time');
    }

    if (!data.messages || !Array.isArray(data.messages)) {
      throw new Error('Missing or invalid messages array');
    }

    // Validate messages array size to prevent DoS
    if (data.messages.length > 100000) {
      throw new Error('Too many messages (>100,000)');
    }
  }

  /**
   * Enhanced Takeout conversation structure validation
   */
  private validateTakeoutConversationStructure(data: any): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid conversation object');
    }

    if (!data.id || typeof data.id !== 'string') {
      throw new Error('Missing or invalid id');
    }

    if (data.id.length > 255) {
      throw new Error('id too long');
    }

    if (!data.created_date || typeof data.created_date !== 'string') {
      throw new Error('Missing or invalid created_date');
    }

    if (!data.updated_date || typeof data.updated_date !== 'string') {
      throw new Error('Missing or invalid updated_date');
    }

    if (!data.messages || !Array.isArray(data.messages)) {
      throw new Error('Missing or invalid messages array');
    }

    // Validate messages array size to prevent DoS
    if (data.messages.length > 100000) {
      throw new Error('Too many messages (>100,000)');
    }
  }

  /**
   * Enhanced standard message validation
   */
  private isValidStandardMessage(message: any): boolean {
    if (!message || typeof message !== 'object') return false;
    if (!message.create_time || typeof message.create_time !== 'string')
      return false;
    if (typeof message.text !== 'string') return false; // text can be empty, but must be a string
    if (!message.author || typeof message.author !== 'object') return false;
    if (!message.author.name || typeof message.author.name !== 'string')
      return false;

    return true;
  }

  /**
   * Enhanced Takeout message validation
   */
  private isValidTakeoutMessage(message: any): boolean {
    if (!message || typeof message !== 'object') return false;
    if (!message.created_date || typeof message.created_date !== 'string')
      return false;
    if (typeof message.content !== 'string') return false; // content can be empty, but must be a string
    if (!message.creator || typeof message.creator !== 'object') return false;
    if (!message.creator.name || typeof message.creator.name !== 'string')
      return false;

    return true;
  }

  /**
   * Parse ISO 8601 timestamp to Unix epoch with enhanced validation
   */
  private parseISOTimestamp(isoString: string): number {
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date format');
      }

      const timestamp = Math.floor(date.getTime() / 1000);

      // Validate timestamp is reasonable (not negative, not too far in future)
      if (timestamp < 0 || timestamp > Date.now() / 1000 + 86400) {
        throw new Error('Timestamp out of valid range');
      }

      return timestamp;
    } catch (error) {
      throw new Error(`Failed to parse timestamp "${isoString}": ${error}`);
    }
  }

  /**
   * Map Gemini author names to unified format with role normalization
   */
  private mapGeminiAuthor(authorName: string): string {
    if (typeof authorName !== 'string') return 'Unknown';

    const normalizedName = authorName.toLowerCase().trim();

    // Common Gemini role patterns
    if (
      normalizedName.includes('gemini') ||
      normalizedName.includes('bard') ||
      normalizedName === 'model' ||
      normalizedName === 'assistant' ||
      normalizedName === 'ai'
    ) {
      return 'Gemini';
    }

    if (
      normalizedName === 'user' ||
      normalizedName === 'human' ||
      normalizedName.includes('you')
    ) {
      return 'User';
    }

    // Return sanitized original name for other cases
    return this.sanitizeString(authorName, 50);
  }

  /**
   * Sanitize string input with length limits and dangerous character removal
   * (Kept as a general utility, but for chat/code content, prefer contentSanitizer)
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
   * Detect if content appears to be code/technical content
   * @param content Message content
   * @returns true if content appears to be code
   */
  private detectCodeContent(content: string): boolean {
    const codeIndicators = [
      /```[\s\S]*```/, // Code blocks
      /`[^`]+`/, // Inline code
      /function\s+\w+\s*\(/, // Function definitions
      /class\s+\w+/, // Class definitions
      /import\s+.*from/, // Import statements
      /console\.(log|error)/, // Console statements
      /<\w+[^>]*>/, // HTML/XML tags
      /^\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/im, // SQL keywords
      /^\s*(?:print|console\.log|echo|printf)\s*\(/m, // Common print statements
    ];

    return codeIndicators.some((pattern) => pattern.test(content));
  }

  /**
   * Enhanced Gemini file format validation
   */
  public validateGeminiFile(content: string): { isValid: boolean; error?: string } {
    try {
      // Size validation
      if (content.length > 100 * 1024 * 1024) {
        return { isValid: false, error: 'File too large (>100MB)' };
      }

      if (content.length === 0) {
        return { isValid: false, error: 'Empty file' };
      }

      const data = JSON.parse(content);

      // Check if it's either format
      if (!this.isGeminiStandardFormat(data) && !this.isGeminiTakeoutFormat(data)) {
        return { isValid: false, error: 'Not a valid Gemini format' };
      }

      // Validate structure based on detected format
      if (this.isGeminiStandardFormat(data)) {
        if (data.conversations.length > 10000) {
          return { isValid: false, error: 'Too many conversations (>10,000)' };
        }

        // Validate sample conversations
        for (let i = 0; i < Math.min(data.conversations.length, 10); i++) {
          try {
            this.validateStandardConversationStructure(data.conversations[i]);
          } catch (error) {
            return { isValid: false, error: `Conversation ${i}: ${error}` };
          }
        }
      } else {
        const conversations = Array.isArray(data) ? data : [data];

        if (conversations.length > 10000) {
          return { isValid: false, error: 'Too many conversations (>10,000)' };
        }

        // Validate sample conversations
        for (let i = 0; i < Math.min(conversations.length, 10); i++) {
          try {
            this.validateTakeoutConversationStructure(conversations[i]);
          } catch (error) {
            return { isValid: false, error: `Conversation ${i}: ${error}` };
          }
        }
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: `Invalid JSON: ${error}` };
    }
  }
}