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
  ImportResult 
} from '../types';
import { CryptoService } from '../crypto';

export class ChatGPTParser {
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
      errors: []
    };

    try {
      // Strict JSON parsing with size limits
      if (fileContent.length > 100 * 1024 * 1024) { // 100MB limit
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
  private parseConversation(data: ChatGPTExport): { conversation: Conversation; messages: ChatMessage[] } {
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
    const timestamps = messages.map(m => m.timestamp_utc);
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
      tags: []
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
  private extractMessages(mapping: Record<string, ChatGPTNode>, conversationId: string): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const [nodeId, node] of Object.entries(mapping)) {
      try {
        // Validate node structure
        if (!node || typeof node !== 'object') {
          continue;
        }

        if (!node.message) continue;

        const message = node.message;
        
        // Skip system messages
        if (message.author?.role === 'system') continue;

        // Enhanced message validation
        if (!this.isValidMessage(message)) {
          continue;
        }

        // Map author role to display name
        const author = this.mapAuthorRole(message.author.role);
        
        // Join and sanitize content parts
        const content = this.sanitizeContent(message.content.parts.join(''));
        
        // Skip empty messages after sanitization
        if (!content.trim()) continue;

        // Determine content type
        const contentType = this.determineContentType(message.content.content_type, content);

        // Generate secure message ID
        const messageId = this.crypto.generateHash(content, message.create_time);

        messages.push({
          message_id: messageId,
          conversation_id: conversationId,
          timestamp_utc: message.create_time,
          author: this.sanitizeString(author, 100),
          content: content,
          content_type: contentType
        });

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
   * Sanitize content with enhanced security checks
   */
  private sanitizeContent(content: string): string {
    if (typeof content !== 'string') return '';
    
    // Content size limit (1MB per message)
    if (content.length > 1024 * 1024) {
      content = content.substring(0, 1024 * 1024);
    }

    // Remove dangerous control characters but preserve formatting
    return content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
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
   * Determine content type with enhanced pattern matching
   */
  private determineContentType(contentType: string, content: string): 'text' | 'code' {
    // Check ChatGPT's content_type field first
    if (contentType === 'code') {
      return 'code';
    }

    // Enhanced code detection patterns
    const codePatterns = [
      /```[\s\S]*?```/g, // Code blocks
      /`[^`\n]+`/g, // Inline code
      /^\s*(?:function|class|def|import|from|const|let|var|if|for|while|return)\s/m, // Code keywords
      /^\s*[{}\[\]();]/m, // Code punctuation at line start
      /^\s*(?:\/\/|\/\*|\#|<!--)/m, // Comment patterns
      /(?:npm|pip|cargo|go get)\s+install/i, // Package manager commands
    ];

    for (const pattern of codePatterns) {
      if (pattern.test(content)) {
        return 'code';
      }
    }

    return 'text';
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
      for (let i = 0; i < Math.min(conversations.length, 10); i++) { // Sample first 10
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