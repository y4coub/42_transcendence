import { createDiv, createButton, appendChildren } from "../utils/dom";
import { createIcon, icons } from "../utils/icons";
import { appState } from "../utils/state";
import { clearAuth } from "../lib/auth";
import { navigate } from "../lib/router-instance";

interface NavigationItem {
  id: "home" | "game" | "profile" | "chat";
  label: string;
  icon: keyof typeof icons;
}

const NAV_ITEMS: NavigationItem[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "game", label: "Arena", icon: "gamepad" },
  { id: "profile", label: "Profile", icon: "user" },
  { id: "chat", label: "Chat", icon: "messageSquare" },
];

const PATH_MAP: Record<NavigationItem["id"], string> = {
  home: '/',
  game: '/arena',
  profile: '/profile',
  chat: '/chat',
};

export function createNavigation(): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'fixed top-0 left-0 right-0 z-50 border-b border-[#00C8FF]/20 bg-[#050914]/90 backdrop-blur-md';

  const container = createDiv('container mx-auto px-4 sm:px-6');

  const state = appState.getState();
  const signedIn = state.isLoggedIn;

  let closeMobileMenu: (() => void) | null = null;

  const buildNavButton = (item: NavigationItem, variant: 'desktop' | 'mobile'): HTMLButtonElement => {
    const isActive = signedIn ? state.currentPage === item.id : item.id === 'home';
    const baseClassDesktop = isActive
      ? 'inline-flex items-center gap-2 rounded-full border border-[#00C8FF]/20 bg-[#00C8FF]/20 px-4 py-2 text-sm font-medium text-[#00C8FF] shadow-[0_0_12px_rgba(0,200,255,0.18)] transition-colors'
      : 'inline-flex items-center gap-2 rounded-full border border-transparent px-4 py-2 text-sm font-medium text-[#E0E0E0]/80 hover:border-[#00C8FF]/20 hover:text-[#00C8FF] transition-colors';

    const baseClassMobile = isActive
      ? 'flex w-full items-center gap-3 rounded-md border border-[#00C8FF]/30 bg-[#00C8FF]/10 px-4 py-3 text-sm font-medium text-[#00C8FF]'
      : 'flex w-full items-center gap-3 rounded-md border border-transparent px-4 py-3 text-sm font-medium text-[#E0E0E0]/80 hover:border-[#00C8FF]/30 hover:text-[#00C8FF]';

    const disabled = !signedIn && item.id !== 'home';
    const className = variant === 'desktop' ? baseClassDesktop : baseClassMobile;

    const button = createButton(
      '',
      className + (disabled ? ' opacity-50 cursor-not-allowed' : ''),
      () => {
        if (disabled) {
          void navigate('/login');
          return;
        }
        const target = PATH_MAP[item.id];
        void navigate(target);
        if (variant === 'mobile') {
          closeMobileMenu?.();
        }
      },
    );

    button.appendChild(createIcon(item.icon, 'h-4 w-4'));
    const label = document.createElement('span');
    label.textContent = item.label;
    button.appendChild(label);

    return button;
  };

  const header = createDiv('flex h-16 items-center justify-between');

  const logo = createDiv('flex items-center gap-3 cursor-pointer select-none');
  const logoMark = createDiv('h-10 w-10 rounded-full border border-[#00C8FF]/40 bg-gradient-to-br from-[#00C8FF]/30 to-[#FF008C]/30 flex items-center justify-center shadow-[0_0_20px_rgba(0,200,255,0.25)]');
  logoMark.appendChild(createIcon('gamepad', 'h-5 w-5 text-[#00C8FF]'));
  const logoText = document.createElement('span');
  logoText.className = 'text-sm font-semibold uppercase tracking-[0.4em] text-[#E0E0E0]/90';
  logoText.textContent = 'ft_transcendence';
  logo.addEventListener('click', () => {
    void navigate('/');
    closeMobileMenu?.();
  });
  appendChildren(logo, [logoMark, logoText]);

  const desktopNav = createDiv('hidden lg:flex items-center gap-3');
  NAV_ITEMS.forEach((item) => {
    desktopNav.appendChild(buildNavButton(item, 'desktop'));
  });

  const desktopActions = createDiv('hidden lg:flex items-center gap-2');
  if (signedIn) {
    desktopActions.appendChild(
      createButton(
        'Sign Out',
        'inline-flex items-center gap-2 rounded-full border border-[#FF008C]/30 px-4 py-2 text-sm text-[#FF7AC3] hover:bg-[#FF008C]/10 transition-colors',
        () => {
          clearAuth();
          appState.setState({ isLoggedIn: false, currentPage: 'login', userId: undefined });
          void navigate('/login', { replace: true });
        },
      ),
    );
  } else {
    desktopActions.appendChild(
      createButton(
        'Sign In',
        'inline-flex items-center gap-2 rounded-full border border-[#00C8FF]/30 px-4 py-2 text-sm text-[#00C8FF] hover:bg-[#00C8FF]/10 transition-colors',
        () => {
          void navigate('/login');
        },
      ),
    );
  }

  let mobileMenuOpen = false;
  const toggleIcon = createIcon('menu', 'h-5 w-5 text-[#E0E0E0]');
  const closeIcon = createIcon('x', 'h-5 w-5 text-[#E0E0E0]');
  const menuToggle = createButton('', 'inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#00C8FF]/20 text-[#E0E0E0] hover:bg-[#00C8FF]/10 transition-colors lg:hidden', () => {
    mobileMenuOpen = !mobileMenuOpen;
    if (mobileMenuOpen) {
      menuToggle.replaceChildren(closeIcon.cloneNode(true));
      mobileMenu.classList.remove('hidden');
    } else {
      menuToggle.replaceChildren(toggleIcon.cloneNode(true));
      mobileMenu.classList.add('hidden');
    }
  });
  menuToggle.appendChild(toggleIcon.cloneNode(true));

  closeMobileMenu = () => {
    if (!mobileMenuOpen) {
      return;
    }
    mobileMenuOpen = false;
    menuToggle.replaceChildren(toggleIcon.cloneNode(true));
    mobileMenu.classList.add('hidden');
  };

  appendChildren(header, [logo, desktopNav, desktopActions, menuToggle]);

  const mobileMenu = createDiv('lg:hidden hidden border-t border-[#00C8FF]/20 bg-[#050914]/95 px-4 pb-6');
  const mobileList = createDiv('flex flex-col gap-2 pt-4');
  NAV_ITEMS.forEach((item) => {
    mobileList.appendChild(buildNavButton(item, 'mobile'));
  });

  const mobileActions = createDiv('mt-6 flex flex-col gap-2');
  if (signedIn) {
    mobileActions.appendChild(
      createButton(
        'Sign Out',
        'w-full rounded-md border border-[#FF008C]/30 px-4 py-2 text-sm text-[#FF7AC3] hover:bg-[#FF008C]/10 transition-colors',
        () => {
          clearAuth();
          appState.setState({ isLoggedIn: false, currentPage: 'login', userId: undefined });
          closeMobileMenu?.();
          void navigate('/login', { replace: true });
        },
      ),
    );
  } else {
    mobileActions.appendChild(
      createButton(
        'Sign In',
        'w-full rounded-md border border-[#00C8FF]/30 px-4 py-2 text-sm text-[#00C8FF] hover:bg-[#00C8FF]/10 transition-colors',
        () => {
          closeMobileMenu?.();
          void navigate('/login');
        },
      ),
    );
  }

  appendChildren(mobileMenu, [mobileList, mobileActions]);

  container.appendChild(header);
  container.appendChild(mobileMenu);
  nav.appendChild(container);

  return nav;
}
