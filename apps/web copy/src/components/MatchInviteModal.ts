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

  const overlay = createDiv("fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4");
  overlay.setAttribute("data-match-invite", options.inviteId);

  const card = createDiv("w-full max-w-md rounded-2xl border border-[#00C8FF]/40 bg-[#0f111a] shadow-lg");

  const header = createDiv("p-5 border-b border-white/10");
  const title = createElement("h2", "text-xl font-semibold text-white");
  title.textContent = "Match Invitation";
  const subtitle = createElement("p", "mt-2 text-sm text-[#E0E0E0]/70");
  subtitle.textContent = `${options.fromName} wants to challenge you to a match.`;
  appendChildren(header, [title, subtitle]);

  const body = createDiv("p-5 space-y-4");
  const expiresText = createElement("p", "text-xs text-[#E0E0E0]/50");
  expiresText.textContent = "Invitation expires in 30s";
  body.appendChild(expiresText);

  const actions = createDiv("flex flex-col gap-3 sm:flex-row sm:justify-end");
  const acceptBtn = createButton("Accept", "w-full sm:w-auto px-4 py-2 rounded bg-[#00C8FF] text-[#121217] hover:bg-[#00C8FF]/90");
  const declineBtn = createButton("Decline", "w-full sm:w-auto px-4 py-2 rounded border border-[#00C8FF]/40 text-[#E0E0E0] hover:border-[#00C8FF]");

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
