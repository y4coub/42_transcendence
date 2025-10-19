import { API_URL } from './api-client';

/**
 * Chat WebSocket Client
 *
 * Handles real-time chat communication via WebSocket connection to /ws/chat.
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Ping/pong heartbeat every 30s
 * - Message type routing (channel, dm, presence, joined, error, etc.)
 * - Subscribe pattern for message handlers
 */

export type ChatMessageType =
  | 'channel'
  | 'dm'
  | 'presence'
  | 'joined'
  | 'welcome'
  | 'blocked'
  | 'unblocked'
  | 'match_chat'
  | 'match_invite'
  | 'match_invite_sent'
  | 'match_invite_accepted'
  | 'match_invite_confirmed'
  | 'match_invite_declined'
  | 'match_invite_cancelled'
  | 'match_invite_expired'
  | 'match_invite_error'
  | 'error'
  | 'pong';

export interface ChatMessage {
  type: ChatMessageType;
  room?: string;
  from?: string;
  body?: string;
  content?: string;
  userId?: string;
  displayName?: string;
  to?: string;
  timestamp?: string;
  error?: string;
  matchId?: string;
  ts?: number | string;
  online?: boolean;
  inviteId?: string;
  opponentId?: string;
  expiresAt?: string | number;
  reason?: string;
  seconds?: number;
}

export type ChatMessageHandler = (message: ChatMessage) => void;

type OutgoingMessage =
  | { type: 'join'; room: string }
  | { type: 'channel'; room: string; body: string }
  | { type: 'dm'; to: string; body: string }
  | { type: 'match'; matchId: string; body: string }
  | { type: 'match_invite'; to: string }
  | { type: 'match_invite_response'; inviteId: string; accepted: boolean }
  | { type: 'block'; userId: string; reason?: string }
  | { type: 'unblock'; userId: string }
  | { type: 'ping' };

