/**
 * Reusable Modal Component
 * 
 * Provides a clean modal system to replace alert(), confirm(), and prompt()
 */

import { createDiv, createElement, createButton, appendChildren, createInput } from "../utils/dom";
import { createIcon } from "../utils/icons";

export interface ModalOptions {
  title: string;
  message?: string;
  type?: 'info' | 'success' | 'error' | 'warning' | 'confirm' | 'prompt';
  confirmText?: string;
  cancelText?: string;
  onConfirm?: (value?: string) => void;
  onCancel?: () => void;
  inputPlaceholder?: string;
  inputValue?: string;
}

let currentModal: HTMLElement | null = null;

/**
 * Show a modal dialog
 */
export function showModal(options: ModalOptions): void {
  // Close existing modal if any
  closeModal();

  const {
    title,
    message,
    type = 'info',
    confirmText = 'OK',
    cancelText = 'Cancel',
    onConfirm,
    onCancel,
    inputPlaceholder = '',
    inputValue = '',
  } = options;

  // Create overlay
  const overlay = createDiv("fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md px-4");

  // Create modal
  const modal = createDiv("w-full max-w-md rounded-xl border border-[#00C8FF]/40 bg-[#0f111a] shadow-[0_0_30px_rgba(0,200,255,0.25)] overflow-hidden");

  // Modal header
  const header = createDiv("flex items-center justify-between p-4 border-b border-[#00C8FF]/20");
  const headerLeft = createDiv("flex items-center gap-3");
  
  // Icon based on type
  const iconConfig = {
    info: { name: 'circle' as const, color: 'text-[#00C8FF]' },
    success: { name: 'circle' as const, color: 'text-[#10b981]' },
    error: { name: 'circle' as const, color: 'text-[#FF008C]' },
    warning: { name: 'circle' as const, color: 'text-[#f59e0b]' },
    confirm: { name: 'circle' as const, color: 'text-[#00C8FF]' },
    prompt: { name: 'circle' as const, color: 'text-[#00C8FF]' },
  };
  
  const icon = createIcon(iconConfig[type].name, `h-6 w-6 ${iconConfig[type].color}`);
  headerLeft.appendChild(icon);
  
  const titleEl = createElement("h3", "text-[#E0E0E0] font-semibold text-lg");
  titleEl.textContent = title;
  headerLeft.appendChild(titleEl);
  
  const closeBtn = createButton(
    "",
    "text-[#E0E0E0]/60 hover:text-[#E0E0E0] hover:bg-[#00C8FF]/10 w-8 h-8 rounded flex items-center justify-center transition-colors"
  );
  closeBtn.appendChild(createIcon("circle", "h-5 w-5"));
  closeBtn.addEventListener("click", () => {
    closeModal();
    if (onCancel) onCancel();
  });
  
  appendChildren(header, [headerLeft, closeBtn]);

  // Modal body
  const body = createDiv("p-6 space-y-4");
  
  if (message) {
    const messageEl = createElement("p", "text-[#E0E0E0]/80 leading-relaxed");
    messageEl.textContent = message;
    body.appendChild(messageEl);
  }

  // Input field for prompt type
  let inputEl: HTMLInputElement | null = null;
  if (type === 'prompt') {
    inputEl = createInput(
      "text",
      "w-full px-3 py-2 rounded border border-[#00C8FF]/50 bg-[#121217] text-[#E0E0E0] focus:border-[#00C8FF] focus:outline-none",
      inputPlaceholder
    );
    inputEl.value = inputValue;
    body.appendChild(inputEl);
    
    // Focus input after a short delay
    setTimeout(() => inputEl?.focus(), 100);
  }

  // Modal footer
  const footer = createDiv("flex items-center justify-end gap-3 p-4 border-t border-[#00C8FF]/20");
  
  if (type === 'confirm' || type === 'prompt') {
    const cancelBtn = createButton(
      cancelText,
      "border border-[#00C8FF]/50 bg-transparent text-[#E0E0E0] hover:bg-[#00C8FF]/10 hover:border-[#00C8FF] px-4 py-2 rounded transition-colors"
    );
    cancelBtn.addEventListener("click", () => {
      closeModal();
      if (onCancel) onCancel();
    });
    footer.appendChild(cancelBtn);
  }
  
  const confirmBtn = createButton(
    confirmText,
    `min-w-[120px] justify-center bg-[#00C8FF]/90 text-[#0b101e] hover:bg-[#00C8FF] shadow-[0_0_18px_rgba(0,200,255,0.4)] px-4 py-2 rounded transition-all font-semibold tracking-[0.3em] uppercase ${
      type === 'error' ? 'bg-[#FF008C]/80 hover:bg-[#FF008C] shadow-[0_0_18px_rgba(255,0,140,0.35)] text-white' : ''
    }`
  );
  confirmBtn.addEventListener("click", () => {
    if (type === 'prompt' && inputEl) {
      const value = inputEl.value.trim();
      closeModal();
      if (onConfirm) onConfirm(value);
    } else {
      closeModal();
      if (onConfirm) onConfirm();
    }
  });
  footer.appendChild(confirmBtn);

  // Handle Enter key
  if (type === 'prompt' && inputEl) {
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmBtn.click();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeBtn.click();
      }
    });
  }

  // Assemble modal
  appendChildren(modal, [header, body, footer]);
  overlay.appendChild(modal);

  // Click overlay to close (but not the modal itself)
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeModal();
      if (onCancel) onCancel();
    }
  });

  // Escape key to close
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      closeModal();
      if (onCancel) onCancel();
    }
  };
  document.addEventListener("keydown", handleEscape);

  (overlay as any).__cleanup = () => {
    document.removeEventListener("keydown", handleEscape);
  };

  // Add to DOM
  document.body.appendChild(overlay);
  currentModal = overlay;
}

