/**
 * File import service with validation and processing
 * Handles secure file selection and format detection
 */

import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/api/fs';
import type { FileValidationResult, ImportResult } from './types';
import { ChatGPTParser } from './parsers/chatgpt';
import { ClaudeParser } from './parsers/claude';
import { DatabaseService } from './database';

export class FileImporter {
  private chatgptParser: ChatGPTParser;
  private claudeParser: ClaudeParser;
  private database: DatabaseService;

  constructor() {
    this.chatgptParser = new ChatGPTParser();
    this.claudeParser = new ClaudeParser();
    this.database = DatabaseService.getInstance();
  }

  /**
   * Open file dialog and select files for import
   */
  public async selectFiles(): Promise<string[]> {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: 'Chat Files',
            extensions: ['json', 'txt', 'md']
          }
        ]
      });

      if (!selected) return [];
      
      return Array.isArray(selected) ? selected : [selected];
    } catch (error) {
      throw new Error(`File selection failed: ${error}`);
    }
  }

  /**
   * Validate file format and detect type
   */
  public async validateFile(filePath: string): Promise<FileValidationResult> {
    try {
      const content = await readTextFile(filePath);
      
      // Try ChatGPT format first
      const chatgptValidation = this.chatgptParser.validateChatGPTFile(content);
      if (chatgptValidation.isValid) {
        return { isValid: true, fileType: 'chatgpt' };
      }

      // Try Claude format
      const claudeValidation = this.claudeParser.validateClaudeFile(content);
      if (claudeValidation.isValid) {
        return { isValid: true, fileType: 'claude' };
      }

      // Check for other formats (placeholder for future parsers)
      if (this.looksLikeWhatsApp(content)) {
        return { isValid: true, fileType: 'whatsapp' };
      }

      if (this.looksLikeGemini(content)) {
        return { isValid: true, fileType: 'gemini' };
      }

      return { 
        isValid: false, 
        error: 'Unsupported file format',
        fileType: 'unknown'
      };

    } catch (error) {
      return { 
        isValid: false, 
        error: `File read error: ${error}` 
      };
    }
  }

  /**
   * Import and process a file
   */
  public async importFile(filePath: string): Promise<ImportResult> {
    const validation = await this.validateFile(filePath);
    
    if (!validation.isValid) {
      return {
        conversations: [],
        messages: [],
        errors: [validation.error || 'File validation failed']
      };
    }

    try {
      const content = await readTextFile(filePath);
      let result: ImportResult;

      switch (validation.fileType) {
        case 'chatgpt':
          result = await this.chatgptParser.parseChatGPT(content);
          break;
        case 'claude':
          result = await this.claudeParser.parseClaude(content);
          break;
        default:
          return {
            conversations: [],
            messages: [],
            errors: [`Unsupported file type: ${validation.fileType}`]
          };
      }

      // Save to database
      await this.saveImportResult(result);
      
      return result;

    } catch (error) {
      return {
        conversations: [],
        messages: [],
        errors: [`Import failed: ${error}`]
      };
    }
  }

  /**
   * Import multiple files
   */
  public async importFiles(filePaths: string[]): Promise<ImportResult> {
    const combinedResult: ImportResult = {
      conversations: [],
      messages: [],
      errors: []
    };

    for (const filePath of filePaths) {
      const result = await this.importFile(filePath);
      combinedResult.conversations.push(...result.conversations);
      combinedResult.messages.push(...result.messages);
      combinedResult.errors.push(...result.errors);
    }

    return combinedResult;
  }

  /**
   * Save import result to database
   */
  private async saveImportResult(result: ImportResult): Promise<void> {
    // Save conversations first
    for (const conversation of result.conversations) {
      await this.database.saveConversation(conversation);
    }

    // Save messages
    if (result.messages.length > 0) {
      await this.database.saveMessages(result.messages);
    }
  }

  /**
   * Detect WhatsApp format (placeholder)
   */
  private looksLikeWhatsApp(content: string): boolean {
    // Simple heuristic for WhatsApp format
    const whatsappPattern = /\[\d{1,2}\/\d{1,2}\/\d{2,4},\s\d{1,2}:\d{2}\]/;
    return whatsappPattern.test(content);
  }

  /**
   * Detect Gemini format (placeholder)
   */
  private looksLikeGemini(content: string): boolean {
    try {
      const data = JSON.parse(content);
      return data.conversations && Array.isArray(data.conversations);
    } catch {
      return false;
    }
  }
}