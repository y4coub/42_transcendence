/**
 * Base WebSocket Client Utility
 * 
 * Features:
 * - Connection management with JWT token attachment
 * - Auto-reconnect with exponential backoff
 * - Heartbeat (ping/pong) to keep connection alive
 * - Event subscription system
 * - Request state support for reconnection
 * 
 * Feature: 002-pong-game-integration
 */

import type { ServerMessage, ClientMessage } from '../types/ws-messages';

interface WSClientOptions {
  url: string;
  token: string;
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (error: Event) => void;
  onMessage?: (message: ServerMessage) => void;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

interface Subscription {
  id: string;
  callback: (message: ServerMessage) => void;
}

export class WSClient {
  private ws: WebSocket | null = null;
  private options: WSClientOptions;
  private subscriptions: Map<string, Subscription> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isManualClose = false;
  private lastPingTime = 0;

  constructor(options: WSClientOptions) {
    this.options = options;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
    this.heartbeatInterval = options.heartbeatInterval ?? 30000; // 30 seconds
  }

  /**
   * Connect to WebSocket server with JWT token in query parameter
   */
  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.warn('[WSClient] Already connected');
      return;
    }

    const urlWithToken = this.appendToken(this.options.url, this.options.token);
    
    try {
      this.ws = new WebSocket(urlWithToken);
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
    } catch (error) {
      console.error('[WSClient] Connection error:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Append JWT token to WebSocket URL as query parameter
   */
  private appendToken(url: string, token: string): string {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}token=${encodeURIComponent(token)}`;
  }

  /**
   * Send a message to the server
   */
  send(message: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[WSClient] Cannot send message: not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('[WSClient] Failed to send message:', error);
    }
  }

  /**
   * Subscribe to messages with a callback
   * Returns an unsubscribe function
   */
  subscribe(callback: (message: ServerMessage) => void): () => void {
    const id = Math.random().toString(36).substring(7);
    this.subscriptions.set(id, { id, callback });
    
    return () => {
      this.subscriptions.delete(id);
    };
  }

  /**
   * Request current state (used after reconnection)
   */
  requestState(matchId: string): void {
    this.send({
      type: 'request_state',
      matchId,
    });
  }

  /**
   * Close the connection
   */
  close(): void {
    this.isManualClose = true;
    this.stopHeartbeat();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close(1000, 'Client closed connection');
      this.ws = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection state
   */
  getReadyState(): number | null {
    return this.ws ? this.ws.readyState : null;
  }

  // --- Private Methods ---

  private handleOpen(): void {
    console.log('[WSClient] Connected');
    this.reconnectAttempts = 0;
    this.isManualClose = false;
    this.startHeartbeat();
    
    if (this.options.onOpen) {
      this.options.onOpen();
    }
  }

  private handleClose(event: CloseEvent): void {
    console.log('[WSClient] Disconnected:', event.code, event.reason);
    this.stopHeartbeat();
    
    // Handle authentication failure (Phase 5: T033)
    if (event.code === 4401) {
      console.warn('[WSClient] Authentication failed - clearing session');
      
      // Import clearAuth dynamically to avoid circular dependency
      import('./auth').then(({ clearAuth }) => {
        clearAuth();
        
        // Show notification if possible
        const message = event.reason || 'Session expired';
        console.error(`[WSClient] ${message}`);
        
        // Redirect to login after short delay
        setTimeout(() => {
          window.location.href = '/login';
        }, 1000);
      }).catch(error => {
        console.error('[WSClient] Failed to clear auth:', error);
      });
    }
    
    if (this.options.onClose) {
      this.options.onClose(event.code, event.reason);
    }

    // Auto-reconnect unless manually closed or auth failure
    if (!this.isManualClose && event.code !== 4401 && this.options.reconnect !== false) {
      this.scheduleReconnect();
    }
  }

  private handleError(error: Event): void {
    console.error('[WSClient] Error:', error);
    
    if (this.options.onError) {
      this.options.onError(error);
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data) as ServerMessage;
      
      // Handle pong response
      if (message.type === 'pong') {
        const latency = Date.now() - this.lastPingTime;
        console.debug('[WSClient] Pong received, latency:', latency, 'ms');
      }
      
      // Notify global handler
      if (this.options.onMessage) {
        this.options.onMessage(message);
      }
      
      // Notify subscribers
      this.subscriptions.forEach((sub) => {
        try {
          sub.callback(message);
        } catch (error) {
          console.error('[WSClient] Subscription callback error:', error);
        }
      });
    } catch (error) {
      console.error('[WSClient] Failed to parse message:', error);
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WSClient] Max reconnection attempts reached');
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    console.log(`[WSClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      console.log('[WSClient] Attempting reconnection...');
      this.connect();
    }, delay);
  }

  /**
   * Start heartbeat ping/pong
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.lastPingTime = Date.now();
        this.send({ type: 'ping' });
      }
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

/**
 * Create a WebSocket client instance
 */
export function createWSClient(options: WSClientOptions): WSClient {
  return new WSClient(options);
}
