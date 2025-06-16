/**
 * Refactored file import service with modular parser architecture
 * Implements centralized validation, error handling, and comprehensive metrics
 */

import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/api/fs';
import type { 
  FileValidationResult, 
  ImportResult, 
  ImportMetadata,
  ImportError,
  SupportedFileType
} from './types';
import { ParserRegistry } from './parserRegistry';
import { ImportValidationService } from './importValidation';
import { DatabaseService } from './database';

export class FileImporter {
  private parserRegistry: ParserRegistry;
  private validation: ImportValidationService;
  private database: DatabaseService;

  constructor() {
    this.parserRegistry = ParserRegistry.getInstance();
    this.validation = ImportValidationService.getInstance();
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
   * Validate file format with enhanced detection and fallback logic
   */
  public async validateFile(filePath: string): Promise<FileValidationResult> {
    try {
      const content = await readTextFile(filePath);
      
      // Perform basic validation first
      const sizeError = this.validation.validateFileSize(content, filePath);
      if (sizeError) {
        return {
          isValid: false,
          error: sizeError.message,
          fileType: 'unknown',
          confidence: 0
        };
      }

      const encodingError = this.validation.validateEncoding(content, filePath);
      if (encodingError && encodingError.severity === 'high') {
        return {
          isValid: false,
          error: encodingError.message,
          fileType: 'unknown',
          confidence: 0
        };
      }

      const jsonError = this.validation.validateJSONStructure(content, filePath);
      if (jsonError) {
        // JSON validation failed, but might be text format
        // Continue with format detection
      }

      // Use parser registry for format detection
      const result = this.parserRegistry.detectFileFormat(content, filePath);
      
      // Add encoding warning if present
      if (encodingError && result.isValid) {
        result.warning = encodingError.message;
      }

      return result;

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
   * Import and process a single file with comprehensive error handling
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

      // Get appropriate parser
      const parser = this.parserRegistry.getParser(validation.fileType!);
      if (!parser) {
        result.errors.push(`No parser available for file type: ${validation.fileType}`);
        metadata.failed_imports = 1;
        metadata.processing_time_ms = Date.now() - startTime;
        return result;
      }

      // Read and parse file content
      const content = await readTextFile(filePath);
      const parseResult = await parser.parseContent(content);

      // Validate parsed data
      const validationErrors = this.validateParsedData(parseResult, filePath);
      result.errors.push(...validationErrors.map(e => e.message));

      if (validationErrors.some(e => e.severity === 'high' || e.severity === 'critical')) {
        metadata.failed_imports = 1;
        metadata.processing_time_ms = Date.now() - startTime;
        return result;
      }

      // Merge results
      result.conversations = parseResult.conversations;
      result.messages = parseResult.messages;
      result.errors.push(...parseResult.errors);
      
      if ('warnings' in parseResult) {
        result.warnings.push(...parseResult.warnings);
      }

      // Save to database
      await this.saveImportResult(result);

      // Update metadata
      metadata.successful_imports = 1;
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
   * Import multiple files with aggregate metrics and error handling
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

    const fileResults: Array<{ filePath: string; result: ImportResult }> = [];

    // Process each file
    for (const filePath of filePaths) {
      try {
        const result = await this.importFile(filePath);
        fileResults.push({ filePath, result });

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
   * Validate parsed data against security and business rules
   */
  private validateParsedData(result: ImportResult, filePath: string): ImportError[] {
    const errors: ImportError[] = [];

    // Validate conversation count
    const convError = this.validation.validateConversationCount(result.conversations.length, filePath);
    if (convError) errors.push(convError);

    // Validate message count
    const msgError = this.validation.validateMessageCount(result.messages.length, filePath);
    if (msgError) errors.push(msgError);

    // Validate individual messages
    for (const message of result.messages) {
      // Validate content length
      const contentError = this.validation.validateContentLength(message.content, filePath);
      if (contentError) errors.push(contentError);

      // Validate timestamp
      const timestampError = this.validation.validateTimestamp(message.timestamp_utc, filePath);
      if (timestampError) errors.push(timestampError);

      // Sanitize content
      message.content = this.validation.sanitizeContent(message.content, 1024 * 1024);
      message.author = this.validation.sanitizeContent(message.author, 100);
    }

    // Validate conversations
    for (const conversation of result.conversations) {
      conversation.display_name = this.validation.sanitizeContent(conversation.display_name, 500);
      
      // Validate time bounds
      const startError = this.validation.validateTimestamp(conversation.start_time, filePath);
      if (startError) errors.push(startError);
      
      const endError = this.validation.validateTimestamp(conversation.end_time, filePath);
      if (endError) errors.push(endError);
    }

    return errors;
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
   * Get import statistics and health metrics
   */
  public getImportStatistics(): {
    supportedFormats: SupportedFileType[];
    validationConfig: any;
    parserStatus: Record<string, boolean>;
  } {
    return {
      supportedFormats: this.parserRegistry.getAvailableParsers(),
      validationConfig: this.validation.getConfig(),
      parserStatus: this.parserRegistry.getAvailableParsers().reduce((status, format) => {
        status[format] = this.parserRegistry.getParser(format) !== null;
        return status;
      }, {} as Record<string, boolean>)
    };
  }
}