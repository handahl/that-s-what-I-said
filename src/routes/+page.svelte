<script lang="ts">
  import { onMount } from 'svelte';
  import VirtualList from 'svelte-virtual-list';
  import ConversationCard from '$lib/components/ConversationCard.svelte';
  import FileImportDialog from '$lib/components/FileImportDialog.svelte';
  import { DatabaseService } from '$lib/database';
  import { CryptoService } from '$lib/crypto';
  import type { Conversation, ImportResult } from '$lib/types';

  let database = DatabaseService.getInstance();
  let crypto = CryptoService.getInstance();
  let conversations: Conversation[] = [];
  let loading = true;
  let error = '';
  let showImportDialog = false;
  let isEncryptionSetup = false;
  let password = '';
  let confirmPassword = '';

  // Pagination
  let currentPage = 0;
  let hasMore = true;
  const pageSize = 50;

  onMount(async () => {
    await initializeApp();
  });

  async function initializeApp() {
    try {
      // Check if encryption is already set up (in a real app, you'd check for existing encrypted data)
      if (!isEncryptionSetup) {
        return; // Show encryption setup UI
      }

      await database.initializeDatabase();
      await loadConversations();
    } catch (err) {
      error = `Initialization failed: ${err}`;
    } finally {
      loading = false;
    }
  }

  async function setupEncryption() {
    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }

    if (password.length < 8) {
      error = 'Password must be at least 8 characters';
      return;
    }

    try {
      await crypto.initializeEncryption(password);
      await database.initializeDatabase();
      isEncryptionSetup = true;
      password = '';
      confirmPassword = '';
      error = '';
      await loadConversations();
    } catch (err) {
      error = `Encryption setup failed: ${err}`;
    }
  }

  async function loadConversations(reset = false) {
    try {
      if (reset) {
        conversations = [];
        currentPage = 0;
        hasMore = true;
      }

      const newConversations = await database.getConversations(
        'end_time',
        pageSize,
        currentPage * pageSize
      );

      if (newConversations.length < pageSize) {
        hasMore = false;
      }

      conversations = [...conversations, ...newConversations];
      currentPage++;
    } catch (err) {
      error = `Failed to load conversations: ${err}`;
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (hasMore && !loading) {
      loading = true;
      await loadConversations();
    }
  }

  function openImportDialog() {
    showImportDialog = true;
  }

  function closeImportDialog() {
    showImportDialog = false;
  }

  async function handleImported(event: CustomEvent<ImportResult>) {
    const result = event.detail;
    
    // Refresh conversations list
    await loadConversations(true);
    
    // Show success message
    if (result.conversations.length > 0) {
      // You could show a toast notification here
      console.log(`Imported ${result.conversations.length} conversations`);
    }
  }

  function selectConversation(conversation: Conversation) {
    // Navigate to conversation detail view
    console.log('Selected conversation:', conversation.id);
    // In a real app, you'd navigate to a detail route
  }
</script>

<svelte:head>
  <title>That's What I Said</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  {#if !isEncryptionSetup}
    <!-- Encryption Setup Screen -->
    <div class="min-h-screen flex items-center justify-center">
      <div class="bg-white p-8 rounded-lg shadow-md max-w-md w-full mx-4">
        <div class="text-center mb-6">
          <h1 class="text-2xl font-bold text-gray-900 mb-2">Welcome to That's What I Said</h1>
          <p class="text-gray-600">Set up encryption to secure your conversations</p>
        </div>

        <form on:submit|preventDefault={setupEncryption} class="space-y-4">
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
              Master Password
            </label>
            <input
              id="password"
              type="password"
              bind:value={password}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter a secure password"
              required
            />
          </div>

          <div>
            <label for="confirmPassword" class="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              bind:value={confirmPassword}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Confirm your password"
              required
            />
          </div>

          {#if error}
            <div class="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p class="text-sm text-red-700">{error}</p>
            </div>
          {/if}

          <button
            type="submit"
            class="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Set Up Encryption
          </button>
        </form>

        <div class="mt-6 p-4 bg-blue-50 rounded-lg">
          <p class="text-xs text-blue-700">
            🔒 Your password encrypts all data locally. We cannot recover it if lost.
          </p>
        </div>
      </div>
    </div>
  {:else}
    <!-- Main Application -->
    <div class="container mx-auto px-4 py-8">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">That's What I Said</h1>
          <p class="text-gray-600 mt-1">Your conversations, organized and searchable</p>
        </div>
        
        <button
          on:click={openImportDialog}
          class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>Import Files</span>
        </button>
      </div>

      {#if error}
        <div class="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p class="text-red-700">{error}</p>
        </div>
      {/if}

      <!-- Conversations Timeline -->
      {#if loading && conversations.length === 0}
        <div class="flex items-center justify-center py-12">
          <div class="text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p class="text-gray-600">Loading conversations...</p>
          </div>
        </div>
      {:else if conversations.length === 0}
        <div class="text-center py-12">
          <div class="mb-4">
            <svg class="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 class="text-lg font-medium text-gray-900 mb-2">No conversations yet</h3>
          <p class="text-gray-500 mb-6">Import your chat files to get started</p>
          <button
            on:click={openImportDialog}
            class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Import Your First Conversation
          </button>
        </div>
      {:else}
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-900">
              Timeline ({conversations.length} conversations)
            </h2>
          </div>

          <!-- Virtual List for Performance -->
          <div class="h-[600px]">
            <VirtualList items={conversations} let:item>
              <div class="mb-4">
                <ConversationCard 
                  conversation={item} 
                  onClick={() => selectConversation(item)}
                />
              </div>
            </VirtualList>
          </div>

          {#if hasMore}
            <div class="text-center py-4">
              <button
                on:click={loadMore}
                class="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200 transition-colors"
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Import Dialog -->
  {#if showImportDialog}
    <FileImportDialog
      on:close={closeImportDialog}
      on:imported={handleImported}
    />
  {/if}
</div>