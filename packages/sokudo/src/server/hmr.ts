// ============================================================================
// FILE: src/server/hmr.ts - ENHANCED VERSION
// Smart HMR with module boundary detection
// ============================================================================

import type { ServerWebSocket } from 'bun';

export interface HMRUpdate {
  type: 'full-reload' | 'css-update' | 'js-update';
  path?: string;
  timestamp: number;
  hash?: string;
}

export class HMRManager {
  private clients = new Set<ServerWebSocket<any>>();
  private updateQueue: HMRUpdate[] = [];
  private isProcessing = false;

  addClient(ws: ServerWebSocket<any>) {
    this.clients.add(ws);
    console.log(`🔌 HMR client connected (${this.clients.size} total)`);

    // Send connection success message
    this.sendToClient(ws, {
      type: 'connected',
      timestamp: Date.now(),
    });
  }

  removeClient(ws: ServerWebSocket<any>) {
    this.clients.delete(ws);
    console.log(`🔌 HMR client disconnected (${this.clients.size} remaining)`);
  }

  broadcast(message: any) {
    const deadClients: ServerWebSocket<any>[] = [];

    this.clients.forEach((client) => {
      try {
        client.send(JSON.stringify(message));
      } catch (error) {
        deadClients.push(client);
      }
    });

    // Clean up dead clients
    deadClients.forEach((client) => this.clients.delete(client));
  }

  private sendToClient(client: ServerWebSocket<any>, message: any) {
    try {
      client.send(JSON.stringify(message));
    } catch (error) {
      this.clients.delete(client);
    }
  }

  fullReload() {
    console.log('🔄 Full page reload triggered');
    this.broadcast({
      type: 'full-reload',
      timestamp: Date.now(),
    });
  }

  cssUpdate(path: string) {
    console.log(`🎨 CSS update: ${path}`);
    this.broadcast({
      type: 'css-update',
      path,
      timestamp: Date.now(),
    });
  }

  jsUpdate(path: string, hash: string) {
    console.log(`⚡ JS update: ${path}`);
    this.broadcast({
      type: 'js-update',
      path,
      hash,
      timestamp: Date.now(),
    });
  }

  error(error: any) {
    console.log('❌ Error broadcast to clients');
    this.broadcast({
      type: 'error',
      error: {
        message: error.message,
        stack: error.stack,
        file: error.file,
        line: error.line,
        column: error.column,
      },
      timestamp: Date.now(),
    });
  }

  clearError() {
    this.broadcast({
      type: 'clear-error',
      timestamp: Date.now(),
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }
}
