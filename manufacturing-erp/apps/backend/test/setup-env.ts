// Runs before any e2e test file is loaded, so that AppModule's ConfigModule
// validation (which happens at import time via the @Module decorator) always
// finds the required env vars, even for specs that never touch a real database.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'e2e-access-secret-at-least-32-characters';
process.env.JWT_REFRESH_SECRET ??= 'e2e-refresh-secret-at-least-32-characters';
