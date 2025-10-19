import "./styles/globals.css";
import { createNavigation } from "./components/navigation"; 
import { createHomePage } from "./pages/home";
import { createGamePage } from "./pages/game";
import { playPage } from "./pages/play";
import { createProfilePage } from "./pages/profile";
import { createChatPage } from "./pages/chat";
import { createLoginPage } from "./pages/login";
import { appState } from "./utils/state";
import { invitationManager } from "./features/invitations/InvitationManager";
import { isAuthenticated, getUserId } from "./lib/auth";

const app = document.getElementById("app") as HTMLDivElement;

// Map routes to page names
const routes: Record<string, string> = {
  '/': 'home',
  '/home': 'home',
  '/arena': 'game',
  '/profile': 'profile',
  '/chat': 'chat',
  '/login': 'login',
};

// Get page name from URL path
function getPageFromUrl(): string {
  const path = window.location.pathname;
  return routes[path] || 'home';
}

// Update URL without page reload
function updateUrl(page: string): void {
  const pathMap: Record<string, string> = {
    'home': '/',
    'game': '/arena',
    'profile': '/profile',
    'chat': '/chat',
    'login': '/login',
  };
  
  const path = pathMap[page] || '/';
  if (window.location.pathname !== path) {
    window.history.pushState({ page }, '', path);
  }
}

// Initialize auth state on app load (restore session from localStorage)
async function initializeAuth(): Promise<void> {
  // Check if this is an OAuth callback
  const urlParams = new URLSearchParams(window.location.search);
  const isOAuthCallback = urlParams.has('code') && urlParams.has('state');
  
  if (isOAuthCallback) {
    // Handle OAuth callback - forward to backend
    try {
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      
      const API_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:3000' 
        : `https://${window.location.hostname}`;
      
      const response = await fetch(`${API_URL}/auth/42/callback?code=${code}&state=${state}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error('OAuth authentication failed');
      }
      
      const data = await response.json();
      
      if (data.type === 'challenge' && data.challengeId) {
        // 2FA required - store challenge info and redirect to login page
        sessionStorage.setItem('oauth42Challenge', JSON.stringify({
          challengeId: data.challengeId,
          challengeToken: data.challengeToken,
        }));
        // Clean URL and redirect to login to show 2FA form
        window.history.replaceState({}, '', '/login');
        appState.setState({ 
          isLoggedIn: false,
          currentPage: 'login' 
        });
      } else if (data.accessToken) {
        // Direct login success - import and use setAuthTokens
        const { setAuthTokens, getUserId } = await import('./lib/auth');
        setAuthTokens(data.accessToken, data.refreshToken);
        const userId = getUserId();
        
        // Clean URL and redirect to home
        window.history.replaceState({}, '', '/');
        appState.setState({ 
          isLoggedIn: true,
          currentPage: 'home',
          userId: userId || undefined
        });
        void invitationManager.init();
      }
      return;
    } catch (error) {
      console.error('OAuth callback error:', error);
      // Clean URL and show error on login page
      window.history.replaceState({}, '', '/login');
      appState.setState({ 
        isLoggedIn: false,
        currentPage: 'login' 
      });
      return;
    }
  }
  
  const hasValidToken = isAuthenticated();
  const userId = getUserId();
  
  if (hasValidToken && userId) {
    // Restore logged-in state
    appState.setState({ 
      isLoggedIn: true,
      userId: userId 
    });
    void invitationManager.init();
  } else {
    // Ensure clean state
    appState.setState({ 
      isLoggedIn: false,
      currentPage: "home" 
    });
  }
  
  // Sync initial page with URL
  const pageFromUrl = getPageFromUrl();
  if (pageFromUrl !== 'login') {
    appState.setState({ currentPage: pageFromUrl });
  }
}

function render() 
{
  if (!app) return;
  
  const state = appState.getState();
  const previousPage = app.dataset.currentPage;
  
  // Cleanup previous page if switching away from game
  if (previousPage === 'game' && state.currentPage !== 'game') {
    playPage.destroy();
  }
  
  app.innerHTML = "";
  app.dataset.currentPage = state.currentPage;

  // Check JWT authentication (Phase 5: T031)
  const hasValidToken = isAuthenticated();
  
  // Update state if token status doesn't match
  if (hasValidToken !== state.isLoggedIn) {
    appState.setState({ isLoggedIn: hasValidToken });
    return; // Re-render will be triggered by setState
  }

  if (state.isLoggedIn) {
    const nav = createNavigation();
    app.appendChild(nav);
  }

  if (!state.isLoggedIn) {
    // Always show login page when not authenticated
    const backdrop = document.createElement("div");
    app.appendChild(backdrop);
    const loginBox = createLoginPage();
    const overlay = document.createElement("div");
  
    overlay.appendChild(loginBox);
    app.appendChild(overlay);
    return;
  }

  // When logged in, render the selected page (all protected now)
  switch (state.currentPage) {
    case "home":
      app.appendChild(createHomePage());
      break;
    case "game":
      app.appendChild(createGamePage());
      // Initialize the PlayPage controller
      // PlayPage will check sessionStorage and URL params internally
      playPage.init().catch(err => {
        console.error('[Main] Failed to initialize game:', err);
      });
      break;
    case "profile":
      app.appendChild(createProfilePage());
      break;
    case "chat":
      app.appendChild(createChatPage());
      break;
    default:
      app.appendChild(createHomePage());
      break;
  }
}

// re-render when state changes
appState.subscribe(() => {
  render();
});

// Handle browser back/forward buttons
window.addEventListener('popstate', (event) => {
  const page = event.state?.page || getPageFromUrl();
  // Update state without triggering URL change (already changed by browser)
  appState.setState({ currentPage: page });
});

// Subscribe to state changes to update URL
appState.subscribe(() => {
  const state = appState.getState();
  updateUrl(state.currentPage);
});

// Initialize authentication and render
initializeAuth();
render();