/**
 * Close the current modal
 */
export function closeModal(): void {
  if (!currentModal) {
    return;
  }

  const modalToClose = currentModal;

  if ((modalToClose as any).__cleanup) {
    (modalToClose as any).__cleanup();
  }

  modalToClose.style.animation = "fadeOut 0.2s ease-out";
  currentModal = null;

  setTimeout(() => {
    if (modalToClose.parentElement) {
      modalToClose.parentElement.removeChild(modalToClose);
    }
  }, 200);
}

/**
 * Show an info modal
 */
export function showInfo(title: string, message: string): void {
  showModal({ title, message, type: 'info' });
}

/**
 * Show a success modal
 */
export function showSuccess(title: string, message: string): void {
  showModal({ title, message, type: 'success' });
}

/**
 * Show an error modal
 */
export function showError(title: string, message: string): void {
  showModal({ title, message, type: 'error' });
}

/**
 * Show a warning modal
 */
export function showWarning(title: string, message: string): void {
  showModal({ title, message, type: 'warning' });
}

/**
 * Show a confirmation dialog
 */
export function showConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void
): void {
  showModal({
    title,
    message,
    type: 'confirm',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm,
    onCancel,
  });
}

/**
 * Show a prompt dialog
 */
export function showPrompt(
  title: string,
  message: string,
  onConfirm: (value: string) => void,
  onCancel?: () => void,
  placeholder?: string,
  defaultValue?: string
): void {
  showModal({
    title,
    message,
    type: 'prompt',
    confirmText: 'OK',
    cancelText: 'Cancel',
    onConfirm: (value?: string) => {
      if (value !== undefined) {
        onConfirm(value);
      }
    },
    onCancel,
    inputPlaceholder: placeholder,
    inputValue: defaultValue,
  });
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  
  @keyframes scaleIn {
    from { 
      opacity: 0;
      transform: scale(0.9);
    }
    to { 
      opacity: 1;
      transform: scale(1);
    }
  }
`;
document.head.appendChild(style);
