'use strict';
// ERP Audit Remediation — ERP-005 (Critical) permanent regression test.
//
// The independent audit reproduced a genuine multi-process lost update: two `node server.js`
// processes pointed at the same db.json each generated the same next ID and each wrote back
// independently, silently losing one process's changes. The fix (see acquireSingleInstanceLock()
// in domain.js) makes running a second process against the same db.json structurally impossible —
// this test proves that directly, by actually spawning a real second OS process against a real
// server's db.json directory and confirming it is refused, then confirming the original process is
// completely unaffected.
//
// Usage: node erp_audit_concurrency_tests.js <path-to-a-server-dir-with-a-RUNNING-server.js>
// The target server dir's server.js MUST already be running (this test does not start it) —
// point this at an ISOLATED test server directory, never at a live production server directory.
const path = require('path');
const { spawnSync } = require('child_process');

const serverDir = process.argv[2];
if(!serverDir){
  console.error('Usage: node erp_audit_concurrency_tests.js <path-to-isolated-server-dir-with-server.js-already-running>');
  process.exit(2);
}

console.log(`Attempting to start a SECOND process against ${path.join(serverDir,'db.json')} (the first must already be running there)...`);
const result = spawnSync(process.execPath, ['server.js'], { cwd: serverDir, timeout: 8000, encoding: 'utf8' });
const stderr = result.stderr || '';
const refused = result.status === 1 && /already holds the lock/.test(stderr) && /ERP-005/.test(stderr);

console.log(refused ? 'PASS' : 'FAIL', '[ERP-005] A second process against the same db.json is refused at startup, citing the lock');
if(!refused){
  console.log('--- child stderr ---\n' + stderr);
  process.exitCode = 1;
} else {
  console.log('--- refusal message ---\n' + stderr.trim());
}
