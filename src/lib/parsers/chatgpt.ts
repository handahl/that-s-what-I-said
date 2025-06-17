/**
 * ChatGPT conversation parser with enhanced input validation
 * Transforms ChatGPT export JSON into unified data model
 * Implements strict input sanitization per security constraints
 */

import type {
  ChatGPTExport,
  ChatGPTNode,
  ChatGPTMessage,
  Conversation,
  ChatMessage,
  ImportResult,
} from '../types';
import { CryptoService } from '../crypto';
import { contentSanitizer } from '../security/contentSanitizer.js';

// Assuming a Parser interface exists based on your prompt, though not provided in the original code.
// For the purpose of this update, I'm defining a minimal one if it doesn't exist, or you can remove
// `implements Parser` if not applicable to your setup.
interface Parser {
  parseChatGPT(fileContent: string): Promise<ImportResult>;
}

export class ChatGPTParser implements Parser {
  private crypto: CryptoService;

  constructor() {
    this.crypto = CryptoService.getInstance();
  }

  /**
   * Parse ChatGPT conversations.json file with enhanced validation
   */
  public async parseChatGPT(fileContent: string): Promise<ImportResult> {
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

      // Handle both single conversation and array of conversations
      const conversations = Array.isArray(data) ? data : [data];

      // Validate array size to prevent DoS
      if (conversations.length > 10000) {
        throw new Error('Too many conversations (>10,000)');
      }

      for (const conversationData of conversations) {
        try {
          const parsed = this.parseConversation(conversationData);
          result.conversations.push(parsed.conversation);
          result.messages.push(...parsed.messages);
        } catch (error) {
          result.errors.push(`Failed to parse conversation: ${error}`);
        }
      }
    } catch (error) {
      result.errors.push(`Invalid JSON format: ${error}`);
    }

