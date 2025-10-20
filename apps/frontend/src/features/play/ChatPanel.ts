/**
 * ChatPanel Component (Phase 6: T037)
 * In-game chat panel for Pong matches
 */

import { createDiv, createElement, createButton, createInput } from "../../utils/dom";

export interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  senderName?: string;
}

export interface ChatPanelCallbacks {
  onSendMessage: (content: string) => void;
}

export class ChatPanel {
  private container: HTMLElement;
  private messageList: HTMLElement;
  private inputField: HTMLInputElement;
  private sendButton: HTMLButtonElement;
  private messages: ChatMessage[] = [];
  private callbacks: ChatPanelCallbacks;
  private currentUserId: string;

  constructor(currentUserId: string, callbacks: ChatPanelCallbacks) {
    this.currentUserId = currentUserId;
    this.callbacks = callbacks;
    
    // Main container
    this.container = createDiv(
      "flex flex-col h-full bg-[#1a1a24] border border-[#00C8FF]/30 rounded"
    );

    // Header
    const header = createDiv(
      "px-4 py-2 border-b border-[#00C8FF]/30 bg-[#121217]"
    );
    const title = createElement("h3", "text-[#00C8FF] font-bold");
    title.textContent = "Match Chat";
    header.appendChild(title);

    // Message list container (scrollable)
    const messageContainer = createDiv("flex-1 overflow-y-auto p-4 space-y-2");
    this.messageList = messageContainer;

    // Input container
    const inputContainer = createDiv(
      "p-3 border-t border-[#00C8FF]/30 bg-[#121217] flex gap-2"
    );

    this.inputField = createInput(
      "text",
      "flex-1 px-3 py-2 rounded border border-[#00C8FF]/50 bg-[#0a0a0f] text-[#E0E0E0] focus:border-[#00C8FF] focus:outline-none focus:ring-1 focus:ring-[#00C8FF]/50",
      "Type a message..."
    );
    this.inputField.maxLength = 500;

    this.sendButton = createButton(
      "Send",
      "px-4 py-2 rounded bg-[#00C8FF] text-[#121217] hover:bg-[#00C8FF]/90 transition-colors font-medium",
      () => this.handleSend()
    );

    // Handle Enter key
    this.inputField.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    inputContainer.appendChild(this.inputField);
    inputContainer.appendChild(this.sendButton);

    // Assemble panel
    this.container.appendChild(header);
    this.container.appendChild(messageContainer);
    this.container.appendChild(inputContainer);
  }

  private handleSend(): void {
    const content = this.inputField.value.trim();
    if (!content) return;

    this.callbacks.onSendMessage(content);
    this.inputField.value = "";
    this.inputField.focus();
  }

  /**
   * Add a single message to the chat
   */
  public addMessage(message: ChatMessage): void {
    this.messages.push(message);
    this.renderMessage(message);
    this.scrollToBottom();
  }

  /**
   * Load initial message history
   */
  public loadHistory(messages: ChatMessage[]): void {
    this.messages = [...messages].reverse(); // Reverse to show oldest first
    this.messageList.innerHTML = "";
    
    this.messages.forEach(msg => this.renderMessage(msg));
    this.scrollToBottom();
  }

  private renderMessage(message: ChatMessage): void {
    const isOwnMessage = message.senderId === this.currentUserId;
    
    const messageEl = createDiv(
      `flex ${isOwnMessage ? "justify-end" : "justify-start"}`
    );

    const bubble = createDiv(
      `max-w-[70%] px-3 py-2 rounded ${
        isOwnMessage
          ? "bg-[#00C8FF] text-[#121217]"
          : "bg-[#2a2a34] text-[#E0E0E0]"
      }`
    );

    // Sender name (if not own message)
    if (!isOwnMessage && message.senderName) {
      const senderEl = createElement("div", "text-xs font-semibold mb-1 opacity-80");
      senderEl.textContent = message.senderName;
      bubble.appendChild(senderEl);
    }

    // Message content
    const contentEl = createElement("div", "text-sm break-words");
    contentEl.textContent = message.content;
    bubble.appendChild(contentEl);

    // Timestamp
    const timeEl = createElement("div", "text-xs opacity-60 mt-1");
    timeEl.textContent = this.formatTime(message.createdAt);
    bubble.appendChild(timeEl);

    messageEl.appendChild(bubble);
    this.messageList.appendChild(messageEl);
  }

  private formatTime(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.messageList.scrollTop = this.messageList.scrollHeight;
    });
  }

  /**
   * Get the DOM element
   */
  public getElement(): HTMLElement {
    return this.container;
  }

  /**
   * Focus the input field
   */
  public focus(): void {
    this.inputField.focus();
  }

  /**
   * Clear all messages
   */
  public clear(): void {
    this.messages = [];
    this.messageList.innerHTML = "";
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    this.container.remove();
  }
}
