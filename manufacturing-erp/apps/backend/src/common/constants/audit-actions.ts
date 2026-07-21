export const AuditAction = {
  LOGIN: 'auth.login',
  LOGIN_GOOGLE: 'auth.login.google',
  LOGOUT: 'auth.logout',
  TOKEN_REFRESH: 'auth.token.refresh',
  FORGOT_PASSWORD_REQUESTED: 'auth.password.forgot_requested',
  PASSWORD_RESET: 'auth.password.reset',
  PASSWORD_CHANGED: 'auth.password.changed',
  SESSION_REVOKED: 'auth.session.revoked',
  SESSIONS_REVOKED_ALL: 'auth.session.revoked_all',
  PROFILE_UPDATED: 'user.profile.updated',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
