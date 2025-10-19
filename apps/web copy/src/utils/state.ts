/**
 * Simple state management
 */

type Listener = () => void; 

export class AppState
{
  private state:
  {
    isLoggedIn: boolean;
    currentPage: string;
    username: string;
    userId?: string; // User ID from JWT token
  };
  private listeners: Listener[] = [];

  constructor() {
    this.state = {
      isLoggedIn: false,
      currentPage: "home",
      username: "testuser",
      userId: undefined,
    };
  }

  getState() {
    return { ...this.state };
  }

  setState(updates: Partial<typeof this.state>)
  {
    this.state = {...this.state, ...updates };
    this.notifyListeners();
  }

  subscribe(listener: Listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener());
  }
}

export const appState = new AppState();