export class ChatWebSocketClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 30000; // 30 seconds
  private readonly waitCheckInterval = 120;
  private pingInterval: number | null = null;
  private reconnectTimeout: number | null = null;
  private handlers: Set<ChatMessageHandler> = new Set();
  private inviteHandlers: Set<ChatMessageHandler> = new Set();
  private isConnecting = false;
  private shouldReconnect = true;
  private openHandlers: Set<() => void> = new Set();
  private closeHandlers: Set<() => void> = new Set();
  private pendingJoins: Set<string> = new Set();
  private joinedRooms: Set<string> = new Set();

  /**
   * Connect to the chat WebSocket server.
   * @param token - JWT authentication token
   */
  connect(token: string): void {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connecting or connected');
      return;
    }

    this.token = token;
    this.isConnecting = true;
    this.shouldReconnect = true;

    try {
      const apiBase = new URL(API_URL);
      const protocol = apiBase.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${apiBase.host}/ws/chat?token=${encodeURIComponent(token)}`;

      console.log('Connecting to chat WebSocket:', wsUrl.replace(token, '[TOKEN]'));
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('Chat WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.flushPendingJoins();
        this.openHandlers.forEach((handler) => handler());
      };

      this.ws.onmessage = (event) => {
        try {
          const message: ChatMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('Chat WebSocket error:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = (event) => {
        console.log('Chat WebSocket closed:', event.code, event.reason);
        this.isConnecting = false;
        this.stopHeartbeat();
        this.closeHandlers.forEach((handler) => handler());

        if (this.shouldReconnect) {
          this.joinedRooms.forEach((room) => this.pendingJoins.add(room));
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.isConnecting = false;
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Disconnect from the WebSocket server.
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.pendingJoins.clear();
    this.joinedRooms.clear();
  }

  /**
   * Send a message through the WebSocket.
   * @param message - Message object to send
   */
  send(message: OutgoingMessage): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
        return false;
      }
    }

    console.warn('WebSocket not connected, cannot send message');
    return false;
  }

  /**
   * Wait until the socket is open (or timeout).
   * Attempts to connect if not already connecting.
   */
  async waitForOpen(timeoutMs: number = 5000): Promise<boolean> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return true;
    }

    if (!this.ws && this.token && !this.isConnecting) {
      this.connect(this.token);
    }

    const start = performance.now();

    return new Promise((resolve) => {
      const check = () => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          resolve(true);
          return;
        }

        if (performance.now() - start >= timeoutMs) {
          resolve(false);
          return;
        }

        window.setTimeout(check, this.waitCheckInterval);
      };

      check();
    });
  }

  /**
   * Join a channel room via WebSocket, rejoining automatically on reconnect.
   */
  joinRoom(room: string): void {
    if (!room) {
      return;
    }

    this.pendingJoins.add(room);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.flushPendingJoins();
    } else if (!this.ws && this.token && !this.isConnecting) {
      this.connect(this.token);
    }
  }

  /**
   * Send a channel message payload over WebSocket.
   */
  sendChannelMessage(room: string, body: string): boolean {
    if (!room || !body) {
      return false;
    }

    return this.send({ type: 'channel', room, body });
  }

  /**
   * Send a direct message payload over WebSocket.
   */
  sendDirectMessage(userId: string, body: string): boolean {
    if (!userId || !body) {
      return false;
    }

    return this.send({ type: 'dm', to: userId, body });
  }

  sendMatchInvite(userId: string): boolean {
    if (!userId) {
      return false;
    }

    return this.send({ type: 'match_invite', to: userId });
  }

  respondToMatchInvite(inviteId: string, accepted: boolean): boolean {
    if (!inviteId) {
      return false;
    }

    return this.send({ type: 'match_invite_response', inviteId, accepted });
  }

  /**
   * Subscribe to chat messages.
   * @param handler - Function to call when messages are received
   * @returns Unsubscribe function
   */
  subscribe(handler: ChatMessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  onInvite(handler: ChatMessageHandler): () => void {
    this.inviteHandlers.add(handler);
    return () => {
      this.inviteHandlers.delete(handler);
    };
  }

  /**
   * Execute handler when socket opens.
   */
  onOpen(handler: () => void): () => void {
    this.openHandlers.add(handler);
    return () => {
      this.openHandlers.delete(handler);
    };
  }

  /**
   * Execute handler when socket closes.
   */
  onClose(handler: () => void): () => void {
    this.closeHandlers.add(handler);
    return () => {
      this.closeHandlers.delete(handler);
    };
  }

  /**
   * Check if socket is currently open.
   */
  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current connection state.
   */
  getState(): 'connecting' | 'open' | 'closing' | 'closed' {
    if (!this.ws) return 'closed';

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'open';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
        return 'closed';
      default:
        return 'closed';
    }
  }

  /**
   * Handle incoming WebSocket messages.
   */
  private handleMessage(message: ChatMessage): void {
    if (message.type !== 'pong') {
      console.log('Chat message received:', message.type, message);
    }

    if (message.type === 'joined' && message.room) {
      this.joinedRooms.add(message.room);
    }

    if (
      message.type === 'match_invite' ||
      message.type === 'match_invite_sent' ||
      message.type === 'match_invite_accepted' ||
      message.type === 'match_invite_confirmed' ||
      message.type === 'match_invite_declined' ||
      message.type === 'match_invite_cancelled' ||
      message.type === 'match_invite_expired' ||
      message.type === 'match_invite_error'
    ) {
      this.inviteHandlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          console.error('Error in invite handler:', error);
        }
      });
    }

    this.handlers.forEach((handler) => {
      try {
        handler(message);
      } catch (error) {
        console.error('Error in message handler:', error);
      }
    });
  }

  /**
   * Start heartbeat ping/pong.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.pingInterval = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 30000);
  }

  /**
   * Stop heartbeat.
   */
  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Flush pending join requests to the server.
   */
  private flushPendingJoins(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.pendingJoins.size === 0) {
      return;
    }

    for (const room of this.pendingJoins) {
      try {
        this.ws.send(JSON.stringify({ type: 'join', room }));
      } catch (error) {
        console.error('Failed to send join message for room', room, error);
      }
    }

    this.pendingJoins.clear();
  }

  /**
   * Schedule reconnection with exponential backoff.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectAttempts++;
      if (this.token) {
        this.connect(this.token);
      }
    }, delay);
  }
}

// Singleton instance
export const chatWS = new ChatWebSocketClient();
