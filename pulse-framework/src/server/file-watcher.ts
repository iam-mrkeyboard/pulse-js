// ============================================================================
// FILE: src/server/file-watcher.ts - NEW FILE
// Intelligent file watching with debouncing
// ============================================================================

import fs from 'node:fs'; // Bun uses node:fs for file watching
import path from 'node:path';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  file: string;
  timestamp: number;
}

export class FileWatcher {
  private watchers: fs.FSWatcher[] = [];
  private debounceTimers = new Map<string, Timer>();
  private debounceMs = 100;

  watch(
    dir: string,
    options: {
      extensions?: string[];
      ignored?: string[];
      recursive?: boolean;
    },
    callback: (event: FileChangeEvent) => void,
  ): void {
    try {
      const watcher = fs.watch(
        dir,
        { recursive: options.recursive ?? true },
        (eventType, filename) => {
          if (!filename) return;

          const fullPath = path.join(dir, filename);

          // Check if file should be ignored (Manual path segment check)
          if (options.ignored && options.ignored.length > 0) {
            const parts = fullPath.split(path.sep);
            const shouldIgnore = options.ignored.some(pattern => {
              // Handle basic globs like **/node_modules/** by checking path usage
              const cleanPattern = pattern.replaceAll('*', '').replaceAll('/', '');
              return parts.includes(cleanPattern);
            });
            if (shouldIgnore) return;
          }

          // Check extension
          if (options.extensions?.length) {
            const ext = path.extname(fullPath);
            if (!options.extensions.includes(ext)) {
              return;
            }
          }

          // Debounce multiple events for the same file
          this.debounce(fullPath, () => {
            const event: FileChangeEvent = {
              type: eventType === 'rename' ? 'add' : 'change',
              file: fullPath,
              timestamp: Date.now(),
            };

            callback(event);
          });
        },
      );

      this.watchers.push(watcher);
      console.log(`👀 Watching: ${dir}`);
    } catch (error: any) {
      console.warn(`⚠️  Could not watch ${dir}:`, error.message);
    }
  }

  private debounce(key: string, callback: () => void): void {
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      callback();
    }, this.debounceMs);

    this.debounceTimers.set(key, timer);
  }

  close(): void {
    this.watchers.forEach((watcher) => watcher.close());
    this.watchers = [];
    this.debounceTimers.forEach((timer) => clearTimeout(timer));
    this.debounceTimers.clear();
  }
}
