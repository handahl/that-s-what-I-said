<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { FileImporter } from '../fileImporter';
  import type { ImportResult } from '../types';

  const dispatch = createEventDispatcher<{
    close: void;
    imported: ImportResult;
  }>();

  let fileImporter = new FileImporter();
  let isImporting = false;
  let importProgress = '';
  let selectedFiles: string[] = [];
  let validationResults: Array<{ path: string; isValid: boolean; error?: string; fileType?: string }> = [];

  async function selectFiles() {
    try {
      selectedFiles = await fileImporter.selectFiles();
      
      if (selectedFiles.length > 0) {
        await validateSelectedFiles();
      }
    } catch (error) {
      console.error('File selection failed:', error);
      importProgress = `File selection failed: ${error}`;
    }
  }

  async function validateSelectedFiles() {
    validationResults = [];
    importProgress = 'Validating files...';

    for (const filePath of selectedFiles) {
      const validation = await fileImporter.validateFile(filePath);
      validationResults.push({
        path: filePath,
        isValid: validation.isValid,
        error: validation.error,
        fileType: validation.fileType
      });
    }

    importProgress = '';
  }

  async function importFiles() {
    if (selectedFiles.length === 0) return;

    isImporting = true;
    importProgress = 'Importing files...';

    try {
      const result = await fileImporter.importFiles(selectedFiles);
      
      importProgress = `Import completed: ${result.conversations.length} conversations, ${result.messages.length} messages`;
      
      if (result.errors.length > 0) {
        importProgress += ` (${result.errors.length} errors)`;
      }

      dispatch('imported', result);
      
      // Auto-close after successful import
      setTimeout(() => {
        dispatch('close');
      }, 2000);

    } catch (error) {
      importProgress = `Import failed: ${error}`;
    } finally {
      isImporting = false;
    }
  }

  function getFileName(path: string): string {
    return path.split('/').pop() || path;
  }

  function close() {
    dispatch('close');
  }
</script>

<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
  <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
    <!-- Header -->
    <div class="px-6 py-4 border-b border-gray-200">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold text-gray-900">Import Chat Files</h2>
        <button
          on:click={close}
          class="text-gray-400 hover:text-gray-600 transition-colors"
          disabled={isImporting}
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="px-6 py-4 overflow-y-auto max-h-96">
      {#if selectedFiles.length === 0}
        <div class="text-center py-8">
          <div class="mb-4">
            <svg class="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h3 class="text-lg font-medium text-gray-900 mb-2">Select Files to Import</h3>
          <p class="text-gray-500 mb-6">
            Choose ChatGPT conversations.json files or other supported chat exports
          </p>
          <button
            on:click={selectFiles}
            class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            disabled={isImporting}
          >
            Choose Files
          </button>
        </div>
      {:else}
        <div class="space-y-4">
          <h3 class="font-medium text-gray-900">Selected Files ({selectedFiles.length})</h3>
          
          <div class="space-y-2 max-h-48 overflow-y-auto">
            {#each validationResults as result}
              <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 truncate">
                    {getFileName(result.path)}
                  </p>
                  {#if result.isValid}
                    <p class="text-xs text-green-600">
                      ✓ Valid {result.fileType} file
                    </p>
                  {:else}
                    <p class="text-xs text-red-600">
                      ✗ {result.error}
                    </p>
                  {/if}
                </div>
                <div class="ml-4">
                  {#if result.isValid}
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Ready
                    </span>
                  {:else}
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      Error
                    </span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>

          <div class="flex space-x-3">
            <button
              on:click={selectFiles}
              class="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
              disabled={isImporting}
            >
              Choose Different Files
            </button>
            <button
              on:click={importFiles}
              class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={isImporting || validationResults.every(r => !r.isValid)}
            >
              {isImporting ? 'Importing...' : 'Import Files'}
            </button>
          </div>
        </div>
      {/if}

      {#if importProgress}
        <div class="mt-4 p-3 bg-blue-50 rounded-lg">
          <p class="text-sm text-blue-700">{importProgress}</p>
        </div>
      {/if}
    </div>
  </div>
</div>