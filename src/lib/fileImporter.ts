/**
 * Enhanced file import service with better error handling and validation
 * Implements centralized validation, error handling, and comprehensive metrics
 */

import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import type { 
  FileValidationResult, 
  ImportResult, 
  ImportMetadata,
  ImportError,
  SupportedFileType,
  Conversation,
  ChatMessage
} from './types';
import { DatabaseService } from './database';
import { ChatGPTParser } from './parsers/chatgpt';
import { ClaudeParser } from './parsers/claude';
import { GeminiParser } from './parsers/gemini';
import { QwenParser } from './parsers/qwen';

export class FileImporter {
  private database: DatabaseService;
  private chatgptParser: ChatGPTParser;
  private claudeParser: ClaudeParser;
  private geminiParser: GeminiParser;
  private qwenParser: QwenParser;

  constructor() {
    this.database = DatabaseService.getInstance();
    this.chatgptParser = new ChatGPTParser();
    this.claudeParser = new ClaudeParser();
    this.geminiParser = new GeminiParser();
    this.qwenParser = new QwenParser();
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
   * Validate file format with enhanced detection
   */
  public async validateFile(filePath: string): Promise<FileValidationResult> {
    try {
      const content = await readTextFile(filePath);
      
      // Basic validation
      if (content.length === 0) {
        return {
          isValid: false,
          error: 'Empty file',
          fileType: 'unknown',
          confidence: 0
        };
      }

      if (content.length > 100 * 1024 * 1024) { // 100MB limit
        return {
          isValid: false,
          error: 'File too large (>100MB)',
          fileType: 'unknown',
          confidence: 0
        };
      }

      // Try each parser in order
      const parsers = [
        { type: 'chatgpt' as const, validator: this.chatgptParser.validateChatGPTFile.bind(this.chatgptParser) },
        { type: 'claude' as const, validator: this.claudeParser.validateClaudeFile.bind(this.claudeParser) },
        { type: 'gemini' as const, validator: this.geminiParser.validateGeminiFile.bind(this.geminiParser) },
        { type: 'qwen' as const, validator: this.qwenParser.validateQwenFile.bind(this.qwenParser) }
      ];

      for (const parser of parsers) {
        try {
          const result = parser.validator(content);
          if (result.isValid) {
            return {
              isValid: true,
              fileType: parser.type,
              confidence: 95,
              fallbackAttempted: false
            };
          }
        } catch (error) {
          continue; // Try next parser
        }
      }

      return {
        isValid: false,
        error: 'Unsupported file format',
        fileType: 'unknown',
        confidence: 0,
        fallbackAttempted: true
      };

    } catch (error) {
      return { 
        isValid: false, 
        error: `File read error: ${error}`,
        fileType: 'unknown',
        confidence: 0
      };
    }
  }

  /**
   * Import and process a single file
   */
  public async importFile(filePath: string): Promise<ImportResult> {
    const startTime = Date.now();
    const metadata: ImportMetadata = {
      total_files_processed: 1,
      successful_imports: 0,
      failed_imports: 0,
      total_conversations: 0,
      total_messages: 0,
      processing_time_ms: 0,
      detected_formats: {},
      parser_fallbacks: 0
    };

    const result: ImportResult = {
      conversations: [],
      messages: [],
      errors: [],
      warnings: [],
      metadata
    };

    try {
      // Validate file format
      const validation = await this.validateFile(filePath);
      
      if (!validation.isValid) {
        result.errors.push(validation.error || 'File validation failed');
        metadata.failed_imports = 1;
        metadata.processing_time_ms = Date.now() - startTime;
        return result;
      }

      // Track format detection
      if (validation.fileType && validation.fileType !== 'unknown') {
        metadata.detected_formats[validation.fileType] = 1;
      }

      if (validation.fallbackAttempted) {
        metadata.parser_fallbacks = 1;
      }

      if (validation.warning) {
        result.warnings.push(validation.warning);
      }

      // Read and parse file content
      const content = await readTextFile(filePath);
      let parseResult: ImportResult;

      switch (validation.fileType) {
        case 'chatgpt':
          parseResult = await this.chatgptParser.parseChatGPT(content);
          break;
        case 'claude':
          parseResult = await this.claudeParser.parseClaude(content);
          break;
        case 'gemini':
          parseResult = await this.geminiParser.parseGemini(content);
          break;
        case 'qwen':
          parseResult = await this.qwenParser.parseQwen(content);
          break;
        default:
          throw new Error(`No parser available for file type: ${validation.fileType}`);
      }

      // Merge results
      result.conversations = parseResult.conversations;
      result.messages = parseResult.messages;
      result.errors.push(...parseResult.errors);
      
      if ('warnings' in parseResult) {
        result.warnings.push(...parseResult.warnings);
      }

      // Save to database if we have valid data
      if (result.conversations.length > 0) {
        await this.saveImportResult(result);
        metadata.successful_imports = 1;
      } else {
        metadata.failed_imports = 1;
      }

      // Update metadata
      metadata.total_conversations = result.conversations.length;
      metadata.total_messages = result.messages.length;

    } catch (error) {
      result.errors.push(`Import failed: ${error}`);
      metadata.failed_imports = 1;
    } finally {
      metadata.processing_time_ms = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Import multiple files
   */
  public async importFiles(filePaths: string[]): Promise<ImportResult> {
    const startTime = Date.now();
    const aggregateResult: ImportResult = {
      conversations: [],
      messages: [],
      errors: [],
      warnings: [],
      metadata: {
        total_files_processed: filePaths.length,
        successful_imports: 0,
        failed_imports: 0,
        total_conversations: 0,
        total_messages: 0,
        processing_time_ms: 0,
        detected_formats: {},
        parser_fallbacks: 0
      }
    };

    // Process each file
    for (const filePath of filePaths) {
      try {
        const result = await this.importFile(filePath);

        // Aggregate results
        aggregateResult.conversations.push(...result.conversations);
        aggregateResult.messages.push(...result.messages);
        aggregateResult.errors.push(...result.errors.map(e => `${filePath}: ${e}`));
        aggregateResult.warnings.push(...result.warnings.map(w => `${filePath}: ${w}`));

        // Aggregate metadata
        if (result.metadata.successful_imports > 0) {
          aggregateResult.metadata.successful_imports++;
        } else {
          aggregateResult.metadata.failed_imports++;
        }

        aggregateResult.metadata.total_conversations += result.metadata.total_conversations;
        aggregateResult.metadata.total_messages += result.metadata.total_messages;
        aggregateResult.metadata.parser_fallbacks += result.metadata.parser_fallbacks;

        // Merge detected formats
        for (const [format, count] of Object.entries(result.metadata.detected_formats)) {
          aggregateResult.metadata.detected_formats[format] = 
            (aggregateResult.metadata.detected_formats[format] || 0) + count;
        }

      } catch (error) {
        aggregateResult.errors.push(`${filePath}: ${error}`);
        aggregateResult.metadata.failed_imports++;
      }
    }

    aggregateResult.metadata.processing_time_ms = Date.now() - startTime;
    return aggregateResult;
  }

  /**
   * Save import result to database
   */
  private async saveImportResult(result: ImportResult): Promise<void> {
    try {
      // Save conversations first
      for (const conversation of result.conversations) {
        await this.database.saveConversation(conversation);
      }

      // Save messages
      if (result.messages.length > 0) {
        await this.database.saveMessages(result.messages);
      }
    } catch (error) {
      throw new Error(`Database save failed: ${error}`);
    }
  }

  /**
   * Get import statistics
   */
  public getImportStatistics(): {
    supportedFormats: SupportedFileType[];
    databaseReady: boolean;
  } {
    return {
      supportedFormats: ['chatgpt', 'claude', 'gemini', 'qwen'],
      databaseReady: this.database.isReady()
    };
  }
}