<!-- src/lib/components/ConversationCard.svelte -->
<script>
    import { contentSanitizer } from '../security/contentSanitizer';
    
    export let message; // ChatMessage object
    
    // Double sanitization at render time (defense in depth)
    $: sanitizedContent = contentSanitizer.sanitizeChatContent(message.content);
    
    // Determine content type for appropriate rendering
    $: isCodeContent = message.metadata?.contentType === 'code' || 
                       /```|`/.test(message.content);
    
    // Apply code-specific sanitization if needed
    $: displayContent = isCodeContent 
        ? contentSanitizer.sanitizeCodeContent(sanitizedContent)
        : sanitizedContent;
</script>

<div class="conversation-card" data-role={message.role}>
    <div class="message-header">
        <span class="role">{message.role}</span>
        <span class="timestamp">{new Date(message.timestamp).toLocaleString()}</span>
        
        <!-- Security indicator -->
        {#if message.metadata?.sanitized}
            <span class="security-badge" title="Content sanitized for security">🔒</span>
        {/if}
    </div>
    
    <div class="message-content">
        {#if isCodeContent}
            <!-- Code content with syntax highlighting but still sanitized -->
            <pre class="code-block"><code>{@html displayContent}</code></pre>
        {:else}
            <!-- Regular message content - sanitized HTML rendering -->
            <div class="message-text">{@html displayContent}</div>
        {/if}
    </div>
    
    <!-- Message metadata -->
    {#if message.metadata}
        <div class="message-meta">
            <small>
                Type: {message.metadata.contentType || 'text'} 
                | Sanitized: {message.metadata.sanitized ? 'Yes' : 'No'}
            </small>
        </div>
    {/if}
</div>

<style>
    .conversation-card {
        border: 1px solid var(--border-gray);
        border-radius: 8px;
        padding: 1rem;
        margin: 0.5rem 0;
        background: white;
    }
    
    .message-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
        color: var(--text-gray);
    }
    
    .security-badge {
        background: var(--security-green);
        color: white;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.8rem;
        cursor: help;
    }
    
    .code-block {
        background: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 4px;
        padding: 1rem;
        overflow-x: auto;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
    }
    
    .message-text {
        line-height: 1.6;
        word-wrap: break-word;
    }
    
    .message-meta {
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px solid #f0f0f0;
        color: #666;
    }
    
    /* Role-based styling */
    [data-role="user"] {
        border-left: 4px solid var(--primary-blue);
    }
    
    [data-role="assistant"] {
        border-left: 4px solid var(--security-green);
    }
</style>