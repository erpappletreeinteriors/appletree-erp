import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  BCRYPT_SALT_ROUNDS: Joi.number().min(10).max(15).default(12),

  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
  FRONTEND_URL: Joi.string().default('http://localhost:5173'),

  PASSWORD_RESET_TOKEN_TTL_MS: Joi.number().default(60 * 60 * 1000),
  OAUTH_TICKET_TTL_MS: Joi.number().default(60 * 1000),

  // Google OAuth is optional at boot (defaults let the app start without it);
  // real Google Sign-In will only work once these are set to a real app's
  // credentials from the Google Cloud Console.
  GOOGLE_CLIENT_ID: Joi.string().default('not-configured'),
  GOOGLE_CLIENT_SECRET: Joi.string().default('not-configured'),
  GOOGLE_CALLBACK_URL: Joi.string().default('http://localhost:3000/auth/google/callback'),

  SEED_ADMIN_EMAIL: Joi.string().email().optional(),
  SEED_ADMIN_PASSWORD: Joi.string().optional(),
});
