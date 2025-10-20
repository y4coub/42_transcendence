export type Message = { user: string; message: string; time: string };

type Listener = () => void;

class ChatService {
  private state: {
    activeChannel: string;
    messages: Record<string, Message[]>;
  };
  private listeners: Listener[] = [];

  constructor() {
    this.state = {
      activeChannel: "general",
      messages: {
        general: [
          {
            user: "Player_42",
            message: "Anyone up for a ranked match?",
            time: "14:30",
          },
          {
            user: "CyberPong",
            message: "I'm in! Let's do this",
            time: "14:31",
          },
        ],
        ranked: [
          { user: "NeonAce", message: "Ranked match in 5", time: "13:00" },
        ],
        help: [
          {
            user: "ByteMaster",
            message: "How do I change my avatar?",
            time: "12:15",
          },
        ],
      },
    };
  }

  getState() {
    return { ...this.state, messages: { ...this.state.messages } };
  }

  subscribe(fn: Listener) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  setActiveChannel(id: string) {
    if (!this.state.messages[id]) this.state.messages[id] = [];
    this.state.activeChannel = id;
    this.notify();
  }

  sendMessage(text: string, user = "You") {
    const now = new Date();
    const time = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const msg: Message = { user, message: text, time };
    const ch = this.state.activeChannel;
    if (!this.state.messages[ch]) this.state.messages[ch] = [];
    this.state.messages[ch].push(msg);
    this.notify();
    // placeholder: emit to server here in future
  }

  addMessageTo(channel: string, msg: Message) {
    if (!this.state.messages[channel]) this.state.messages[channel] = [];
    this.state.messages[channel].push(msg);
    this.notify();
  }
}

export const chatService = new ChatService();
