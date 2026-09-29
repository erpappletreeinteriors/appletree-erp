'use strict';
// ============================================================
// Phase 6A — Authentication & Session Management
// ============================================================
// Real password hashing (Node's built-in scrypt — no plaintext password is
// ever stored, logged, or sent back to the client after login). Real session
// tokens (cryptographically random, server-held, expiring). No external
// dependencies — keeps the "simplest architecture that provides genuine
// enforcement" instruction (§4) honest: this is standard-library Node, not a
// toy shortcut.
const crypto = require('crypto');

function hashPassword(plain){
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return {hash, salt};
}
function verifyPassword(plain, hash, salt){
  const check = crypto.scryptSync(plain, salt, 64).toString('hex');
  // Timing-safe comparison — do not use === on secrets.
  const a = Buffer.from(check, 'hex'), b = Buffer.from(hash, 'hex');
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const sessions = new Map(); // token -> {userId, role, username, createdAt, expiresAt}

function createSession(user){
  const token = crypto.randomBytes(32).toString('hex'); // 256 bits — not guessable
  const now = Date.now();
  sessions.set(token, { userId:user.id, role:user.role, username:user.username, createdAt:now, expiresAt: now + SESSION_TTL_MS });
  return token;
}
function getSession(token){
  if(!token) return null;
  const s = sessions.get(token);
  if(!s) return null;
  if(Date.now() > s.expiresAt){ sessions.delete(token); return null; }
  return s;
}
function touchSession(token){
  const s = sessions.get(token);
  if(s) s.expiresAt = Date.now() + SESSION_TTL_MS;
}
function destroySession(token){ sessions.delete(token); }
function sessionCount(){ return sessions.size; }

module.exports = { hashPassword, verifyPassword, createSession, getSession, touchSession, destroySession, sessionCount, SESSION_TTL_MS };
