<script lang="ts">
  import type { Conversation } from '../types';

  export let conversation: Conversation;
  export let onClick: () => void = () => {};

  function formatDateRange(startTime: number, endTime: number): string {
    const start = new Date(startTime * 1000);
    const end = new Date(endTime * 1000);
    
    const startMonth = start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    
    if (startMonth === endMonth) {
      return startMonth;
    }
    
    return `${startMonth} - ${endMonth}`;
  }

  function getSourceIcon(sourceApp: string): string {
    switch (sourceApp) {
      case 'ChatGPT':
        return '🤖';
      case 'Google Gemini':
        return '✨';
      case 'WhatsApp':
        return '💬';
      default:
        return '📱';
    }
  }

  function getChatTypeColor(chatType: string): string {
    return chatType === 'llm' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
  }
</script>

<div
  class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
  on:click={onClick}
  on:keydown={(e) => e.key === 'Enter' && onClick()}
  role="button"
  tabindex="0"
>
  <div class="flex items-start justify-between">
    <div class="flex-1 min-w-0">
      <div class="flex items-center space-x-2 mb-2">
        <span class="text-lg">{getSourceIcon(conversation.source_app)}</span>
        <span class="text-sm font-medium text-gray-600">{conversation.source_app}</span>
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {getChatTypeColor(conversation.chat_type)}">
          {conversation.chat_type.toUpperCase()}
        </span>
      </div>
      
      <h3 class="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
        {conversation.display_name}
      </h3>
      
      <p class="text-sm text-gray-500 mb-3">
        {formatDateRange(conversation.start_time, conversation.end_time)}
      </p>
      
      {#if conversation.tags.length > 0}
        <div class="flex flex-wrap gap-1">
          {#each conversation.tags.slice(0, 3) as tag}
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
              #{tag}
            </span>
          {/each}
          {#if conversation.tags.length > 3}
            <span class="text-xs text-gray-400">
              +{conversation.tags.length - 3} more
            </span>
          {/if}
        </div>
      {/if}
    </div>
    
    <div class="ml-4">
      <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </div>
  </div>
</div>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>