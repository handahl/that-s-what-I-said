// src/lib/security/contentSanitizer.ts
import DOMPurify from 'dompurify';

/**
 * Content Sanitization Service
 * Implements HTML sanitization to prevent XSS attacks in chat content
 * 
 * @security CRITICAL: All user content must pass through sanitization
 * @constraint HTML sanitization required by CoDA security framework
 */
export class ContentSanitizer {
    private static instance: ContentSanitizer;
    private purifier: typeof DOMPurify;

    private constructor() {
        this.purifier = DOMPurify;
        this.configurePurifier();
    }

    public static getInstance(): ContentSanitizer {
        if (!ContentSanitizer.instance) {
            ContentSanitizer.instance = new ContentSanitizer();
        }
        return ContentSanitizer.instance;
    }

    /**
     * Configure DOMPurify with security-first settings
     * @security Whitelist-based approach, deny by default
     */
    private configurePurifier(): void {
        // Configure for secure defaults
        this.purifier.setConfig({
            // Allow only safe HTML elements for chat formatting
            ALLOWED_TAGS: [
                'b', 'i', 'em', 'strong', 'code', 'pre', 
                'blockquote', 'p', 'br', 'ul', 'ol', 'li'
            ],
            
            // Allow minimal safe attributes
            ALLOWED_ATTR: ['class'],
            
            // Security settings
            FORBID_SCRIPTS: true,
            FORBID_ATTR: ['onclick', 'onload', 'onerror', 'style'],
            ALLOW_DATA_ATTR: false,
            SANITIZE_DOM: true,
            KEEP_CONTENT: true,
            
            // Return strings, not DOM nodes
            RETURN_DOM: false,
            RETURN_DOM_FRAGMENT: false,
            RETURN_DOM_IMPORT: false
        });
    }

    /**
     * Sanitize chat message content
     * @param content Raw content from chat exports
     * @returns Sanitized content safe for rendering
     * @security XSS prevention for all user-generated content
     */
    public sanitizeChatContent(content: string): string {
        if (!content || typeof content !== 'string') {
            return '';
        }

        try {
            // Apply DOMPurify sanitization
            const sanitized = this.purifier.sanitize(content);
            
            // Additional validation for chat-specific patterns
            return this.applyChatContentValidation(sanitized);
            
        } catch (error) {
            console.error('Content sanitization failed:', error);
            // Return empty string on sanitization failure (fail secure)
            return '';
        }
    }

    /**
     * Sanitize code content (preserves structure but removes dangerous elements)
     * @param code Code content from programming conversations
     * @returns Sanitized code content
     */
    public sanitizeCodeContent(code: string): string {
        if (!code || typeof code !== 'string') {
            return '';
        }

        try {
            // More permissive config for code content
            const codeSanitized = this.purifier.sanitize(code, {
                ALLOWED_TAGS: ['code', 'pre', 'span'],
                ALLOWED_ATTR: ['class'],
                FORBID_SCRIPTS: true,
                SANITIZE_DOM: true
            });

            return codeSanitized;
        } catch (error) {
            console.error('Code sanitization failed:', error);
            return '';
        }
    }

    /**
     * Apply additional chat-specific content validation
     * @param content Already DOMPurify-sanitized content
     * @returns Further validated content
     */
    private applyChatContentValidation(content: string): string {
        // Remove potentially dangerous patterns that might bypass DOMPurify
        let validated = content;

        // Remove any remaining script-like patterns
        validated = validated.replace(/<script[^>]*>.*?<\/script>/gis, '');
        validated = validated.replace(/javascript:/gi, '');
        validated = validated.replace(/data:text\/html/gi, '');
        
        // Limit extremely long content (DoS prevention)
        if (validated.length > 50000) { // 50KB limit for single message
            validated = validated.substring(0, 50000) + '... [Content truncated for security]';
        }

        return validated;
    }

    /**
     * Validate and sanitize attachment names/metadata
     * @param filename Attachment filename
     * @returns Sanitized filename
     */
    public sanitizeFilename(filename: string): string {
        if (!filename || typeof filename !== 'string') {
            return 'untitled';
        }

        // Remove path traversal patterns and dangerous characters
        let sanitized = filename
            .replace(/[<>:"/\\|?*]/g, '_')  // Windows forbidden chars
            .replace(/\.\./g, '_')          // Path traversal
            .replace(/^\./, '_')            // Hidden files
            .substring(0, 255);            // Filename length limit

        return sanitized || 'untitled';
    }
}

// Export singleton instance
export const contentSanitizer = ContentSanitizer.getInstance();