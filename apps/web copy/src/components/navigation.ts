import { createDiv, createButton, appendChildren } from "../utils/dom";
import { createIcon } from "../utils/icons";
import { appState } from "../utils/state";
import { clearAuth } from "../lib/auth";

export function createNavigation(): HTMLElement {
  const nav = document.createElement("nav");
  nav.className =
    "fixed top-0 left-0 right-0 z-50 border-b border-[#00C8FF]/30 bg-[#000000] backdrop-blur-sm";

  const container = createDiv("container mx-auto px-4");
  const flexContainer = createDiv(
    "flex h-16 items-center justify-between relative"
  );

  // Logo section
  const logoSection = createDiv("flex items-center gap-2");
  const logoBox = createDiv(
    "h-10 w-10 rounded border border-[#00C8FF] bg-[#00C8FF]/10 flex items-center justify-center"
  );
  logoBox.appendChild(createIcon("gamepad", "h-6 w-6 text-[#00C8FF]"));

  const logoText = document.createElement("span");
  logoText.className = "text-[#000000] tracking-wider";
  logoText.textContent = "DEN-DEN";

  appendChildren(logoSection, [logoBox, logoText]);

  // Navigation items (centered)
  const navCenter = createDiv("absolute left-1/2 -translate-x-1/2");
  const navItems = createDiv("flex items-center gap-2");

  const items = [
    { id: "home", label: "Home", icon: "home" as const },
    { id: "game", label: "Arena", icon: "gamepad" as const },
    { id: "profile", label: "Profile", icon: "user" as const },
    { id: "chat", label: "Chat", icon: "messageSquare" as const },
  ];

  const state = appState.getState();
  const signedIn = state.isLoggedIn;

  items.forEach((item) => {
    // Only reflect active/current page when signed in. When signed out, only Home is shown as active.
    const isActive = signedIn
      ? state.currentPage === item.id
      : item.id === "home";

    const baseClass = isActive
      ? "bg-[#00C8FF] text-[#121217] hover:bg-[#00C8FF]/90 px-4 py-2 rounded inline-flex items-center gap-2 transition-colors"
      : "text-[#E0E0E0] hover:bg-[#00C8FF]/10 hover:text-[#00C8FF] px-4 py-2 rounded inline-flex items-center gap-2 transition-colors";

    // If signed out and not the home button, make it look disabled and prevent navigation.
    const disabledClass =
      !signedIn && item.id !== "home" ? " opacity-50 cursor-not-allowed" : "";

    const button = createButton(
      "",
      baseClass + disabledClass,
      // When signed in, nav works normally. When signed out, only Home is clickable.
      signedIn
        ? () => appState.setState({ currentPage: item.id })
        : () => {
            if (item.id === "home") appState.setState({ currentPage: "home" });
          }
    );

    button.appendChild(createIcon(item.icon, "h-4 w-4"));
    const span = document.createElement("span");
    span.textContent = item.label;
    button.appendChild(span);

    navItems.appendChild(button);
  });

  // Right-side actions (sign out)
  const actions = createDiv("flex items-center gap-2");
  const signOutBtn = createButton(
    "Sign Out",
    "text-[#E0E0E0] hover:bg-[#FF008C]/10 px-3 py-2 rounded transition-colors",
    () => {
      // Clear JWT tokens from localStorage
      clearAuth();
      // Reset app state
      appState.setState({ 
        isLoggedIn: false, 
        currentPage: "home",
        userId: undefined
      });
    }
  );
  actions.appendChild(signOutBtn);

  appendChildren(navCenter, [navItems]);
  appendChildren(flexContainer, [logoSection, navCenter, actions]);
  container.appendChild(flexContainer);
  nav.appendChild(container);

  return nav;
}
