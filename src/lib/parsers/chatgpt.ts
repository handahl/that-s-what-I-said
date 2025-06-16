/**
 * ChatGPT conversation parser
 * Transforms ChatGPT export JSON into unified data model
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
   * Parse ChatGPT conversations.json file
   */
  public async parseChatGPT(fileContent: string): Promise<ImportResult> {
    const result: ImportResult = {
      conversations: [],
      messages: [],
      errors: []
    };

    try {
      const data = JSON.parse(fileContent);
      
      // Handle both single conversation and array of conversations
      const conversations = Array.isArray(data) ? data : [data];

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
   * Parse a single ChatGPT conversation
   */
  private parseConversation(data: ChatGPTExport): { conversation: Conversation; messages: ChatMessage[] } {
    if (!data.conversation_id || !data.title || !data.mapping) {
      throw new Error('Invalid conversation structure');
    }

    // Extract messages from the mapping tree
    const messages = this.extractMessages(data.mapping, data.conversation_id);
    
    if (messages.length === 0) {
      throw new Error('No messages found in conversation');
    }

    // Calculate conversation time bounds
    const timestamps = messages.map(m => m.timestamp_utc);
    const startTime = Math.min(...timestamps);
    const endTime = Math.max(...timestamps);

    const conversation: Conversation = {
      id: data.conversation_id,
      source_app: 'ChatGPT',
      chat_type: 'llm',
      display_name: data.title,
      start_time: startTime,
      end_time: endTime,
      tags: []
    };

    return { conversation, messages };
  }

  /**
   * Extract and flatten messages from ChatGPT mapping tree
   */
  private extractMessages(mapping: Record<string, ChatGPTNode>, conversationId: string): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const [nodeId, node] of Object.entries(mapping)) {
      if (!node.message) continue;

      const message = node.message;
      
      // Skip system messages
      if (message.author.role === 'system') continue;

      // Validate required fields
      if (!message.create_time || !message.content?.parts) continue;

      // Map author role to display name
      const author = this.mapAuthorRole(message.author.role);
      
      // Join content parts
      const content = message.content.parts.join('');
      
      // Skip empty messages
      if (!content.trim()) continue;

      // Determine content type
      const contentType = this.determineContentType(message.content.content_type, content);

      // Generate secure message ID
      const messageId = this.crypto.generateHash(content, message.create_time);

      messages.push({
        message_id: messageId,
        conversation_id: conversationId,
        timestamp_utc: message.create_time,
        author,
        content: content.trim(),
        content_type: contentType
      });
    }

    // Sort messages chronologically
    return messages.sort((a, b) => a.timestamp_utc - b.timestamp_utc);
  }

  /**
   * Map ChatGPT author roles to display names
   */
  private mapAuthorRole(role: string): string {
    switch (role) {
      case 'user':
        return 'User';
      case 'assistant':
        return 'ChatGPT';
      default:
        return role;
    }
  }

  /**
   * Determine content type based on ChatGPT metadata and content analysis
   */
  private determineContentType(contentType: string, content: string): 'text' | 'code' {
    // Check ChatGPT's content_type field first
    if (contentType === 'code') {
      return 'code';
    }

    // Analyze content for code patterns
    const codePatterns = [
      /```[\s\S]*?```/g, // Code blocks
      /`[^`\n]+`/g, // Inline code
      /^\s*(?:function|class|def|import|from|const|let|var|if|for|while)\s/m, // Code keywords
      /^\s*[{}\[\]();]/m, // Code punctuation at line start
    ];

    for (const pattern of codePatterns) {
      if (pattern.test(content)) {
        return 'code';
      }
    }

    return 'text';
  }

  /**
   * Validate ChatGPT file format
   */
  public validateChatGPTFile(content: string): { isValid: boolean; error?: string } {
    try {
      const data = JSON.parse(content);
      
      // Handle both single conversation and array
      const conversations = Array.isArray(data) ? data : [data];
      
      for (const conv of conversations) {
        if (!conv.conversation_id || typeof conv.conversation_id !== 'string') {
          return { isValid: false, error: 'Missing or invalid conversation_id' };
        }
        
        if (!conv.title || typeof conv.title !== 'string') {
          return { isValid: false, error: 'Missing or invalid title' };
        }
        
        if (!conv.mapping || typeof conv.mapping !== 'object') {
          return { isValid: false, error: 'Missing or invalid mapping' };
        }
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: `Invalid JSON: ${error}` };
    }
  }
}