export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  corsOrigin: string;
  frontendUrl: string;
  jwt: {
    accessSecret: string;
    accessExpiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  bcryptSaltRounds: number;
  passwordResetTokenTtlMs: number;
  oauthTicketTtlMs: number;
  google: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: process.env.DATABASE_URL as string,
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET as string,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12', 10),
  passwordResetTokenTtlMs: parseInt(
    process.env.PASSWORD_RESET_TOKEN_TTL_MS ?? `${60 * 60 * 1000}`,
    10,
  ),
  oauthTicketTtlMs: parseInt(process.env.OAUTH_TICKET_TTL_MS ?? `${60 * 1000}`, 10),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? 'not-configured',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? 'not-configured',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3000/auth/google/callback',
  },
});
