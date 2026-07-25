import crypto from 'crypto';

export function createInviteToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function inviteExpiresAt(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
