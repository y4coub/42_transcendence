import { chatWS, type ChatMessage } from '../../lib/chat-ws';
import { getAccessToken } from '../../lib/auth';
import { getUserProfile } from '../../lib/api-client';
import { playPage } from '../../pages/play';
import { getCurrentRoute, navigate, subscribeToRoute } from '../../lib/router-instance';
import { showError, showSuccess, closeModal } from '../../components/Modal';
import { showIncomingInviteModal, closeIncomingInviteModal } from '../../components/MatchInviteModal';
import { appendDMSystemMessage } from '../../pages/chat/state';

interface OutgoingInvite {
  inviteId: string;
  opponentId: string;
  opponentName: string;
  expiresAt: number;
}

interface IncomingInvite {
  inviteId: string;
  fromId: string;
  fromName: string;
  expiresAt: number;
}

interface PendingRequest {
  opponentId: string;
  timeout: number;
  resolve: (inviteId: string) => void;
  reject: (error: Error) => void;
}

export class InvitationManager {
  private initialized = false;
  private outgoingInvites = new Map<string, OutgoingInvite>();
  private incomingInvites = new Map<string, IncomingInvite>();
  private currentRequest: PendingRequest | null = null;
  private profileCache = new Map<string, { displayName: string; avatarUrl: string | null }>();
  private routeUnsubscribe: (() => void) | null = null;

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
      return;
    }

    chatWS.onInvite((message) => {
      this.handleInviteMessage(message);
    });

    if (!chatWS.isOpen()) {
      chatWS.connect(token);
    }

    if (!this.routeUnsubscribe) {
      this.routeUnsubscribe = subscribeToRoute((match) => {
        if (match.id === 'game') {
          closeIncomingInviteModal();
          closeModal();
        }
      });
    }

    this.initialized = true;
  }

  async sendInvite(opponentId: string): Promise<string> {
    if (!opponentId) {
      throw new Error('Opponent ID required');
    }

    const token = getAccessToken();
    if (!token) {
      throw new Error('You must be logged in to send invitations.');
    }

    await this.init();

    if (this.currentRequest) {
      throw new Error('You already have a pending invitation.');
    }

    const connected = await chatWS.waitForOpen(5000);
    if (!connected) {
      throw new Error('Unable to connect to invitation service.');
    }

    const sent = chatWS.sendMatchInvite(opponentId);
    if (!sent) {
      throw new Error('Failed to send invitation.');
    }

    return await new Promise<string>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        if (this.currentRequest && this.currentRequest.resolve === resolve) {
          this.currentRequest = null;
          reject(new Error('Invitation request timed out.'));
        }
      }, 5000);

      this.currentRequest = {
        opponentId,
        timeout,
        resolve,
        reject,
      };
    });
  }

  respond(inviteId: string, accepted: boolean): void {
    chatWS.respondToMatchInvite(inviteId, accepted);
  }

  private async handleInviteMessage(message: ChatMessage): Promise<void> {
    switch (message.type) {
      case 'match_invite':
        await this.handleIncomingInvite(message);
        break;
      case 'match_invite_sent':
        this.handleInviteAcknowledged(message);
        break;
      case 'match_invite_declined':
        this.handleInviteDeclined(message);
        break;
      case 'match_invite_cancelled':
        this.handleInviteCancelled(message);
        break;
      case 'match_invite_expired':
        this.handleInviteExpired(message);
        break;
      case 'match_invite_error':
        this.handleInviteError(message);
        break;
      case 'match_invite_accepted':
        this.handleInviteAccepted(message, true);
        break;
      case 'match_invite_confirmed':
        this.handleInviteAccepted(message, false);
        break;
      default:
        break;
    }
  }

  private async handleIncomingInvite(message: ChatMessage): Promise<void> {
    const inviteId = String(message.inviteId ?? '');
    const fromId = String(message.from ?? '');
    const expiresAt = typeof message.expiresAt === 'number'
      ? message.expiresAt
      : typeof message.expiresAt === 'string'
      ? Date.parse(message.expiresAt)
      : Date.now() + 30000;

    if (!inviteId || !fromId) {
      return;
    }

    const profile = await this.getProfile(fromId);

    this.incomingInvites.set(inviteId, {
      inviteId,
      fromId,
      fromName: profile.displayName,
      expiresAt,
    });
    appendDMSystemMessage(fromId, `${profile.displayName} invited you to a match.`, {
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      logLocally: true,
    });

    showIncomingInviteModal({
      inviteId,
      fromName: profile.displayName,
      expiresAt,
      onAccept: () => {
        this.respond(inviteId, true);
      },
      onDecline: () => {
        this.respond(inviteId, false);
      },
    });
  }

  private handleInviteAcknowledged(message: ChatMessage): void {
    const inviteId = String(message.inviteId ?? '');
    const toId = String(message.to ?? '');
    const expiresAt = typeof message.expiresAt === 'number'
      ? message.expiresAt
      : typeof message.expiresAt === 'string'
      ? Date.parse(message.expiresAt)
      : Date.now() + 30000;

    if (!this.currentRequest || this.currentRequest.opponentId !== toId) {
      return;
    }

    window.clearTimeout(this.currentRequest.timeout);
    const resolve = this.currentRequest.resolve;
    this.currentRequest = null;

    this.getProfile(toId)
      .then((profile) => {
        this.outgoingInvites.set(inviteId, {
          inviteId,
          opponentId: toId,
          opponentName: profile.displayName,
          expiresAt,
        });
      })
      .catch(() => {
        this.outgoingInvites.set(inviteId, {
          inviteId,
          opponentId: toId,
          opponentName: 'Opponent',
          expiresAt,
        });
      });

    resolve(inviteId);
  }

  private handleInviteDeclined(message: ChatMessage): void {
    const inviteId = String(message.inviteId ?? '');
    const invite = this.outgoingInvites.get(inviteId);
    if (invite) {
      this.outgoingInvites.delete(inviteId);
      showError('Invitation Declined', `${invite.opponentName} declined your challenge.`);
      appendDMSystemMessage(invite.opponentId, `${invite.opponentName} declined your match invite.`, {
        displayName: invite.opponentName,
        avatarUrl: null,
        logLocally: true,
      });
    }
  }

  private handleInviteCancelled(message: ChatMessage): void {
    const inviteId = String(message.inviteId ?? '');
    const incoming = this.incomingInvites.get(inviteId);
    if (incoming) {
      this.incomingInvites.delete(inviteId);
      closeIncomingInviteModal();
      showSuccess('Invitation Declined', 'Invitation closed.');
      appendDMSystemMessage(incoming.fromId, `${incoming.fromName} cancelled their match invite.`, {
        displayName: incoming.fromName,
        avatarUrl: null,
        logLocally: true,
      });
    }
  }

  private handleInviteExpired(message: ChatMessage): void {
    const inviteId = String(message.inviteId ?? '');
    const reason = String(message.reason ?? 'timeout');
    if (!inviteId) {
      return;
    }

    const outgoing = this.outgoingInvites.get(inviteId);
    if (outgoing) {
      this.outgoingInvites.delete(inviteId);
      const text = reason === 'disconnect'
        ? `${outgoing.opponentName} disconnected before responding.`
        : `${outgoing.opponentName} did not respond in time.`;
      showError('Invitation Expired', text);
      appendDMSystemMessage(outgoing.opponentId, `${outgoing.opponentName} did not respond to your match invite.`, {
        displayName: outgoing.opponentName,
        avatarUrl: null,
        logLocally: true,
      });
      return;
    }

    const incoming = this.incomingInvites.get(inviteId);
    if (incoming) {
      this.incomingInvites.delete(inviteId);
      closeIncomingInviteModal();
      const text = reason === 'disconnect'
        ? 'The challenger disconnected before you could respond.'
        : 'The challenge invitation has expired.';
      showError('Invitation Expired', text);
      appendDMSystemMessage(incoming.fromId, `${incoming.fromName}'s match invite expired.`, {
        displayName: incoming.fromName,
        avatarUrl: null,
        logLocally: true,
      });
    }
  }

  private handleInviteError(message: ChatMessage): void {
    const inviteId = String(message.inviteId ?? '');
    const outgoing = this.outgoingInvites.get(inviteId);
    if (outgoing) {
      this.outgoingInvites.delete(inviteId);
      showError('Invitation Failed', 'Unable to start match. Please try again.');
      return;
    }

    if (this.currentRequest) {
      window.clearTimeout(this.currentRequest.timeout);
      const reject = this.currentRequest.reject;
      this.currentRequest = null;
      reject(new Error('Invitation could not be delivered.'));
      showError('Invitation Error', 'Unable to send invitation. Please try again.');
      return;
    }

    showError('Invitation Error', 'Unable to process invitation.');
  }

  private handleInviteAccepted(message: ChatMessage, inviterPerspective: boolean): void {
    const inviteId = String(message.inviteId ?? '');
    const matchId = String(message.matchId ?? '');
    const opponentId = String(message.opponentId ?? '');

    if (!inviteId || !matchId || !opponentId) {
      return;
    }

    if (inviterPerspective) {
      const invite = this.outgoingInvites.get(inviteId);
      if (invite) {
        this.outgoingInvites.delete(inviteId);
        appendDMSystemMessage(invite.opponentId, `${invite.opponentName} accepted your match invite.`, {
          displayName: invite.opponentName,
          avatarUrl: null,
          logLocally: true,
        });
      }
    } else {
      const incoming = this.incomingInvites.get(inviteId);
      if (incoming) {
        this.incomingInvites.delete(inviteId);
        appendDMSystemMessage(incoming.fromId, `You accepted ${incoming.fromName}'s match invite.`, {
          displayName: incoming.fromName,
          avatarUrl: null,
          logLocally: true,
        });
      }
      closeIncomingInviteModal();
    }

    this.launchMatch(matchId, opponentId);
  }

  private launchMatch(matchId: string, opponentId: string): void {
    closeIncomingInviteModal();
    closeModal();
    sessionStorage.setItem('currentMatchId', matchId);
    sessionStorage.setItem('currentOpponentId', opponentId);
    const currentRoute = getCurrentRoute();
    if (currentRoute?.id === 'game') {
      void playPage.beginExternalMatchLaunch();
      return;
    }
    void navigate('/arena');
  }

  private async getProfile(userId: string): Promise<{ displayName: string; avatarUrl: string | null }> {
    if (this.profileCache.has(userId)) {
      return this.profileCache.get(userId)!;
    }

    try {
      const profile = await getUserProfile(userId);
      const summary = {
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      };
      this.profileCache.set(userId, summary);
      return summary;
    } catch (error) {
      console.error('Failed to load profile for invitation:', error);
      const fallback = { displayName: `Player ${userId.slice(0, 6)}`, avatarUrl: null };
      this.profileCache.set(userId, fallback);
      return fallback;
    }
  }

}

export const invitationManager = new InvitationManager();
