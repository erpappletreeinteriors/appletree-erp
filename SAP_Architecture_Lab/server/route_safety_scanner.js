'use strict';
// ============================================================================================
// Phase 25 §8/§9 — Structural Legacy-Route Safety Gate
// ============================================================================================
// Runs once at server startup (see server.js's call to runRouteSafetyAudit()) and reads server.js's
// OWN source text to find every legacy `if(pathname...&&req.method===POST/PUT/PATCH/DELETE)`
// mutation branch, then verifies each one contains its own authorization signal.
//
// This deliberately does NOT rely on a bare grep. Every match is found by walking balanced
// parentheses/braces character-by-character (skipping string/template literals and comments so a
// stray brace or the words "req.method" inside a quoted string cannot fool it) — so a condition
// spanning two unrelated if-statements, or a route whose auth check lives three lines below its
// own block, cannot produce a false result the way a naive multi-line regex would (an earlier
// draft of this exact scanner did exactly that, and was rewritten after catching its own bug — see
// the Phase 25 report §8 for the full account).
//
// No new dependency was added to do this (this project is intentionally dependency-free — see the
// header comment at the top of server.js). A true AST parser (e.g. acorn/esprima) would be more
// robust still against sufficiently adversarial code shapes; this hand-rolled scanner is the
// strongest mechanism available without introducing one, and its only known blind spot — it cannot
// see INTO domain.js, so a route with no local check but a fully correct guard inside its domain
// function reads as a violation — is handled via the explicit, commented EXEMPT_PATHS list plus,
// for the routes Phase 25 found in that exact shape, adding the (already-correct) domain rule at
// the route layer too, so the exemption list stays short and reviewed rather than growing to hide
// real gaps.

const EXEMPT_PATHS = new Set([
  "'/api/login'",           // pre-authentication by definition — there is no actor yet to check a role for
  "'/api/logout'",          // acts on the caller's own session only
  "'/api/change-password'", // self-service: changeOwnPassword() requires the CURRENT password and
                             // is hard-scoped to actor.id — cannot act on any other account
]);

function findMatchingDelimiter(src, openIdx, openChar, closeChar) {
  let depth = 0;
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    const prev = src[i - 1];
    if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (prev === '*' && c === '/') inBlockComment = false; continue; }
    if (inString) {
      if (c === '\\') { i++; continue; }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') { inLineComment = true; continue; }
    if (c === '/' && src[i + 1] === '*') { inBlockComment = true; continue; }
    if (c === '"' || c === "'" || c === '`') { inString = c; continue; }
    if (c === openChar) depth++;
    else if (c === closeChar) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function lineOf(src, idx) { return src.slice(0, idx).split('\n').length; }

function scanLegacyMutationRoutes(src) {
  const violations = [];
  const checked = [];
  const ifRe = /\bif\s*\(/g;
  let m;
  while ((m = ifRe.exec(src))) {
    const openParenIdx = m.index + m[0].length - 1;
    const closeParenIdx = findMatchingDelimiter(src, openParenIdx, '(', ')');
    if (closeParenIdx === -1) continue;
    const condition = src.slice(openParenIdx + 1, closeParenIdx);
    if (!/\bpathname\b/.test(condition)) continue;
    const methodMatch = condition.match(/req\.method\s*===\s*'(POST|PUT|PATCH|DELETE)'/);
    if (!methodMatch) continue;
    const exactPathMatch = condition.match(/pathname\s*===\s*('[^']*')/);
    if (exactPathMatch && EXEMPT_PATHS.has(exactPathMatch[1])) continue;
    let afterParen = closeParenIdx + 1;
    while (/\s/.test(src[afterParen])) afterParen++;
    const lineNo = lineOf(src, m.index);
    if (src[afterParen] !== '{') { violations.push({ line: lineNo, method: methodMatch[1], reason: 'if(...) body is not a { } block — cannot verify statically.', snippet: condition.slice(0, 80) }); continue; }
    const closeBraceIdx = findMatchingDelimiter(src, afterParen, '{', '}');
    if (closeBraceIdx === -1) { violations.push({ line: lineNo, method: methodMatch[1], reason: 'Could not find matching closing brace.', snippet: condition.slice(0, 80) }); continue; }
    const blockBody = src.slice(afterParen, closeBraceIdx + 1);
    const hasDenyCall = /deny\s*\(\s*res\s*,\s*403/.test(blockBody);
    const hasRoleSignal = /can\s*\(\s*actor\s*,|actor\.role\s*===|\.includes\s*\(\s*actor\.role\s*\)|\.has\s*\(\s*actor\.role\s*\)|authCheck|assertCan[A-Za-z]+\s*\(|[A-Za-z]*Allowed\s*\([^)]*\bactor\b|\bcan[A-Z][A-Za-z]*\s*\([^)]*\bactor\b/.test(blockBody);
    const routeInfo = { method: methodMatch[1], line: lineNo, snippet: condition.replace(/\s+/g, ' ').slice(0, 90) };
    checked.push(routeInfo);
    if (!hasDenyCall || !hasRoleSignal) {
      violations.push(Object.assign({}, routeInfo, { reason: !hasDenyCall ? "No deny(res,403...) call found in this route's own block." : "deny(res,403...) present but no recognizable role/permission check signal found in this route's own block." }));
    }
    ifRe.lastIndex = closeBraceIdx;
  }
  return { checked, violations };
}

// Called from server.js at startup, BEFORE server.listen(). Throws (crashing boot, exactly like
// registerMutationRoute()'s own guards) if any legacy mutation branch has no recognizable
// authorization signal in its own block.
function runRouteSafetyAudit(serverJsPath) {
  const fs = require('fs');
  const src = fs.readFileSync(serverJsPath, 'utf8');
  const { checked, violations } = scanLegacyMutationRoutes(src);
  if (violations.length) {
    const details = violations.map(v => `  line ${v.line} [${v.method}] ${v.snippet} — ${v.reason}`).join('\n');
    throw new Error(`Route safety audit FAILED — ${violations.length} legacy mutation route(s) with no recognizable authorization check:\n${details}\n\nEither add a role/permission check calling deny(res,403,...) to each route above, or migrate it to registerMutationRoute() (which cannot boot without declaring permission/roles/authCheck).`);
  }
  return { checkedCount: checked.length };
}

module.exports = { scanLegacyMutationRoutes, runRouteSafetyAudit, findMatchingDelimiter };