    return result;
  }

  /**
   * Parse a single ChatGPT conversation with strict validation
   */
  private parseConversation(
    data: ChatGPTExport,
  ): { conversation: Conversation; messages: ChatMessage[] } {
    // Enhanced input validation
    this.validateConversationStructure(data);

    // Extract messages from the mapping tree
    const messages = this.extractMessages(data.mapping, data.conversation_id);

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

    const conversation: Conversation = {
      id: this.sanitizeString(data.conversation_id, 255),
      source_app: 'ChatGPT',
      chat_type: 'llm',
      display_name: this.sanitizeString(data.title, 500),
      start_time: startTime,
      end_time: endTime,
      tags: [],
    };

    return { conversation, messages };
  }

  /**
   * Enhanced conversation structure validation
   */
  private validateConversationStructure(data: any): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid conversation object');
    }

    if (!data.conversation_id || typeof data.conversation_id !== 'string') {
      throw new Error('Missing or invalid conversation_id');
    }

    if (data.conversation_id.length > 255) {
      throw new Error('conversation_id too long');
    }

    if (!data.title || typeof data.title !== 'string') {
      throw new Error('Missing or invalid title');
    }

    if (data.title.length > 1000) {
      throw new Error('Title too long');
    }

    if (!data.mapping || typeof data.mapping !== 'object') {
      throw new Error('Missing or invalid mapping');
    }

    // Validate mapping size to prevent DoS
    const mappingKeys = Object.keys(data.mapping);
    if (mappingKeys.length > 100000) {
      throw new Error('Mapping too large (>100,000 nodes)');
    }
  }

  /**
   * Extract and flatten messages from ChatGPT mapping tree with validation
   */
  private extractMessages(
    mapping: Record<string, ChatGPTNode>,
    conversationId: string,
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const [nodeId, node] of Object.entries(mapping)) {
      try {
        // Validate node structure
        if (!node || typeof node !== 'object') {
          continue;
        }

        if (!node.message) continue;

        const rawMessage = node.message;

        // Skip system messages
        if (rawMessage.author?.role === 'system') continue;

        // Process and sanitize the message
        const processedMessage = this.processMessage(rawMessage, conversationId);
        messages.push(processedMessage);
      } catch (error) {
        // Log individual message parsing errors but continue processing
        console.warn(`Failed to parse message ${nodeId}:`, error);
        continue;
      }
    }

    // Sort messages chronologically
    return messages.sort((a, b) => a.timestamp_utc - b.timestamp_utc);
  }

  /**
   * Processes a raw ChatGPT message into a unified ChatMessage format with sanitization.
   */
  private processMessage(rawMessage: ChatGPTMessage, conversationId: string): ChatMessage {
    // Enhanced message validation
    if (!this.isValidMessage(rawMessage)) {
      throw new Error('Invalid message structure');
    }

    const rawContentPart = rawMessage.content?.parts?.[0] || '';

    // SECURITY: Sanitize content before creating ChatMessage
    const sanitizedContent = contentSanitizer.sanitizeChatContent(rawContentPart);

    // Handle code content separately if detected
    const isCodeContent = this.detectCodeContent(sanitizedContent);
    const finalContent = isCodeContent
      ? contentSanitizer.sanitizeCodeContent(sanitizedContent)
      : sanitizedContent;

    // Skip empty messages after sanitization
    if (!finalContent.trim()) {
      throw new Error('Message content is empty after sanitization');
    }

    // Generate secure message ID
    const messageId = this.crypto.generateHash(finalContent, rawMessage.create_time);

    return {
      message_id: messageId, // This replaces the crypto.randomUUID() for consistency with existing logic
      conversation_id: conversationId,
      timestamp_utc: rawMessage.create_time,
      author: this.mapAuthorRole(rawMessage.author?.role),
      content: finalContent, // Now sanitized
      content_type: isCodeContent ? 'code' : 'text',
      // Adding metadata as per your request, though your original ChatMessage type might not have it.
      // You might need to update your `ChatMessage` type definition.
      metadata: {
        originalAuthor: rawMessage.author?.role,
        messageIndex: rawMessage.id, // Assuming message.id exists for tracking original index
        sanitized: true, // Track that sanitization was applied
      },
    };
  }

  /**
   * Enhanced message validation
   */
  private isValidMessage(message: any): boolean {
    if (!message || typeof message !== 'object') return false;
    if (!message.create_time || typeof message.create_time !== 'number') return false;
    if (message.create_time < 0 || message.create_time > Date.now() / 1000 + 86400) return false; // Not future dated beyond 1 day
    if (!message.content?.parts || !Array.isArray(message.content.parts)) return false;
    if (!message.author?.role || typeof message.author.role !== 'string') return false;

    return true;
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
   * Map ChatGPT author roles to display names with validation
   */
  private mapAuthorRole(role: string): string {
    if (typeof role !== 'string') return 'Unknown';

    switch (role.toLowerCase()) {
      case 'user':
        return 'User';
      case 'assistant':
        return 'ChatGPT';
      default:
        return this.sanitizeString(role, 50);
    }
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
    ];

    return codeIndicators.some((pattern) => pattern.test(content));
  }

  /**
   * Enhanced ChatGPT file format validation
   */
  public validateChatGPTFile(content: string): { isValid: boolean; error?: string } {
    try {
      // Size validation
      if (content.length > 100 * 1024 * 1024) {
        return { isValid: false, error: 'File too large (>100MB)' };
      }

      if (content.length === 0) {
        return { isValid: false, error: 'Empty file' };
      }

      const data = JSON.parse(content);

      // Handle both single conversation and array
      const conversations = Array.isArray(data) ? data : [data];

      if (conversations.length === 0) {
        return { isValid: false, error: 'No conversations found' };
      }

      if (conversations.length > 10000) {
        return { isValid: false, error: 'Too many conversations (>10,000)' };
      }

      // Validate each conversation structure
      for (let i = 0; i < Math.min(conversations.length, 10); i++) {
        // Sample first 10
        const conv = conversations[i];

        try {
          this.validateConversationStructure(conv);
        } catch (error) {
          return { isValid: false, error: `Conversation ${i}: ${error}` };
        }
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: `Invalid JSON: ${error}` };
    }
  }
}