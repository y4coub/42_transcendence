import { createButton, createDiv, createElement, appendChildren } from "../utils/dom";

interface IncomingInviteOptions {
  inviteId: string;
  fromName: string;
  expiresAt: number;
  onAccept: () => void;
  onDecline: () => void;
}

let activeModal: HTMLElement | null = null;
let activeCountdown: number | null = null;

export function showIncomingInviteModal(options: IncomingInviteOptions): void {
  closeIncomingInviteModal();

  const overlay = createDiv("fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md px-4");
  overlay.setAttribute("data-match-invite", options.inviteId);

  const card = createDiv("w-full p-4 max-w-md rounded-xl border border-[#00C8FF]/30 bg-[#0f111a]/95 shadow-[0_0_40px_rgba(0,200,255,0.18)]");

  const header = createDiv("p-6 border-b border-[#00C8FF]/20");
  const title = createElement("h2", "text-xl font-semibold text-[#E0E0E0]");
  title.textContent = "Match Invitation";
  const subtitle = createElement("p", "mt-2 text-sm text-[#9aa6c5]");
  subtitle.textContent = `${options.fromName} wants to challenge you to a match.`;
  appendChildren(header, [title, subtitle]);

  const body = createDiv("p-6 space-y-4");
  const expiresText = createElement("p", "text-xs uppercase tracking-[0.3em] text-[#6d7390]");
  expiresText.textContent = "Invitation expires in 30s";
  body.appendChild(expiresText);

  const actions = createDiv("flex flex-col gap-3 sm:flex-row sm:justify-end");
  const acceptBtn = createButton("Accept", "w-full sm:w-auto px-5 py-3 rounded-lg bg-[#00C8FF]/90 text-[#091120] font-semibold uppercase tracking-[0.35em] hover:bg-[#00C8FF] transition-all shadow-[0_0_18px_rgba(0,200,255,0.4)]");
  const declineBtn = createButton("Decline", "w-full sm:w-auto px-5 py-3 rounded-lg border border-[#00C8FF]/40 text-[#E0E0E0] uppercase tracking-[0.3em] hover:border-[#00C8FF] transition-colors");

  let busy = false;

  const setBusy = (state: boolean) => {
    busy = state;
    acceptBtn.disabled = state;
    declineBtn.disabled = state;
    acceptBtn.textContent = state ? "Joining..." : "Accept";
    declineBtn.textContent = state ? "Decline" : "Decline";
  };

  acceptBtn.addEventListener("click", () => {
    if (busy) return;
    setBusy(true);
    options.onAccept();
  });

  declineBtn.addEventListener("click", () => {
    if (busy) return;
    setBusy(true);
    options.onDecline();
  });

  appendChildren(actions, [acceptBtn, declineBtn]);
  appendChildren(card, [header, body, actions]);
  overlay.appendChild(card);

  document.body.appendChild(overlay);
  activeModal = overlay;

  const updateCountdown = () => {
    const remaining = Math.max(0, options.expiresAt - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    expiresText.textContent = `Invitation expires in ${seconds}s`;
    if (remaining <= 0) {
      if (activeCountdown) {
        clearInterval(activeCountdown);
        activeCountdown = null;
      }
    }
  };

  updateCountdown();
  activeCountdown = window.setInterval(updateCountdown, 1000);
}

export function closeIncomingInviteModal(): void {
  if (activeCountdown) {
    clearInterval(activeCountdown);
    activeCountdown = null;
  }
  if (activeModal) {
    activeModal.remove();
    activeModal = null;
  }
}
