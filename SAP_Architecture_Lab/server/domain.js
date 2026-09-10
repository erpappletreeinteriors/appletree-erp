'use strict';
// ============================================================
// Phase 6A — Domain / Accounting Engine (server-side, authoritative)
// ============================================================
// This is the SAME business logic proven in Phase 4/5 (appletree_sap_lab.html),
// ported to run here instead of in the browser. Nothing about the accounting
// rules changed — debit=credit enforcement, the document lifecycle, AR/AP
// open-items/clearing, the reversal-blocks-if-cleared fix, and the
// reconciliation scoping fix (Phase 5 defects 2 and 3) are all carried over
// unchanged. What's NEW is that this code now runs in a process the browser
// cannot inspect or bypass — see server.js for the authorization layer that
// wraps every call into this module.
const fs = require('fs');
const path = require('path');

// ============================================================
// Phase 35 Part A — controlled fault-injection instrumentation. Mirrors the EXISTING precedent of
// /api/test/reset and /api/test/backdate-ticket (Admin-only, test-infrastructure, never usable by
// or exposed to a real business user): a module-level flag, never persisted to DB.json (so it
// cannot survive a restart or leak into the real database), that a small set of real mutation
// sequences check at a specific named boundary. Auto-disarms the instant it fires, so it affects
// exactly ONE subsequent matching call, never every future one. This exists to answer the question
// Phase 34 explicitly left NOT VERIFIED: when a real multi-step mutation sequence (compute → GL →
// inventory → status update → save) is interrupted by an exception mid-sequence, does the system
// end up with ALL required mutations committed, or NO business mutation at all — or, the real risk,
// something PARTIAL in between.
// ============================================================
let __PHASE35_FAULT_POINT__ = null;
function setTestFaultPoint(point){ __PHASE35_FAULT_POINT__ = point || null; }
// Phase 36 — a temporary, one-shot toggle used ONLY to prove the BEFORE state of a rollback fix
// (i.e., to demonstrate live that removing the fix reproduces the original defect) before
// re-enabling it. Never used to weaken real behavior outside a deliberate, disclosed before/after
// comparison in the audit itself.
let __PHASE36_SKIP_ROLLBACK_FOR_BEFORE_TEST__ = false;
function setSkipRollbackForBeforeTest(v){ __PHASE36_SKIP_ROLLBACK_FOR_BEFORE_TEST__ = !!v; }
function _fault(point){
  if(__PHASE35_FAULT_POINT__ === point){
    __PHASE35_FAULT_POINT__ = null; // one-shot: disarm immediately so only this one call is affected
    throw new Error('PHASE35_INJECTED_FAULT:'+point);
  }
}
// Phase 37 Part E — a real OS-level process-crash injector, deliberately distinct from _fault()
// above. _fault() throws a catchable JS exception, which every one of the 15 Phase-35/36 rollback
// wrappers correctly catches and compensates for. This is a genuinely different failure mode: a
// real crash (OOM kill, power loss, `kill -9`, a Node engine bug) gives the process NO opportunity
// to run ANY catch block at all — process.exit() is the closest deliberately-controllable
// equivalent available without an actual external kill signal. Same one-shot arm/disarm shape,
// same test-only /api/test/set-fault endpoint reused (a distinct point-name space, checked here).
let __PHASE37_CRASH_POINT__ = null;
function setTestCrashPoint(point){ __PHASE37_CRASH_POINT__ = point || null; }
function _crashFault(point){
  if(__PHASE37_CRASH_POINT__ === point){
    console.error('[PHASE37 DELIBERATE CRASH INJECTION]', point);
    process.exit(1);
  }
}
// Phase 37 Part F naive-developer test — removed after use, see the Phase 37 report.
//
// Phase 38 Part D — a SECOND, temporary, deliberately naive transaction function
// (createNaiveFinancialTransaction2) and its two routes (/api/test/naive-tx-modern,
// /api/test/naive-tx-legacy — one registered via registerMutationRoute(), one via a raw legacy
// if-block, everything else identical) were used here to test whether the Phase 38 central
// transaction mechanism protects a handler that itself calls neither withTransaction() nor
// postJournalEntry(), only a direct DB.journalEntries.push(). Findings, in full in the Phase 38
// report: with enforcement OFF (audit mode), the modern route was fully protected (the dispatcher
// wraps every registerMutationRoute() handler regardless of what it does inside), while the
// legacy route reproduced the exact Phase 37 orphan (a real GL entry, JE-0990, committed with
// zero corresponding document, ₹0 net difference in the client-visible error either way). With
// enforcement ON, the SAME legacy-route naive handler was blocked outright at its first write —
// zero mutation, not merely a post-hoc rollback. All 3 real GL entries produced during this test
// (JE-0988/0989/0990) were reversed via reverseEntry() before this code was removed, per this
// audit's policy against direct edits to financial history.

const DB_FILE = path.join(__dirname, 'db.json');
const BACKUP_DIR = path.join(__dirname, 'backups');
const LOCK_FILE = path.join(__dirname, 'db.json.lock');

// ERP AUDIT FIX (ERP-005, Critical) — ARCHITECTURAL MITIGATION, not a full fix. The independent
// audit reproduced a genuine multi-process lost update: two separate `node server.js` processes
// pointed at the SAME db.json each read the file, each computed the same "next" ID from what they
// read, and each wrote back independently — the LAST writer's save() silently discarded the
// other's in-memory changes, because this file's entire persistence model (load-into-memory,
// mutate, save-the-whole-object) has no cross-process coordination of any kind. That is a true
// structural limitation of a single-JSON-file store with no real transaction/locking engine
// underneath it — no amount of in-process guarding (withTransaction, write-point Proxies, the
// idempotency ledger — all real, all already built, see their own headers above) can close it,
// because none of them are visible to a SECOND process's separate copy of this same module. The
// audit's own recommended long-term fix is migrating transactional persistence to a real
// database (SQLite/Postgres) — see ERP_ARCHITECTURE_ASSESSMENT.md for that plan; it is a
// multi-week undertaking (every one of ~100+ DB.* collections and every read/write call site)
// deliberately NOT attempted as a same-session patch, per this engagement's own instruction not to
// hide an architectural problem behind increasingly complicated locks.
//
// What IS fixed here, honestly scoped: this deployment is designed to run as exactly ONE process
// against one db.json (confirmed — no cluster/fork/worker_threads anywhere in this codebase). The
// audit's reproduction required someone to actually START A SECOND PROCESS against the same file,
// which is an operational mistake this Lab had no way to even detect, let alone prevent. This lock
// makes that mistake impossible: on startup, the process atomically claims an exclusive lock file
// (O_EXCL — fails if the file already exists, which is atomic at the OS level, the same primitive
// save()'s rename-based swap above already relies on for its own atomicity guarantee) stamped with
// its own PID, and refuses to start at all if a SECOND process tries to run against the same
// db.json while a live process already holds the lock. A stale lock left behind by a process that
// crashed without cleaning up (verified by checking the recorded PID is no longer running) is
// reclaimed automatically, so a genuine crash never permanently locks out a legitimate restart.
function acquireSingleInstanceLock(){
  if(fs.existsSync(LOCK_FILE)){
    let staleInfo = null;
    try{ staleInfo = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')); }catch(e){ /* unreadable lock — treat as stale below */ }
    const stalePid = staleInfo && staleInfo.pid;
    let stillRunning = false;
    if(stalePid){
      try{ process.kill(stalePid, 0); stillRunning = true; } // signal 0 = "does this PID exist", throws ESRCH if not
      catch(e){ stillRunning = false; }
    }
    if(stillRunning){
      console.error(`[FATAL] Another server process (PID ${stalePid}) already holds the lock on ${DB_FILE}.`);
      console.error(`[FATAL] Running two server processes against the same database file is exactly the scenario that caused a real, confirmed lost-update defect (ERP-005) — refusing to start.`);
      console.error(`[FATAL] If PID ${stalePid} is not actually running, delete ${LOCK_FILE} and restart.`);
      process.exit(1);
    }
    console.warn(`[WARN] Found a stale lock file from PID ${stalePid} (no longer running) — reclaiming it.`);
    try{ fs.unlinkSync(LOCK_FILE); }catch(e){}
  }
  const fd = fs.openSync(LOCK_FILE, 'wx'); // 'wx' = O_CREAT|O_EXCL — atomically fails if the file already exists
  fs.writeSync(fd, JSON.stringify({pid:process.pid, startedAt:new Date().toISOString()}));
  fs.closeSync(fd);
  const releaseLock = () => { try{ fs.unlinkSync(LOCK_FILE); }catch(e){} };
  process.on('exit', releaseLock);
  process.on('SIGINT', ()=>{ releaseLock(); process.exit(0); });
  process.on('SIGTERM', ()=>{ releaseLock(); process.exit(0); });
}

const SEED = {
  accounts: [
    {id:'1000', name:'Bank', type:'Asset'},
    {id:'1100', name:'Accounts Receivable', type:'Asset'},
    {id:'1200', name:'Inventory / WIP', type:'Asset'},
    {id:'1300', name:'Input Tax Recoverable', type:'Asset'},
    {id:'2000', name:'Accounts Payable', type:'Liability'},
    {id:'2100', name:'Customer Advance Liability', type:'Liability'},
    {id:'2200', name:'Output Tax Payable', type:'Liability'},
    {id:'4000', name:'Project Revenue', type:'Income'},
    {id:'5000', name:'Material Cost', type:'Expense'},
    {id:'5100', name:'Labour Cost', type:'Expense'},
    {id:'5200', name:'Site Expense', type:'Expense'},
    {id:'2050', name:'GR/IR Clearing', type:'Liability'},
    // Phase 14 — genuinely new GL concept (inventory shrinkage/adjustment), does not fit any
    // existing account without misclassifying it; no existing account reused for this.
    {id:'5300', name:'Inventory Adjustment', type:'Expense'},
    // Phase 19 §26/§27 — Fixed Assets. 4 new accounts, none reused from an existing one, since
    // none of the existing 13 correctly represents capitalized cost / accumulated depreciation /
    // depreciation expense / disposal gain-loss without misclassifying it.
    {id:'1400', name:'Fixed Assets — Cost', type:'Asset'},
    {id:'1450', name:'Accumulated Depreciation', type:'Asset'},
    {id:'5400', name:'Depreciation Expense', type:'Expense'},
    {id:'5500', name:'Gain/Loss on Asset Disposal', type:'Expense'},
    // Phase 20 §7 — the ONE new technical/structural account the Opening Balance Engine needs to
    // function at all: a universal balancing account for opening-balance entries (a standard
    // accounting technique used by virtually every ERP — SAP itself uses a dedicated opening-
    // balance/retained-earnings account for exactly this). This is infrastructure, not an invented
    // Appletree business account — clearly labeled as such, never meant to carry a balance once
    // the real opening trial balance is fully and correctly loaded (its balance = 0 is itself the
    // reconciliation proof that the opening entries are complete and correct).
    {id:'3000', name:'Opening Balance Equity (technical — not a real Appletree account)', type:'Liability'},
    // Phase 33 — Finance SOP §3 (TDS). TDS deducted at source on a supplier payment is a real
    // liability Apple Tree owes to the government until remitted — genuinely new GL concept, no
    // existing account represents "tax withheld from someone else, payable by us" without
    // misclassifying it.
    {id:'2300', name:'TDS Payable', type:'Liability'},
    // Phase 34 — Finance SOP §2 (ITC not available on lost/destroyed/written-off/free-sample
    // goods). Kept deliberately SEPARATE from the existing 5300 Inventory Adjustment expense so
    // the tax-credit reversal itself is independently auditable/reportable, not blended into the
    // ordinary write-off expense figure.
    {id:'5310', name:'Input Tax Reversed (ITC Ineligible)', type:'Expense'}
  ],
  // Phase 14 §18 — Branch dimension. Only "Ullyeri" is evidenced (from the CEO-supplied real
  // Appletree accounting screenshot); everything else is a neutral placeholder, not invented
  // business data. Admin/CEO can add more via the Branches master — full branch list is
  // BUSINESS POLICY REQUIRED / CONFIGURATION REQUIRED, not guessed here.
  branches: [
    {id:'BR-HO', code:'HO', name:'Head Office / Unspecified', active:true},
    {id:'BR-ULLIYERI', code:'ULLIYERI', name:'Ulliyeri', active:true}
  ],
  // Phase 15 §5 — Bank Account master. Sub-ledger detail underneath the single existing GL
  // account 1000 "Bank" (no evidence of Appletree needing separate GL accounts per physical bank
  // account, so the control account stays unified — this master exists purely to record WHICH
  // real bank account a payment/receipt/statement line belongs to). Only the ONE account visible
  // in the CEO's screenshot is seeded; nothing else is invented.
  bankAccounts: [
    {id:'BANK-ICICI-1112', bankName:'ICICI Bank', accountName:'ICICI Areekkad A/c No.249005001112', accountNumberLast4:'1112', glAccount:'1000', active:true}
  ],
  materials: [
    {id:'MAT-1', code:'PLY18', description:'Plywood 18mm Marine Grade', category:'Panel', uom:'sheet', stockItem:true, standardCost:2800, valuationMethod:'MovingAverage', taxCode:'GST18', active:true, reorderLevel:20, minStock:10, maxStock:200, hsnCode:null},
    {id:'MAT-2', code:'LAM-STD', description:'Laminate — Standard Finish', category:'Panel', uom:'sheet', stockItem:true, standardCost:1200, valuationMethod:'MovingAverage', taxCode:'GST18', active:true, reorderLevel:15, minStock:5, maxStock:150, hsnCode:null},
    {id:'MAT-3', code:'VEN-TEAK', description:'Teak Veneer', category:'Panel', uom:'sheet', stockItem:true, standardCost:3500, valuationMethod:'MovingAverage', taxCode:'GST18', active:true, reorderLevel:10, minStock:5, maxStock:100, hsnCode:null},
    {id:'MAT-4', code:'PVC-EDGE', description:'PVC Edge Band 2mm', category:'Hardware', uom:'roll', stockItem:true, standardCost:450, valuationMethod:'MovingAverage', taxCode:'GST18', active:true, reorderLevel:20, minStock:10, maxStock:100, hsnCode:null},
    {id:'MAT-5', code:'HNG-SS', description:'SS Soft-close Hinge', category:'Hardware', uom:'pc', stockItem:true, standardCost:180, valuationMethod:'MovingAverage', taxCode:'GST18', active:true, reorderLevel:100, minStock:50, maxStock:1000, hsnCode:null},
    {id:'MAT-6', code:'MDF-12', description:'MDF Board 12mm', category:'Panel', uom:'sheet', stockItem:true, standardCost:1800, valuationMethod:'MovingAverage', taxCode:'GST18', active:true, reorderLevel:15, minStock:5, maxStock:150, hsnCode:null},
    {id:'MAT-7', code:'GLS-TMP', description:'Toughened Glass 8mm', category:'Glass', uom:'sqft', stockItem:true, standardCost:220, valuationMethod:'MovingAverage', taxCode:'GST18', active:true, reorderLevel:50, minStock:20, maxStock:500, hsnCode:null},
    {id:'MAT-8', code:'ALU-PRF', description:'Aluminium Profile — Standard', category:'Metal', uom:'meter', stockItem:true, standardCost:320, valuationMethod:'MovingAverage', taxCode:'GST18', active:true, reorderLevel:100, minStock:50, maxStock:800, hsnCode:null}
  ],
  warehouses: [
    {id:'WH-1', name:'Main Factory Store', location:'Kochi Factory', active:true},
    {id:'WH-2', name:'Site Store — Rotating', location:'Various project sites', active:true}
  ],
  projects: [
    {id:'PRJ-1', name:'Habeeb Kaithakkunda — Residence', budget:500000, status:'ACTIVE', projectManagerId:null, salesOwnerId:null, quotationId:null, leadId:null, customerId:null, advanceRequiredAmount:null},
    {id:'PRJ-2', name:'Silver Sands — Office Fitout', budget:300000, status:'ACTIVE', projectManagerId:null, salesOwnerId:null, quotationId:null, leadId:null, customerId:null, advanceRequiredAmount:null},
    {id:'PRJ-3', name:'Marine Drive — Penthouse', budget:900000, status:'ACTIVE', projectManagerId:null, salesOwnerId:null, quotationId:null, leadId:null, customerId:null, advanceRequiredAmount:null},
    {id:'PRJ-4', name:'Kakkanad — Villa Turnkey', budget:1200000, status:'ACTIVE', projectManagerId:null, salesOwnerId:null, quotationId:null, leadId:null, customerId:null, advanceRequiredAmount:null},
    {id:'PRJ-5', name:'Infopark — Corporate Office', budget:650000, status:'ACTIVE', projectManagerId:null, salesOwnerId:null, quotationId:null, leadId:null, customerId:null, advanceRequiredAmount:null}
  ],
  costCentres: [
    {id:'CC-DESIGN', name:'Design'}, {id:'CC-FACTORY', name:'Factory'}, {id:'CC-SITE', name:'Site'},
    // Phase 15 §2 — extends the EXISTING cost-centre master (reuse, not a new dimension) to
    // finally distinguish Installation labour from Production/Factory labour, both of which
    // previously shared account 5100 with zero distinguishing tag.
    {id:'CC-INSTALLATION', name:'Installation'}
  ],
  customers: [
    {id:'CUST-1', name:'Mr. Habeeb'}, {id:'CUST-2', name:'Silver Sands Pvt Ltd'}, {id:'CUST-3', name:'Mrs. Anjali Menon'},
    {id:'CUST-4', name:'Marine Drive Estates LLP'}, {id:'CUST-5', name:'Mr. Thomas Varghese'}, {id:'CUST-6', name:'Kakkanad Builders Pvt Ltd'},
    {id:'CUST-7', name:'Ms. Priya Nair'}, {id:'CUST-8', name:'Infopark Developers Ltd'}, {id:'CUST-9', name:'Mr. Rajeev Kumar'}, {id:'CUST-10', name:'Mrs. Sarah Jacob'}
  ],
  vendors: [
    {id:'VEND-1', name:'ABC Plywood Suppliers'}, {id:'VEND-2', name:'XYZ Hardware Traders'}, {id:'VEND-3', name:'Kerala Glass & Aluminium'},
    {id:'VEND-4', name:'Cochin Veneer Depot'}, {id:'VEND-5', name:'Modern Kitchen Accessories'}, {id:'VEND-6', name:'Sree Lakshmi Carpentry Works'},
    {id:'VEND-7', name:'Metro Polishing Contractors'}, {id:'VEND-8', name:'Ernakulam Transport Co.'}, {id:'VEND-9', name:'Precision Hardware Imports'}, {id:'VEND-10', name:'Coastal Site Supplies'}
  ],
  taxCodes: [
    {code:'GST18', label:'GST 18% (9% CGST + 9% SGST)', cgstPct:9, sgstPct:9, igstPct:0, active:true},
    {code:'GST5', label:'GST 5% (2.5% CGST + 2.5% SGST)', cgstPct:2.5, sgstPct:2.5, igstPct:0, active:true},
    {code:'GST12', label:'GST 12% IGST (inter-state)', cgstPct:0, sgstPct:0, igstPct:12, active:true}
  ],
  // Phase 19 §24 (APPROVED — Decision A, required): metadata-only classification for HOW a
  // Receipt/Payment moved, never the accounting account itself — the GL posting is always the
  // same Dr/Cr 1000 (Bank) regardless of which method is tagged. Real, standard Indian payment
  // rails only — nothing invented.
  paymentMethods: [
    {id:'PM-CASH', code:'CASH', name:'Cash', category:'Cash', active:true},
    {id:'PM-CHEQUE', code:'CHEQUE', name:'Cheque', category:'Bank', active:true},
    {id:'PM-BANKTRANSFER', code:'BANKTRANSFER', name:'Bank Transfer', category:'Bank', active:true},
    {id:'PM-NEFT', code:'NEFT', name:'NEFT', category:'Bank', active:true},
    {id:'PM-RTGS', code:'RTGS', name:'RTGS', category:'Bank', active:true},
    {id:'PM-IMPS', code:'IMPS', name:'IMPS', category:'Bank', active:true},
    {id:'PM-UPI', code:'UPI', name:'UPI', category:'Bank', active:true},
    {id:'PM-CARD', code:'CARD', name:'Card', category:'Bank', active:true}
  ],
  glDocumentTypes: [
    {code:'JE', label:'Journal Voucher', prefix:'JV', nextSeq:1},
    {code:'INV', label:'Sales Invoice', prefix:'INV', nextSeq:1},
    {code:'PO', label:'Purchase Order', prefix:'PO', nextSeq:1},
    {code:'RCPT', label:'Customer Receipt', prefix:'RCPT', nextSeq:1},
    {code:'PAY', label:'Vendor Payment', prefix:'PAY', nextSeq:1},
    {code:'CN', label:'Credit Note', prefix:'CN', nextSeq:1},
    {code:'DN', label:'Debit Note', prefix:'DN', nextSeq:1},
    {code:'BILL', label:'Supplier Bill', prefix:'BILL', nextSeq:1},
    {code:'CLR', label:'Clearing Document', prefix:'CLR', nextSeq:1},
    {code:'QTN', label:'Quotation', prefix:'QTN', nextSeq:1},
    {code:'MR', label:'Material Request', prefix:'MR', nextSeq:1},
    {code:'RFQ', label:'RFQ', prefix:'RFQ', nextSeq:1},
    {code:'GRN', label:'Goods Receipt Note', prefix:'GRN', nextSeq:1},
    {code:'PRET', label:'Purchase Return', prefix:'PRET', nextSeq:1},
    {code:'SCN', label:'Supplier Credit Note', prefix:'SCN', nextSeq:1},
    {code:'PROD', label:'Production Order', prefix:'PROD', nextSeq:1},
    {code:'ISS', label:'Material Issue', prefix:'ISS', nextSeq:1},
    {code:'DSP', label:'Dispatch', prefix:'DSP', nextSeq:1},
    {code:'DLV', label:'Delivery Confirmation', prefix:'DLV', nextSeq:1},
    {code:'INST', label:'Installation', prefix:'INST', nextSeq:1},
    {code:'QCK', label:'QC Checklist', prefix:'QCK', nextSeq:1},
    {code:'SNG', label:'Snag', prefix:'SNG', nextSeq:1},
    {code:'HO', label:'Handover', prefix:'HO', nextSeq:1},
    {code:'WAR', label:'Warranty', prefix:'WAR', nextSeq:1},
    {code:'CMP', label:'Complaint', prefix:'CMP', nextSeq:1},
    {code:'TKT', label:'Service Ticket', prefix:'TKT', nextSeq:1},
    {code:'VIS', label:'Service Visit', prefix:'VIS', nextSeq:1},
    {code:'AMC', label:'AMC Contract', prefix:'AMC', nextSeq:1},
    {code:'CAPA', label:'CAPA Case', prefix:'CAPA', nextSeq:1},
    // Phase 14 — added directly to SEED (not just the migration-guard patch below), so a FRESH
    // seed (resetToFreshSeed / first-ever run) gets these too. DEFECT FOUND & FIXED: the first
    // version only patched an EXISTING db.json via the migration guard, leaving nextDocNumber()
    // returning null (no voucher number) for these types on any freshly-reset database.
    {code:'ITR', label:'Inventory Transfer', prefix:'ITR', nextSeq:1},
    {code:'IADJ', label:'Inventory Adjustment', prefix:'IADJ', nextSeq:1},
    {code:'JT', label:'Journal Template', prefix:'JT', nextSeq:1},
    {code:'REC', label:'Recurring Entry', prefix:'REC', nextSeq:1},
    {code:'FA', label:'Fixed Asset', prefix:'FA', nextSeq:1},
    {code:'OB', label:'Opening Balance', prefix:'OB', nextSeq:1},
    {code:'BXFR', label:'Bank/Cash Transfer', prefix:'BXFR', nextSeq:1},
    {code:'SDN', label:'Supplier Debit Note', prefix:'SDN', nextSeq:1},
    {code:'DMG', label:'Damage Report', prefix:'DMG', nextSeq:1},
    {code:'SCT', label:'Stock Count', prefix:'SCT', nextSeq:1},
    {code:'LBR', label:'Labour Wages', prefix:'LBR', nextSeq:1},
    {code:'PEXP', label:'Project Expense', prefix:'PEXP', nextSeq:1},
    {code:'JC', label:'Job Card', prefix:'JC', nextSeq:1},
    // Phase 33 — Finance SOP compliance document types
    {code:'PR', label:'Purchase Requisition', prefix:'PR', nextSeq:1},
    {code:'MRS', label:'Material Requisition Slip (Site)', prefix:'MRS', nextSeq:1},
    {code:'DC', label:'Delivery Challan', prefix:'DC', nextSeq:1},
    {code:'SMR', label:'Site Material Receipt', prefix:'SMR', nextSeq:1},
    {code:'PCV', label:'Petty Cash Voucher', prefix:'PCV', nextSeq:1},
    {code:'PCF', label:'Petty Cash Float', prefix:'PCF', nextSeq:1},
    // Phase 34 — Job Work / APOB + ITC reversal document types.
    {code:'JWO', label:'Job Work Order', prefix:'JWO', nextSeq:1},
    {code:'EWB', label:'E-way Bill Record', prefix:'EWB', nextSeq:1},
    {code:'ITCR', label:'ITC Reversal', prefix:'ITCR', nextSeq:1}
  ]
};
// Real Appletree supplier-master detail, additive to the existing 10 vendors (§7) —
// bank details deliberately masked/partial, matching the field-security requirement (§38)
// this data itself must satisfy: nothing here should be sent to an unauthorized client.
const VENDOR_MASTER_DETAIL = {
  'VEND-1':{gstNumber:'32AABCP1234A1Z5', paymentTerms:'30 days', bankAccountLast4:'4521', category:'Panel/Board'},
  'VEND-2':{gstNumber:'32AABCX5678B1Z2', paymentTerms:'15 days', bankAccountLast4:'7788', category:'Hardware'},
  'VEND-3':{gstNumber:'32AABCK9012C1Z8', paymentTerms:'30 days', bankAccountLast4:'3390', category:'Glass/Aluminium'},
  'VEND-4':{gstNumber:'32AABCV3456D1Z1', paymentTerms:'45 days', bankAccountLast4:'1102', category:'Panel/Board'},
  'VEND-5':{gstNumber:'32AABCM7890E1Z9', paymentTerms:'30 days', bankAccountLast4:'6654', category:'Hardware'},
  'VEND-6':{gstNumber:'32AABCS1122F1Z4', paymentTerms:'15 days', bankAccountLast4:'8899', category:'Labour/Services'},
  'VEND-7':{gstNumber:'32AABCP3344G1Z7', paymentTerms:'15 days', bankAccountLast4:'2233', category:'Labour/Services'},
  'VEND-8':{gstNumber:'32AABCE5566H1Z3', paymentTerms:'7 days', bankAccountLast4:'5577', category:'Transport'},
  'VEND-9':{gstNumber:'32AABCP7788I1Z6', paymentTerms:'45 days', bankAccountLast4:'9911', category:'Hardware'},
  'VEND-10':{gstNumber:'32AABCC9900J1Z0', paymentTerms:'15 days', bankAccountLast4:'4433', category:'Transport'}
};

// Phase 6B addition: 'Estimator' is a new row, added because the CRM/costing process
// genuinely needs a role distinct from Sales (can build costing, cannot post/approve/pay) —
// per the brief's own §29. Every existing role's row is byte-for-byte unchanged from Phase 6A.
// Phase 33 addition: 'SiteInCharge' — the Finance SOP repeatedly names this as a distinct
// authority from Purchase/ProjectManager (raises/approves site-level MRS and petty purchases
// within threshold, cannot approve above-threshold spend, cannot post/pay) — same "add only when
// genuinely needed" discipline as Estimator in Phase 6B. Every existing role's row is unchanged.
const ROLES = ['Admin','CEO','Accountant','FinanceManager','ProjectManager','Purchase','Sales','Estimator','SiteInCharge','Viewer'];
const ROLE_ACTIONS = {
  Admin:          {view:true, create:true,  edit:true,  submit:true,  approve:true,  post:true,  reverse:true,  clear:true,  pay:true,  masterData:true,  export:true,  configure:true},
  CEO:            {view:true, create:true,  edit:true,  submit:true,  approve:true,  post:true,  reverse:true,  clear:true,  pay:true,  masterData:true,  export:true,  configure:true},
  Accountant:     {view:true, create:true,  edit:true,  submit:true,  approve:false, post:false, reverse:false, clear:true,  pay:false, masterData:false, export:true,  configure:false},
  FinanceManager: {view:true, create:true,  edit:true,  submit:true,  approve:true,  post:true,  reverse:true,  clear:true,  pay:true,  masterData:false, export:true,  configure:false},
  ProjectManager: {view:true, create:false, edit:false, submit:false, approve:false, post:false, reverse:false, clear:false, pay:false, masterData:false, export:true,  configure:false},
  Purchase:       {view:true, create:true,  edit:true,  submit:true,  approve:false, post:false, reverse:false, clear:false, pay:false, masterData:false, export:true,  configure:false},
  Sales:          {view:true, create:true,  edit:true,  submit:true,  approve:false, post:false, reverse:false, clear:false, pay:false, masterData:false, export:true,  configure:false},
  Estimator:      {view:true, create:true,  edit:true,  submit:true,  approve:false, post:false, reverse:false, clear:false, pay:false, masterData:false, export:true,  configure:false},
  SiteInCharge:   {view:true, create:true,  edit:true,  submit:true,  approve:false, post:false, reverse:false, clear:false, pay:false, masterData:false, export:true,  configure:false},
  Viewer:         {view:true, create:false, edit:false, submit:false, approve:false, post:false, reverse:false, clear:false, pay:false, masterData:false, export:false, configure:false}
};
// Phase 24 §5/§6 — moved here (from server.js) so the two highest-risk functions in the system,
// postDraft() and reverseEntry(), can enforce their OWN base permission internally instead of
// relying solely on the route layer remembering to call it — exactly the class of gap the Phase 23
// duplicate-door finding exposed for createMaterialIssue(). server.js keeps a local
// `const can = D.can;` alias so its 99 existing call sites are unchanged.
function can(actor, action){ return !!(ROLE_ACTIONS[actor.role] && ROLE_ACTIONS[actor.role][action]); }

// ---------- Phase 6B: business-process enums (one place, not scattered through UI) ----------
const LEAD_STATUSES = ['NEW','CONTACTED','QUALIFIED','ESTIMATION','QUOTATION','NEGOTIATION','WON','LOST','ON HOLD'];
const ESTIMATION_STATUSES = ['DRAFT','SUBMITTED','IN PROGRESS','COMPLETED','CANCELLED'];
const QUOTATION_STATUSES = ['Draft','Submitted','PendingApproval','Approved','Sent','Accepted','Rejected','Superseded'];
const PROJECT_STATUSES = ['DRAFT','PLANNED','ACTIVE','ON HOLD','COMPLETED','CLOSED'];
const DESIGN_STATUSES = ['Submitted','UnderReview','Approved','RevisionRequested'];
// Discount approval thresholds — REAL, not invented: sourced from the Discovery Report §2.7 /
// BOS Manual §1.6 policy already discovered and approved in the live ERP for QuotationDiscount
// (≤5% no approval, ≤10% Accounts-tier, above that CEO). "Accounts" in the live ERP's role model
// maps to this Lab's FinanceManager (the finance-approval-tier role). This is data-driven and
// editable via DB.discountApprovalRules, not hardcoded into UI/business-logic code, per §13/§34.
const DEFAULT_DISCOUNT_APPROVAL_RULES = [
  {id:'DAR-1', upToPct:5, requiredRole:null, sourceNote:'BOS §1.6 — no approval required'},
  {id:'DAR-2', upToPct:10, requiredRole:'FinanceManager', sourceNote:'BOS §1.6 — Accounts-tier, mapped to FinanceManager in this Lab'},
  {id:'DAR-3', upToPct:null, requiredRole:'CEO', sourceNote:'BOS §1.6 — unlimited discount requires CEO'}
];
// Same real, cited BOS §1.6 policy already discovered for PO approval in the original
// Discovery Report §2.7 (not invented — the live ERP's own DOA rules): ≤500,000 no approval,
// ≤2,000,000 Accounts-tier (→FinanceManager in this Lab), above that CEO.
const DEFAULT_PO_APPROVAL_RULES = [
  {id:'PAR-1', upToAmount:500000, requiredRole:null, sourceNote:'BOS §1.6 — no approval required'},
  {id:'PAR-2', upToAmount:2000000, requiredRole:'FinanceManager', sourceNote:'BOS §1.6 — Accounts-tier'},
  {id:'PAR-3', upToAmount:null, requiredRole:'CEO', sourceNote:'BOS §1.6 — unlimited requires CEO'}
];
const MR_STATUSES = ['DRAFT','SUBMITTED','APPROVED','REJECTED','CONVERTED'];
const PO_STATUSES = ['Draft','Submitted','Approved','PartiallyReceived','FullyReceived','Closed','Cancelled'];
const GRN_TOLERANCE_PCT = 0; // Phase 13 POL-03 (approved): STRICT 0% — a deliberate, tested, permanent policy, not a placeholder. Kept as a hard constant (not admin-editable via the config screen) precisely because the approved policy is "enforce server-side, do not rely on UI validation" — a runtime-toggleable value would undercut that.
// Phase 8 enums — carried forward, unchanged Phase 7 policy decisions (§36): inventory
// valuation stays Moving Average, over-receipt tolerance stays 0%. Neither is touched here.
const PROD_STATUSES = ['Draft','Released','InProgress','PartiallyCompleted','Completed','Closed','OnHold','Cancelled'];
const DISPATCH_STATUSES = ['Draft','Ready','Approved','Dispatched','Delivered','Cancelled'];
const INSTALLATION_STATUSES = ['Planned','InProgress','Completed','OnHold'];
const QC_STATUSES = ['Pending','InProgress','Passed','Failed'];
const SNAG_STATUSES = ['Open','Assigned','InProgress','Resolved','Verified','Closed'];
const SNAG_SEVERITIES = ['Critical','Major','Minor'];
const MILESTONE_TYPES = ['Advance','Production','Dispatch','Delivery','Installation','Handover','FinalBilling'];
// GL/financial-statement visibility is its own scope, separate from action permissions —
// Sales/Purchase/ProjectManager/Viewer can operate their own module without seeing the
// company's full General Ledger, bank balances, or cross-project financials (§11/§19 of brief).
const GL_VISIBLE_ROLES = new Set(['Admin','CEO','Accountant','FinanceManager']);

const { hashPassword, verifyPassword } = require('./auth');

const SEED_USERS = [
  {id:'U-ADMIN', username:'admin', name:'System Administrator', role:'Admin', active:true, password:'Admin@12345'},
  {id:'U-CEO', username:'ceo', name:'CEO — Appletree Interiors', role:'CEO', active:true, password:'Ceo@12345'},
  {id:'U-ACC1', username:'accountant1', name:'Divya (Accountant)', role:'Accountant', active:true, password:'Acc@12345'},
  {id:'U-FIN1', username:'finance1', name:'Rajan (Finance Manager)', role:'FinanceManager', active:true, password:'Fin@12345'},
  {id:'U-PM1', username:'pm1', name:'Sunil (Project Manager)', role:'ProjectManager', active:true, password:'Pm@123456', assignedProjects:['PRJ-1','PRJ-3']},
  {id:'U-PUR1', username:'purchase1', name:'Anitha (Purchase)', role:'Purchase', active:true, password:'Pur@12345'},
  {id:'U-SALES1', username:'sales1', name:'Vinod (Sales)', role:'Sales', active:true, password:'Sal@123456', assignedCustomers:['CUST-1','CUST-2','CUST-3']},
  {id:'U-SALES2', username:'sales2', name:'Meera (Sales)', role:'Sales', active:true, password:'Sal2@12345', assignedCustomers:['CUST-4','CUST-5']},
  {id:'U-EST1', username:'estimator1', name:'Arjun (Estimator)', role:'Estimator', active:true, password:'Est@12345'},
  {id:'U-SITE1', username:'site1', name:'Manoj (Site In-charge)', role:'SiteInCharge', active:true, password:'Site@12345'},
  {id:'U-VIEW1', username:'viewer1', name:'Read-Only User', role:'Viewer', active:true, password:'View@1234'},
  // Phase 36 §4/§5 — dedicated UAT credential set, distinct from the phase-numbered test users
  // above (which stay for automated regression). Clearly-named, temporary passwords only, never
  // real staff credentials. This Lab has no separate "Store" or "Factory" role in its role model
  // (Warehouse/Store operations are Purchase-gated; Factory/MES screens are Purchase/ProjectManager-
  // gated) — rather than inventing two new roles purely to match a naming convenience, uat_store
  // and uat_factory are mapped to the closest existing real role, documented here and in the UAT
  // guide, not silently substituted.
  {id:'U-UAT-ADMIN', username:'uat_admin', name:'UAT Administrator', role:'Admin', active:true, password:'Uat@Admin1'},
  {id:'U-UAT-CEO', username:'uat_ceo', name:'UAT CEO', role:'CEO', active:true, password:'Uat@Ceo123'},
  {id:'U-UAT-FIN', username:'uat_finance', name:'UAT Finance Manager', role:'FinanceManager', active:true, password:'Uat@Fin123'},
  {id:'U-UAT-ACC', username:'uat_accountant', name:'UAT Accountant', role:'Accountant', active:true, password:'Uat@Acc123'},
  {id:'U-UAT-PUR', username:'uat_purchase', name:'UAT Purchase', role:'Purchase', active:true, password:'Uat@Pur123'},
  {id:'U-UAT-SITE', username:'uat_site', name:'UAT Site In-charge', role:'SiteInCharge', active:true, password:'Uat@Site123'},
  {id:'U-UAT-STORE', username:'uat_store', name:'UAT Store (mapped to Purchase role — no separate Store role exists)', role:'Purchase', active:true, password:'Uat@Store123'},
  {id:'U-UAT-PM', username:'uat_project', name:'UAT Project Manager', role:'ProjectManager', active:true, password:'Uat@Proj123', assignedProjects:['PRJ-1','PRJ-2','PRJ-3']},
  {id:'U-UAT-FACTORY', username:'uat_factory', name:'UAT Factory (mapped to Purchase role — no separate Factory role exists)', role:'Purchase', active:true, password:'Uat@Fact123'},
  {id:'U-UAT-SALES', username:'uat_sales', name:'UAT Sales', role:'Sales', active:true, password:'Uat@Sales123', assignedCustomers:['CUST-1','CUST-2','CUST-3']}
];

function nowIso(){ return new Date().toISOString(); }

function freshDB(){
  const users = SEED_USERS.map(u=>{
    const {hash, salt} = hashPassword(u.password);
    return { id:u.id, username:u.username, name:u.name, role:u.role, active:u.active,
      assignedProjects:u.assignedProjects||null, assignedCustomers:u.assignedCustomers||null,
      passwordHash:hash, passwordSalt:salt, failedLoginCount:0, lockedUntil:null, mustChangePassword:false };
  });
  return {
    ...JSON.parse(JSON.stringify(SEED)),
    // Phase 21 §7/§8 — every fresh-seeded material gets explicit "no conversion" UoM defaults
    // (purchaseUom = its own base uom, factor = 1), same as createMaterialMaster() and the
    // legacy-DB migration backfill above, so freshDB()/resetToFreshSeed() behave identically
    // rather than silently relying on undefined-defaults-to-1 fallbacks scattered in call sites.
    materials: JSON.parse(JSON.stringify(SEED.materials)).map(m=>({...m, purchaseUom:m.purchaseUom||m.uom, purchaseConversionFactor:m.purchaseConversionFactor||1})),
    journalEntries: [], jeDrafts: [], purchaseOrders: [], clearings: [], auditLog: [],
    users, loginHistory: [],
    // Phase 42 — Idempotency-Key store. See checkIdempotencyKey()/recordIdempotencyKey() below.
    idempotencyKeys: [],
    // Phase 6B business-process collections
    leads: [], leadActivities: [], estimationRequests: [], costingVersions: [], quotations: [],
    acceptances: [], designs: [], changeRequests: [], standardCostBaselines: [],
    discountApprovalRules: JSON.parse(JSON.stringify(DEFAULT_DISCOUNT_APPROVAL_RULES)),
    // Phase 19 §5 — Customer GSTIN: OPTIONAL, starts null for every seeded customer. No real
    // GSTIN value is ever invented — only entered later by an authorized user via setCustomerGSTIN().
    customers: JSON.parse(JSON.stringify(SEED.customers)).map(c=>({...c, active:true, salesOwnerId:null, createdFromLeadId:null, createdFromQuotationId:null, createdAt:null, createdBy:null, gstin:null, state:null})),
    vendors: JSON.parse(JSON.stringify(SEED.vendors)).map(v=>({...v, active:true, ...(VENDOR_MASTER_DETAIL[v.id]||{})})),
    // Phase 7 collections
    materialRequirements: [], materialRequests: [], rfqs: [], supplierQuotations: [], supplierComparisons: [],
    purchaseOrders: [], grns: [], inventoryMovements: [], threeWayMatchExceptions: [],
    purchaseReturns: [], supplierCreditNotes: [], supplierDebitNotes: [], commitments: [], boms: [], productionOrders: [],
    excessMaterialIssueRequests: [], excessBillingApprovals: [],
    poApprovalRules: JSON.parse(JSON.stringify(DEFAULT_PO_APPROVAL_RULES)),
    // Phase 8 collections
    dispatches: [], deliveries: [], installations: [], qcChecklists: [], snags: [], handovers: [], billingMilestones: [],
    // Phase 10 — After-Sales collections
    warranties: [], complaints: [], serviceTickets: [], serviceVisits: [], amcContracts: [], amcSchedules: [], capaCases: [],
    // Phase 13 — Approved Policy Implementation collections
    serviceLabourRates: [],
    // §14 Policy Configuration — admin-editable, audited, versioned (history array). Defaults
    // are the values management explicitly approved this phase, not invented ones.
    // Phase 21 §2 — Future-Dated Posting Control. maxFuturePostingDays is a PROPOSED default,
    // not an approved Appletree business policy — explicitly flagged via
    // maxFuturePostingDaysApproved:false so every consumer of this config (API, UI) can see the
    // number has not been signed off, rather than only a source-code comment nobody outside this
    // file would ever read.
    policyConfig: { warrantyApprovalThreshold:10000, slaResponseHours:4, slaVisitHours:72, slaWarningThresholdHours:null,
      maxFuturePostingDays:550, maxFuturePostingDaysApproved:false, history:[] },
    // Phase 14 — SAP-style accounting entry architecture
    customerCreditNotes: [], customerDebitNotes: [], inventoryTransfers: [], inventoryAdjustments: [],
    attachments: [], journalTemplates: [], recurringEntries: [], importBatches: [],
    // Phase 15 §3 — Profit Centre master: DELIBERATELY EMPTY. Unlike Branch (where the CEO's
    // screenshot evidenced one real value, "Ulliyeri"), no real Appletree profit-centre value has
    // ever been supplied in this engagement. Seeding even one invented row would violate the
    // explicit "do NOT invent arbitrary profit centres" instruction — the master exists and is
    // fully wired (create/search/assign/report/audit), but starts with zero rows until
    // management defines real values via the Profit Centres screen.
    profitCentres: [],
    // Phase 15 §5 — Bank Account master, seeded with the ONE real account evidenced in the CEO's
    // own screenshot ("ICICI Areekkad A/c No.249005001112"), same evidence-only discipline as
    // Branch in Phase 14. No other bank account is invented.
    bankAccounts: JSON.parse(JSON.stringify(SEED.bankAccounts)),
    bankStatementLines: [],
    // Phase 18 §2 — Financial Period master. DELIBERATELY EMPTY on a fresh seed: no real Appletree
    // period calendar has ever been supplied, and per §1 "do not alter historical accounting data
    // merely to implement this," a date with no matching period record is simply unrestricted
    // (open-by-default) — periods are an opt-in gate, not a retroactive block on every pre-Phase-18
    // transaction. Each period's `overrideRole` field starts null (nobody may post into it once
    // closed) — see the MANAGEMENT DECISION REQUIRED note in the Phase 18 report; this is NOT an
    // invented role default, it is the explicit absence of one.
    financialPeriods: [],
    // Phase 19 §26 — Fixed Assets. Real, empty until real assets exist — nothing invented.
    fixedAssets: [], assetClasses: [],
    // Phase 19 §7-19 — ICICI Bank Import. Batches = one row per statement import attempt
    // (duplicate-detection scope); Lines = every parsed transaction, independent of `bankStatementLines`
    // (the existing Phase 15 generic CSV mechanism, untouched) since this is a richer, ICICI-specific
    // pipeline with its own status lifecycle (Imported/Matched/Unmatched/PartiallyMatched/Reconciled/
    // Posted/Excluded/Returned/Duplicate/Error).
    bankImportBatches: [], bankImportLines: [],
    // Phase 20 §4/§7 — Master Data Import Framework + Opening Balance Engine. Real, empty until
    // the accounts team actually imports something — nothing invented.
    masterImportBatches: [], openingBalanceBatches: [], openingBalanceLines: [],
    // Phase 28 — operational modules that exist in the mature offline ERP but had no counterpart
    // here (Purchases Intelligence / Inventory Operations / Operations / Factory-MES). All real,
    // empty until real activity exists — same "never invent starting rows" discipline as every
    // other master above.
    damageReports: [], locations: [], stockCounts: [], labourWages: [], projectExpenses: [], reportVariants: [],
    timesheetEntries: [], tasks: [], riskRegister: [], weeklySnapshots: [], machines: [], jobCards: [],
    // Phase 33 — Finance SOP compliance. All real, empty until real activity exists.
    purchaseRequisitions: [], sites: [], siteMaterialRequisitions: [], deliveryChallans: [],
    siteMaterialReceipts: [], siteReturns: [], pettyCashFloats: [], pettyCashVouchers: [], tdsDeductions: [],
    cashControlExceptions: [], paymentApprovals: [],
    // Phase 33 — Finance SOP company-level configuration. Deliberately empty/false/null until
    // Appletree supplies real values — never invented. See PHASE33_SOP_COMPLIANCE_MATRIX.md.
    companyGSTConfig: { newGSTIN: null, oldGSTIN: null, gstinConfirmedBy: null, gstinConfirmedAt: null,
      companyState: null, turnoverExceeds10CrPrecedingFY: null },
    tdsConfig: {
      // Rates/thresholds are the Finance SOP's OWN stated values (Section 3 of the SOP), not
      // independently re-verified current tax law — see Part 50's disclaimer, surfaced verbatim
      // via the /api/tds-config route and the Compliance Dashboard.
      goods: { thresholdPerSellerFY:5000000, ratePct:0.1, noPanRatePct:5, active:true },
      contractorJobWork: { singleBillThreshold:30000, aggregateFYThreshold:100000, rateIndividualHUFPct:1, rateOtherPct:2, active:true },
      transport: { singleBillThreshold:30000, aggregateFYThreshold:100000, rateIndividualHUFPct:1, rateOtherPct:2, exemptionRequiresPanAndDeclaration:true, maxCarriagesForExemption:10, active:true },
      professional: { thresholdPerAnnum:50000, ratePct:10, technicalServicesRatePct:2, active:true },
      rent: { thresholdPerAnnum:600000, rateLandBuildingPct:10, ratePlantMachineryPct:2, active:true },
      commission: { thresholdFY:15000, ratePct:5, active:true, note:'SOP itself says "verify current threshold" — TAX REVIEW REQUIRED' },
      approvedByFinance:false
    },
    cashLimits: {
      // SOP Section 4 — exact figures as stated. Not independently re-verified as current
      // Income Tax Act thresholds (Sections 40A(3)/269SS/269T/269ST) by this engagement.
      dailyExpensePerPerson:10000, dailyTransporterExpense:35000,
      loanDepositReceived:20000, loanDepositRepaid:20000, cashReceiptAggregate:200000,
      approvedByFinance:false
    },
    purchaseApprovalConfig: {
      // SOP Section 1 — centralized-purchase threshold. NOTE: this conflicts with the pre-existing
      // BOS §1.6-derived PO approval thresholds already configured elsewhere in this Lab — see
      // PHASE33_SOP_COMPLIANCE_MATRIX.md Gap 15. Both are surfaced, neither silently overrides
      // the other; Appletree must reconcile which governs.
      centralizedThreshold:25000, sitePettyDailyLimit:5000, sopThresholdApprovedByFinance:false, requirePRForPO:false,
      // Phase 34 — additive fields closing PHASE33_SOP_GAP_REGISTER.md Gap 15's own missing pieces
      // (approving/escalation roles), still NOT finalising the conflict itself.
      centralPurchaseApprovingRole:null, siteApprovingRole:'SiteInCharge', escalationRole:'FinanceManager', status:'POLICY NOT FINALISED'
    },
    // Project Variation Phase 7 §3/§4 — no equivalent configuration object existed anywhere in this
    // codebase before this phase (confirmed by inspection — this is a NEW config surface, not a
    // rename of an existing one). Same shape/discipline as purchaseApprovalConfig immediately above:
    // every flag defaults false, so today's behavior is COMPLETELY unchanged; each flag, if ever
    // flipped true by an authorized future decision, makes changeRequestId mandatory at exactly the
    // ONE mutation point it names — no UI-only restriction, no hidden default-on. Only the "require
    // it everywhere on this project scope" variant is implementable today (see the accompanying
    // report §C) — "REQUIRED_FOR_VARIATION" specifically has no independent signal in this data model
    // for what makes a document "variation work" other than the very tag being made mandatory, so
    // that specific policy state is left explicitly unbuilt, not guessed at.
    variationTaggingPolicy: {
      bomRequireCR:false, materialRequirementRequireCR:false, purchaseOrderRequireCR:false,
      // Project Variation Phase 11 — project-aware extension, added alongside the Phase 7 blunt
      // flags above (kept, unmodified, for backward compatibility — NOT the recommended path per
      // Phase 10's own finding that they block ALL baseline BOM/PO project-wide). `enabled` is the
      // master switch for this newer mechanism; `purchaseOrderRequireCRForVariation` only blocks a
      // PO whose OWN upstream chain already, independently proves variation lineage (see
      // createPurchaseOrder()) — it never blocks a PO with no such chain, so baseline work on a
      // mixed (variation-active) project is never touched by it. Deliberately NO
      // "bomRequireCRForVariation" key: a BOM is the ROOT of the traceability chain, so there is no
      // upstream signal to detect "this BOM should have inherited a CR but didn't" the way there is
      // for PO — building one would necessarily either reproduce Phase 7's blunt "every BOM"
      // behavior (scoped to a smaller project set) or require inventing a new non-CR intent signal,
      // neither of which this phase was authorized to do. See report §22 (Architecture Gaps).
      enabled:false, purchaseOrderRequireCRForVariation:false,
      status:'POLICY NOT CONFIGURED — every flag OFF; no management decision exists yet (see report §C/§AC/§Phase11)'
    },
    paymentApprovalMatrix: {
      // SOP Section 9.1 — the SOP's OWN table itself is headed "To Be Finalised — calibrate to
      // Board-approved DOA." NEVER treated as final policy — finalised:false always shown.
      // Phase 36 — a real Draft->Review->Approved workflow (was permanently un-finalizable
      // before this phase); `finalised` only ever becomes true through the explicit, evidenced
      // approvePaymentApprovalMatrix() action below, never as a side effect of editing tiers.
      tiers: [ {upTo:5000, role:'Accountant'}, {upTo:100000, role:'Purchase Head (Purchase role)'}, {upTo:null, role:'Director (CEO)'} ],
      finalised:false, status:'Draft', approvedBy:null, approvedDate:null, approvalReference:null, version:1
    },
    // Phase 12 — PO Approval Authority Matrix. This does NOT replace poApprovalRules/
    // requiredPOApprovalRole() above — those remain the sole, authoritative, BOS §1.6-sourced
    // answer to "which role TIER is required to approve a PO of this amount" and are untouched.
    // This is a narrower, SEPARATE question those rules never answered: "if the required
    // approver is also the PO's own creator, may they approve their own PO, and up to what
    // amount?" (Phase 11 P0 finding: live-proven, a single Admin account created AND approved
    // its own ₹30L PO). Two distinct concepts are deliberately kept apart per the Phase 12 brief:
    //   - financialApprovalAuthority: does this role have PO approval authority AT ALL beyond
    //     its own required tier (e.g. Admin standing in for an absent CEO)? Defaults FALSE for
    //     Admin — System Administration Authority (the generic ROLE_ACTIONS.Admin.approve=true
    //     used broadly elsewhere in this codebase for unrelated approvals) is NEVER treated as
    //     automatic Financial Approval Authority for Purchase Orders specifically. If Admin is
    //     ever genuinely granted this by the business, it is done here, explicitly, auditably —
    //     never inferred from the Admin role itself.
    //   - selfApprovalAllowed / selfApprovalLimit: may this role approve a PO IT ITSELF created,
    //     and up to what rupee amount? No such figure exists anywhere in this Lab's sourced
    //     business documents (BOS/SOP) — inventing one was explicitly forbidden by the Phase 12
    //     brief. selfApprovalLimit is left null (NOT FINALISED) for every role below. Until a
    //     human finalises a real number through the governance workflow beneath this object
    //     (setPOApprovalAuthorityMatrix -> submit for review -> approvePOApprovalAuthorityMatrix,
    //     mirroring paymentApprovalMatrix's own Draft->Review->Approved pattern exactly), the SAFE
    //     DEFAULT applies everywhere self-approval is checked: self-approval is BLOCKED for any
    //     PO that reaches a required-approval tier at all (i.e. any PO above the one real, sourced
    //     "no approval needed" cutover, poApprovalRules' own ₹500,000 line) — a routine PO within
    //     that no-approval band was never a self-approval question to begin with, since it
    //     auto-approves with no separate approval action. This is NOT a guessed threshold; it is
    //     the existing authoritative boundary, used as the conservative default until Appletree
    //     supplies a real self-approval figure.
    poApprovalAuthorityMatrix: {
      roles: {
        CEO:            { financialApprovalAuthority:true,  selfApprovalAllowed:true,  selfApprovalLimit:null },
        FinanceManager: { financialApprovalAuthority:true,  selfApprovalAllowed:true,  selfApprovalLimit:null },
        Purchase:       { financialApprovalAuthority:false, selfApprovalAllowed:false, selfApprovalLimit:null },
        Admin:          { financialApprovalAuthority:false, selfApprovalAllowed:false, selfApprovalLimit:null }
      },
      finalised:false,
      status:'Draft — self-approval limits NOT YET SET (MANAGEMENT DECISION REQUIRED, Phase 12 §1); until finalised, self-approval is blocked for any PO requiring approval (i.e. above the existing ₹500,000 no-approval threshold) and Admin has no Purchase Order financial approval authority',
      approvedBy:null, approvedDate:null, approvalReference:null, version:1
    },
    pettyCashDefaultFloat: 10000,
    weighmentTolerancePct: 1,
    // Phase 34 — Job Work / APOB / E-way Bill / ITC reversal. All real, empty until real activity
    // exists — same discipline as every other master above.
    jobWorkers: [], jobWorkOrders: [], jobWorkScrapRecords: [], jobWorkExtensions: [], apobDeclarations: [], ewayBills: [],
    // SOP §2 — Ship-to GSTIN mandatory "from 1 August 2026 onward." Kept CONFIGURABLE (never a
    // hardcoded unconditional `true`) so the effective date itself is a real, auditable setting,
    // not an assumption baked into the code.
    shipToGstinEffectiveDate: '2026-08-01',
    threeWayMatchPolicyConfig: {
      // SOP §9 — "three-way match mandatory before ANY vendor payment," in real tension with
      // service-type vendor payments that structurally have no GRN. Categories with a genuine
      // goods/GRN concept are pre-confirmed; service categories start UNCONFIRMED, surfaced as
      // "PAYMENT CONTROL POLICY REQUIRED" until Finance actively decides the model for each.
      categories: {
        goods: { requiresThreeWayMatch:true, policyConfirmedByFinance:true, note:'PO + GRN + Invoice — standard goods purchase, structurally has a GRN.' },
        jobWork: { requiresThreeWayMatch:true, policyConfirmedByFinance:true, note:'PO + GRN/Job-Work-Return + Invoice.' },
        transportMaterial: { requiresThreeWayMatch:true, policyConfirmedByFinance:true, note:'PO + GRN + Invoice.' },
        rent: { requiresThreeWayMatch:false, policyConfirmedByFinance:false, note:'No GRN concept exists for a service — PAYMENT CONTROL POLICY REQUIRED: Finance to confirm the PO + Service Confirmation + Invoice model, or accept unmatched.' },
        professionalFees: { requiresThreeWayMatch:false, policyConfirmedByFinance:false, note:'Same as rent — no GRN concept for a service.' },
        commission: { requiresThreeWayMatch:false, policyConfirmedByFinance:false, note:'Same as rent.' },
        transportServices: { requiresThreeWayMatch:false, policyConfirmedByFinance:false, note:'Pure freight/service — no GRN.' }
      },
      finalised:false
    }
  };
}

// Phase 21 §3/§4 — crash-safety on load (audit finding: the database was a single file written
// directly, non-atomically, on every save — a crash mid-write could corrupt or truncate the
// ENTIRE database). A leftover .tmp file means a PREVIOUS save was interrupted before its atomic
// rename ever completed — the rename never happened, so db.json itself (never touched by that
// interrupted save) is still the last fully-written state and remains authoritative. The .tmp
// file is never blindly trusted (it may itself be a partial write from the exact moment of a
// crash) — it is only ever discarded, per the brief's explicit "do not blindly use a corrupt
// temporary state" instruction.
function loadDbFromDisk(){
  const tmpFile = DB_FILE + '.tmp';
  if(fs.existsSync(tmpFile)){
    try { fs.unlinkSync(tmpFile); } catch(e){ /* best-effort cleanup only */ }
  }
  if(!fs.existsSync(DB_FILE)) return freshDB();
  try {
    return JSON.parse(fs.readFileSync(DB_FILE,'utf8'));
  } catch(parseErr){
    // Should now be structurally impossible going forward thanks to save()'s atomic rename below,
    // but handled defensively for any db.json that predates this phase or was corrupted by an
    // external process. Recover from the one-save-behind backup rather than silently starting
    // from an empty seed and losing everything without a trace.
    const bakFile = DB_FILE + '.bak';
    if(fs.existsSync(bakFile)){
      try {
        const recovered = JSON.parse(fs.readFileSync(bakFile,'utf8'));
        console.error(`[RECOVERY] db.json was corrupted (${parseErr.message}) — recovered from db.json.bak (one save behind). Investigate the corrupted db.json immediately; it has been left in place, not deleted.`);
        return recovered;
      } catch(bakErr){
        console.error(`[RECOVERY FAILED] Both db.json and db.json.bak are corrupted/unreadable — starting from a fresh seed. THIS IS DATA LOSS. db.json error: ${parseErr.message}; db.json.bak error: ${bakErr.message}`);
        return freshDB();
      }
    }
    console.error(`[RECOVERY FAILED] db.json is corrupted and no db.json.bak exists — starting from a fresh seed. THIS IS DATA LOSS. Error: ${parseErr.message}`);
    return freshDB();
  }
}
// Phase 38 Part C/E — write-point guard scaffolding, declared BEFORE the first DB load since
// installWriteGuards() (a hoisted function) is called immediately below and closes over these
// `const`s, which are NOT hoisted the way function declarations are (TDZ) — they must already be
// initialized by the time installWriteGuards() first runs.
let _txDepth = 0;
// Phase 38 — default is ENFORCE (fail-closed), not audit-only. This was flipped from false to
// true only after: (1) every known GL/inventory/clearing-touching function was censused (Part A/M
// — 5 legacy-routed functions found and migrated onto withTransaction(), the other 36 routes
// already covered via the dispatch-layer wrap), (2) the full Phase 35-37 regression battery (14
// functions) passed with zero regressions under enforce mode, (3) a full legitimate-traffic
// battery (invoices, job-work dispatch/return/scrap, site issue) passed with zero violations. See
// the Phase 38 report for the complete evidence trail. setEnforceTransactionBoundary(false) is
// still available to fall back to audit-only mode if a not-yet-discovered legitimate call path is
// ever found tripping the guard.
let _ENFORCE_TRANSACTION_BOUNDARY = true;
function setEnforceTransactionBoundary(v){ _ENFORCE_TRANSACTION_BOUNDARY = !!v; }
function getEnforceTransactionBoundary(){ return _ENFORCE_TRANSACTION_BOUNDARY; }
const GUARDED_COLLECTIONS = ['journalEntries', 'inventoryMovements', 'clearings'];
const GUARDED_MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice']);

// ERP AUDIT FIX (ERP-005) — claimed BEFORE the first read of db.json below, so the lock itself
// covers the load, not just subsequent saves. See acquireSingleInstanceLock()'s own header comment
// above for full rationale/scope. Skipped only under the test runner's own harness flag (if one is
// ever introduced) — today there is none, so this always runs, including for isolated test copies
// (each in its own directory, with its own db.json.lock — never contending with each other or with
// a real deployment elsewhere).
acquireSingleInstanceLock();
let DB = loadDbFromDisk();
// install write-point guards on the DB right after every load (installWriteGuards is defined
// further below — function declarations are hoisted — but it closes over the consts just above,
// which must be initialized first, hence their placement here rather than next to the function).
DB = installWriteGuards(DB);
// Backward/forward compatible patch, same discipline as the client Lab's own migration guards.
if(!DB.users || !DB.users.length){ const f = freshDB(); DB.users = f.users; }
if(!DB.idempotencyKeys) DB.idempotencyKeys = [];
// Phase 6B additions — patched in for a DB saved before this phase existed, never overwriting
// existing journalEntries/customers/etc.
['leads','leadActivities','estimationRequests','costingVersions','quotations','acceptances','designs','changeRequests','standardCostBaselines'].forEach(k=>{ if(!DB[k]) DB[k]=[]; });
if(!DB.discountApprovalRules) DB.discountApprovalRules = JSON.parse(JSON.stringify(DEFAULT_DISCOUNT_APPROVAL_RULES));
if(!DB.glDocumentTypes.find(d=>d.code==='QTN')) DB.glDocumentTypes.push({code:'QTN', label:'Quotation', prefix:'QTN', nextSeq:1});
// Phase 7 additions — patched in for a DB saved before this phase, nothing existing removed.
[['MR','Material Request'],['RFQ','RFQ'],['GRN','Goods Receipt Note'],['PRET','Purchase Return'],['SCN','Supplier Credit Note'],['PROD','Production Order'],['ISS','Material Issue'],
 ['DSP','Dispatch'],['DLV','Delivery Confirmation'],['INST','Installation'],['QCK','QC Checklist'],['SNG','Snag'],['HO','Handover']]
  .forEach(([code,label])=>{ if(!DB.glDocumentTypes.find(d=>d.code===code)) DB.glDocumentTypes.push({code, label, prefix:code, nextSeq:1}); });
['dispatches','deliveries','installations','qcChecklists','snags','handovers','billingMilestones'].forEach(k=>{ if(!DB[k]) DB[k]=[]; });
if(!DB.accounts.find(a=>a.id==='2050')) DB.accounts.push({id:'2050', name:'GR/IR Clearing', type:'Liability'});
if(!DB.materials) DB.materials = JSON.parse(JSON.stringify(SEED.materials));
DB.materials.forEach(m=>{ if(m.hsnCode===undefined) m.hsnCode=null; });
if(DB.customers) DB.customers.forEach(c=>{
  if(c.gstin===undefined) c.gstin=null;
  // Phase 20 cleanup: migrate any leftover `gstNumber` value (the pre-Phase-19, never-actually-
  // populated-in-practice field) onto the real `gstin` field, then remove the redundant field
  // entirely so the customer record has exactly one GSTIN concept, not two.
  if(c.gstNumber!==undefined){ if(!c.gstin && c.gstNumber) c.gstin = String(c.gstNumber).trim().toUpperCase(); delete c.gstNumber; }
});
if(!DB.warehouses) DB.warehouses = JSON.parse(JSON.stringify(SEED.warehouses));
['materialRequirements','materialRequests','rfqs','supplierQuotations','supplierComparisons','grns','inventoryMovements','threeWayMatchExceptions','purchaseReturns','supplierCreditNotes','boms','productionOrders']
  .forEach(k=>{ if(!DB[k]) DB[k]=[]; });
if(!DB.poApprovalRules) DB.poApprovalRules = JSON.parse(JSON.stringify(DEFAULT_PO_APPROVAL_RULES));
if(DB.vendors) DB.vendors.forEach(v=>{ if(v.gstNumber===undefined) Object.assign(v, {active:true, ...(VENDOR_MASTER_DETAIL[v.id]||{})}); });
// Phase 7 also replaces the Phase-4-era simple `purchaseOrders` shape (no supplier/lines/
// workflow) with the richer version below — any Phase-4 POs in an old DB are harmless leftover
// records (never read by any Phase 7 function) and are not deleted.
if(DB.customers) DB.customers.forEach(c=>{ if(c.active===undefined) c.active=true; if(c.salesOwnerId===undefined) c.salesOwnerId=null; });
if(DB.projects) DB.projects.forEach(p=>{
  if(p.status===undefined) p.status='ACTIVE'; // pre-Phase-6B projects are treated as already-active
  if(p.projectManagerId===undefined) p.projectManagerId=null;
  if(p.salesOwnerId===undefined) p.salesOwnerId=null;
  if(p.quotationId===undefined) p.quotationId=null;
  if(p.leadId===undefined) p.leadId=null;
  if(p.customerId===undefined) p.customerId=null;
  if(p.advanceRequiredAmount===undefined) p.advanceRequiredAmount=null;
});
if(!DB.users.find(u=>u.role==='Estimator')){
  const {hash, salt} = hashPassword('Est@12345');
  DB.users.push({id:'U-EST1', username:'estimator1', name:'Arjun (Estimator)', role:'Estimator', active:true, assignedProjects:null, assignedCustomers:null, passwordHash:hash, passwordSalt:salt, failedLoginCount:0, lockedUntil:null, mustChangePassword:false});
}
// Phase 10 additions — patched in for a DB saved before this phase existed, nothing existing removed.
[['WAR','Warranty'],['CMP','Complaint'],['TKT','Service Ticket'],['VIS','Service Visit'],['AMC','AMC Contract'],['CAPA','CAPA Case']]
  .forEach(([code,label])=>{ if(!DB.glDocumentTypes.find(d=>d.code===code)) DB.glDocumentTypes.push({code, label, prefix:code, nextSeq:1}); });
['warranties','complaints','serviceTickets','serviceVisits','amcContracts','amcSchedules','capaCases','serviceLabourRates'].forEach(k=>{ if(!DB[k]) DB[k]=[]; });
if(!DB.policyConfig) DB.policyConfig = { warrantyApprovalThreshold:10000, slaResponseHours:4, slaVisitHours:72, slaWarningThresholdHours:null, maxFuturePostingDays:550, maxFuturePostingDaysApproved:false, history:[] };
if(DB.policyConfig && DB.policyConfig.maxFuturePostingDays===undefined) DB.policyConfig.maxFuturePostingDays = 550;
if(DB.policyConfig && DB.policyConfig.maxFuturePostingDaysApproved===undefined) DB.policyConfig.maxFuturePostingDaysApproved = false;
// Phase 14 additions — patched in for a DB saved before this phase existed, nothing existing removed.
if(!DB.accounts.find(a=>a.id==='5300')) DB.accounts.push({id:'5300', name:'Inventory Adjustment', type:'Expense'});
if(!DB.branches) DB.branches = JSON.parse(JSON.stringify(SEED.branches));
['customerCreditNotes','customerDebitNotes','inventoryTransfers','inventoryAdjustments','attachments','journalTemplates','recurringEntries','importBatches'].forEach(k=>{ if(!DB[k]) DB[k]=[]; });
[['ITR','Inventory Transfer'],['IADJ','Inventory Adjustment'],['JT','Journal Template'],['REC','Recurring Entry']]
  .forEach(([code,label])=>{ if(!DB.glDocumentTypes.find(d=>d.code===code)) DB.glDocumentTypes.push({code, label, prefix:code, nextSeq:1}); });
// Phase 15 additions — patched in for a DB saved before this phase existed, nothing existing removed.
if(!DB.costCentres.find(c=>c.id==='CC-INSTALLATION')) DB.costCentres.push({id:'CC-INSTALLATION', name:'Installation'});
if(!DB.profitCentres) DB.profitCentres = [];
if(!DB.bankAccounts) DB.bankAccounts = JSON.parse(JSON.stringify(SEED.bankAccounts||[]));
['bankStatementLines'].forEach(k=>{ if(!DB[k]) DB[k]=[]; });
if(DB.projects) DB.projects.forEach(p=>{ if(p.branchId===undefined) p.branchId=null; });
// Phase 18 additions — patched in for a DB saved before this phase existed, nothing existing removed.
if(!DB.financialPeriods) DB.financialPeriods = [];
DB.financialPeriods.forEach(p=>{ if(p.overrideRole===undefined) p.overrideRole=null; });
// Phase 19 additions — patched in for a DB saved before this phase existed, nothing existing removed.
if(!DB.paymentMethods) DB.paymentMethods = JSON.parse(JSON.stringify(SEED.paymentMethods));
// Phase 21 §7/§8 — backfill purchaseUom/purchaseConversionFactor onto every material saved before
// this phase existed, defaulted to "no conversion" (purchaseUom = its own base uom, factor = 1) so
// nothing about any existing material's behavior changes until someone explicitly configures a
// real conversion.
if(DB.materials) DB.materials.forEach(m=>{ if(m.purchaseUom===undefined) m.purchaseUom = m.uom; if(m.purchaseConversionFactor===undefined) m.purchaseConversionFactor = 1; });
if(!DB.supplierDebitNotes) DB.supplierDebitNotes = [];
if(!DB.commitments) DB.commitments = [];
if(!DB.fixedAssets) DB.fixedAssets = [];
if(!DB.assetClasses) DB.assetClasses = [];
if(!DB.bankImportBatches) DB.bankImportBatches = [];
if(!DB.bankImportLines) DB.bankImportLines = [];
if(!DB.glDocumentTypes.find(d=>d.code==='FA')) DB.glDocumentTypes.push({code:'FA', label:'Fixed Asset', prefix:'FA', nextSeq:1});
if(!DB.glDocumentTypes.find(d=>d.code==='OB')) DB.glDocumentTypes.push({code:'OB', label:'Opening Balance', prefix:'OB', nextSeq:1});
// Phase 24 — Bank/Cash Transfer + Supplier Debit Note document types.
if(!DB.glDocumentTypes.find(d=>d.code==='BXFR')) DB.glDocumentTypes.push({code:'BXFR', label:'Bank/Cash Transfer', prefix:'BXFR', nextSeq:1});
if(!DB.glDocumentTypes.find(d=>d.code==='SDN')) DB.glDocumentTypes.push({code:'SDN', label:'Supplier Debit Note', prefix:'SDN', nextSeq:1});
if(!DB.accounts.find(a=>a.id==='3000')) DB.accounts.push({id:'3000', name:'Opening Balance Equity (technical — not a real Appletree account)', type:'Liability'});
if(!DB.openingBalanceBatches) DB.openingBalanceBatches = [];
if(!DB.openingBalanceLines) DB.openingBalanceLines = [];
if(!DB.masterImportBatches) DB.masterImportBatches = [];
if(!DB.accounts.find(a=>a.id==='1400')) DB.accounts.push({id:'1400', name:'Fixed Assets — Cost', type:'Asset'});
if(!DB.accounts.find(a=>a.id==='1450')) DB.accounts.push({id:'1450', name:'Accumulated Depreciation', type:'Asset'});
if(!DB.accounts.find(a=>a.id==='5400')) DB.accounts.push({id:'5400', name:'Depreciation Expense', type:'Expense'});
if(!DB.accounts.find(a=>a.id==='5500')) DB.accounts.push({id:'5500', name:'Gain/Loss on Asset Disposal', type:'Expense'});
// Phase 28 additions — patched in for a DB saved before this phase existed, nothing existing
// removed. Same discipline as every prior phase's migration guard above: `if(!DB[k])`, never
// unconditionally overwriting a key that might already hold real data.
['damageReports','locations','stockCounts','labourWages','projectExpenses','timesheetEntries','tasks','riskRegister','weeklySnapshots','machines','jobCards']
  .forEach(k=>{ if(!DB[k]) DB[k]=[]; });
[['DMG','Damage Report'],['SCT','Stock Count'],['LBR','Labour Wages'],['PEXP','Project Expense'],['JC','Job Card']]
  .forEach(([code,label])=>{ if(!DB.glDocumentTypes.find(d=>d.code===code)) DB.glDocumentTypes.push({code, label, prefix:code, nextSeq:1}); });
// Phase 33 additions — Finance SOP compliance. Patched in for a DB saved before this phase
// existed, nothing existing removed. Same discipline as every prior phase's migration guard
// above: `if(!DB[k])`, never unconditionally overwriting a key that might already hold real data.
['purchaseRequisitions','sites','siteMaterialRequisitions','deliveryChallans','siteMaterialReceipts','siteReturns',
 'pettyCashFloats','pettyCashVouchers','tdsDeductions','cashControlExceptions','paymentApprovals']
  .forEach(k=>{ if(!DB[k]) DB[k]=[]; });
[['PR','Purchase Requisition'],['MRS','Material Requisition Slip (Site)'],['DC','Delivery Challan'],
 ['SMR','Site Material Receipt'],['SRET','Site Return'],['PCV','Petty Cash Voucher'],['PCF','Petty Cash Float']]
  .forEach(([code,label])=>{ if(!DB.glDocumentTypes.find(d=>d.code===code)) DB.glDocumentTypes.push({code, label, prefix:code, nextSeq:1}); });
if(!DB.accounts.find(a=>a.id==='2300')) DB.accounts.push({id:'2300', name:'TDS Payable', type:'Liability'});
if(!DB.companyGSTConfig) DB.companyGSTConfig = { newGSTIN:null, oldGSTIN:null, gstinConfirmedBy:null, gstinConfirmedAt:null, companyState:null, turnoverExceeds10CrPrecedingFY:null };
if(!DB.tdsConfig) DB.tdsConfig = {
  goods: { thresholdPerSellerFY:5000000, ratePct:0.1, noPanRatePct:5, active:true },
  contractorJobWork: { singleBillThreshold:30000, aggregateFYThreshold:100000, rateIndividualHUFPct:1, rateOtherPct:2, active:true },
  transport: { singleBillThreshold:30000, aggregateFYThreshold:100000, rateIndividualHUFPct:1, rateOtherPct:2, exemptionRequiresPanAndDeclaration:true, maxCarriagesForExemption:10, active:true },
  professional: { thresholdPerAnnum:50000, ratePct:10, technicalServicesRatePct:2, active:true },
  rent: { thresholdPerAnnum:600000, rateLandBuildingPct:10, ratePlantMachineryPct:2, active:true },
  commission: { thresholdFY:15000, ratePct:5, active:true, note:'SOP itself says "verify current threshold" — TAX REVIEW REQUIRED' },
  approvedByFinance:false
};
if(!DB.cashLimits) DB.cashLimits = { dailyExpensePerPerson:10000, dailyTransporterExpense:35000, loanDepositReceived:20000, loanDepositRepaid:20000, cashReceiptAggregate:200000, approvedByFinance:false };
if(!DB.purchaseApprovalConfig) DB.purchaseApprovalConfig = { centralizedThreshold:25000, sitePettyDailyLimit:5000, sopThresholdApprovedByFinance:false, requirePRForPO:false };
if(DB.purchaseApprovalConfig && DB.purchaseApprovalConfig.requirePRForPO===undefined) DB.purchaseApprovalConfig.requirePRForPO = false;
// Project Variation Phase 7 — same migration-guard pattern as purchaseApprovalConfig above; the
// live db.json predates this config object, so it needs the same one-time backfill freshDB() gets
// automatically. Every flag defaults false — no behavior changes for any existing installation.
if(!DB.variationTaggingPolicy) DB.variationTaggingPolicy = { bomRequireCR:false, materialRequirementRequireCR:false, purchaseOrderRequireCR:false, enabled:false, purchaseOrderRequireCRForVariation:false, status:'POLICY NOT CONFIGURED — every flag OFF; no management decision exists yet (see report §C/§AC/§Phase11)' };
// Project Variation Phase 11 — migration guard for installations whose db.json predates the two new keys.
if(DB.variationTaggingPolicy.enabled===undefined) DB.variationTaggingPolicy.enabled = false;
if(DB.variationTaggingPolicy.purchaseOrderRequireCRForVariation===undefined) DB.variationTaggingPolicy.purchaseOrderRequireCRForVariation = false;
if(!DB.paymentApprovalMatrix) DB.paymentApprovalMatrix = { tiers:[{upTo:5000, role:'Accountant'}, {upTo:100000, role:'Purchase Head (Purchase role)'}, {upTo:null, role:'Director (CEO)'}], finalised:false, status:'Draft', approvedBy:null, approvedDate:null, approvalReference:null, version:1 };
if(DB.paymentApprovalMatrix && DB.paymentApprovalMatrix.status===undefined) Object.assign(DB.paymentApprovalMatrix, {status: DB.paymentApprovalMatrix.finalised?'Approved':'Draft', approvedBy:null, approvedDate:null, approvalReference:null, version:1});
// Phase 12 — same migration-guard pattern as paymentApprovalMatrix immediately above, for a
// db.json saved before this phase. Safe defaults only (Admin gets no PO financial authority,
// every selfApprovalLimit stays null/not-finalised) — never a side effect that grants authority.
if(!DB.poApprovalAuthorityMatrix) DB.poApprovalAuthorityMatrix = {
  roles: {
    CEO:            { financialApprovalAuthority:true,  selfApprovalAllowed:true,  selfApprovalLimit:null },
    FinanceManager: { financialApprovalAuthority:true,  selfApprovalAllowed:true,  selfApprovalLimit:null },
    Purchase:       { financialApprovalAuthority:false, selfApprovalAllowed:false, selfApprovalLimit:null },
    Admin:          { financialApprovalAuthority:false, selfApprovalAllowed:false, selfApprovalLimit:null }
  },
  finalised:false,
  status:'Draft — self-approval limits NOT YET SET (MANAGEMENT DECISION REQUIRED, Phase 12 §1); until finalised, self-approval is blocked for any PO requiring approval (i.e. above the existing ₹500,000 no-approval threshold) and Admin has no Purchase Order financial approval authority',
  approvedBy:null, approvedDate:null, approvalReference:null, version:1
};
if(DB.pettyCashDefaultFloat===undefined) DB.pettyCashDefaultFloat = 10000;
if(DB.weighmentTolerancePct===undefined) DB.weighmentTolerancePct = 1;
if(!DB.users.find(u=>u.role==='SiteInCharge')){
  const {hash, salt} = hashPassword('Site@12345');
  DB.users.push({id:'U-SITE1', username:'site1', name:'Manoj (Site In-charge)', role:'SiteInCharge', active:true, assignedProjects:null, assignedCustomers:null, passwordHash:hash, passwordSalt:salt, failedLoginCount:0, lockedUntil:null, mustChangePassword:false});
}
// Phase 36 §4/§5 — patch the dedicated UAT credential set into a DB saved before this phase.
[['U-UAT-ADMIN','uat_admin','UAT Administrator','Admin','Uat@Admin1'],
 ['U-UAT-CEO','uat_ceo','UAT CEO','CEO','Uat@Ceo123'],
 ['U-UAT-FIN','uat_finance','UAT Finance Manager','FinanceManager','Uat@Fin123'],
 ['U-UAT-ACC','uat_accountant','UAT Accountant','Accountant','Uat@Acc123'],
 ['U-UAT-PUR','uat_purchase','UAT Purchase','Purchase','Uat@Pur123'],
 ['U-UAT-SITE','uat_site','UAT Site In-charge','SiteInCharge','Uat@Site123'],
 ['U-UAT-STORE','uat_store','UAT Store (mapped to Purchase role)','Purchase','Uat@Store123'],
 ['U-UAT-PM','uat_project','UAT Project Manager','ProjectManager','Uat@Proj123'],
 ['U-UAT-FACTORY','uat_factory','UAT Factory (mapped to Purchase role)','Purchase','Uat@Fact123'],
 ['U-UAT-SALES','uat_sales','UAT Sales','Sales','Uat@Sales123']
].forEach(([id,username,name,role,password])=>{
  if(!DB.users.find(u=>u.id===id)){
    const {hash, salt} = hashPassword(password);
    DB.users.push({id, username, name, role, active:true, assignedProjects: role==='ProjectManager'?['PRJ-1','PRJ-2','PRJ-3']:null, assignedCustomers: role==='Sales'?['CUST-1','CUST-2','CUST-3']:null, passwordHash:hash, passwordSalt:salt, failedLoginCount:0, lockedUntil:null, mustChangePassword:false});
  }
});
if(DB.customers) DB.customers.forEach(c=>{ if(c.state===undefined) c.state=null; });

// Phase 34 additions — Job Work/APOB, E-way Bill, ITC reversal, policy-config extensions. Patched
// in for a DB saved before this phase existed, nothing existing removed. Same discipline as every
// prior phase's migration guard above.
['jobWorkers','jobWorkOrders','jobWorkScrapRecords','jobWorkExtensions','apobDeclarations','ewayBills']
  .forEach(k=>{ if(!DB[k]) DB[k]=[]; });
[['JWO','Job Work Order'],['EWB','E-way Bill Record'],['ITCR','ITC Reversal']]
  .forEach(([code,label])=>{ if(!DB.glDocumentTypes.find(d=>d.code===code)) DB.glDocumentTypes.push({code, label, prefix:code, nextSeq:1}); });
if(!DB.accounts.find(a=>a.id==='5310')) DB.accounts.push({id:'5310', name:'Input Tax Reversed (ITC Ineligible)', type:'Expense'});
if(DB.shipToGstinEffectiveDate===undefined) DB.shipToGstinEffectiveDate = '2026-08-01';
if(!DB.threeWayMatchPolicyConfig) DB.threeWayMatchPolicyConfig = {
  categories: {
    goods: { requiresThreeWayMatch:true, policyConfirmedByFinance:true, note:'PO + GRN + Invoice — standard goods purchase, structurally has a GRN.' },
    jobWork: { requiresThreeWayMatch:true, policyConfirmedByFinance:true, note:'PO + GRN/Job-Work-Return + Invoice.' },
    transportMaterial: { requiresThreeWayMatch:true, policyConfirmedByFinance:true, note:'PO + GRN + Invoice.' },
    rent: { requiresThreeWayMatch:false, policyConfirmedByFinance:false, note:'No GRN concept exists for a service — PAYMENT CONTROL POLICY REQUIRED: Finance to confirm the PO + Service Confirmation + Invoice model, or accept unmatched.' },
    professionalFees: { requiresThreeWayMatch:false, policyConfirmedByFinance:false, note:'Same as rent — no GRN concept for a service.' },
    commission: { requiresThreeWayMatch:false, policyConfirmedByFinance:false, note:'Same as rent.' },
    transportServices: { requiresThreeWayMatch:false, policyConfirmedByFinance:false, note:'Pure freight/service — no GRN.' }
  },
  finalised:false
};
if(DB.purchaseApprovalConfig){
  if(DB.purchaseApprovalConfig.centralPurchaseApprovingRole===undefined) DB.purchaseApprovalConfig.centralPurchaseApprovingRole = null;
  if(DB.purchaseApprovalConfig.siteApprovingRole===undefined) DB.purchaseApprovalConfig.siteApprovingRole = 'SiteInCharge';
  if(DB.purchaseApprovalConfig.escalationRole===undefined) DB.purchaseApprovalConfig.escalationRole = 'FinanceManager';
  if(DB.purchaseApprovalConfig.status===undefined) DB.purchaseApprovalConfig.status = 'POLICY NOT FINALISED';
}
// BOM Governance phase — patched in for a DB saved before this phase existed, nothing existing
// removed. Same discipline as every prior phase's migration guard above: `if(!DB[k])`, never
// unconditionally overwriting a key that might already hold real data. Existing DB.boms/
// DB.productionOrders records are untouched — old records simply won't have the new optional
// fields (siteId, submittedBy, etc.) until they're next written, exactly like every other
// backward-compatible field addition in this file.
['excessMaterialIssueRequests'].forEach(k=>{ if(!DB[k]) DB[k]=[]; });
if(!DB.glDocumentTypes.find(d=>d.code==='XMI')) DB.glDocumentTypes.push({code:'XMI', label:'Excess Material Issue Approval', prefix:'XMI', nextSeq:1});
// P0-4 FIX — BOM never had a document-number series at all (unlike every other major document
// type). Purely a numbering registry entry — glDocumentTypes carries no GL/posting semantics of
// its own; registering BOM here does not make BOM creation/approval a GL-posting event.
if(!DB.glDocumentTypes.find(d=>d.code==='BOM')) DB.glDocumentTypes.push({code:'BOM', label:'Bill of Materials', prefix:'BOM', nextSeq:1});
['excessBillingApprovals'].forEach(k=>{ if(!DB[k]) DB[k]=[]; });
if(!DB.glDocumentTypes.find(d=>d.code==='XBA')) DB.glDocumentTypes.push({code:'XBA', label:'Excess Billing Approval', prefix:'XBA', nextSeq:1});
// Project Variation Phase 2 — Change Request never had a document-number series either (same gap
// class P0-4 fixed for BOM above). Registering it here does not make Change Request creation a GL-
// posting event — createChangeRequest()/approveChangeRequest() still post nothing to the GL.
if(!DB.glDocumentTypes.find(d=>d.code==='CR')) DB.glDocumentTypes.push({code:'CR', label:'Change Request', prefix:'CR', nextSeq:1});
// Project Variation Phase 6 — same gap class, closed for Material Requirement (it never had a
// document-number series either). Registering it does not make MR creation a GL-posting event.
if(!DB.glDocumentTypes.find(d=>d.code==='MRQ')) DB.glDocumentTypes.push({code:'MRQ', label:'Material Requirement', prefix:'MRQ', nextSeq:1});
// Existing Change Requests predate the real Draft/Submitted/Approved/Rejected/Cancelled lifecycle
// (they only ever had Draft/Approved, and — unlike BOM — never recorded WHO approved them on the
// record itself). Rather than fabricate an approver, cross-reference the audit log's own
// 'ChangeRequestApproved' event (which DOES carry userId/role/at) for each already-Approved record;
// only truly unrecoverable fields (documentNo — we cannot know what FY sequence a past record would
// have drawn; reason — never captured at all) are left null, an honest historical gap, not guessed.
if(DB.changeRequests) DB.changeRequests.forEach(cr=>{
  if(cr.documentNo===undefined) cr.documentNo = null;
  if(cr.reason===undefined) cr.reason = null;
  if(cr.quotationId===undefined) cr.quotationId = null;
  if(cr.supportingReference===undefined) cr.supportingReference = null;
  if(cr.submittedBy===undefined || cr.submittedAt===undefined){
    const approvedEvt = DB.auditLog.find(a=>a.type==='ChangeRequestApproved' && a.changeRequestId===cr.id);
    cr.submittedBy = cr.status==='Approved' ? cr.createdBy : null;
    cr.submittedAt = cr.status==='Approved' ? (approvedEvt?approvedEvt.at:cr.createdAt) : null;
  }
  if(cr.approvedBy===undefined || cr.approvedAt===undefined){
    const approvedEvt = DB.auditLog.find(a=>a.type==='ChangeRequestApproved' && a.changeRequestId===cr.id);
    cr.approvedBy = cr.status==='Approved' ? (approvedEvt?approvedEvt.userId:cr.createdBy) : null;
    cr.approvedAt = cr.status==='Approved' ? (approvedEvt?approvedEvt.at:cr.createdAt) : null;
  }
  if(cr.rejectedBy===undefined) cr.rejectedBy = null;
  if(cr.rejectedAt===undefined) cr.rejectedAt = null;
  if(cr.rejectReason===undefined) cr.rejectReason = null;
  if(cr.cancelledBy===undefined) cr.cancelledBy = null;
  if(cr.cancelledAt===undefined) cr.cancelledAt = null;
  if(cr.cancellationReason===undefined) cr.cancellationReason = null;
  // Project Variation Phase 4 — no CR before this phase ever had explicit consumption tracking, so
  // every pre-existing CR honestly starts at 0, not a guessed/inferred value from its historical
  // billing (§1.F of the governing policy explicitly forbids inferring consumption from amounts).
  if(cr.consumedRevenue===undefined) cr.consumedRevenue = 0;
});
// Existing BOMs predate the Draft/Submitted/Approved/Rejected/Superseded lifecycle (they only ever
// had Draft/Approved) — treat a pre-existing 'Approved' BOM as already having gone through
// submission (submittedBy/At backfilled to the same as createdBy/At, approvedAt backfilled to
// createdAt since the real timestamp was never recorded) so it participates correctly in
// supersession logic below without silently losing its approved status.
if(DB.boms) DB.boms.forEach(b=>{
  if(b.siteId===undefined) b.siteId = null;
  if(b.submittedBy===undefined) b.submittedBy = b.status==='Approved' ? b.createdBy : null;
  if(b.submittedAt===undefined) b.submittedAt = b.status==='Approved' ? b.createdAt : null;
  if(b.approvedAt===undefined) b.approvedAt = b.status==='Approved' ? b.createdAt : null;
  if(b.rejectedBy===undefined) b.rejectedBy = null;
  if(b.rejectedAt===undefined) b.rejectedAt = null;
  if(b.rejectReason===undefined) b.rejectReason = null;
  if(b.supersededBy===undefined) b.supersededBy = null;
  if(b.supersededAt===undefined) b.supersededAt = null;
  // Project Variation Phase 2 — no BOM before this phase was ever attributed to a Change Request
  // (the field did not exist), so every pre-existing BOM honestly gets null, not a guessed value.
  if(b.changeRequestId===undefined) b.changeRequestId = null;
});
// Project Variation Phase 5 — same honest-null backfill for Purchase Orders (changeRequestId is
// brand new this phase; no pre-existing PO was ever tagged, since the field did not exist).
if(DB.purchaseOrders) DB.purchaseOrders.forEach(po=>{ if(po.changeRequestId===undefined) po.changeRequestId = null; });
// Project Variation Phase 6 — same honest-null backfill for Material Requirements (bomId/docNo are
// both brand new this phase; no pre-existing MR was ever tagged or numbered, since neither field
// existed). docNo is left null rather than retroactively minting one — the same "never fabricate a
// historical document number" discipline already applied to Change Request's own migration.
if(DB.materialRequirements) DB.materialRequirements.forEach(m=>{
  if(m.bomId===undefined) m.bomId = null;
  if(m.docNo===undefined) m.docNo = null;
});
// Reporting Phase 7 — Report Variants. Brand new collection; patched in for a DB saved before this
// phase existed so an already-persisted db.json isn't left permanently missing it (the exact "13
// missing arrays wiped on every load" defect class from an earlier phase — this is the fix pattern
// that avoids it, applied at creation time instead of discovered after the fact).
if(!DB.reportVariants) DB.reportVariants = [];

// Phase 21 §3 — atomic persistence (audit finding: direct fs.writeFileSync(DB_FILE,...) on every
// single mutating call, with no atomic-swap pattern — a process kill mid-write could corrupt or
// truncate the whole file, not just the one in-flight transaction). Fix: write the full new state
// to a temp file, fsync it to force it to disk (not just the OS page cache), THEN atomically
// rename it onto db.json. A rename onto an existing filename is atomic at the filesystem level on
// both POSIX and Windows/NTFS — at every instant either the OLD db.json is still fully intact or
// the NEW one is; there is no window where db.json itself is partially written. This does not
// introduce an external database (explicitly out of scope for this phase) — it hardens the
// existing single-file architecture, exactly as instructed. db.json.bak is kept as the
// one-save-behind last-known-good copy, used only if db.json itself is ever found corrupted on a
// future load (see loadDbFromDisk above).
function save(){
  const tmpFile = DB_FILE + '.tmp';
  const bakFile = DB_FILE + '.bak';
  const data = JSON.stringify(DB);
  const fd = fs.openSync(tmpFile, 'w');
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try { if(fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, bakFile); } catch(e){ /* best-effort; never blocks the actual save */ }
  fs.renameSync(tmpFile, DB_FILE);
}
// DEFECT FOUND & FIXED (Phase 19, discovered live while testing the Fixed Asset screen in the
// browser): `allLines()`'s Phase 16 memoization cache (`_allLinesCache`, declared further below)
// is keyed ONLY on `DB.journalEntries.length` — a plain number, not tied to which "generation" of
// DB it came from. `resetToFreshSeed()` reassigns `DB` to a brand-new object whose
// `journalEntries` restarts at length 0 and climbs back up from there — meaning after a reset,
// the FIRST time the entry count happens to re-cross a length that was ALSO cached from BEFORE
// the reset (a near-certainty in normal use, e.g. both states pass through length 1, 2, 3...),
// `allLines()` would silently serve the STALE PRE-RESET data instead of recomputing, because the
// numeric length matched even though the underlying entries were completely different documents.
// Reproduced directly: reset -> post exactly 1 new entry (Fixed Asset capitalization, accounts
// 1400/1000) -> Trial Balance showed account 5200 from an unrelated PRIOR session's leftover
// cache instead of the real new 1400/1000 lines. The safe fix is the same principle already used
// throughout this engagement for any function that reassigns `DB` wholesale (`restoreBackup()`
// has the identical shape) — explicitly invalidate the cache the moment `DB` itself is replaced,
// not just rely on the length check, since length alone is not a reliable generation marker
// across a reset/restore. `_allLinesCache` is declared with `let` at module scope below; this
// function only ever EXECUTES after the full module has loaded, so referencing it here (textually
// earlier in the file) is safe — same as any other forward function-scope reference in this file.
function resetToFreshSeed(){ DB = installWriteGuards(freshDB()); _invalidateReportingCaches(); save(); return DB; }

// ============================================================
// Phase 17 §4 — Backup / Restore. This entire system stores EVERYTHING (GL, subledgers,
// masters, attachments, audit log, policy config) in the ONE `db.json` file (`DB_FILE` above,
// see the `let DB = ...` / `save()` pair) — so a backup is genuinely complete by copying that
// single file, not a partial snapshot missing attachments or audit history. Backups are written
// to a separate `backups/` directory (created on first use), never overwriting each other,
// admin-only to create AND restore, every action logged.
const crypto = require('crypto');
function ensureBackupDir(){ if(!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, {recursive:true}); }
function createBackup({label, actor}){
  ensureBackupDir();
  save(); // flush any pending in-memory state to disk first, so the backup reflects the true current state
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  const checksum = crypto.createHash('sha256').update(raw).digest('hex');
  const ts = nowIso().replace(/[:.]/g,'-');
  const filename = `db.backup.${ts}${label?'.'+label.replace(/[^a-zA-Z0-9_-]/g,''):''}.json`;
  fs.writeFileSync(path.join(BACKUP_DIR, filename), raw, 'utf8');
  const meta = { filename, label:label||'', sizeBytes:raw.length, checksum, journalEntryCount:DB.journalEntries.length,
    createdBy:actor.id, createdByRole:actor.role, createdAt:nowIso() };
  logAudit({type:'BackupCreated', filename, sizeBytes:meta.sizeBytes, checksum, journalEntryCount:meta.journalEntryCount, userId:actor.id, role:actor.role});
  return meta;
}
function listBackups(){
  ensureBackupDir();
  return fs.readdirSync(BACKUP_DIR).filter(f=>f.endsWith('.json')).map(filename=>{
    const full = path.join(BACKUP_DIR, filename);
    const stat = fs.statSync(full);
    const raw = fs.readFileSync(full, 'utf8');
    let journalEntryCount = null;
    try{ journalEntryCount = JSON.parse(raw).journalEntries.length; }catch(e){}
    return { filename, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString(), journalEntryCount };
  }).sort((a,b)=> b.modifiedAt.localeCompare(a.modifiedAt));
}
// ERP AUDIT FIX (ERP-040, Critical) — restoreBackup() previously validated exactly ONE thing
// (`journalEntries` is an array) before REPLACING THE ENTIRE LIVE DATABASE with the snapshot,
// live-proven by the audit: a "valid-but-incomplete" snapshot — real JSON, a real journalEntries
// array, but missing entire collections (customers, vendors, materials, every master and
// subledger except the one checked) — was accepted and reported OK despite the resulting live
// database being unusable. `REQUIRED_DB_COLLECTIONS` is derived at call time from the CURRENTLY
// RUNNING database's own top-level array keys (not a hardcoded list that can silently drift out
// of sync as new collections are added elsewhere in this file) — every array-typed collection the
// live system actually depends on right now must also be present, as an array, in any snapshot
// being restored over it. This is deliberately a structural/type check, not a byte-for-byte
// equality check — a genuinely OLDER backup with fewer ROWS in a collection is still valid; a
// backup MISSING a collection the current schema depends on, or one where a collection has been
// corrupted into the wrong TYPE, is not.
function validateDatabaseSnapshot(restored){
  const problems = [];
  if(!restored || typeof restored!=='object' || Array.isArray(restored)) return {ok:false, problems:['Snapshot is not a valid database object.']};
  const requiredCollections = Object.keys(DB).filter(k=>Array.isArray(DB[k]));
  for(const key of requiredCollections){
    if(!(key in restored)) problems.push(`Missing required collection "${key}".`);
    else if(!Array.isArray(restored[key])) problems.push(`Collection "${key}" is present but is not an array (found ${typeof restored[key]}).`);
  }
  // Referential/type spot-check on the single highest-blast-radius collection — every journal
  // entry must at minimum carry a lines array and numeric totals, the same shape postJournalEntry()
  // itself always writes. Catches a truncated/corrupted GL collection that is technically still an
  // array but no longer holds real entries.
  if(Array.isArray(restored.journalEntries)){
    const badEntry = restored.journalEntries.find(je => !je || !Array.isArray(je.lines) || typeof je.totalDebit!=='number' || typeof je.totalCredit!=='number');
    if(badEntry) problems.push('One or more journalEntries records are structurally invalid (missing lines[], or non-numeric totalDebit/totalCredit).');
  }
  return {ok:problems.length===0, problems};
}
// Restoring REPLACES the live in-memory DB and persists it — deliberately the single most
// destructive action in this whole Lab, so it is the most heavily gated (Admin/CEO only,
// enforced at the server.js route layer) and the most heavily logged.
function restoreBackup({filename, actor}){
  ensureBackupDir();
  const full = path.join(BACKUP_DIR, filename);
  if(!full.startsWith(BACKUP_DIR) || !fs.existsSync(full)) return {ok:false, error:'Backup file not found.'};
  const raw = fs.readFileSync(full, 'utf8');
  let restored;
  try{ restored = JSON.parse(raw); }
  catch(e){ return {ok:false, error:'Backup file is corrupted / not valid JSON — restore aborted, live database untouched.'}; }
  // Checksum/integrity — best-effort cross-check against the checksum createBackup() recorded in
  // the audit log at the moment this exact file was created (see createBackup() above), catching
  // on-disk corruption/tampering of the backup file since it was written. Not a hard requirement
  // (an externally-supplied/legacy backup file has no matching audit record) — when no matching
  // record exists this check is silently skipped rather than blocking a legitimate restore.
  const _createdRecord = DB.auditLog.find(a=>a.type==='BackupCreated' && a.filename===filename);
  if(_createdRecord && _createdRecord.checksum){
    const _actualChecksum = crypto.createHash('sha256').update(raw).digest('hex');
    if(_actualChecksum !== _createdRecord.checksum){
      // ERP-059B — this rejection is now recorded via `durableFailureAudit` (see
      // ERP-059B-TRANSACTION-DESIGN.md) instead of a direct logAudit() call, so it survives
      // withTransaction()'s rollback (this function is reached only via the legacy-dispatch
      // wrapper, /api/admin/restore, which wraps every call in withTransaction()) — previously
      // this exact audit entry was silently erased every time, live-confirmed in the ERP-059
      // forensic gate.
      return {ok:false, error:`Checksum mismatch — this backup file has changed since it was created (expected ${_createdRecord.checksum.slice(0,12)}…, found ${_actualChecksum.slice(0,12)}…). Restore aborted, live database untouched.`,
        durableFailureAudit:{type:'RestoreRejectedChecksumMismatch', filename, expectedChecksum:_createdRecord.checksum, actualChecksum:_actualChecksum}};
    }
  }
  const _validation = validateDatabaseSnapshot(restored);
  if(!_validation.ok){
    // ERP-059B — see the comment on the checksum-mismatch branch just above; same fix, same reason.
    return {ok:false, error:'Restore aborted — this snapshot failed validation and the live database was NOT touched: '+_validation.problems.join(' | '), problems:_validation.problems,
      durableFailureAudit:{type:'RestoreRejectedValidationFailed', filename, problems:_validation.problems}};
  }
  const beforeJECount = DB.journalEntries.length;
  DB = installWriteGuards(restored);
  // Same defect class fixed in resetToFreshSeed() above, same fix — restoreBackup() ALSO
  // reassigns `DB` wholesale, so the length-keyed allLines() cache must be invalidated here too.
  _invalidateReportingCaches();
  save();
  logAudit({type:'BackupRestored', filename, journalEntryCountBefore:beforeJECount, journalEntryCountAfter:DB.journalEntries.length, userId:actor.id, role:actor.role});
  return {ok:true, journalEntryCount:DB.journalEntries.length};
}
// Dry-run — validates an arbitrary snapshot (as JSON text, not necessarily a file already in
// backups/) against the SAME rules restoreBackup() itself enforces, without ever touching the live
// database. Lets an operator check "is this restorable" before committing to the real thing —
// the audit's own required sequence is "restore-to-test-location before restore-to-production";
// this is the test-location check for the parts of that sequence this offline Lab can honestly
// provide (structural validation) without a second environment to actually restore into.
function validateRestoreCandidate({snapshotJson}){
  let restored;
  try{ restored = JSON.parse(snapshotJson); }
  catch(e){ return {ok:false, error:'Not valid JSON.'}; }
  const _validation = validateDatabaseSnapshot(restored);
  if(!_validation.ok) return {ok:false, error:'Snapshot failed validation: '+_validation.problems.join(' | '), problems:_validation.problems};
  return {ok:true, message:'Snapshot passed structural validation.', collectionCounts: Object.keys(restored).filter(k=>Array.isArray(restored[k])).reduce((acc,k)=>{acc[k]=restored[k].length; return acc;},{})};
}

// Phase 42 — Idempotency-Key protection for create/post-type endpoints. A caller may optionally
// supply `idempotencyKey` in the request body; if it omits one, behavior is byte-for-byte
// unchanged from before this phase (every existing caller/test omits it). When a key IS supplied:
// the first request with that key is processed normally and its exact result is stored, keyed to
// BOTH the key and a hash of the rest of the payload; a repeat request with the SAME key and the
// SAME payload gets the ORIGINAL stored result back without being reprocessed at all (no second
// GL posting, no second stock movement); a repeat with the SAME key but a DIFFERENT payload is
// rejected as a conflict, since silently honoring a changed request under a reused key would be
// its own kind of data-integrity risk. No new concurrency mechanism is needed for this: as already
// established (Phase 2/5), domain.js has zero `await` inside any of these functions, so two
// "concurrent" requests can never actually interleave — one fully completes and records its key
// before the next one is even inspected.
function hashPayload(obj){
  return crypto.createHash('sha256').update(JSON.stringify(obj||{})).digest('hex');
}
function withIdempotency(endpoint, idempotencyKey, payload, handler){
  if(!idempotencyKey) return handler();
  const payloadHash = hashPayload(payload);
  const existing = DB.idempotencyKeys.find(k=>k.key===idempotencyKey && k.endpoint===endpoint);
  if(existing){
    if(existing.payloadHash!==payloadHash){
      return {ok:false, error:`Idempotency key "${idempotencyKey}" was already used for a "${endpoint}" request with a different payload — reusing a key for a genuinely different request is not allowed.`};
    }
    return {...existing.result, idempotent:true, originalAt:existing.at};
  }
  const result = handler();
  // Phase 38 Part G fix — mirrors the Phase 37 logAudit() fix, one layer further out. A failure
  // HERE (proven live via _fault('IDEMPOTENCY_RECORD')) previously threw straight out of this
  // function, hiding an ALREADY-SUCCESSFUL `result` from the caller and — worse than the logAudit
  // case — leaving no dedupe record behind, so a client retry with the identical idempotency key
  // would not be recognized and would genuinely re-execute the whole transaction. The dedupe
  // record is best-effort bookkeeping; its failure must never mask or undo a real result.
  try {
    _fault('IDEMPOTENCY_RECORD');
    DB.idempotencyKeys.push({key:idempotencyKey, endpoint, payloadHash, result, at:nowIso()});
    save();
  } catch(e) {
    console.error('[IDEMPOTENCY LEDGER WRITE FAILED — the result below is still the real, successful result and was already returned to the caller]', endpoint, String(e && e.message || e));
  }
  return result;
}

// ============================================================================================
// PHASE 38 — Central Transaction Manager. Answers the Phase 37 finding ("OPT-IN TRANSACTION
// SAFETY — NOT ARCHITECTURALLY ENFORCED") by building ONE authoritative mechanism instead of
// individually patched functions, and wiring it in at TWO independent layers so protection does
// not depend on which route pattern (modern registerMutationRoute vs legacy if-block) reaches a
// given domain function:
//
//   Layer 1 — withTransaction(actor, options, handler): a general snapshot/rollback boundary any
//   domain function OR the route dispatcher can open. Whichever one opens it FIRST for a given
//   call tree owns the commit/rollback; anything nested inside just runs (see _txDepth).
//
//   Layer 2 — write-point guards: DB.journalEntries/DB.inventoryMovements/DB.clearings (the 3
//   collections every proven defect this whole audit series found actually lived in) are wrapped
//   in a Proxy that intercepts push()/length-truncation. Outside any active transaction, this is
//   either LOGGED (default — audit mode, never breaks existing traffic) or actively THROWN
//   (enforce mode — architecturally unavoidable, see setEnforceTransactionBoundary()). This is
//   what makes Part D/F's naive-developer attack fail SAFE even with a function that never calls
//   withTransaction() at all: the write point itself refuses the mutation, not just an outer
//   wrapper reacting after the fact.
//
// Scope, disclosed rather than assumed: only journalEntries/inventoryMovements/clearings are
// guarded (not all ~105 collections) — these are the 3 collections Phases 35-37 ever found a real
// orphan/duplicate defect in. auditLog and idempotencyKeys are deliberately NEVER guarded — they
// are best-effort secondary records by explicit policy (see the logAudit/withIdempotency fixes
// immediately above); guarding them would reintroduce the exact defect those fixes just closed.
// ============================================================================================
function _recordViolation(collectionName, op){
  const v = { collection: collectionName, op, at: nowIso(), stack: (new Error().stack || '').split('\n').slice(2,5).join(' | ') };
  console.warn('[PHASE 38 ARCHITECTURAL VIOLATION]', `DB.${collectionName}.${op}() called outside an active transaction boundary.`, _ENFORCE_TRANSACTION_BOUNDARY ? 'BLOCKED (enforce mode).' : 'ALLOWED (audit mode) — logged for migration planning.');
  if(!DB.__architecturalViolations) DB.__architecturalViolations = [];
  DB.__architecturalViolations.push(v);
  return v;
}
function guardedArray(arr, name){
  return new Proxy(arr, {
    get(target, prop, receiver){
      if(typeof prop === 'string' && GUARDED_MUTATORS.has(prop)){
        return function(...args){
          if(_txDepth === 0){
            _recordViolation(name, prop);
            if(_ENFORCE_TRANSACTION_BOUNDARY){
              throw new Error(`ARCHITECTURAL VIOLATION: DB.${name}.${prop}() was called outside any active transaction boundary. Wrap this mutation in D.withTransaction(actor, {name:'...'}, () => { ... }), or reach it through a route registered via registerMutationRoute() (which opens a transaction automatically at dispatch) — a financial/inventory write cannot be created or executed outside a transaction.`);
            }
          }
          return target[prop].apply(target, args);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver){
      if(prop === 'length' && value < target.length){
        if(_txDepth === 0){
          _recordViolation(name, 'length=');
          if(_ENFORCE_TRANSACTION_BOUNDARY){
            throw new Error(`ARCHITECTURAL VIOLATION: DB.${name}.length truncation was attempted outside any active transaction boundary.`);
          }
        }
      }
      return Reflect.set(target, prop, value, receiver);
    }
  });
}
function installWriteGuards(dbObj){
  GUARDED_COLLECTIONS.forEach(name=>{ if(Array.isArray(dbObj[name])) dbObj[name] = guardedArray(dbObj[name], name); });
  return dbObj;
}
// withTransaction — the single authoritative boundary. Captures a full snapshot of DB BEFORE the
// first mutation (via JSON round-trip — DB is already proven fully JSON-safe, see save()), runs
// the handler, and:
//   - on throw: restores DB to the pre-call snapshot in full (every collection, every field, every
//     array length — not a per-function guess at what might have changed), re-installs the write
//     guards (JSON.parse strips Proxies), re-throws the ORIGINAL error, and logs a rollback record.
//   - on a normal {ok:false} return (a plain business-rule rejection with no throw): restores
//     defensively too — requirement "prevent partial business-state exposure" cannot assume every
//     handler validates fully before its first mutation, which is exactly the assumption this
//     audit series has repeatedly found broken.
//   - on success: performs ONE final save() (making the persisted state authoritative regardless
//     of how many times the handler's own internal callees already saved) and logs a commit record.
// Nesting (requirement: "handle nested mutation functions correctly / prevent accidental
// double-rollback corruption"): _txDepth tracks whether a transaction is already open. A nested
// call just runs the handler directly — only the OUTERMOST withTransaction() snapshots, commits,
// or rolls back, so an inner domain function calling another already-migrated domain function
// never double-snapshots or double-restores.
// options.idempotency = {key, endpoint, payloadHash} — OPTIONAL. When supplied:
//   - a pre-existing dedupe record for the same key+endpoint short-circuits BEFORE any transaction
//     opens at all (no snapshot, no handler call, no re-execution — the safest possible dedupe).
//   - on commit, the dedupe record is pushed in the SAME try block as the rest of the commit,
//     immediately before the ONE authoritative save() — so the business mutation and its own
//     duplicate-prevention record are captured in the exact same disk write, not two separate
//     save() calls that could succeed/fail independently of each other.
//   - Phase 38 Part G/H finding: a failure writing the dedupe record is treated as a TRANSACTION
//     FAILURE (full rollback, re-throw) — a deliberately DIFFERENT policy from audit logging
//     (logAudit() never blocks or is blocked by the business transaction). Audit is a pure
//     observational side-channel; the idempotency ledger is not — it is the ONLY mechanism that
//     prevents a lost-response client retry from re-executing an already-committed transaction, so
//     its failure must not be allowed to silently commit a transaction whose replay-safety could
//     not actually be persisted. Proven live: without this, a fault at the ledger-write step let a
//     same-key retry create a genuine second GL entry (JE-1004/JE-1005, ₹50 each) despite the
//     FIRST call already returning ok:true — see the Phase 38 report.
function withTransaction(actor, options, handler){
  options = options || {};
  if(_txDepth > 0){
    return handler(); // already inside an outer transaction — participate, don't nest a new boundary
  }
  if(options.idempotency && options.idempotency.key){
    const existing = DB.idempotencyKeys.find(k=>k.key===options.idempotency.key && k.endpoint===options.idempotency.endpoint);
    if(existing){
      if(existing.payloadHash !== options.idempotency.payloadHash){
        return {ok:false, error:`Idempotency key "${options.idempotency.key}" was already used for a "${options.idempotency.endpoint}" request with a different payload — reusing a key for a genuinely different request is not allowed.`};
      }
      return {...existing.result, idempotent:true, originalAt:existing.at};
    }
  }
  _txDepth = 1;
  const _snapshot = JSON.parse(JSON.stringify(DB));
  let result, threw = false, thrownError = null;
  try {
    result = handler();
    if(result && result.ok !== false && options.idempotency && options.idempotency.key){
      _fault('IDEMPOTENCY_RECORD');
      DB.idempotencyKeys.push({key:options.idempotency.key, endpoint:options.idempotency.endpoint, payloadHash:options.idempotency.payloadHash, result, at:nowIso()});
    }
  } catch(e) {
    threw = true;
    thrownError = e;
  } finally {
    _txDepth = 0;
  }
  if(threw){
    DB = installWriteGuards(_snapshot);
    _invalidateReportingCaches();
    save();
    logAudit({type:'TransactionRolledBack', txName: options.name || 'unnamed', error: String(thrownError && thrownError.message || thrownError), userId: actor && actor.id, role: actor && actor.role});
    throw thrownError;
  }
  if(result && result.ok === false){
    DB = installWriteGuards(_snapshot);
    _invalidateReportingCaches();
    // ERP-059B — durable failure audit (see docs/erp-remediation/phases/ERP-059B-TRANSACTION-
    // DESIGN.md for the full design). A handler MAY attach EXACTLY ONE explicit, named payload to
    // its ok:false result via `durableFailureAudit` — this is the ONLY thing that can survive the
    // rollback immediately above: it is written via the SAME logAudit() every other audit trail
    // in this codebase already uses, AFTER DB has already been restored to its pre-transaction
    // snapshot — so no business mutation the handler made can ever ride along with it. userId/role
    // are always taken from the real, authenticated `actor` this function itself received, never
    // from the handler's payload, exactly like every other audit call in this codebase. A handler
    // that omits durableFailureAudit behaves exactly as it did before this phase — pure rollback,
    // nothing survives.
    if(result.durableFailureAudit && typeof result.durableFailureAudit === 'object'){
      logAudit({...result.durableFailureAudit, userId: actor && actor.id, role: actor && actor.role});
    }
    save();
    return result;
  }
  save();
  logAudit({type:'TransactionCommitted', txName: options.name || 'unnamed', userId: actor && actor.id, role: actor && actor.role});
  return result;
}

// Phase 37 CRITICAL FIX — found live via deliberate fault injection (Part D): logAudit() could
// throw (simulated here via the _fault() checkpoint below, standing in for any real failure — a
// disk error, an out-of-memory condition, a future bug in this function itself), and for the large
// majority of the codebase where the audit call is the LAST statement in a function with no
// surrounding try/catch, that throw propagated all the way to server.js's top-level handler as a
// generic HTTP 500 — even though the REAL financial transaction (GL entry, document, status field)
// had ALREADY been committed and saved moments earlier. Proven live and CRITICAL: a client that
// legitimately retries after seeing that 500 creates a genuine SECOND GL posting for the same real
// event (confirmed: 2 distinct JEs for one real installation-labour-cost event). Worse, this is NOT
// fixed by correct client-side idempotency-key usage either — withIdempotency() only persists its
// dedup record AFTER handler() returns normally, so a THROWN handler (exactly this case) never
// gets recorded, and an identical retry with the SAME idempotency key still re-executes the handler
// from scratch (confirmed live: a second call with the same key produced a second real JE, with
// the idempotency record only appearing after THAT second call succeeded).
// This is not a business-policy question (audit-as-transactional-component vs. audit-as-best-effort
// was never a deliberate design decision here — it was simply inconsistent accident-of-code-order
// across ~15 fixed functions where audit sits INSIDE the rollback try/catch, versus the remaining
// majority where it sits unprotected after the real commit). The correct, general, non-policy-
// inventing fix is narrower and purely about reliability: a SECONDARY, forensic side-effect (audit
// logging) must never be allowed to make an ALREADY-SUCCESSFUL primary business transaction falsely
// report failure to its caller. logAudit() now catches its own internal failure, logs it loudly to
// the server's own console (so a real persistent audit-write problem is never silently invisible to
// operators), and returns normally either way — it can no longer throw to any caller, anywhere.
function logAudit(entry){
  try {
    _fault('LOG_AUDIT'); // Phase 37 Part D — a single generic checkpoint, usable against ANY caller's
    // audit write without per-function instrumentation. One-shot (see _fault()'s own definition), so
    // arming it immediately before one target API call affects only that call's own audit write.
    DB.auditLog.push({ id: nextId(DB.auditLog, 'AUD-', 6), ...entry, at: nowIso() });
    save();
  } catch(e) {
    console.error('[AUDIT WRITE FAILED — business transaction, if any, was NOT rolled back for this reason]', entry && entry.type, String(e && e.message || e));
  }
}

// ---------- Numbering ----------
// Phase 19 §25 (APPROVED — Decision B: annual reset) — Indian Financial Year (1 April to 31
// March), matching the "31 March -> 1 April" transition the brief explicitly asks to test and
// the real GST/accounting fiscal year an Indian company like Appletree operates on. Returns a
// label like "2026-27" for a date anywhere in that FY.
function financialYearKey(dateStr){
  const [y, m] = String(dateStr).slice(0,10).split('-').map(Number);
  const startYear = (m>=4) ? y : y-1;
  return `${startYear}-${String((startYear+1)%100).padStart(2,'0')}`;
}
// Voucher NUMBERS now reset to 0001 at the start of each Financial Year, scoped independently
// per document type (`dt.yearlySeq[fy]`) — but the document's own internal `id` field (JE-0001,
// DRAFT-0001, GRN-0001, etc, assigned separately at record-creation time throughout this file)
// is COMPLETELY UNTOUCHED by this change: it keeps incrementing globally, forever, never reset.
// That `id` is what makes "the full document identity must remain unique" true even though the
// human-readable voucherNo can legitimately repeat across different years (e.g. two different
// JE-xxxx records can both show voucherNo "JV/2026-27/0001" and "JV/2027-28/0001" — never the
// same year twice, and never ambiguous internally since `id` always differs). The FY is embedded
// directly in the printed voucher string (not just tracked as a hidden internal field) precisely
// so two documents from different years are never visually indistinguishable to a human reading
// two printouts side by side — this is standard real-world practice for annual-reset numbering,
// not a cosmetic choice. Historical documents already posted before this phase are NEVER
// renumbered — `dt.nextSeq` (the old global counter) is left in place, untouched, purely as a
// harmless historical relic; only NEW documents use `dt.yearlySeq` from this phase forward.
function nextDocNumber(typeCode, dateStr){
  const dt = DB.glDocumentTypes.find(d => d.code === typeCode);
  if(!dt) return null;
  const fy = financialYearKey(dateStr || new Date().toISOString().slice(0,10));
  if(!dt.yearlySeq) dt.yearlySeq = {};
  if(!dt.yearlySeq[fy]) dt.yearlySeq[fy] = 1;
  const num = `${dt.prefix}/${fy}/${String(dt.yearlySeq[fy]).padStart(4,'0')}`;
  dt.yearlySeq[fy] += 1;
  return num;
}

// ---------- Core posting engine (Phase 4/5 logic unchanged; Phase 8 added rounding — see below) ----------
// DEFECT FOUND & FIXED during Phase 8 volume testing: line debit/credit amounts were stored
// exactly as passed in, with no rounding to 2 decimal places (paise). A single hand-crafted
// test amount like ₹1,18,000 is already "clean," so this was invisible until the volume test
// posted ~100 invoices built from unrounded random amounts (`50000 + Math.random()*100000`),
// which accumulated a real ~3-paisa AR reconciliation mismatch — small, but real money must
// never have more than 2 decimal places in INR. Fixed at the single lowest level (this
// function, the only place that ever writes a journalEntries line) rather than in each caller,
// so every current AND future caller is protected, not just the two that triggered this.
function r2(n){ return Math.round((+n||0) * 100) / 100; }
// ============================================================
// Phase 21 — Central Numeric Validation. Built in direct response to Phase 19/20's finding that
// the same NaN-guard existed as 16 independently copy-pasted inline implementations, with zero
// shared helper — including one instance (Phase 18's r2() discovery) where a correct check was
// silently defeated by validating the OUTPUT of r2() instead of the raw input. This function is
// the fix for that specific failure mode too: it always validates the RAW value BEFORE any
// rounding/coercion ever touches it, never the post-r2() result.
//
// HONEST SCOPE BOUNDARY (per the Phase 21 mission's own Absolute Rule — a helper that can still
// be forgotten is not sufficient by itself): this function is now the ACTUAL, SHARED
// implementation at all 14 locations retrofitted in this phase (confirmed by search, see the
// Phase 21 report). It is not a NEW kind of enforcement — nothing in the language prevents a
// brand-new function from choosing not to call it, exactly as Phase 20's naive-developer
// simulation proved for every other control in this codebase. What changed is that the 14 known
// vulnerable call sites no longer each maintain their own copy of the validation logic — a future
// bug fix or refinement now needs to happen in exactly one place, not 14.
function assertFiniteNumber(value, {allowNegative=true, allowZero=true, fieldName='Value'}={}){
  if(value===undefined || value===null || value==='' || (typeof value==='string' && value.trim()==='')){
    return {ok:false, error:`${fieldName} is required.`};
  }
  const n = Number(value);
  if(isNaN(n) || !isFinite(n)) return {ok:false, error:`${fieldName} must be a valid, finite number (received "${value}").`};
  if(!allowNegative && n<0) return {ok:false, error:`${fieldName} must not be negative.`};
  if(!allowZero && n===0) return {ok:false, error:`${fieldName} must be non-zero.`};
  return {ok:true, value:n};
}
function assertPositiveFiniteNumber(value, fieldName){ return assertFiniteNumber(value, {allowNegative:false, allowZero:false, fieldName}); }
function assertNonNegativeFiniteNumber(value, fieldName){ return assertFiniteNumber(value, {allowNegative:false, allowZero:true, fieldName}); }
function assertNonZeroFiniteNumber(value, fieldName){ return assertFiniteNumber(value, {allowNegative:true, allowZero:false, fieldName}); }
// Phase 14 §6/§7 — standard accounting document header/line dimensions, added at this single
// lowest-level function so every current AND future posting path gets them for free (same
// discipline as Phase 8's r2() rounding fix). All new fields are optional/nullable — no existing
// caller needs to change, and no transaction is blocked for lacking a Branch/Location/Ref it
// genuinely doesn't have. docDate defaults to the posting date when not supplied (§10 — the two
// must be allowed to differ, never silently forced equal, but a sensible default keeps every
// pre-Phase-14 caller working unchanged).
// ============================================================================================
// Phase 26 §6 — Write-Point Capability Containment.
// ============================================================================================
// The experimental proof this phase ran (see the Phase 26 report §3/§5) found that a brand-new,
// completely unguarded function — reachable through a route that itself passed the Phase 24/25
// route-safety checks — could call postJournalEntry()/postInventoryMovement() directly and post
// real GL/inventory as ANY role, including Viewer, and could even forge a `postedByRole` string
// entirely disconnected from the real actor. That is because postJournalEntry() never received the
// real actor object at all (only two derived strings, postedByUserId/postedByRole, which any
// caller could supply independently of who was actually logged in) and never checked authorization
// itself — every one of the 25 GL-posting functions had to remember to check first, and nothing
// enforced that they did.
//
// This registry closes that gap AT THE WRITE POINT, not by trusting the caller. Every call to
// postJournalEntry()/postInventoryMovement() must now pass the REAL `actor` object plus a
// `capability` string naming ONE of the checks below; the write point looks up that name in
// CAPABILITY_REGISTRY and RUNS the real check itself, against the real actor, every single time —
// it does not trust that the caller already ran it, and it does not accept a boolean/token/flag
// standing in for "trust me, I checked" (see the Phase 26 report §8 for why: a plain boolean or
// copied object is trivially forgeable; a capability NAME resolved against a registry of real
// functions is not, because resolving it re-executes the actual rule against the actor Node itself
// derived from the authenticated session, not from anything the caller supplies).
//
// An unregistered/misspelled/missing capability, or a missing/unauthenticated actor, is rejected
// unconditionally — there is no "no capability declared" success path. A NEW domain function that
// forgets to declare a capability, or that is never given one, CANNOT reach either write point,
// regardless of what route exposes it or what role check (if any) that route performs.
//
// Known, disclosed limits (see Phase 26 report §23): (1) this does not stop a deliberate, malicious
// edit to domain.js itself that adds a new registry entry with a permissive/absent check — that is
// a code-review problem, not something a runtime gate can prevent; (2) the ~7 inventory-only
// functions' capabilities were added this phase for completeness but were not part of the original
// 25-function GL mandate; (3) `capability` is a plain string, not a cryptographically unforgeable
// token — its safety comes from the registry always being consulted fresh, not from the string
// itself being secret.
const CAPABILITY_REGISTRY = {
  GL_POST:                  (actor)      => can(actor,'post') ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot post documents.`},
  GL_REVERSE:               (actor)      => can(actor,'reverse') ? {ok:true} : {ok:false, error:`Role "${actor.role}" is not authorized to reverse postings.`},
  AR_RECEIPT_CLEAR:         (actor)      => assertCanClearReceipt(actor),
  AP_PAYMENT:               (actor)      => assertCanPaySupplier(actor),
  AP_CREDIT_NOTE:           (actor)      => assertCanCreateSupplierCreditNote(actor),
  AP_DEBIT_NOTE:            (actor)      => assertCanCreateSupplierDebitNote(actor),
  AR_CREDIT_NOTE:           (actor)      => assertCanCreateCustomerCreditNote(actor),
  AR_DEBIT_NOTE:            (actor)      => assertCanCreateCustomerDebitNote(actor),
  INVENTORY_ADJUSTMENT:     (actor)      => assertCanCreateInventoryAdjustment(actor),
  GRN_RECEIPT:              (actor)      => assertCanCreateGRN(actor),
  PURCHASE_RETURN:          (actor)      => assertCanCreatePurchaseReturn(actor),
  MATERIAL_ISSUE:           (actor, ctx) => assertCanCreateMaterialIssue(actor, ctx||{}),
  LABOUR_WAGES:             (actor, ctx) => assertCanRecordLabourWages(actor, ctx && ctx.projectId),
  PROJECT_EXPENSE:          (actor, ctx) => assertCanRecordProjectExpense(actor, ctx && ctx.projectId),
  FIXED_ASSET_CAPITALIZE:   (actor)      => assertCanCapitalizeFixedAsset(actor),
  BANK_TRANSFER:            (actor)      => assertCanTransferBankFunds(actor),
  FIXED_ASSET_DISPOSE:      (actor)      => assertCanDisposeFixedAsset(actor),
  FIXED_ASSET_DEPRECIATION: (actor)      => assertCanPostAssetDepreciation(actor),
  BANK_IMPORT_POST:         (actor)      => assertCanPostBankImportLine(actor),
  PRODUCTION_LABOUR_COST:   (actor)      => assertCanPostProductionLabourCost(actor),
  INSTALLATION_LABOUR_COST: (actor, ctx) => assertCanPostInstallationLabourCost(actor, ctx && ctx.projectId),
  SERVICE_LABOUR_COST:      (actor)      => assertCanPostServiceLabourCost(actor),
  AMC_REVENUE_RECOGNITION:  (actor)      => assertCanRecognizeAMCRevenue(actor),
  PETTY_CASH_REPLENISH:     (actor)      => assertCanReplenishPettyCash(actor),
  ITC_REVERSAL:             (actor)      => assertCanReverseITCForWriteOff(actor),
  INVENTORY_TRANSFER:       (actor)      => assertCanCreateInventoryTransfer(actor),
  MASTER_DATA_IMPORT:       (actor)      => assertCanImportMasterData(actor),
  SITE_ISSUE:               (actor)      => assertCanIssueToSite(actor),
  // Targeted P1 Remediation phase — Site Return. Same authorization tier as SITE_ISSUE (the exact
  // reverse movement), its own distinct capability so the audit/capability trail names the real
  // action, matching the JOB_WORK_DISPATCH/JOB_WORK_RETURN pairing convention already in this table.
  SITE_RETURN:              (actor)      => assertCanReturnFromSite(actor),
  JOB_WORK_DISPATCH:        (actor)      => assertCanDispatchToJobWorker(actor),
  JOB_WORK_RETURN:          (actor)      => assertCanReturnFromJobWorker(actor),
  JOB_WORK_SCRAP:           (actor)      => assertCanRecordJobWorkScrap(actor),
  JOB_WORK_DIRECT_DISPATCH: (actor)      => assertCanDirectDispatchFromJobWorker(actor),
};
// ============================================================================================
// Phase 27 §2/§10 — Registry Immutability.
// ============================================================================================
// Phase 26's registry was a plain object: exported by reference, so ANY code holding
// `require('./domain').CAPABILITY_REGISTRY` — this file's own server.js, a test script, a future
// module — could reassign, delete, or add a key at runtime, and postJournalEntry()/
// postInventoryMovement() would immediately start using the tampered checker, since they read the
// SAME live object via closure, not a copy. Proven live this phase: `CAPABILITY_REGISTRY.GL_POST =
// ()=>({ok:true})` succeeded silently and a fabricated Viewer actor immediately passed the (now
// worthless) GL_POST check. Object.freeze() closes exactly this: in this file's 'use strict' mode,
// every one of add/reassign/delete now THROWS instead of silently succeeding — a tamper attempt
// fails LOUD, the same "fail loud, not silent" discipline already used by registerMutationRoute()'s
// own boot-crash guards. This is a SHALLOW freeze (the object's own keys are locked; it does not,
// and cannot, stop a sufficiently determined rewrite of the checker FUNCTIONS' own source code —
// see the Phase 27 report §10/§15 for why that remaining gap is a code-review problem, not
// something any runtime mechanism can close).
Object.freeze(CAPABILITY_REGISTRY);
// Phase 27 §11 — Startup Policy Validator.
// ============================================================================================
// Runs once, at require-time (below), so ANY process that loads domain.js — the real server,
// a test script, a future tool — gets this validation automatically, the same "boot-enforced"
// property registerMutationRoute() and the Phase 25 route-safety scanner already have.
//
// What it can prove: the registry is frozen; every declared capability maps to an actual function;
// no expected capability is missing; every write-point call site (found by re-scanning THIS file's
// own source, not a maintained list) names a capability that is actually registered.
//
// What it can only heuristically flag, and says so: whether a checker's IMPLEMENTATION is a real
// authorization rule or a permissive stand-in. The test is textual (does the checker's own source
// delegate to `can(actor,...)` or an `assertCan*(actor...)` — every one of the 32 real checkers
// does) — a checker that performs a genuine positive-membership role check some OTHER way would be
// a false alarm; a checker DELIBERATELY named to imitate that shape while doing nothing real would
// evade it. That is the same disclosed limit as the Phase 25/26 static scanners: textual heuristics
// catch the ACCIDENTAL mistake (an anonymous `()=>true`/`actor=>actor!=null`-shaped stand-in) — they
// do not, and cannot, catch a deliberately deceptive rewrite by someone with source access. See
// Phase 27 report §15 for the accidental-vs-malicious boundary this validator actually draws.
const EXPECTED_CAPABILITIES = ['GL_POST','GL_REVERSE','AR_RECEIPT_CLEAR','AP_PAYMENT','AP_CREDIT_NOTE','AP_DEBIT_NOTE',
  'AR_CREDIT_NOTE','AR_DEBIT_NOTE','INVENTORY_ADJUSTMENT','GRN_RECEIPT','PURCHASE_RETURN','MATERIAL_ISSUE','LABOUR_WAGES',
  'PROJECT_EXPENSE','FIXED_ASSET_CAPITALIZE','BANK_TRANSFER','FIXED_ASSET_DISPOSE','FIXED_ASSET_DEPRECIATION',
  'BANK_IMPORT_POST','PRODUCTION_LABOUR_COST','INSTALLATION_LABOUR_COST','SERVICE_LABOUR_COST','AMC_REVENUE_RECOGNITION',
  'PETTY_CASH_REPLENISH','ITC_REVERSAL','INVENTORY_TRANSFER','MASTER_DATA_IMPORT','SITE_ISSUE','SITE_RETURN','JOB_WORK_DISPATCH',
  'JOB_WORK_RETURN','JOB_WORK_SCRAP','JOB_WORK_DIRECT_DISPATCH'];
function looksLikeRealAuthorizationCheck(fn){
  const src = fn.toString();
  // Trusted delegation: calling the shared can(actor,'tag') tag-check, or any assertCanXxx(actor...)
  // guard — every one of the 32 real checkers does one of these.
  if(/\bcan\s*\(\s*actor\s*,/.test(src)) return true;
  if(/\bassertCan[A-Za-z]*\s*\(\s*actor\b/.test(src)) return true;
  // Fallback: a genuine positive-membership test against an explicit role list, e.g.
  // ['Admin','CEO'].includes(actor.role) or someSet.has(actor.role) — NOT a bare negative/exclusion
  // comparison like `actor.role !== 'Viewer'`, which excludes exactly one role and allows every
  // other one, the exact shape of the Part 3/4 attack examples.
  if(/\.(includes|has)\s*\(\s*actor\.role\s*\)/.test(src)) return true;
  return false;
}
function validateCapabilityRegistry(){
  const problems = [];
  if(!Object.isFrozen(CAPABILITY_REGISTRY)) problems.push('CAPABILITY_REGISTRY is not frozen — registry tampering would not be detected.');
  for(const name of EXPECTED_CAPABILITIES){
    if(typeof CAPABILITY_REGISTRY[name] !== 'function') problems.push(`Expected capability "${name}" is missing or not a function.`);
  }
  for(const [name, fn] of Object.entries(CAPABILITY_REGISTRY)){
    if(typeof fn !== 'function'){ problems.push(`Capability "${name}" does not map to a function.`); continue; }
    if(fn.length < 1) problems.push(`Capability "${name}"'s checker takes no actor parameter at all — cannot be a real per-actor authorization check (e.g. "() => true").`);
    else if(!looksLikeRealAuthorizationCheck(fn)) problems.push(`Capability "${name}"'s checker does not appear to perform a real role-membership check (no can()/assertCan*() delegation, no .includes(actor.role)/.has(actor.role) found) — possible permissive/unsafe policy, needs manual review before this can be trusted.`);
  }
  if(problems.length){
    throw new Error('Capability registry validation FAILED at startup:\n  ' + problems.join('\n  '));
  }
}
validateCapabilityRegistry();
// ============================================================================================
// Phase 28 §3/§5/§6 — Capability-to-Operation Binding.
// ============================================================================================
// Phase 27 closed "can the POLICY be tampered with." This phase closes a different question:
// "does a VALID, correctly-authorized capability actually apply to THIS operation?" Proven live
// before this fix: an Accountant is legitimately authorized for AR_RECEIPT_CLEAR (customer
// receipts) but NOT for AP_PAYMENT (supplier payments) — yet if a future developer's new
// supplier-payment function mistakenly hardcoded capability:'AR_RECEIPT_CLEAR' (an easy mistake —
// both are real, registered, "clearing-shaped" capabilities), the write point had no way to notice
// the posting wasn't actually a customer receipt at all, and the Accountant would have been
// wrongly allowed to pay a supplier.
//
// The fix binds each capability to the OPERATION SIGNATURE already present on every posting —
// `sourceType`/`docCategory` for GL, `type`+`sourceType` for inventory — fields every existing
// caller already sets for its own business reasons (reconciliation, reporting, reversal lookup),
// not new data invented for this check. Binding is deliberately NOT a second authorization system:
// it does not replace or duplicate the ROLE check in CAPABILITY_REGISTRY — it runs strictly AFTER
// that check passes, and only asks "is this specific capability even the RIGHT one for what's
// actually being posted," which the role check alone cannot answer.
//
// Two capabilities are deliberately marked 'GENERIC' rather than bound to one signature:
// GL_POST (postDraft posts whatever document type the underlying draft represents — Manual JE,
// AR/AP invoices, GRN-derived bills, etc. — by design, the one central posting gate for ALL of
// them) and MATERIAL_ISSUE (createMaterialIssue is deliberately reused by Production Order issue,
// direct project issue, and site consumption, each with their own sourceType). Marking these
// GENERIC is itself a disclosed, reviewable decision — not a silent gap — visible right here in
// the same table as every bound entry.
const GL_OPERATION_BINDING = {
  GL_POST: 'GENERIC',
  GL_REVERSE: (p) => p.sourceType === 'Reversal',
  AR_RECEIPT_CLEAR: (p) => p.sourceType === 'Customer Receipt',
  AP_PAYMENT: (p) => p.sourceType === 'Supplier Payment',
  AP_CREDIT_NOTE: (p) => p.sourceType === 'Supplier Credit Note',
  AP_DEBIT_NOTE: (p) => p.sourceType === 'Supplier Debit Note',
  AR_CREDIT_NOTE: (p) => p.sourceType === 'Customer Credit Note',
  AR_DEBIT_NOTE: (p) => p.sourceType === 'Customer Debit Note',
  INVENTORY_ADJUSTMENT: (p) => p.sourceType === 'InventoryAdjustment',
  GRN_RECEIPT: (p) => p.sourceType === 'GRN',
  PURCHASE_RETURN: (p) => p.sourceType === 'PurchaseReturn',
  MATERIAL_ISSUE: 'GENERIC',
  // Financial Reconciliation phase — Job Work Scrap write-off. Reuses the SAME JOB_WORK_SCRAP
  // capability recordJobWorkScrap() already uses for its inventory movement (INVENTORY_OPERATION_
  // BINDING, below) — this is the GL-write-point binding for that identical capability, a distinct
  // sourceType ('JobWorkScrapWriteOff', not 'InventoryAdjustment') so this real business event is
  // never blurred together with an ordinary Inventory Adjustment in the GL/audit trail.
  JOB_WORK_SCRAP: (p) => p.sourceType === 'JobWorkScrapWriteOff',
  // Targeted P1 Remediation phase — Site Return's loss-recognition GL entry (Damaged/Lost lines
  // only; a Usable return has zero GL effect, same as SiteReceipt/SiteConsumption's own custody-only
  // design). Distinct sourceType so this is never blurred with an ordinary Inventory Adjustment.
  SITE_RETURN: (p) => p.sourceType === 'SiteReturnLoss',
  LABOUR_WAGES: (p) => p.sourceType === 'LabourWages',
  PROJECT_EXPENSE: (p) => p.sourceType === 'ProjectExpense',
  FIXED_ASSET_CAPITALIZE: (p) => p.sourceType === 'FixedAssetCapitalization',
  BANK_TRANSFER: (p) => p.sourceType === 'BankTransfer',
  FIXED_ASSET_DISPOSE: (p) => p.sourceType === 'FixedAssetDisposal',
  FIXED_ASSET_DEPRECIATION: (p) => p.sourceType === 'Depreciation',
  BANK_IMPORT_POST: (p) => p.sourceType === 'BankImportAllocation',
  PRODUCTION_LABOUR_COST: (p) => p.sourceType === 'ProductionLabour',
  INSTALLATION_LABOUR_COST: (p) => p.sourceType === 'InstallationLabour',
  SERVICE_LABOUR_COST: (p) => p.sourceType === 'ServiceVisit',
  AMC_REVENUE_RECOGNITION: (p) => p.sourceType === 'AMC Revenue Recognition',
  PETTY_CASH_REPLENISH: (p) => p.sourceType === 'PettyCashReplenishment',
  // ITC_REVERSAL's sourceType is passed through from its caller (createDamageReport), so it is not
  // a fixed literal here — docCategory is the fixed, bindable field for this one instead.
  ITC_REVERSAL: (p) => p.docCategory === 'ITCReversal',
};
const INVENTORY_OPERATION_BINDING = {
  GL_POST: 'GENERIC', // opening-balance inventory receipt, posted alongside whatever draft type postDraft is handling
  GL_REVERSE: (p) => p.sourceType === 'GRNReversal' || p.sourceType === 'MaterialIssueReversal',
  GRN_RECEIPT: (p) => p.sourceType === 'GRN',
  PURCHASE_RETURN: (p) => p.sourceType === 'PurchaseReturn',
  MATERIAL_ISSUE: 'GENERIC',
  INVENTORY_TRANSFER: (p) => p.sourceType === 'InventoryTransfer',
  INVENTORY_ADJUSTMENT: (p) => p.sourceType === 'InventoryAdjustment',
  MASTER_DATA_IMPORT: (p) => p.sourceType === 'OpeningBalanceImport',
  SITE_ISSUE: (p) => p.sourceType === 'SiteMaterialRequisition',
  // Targeted P1 Remediation phase — Site Return posts two possible movement types under the SAME
  // sourceType:'SiteReturn' (the SiteReturn-type decrement at the site, and — for a Usable-condition
  // line only — a paired Receipt back into the warehouse), matching the JOB_WORK_* pairing
  // convention immediately below (one capability, multiple `type`s under one shared sourceType).
  SITE_RETURN: (p) => p.sourceType === 'SiteReturn' && (p.type === 'SiteReturn' || p.type === 'Receipt'),
  // The 4 job-work capabilities all share sourceType:'JobWorkOrder' — `type` is what actually
  // distinguishes them, so binding checks BOTH fields together, not sourceType alone.
  JOB_WORK_DISPATCH: (p) => p.sourceType === 'JobWorkOrder' && (p.type === 'Issue' || p.type === 'JobWorkReceipt'),
  JOB_WORK_RETURN: (p) => p.sourceType === 'JobWorkOrder' && (p.type === 'JobWorkReturn' || p.type === 'Receipt'),
  JOB_WORK_SCRAP: (p) => p.sourceType === 'JobWorkOrder' && p.type === 'JobWorkScrap',
  JOB_WORK_DIRECT_DISPATCH: (p) => p.sourceType === 'JobWorkOrder' && p.type === 'JobWorkDirectDispatch',
};
function checkOperationBinding(writePoint, capability, params){
  const table = writePoint === 'GL' ? GL_OPERATION_BINDING : INVENTORY_OPERATION_BINDING;
  const rule = table[capability];
  if(rule === undefined) return {ok:false, error:`Capability "${capability}" has no registered operation binding for the ${writePoint} write point — a capability meant for the other write point (or never bound at all) cannot be used here.`};
  if(rule === 'GENERIC') return {ok:true};
  if(!rule(params)){
    const shape = Object.entries(params).filter(([,v])=>v!=null).map(([k,v])=>`${k}="${v}"`).join(', ');
    return {ok:false, error:`Capability "${capability}" is not valid for this operation (${shape}) — this looks like the wrong capability was used for this write.`};
  }
  return {ok:true};
}
// ============================================================================================
// Phase 29 §G — Content-Level Binding (closes the "fabricated label" disguise attack).
// ============================================================================================
// Live-proven this phase: Phase 28's operation binding checks the LABEL (sourceType/docCategory)
// a posting CLAIMS to be, but never the ACTUAL content of its `lines`. An Accountant, using their
// real AR_RECEIPT_CLEAR capability, could post a genuine vendor payment (Dr Accounts Payable 2000,
// Cr Bank, carrying a real vendorId) by simply labeling it sourceType:'Customer Receipt' — the
// label satisfied Phase 28's binding, and nothing inspected whether the posting's actual accounts
// and party fields matched what a real customer receipt looks like.
//
// This check is deliberately narrower than "verify every account combination for every
// capability" — that would need its own phase of work across all 25 GL capabilities. It targets
// exactly the proven attack class: an AR-side capability smuggling AP-shaped content, or vice
// versa, which is both the specific attack demonstrated live AND the single highest-value/lowest-
// risk check available (AR/AP are the two ledgers a mislabeled posting could most directly corrupt
// customer/vendor balances through). It runs AFTER the label-based operation binding passes, using
// data (`lines`, already carrying account/customerId/vendorId on every real posting) no caller
// needs to supply anything new for.
const AR_SIDE_CAPABILITIES = new Set(['AR_RECEIPT_CLEAR','AR_CREDIT_NOTE','AR_DEBIT_NOTE']);
const AP_SIDE_CAPABILITIES = new Set(['AP_PAYMENT','AP_CREDIT_NOTE','AP_DEBIT_NOTE']);
function checkContentBinding(capability, lines){
  if(!Array.isArray(lines)) return {ok:true};
  if(AR_SIDE_CAPABILITIES.has(capability)){
    if(lines.some(l=>l && l.vendorId)) return {ok:false, error:`Capability "${capability}" is an AR (customer) operation — a line carrying a vendorId is not a genuine customer-side posting. This looks like a disguised AP operation.`};
    if(!lines.some(l=>l && l.account===AR_ACCOUNT)) return {ok:false, error:`Capability "${capability}" must touch the Accounts Receivable control account (${AR_ACCOUNT}) — this posting does not, and cannot be a genuine AR operation.`};
  }
  if(AP_SIDE_CAPABILITIES.has(capability)){
    if(lines.some(l=>l && l.customerId)) return {ok:false, error:`Capability "${capability}" is an AP (supplier) operation — a line carrying a customerId is not a genuine supplier-side posting. This looks like a disguised AR operation.`};
    if(!lines.some(l=>l && l.account===AP_ACCOUNT)) return {ok:false, error:`Capability "${capability}" must touch the Accounts Payable control account (${AP_ACCOUNT}) — this posting does not, and cannot be a genuine AP operation.`};
  }
  return {ok:true};
}
function checkWritePointCapability(capability, actor, ctx){
  if(!actor || !actor.id || !actor.role) return {ok:false, error:'No authenticated actor supplied for this write — write-point capability check refused.'};
  if(!capability || typeof capability !== 'string') return {ok:false, error:'No financial/inventory capability declared for this write — registration required before this write point can be reached.'};
  const checker = CAPABILITY_REGISTRY[capability];
  if(typeof checker !== 'function') return {ok:false, error:`Unknown capability "${capability}" — not registered in CAPABILITY_REGISTRY. A new dangerous function cannot reach this write point without first registering a real authorization check here.`};
  return checker(actor, ctx);
}
function postJournalEntry({date, docDate, narration, lines, sourceType, sourceId, voucherNo, party, reversalOfId, dueDate, docCategory, branchId, refNo1, refNo2, refNo3, actor, capability, capabilityCtx, overrideReason, paymentMethodId}){
  const _capResult = checkWritePointCapability(capability, actor, capabilityCtx);
  if(!_capResult.ok) return _capResult;
  // Phase 28 §3 — the actor IS authorized for this capability; now confirm this capability is
  // actually the right one for what's being posted (see checkOperationBinding's header comment).
  const _bindResult = checkOperationBinding('GL', capability, {sourceType, docCategory});
  if(!_bindResult.ok) return _bindResult;
  // Phase 29 §G — the LABEL matches; now confirm the ACTUAL posting content (accounts/parties)
  // is consistent with that label (see checkContentBinding's header comment).
  const _contentResult = checkContentBinding(capability, lines);
  if(!_contentResult.ok) return _contentResult;
  const postedByUserId = actor.id, postedByRole = actor.role;
  if(!date) return {ok:false, error:'Date is required.'};
  // Phase 39 CRITICAL FIX — found live: an unparseable date ("not-a-date") passed straight through
  // this function (the single choke point EVERY posting path funnels through — see the Phase 18/19
  // comment below) with no validation at all, producing a REAL, PERMANENTLY POSTED GL entry
  // (JE-1028, via /api/project-expenses) with `date:"not-a-date"` and a corrupted voucher number
  // `"PEXP/NaN-NaN/0001"` (financialYearKey() silently produced NaN-NaN from the unparseable
  // string, with no error). This is worse than createDraft()'s equivalent gap (fixed separately,
  // same phase) because this path doesn't even throw — it silently commits corrupted data into
  // the permanent ledger. Any date-based report, financial-year filter, or period-close
  // reconciliation relying on `date` being a real calendar date would silently mishandle this row.
  if(!isValidCalendarDateStr(date)) return {ok:false, error:`"${date}" is not a valid date — expected format YYYY-MM-DD with a real calendar date.`};
  if(docDate && !isValidCalendarDateStr(docDate)) return {ok:false, error:`"${docDate}" is not a valid document date — expected format YYYY-MM-DD with a real calendar date.`};
  if(!Array.isArray(lines) || lines.length < 2) return {ok:false, error:'A journal entry needs at least 2 lines.'};
  if(branchId && !DB.branches.find(b=>b.id===branchId)) return {ok:false, error:`Unknown branch "${branchId}".`};
  // Phase 18 §2 / Phase 19 §1+§30 — Financial Period Control + approved Override. This is the ONE
  // function every accounting-relevant posting path funnels through (Manual JE, AR, AP, Receipt,
  // Payment, GRN, Material Issue, Production/Installation/Service labour, AMC billing/
  // recognition, Credit/Debit Notes, Inventory Adjustment, Reversal — confirmed via the Phase 14
  // Entry-Type Catalogue grep, still true) — so the lock AND the override are enforced HERE ONCE,
  // same discipline as the r2() rounding fix (Phase 8) and the Phase 14 header-dimension
  // additions, rather than duplicated at every caller. `findPeriodForDate` returns null when no
  // period record covers this date at all — an undefined period is NOT the same as a closed one,
  // so undefined dates stay fully open, satisfying §1's "do not alter historical accounting data
  // merely to implement this."
  //
  // Phase 19 decision 1/30 (APPROVED — "B: an authorized person may post into a closed period"):
  // the override role itself is STILL never invented (unchanged from Phase 18 — `overrideRole`
  // stays null on every period until CEO/Admin explicitly configures it). What Phase 19 ADDS is
  // that the override role match is no longer sufficient by itself — a real `overrideReason` is
  // now REQUIRED too, so "authorization + reason" are both structurally enforced, not just the
  // role. Direct API manipulation cannot bypass this: the role check reads `postedByRole`, which
  // is always derived server-side from the authenticated actor (never client-supplied), and the
  // reason check is a plain non-empty-string requirement enforced in this same function, so no
  // caller — UI, API, or a tampered request — can skip either half.
  const _period = findPeriodForDate(date);
  let _periodOverrideUsed = false;
  if(_period && _period.status==='Closed'){
    const _roleMatches = _period.overrideRole && postedByRole===_period.overrideRole;
    if(!_roleMatches){
      return {ok:false, error:`Posting blocked — financial period "${_period.name}" (${_period.startDate} to ${_period.endDate}) is CLOSED. ${_period.overrideRole ? `Only role "${_period.overrideRole}" may post into this closed period.` : 'No override role is configured for this period (MANAGEMENT DECISION REQUIRED) — reopen the period first if this posting is genuinely required.'}`};
    }
    if(!overrideReason || !String(overrideReason).trim()){
      return {ok:false, error:`Posting blocked — financial period "${_period.name}" is CLOSED. Your role ("${postedByRole}") is authorized to override, but a reason is required for every closed-period override posting.`};
    }
    _periodOverrideUsed = true;
  }
  // Phase 21 §2 — Future-Dated Posting Control (audit finding: a 2030-dated invoice previously
  // posted with zero restriction). Mirrors the closed-period pattern immediately above: a
  // configurable limit (DB.policyConfig.maxFuturePostingDays — a PROPOSED default, see its
  // maxFuturePostingDaysApproved flag, NOT an invented Appletree business policy), override
  // restricted to CEO/Admin (the same authority level already trusted for closed-period override
  // eligibility and SoD self-approval elsewhere in this codebase — not a new invented role
  // concept), and a mandatory reason, fully audited with a real document reference. A null/
  // undefined limit means the control is switched off entirely (management has not configured
  // one yet) rather than silently defaulting to "no future dating allowed," which would be
  // inventing a stricter policy than anyone approved.
  let _futureDateOverrideUsed = false;
  const _maxFutureDays = DB.policyConfig.maxFuturePostingDays;
  if(_maxFutureDays !== null && _maxFutureDays !== undefined){
    const _todayMidnight = new Date(new Date().toISOString().slice(0,10)+'T00:00:00Z').getTime();
    const _postDateMidnight = new Date(date+'T00:00:00Z').getTime();
    const _daysAhead = Math.round((_postDateMidnight - _todayMidnight) / 86400000);
    if(_daysAhead > _maxFutureDays){
      const _roleAllowed = postedByRole==='CEO' || postedByRole==='Admin';
      if(!_roleAllowed){
        return {ok:false, error:`Posting blocked — date ${date} is ${_daysAhead} days in the future, exceeding the configured maximum of ${_maxFutureDays} days (${DB.policyConfig.maxFuturePostingDaysApproved ? 'approved configuration' : 'TEST / PROPOSED CONFIGURATION — not yet approved by management'}). Role "${postedByRole}" is not authorized to override future-dated posting.`};
      }
      if(!overrideReason || !String(overrideReason).trim()){
        return {ok:false, error:`Posting blocked — date ${date} exceeds the configured future-posting limit of ${_maxFutureDays} days. Your role ("${postedByRole}") is authorized to override, but a reason is required for every future-date override posting.`};
      }
      _futureDateOverrideUsed = true;
    }
  }
  // Phase 44 CRITICAL FIX — found live in the Phase 8 adversarial audit: this function accepted
  // any string for customerId/vendorId/projectId/costCentreId/profitCentreId/taxCode/account,
  // with zero existence check, before writing it permanently into DB.journalEntries. A manual
  // Journal Entry (or any other caller) could reference a customer, project, cost/profit centre,
  // tax code, or GL account that had never been created, and the entry would post successfully —
  // proven live: JE-0126 posted referencing `projectId:'PRJ-DOES-NOT-EXIST'` and
  // `customerId:'CUST-PHANTOM-999'`. Validated here, in the ONE function every posting path
  // already funnels through (see the Phase 18/19 comment above), rather than duplicated in every
  // caller. Every field below is OPTIONAL on a line (null/undefined/'' is accepted, matching every
  // existing legitimate caller that omits fields it doesn't use) — only a genuinely non-empty
  // value that matches NO real record is rejected. `vendorId`/`customerId` are deliberately not
  // required to be mutually exclusive here (some lines legitimately carry neither).
  // ERP AUDIT FIX (ERP-023, Critical) — this loop validated every REFERENCE on a line (account,
  // customer, vendor, project, cost/profit centre, tax code) but never the debit/credit VALUES
  // themselves before summing them into the balance check below. Live-proven by the independent
  // audit: a line with debit=-100/credit=0 paired with a mirror debit=0/credit=-100 sums to a
  // "balanced" 0=0 total; a line with debit=100/credit=100 (self-contradictory — both sides
  // positive) sums into a matching pair just as easily. Both posted successfully despite being
  // economically meaningless — a balanced trial balance is not proof the underlying lines make
  // sense. Fixed using the SAME assertFiniteNumber() central validator already built for exactly
  // this class of defect (see its own header comment above) rather than inventing a second check.
  // Each side is validated independently as non-negative+finite, then the pair is checked for the
  // "both positive" and "both zero" contradictions — the two shapes the audit demonstrated live.
  let totalDebit = 0, totalCredit = 0;
  for(const l of lines){
    if(!l.account) return {ok:false, error:'Every line requires a GL account.'};
    if(!DB.accounts.find(a=>a.id===l.account)) return {ok:false, error:`Unknown GL account "${l.account}".`};
    if(l.customerId && !DB.customers.find(c=>c.id===l.customerId)) return {ok:false, error:`Unknown customer "${l.customerId}".`};
    if(l.vendorId && !DB.vendors.find(v=>v.id===l.vendorId)) return {ok:false, error:`Unknown vendor "${l.vendorId}".`};
    if(l.projectId && !DB.projects.find(p=>p.id===l.projectId)) return {ok:false, error:`Unknown project "${l.projectId}".`};
    if(l.costCentreId && !DB.costCentres.find(c=>c.id===l.costCentreId)) return {ok:false, error:`Unknown cost centre "${l.costCentreId}".`};
    if(l.profitCentreId && !DB.profitCentres.find(p=>p.id===l.profitCentreId)) return {ok:false, error:`Unknown profit centre "${l.profitCentreId}".`};
    if(l.taxCode && !DB.taxCodes.find(t=>t.code===l.taxCode)) return {ok:false, error:`Unknown tax code "${l.taxCode}".`};
    // Missing debit/credit is normal (every existing line supplies only the side it uses) — only
    // a genuinely PRESENT-but-invalid value (negative/NaN/Infinity/non-numeric) is rejected here.
    const _dChk = assertNonNegativeFiniteNumber(l.debit==null || l.debit==='' ? 0 : l.debit, 'Line debit');
    if(!_dChk.ok) return _dChk;
    const _cChk = assertNonNegativeFiniteNumber(l.credit==null || l.credit==='' ? 0 : l.credit, 'Line credit');
    if(!_cChk.ok) return _cChk;
    const dVal = _dChk.value, cVal = _cChk.value;
    if(dVal>0 && cVal>0) return {ok:false, error:`Line on account "${l.account}" has both a debit (${dVal}) AND a credit (${cVal}) — a single journal line cannot be both.`};
    if(dVal===0 && cVal===0) return {ok:false, error:`Line on account "${l.account}" has neither a debit nor a credit — every line must have exactly one positive side.`};
    totalDebit += r2(dVal); totalCredit += r2(cVal);
  }
  if(Math.abs(totalDebit - totalCredit) > 0.01){
    return {ok:false, error:`Not balanced — total debit ₹${totalDebit.toFixed(2)} ≠ total credit ₹${totalCredit.toFixed(2)}. Posting rejected.`};
  }
  const normalizedLines = lines.map(l => ({
    account: l.account, debit: r2(l.debit), credit: r2(l.credit),
    customerId: l.customerId || null, vendorId: l.vendorId || null, projectId: l.projectId || null,
    costCentreId: l.costCentreId || null, profitCentreId: l.profitCentreId || null,
    taxCode: l.taxCode || null, currency: l.currency || 'INR',
    remarks: l.remarks || '', branchId: l.branchId || branchId || null, locationId: l.locationId || null,
    distributionRule: l.distributionRule || null, itemId: l.itemId || null, reference: l.reference || null
  }));
  if(paymentMethodId && !DB.paymentMethods.find(m=>m.id===paymentMethodId)) return {ok:false, error:`Unknown payment method "${paymentMethodId}".`};
  const entry = {
    id: nextId(DB.journalEntries, 'JE-', 4), // Phase 32 §C — was length+1; the single most consequential collision risk in the whole codebase
    date, docDate: docDate || date, narration: narration || '', sourceType: sourceType || 'Manual', sourceId: sourceId || null,
    voucherNo: voucherNo || nextDocNumber('JE', date),
    party: party || null, reversalOfId: reversalOfId || null,
    dueDate: dueDate || null, docCategory: docCategory || null,
    branchId: branchId || null, refNo1: refNo1 || '', refNo2: refNo2 || '', refNo3: refNo3 || '',
    postedByUserId: postedByUserId || null, postedByRole: postedByRole || null, paymentMethodId: paymentMethodId || null,
    totalDebit, totalCredit, lines: normalizedLines, postedAt: nowIso()
  };
  DB.journalEntries.push(entry);
  save();
  if(_periodOverrideUsed){
    // Full override audit record: authorization (role matched _period.overrideRole, already
    // proven above), reason, user identity, timestamp (nowIso(), not client-supplied), and a real
    // document reference (the entry actually created — entry.id + voucherNo — not a placeholder).
    logAudit({type:'ClosedPeriodOverridePosting', periodId:_period.id, periodName:_period.name,
      date, overrideReason: String(overrideReason).trim(), documentReference:entry.id, voucherNo:entry.voucherNo,
      userId:postedByUserId, role:postedByRole});
  }
  if(_futureDateOverrideUsed){
    logAudit({type:'FutureDatedOverridePosting', date, maxFuturePostingDays:_maxFutureDays,
      overrideReason: String(overrideReason).trim(), documentReference:entry.id, voucherNo:entry.voucherNo,
      userId:postedByUserId, role:postedByRole});
  }
  return {ok:true, entry, periodOverrideUsed:_periodOverrideUsed, futureDateOverrideUsed:_futureDateOverrideUsed};
}

function addDays(dateStr, n){ const d = new Date(dateStr); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }

// ---------- Document lifecycle (unchanged from Phase 5) ----------
// DEFECT FOUND & FIXED (Phase 14 Accountant UAT, phase14_accountant_uat.js): a draft with no
// `date` could be Created, Submitted, and even Approved — passing three real authorization
// gates — before finally failing at Post with a generic "Date is required." error several steps
// after the actual mistake was made. The live UI already always supplies a date (checked:
// Service Billing and every other screen), so this was only reachable via a direct API call
// missing the field — but per this engagement's "server-side enforcement, never rely on the UI"
// principle, rejecting at the earliest possible point protects every current AND future caller,
// exactly like Phase 8's r2() rounding fix.
// Phase 39 FIX — found live: an unparseable date ("not-a-date", "2026-13-45") was never validated
// here at all; it silently reached addDays()'s own `new Date(dateStr).toISOString()` several
// lines below, where an Invalid Date throws a raw, uncaught RangeError ("Invalid time value") —
// propagating all the way to a generic 500 with no indication the actual problem was the date
// field. withTransaction() correctly rolled this back (zero DB mutation, confirmed live), but the
// error told the caller nothing useful — exactly the "error quality" gap this audit's Part S asks
// about. Also guards against silent calendar rollover (e.g. "2026-02-30" -> March 2) by requiring
// a strict YYYY-MM-DD shape whose components round-trip exactly, not just "parses to some date."
function isValidCalendarDateStr(s){
  if(typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s+'T00:00:00Z');
  if(isNaN(d.getTime())) return false;
  return d.toISOString().slice(0,10) === s;
}
function createDraft({date, docDate, narration, docTypeCode, sourceType, docCategory, party, lines, dueDate, branchId, refNo1, refNo2, refNo3, createdByUserId, createdByRole, excessBillingApprovalId, jobWorkOrderId, variationAllocations}){
  if(!date) return {ok:false, error:'Date is required.'};
  if(!isValidCalendarDateStr(date)) return {ok:false, error:`"${date}" is not a valid date — expected format YYYY-MM-DD with a real calendar date.`};
  if(docDate && !isValidCalendarDateStr(docDate)) return {ok:false, error:`"${docDate}" is not a valid document date — expected format YYYY-MM-DD with a real calendar date.`};
  if(branchId && !DB.branches.find(b=>b.id===branchId)) return {ok:false, error:`Unknown branch "${branchId}".`};
  const draft = {
    // Phase 33 (adversarial audit thread) Part U — this is the single busiest id series in the
    // codebase: EVERY invoice, supplier bill, customer advance, billing-milestone invoice, service
    // invoice, AMC billing invoice, and plain Manual JE passes through here before ever reaching
    // the GL, so a collision would be the highest-blast-radius one possible short of JE- itself
    // (already fixed Phase 32). Same nextId()/maxIdSuffix() mechanism, same rationale.
    id: nextId(DB.jeDrafts, 'DRAFT-', 4), status: 'Draft',
    date, docDate: docDate || date, narration: narration||'', docTypeCode: docTypeCode||'JE', sourceType: sourceType||'Manual',
    docCategory: docCategory||'JournalVoucher', party: party||null, lines: lines||[],
    dueDate: dueDate || (date ? addDays(date,30) : null),
    branchId: branchId || null, refNo1: refNo1||'', refNo2: refNo2||'', refNo3: refNo3||'',
    // P0-2 FIX — purely additive: null for every existing caller. Carries forward which Excess
    // Billing Approval (if any) authorized this specific draft to exceed its project's billing
    // ceiling, so postDraft() — the actual GL-posting point — can re-validate and consume it.
    excessBillingApprovalId: excessBillingApprovalId||null,
    // Quick Control Fixes phase — purely additive, same shape as excessBillingApprovalId above:
    // null for every existing caller. Traceability-only tag linking a Supplier Bill draft (and,
    // once posted, findable via this draft's postedEntryId) back to the Job Work Order whose
    // processing fee it pays — the existing AP/vendor-bill mechanism is otherwise completely
    // unchanged, no second GL posting, no parallel billing system.
    jobWorkOrderId: jobWorkOrderId||null,
    // Project Variation Phase 4 — purely additive, same shape again: [] for every existing caller.
    // Each entry {changeRequestId, amount} is soft-validated at draft-creation time (the caller,
    // draftCustomerInvoice(), already ran validateVariationAllocations() before reaching here) and
    // re-validated + actually CONSUMED (cr.consumedRevenue mutated) only at postDraft() — a draft on
    // its own has zero effect on any Change Request's consumption, same "draft has zero financial
    // effect" invariant excessBillingApprovalId already relies on.
    variationAllocations: Array.isArray(variationAllocations) ? variationAllocations : [],
    createdByUserId, createdByRole, createdAt: nowIso(), postedEntryId: null, rejectReason: null,
    history: [{action:'Created', userId:createdByUserId, role:createdByRole, at: nowIso()}]
  };
  DB.jeDrafts.push(draft);
  save();
  return {ok:true, draft};
}
function simulateDraft(lines){
  let totalDebit=0, totalCredit=0;
  (lines||[]).forEach(l=>{ totalDebit += (+l.debit||0); totalCredit += (+l.credit||0); });
  return { totalDebit, totalCredit, balanced: Math.abs(totalDebit-totalCredit) < 0.01, lineCount: (lines||[]).filter(l=>l.account).length };
}
function findDraft(id){ return DB.jeDrafts.find(d=>d.id===id); }
function submitDraft(id, actor){
  const d = findDraft(id); if(!d) return {ok:false, error:'Draft not found.'};
  if(d.status!=='Draft') return {ok:false, error:`Cannot submit — document is "${d.status}", not Draft.`};
  const sim = simulateDraft(d.lines);
  if(!sim.balanced) return {ok:false, error:`Cannot submit an unbalanced document.`};
  d.status='Submitted'; d.history.push({action:'Submitted', userId:actor.id, role:actor.role, at:nowIso()});
  save(); return {ok:true, draft:d};
}
function approveDraft(id, actor){
  const d = findDraft(id); if(!d) return {ok:false, error:'Draft not found.'};
  if(d.status!=='Submitted') return {ok:false, error:`Cannot approve — document is "${d.status}", not Submitted.`};
  const isOverride = actor.role==='CEO' || actor.role==='Admin';
  if(d.createdByUserId===actor.id && !isOverride){
    return {ok:false, error:`Segregation of duties: you created this document and cannot also approve it.`};
  }
  if(d.createdByUserId===actor.id && isOverride){
    logAudit({type:'SelfApprovalOverride', draftId:d.id, userId:actor.id, role:actor.role, reason:`${actor.role} approved a document they created`});
  }
  d.status='Approved'; d.history.push({action:'Approved', userId:actor.id, role:actor.role, at:nowIso()});
  save(); return {ok:true, draft:d};
}
function rejectDraft(id, reason, actor){
  const d = findDraft(id); if(!d) return {ok:false, error:'Draft not found.'};
  if(d.status!=='Submitted') return {ok:false, error:`Cannot reject — document is "${d.status}", not Submitted.`};
  d.status='Rejected'; d.rejectReason = reason||'(no reason given)';
  d.history.push({action:'Rejected', userId:actor.id, role:actor.role, at:nowIso(), reason:d.rejectReason});
  save();
  releaseInvoiceReservation(d); // Phase 27 — a rejected PO-aware bill must not permanently block re-billing
  // Phase 45 CRITICAL FIX (continued) — a rejected draft is a dead end; revert its milestone to
  // 'Ready' (not left at 'InvoiceDrafted') so a fresh invoice attempt is always possible, exactly
  // the retryability Scenario D of the fix required — never permanently stuck.
  if(d.billingMilestoneId){
    const bm = DB.billingMilestones.find(x=>x.id===d.billingMilestoneId);
    if(bm && bm.status==='InvoiceDrafted'){ bm.status='Ready'; bm.draftId=null; save(); }
  }
  return {ok:true, draft:d};
}
function postDraft(id, actor, overrideReason){
  // Phase 24 §6 — the central posting gate for the entire GL now checks its own base permission,
  // not only whichever route happened to call it. This is deliberately the SAME can(actor,'post')
  // tag the route layer already enforces (one authoritative rule, not a second one that could
  // drift) — see the Phase 24 report §6/§11 for the new-developer attack this specifically defeats.
  if(!can(actor,'post')) return {ok:false, error:`Role "${actor.role}" cannot post documents.`};
  const d = findDraft(id); if(!d) return {ok:false, error:'Draft not found.'};
  if(d.status!=='Approved') return {ok:false, error:`Cannot post — document is "${d.status}", not Approved.`};
  const isOverride = actor.role==='CEO' || actor.role==='Admin';
  if(d.createdByUserId===actor.id && !isOverride){
    return {ok:false, error:`Segregation of duties: you created this document and cannot also post it without CEO/Admin override.`};
  }
  // Phase 33 (adversarial audit thread) Part D — closed-project gate. This is the ONE choke point
  // every draft-based posting funnels through (Customer/Supplier Invoice, Customer Advance,
  // Billing-Milestone Invoice, Service Invoice, AMC Billing, and plain Manual JE) — checking here
  // catches every one of them regardless of WHEN the draft was created (a draft created against a
  // still-open project, then posted after that project closes, is caught at this, the actual
  // financial-impact moment — not only at draft-creation time). A draft may therefore still be
  // CREATED against a closed project — it has zero GL/inventory effect on its own, same as a
  // Draft-status Quotation — but it can never be POSTED without this same reused overrideReason.
  const _draftProjectIds = [...new Set((d.lines||[]).map(l=>l.projectId).filter(Boolean))];
  for(const _pid of _draftProjectIds){
    const _po = assertProjectOpenForPosting(_pid, actor, {overrideReason, action:'post this document'});
    if(!_po.ok) return _po;
  }
  // P0-2 FIX — the AUTHORITATIVE billing-ceiling check, at the actual GL-posting point (not merely
  // at draft creation, which can be stale by the time this specific draft is finally posted).
  // Scoped to any docCategory:'CustomerInvoice' draft whose own AR line is a DEBIT (i.e. it
  // increases what the customer owes) — this naturally covers ordinary Customer Invoices, AMC
  // Billing, Billing-Milestone invoices, and Customer Debit Notes uniformly (all of which share
  // this docCategory and genuinely add to cumulative billing), while a Customer Credit Note's own
  // AR line is a CREDIT (debit:0), so it never trips this check — exactly matching the formula's
  // own definition of "approved credit notes reduce, nothing else about them needs gating here."
  let _xbaToConsume = null, _xbaConsumeAmount = 0;
  if(d.docCategory==='CustomerInvoice'){
    const _arLine = (d.lines||[]).find(l=>l.account===AR_ACCOUNT);
    if(_arLine && _arLine.debit>0 && _arLine.projectId){
      const _ceiling = projectBillingCeiling(_arLine.projectId);
      if(_ceiling && _ceiling.ceilingEstablished){
        const _cumulativeAfter = r2(_ceiling.billedToDate + _arLine.debit);
        if(_cumulativeAfter > _ceiling.totalApprovedCeiling + 0.01){
          if(d.excessBillingApprovalId){
            const _xba = DB.excessBillingApprovals.find(x=>x.id===d.excessBillingApprovalId);
            if(!_xba || _xba.status!=='Approved' || _xba.projectId!==_arLine.projectId){
              return {ok:false, error:'The Excess Billing Approval referenced by this draft is no longer valid (not found, not Approved, or project mismatch) — cannot post. Cancel this draft and raise a fresh Excess Billing request.'};
            }
            const _remainingOnApproval = r2(_xba.requestedAmount - _xba.consumedAmount);
            if(_arLine.debit > _remainingOnApproval + 0.01){
              return {ok:false, error:`Excess Billing Approval "${_xba.id}" only covers ₹${_remainingOnApproval.toLocaleString('en-IN')} more (already consumed ₹${_xba.consumedAmount.toLocaleString('en-IN')} of ₹${_xba.requestedAmount.toLocaleString('en-IN')}) — this document's ₹${_arLine.debit.toLocaleString('en-IN')} exceeds it. A duplicate/second use of the same approval is blocked.`};
            }
            _xbaToConsume = _xba; _xbaConsumeAmount = _arLine.debit;
          } else {
            const _excess = r2(_cumulativeAfter - _ceiling.totalApprovedCeiling);
            return {ok:false, error:`Posting this document would exceed project ${_arLine.projectId}'s approved commercial ceiling — accepted quotation/budget ₹${_ceiling.ceilingBase.toLocaleString('en-IN')} + approved variation ₹${_ceiling.approvedVariationValue.toLocaleString('en-IN')} = ₹${_ceiling.totalApprovedCeiling.toLocaleString('en-IN')}, already billed ₹${_ceiling.billedToDate.toLocaleString('en-IN')}. This document's ₹${_arLine.debit.toLocaleString('en-IN')} exceeds the remainder by ₹${_excess.toLocaleString('en-IN')} — an Excess Billing Approval must be raised and approved by an authorized manager before this can post.`,
              requiresExcessBillingApproval:true, ceiling:_ceiling, excess:_excess};
          }
        }
      }
    }
  }
  // Project Variation Phase 4 — the AUTHORITATIVE re-validation of variationAllocations, at the
  // actual GL-posting point, exactly mirroring the excessBillingApprovalId re-check immediately
  // above (same reasoning: a draft can sit Approved for a while, and another invoice may have
  // consumed capacity from the SAME CR in the meantime — re-run the identical checks against
  // CURRENT state, not the state at draft-creation time, before anything is allowed to commit).
  if(Array.isArray(d.variationAllocations) && d.variationAllocations.length){
    const _arLineForVA = (d.lines||[]).find(l=>l.account===AR_ACCOUNT);
    const _vaProjectId = _arLineForVA ? _arLineForVA.projectId : null;
    const _vaInvoiceAmount = _arLineForVA ? _arLineForVA.debit : null;
    const _vaCheck = validateVariationAllocations(d.variationAllocations, _vaProjectId, _vaInvoiceAmount);
    if(!_vaCheck.ok){
      return {ok:false, error:`This draft's variation allocation is no longer valid — cannot post: ${_vaCheck.error} Cancel this draft and raise a fresh one if the underlying billing is still needed.`};
    }
  }
  const voucherNo = nextDocNumber(d.docTypeCode, d.date);
  // Phase 37 CRITICAL FIX — found live via deliberate fault injection (Part C): postDraft() is the
  // SINGLE highest-traffic choke point in the entire system (every Customer Invoice, Supplier
  // Bill, Customer Advance, Billing-Milestone Invoice, Service Invoice, AMC Billing, and plain
  // Manual JE reaches the GL through here) — and, despite Phase 33's own comment calling it "the
  // ONE choke point," it had NEVER received the Phase 35/36 rollback treatment. GL commits above;
  // an exception before `d.status='Posted'` previously left the draft stuck at 'Approved' — its
  // own guard (`if(d.status!=='Approved')`) then let a retry through, producing a confirmed, live,
  // genuine SECOND GL posting for the SAME draft (2 distinct JEs for one Customer Invoice).
  const _jesLenBeforeDraftPost = DB.journalEntries.length;
  const result = postJournalEntry({ date:d.date, docDate:d.docDate, narration:d.narration, sourceType:d.sourceType, sourceId:d.id,
    voucherNo, party:d.party, lines:d.lines, dueDate:d.dueDate, docCategory:d.docCategory,
    branchId:d.branchId, refNo1:d.refNo1, refNo2:d.refNo2, refNo3:d.refNo3, actor, capability:'GL_POST', overrideReason });
  if(!result.ok){
    const dt = DB.glDocumentTypes.find(x=>x.code===d.docTypeCode); if(dt) dt.nextSeq -= 1; save();
    return {ok:false, error:result.error};
  }
  const _draftBefore = {status:d.status, postedEntryId:d.postedEntryId, historyLen:d.history.length};
  let _bmBefore = null, _obLineBefore = null, _xbaBefore = null, _crConsumptionBefore = null;
  try {
    _fault('POSTDRAFT_AFTER_GL_BEFORE_STATUS'); // Phase 37 Part C
    d.status='Posted'; d.postedEntryId = result.entry.id;
    d.history.push({action:'Posted', userId:actor.id, role:actor.role, at:nowIso(), entryId:result.entry.id});
    save();
    // P0-2 FIX — consume the Excess Billing Approval that authorized this posting (if any), inside
    // the SAME transaction boundary as everything else here: a failure below rolls this back too.
    // Marking it 'Consumed' once fully used (not left 'Approved') is what makes a second attempt to
    // post against the same approval fail — the duplicate-use check above only accepts 'Approved'.
    if(_xbaToConsume){
      _xbaBefore = {status:_xbaToConsume.status, consumedAmount:_xbaToConsume.consumedAmount, consumingDraftIds:[..._xbaToConsume.consumingDraftIds]};
      _xbaToConsume.consumedAmount = r2(_xbaToConsume.consumedAmount + _xbaConsumeAmount);
      _xbaToConsume.consumingDraftIds.push(d.id);
      if(_xbaToConsume.consumedAmount >= _xbaToConsume.requestedAmount - 0.01) _xbaToConsume.status = 'Consumed';
      save();
      logAudit({type:'ExcessBillingConsumed', xbaId:_xbaToConsume.id, draftId:d.id, entryId:result.entry.id, amount:_xbaConsumeAmount, userId:actor.id, role:actor.role});
    }
    _fault('POSTDRAFT_AFTER_XBA_BEFORE_CR_CONSUMPTION'); // Project Variation Phase 4
    // Project Variation Phase 4 — actually consume each allocated Change Request's variation
    // capacity, inside this SAME transaction boundary (a failure below rolls this back too, exactly
    // like the XBA consumption right above it). This is the ONLY place a CR's consumedRevenue is
    // ever mutated — never at draft creation (zero effect, matching excessBillingApprovalId's own
    // invariant), never inferred, never touched by cancellation.
    if(Array.isArray(d.variationAllocations) && d.variationAllocations.length){
      _crConsumptionBefore = [];
      for(const alloc of d.variationAllocations){
        const cr = DB.changeRequests.find(c=>c.id===alloc.changeRequestId);
        if(!cr) continue; // re-validated above; unreachable in practice, defensive only
        const before = +cr.consumedRevenue||0;
        _crConsumptionBefore.push({changeRequestId:cr.id, consumedRevenue:before});
        cr.consumedRevenue = r2(before + (+alloc.amount||0));
        logAudit({type:'ChangeRequestConsumed', changeRequestId:cr.id, projectId:cr.projectId, draftId:d.id, entryId:result.entry.id,
          amount:alloc.amount, previousConsumedRevenue:before, newConsumedRevenue:cr.consumedRevenue, revenueImpact:cr.revenueImpact, userId:actor.id, role:actor.role});
      }
      save();
    }
    _fault('POSTDRAFT_AFTER_STATUS_BEFORE_MILESTONE'); // Phase 37 Part C
    // Phase 45 CRITICAL FIX (continued) — the milestone reaches its real 'Invoiced' status HERE,
    // at the one point the invoice is actually, successfully posted — never earlier.
    if(d.billingMilestoneId){
      const bm = DB.billingMilestones.find(x=>x.id===d.billingMilestoneId);
      if(bm && bm.status==='InvoiceDrafted'){ _bmBefore = {id:bm.id, status:bm.status, invoiceEntryId:bm.invoiceEntryId}; bm.status='Invoiced'; bm.invoiceEntryId=result.entry.id; save(); }
    }
    _fault('POSTDRAFT_AFTER_MILESTONE_BEFORE_OPENINGBAL'); // Phase 37 Part C
    // Phase 20 §9/§16 — an Opening Inventory draft can be posted through EITHER the generic
    // Document Workflow screen OR the dedicated Opening Balance screen (both call this SAME
    // function, per §16's "every entry must use the SAME central posting architecture") — so the
    // physical stock movement side-effect belongs HERE, the one place both paths funnel through,
    // not duplicated in a wrapper only one of the two paths would call.
    if(d.openingBalanceBatchId){
      const obLine = DB.openingBalanceLines.find(l=>l.draftId===d.id);
      if(obLine && obLine.type==='OpeningInventory' && !obLine.inventoryMovementPosted){
        _obLineBefore = {id:obLine.id, movesLen:DB.inventoryMovements.length};
        postInventoryMovement({type:'Receipt', materialId:obLine.materialId, qty:obLine.qty, uom:'', warehouseId:obLine.warehouseId,
          sourceType:'OpeningBalanceImport', sourceId:obLine.id, valuationRate:obLine.unitCost, actor, capability:'GL_POST' });
        obLine.inventoryMovementPosted = true; save();
      }
    }
    return {ok:true, draft:d, entry:result.entry};
  } catch(e) {
    DB.journalEntries.length = _jesLenBeforeDraftPost;
    Object.assign(d, {status:_draftBefore.status, postedEntryId:_draftBefore.postedEntryId});
    d.history.length = _draftBefore.historyLen;
    if(_bmBefore){ const bm = DB.billingMilestones.find(x=>x.id===_bmBefore.id); if(bm) Object.assign(bm, {status:_bmBefore.status, invoiceEntryId:_bmBefore.invoiceEntryId}); }
    if(_obLineBefore){ const obLine = DB.openingBalanceLines.find(x=>x.id===_obLineBefore.id); if(obLine){ obLine.inventoryMovementPosted=false; } DB.inventoryMovements.length = _obLineBefore.movesLen; }
    if(_xbaBefore && _xbaToConsume) Object.assign(_xbaToConsume, {status:_xbaBefore.status, consumedAmount:_xbaBefore.consumedAmount, consumingDraftIds:_xbaBefore.consumingDraftIds});
    // Project Variation Phase 4 — roll every touched CR's consumedRevenue back to exactly what it
    // was before this posting attempt, same all-or-nothing guarantee as every other side-effect here.
    if(_crConsumptionBefore){
      _crConsumptionBefore.forEach(snap=>{ const cr = DB.changeRequests.find(c=>c.id===snap.changeRequestId); if(cr) cr.consumedRevenue = snap.consumedRevenue; });
    }
    save();
    logAudit({type:'PostDraftRolledBackOnFailure', draftId:d.id, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}
function cancelDraft(id, actor){
  const d = findDraft(id); if(!d) return {ok:false, error:'Draft not found.'};
  if(['Posted','Cancelled','Reversed'].includes(d.status)) return {ok:false, error:`Cannot cancel a "${d.status}" document.`};
  d.status='Cancelled'; d.history.push({action:'Cancelled', userId:actor.id, role:actor.role, at:nowIso()});
  save();
  releaseInvoiceReservation(d); // Phase 27 — see rejectDraft()
  // Phase 45 CRITICAL FIX (continued) — same reasoning as rejectDraft(): a cancelled draft must
  // not leave its milestone permanently stranded at 'InvoiceDrafted'.
  if(d.billingMilestoneId){
    const bm = DB.billingMilestones.find(x=>x.id===d.billingMilestoneId);
    if(bm && bm.status==='InvoiceDrafted'){ bm.status='Ready'; bm.draftId=null; save(); }
  }
  return {ok:true, draft:d};
}
function reverseEntry(entryId, reason, actor){
  // Phase 41 FIX — a Phase 4 finding: a rejected (400) reversal attempt left no audit trace at
  // all, unlike a permission-denied (403) one. Every rejection path below now logs who attempted
  // what, and why it was refused — a rejected attempt still reveals intent worth being able to see
  // later, exactly as a real user's mistaken-but-blocked action would in any audited system.
  // ERP-059B — this helper used to call logAudit() directly, which withTransaction()'s rollback
  // then silently erased on every single call (live-confirmed in the ERP-059 forensic gate — the
  // Phase 41 fix immediately above had never actually worked). Now attaches the same payload as
  // `durableFailureAudit` instead, so it survives the rollback (see ERP-059B-TRANSACTION-
  // DESIGN.md) — every one of this function's rejection paths below still funnels through this
  // one helper, so all of them are fixed by this single change.
  const rejectReversal = (error, extra) => ({ok:false, error, durableFailureAudit:{type:'ReversalRejected', entryId, reason:reason||null, error, ...extra}});
  // Phase 24 §7 — same rationale as postDraft(): reversal is a financial posting in its own right
  // and now checks its own base permission internally, not only via the route layer.
  if(!can(actor,'reverse')) return rejectReversal(`Role "${actor.role}" is not authorized to reverse postings.`);
  // Phase 25 §7 — POLICY DECISION (confirmed): ALL reversals require a non-blank reason, not only
  // the closed-project override case. Previously an ordinary reversal of an open document could go
  // through with no explanation at all, narrated "no reason given" — every reversal now carries an
  // audit trail explaining why it happened, matching how the closed-period/closed-project override
  // idiom already worked elsewhere. No length cap and no character restriction — a reason is
  // rejected only for being blank or whitespace-only, never for being long or containing special
  // characters.
  if(!reason || !String(reason).trim()) return rejectReversal('A reason is required to reverse a posting.');
  const orig = DB.journalEntries.find(e=>e.id===entryId);
  if(!orig) return rejectReversal('Original document not found.');
  if(orig.reversedByEntryId) return rejectReversal(`Already reversed by ${orig.reversedByEntryId}.`);
  // Phase 34 CRITICAL FIX — found live via Scenario 10's explicit "reverse the reversal" test:
  // nothing here ever checked whether the document BEING reversed is ITSELF a reversal entry.
  // reverseEntry() always just flips whatever lines it is given — flipping a reversal's lines a
  // second time exactly RECREATES the original entry's economic effect (proven live: Dr Material
  // Cost 8000 / Cr Inventory 8000, identical to the original Material Issue). But the special-cased
  // inventory-compensation logic below (grnReversalPlan/miReversalPlan) only ever triggers when
  // orig.sourceType is 'GRN' or 'MaterialIssue' — a reversal's own sourceType is always 'Reversal',
  // so reversing IT creates zero compensating inventory movement. Net effect proven live: the GL
  // shows inventory reduced by ₹8,000 a second time, while the actual inventoryMovements ledger
  // shows net ZERO units ever left stock (Issue -10, compensating Receipt +10) — a real, silent
  // GL-vs-physical-inventory divergence with no guard preventing it. The correct fix is not to make
  // the inventory compensation "smarter" for this case (that would legitimize re-creating a real
  // physical consumption event with no actual material movement behind it) — it is to refuse the
  // operation entirely, matching real double-entry practice: undoing a mistaken reversal is done by
  // posting the ORIGINAL transaction again as its own new, freshly-authorized document (which
  // creates its own real inventory movement), never by reversing the reversal itself.
  if(orig.sourceType==='Reversal'){
    return rejectReversal(`Cannot reverse ${orig.id} — it is itself a reversal entry (of ${orig.reversalOfId}). Reversing a reversal would recreate the original transaction's economic effect with no corresponding inventory/document movement behind it. If the original transaction is genuinely needed again, post it again as a new, independently-authorized document.`);
  }
  if(DB.clearings.some(c=>c.invoiceEntryId===entryId)){
    return rejectReversal('Cannot reverse a document that already has clearings against it — the clearing(s) must be reversed/undone first.');
  }
  // Phase 24 self-test defect fix: reversing the PAYMENT SIDE of a clearing (a receipt, supplier
  // payment, credit note or debit note that already cleared an invoice) used to leave the
  // clearing record in place, so the invoice stayed "Cleared" in the open-items subledger even
  // though the GL now correctly showed the payment reversed — AR/AP subledger silently diverged
  // from the control account. Found live via the Phase 24 multi-bank self-test (a routine
  // "reverse this receipt" scenario). Fixed by voiding the clearing(s) that reference THIS entry
  // as their paymentEntryId at the same moment it is reversed, so the invoice correctly reopens
  // and subledger/control move back into agreement together — not by blocking the reversal
  // outright, which would make correcting a mistaken receipt/payment impractical.
  // Phase 41 FIX — a Phase 4 finding: reversing a transaction against a formally CLOSED project
  // was not gated at all, letting a project's supposedly-final financial state change after
  // closure with no special authorization. Mirrors the existing closed-financial-period idiom
  // exactly: blocked by default, only CEO/Admin may override. The reason requirement used to be
  // stated a second time right here — Phase 25 §7 made it unconditional above, so by this point
  // `reason` is already guaranteed non-blank; restating the check here would be dead code.
  const projectIdOnEntry = (orig.lines||[]).map(l=>l.projectId).find(Boolean);
  if(projectIdOnEntry){
    const proj = DB.projects.find(p=>p.id===projectIdOnEntry);
    if(proj && proj.status==='CLOSED'){
      if(!['CEO','Admin'].includes(actor.role)){
        return rejectReversal(`Cannot reverse — project ${proj.id} (${proj.name}) is CLOSED. Only CEO/Admin may reverse a transaction against a closed project, and only with an explicit reason.`, {projectId:proj.id});
      }
      logAudit({type:'ClosedProjectReversalOverride', projectId:proj.id, entryId, reason, userId:actor.id, role:actor.role});
    }
  }
  const clearingsToVoid = DB.clearings.filter(c=>c.paymentEntryId===entryId);
  // Phase 37 CRITICAL FIX — reversing a GRN's or Material Issue's GL entry used to leave the
  // corresponding DB.inventoryMovements record completely untouched: the GL correctly nets to
  // zero, but recorded stock never moves, so GL and physical inventory silently diverge forever
  // (found live in the Phase 2 adversarial audit — a reversed ₹28,000 GRN receipt left its
  // 10-sheet Receipt movement in place with no compensating entry). Fixed by validating and then
  // posting a real compensating movement for both source types, BEFORE the GL reversal below is
  // allowed to proceed — so this is all-or-nothing: either both the GL and the stock ledger
  // reverse together, or neither does. Never a partial reversal that leaves one side corrected and
  // the other stale.
  let grnReversalPlan = null;
  if(orig.sourceType==='GRN'){
    const grn = DB.grns.find(g=>g.id===orig.sourceId);
    if(!grn) return rejectReversal('Cannot reverse — the source GRN record no longer exists.');
    if(grn.reversed) return rejectReversal(`GRN ${grn.grnNo} was already reversed by ${grn.reversalEntryId}.`, {grnId:grn.id});
    const alreadyInvoiced = Object.values(grn.qtyInvoicedByLine||{}).some(q=>(+q||0)>0.001);
    if(alreadyInvoiced) return rejectReversal(`Cannot reverse GRN ${grn.grnNo} — it has already been invoiced (a Supplier Bill references it). Reverse the Supplier Bill first, then reverse this GRN.`, {grnId:grn.id});
    const receiptMoves = DB.inventoryMovements.filter(m=>m.sourceType==='GRN' && m.sourceId===grn.id && m.type==='Receipt');
    for(const m of receiptMoves){
      const available = m.siteId ? getSiteStockLevel(m.materialId, m.siteId) : getStockLevel(m.materialId, m.warehouseId);
      if(available - m.qty < -0.001){
        const mat = DB.materials.find(x=>x.id===m.materialId);
        return rejectReversal(`Cannot reverse GRN ${grn.grnNo} — ${available} ${mat?mat.uom:''} of ${mat?mat.description:m.materialId} remain in stock, but this receipt brought in ${m.qty}; the rest has already been issued/transferred elsewhere. Resolve that consumption first — reversing now would drive stock negative, which is never silently allowed.`, {grnId:grn.id, materialId:m.materialId});
      }
    }
    grnReversalPlan = {grn, receiptMoves};
  }
  let miReversalPlan = null;
  if(orig.sourceType==='MaterialIssue'){
    const issueMove = DB.inventoryMovements.find(m=>m.id===orig.sourceId && (m.type==='Issue' || m.type==='SiteConsumption'));
    if(!issueMove) return rejectReversal('Cannot reverse — the source Material Issue movement no longer exists.');
    if(DB.inventoryMovements.some(m=>m.sourceType==='MaterialIssueReversal' && m.sourceId===issueMove.id)){
      return rejectReversal('This Material Issue has already been reversed.', {movementId:issueMove.id});
    }
    miReversalPlan = {issueMove};
  }
  const flippedLines = orig.lines.map(l=>({...l, debit:l.credit, credit:l.debit}));
  // A reversal already mandates a real business reason (the `reason` param) — if it also happens
  // to need a closed-period override, that SAME reason satisfies the override requirement too,
  // rather than forcing the user to type it twice.
  const result = postJournalEntry({ date:new Date().toISOString().slice(0,10), narration:`Reversal of ${orig.voucherNo} (${orig.id}) — ${reason||'no reason given'}`,
    sourceType:'Reversal', sourceId:orig.id, party:orig.party, reversalOfId:orig.id, docCategory:orig.docCategory, lines:flippedLines,
    actor, capability:'GL_REVERSE', overrideReason:reason });
  if(!result.ok) return rejectReversal(result.error);
  orig.reversedByEntryId = result.entry.id;
  save();
  logAudit({type:'Reversal', originalEntryId:orig.id, reversalEntryId:result.entry.id, reason:reason||'(no reason given)', userId:actor.id, role:actor.role});
  // Phase 24 self-test defect fix (continued from the clearingsToVoid declaration above): void
  // every clearing this entry was the PAYMENT side of, so the invoice it had cleared correctly
  // reopens in the open-items subledger, keeping it in agreement with the GL control account
  // which the reversal above already corrected. Removed, not merely flagged, so
  // customerOpenItems()/supplierOpenItems() (which sum ALL matching clearings unconditionally)
  // never see it again — audited individually so the removal itself is traceable.
  if(clearingsToVoid.length){
    clearingsToVoid.forEach(c=>{
      logAudit({type:'ClearingVoidedByReversal', clearingId:c.id, invoiceEntryId:c.invoiceEntryId, paymentEntryId:c.paymentEntryId, amount:c.amount, reversalEntryId:result.entry.id, userId:actor.id, role:actor.role});
    });
    DB.clearings = DB.clearings.filter(c=>c.paymentEntryId!==entryId);
    save();
  }
  // Phase 13 POL-01 (Option B, approved): if this reversed a milestone-sourced invoice, the
  // ORIGINAL milestone is never reopened/reset to Ready — it is marked as a distinct terminal
  // state that preserves it was genuinely invoiced and that invoice was later reversed. This is
  // an additive hook on the business-process record only; the accounting document itself (orig,
  // result.entry) is never touched beyond the standard reversal already performed above.
  const sourceDraft = DB.jeDrafts.find(d=>d.postedEntryId===orig.id && d.billingMilestoneId);
  if(sourceDraft){
    const bm = DB.billingMilestones.find(m=>m.id===sourceDraft.billingMilestoneId);
    if(bm && bm.status==='Invoiced'){
      bm.status = 'Invoiced-Reversed'; bm.reversalEntryId = result.entry.id; bm.reversedAt = nowIso(); save();
      logAudit({type:'BillingMilestoneMarkedReversed', milestoneId:bm.id, reversalEntryId:result.entry.id, userId:actor.id, role:actor.role});
    }
  }
  // Phase 24 Part C12 — same additive-hook pattern as the billing-milestone case above: if this
  // reversed a GRN's own posting, restore the commitment by that exact GRN's received value.
  // Purely additive — the accounting reversal above (orig/result.entry) is complete and correct
  // on its own; this only keeps the SEPARATE operational commitment model in sync with it.
  if(orig.sourceType==='GRN'){
    const grn = DB.grns.find(g=>g.id===orig.sourceId);
    if(grn){
      const restoredValue = orig.totalDebit; // the GRN's own Dr Inventory line = totalAcceptedValue at the time it was posted
      const c = DB.commitments.find(x=>x.poId===grn.poId);
      if(c){
        c.consumedAmount = r2(Math.max(0, c.consumedAmount - restoredValue));
        c.remainingAmount = r2(c.originalAmount - c.consumedAmount);
        if(c.status==='FullyConsumed' && c.remainingAmount>0.01) c.status = 'Open';
        c.lastUpdated = nowIso(); save();
        logAudit({type:'CommitmentRestoredByReversal', commitmentId:c.id, poId:grn.poId, restoredValue, remainingAmount:c.remainingAmount, userId:actor.id, role:actor.role});
      }
    }
  }
  // Phase 37 CRITICAL FIX (continued) — the actual inventory-side compensation, validated as safe
  // above before the GL reversal was ever posted. Each original Receipt gets a mirrored Issue-type
  // movement (same qty, valued at the CURRENT moving-average rate — exactly how any other Issue is
  // valued), and the PO's own received-quantity tracking is rolled back so a later GRN against the
  // same PO/line is checked against the correct, now-reduced received quantity, not a stale one.
  if(grnReversalPlan){
    const {grn, receiptMoves} = grnReversalPlan;
    const po = DB.purchaseOrders.find(p=>p.id===grn.poId);
    receiptMoves.forEach(m=>{
      const rate = m.siteId ? getSiteMovingAverageRate(m.materialId, m.siteId) : getMovingAverageRate(m.materialId, m.warehouseId);
      const compensating = postInventoryMovement({type:'Issue', materialId:m.materialId, qty:m.qty, uom:m.uom, warehouseId:m.warehouseId,
        siteId:m.siteId||null, locationId:m.locationId||null, projectId:m.projectId, sourceType:'GRNReversal', sourceId:grn.id, valuationRate:rate, actor, capability:'GL_REVERSE' });
      logAudit({type:'InventoryReversedByGRNReversal', grnId:grn.id, originalMovementId:m.id, compensatingMovementId:compensating.id, materialId:m.materialId, qty:m.qty, userId:actor.id, role:actor.role});
    });
    if(po){
      grn.lines.forEach((l,idx)=>{
        const poLineIdx = po.lines.findIndex(pl=>pl.materialId===l.materialId);
        if(poLineIdx>=0 && po.qtyReceivedByLine[poLineIdx]!=null){
          po.qtyReceivedByLine[poLineIdx] = r2(Math.max(0, po.qtyReceivedByLine[poLineIdx] - (+l.qtyAccepted||0)));
        }
      });
      const anyReceived = po.lines.some((pl,idx)=>(po.qtyReceivedByLine[idx]||0)>0.001);
      const fullyReceived = po.lines.every((pl,idx)=>(po.qtyReceivedByLine[idx]||0) >= pl.qty - 0.001);
      po.status = fullyReceived ? 'FullyReceived' : (anyReceived ? 'PartiallyReceived' : 'Approved');
    }
    grn.reversed = true; grn.reversedAt = nowIso(); grn.reversalEntryId = result.entry.id; grn.reversalReason = reason||'';
    save();
    logAudit({type:'GRNReversed', grnId:grn.id, poId:grn.poId, reversalEntryId:result.entry.id, userId:actor.id, role:actor.role});
  }
  if(miReversalPlan){
    const {issueMove} = miReversalPlan;
    const compensating = postInventoryMovement({type:'Receipt', materialId:issueMove.materialId, qty:issueMove.qty, uom:issueMove.uom,
      warehouseId:issueMove.warehouseId, siteId:issueMove.siteId||null, locationId:issueMove.locationId||null, projectId:issueMove.projectId,
      sourceType:'MaterialIssueReversal', sourceId:issueMove.id, valuationRate:issueMove.valuationRate, actor, capability:'GL_REVERSE' });
    logAudit({type:'InventoryReversedByMaterialIssueReversal', originalMovementId:issueMove.id, compensatingMovementId:compensating.id,
      materialId:issueMove.materialId, qty:issueMove.qty, userId:actor.id, role:actor.role});
  }
  // Phase 27 — same additive-hook pattern as the GRN/commitment case above: if this reversed a
  // PO-aware Supplier Bill (draftSupplierInvoiceFromPO), release the qty it had reserved against
  // the GRN/PO's invoiceable balance, so the same material can be correctly rebilled after the
  // mistaken invoice is reversed — otherwise the balance would stay permanently consumed even
  // though the AP/GR-IR side was correctly reversed above.
  if(orig.docCategory==='SupplierInvoice'){
    const sourceDraft2 = DB.jeDrafts.find(d=>d.postedEntryId===orig.id && d.grnId);
    if(sourceDraft2) releaseInvoiceReservation(sourceDraft2);
  }
  return {ok:true, entry:result.entry, original:orig};
}
// Phase 13 POL-01: the ONLY way to re-bill after a milestone's invoice was reversed — creates a
// genuinely NEW milestone record (its own id, its own full Pending->Ready->Invoiced lifecycle),
// explicitly linked back to the one it supersedes. The original stays frozen at
// 'Invoiced-Reversed' forever — never reopened, never silently reused for a second invoice.
function createRebillMilestone({originalMilestoneId, amount, triggerNote, actor}){
  const orig = DB.billingMilestones.find(m=>m.id===originalMilestoneId);
  if(!orig) return {ok:false, error:'Original billing milestone not found.'};
  if(orig.status!=='Invoiced-Reversed') return {ok:false, error:`Cannot rebill — original milestone is "${orig.status}", not Invoiced-Reversed. A milestone can only be rebilled after its invoice was reversed.`};
  const bm = { id:nextId(DB.billingMilestones, 'BM-', 4), projectId:orig.projectId, milestoneType:orig.milestoneType,
    amount: amount!==undefined ? +amount : orig.amount, triggerNote: triggerNote || `Rebill of ${orig.id} (reversed)`,
    status:'Pending', invoiceEntryId:null, rebillOfMilestoneId:orig.id, createdBy:actor.id, createdAt:nowIso() };
  DB.billingMilestones.push(bm); save();
  orig.rebilledIntoId = bm.id; save();
  logAudit({type:'BillingMilestoneRebilled', originalMilestoneId:orig.id, newMilestoneId:bm.id, userId:actor.id, role:actor.role});
  return {ok:true, milestone:bm, original:orig};
}

// ---------- AR/AP (unchanged from Phase 5, including the Phase-5 defect fixes) ----------
const AR_ACCOUNT='1100', AP_ACCOUNT='2000';
const AR_DOC_CATEGORIES=['CustomerInvoice','CustomerReceipt'], AP_DOC_CATEGORIES=['SupplierInvoice','SupplierPayment'];
function calcTax(taxCode, baseAmount){
  const tc = DB.taxCodes.find(t=>t.code===taxCode); if(!tc) return null;
  const base = +baseAmount||0;
  const cgst = Math.round(base*tc.cgstPct)/100, sgst = Math.round(base*tc.sgstPct)/100, igst = Math.round(base*tc.igstPct)/100;
  const taxAmount = cgst+sgst+igst;
  return {base, cgst, sgst, igst, taxAmount, total: base+taxAmount};
}
// Phase 15 §8 — Branch inherits from the Project (a project genuinely belongs to one branch/
// office in Appletree's real business), so downstream transactions (GRN, Material Issue,
// Invoices) don't need a manual Branch selector on every single form — only Manual JE and the
// Project master itself need explicit selection. Never forces Branch onto something meaningless.
function projectBranch(projectId){ const p = DB.projects.find(x=>x.id===projectId); return p ? (p.branchId||null) : null; }
function setProjectBranch({projectId, branchId, actor}){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return {ok:false, error:'Project not found.'};
  if(branchId && !DB.branches.find(b=>b.id===branchId)) return {ok:false, error:`Unknown branch "${branchId}".`};
  p.branchId = branchId||null; save();
  logAudit({type:'ProjectBranchSet', projectId, branchId, userId:actor.id, role:actor.role});
  return {ok:true, project:p};
}
// P0-2 FIX — the authoritative billing-ceiling formula. Built ONLY from fields the existing
// architecture already treats as authoritative commercial values — no new field invented:
//   ceilingBase          = project.budget (set once, at Won-transition, to the accepted quotation's
//                           finalPrice — for a migration/admin-created project with no quotation,
//                           it is whatever commercial value was explicitly declared at creation).
//   approvedVariationValue = sum of DB.changeRequests.revenueImpact for this project where
//                           status==='Approved' — the ONLY "approved commercial adjustment"
//                           mechanism that exists in this codebase today (a Draft/unapproved/
//                           rejected Change Request contributes nothing, by construction — it is
//                           simply never in the 'Approved' set this sums over).
//   totalApprovedCeiling = ceilingBase + approvedVariationValue.
//   billedToDate          = net AR impact (debit-credit on account 1100) of every POSTED, non-
//                           reversed GL line tagged to this project with docCategory:'CustomerInvoice'
//                           — which in this codebase already covers ordinary invoices (debit, adds),
//                           Customer Credit Notes (credit, subtracts) and Customer Debit Notes
//                           (debit, adds) uniformly, since all three share that docCategory tag.
// ceilingEstablished is false when ceilingBase is 0 — a project that never had any commercial value
// recorded against it (e.g. legacy/test data predating this control) is left unenforced rather than
// having every possible invoice blocked by a ceiling nobody ever actually set; this is a deliberate,
// disclosed scope boundary, not an oversight — see the P0 remediation report.
function projectBillingCeiling(projectId){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return null;
  const approvedCRs = DB.changeRequests.filter(c=>c.projectId===projectId && c.status==='Approved');
  const approvedVariationValue = r2(approvedCRs.reduce((s,c)=>s+(+c.revenueImpact||0),0));
  const ceilingBase = +p.budget||0;
  const totalApprovedCeiling = r2(ceilingBase + approvedVariationValue);
  const billedToDate = r2(allLines().filter(l=>l.projectId===projectId && l.account===AR_ACCOUNT && l.docCategory==='CustomerInvoice' && !l.reversalOfId && !l.reversedByEntryId)
    .reduce((s,l)=>s+l.debit-l.credit,0));
  const remainingCeiling = r2(totalApprovedCeiling - billedToDate);
  // Project Variation Phase 4 — PURELY ADDITIVE reporting breakdown of approvedVariationValue.
  // totalApprovedCeiling/billedToDate/remainingCeiling above are UNCHANGED — the same protected P0-2
  // formula, still the sole authority draftCustomerInvoice()/postDraft() enforce against. These two
  // new fields answer "how much of the currently-Approved variation capacity has been explicitly
  // consumed by an allocated, POSTED invoice" (consumedVariationValue) vs. "how much of it remains
  // available for a NEW allocation" (availableVariationValue) — read-only, derived, never stored
  // independently (so it can never drift out of sync with the CRs it sums).
  const consumedVariationValue = r2(approvedCRs.reduce((s,c)=>s+(+c.consumedRevenue||0),0));
  const availableVariationValue = r2(approvedVariationValue - consumedVariationValue);
  return { projectId, ceilingBase, approvedVariationValue, totalApprovedCeiling, billedToDate, remainingCeiling, ceilingEstablished: ceilingBase>0.001,
    consumedVariationValue, availableVariationValue };
}
// ---------- Excess Billing Approval (genuine second-person maker-checker, same shape as Excess
// Material Issue Approval) ----------
function assertCanApproveExcessBilling(actor){ return can(actor,'approve') ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot approve an Excess Billing request.`}; }
function createExcessBillingApprovalRequest({projectId, customerId, requestedAmount, reason, actor}){
  if(!can(actor,'create')) return {ok:false, error:`Role "${actor.role}" cannot request an Excess Billing approval.`};
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return {ok:false, error:'Project not found.'};
  if(p.customerId && customerId && p.customerId!==customerId) return {ok:false, error:`Project "${projectId}" belongs to a different customer.`};
  if(!reason || !String(reason).trim()) return {ok:false, error:'A reason is required to request an Excess Billing approval.'};
  { const v = assertPositiveFiniteNumber(requestedAmount, 'Requested amount'); if(!v.ok) return v; }
  const ceiling = projectBillingCeiling(projectId);
  const cumulativeAfter = r2(ceiling.billedToDate + (+requestedAmount));
  if(ceiling.ceilingEstablished && cumulativeAfter <= ceiling.totalApprovedCeiling + 0.01){
    return {ok:false, error:`Requested amount (₹${(+requestedAmount).toLocaleString('en-IN')}) is within the remaining billing ceiling (₹${ceiling.remainingCeiling.toLocaleString('en-IN')}) — post the invoice directly, no excess approval is needed.`};
  }
  const dup = DB.excessBillingApprovals.find(x=>x.projectId===projectId && x.status==='Pending' && x.requestedBy===actor.id);
  if(dup) return {ok:true, excessBillingApproval:dup, duplicate:true, note:'An identical request from you is already Pending — reusing it rather than creating a duplicate.'};
  const xba = { id: nextId(DB.excessBillingApprovals, 'XBA-', 4), docNo: nextDocNumber('XBA'),
    projectId, customerId: customerId||p.customerId||null,
    ceilingBase:ceiling.ceilingBase, approvedVariationValue:ceiling.approvedVariationValue, totalApprovedCeiling:ceiling.totalApprovedCeiling,
    billedToDate:ceiling.billedToDate, requestedAmount:+requestedAmount, excessAmount:r2(cumulativeAfter-ceiling.totalApprovedCeiling), reason:String(reason).trim(),
    requestedBy:actor.id, requestedByRole:actor.role, requestedAt:nowIso(),
    status:'Pending', approvedBy:null, approvedByRole:null, approvedAt:null,
    rejectedBy:null, rejectedAt:null, rejectReason:null, cancelledBy:null, cancelledAt:null,
    consumedAmount:0, consumingDraftIds:[] };
  DB.excessBillingApprovals.push(xba); save();
  logAudit({type:'ExcessBillingRequested', xbaId:xba.id, projectId, requestedAmount:+requestedAmount, excessAmount:xba.excessAmount, userId:actor.id, role:actor.role});
  return {ok:true, excessBillingApproval:xba};
}
function approveExcessBillingApprovalRequest({id, actor, overrideReason}){
  const xba = DB.excessBillingApprovals.find(x=>x.id===id);
  if(!xba) return {ok:false, error:'Excess Billing request not found.'};
  if(xba.status!=='Pending') return {ok:false, error:`Cannot approve — status is "${xba.status}", not Pending.`};
  const authz = assertCanApproveExcessBilling(actor); if(!authz.ok) return authz;
  // Unconditional — deliberately NO Admin/CEO self-approval exemption, matching the Excess Material
  // Issue Approval precedent this control is modeled on: the entire point of this control is a
  // genuine second person, for anyone, always.
  if(xba.requestedBy===actor.id) return {ok:false, error:'Segregation of duties: the requester cannot approve their own Excess Billing request.'};
  const po = assertProjectOpenForPosting(xba.projectId, actor, {overrideReason, action:'approve an Excess Billing request'});
  if(!po.ok) return po;
  // Re-validate against the CURRENT ceiling, not the numbers captured at request time — an
  // intervening approved Change Request (or additional billing already posted by someone else)
  // may have made this request's figures stale.
  const fresh = projectBillingCeiling(xba.projectId);
  const stillExcess = !fresh.ceilingEstablished || r2(fresh.billedToDate + xba.requestedAmount) > fresh.totalApprovedCeiling + 0.01;
  if(!stillExcess){
    return {ok:false, error:'The billing ceiling for this project has since changed (e.g. an additional variation was approved, or other billing was posted) — this request no longer represents a genuine excess. Reject it and ask the requester to post directly or raise a fresh request if still needed.', stale:true, currentCeiling:fresh};
  }
  xba.status='Approved'; xba.approvedBy=actor.id; xba.approvedByRole=actor.role; xba.approvedAt=nowIso(); save();
  logAudit({type:'ExcessBillingApproved', xbaId:xba.id, projectId:xba.projectId, requestedAmount:xba.requestedAmount, excessAmount:xba.excessAmount, userId:actor.id, role:actor.role});
  return {ok:true, excessBillingApproval:xba};
}
function rejectExcessBillingApprovalRequest({id, reason, actor}){
  const xba = DB.excessBillingApprovals.find(x=>x.id===id);
  if(!xba) return {ok:false, error:'Excess Billing request not found.'};
  if(xba.status!=='Pending') return {ok:false, error:`Cannot reject — status is "${xba.status}", not Pending.`};
  const authz = assertCanApproveExcessBilling(actor); if(!authz.ok) return authz;
  if(xba.requestedBy===actor.id) return {ok:false, error:'Segregation of duties: the requester cannot decide on their own Excess Billing request — ask another authorized approver, or Cancel it instead.'};
  xba.status='Rejected'; xba.rejectedBy=actor.id; xba.rejectedAt=nowIso(); xba.rejectReason=reason||''; save();
  logAudit({type:'ExcessBillingRejected', xbaId:xba.id, projectId:xba.projectId, reason, userId:actor.id, role:actor.role});
  return {ok:true, excessBillingApproval:xba};
}
function cancelExcessBillingApprovalRequest({id, actor}){
  const xba = DB.excessBillingApprovals.find(x=>x.id===id);
  if(!xba) return {ok:false, error:'Excess Billing request not found.'};
  if(xba.status!=='Pending') return {ok:false, error:`Cannot cancel — status is "${xba.status}", not Pending.`};
  if(xba.requestedBy!==actor.id && !['Admin','CEO'].includes(actor.role)) return {ok:false, error:'Only the original requester (or Admin/CEO) may cancel this request.'};
  xba.status='Cancelled'; xba.cancelledBy=actor.id; xba.cancelledAt=nowIso(); save();
  logAudit({type:'ExcessBillingCancelled', xbaId:xba.id, projectId:xba.projectId, userId:actor.id, role:actor.role});
  return {ok:true, excessBillingApproval:xba};
}
// ---------- Project Variation Phase 4 — explicit Change Request billing consumption ----------
// Reused, not reinvented: this mirrors excessBillingApprovalId's own "store a soft-validated
// reference on the draft at creation, re-validate and CONSUME authoritatively at postDraft()" shape
// exactly. The one structural difference (why a single FK is not enough, per the phase's own
// instruction): an invoice may draw on MULTIPLE approved CRs at once, and may legitimately be part
// baseline / part variation — so this is an ARRAY of {changeRequestId, amount}, not a bare id.
// `strict` distinguishes the two call sites: at draft-creation time (strict:false) a NOW-invalid
// allocation is rejected outright (same as any other bad input) since nothing has committed yet;
// at post time (strict:true, called from postDraft()) the SAME checks are re-run against the
// CURRENT state of each CR — a draft can sit for a while, and another invoice may have consumed
// capacity in the meantime, exactly the staleness class excessBillingApprovalId already guards.
function validateVariationAllocations(rawAllocations, projectId, invoiceAmount){
  if(rawAllocations===undefined || rawAllocations===null) return {ok:true, allocations:[]};
  if(!Array.isArray(rawAllocations)) return {ok:false, error:'variationAllocations must be an array of {changeRequestId, amount}.'};
  if(!rawAllocations.length) return {ok:true, allocations:[]};
  const byId = new Map(); // consolidate duplicate CR entries within one invoice, rather than reject —
  // a legitimate UI could easily submit two lines for the same CR (e.g. built from two separate
  // line items that both happen to draw on it); summing is the safe interpretation, never silently
  // dropping value the caller intended to allocate.
  for(const raw of rawAllocations){
    if(!raw || typeof raw!=='object' || Array.isArray(raw)) return {ok:false, error:'Each variation allocation must be an object of the form {changeRequestId, amount}.'};
    const { changeRequestId, amount } = raw;
    if(!changeRequestId || typeof changeRequestId!=='string') return {ok:false, error:'Each variation allocation requires a changeRequestId.'};
    const n = Number(amount);
    if(amount===undefined || amount===null || amount===''){ return {ok:false, error:`Allocation for "${changeRequestId}" requires an amount.`}; }
    if(!Number.isFinite(n)) return {ok:false, error:`Allocation amount for "${changeRequestId}" must be a real, finite number — got "${amount}".`};
    if(n<=0) return {ok:false, error:`Allocation amount for "${changeRequestId}" must be greater than zero — got ${n}.`};
    byId.set(changeRequestId, r2((byId.get(changeRequestId)||0) + n));
  }
  const allocations = [];
  let total = 0;
  for(const [changeRequestId, amount] of byId){
    const cr = DB.changeRequests.find(c=>c.id===changeRequestId);
    if(!cr) return {ok:false, error:`Change Request "${changeRequestId}" does not exist.`};
    if(cr.projectId!==projectId) return {ok:false, error:`Change Request "${changeRequestId}" belongs to project "${cr.projectId}", not "${projectId}" — cannot allocate variation billing across projects.`};
    if(cr.status!=='Approved') return {ok:false, error:`Change Request "${changeRequestId}" is "${cr.status}", not Approved — only an Approved variation can authorize billing.`};
    if(amount > (+cr.revenueImpact||0) + 0.01) return {ok:false, error:`Allocation of ₹${amount.toLocaleString('en-IN')} for "${changeRequestId}" exceeds its total revenueImpact of ₹${(+cr.revenueImpact).toLocaleString('en-IN')}.`};
    const available = r2((+cr.revenueImpact||0) - (+cr.consumedRevenue||0));
    if(amount > available + 0.01) return {ok:false, error:`Allocation of ₹${amount.toLocaleString('en-IN')} for "${changeRequestId}" exceeds its remaining unconsumed capacity of ₹${available.toLocaleString('en-IN')} (₹${(+cr.consumedRevenue).toLocaleString('en-IN')} already consumed).`};
    allocations.push({changeRequestId, amount});
    total = r2(total + amount);
  }
  if(invoiceAmount!==undefined && invoiceAmount!==null && total > invoiceAmount + 0.01){
    return {ok:false, error:`Total variation allocation (₹${total.toLocaleString('en-IN')}) exceeds this invoice's own amount (₹${invoiceAmount.toLocaleString('en-IN')}) — an invoice cannot allocate more variation value than it is actually billing for.`};
  }
  return {ok:true, allocations, total};
}
function draftCustomerInvoice({customerId, projectId, baseAmount, taxCode, date, narration, branchId, createdByUserId, createdByRole, excessBillingApprovalId, variationAllocations}){
  const base = +baseAmount||0;
  if(!customerId || !projectId || base<=0) return {ok:false, error:'Customer, project and a positive amount are required.'};
  const inactiveErr = assertCustomerSelectable(customerId); if(inactiveErr) return {ok:false, error:inactiveErr};
  // Phase 39 CRITICAL FIX — found live: a phantom projectId was accepted at draft creation (only
  // caught much later, at post time, by postJournalEntry()'s own line-level check) — now rejected
  // at the earliest point, matching this codebase's own stated "reject at the earliest possible
  // point" principle. More seriously: a real, POSTED GL entry (JE-1038) was created billing
  // Customer CUST-1 for revenue against Project PRJ-006 — a project that actually belongs to a
  // DIFFERENT customer (CUST-011) — because nothing ever checked the two references were
  // consistent with each other. Individually, "CUST-1 exists" and "PRJ-006 exists" were both true;
  // jointly, the combination was nonsensical, and nothing caught it, at draft OR post time (a
  // project's customerId is not one of postJournalEntry()'s own line-level FK checks). A project
  // with no customerId set (e.g. an internal project) is unaffected — this only rejects a genuine
  // MISMATCH, never requires a customer link that doesn't exist.
  const proj = DB.projects.find(p=>p.id===projectId);
  if(!proj) return {ok:false, error:`Unknown project "${projectId}".`};
  if(proj.customerId && proj.customerId!==customerId) return {ok:false, error:`Project "${projectId}" belongs to a different customer ("${proj.customerId}"), not "${customerId}" — cannot invoice one customer for another customer's project.`};
  const tax = taxCode ? calcTax(taxCode, base) : null;
  const invoiceAmount = r2(base+(tax?tax.taxAmount:0));
  // Project Variation Phase 4 — soft (draft-time) validation. Re-validated authoritatively, against
  // then-CURRENT CR state, inside postDraft() below — a draft can sit a while before posting.
  const _va = validateVariationAllocations(variationAllocations, projectId, invoiceAmount);
  if(!_va.ok) return _va;
  // P0-2 FIX — the billing-ceiling gate, checked at the earliest point (draft creation), same
  // "reject at the earliest possible point" principle as the customer/project consistency check
  // just above. Re-checked again, authoritatively, at postDraft() — this earlier check is real
  // enforcement for the common case (nothing can even be drafted over-ceiling without a genuine
  // approval already in hand) but is NOT the sole gate, since a draft on its own has zero GL effect.
  const ceiling = projectBillingCeiling(projectId);
  let usedExcessBillingApproval = null;
  if(ceiling && ceiling.ceilingEstablished){
    const cumulativeAfter = r2(ceiling.billedToDate + invoiceAmount);
    if(cumulativeAfter > ceiling.totalApprovedCeiling + 0.01){
      if(excessBillingApprovalId){
        const xba = DB.excessBillingApprovals.find(x=>x.id===excessBillingApprovalId);
        if(!xba) return {ok:false, error:`Excess Billing Approval "${excessBillingApprovalId}" not found.`};
        if(xba.status!=='Approved') return {ok:false, error:`Excess Billing Approval "${excessBillingApprovalId}" is "${xba.status}", not Approved — cannot draft against it.`};
        if(xba.projectId!==projectId) return {ok:false, error:`Excess Billing Approval "${excessBillingApprovalId}" does not match this project.`};
        const remainingOnApproval = r2(xba.requestedAmount - xba.consumedAmount);
        if(invoiceAmount > remainingOnApproval + 0.01){
          return {ok:false, error:`Excess Billing Approval "${excessBillingApprovalId}" only covers ₹${remainingOnApproval.toLocaleString('en-IN')} more (already consumed ₹${xba.consumedAmount.toLocaleString('en-IN')} of ₹${xba.requestedAmount.toLocaleString('en-IN')}) — this invoice of ₹${invoiceAmount.toLocaleString('en-IN')} exceeds it.`};
        }
        usedExcessBillingApproval = xba;
      } else {
        const excess = r2(cumulativeAfter - ceiling.totalApprovedCeiling);
        return {ok:false, error:`Exceeds the approved commercial ceiling for project ${projectId} — accepted quotation/budget ₹${ceiling.ceilingBase.toLocaleString('en-IN')} + approved variation ₹${ceiling.approvedVariationValue.toLocaleString('en-IN')} = ₹${ceiling.totalApprovedCeiling.toLocaleString('en-IN')}, already billed ₹${ceiling.billedToDate.toLocaleString('en-IN')}, remaining ₹${ceiling.remainingCeiling.toLocaleString('en-IN')}. This invoice of ₹${invoiceAmount.toLocaleString('en-IN')} exceeds the remaining ceiling by ₹${excess.toLocaleString('en-IN')} — an Excess Billing Approval must be raised and approved by an authorized manager (Admin/CEO/FinanceManager, other than the requester) before this can post.`,
          requiresExcessBillingApproval:true, ceiling, excess};
      }
    }
  }
  const lines = [ {account:AR_ACCOUNT, debit: invoiceAmount, credit:0, customerId, projectId, taxCode:taxCode||null},
    {account:'4000', debit:0, credit:base, customerId, projectId} ];
  if(tax && tax.taxAmount>0) lines.push({account:'2200', debit:0, credit:tax.taxAmount, customerId, projectId, taxCode});
  return createDraft({date, narration:narration||'Customer Invoice', docTypeCode:'INV', sourceType:'Customer Invoice', docCategory:'CustomerInvoice', party:customerId, lines, branchId:branchId||projectBranch(projectId), createdByUserId, createdByRole,
    excessBillingApprovalId: usedExcessBillingApproval?usedExcessBillingApproval.id:null, variationAllocations:_va.allocations});
}
// P0-3 FIX — the vendor-category mapping used to decide which vendors this hard block applies to.
// Deliberately narrow and evidence-based, not a guess: DB.threeWayMatchPolicyConfig.categories.goods
// is the ONE category already marked policyConfirmedByFinance:true in this codebase (every other
// category — rent/professionalFees/commission/transportServices — is explicitly still "PAYMENT
// CONTROL POLICY REQUIRED", finance-unconfirmed) — so only real vendor.category values that map
// unambiguously onto that ALREADY-CONFIRMED "goods" policy are included. 'Transport' is deliberately
// EXCLUDED — it could mean transportMaterial (goods, requires match) or transportServices (pure
// freight, no GRN concept, exempt) and nothing in the data disambiguates which; guessing either way
// risks either wrongly blocking legitimate freight billing or wrongly leaving a real goods gap open,
// so it is left exactly as it behaves today and flagged as BUSINESS DECISION REQUIRED in the report,
// per Part 11's explicit instruction not to invent unconfirmed policy. Same for 'Labour/Services' and
// blank/unset category — left untouched.
const GOODS_VENDOR_CATEGORIES = new Set(['Panel/Board','Hardware','Glass/Aluminium']);
function vendorRequiresThreeWayMatch(vendorId){
  const v = DB.vendors.find(x=>x.id===vendorId);
  if(!v || !GOODS_VENDOR_CATEGORIES.has(v.category)) return false;
  const cfg = DB.threeWayMatchPolicyConfig && DB.threeWayMatchPolicyConfig.categories && DB.threeWayMatchPolicyConfig.categories.goods;
  return !!(cfg && cfg.requiresThreeWayMatch && cfg.policyConfirmedByFinance);
}
function draftSupplierInvoice({vendorId, projectId, baseAmount, taxCode, date, narration, branchId, createdByUserId, createdByRole, jobWorkOrderId}){
  const base = +baseAmount||0;
  if(!vendorId || !projectId || base<=0) return {ok:false, error:'Vendor, project and a positive amount are required.'};
  const inactiveErr = assertVendorSelectable(vendorId); if(inactiveErr) return {ok:false, error:inactiveErr};
  // Quick Control Fixes phase — Job Work Fee traceability. jobWorkOrderId is entirely optional
  // (ordinary supplier bills are completely unaffected); when supplied it must reference a real
  // Job Work Order, and — the one cross-project check the current data model actually supports —
  // that JWO's own project (when it has one) must match this bill's project. NOTE: a Job Work
  // Order carries jobWorkerId (DB.jobWorkers), a master collection with NO field linking it to
  // DB.vendors (the master this bill's own vendorId references) — the two are structurally
  // unrelated in this codebase today, so a "does this vendor match the JWO's job worker" check is
  // NOT implemented here; that would require inventing an equivalence this data model does not
  // establish (see the accompanying report's Business Decision item on this).
  if(jobWorkOrderId){
    const jwo = DB.jobWorkOrders.find(x=>x.id===jobWorkOrderId);
    if(!jwo) return {ok:false, error:`Job Work Order "${jobWorkOrderId}" does not exist.`};
    if(jwo.projectId && jwo.projectId!==projectId) return {ok:false, error:`Job Work Order "${jobWorkOrderId}" belongs to project "${jwo.projectId}" — a supplier bill for it must be raised against that same project, not "${projectId}".`};
  }
  // P0-3 FIX — this generic, non-PO path used to be reachable for ANY vendor, including a real
  // goods vendor, with zero PO/GRN/3-way-match check at all (LIVE PROVEN in the prior audit: a
  // ₹5,00,000 bill against a real "Panel/Board" vendor, no PO, no GRN). A goods-category vendor
  // must now go through draftSupplierInvoiceFromPO() (the existing, already-robust 3-way-matched
  // path) instead — this function still works completely unchanged for every non-goods vendor
  // (services, rent, transport, commission, etc.), so legitimate non-PO billing is not broken.
  if(vendorRequiresThreeWayMatch(vendorId)){
    const v = DB.vendors.find(x=>x.id===vendorId);
    // ERP-059B — durableFailureAudit (see ERP-059B-TRANSACTION-DESIGN.md); withTransaction()
    // overwrites userId/role with the real authenticated actor automatically, so
    // createdByUserId/createdByRole are kept under their OWN distinct field names too, to
    // preserve this function's original attribution (this caller, unlike most others in this
    // file, receives createdByUserId/createdByRole directly rather than a full actor object).
    return {ok:false, error:`Vendor "${v?v.name:vendorId}" is a goods-category vendor (${v?v.category:''}) — goods purchases require a Purchase Order and GRN. Use the PO/GRN-matched Supplier Bill (Bill against PO/GRN) instead of this direct, non-PO bill entry.`, requiresPOAndGRN:true,
      durableFailureAudit:{type:'SupplierBillThreeWayMatchBypassRejected', vendorId, vendorCategory:v?v.category:null, projectId, amount:base, createdByUserId, createdByRole, userId:createdByUserId, role:createdByRole}};
  }
  const tax = taxCode ? calcTax(taxCode, base) : null;
  const lines = [{account:'5000', debit:base, credit:0, vendorId, projectId}];
  if(tax && tax.taxAmount>0) lines.push({account:'1300', debit:tax.taxAmount, credit:0, vendorId, projectId, taxCode});
  lines.push({account:AP_ACCOUNT, debit:0, credit: base+(tax?tax.taxAmount:0), vendorId, projectId, taxCode:taxCode||null});
  return createDraft({date, narration:narration||'Supplier Bill', docTypeCode:'BILL', sourceType:'Supplier Bill', docCategory:'SupplierInvoice', party:vendorId, lines, branchId:branchId||projectBranch(projectId), createdByUserId, createdByRole, jobWorkOrderId});
}
// Phase 16 §11 — Company Profitability performance. Profiled first, per instruction, before
// touching anything: `companyProjectProfitability()` calls `projectFinancial360()` once per
// project, and a SINGLE `projectFinancial360()` call independently invokes `allLines()` at least
// 4 times (materialCost/labourCostAll/installationCost directly, plus once more via `projectPL()`)
// — each a full re-flatten of every journal entry's every line. At 155 projects that's ~620 full
// re-scans of the entire journal-entries dataset per Company Profitability request, which
// measured at 419ms avg / 511ms max (Phase 15 performance test).
//
// Fix: memoize the pure output of `allLines()`, invalidated by `DB.journalEntries.length`.
// Journal entries are immutable once posted — established as an explicit accounting-safety rule
// since Phase 5 ("never rewrite history"; reversal/recognition always PUSH a new entry, never
// mutate an existing one's lines) — so an append-only-log length check is a correct, not merely
// convenient, cache-invalidation strategy. This changes NOTHING about what is computed, only how
// often the same computation repeats; every caller's accounting output is byte-identical before
// and after (verified — see `phase16_performance_tests.js` for a before/after figure comparison).
let _allLinesCache = { length: -1, data: null };
function allLines(){
  if(_allLinesCache.length === DB.journalEntries.length && _allLinesCache.data) return _allLinesCache.data;
  const out=[];
  // Phase 30 — docCategory/sourceType/reversal flags added, purely additive (every existing
  // consumer reads only the fields it already knew about; these are new fields on the same
  // objects, not a shape change to anything that existed). Needed by the new General Ledger/
  // Customer/Supplier Ledger drill-downs so they can filter by voucher type and show reversal
  // status without a second per-line lookup into DB.journalEntries for every row.
  DB.journalEntries.forEach(je=>je.lines.forEach(l=>out.push({...l, entryId:je.id, date:je.date, narration:je.narration, voucherNo:je.voucherNo,
    docCategory:je.docCategory, sourceType:je.sourceType, reversalOfId:je.reversalOfId||null, reversedByEntryId:je.reversedByEntryId||null})));
  _allLinesCache = { length: DB.journalEntries.length, data: out };
  return out;
}
// Phase 7 PERFORMANCE FIX — profiled live: customerOpenItems() was the single largest cost inside
// projectFinancial360() (10.01ms of its 15.02ms average, ~67%), and companyProjectProfitability()
// calls projectFinancial360() once PER PROJECT (245 in the accumulated fixture dataset) even
// though those projects only span 23 distinct customers — i.e. the exact same customerId's open
// items were being recomputed from scratch, from a full DB.journalEntries + nested DB.clearings
// scan, roughly 10-11 times each. Same request-scoped memoization pattern ALREADY established for
// allLines() (_allLinesCache, above) — keyed on the two collections this function actually reads
// (journalEntries.length + clearings.length) so any real mutation invalidates it automatically,
// and explicitly cleared at every point _allLinesCache already is (whole-DB reassignment: reset,
// restore, transaction rollback) since a length-only key can't be trusted across those. The
// function's OWN computation is byte-for-byte unchanged — this only avoids repeating identical
// work for the same customerId within the same DB state. Proven equivalent to the pre-fix output
// for every real customerId in the fixture dataset before being kept (see the Phase 7 report).
let _customerOpenItemsCache = { key: null, data: new Map() };
let _jeByIdCache = { key: null, data: null };
function _invalidateReportingCaches(){ _allLinesCache = { length: -1, data: null }; _customerOpenItemsCache = { key: null, data: new Map() }; _jeByIdCache = { key: null, data: null }; }
// Phase 7 — a plain Map<journalEntryId, journalEntry>, same length-keyed invalidation as
// _allLinesCache. Used anywhere a hot path was doing DB.journalEntries.find(e=>e.id===x) inside a
// loop (an O(n) scan per lookup) — never changes what is found, only how fast it is found.
function _jeById(){
  if(_jeByIdCache.key === DB.journalEntries.length && _jeByIdCache.data) return _jeByIdCache.data;
  const m = new Map(); DB.journalEntries.forEach(je=>m.set(je.id, je));
  _jeByIdCache = { key: DB.journalEntries.length, data: m };
  return m;
}
function customerOpenItems(customerId){
  const cacheKey = DB.journalEntries.length+'|'+DB.clearings.length;
  if(_customerOpenItemsCache.key !== cacheKey) _customerOpenItemsCache = { key: cacheKey, data: new Map() };
  if(_customerOpenItemsCache.data.has(customerId)) return _customerOpenItemsCache.data.get(customerId);
  const result = DB.journalEntries.filter(je=>je.docCategory==='CustomerInvoice' && !je.reversalOfId && !je.reversedByEntryId && je.lines.some(l=>l.customerId===customerId && l.account===AR_ACCOUNT))
    .map(je=>{
      const arLine = je.lines.find(l=>l.customerId===customerId && l.account===AR_ACCOUNT);
      const original = arLine.debit;
      const cleared = DB.clearings.filter(c=>c.type==='AR' && c.invoiceEntryId===je.id).reduce((s,c)=>s+c.amount,0);
      const open = Math.round((original-cleared)*100)/100;
      return {customerId, entryId:je.id, docNo:je.voucherNo, date:je.date, dueDate:je.dueDate||addDays(je.date,30),
        original, cleared, open, projectId:arLine.projectId, status: open<=0.01?'Cleared':(cleared>0?'Partially Cleared':'Open')};
    });
  _customerOpenItemsCache.data.set(customerId, result);
  return result;
}
function supplierOpenItems(vendorId){
  return DB.journalEntries.filter(je=>je.docCategory==='SupplierInvoice' && !je.reversalOfId && !je.reversedByEntryId && je.lines.some(l=>l.vendorId===vendorId && l.account===AP_ACCOUNT))
    .map(je=>{
      const apLine = je.lines.find(l=>l.vendorId===vendorId && l.account===AP_ACCOUNT);
      const original = apLine.credit;
      const cleared = DB.clearings.filter(c=>c.type==='AP' && c.invoiceEntryId===je.id).reduce((s,c)=>s+c.amount,0);
      const open = Math.round((original-cleared)*100)/100;
      return {vendorId, entryId:je.id, docNo:je.voucherNo, date:je.date, dueDate:je.dueDate||addDays(je.date,30),
        original, cleared, open, projectId:apLine.projectId, status: open<=0.01?'Cleared':(cleared>0?'Partially Cleared':'Open')};
    });
}
function applyClearing({type, invoiceEntryId, paymentEntryId, amount, actor}){
  // Phase 33 (adversarial audit thread) Part U — every receipt/payment/CN/DN settlement against an
  // AR or AP open item creates one of these; a collision would misattribute which payment cleared
  // which invoice in the open-items subledger.
  const clr = { id:nextId(DB.clearings, 'CLR-', 4), clearingDocNo: nextDocNumber('CLR'),
    type, invoiceEntryId, paymentEntryId, amount:r2(amount), date:new Date().toISOString().slice(0,10), userId:actor.id, role:actor.role };
  DB.clearings.push(clr); save(); return clr;
}
// SYNCHRONOUS, no I/O awaited mid-check — this is what makes concurrent requests safe on a
// single-threaded Node process: the "read open balance, then commit against it" sequence below
// cannot be interleaved by another request, because nothing yields the event loop in between.
function postCustomerReceipt({customerId, invoiceEntryId, amount, date, narration, actor, overrideReason, paymentMethodId, bankAccountId}){
  { const _a = assertCanClearReceipt(actor); if(!_a.ok) return _a; }
  const invoice = DB.journalEntries.find(e=>e.id===invoiceEntryId);
  if(!invoice) return {ok:false, error:'Select an open invoice to apply this receipt against.'};
  const openItem = customerOpenItems(customerId).find(i=>i.entryId===invoiceEntryId);
  if(!openItem) return {ok:false, error:'That invoice is not an open item for this customer.'};
  // Phase 17 CRITICAL FIX — found live via repository-wide sweep (same class as Phase 14/15): a
  // non-numeric amount ("abc") makes `+amount` NaN, and `NaN > anything` is always false, so this
  // guard never rejected it — producing a fully-posted ₹0/₹0 GL entry and a real ₹0 clearing
  // record against an actual open invoice. Closed the same way as every prior instance of this hole.
  { const _v = assertPositiveFiniteNumber(amount, 'Amount'); if(!_v.ok) return _v; }
  if(+amount > openItem.open + 0.01) return {ok:false, error:`Amount exceeds the open balance of ₹${openItem.open.toLocaleString('en-IN')}.`};
  // Phase 33 SOP §4 — cash receipt aggregate limit. Only triggers when genuinely tagged Cash;
  // every existing test/call site uses a bank-rail method or none, so this is a no-op for them.
  if(isCashPayment({paymentMethodId})){
    const cashCheck = checkCashLimit({kind:'receiptAggregate', amount:+amount, actor, overrideReason, party:customerId, paymentMethodId});
    if(!cashCheck.ok) return cashCheck;
  }
  // Phase 24 Part A4 — was unconditionally Dr 1000 regardless of bankAccountId (Phase 19 §24's
  // original "Payment Method is metadata only" decision, now superseded for the ACCOUNT itself —
  // Payment Method remains metadata; WHICH bank/cash account received the money is not). Omitting
  // bankAccountId still defaults to 1000, so every pre-existing call site (800+ tests) is
  // completely unaffected; supplying one routes to THAT account's own GL.
  let bankGlAccount = '1000';
  if(bankAccountId){
    const acct = DB.bankAccounts.find(b=>b.id===bankAccountId);
    if(!acct) return {ok:false, error:`Unknown bank/cash account "${bankAccountId}".`};
    if(acct.active===false) return {ok:false, error:`Account "${acct.accountName}" is inactive and cannot receive a new receipt.`};
    bankGlAccount = acct.glAccount;
  }
  const arLine = invoice.lines.find(l=>l.customerId===customerId && l.account===AR_ACCOUNT);
  const lines = [ {account:bankGlAccount, debit:+amount, credit:0, customerId, projectId:arLine.projectId},
    {account:AR_ACCOUNT, debit:0, credit:+amount, customerId, projectId:arLine.projectId} ];
  // Phase 36 Part H — atomicity test/fix. jesLen captured BEFORE the GL attempt (the exact mistake
  // caught and corrected in Phase 35's own first draft — see that report — is not repeated here).
  const _rbRcpt = { jesLen: DB.journalEntries.length, clearingsLen: DB.clearings.length };
  const result = postJournalEntry({date, narration:narration||`Receipt against ${invoice.voucherNo}`, sourceType:'Customer Receipt', sourceId:invoiceEntryId,
    voucherNo:nextDocNumber('RCPT', date), party:customerId, docCategory:'CustomerReceipt', branchId:invoice.branchId, lines, actor, capability:'AR_RECEIPT_CLEAR', overrideReason, paymentMethodId});
  if(!result.ok) return result;
  try {
    _fault('RECEIPT_AFTER_GL_BEFORE_CLEARING'); // Phase 36 Part H
    const clr = applyClearing({type:'AR', invoiceEntryId, paymentEntryId:result.entry.id, amount:+amount, actor});
    return {ok:true, entry:result.entry, clearing:clr};
  } catch(e) {
    if(!__PHASE36_SKIP_ROLLBACK_FOR_BEFORE_TEST__){
      DB.journalEntries.length = _rbRcpt.jesLen; // rolls back the GL entry postJournalEntry() already committed
      DB.clearings.length = _rbRcpt.clearingsLen;
      save();
      logAudit({type:'CustomerReceiptRolledBackOnFailure', customerId, invoiceEntryId, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    }
    throw e;
  }
}
function postSupplierPayment({vendorId, invoiceEntryId, amount, date, narration, actor, overrideReason, paymentMethodId, bankAccountId, tdsCategory, tdsOptions, isTransporterPayment}){
  { const _a = assertCanPaySupplier(actor); if(!_a.ok) return _a; }
  const bill = DB.journalEntries.find(e=>e.id===invoiceEntryId);
  if(!bill) return {ok:false, error:'Select an open bill to apply this payment against.'};
  const openItem = supplierOpenItems(vendorId).find(i=>i.entryId===invoiceEntryId);
  if(!openItem) return {ok:false, error:'That bill is not an open item for this vendor.'};
  // Phase 17 CRITICAL FIX — same NaN-through-truthy-string hole as postCustomerReceipt(), closed
  // the same way.
  { const _v = assertPositiveFiniteNumber(amount, 'Amount'); if(!_v.ok) return _v; }
  if(+amount > openItem.open + 0.01) return {ok:false, error:`Amount exceeds the open balance of ₹${openItem.open.toLocaleString('en-IN')}.`};
  // Phase 33 SOP §9 — three-way match re-verified AT PAYMENT, not just at bill creation, for a
  // PO-linked bill. By construction a PO-linked bill can only have been POSTED if it either passed
  // checkThreeWayMatch() or had an authorized exception recorded at creation time
  // (draftSupplierInvoiceFromPO) — so this never fires against any currently-reachable state; it
  // is a defense-in-depth re-verification so a future code path can never silently skip that
  // guarantee. A bill with NO PO reference (rent/professional fees/transport/etc. — a genuine
  // service payment has no GRN concept to match against) is unaffected: the SOP's literal "before
  // ANY vendor payment" is in real tension with non-goods vendor payments having no PO/GRN at all
  // — flagged BUSINESS DECISION REQUIRED in PHASE33_SOP_COMPLIANCE_MATRIX.md rather than silently
  // blocking every service payment or silently ignoring the SOP's own wording.
  const sourceDraft = DB.jeDrafts.find(d=>d.postedEntryId===invoiceEntryId);
  if(sourceDraft && sourceDraft.poId && sourceDraft.grnId && Array.isArray(sourceDraft.invoiceLines)){
    const match = checkThreeWayMatch({poId:sourceDraft.poId, grnId:sourceDraft.grnId, invoiceLines:sourceDraft.invoiceLines});
    if(!match.matched){
      const hasException = DB.threeWayMatchExceptions.some(x=>x.poId===sourceDraft.poId && x.grnId===sourceDraft.grnId);
      if(!hasException) return {ok:false, error:'Cannot release payment — underlying bill fails three-way match and no authorized exception is on record (SOP §9). Investigate before paying.', mismatches:match.mismatches};
    }
  }
  // Phase 24 Part A5 — same fix as postCustomerReceipt above, mirrored for payments.
  let bankGlAccount = '1000';
  if(bankAccountId){
    const acct = DB.bankAccounts.find(b=>b.id===bankAccountId);
    if(!acct) return {ok:false, error:`Unknown bank/cash account "${bankAccountId}".`};
    if(acct.active===false) return {ok:false, error:`Account "${acct.accountName}" is inactive and cannot make a new payment.`};
    bankGlAccount = acct.glAccount;
  }
  // Phase 33 SOP §4 — cash payment limit check. Only triggers when this payment is genuinely tagged
  // as Cash (paymentMethodId category==='Cash') — every existing test/call site uses a bank-rail
  // payment method (or none at all), so this branch never fires against any pre-Phase-33 call.
  if(isCashPayment({paymentMethodId})){
    const cashCheck = checkCashLimit({kind:'expense', amount:+amount, isTransporter:!!isTransporterPayment, actor, overrideReason, party:vendorId, paymentMethodId});
    if(!cashCheck.ok) return cashCheck;
  }
  // Phase 33 SOP §3 — TDS engine. Purely opt-in via tdsCategory; omitting it (every existing call
  // site) leaves this function's behavior byte-for-byte unchanged.
  let tdsAmount = 0, tdsInfo = null;
  if(tdsCategory){
    tdsInfo = computeTDS({category:tdsCategory, billAmount:+amount, vendorId, ...(tdsOptions||{})});
    if(!tdsInfo.ok) return {ok:false, error:tdsInfo.error};
    tdsAmount = tdsInfo.tdsAmount;
  }
  const netPay = r2(+amount - tdsAmount);
  const apLine = bill.lines.find(l=>l.vendorId===vendorId && l.account===AP_ACCOUNT);
  const lines = [ {account:AP_ACCOUNT, debit:+amount, credit:0, vendorId, projectId:apLine.projectId},
    {account:bankGlAccount, debit:0, credit:netPay, vendorId, projectId:apLine.projectId} ];
  if(tdsAmount>0) lines.push({account:'2300', debit:0, credit:tdsAmount, vendorId, projectId:apLine.projectId});
  // Phase 36 Part H — same defect class as postCustomerReceipt() (proven live: an exception between
  // the GL commit and applyClearing() leaves a real GL-vs-AP-subledger divergence, quantified live
  // as an exact reconciliation break equal to the orphaned payment amount). jesLen/clearingsLen/
  // tdsLen captured BEFORE the GL attempt.
  const _rbPay = { jesLen: DB.journalEntries.length, clearingsLen: DB.clearings.length, tdsLen: DB.tdsDeductions.length };
  const result = postJournalEntry({date, narration:narration||`Payment against ${bill.voucherNo}`, sourceType:'Supplier Payment', sourceId:invoiceEntryId,
    voucherNo:nextDocNumber('PAY', date), party:vendorId, docCategory:'SupplierPayment', branchId:bill.branchId, lines, actor, capability:'AP_PAYMENT', overrideReason, paymentMethodId});
  if(!result.ok) return result;
  try {
    _fault('PAYMENT_AFTER_GL_BEFORE_CLEARING'); // Phase 36 Part H
    const clr = applyClearing({type:'AP', invoiceEntryId, paymentEntryId:result.entry.id, amount:+amount, actor});
    _fault('PAYMENT_AFTER_CLEARING_BEFORE_TDS'); // Phase 36 Part H
    if(tdsAmount>0){
      DB.tdsDeductions.push({ id: nextId(DB.tdsDeductions, 'TDS-', 4), vendorId, invoiceEntryId, paymentEntryId:result.entry.id,
        category:tdsCategory, billAmount:+amount, ratePct:tdsInfo.ratePct, tdsAmount, date:date||new Date().toISOString().slice(0,10), createdBy:actor.id, at:nowIso() });
      save();
      logAudit({type:'TDSDeducted', vendorId, category:tdsCategory, tdsAmount, ratePct:tdsInfo.ratePct, userId:actor.id, role:actor.role});
    }
    return {ok:true, entry:result.entry, clearing:clr, tds:tdsInfo};
  } catch(e) {
    DB.journalEntries.length = _rbPay.jesLen;
    DB.clearings.length = _rbPay.clearingsLen;
    DB.tdsDeductions.length = _rbPay.tdsLen;
    save();
    logAudit({type:'SupplierPaymentRolledBackOnFailure', vendorId, invoiceEntryId, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}
function reconcileAR(){
  const subledgerTotal = DB.customers.reduce((s,c)=>s+customerOpenItems(c.id).reduce((s2,i)=>s2+i.open,0),0);
  const controlAccountBalance = DB.journalEntries.filter(je=>AR_DOC_CATEGORIES.includes(je.docCategory)).flatMap(je=>je.lines).filter(l=>l.account===AR_ACCOUNT).reduce((s,l)=>s+l.debit-l.credit,0);
  const nonSubledgerLines = DB.journalEntries.filter(je=>!AR_DOC_CATEGORIES.includes(je.docCategory)).flatMap(je=>je.lines).filter(l=>l.account===AR_ACCOUNT).reduce((s,l)=>s+l.debit-l.credit,0);
  return {subledgerTotal, controlAccountBalance, nonSubledgerLines, matches: Math.abs(subledgerTotal-controlAccountBalance)<0.01};
}
function reconcileAP(){
  const subledgerTotal = DB.vendors.reduce((s,v)=>s+supplierOpenItems(v.id).reduce((s2,i)=>s2+i.open,0),0);
  const controlAccountBalance = DB.journalEntries.filter(je=>AP_DOC_CATEGORIES.includes(je.docCategory)).flatMap(je=>je.lines).filter(l=>l.account===AP_ACCOUNT).reduce((s,l)=>s+l.credit-l.debit,0);
  const nonSubledgerLines = DB.journalEntries.filter(je=>!AP_DOC_CATEGORIES.includes(je.docCategory)).flatMap(je=>je.lines).filter(l=>l.account===AP_ACCOUNT).reduce((s,l)=>s+l.credit-l.debit,0);
  return {subledgerTotal, controlAccountBalance, nonSubledgerLines, matches: Math.abs(subledgerTotal-controlAccountBalance)<0.01};
}
// Phase 21 §17 — Tax and Customer/Vendor Advance reconciliation reports, closing the audit's own
// disclosed gap ("Tax/Advance reconciliation tooling is weaker than AR/AP/Inventory/Asset — no
// dedicated report exists"). Structurally IDENTICAL to reconcileAR()/reconcileAP() immediately
// above (control-account-balance vs. transactions-that-should-have-produced-it, plus a
// non-source-line check) — no new tax/advance POLICY is invented, this only builds the missing
// REPORTING TOOL over data that was already being posted correctly (proven independently, by hand,
// in this engagement's own audit passes today).
// Output Tax (2200, a Liability — tax collected from customers, owed to the tax authority) and
// Input Tax (1300, an Asset — tax paid to vendors, recoverable from the tax authority) are TWO
// SEPARATE accounts in this Lab's existing Chart of Accounts (confirmed by reading
// draftCustomerInvoice/draftSupplierInvoice directly, not assumed) — reconciled separately, each
// against its own real source document category, exactly mirroring reconcileAR()/reconcileAP().
function reconcileOutputTax(){
  const sourceLines = DB.journalEntries.filter(je=>je.docCategory==='CustomerInvoice').flatMap(je=>je.lines);
  const subledgerTotal = r2(sourceLines.filter(l=>l.account==='2200').reduce((s,l)=>s+l.credit-l.debit,0));
  const controlAccountBalance = r2(allLines().filter(l=>l.account==='2200').reduce((s,l)=>s+l.credit-l.debit,0));
  const nonSourceLines = r2(DB.journalEntries.filter(je=>je.docCategory!=='CustomerInvoice').flatMap(je=>je.lines).filter(l=>l.account==='2200').reduce((s,l)=>s+l.credit-l.debit,0));
  return {subledgerTotal, controlAccountBalance, nonSourceLines, matches: Math.abs(subledgerTotal-controlAccountBalance)<0.02};
}
// Phase 23 FIX — found live while testing the Phase 23 route migration: Input Tax (1300) has a
// SECOND legitimate source category this reconciliation never recognized. `itcReversalOnDamage()`
// (SOP §2 — ITC is not available on lost/destroyed/written-off goods) correctly credits 1300 under
// docCategory:'ITCReversal', not 'SupplierInvoice' — a real, intentional, correctly-posted entry
// that this function was flagging as an unexplained "nonSourceLine" simply because no prior phase
// had triggered a live ITC reversal large enough to notice the false alarm. The underlying GL was
// never wrong; only this report's own definition of "source" was incomplete.
const INPUT_TAX_SOURCE_CATEGORIES = ['SupplierInvoice','ITCReversal'];
function reconcileInputTax(){
  const sourceLines = DB.journalEntries.filter(je=>INPUT_TAX_SOURCE_CATEGORIES.includes(je.docCategory)).flatMap(je=>je.lines);
  const subledgerTotal = r2(sourceLines.filter(l=>l.account==='1300').reduce((s,l)=>s+l.debit-l.credit,0));
  const controlAccountBalance = r2(allLines().filter(l=>l.account==='1300').reduce((s,l)=>s+l.debit-l.credit,0));
  const nonSourceLines = r2(DB.journalEntries.filter(je=>!INPUT_TAX_SOURCE_CATEGORIES.includes(je.docCategory)).flatMap(je=>je.lines).filter(l=>l.account==='1300').reduce((s,l)=>s+l.debit-l.credit,0));
  return {subledgerTotal, controlAccountBalance, nonSourceLines, matches: Math.abs(subledgerTotal-controlAccountBalance)<0.02};
}
const CUSTOMER_ADVANCE_ACCOUNT = '2100';
function reconcileCustomerAdvances(){
  const sourceLines = DB.journalEntries.filter(je=>je.docCategory==='CustomerAdvance').flatMap(je=>je.lines);
  const subledgerTotal = r2(sourceLines.filter(l=>l.account===CUSTOMER_ADVANCE_ACCOUNT).reduce((s,l)=>s+l.credit-l.debit,0));
  const controlAccountBalance = r2(allLines().filter(l=>l.account===CUSTOMER_ADVANCE_ACCOUNT).reduce((s,l)=>s+l.credit-l.debit,0));
  const nonSourceLines = r2(DB.journalEntries.filter(je=>je.docCategory!=='CustomerAdvance').flatMap(je=>je.lines).filter(l=>l.account===CUSTOMER_ADVANCE_ACCOUNT).reduce((s,l)=>s+l.credit-l.debit,0));
  return {subledgerTotal, controlAccountBalance, nonSourceLines, matches: Math.abs(subledgerTotal-controlAccountBalance)<0.02};
}
function projectPL(projectId){
  const lines = allLines().filter(l=>l.projectId===projectId);
  let revenue=0, cost=0;
  lines.forEach(l=>{ const acct=DB.accounts.find(a=>a.id===l.account); if(!acct) return;
    if(acct.type==='Income') revenue += l.credit-l.debit; if(acct.type==='Expense') cost += l.debit-l.credit; });
  const profit = revenue-cost;
  return {revenue, cost, profit, marginPct: revenue>0 ? profit/revenue*100 : null};
}
const AGE_BUCKETS=['Current','1-30','31-60','61-90','91-180','181-365','365+'];
function ageingBucket(dueDate, asOf){
  const days = Math.floor((new Date(asOf)-new Date(dueDate))/86400000);
  if(days<=0) return 'Current'; if(days<=30) return '1-30'; if(days<=60) return '31-60'; if(days<=90) return '61-90';
  if(days<=180) return '91-180'; if(days<=365) return '181-365'; return '365+';
}
function customerAgeing(asOf){
  asOf = asOf || new Date().toISOString().slice(0,10);
  return DB.customers.map(c=>{ const buckets={}; AGE_BUCKETS.forEach(b=>buckets[b]=0); let total=0;
    customerOpenItems(c.id).filter(i=>i.open>0.01).forEach(i=>{ buckets[ageingBucket(i.dueDate,asOf)]+=i.open; total+=i.open; });
    return {customer:c, buckets, total}; });
}
function supplierAgeing(asOf){
  asOf = asOf || new Date().toISOString().slice(0,10);
  return DB.vendors.map(v=>{ const buckets={}; AGE_BUCKETS.forEach(b=>buckets[b]=0); let total=0;
    supplierOpenItems(v.id).filter(i=>i.open>0.01).forEach(i=>{ buckets[ageingBucket(i.dueDate,asOf)]+=i.open; total+=i.open; });
    return {vendor:v, buckets, total}; });
}

// ============================================================
// Phase 6B — Lead → Estimation → Quotation → Won → Customer → Project → Baseline → Design
// ============================================================
// Per §27 of the brief: Lead/Estimation/Costing/Quotation/Revision/Acceptance are commercial
// documents, NOT accounting documents — none of the functions below call postJournalEntry().
// Accounting only begins at the Advance function further down, and it reuses the EXISTING
// Phase 5 lifecycle (createDraft → ... → postJournalEntry) rather than inventing a second
// posting path — satisfying §22's "do not duplicate financial postings."

function createLead({date, source, name, contact, site, requirement, expectedValue, salesOwnerId, actor}){
  if(!name) return {ok:false, error:'Prospect/customer name is required.'};
  const lead = {
    id: 'LEAD-' + String(DB.leads.length+1).padStart(4,'0'),
    date: date || new Date().toISOString().slice(0,10), source: source||'', name, contact: contact||'', site: site||'',
    requirement: requirement||'', expectedValue: +expectedValue||0, salesOwnerId: salesOwnerId||actor.id,
    status: 'NEW', nextFollowUp: null, createdBy: actor.id, createdAt: nowIso()
  };
  DB.leads.push(lead); save();
  logAudit({type:'LeadCreated', leadId:lead.id, userId:actor.id, role:actor.role});
  return {ok:true, lead};
}
function canSeeLead(lead, actor){
  if(['Admin','CEO','Viewer'].includes(actor.role)) return true;
  if(actor.role==='Sales') return lead.salesOwnerId===actor.id;
  return false;
}
function addLeadActivity({leadId, type, notes, nextAction, actor}){
  const lead = DB.leads.find(l=>l.id===leadId);
  if(!lead) return {ok:false, error:'Lead not found.'};
  const act = {id:'ACT-'+String(DB.leadActivities.length+1).padStart(5,'0'), leadId, type:type||'note', notes:notes||'', nextAction:nextAction||null, userId:actor.id, role:actor.role, at:nowIso()};
  DB.leadActivities.push(act); // append-only — no update/delete function exists for this array
  if(nextAction) lead.nextFollowUp = nextAction;
  save();
  logAudit({type:'LeadActivity', leadId, activityId:act.id, userId:actor.id, role:actor.role});
  return {ok:true, activity:act};
}
function changeLeadStatus({leadId, newStatus, actor}){
  const lead = DB.leads.find(l=>l.id===leadId);
  if(!lead) return {ok:false, error:'Lead not found.'};
  if(!LEAD_STATUSES.includes(newStatus)) return {ok:false, error:`Invalid status "${newStatus}".`};
  const old = lead.status; lead.status = newStatus; save();
  logAudit({type:'LeadStatusChange', leadId, oldState:old, newState:newStatus, userId:actor.id, role:actor.role});
  return {ok:true, lead};
}

function createEstimationRequest({leadId, site, requirement, estimatorId, requestedDate, scope, notes, actor}){
  const lead = DB.leads.find(l=>l.id===leadId);
  if(!lead) return {ok:false, error:'Source lead not found.'};
  const er = {
    id: 'ER-'+String(DB.estimationRequests.length+1).padStart(4,'0'), leadId, site:site||lead.site, requirement:requirement||lead.requirement,
    estimatorId: estimatorId||null, requestedDate: requestedDate||new Date().toISOString().slice(0,10), scope:scope||'', notes:notes||'',
    status:'DRAFT', createdBy:actor.id, createdAt:nowIso()
  };
  DB.estimationRequests.push(er); save();
  changeLeadStatus({leadId, newStatus:'ESTIMATION', actor});
  logAudit({type:'EstimationRequestCreated', estimationRequestId:er.id, leadId, userId:actor.id, role:actor.role});
  return {ok:true, estimationRequest:er};
}
function setEstimationStatus({id, status, actor}){
  const er = DB.estimationRequests.find(e=>e.id===id);
  if(!er) return {ok:false, error:'Estimation request not found.'};
  if(!ESTIMATION_STATUSES.includes(status)) return {ok:false, error:`Invalid status "${status}".`};
  const old = er.status; er.status = status; save();
  logAudit({type:'EstimationStatusChange', estimationRequestId:id, oldState:old, newState:status, userId:actor.id, role:actor.role});
  return {ok:true, estimationRequest:er};
}

// Costing versions are NEVER edited in place — every call creates a new, immutable version.
function createCostingVersion({estimationRequestId, lines, overheadPct, profitPct, reason, actor}){
  const er = DB.estimationRequests.find(e=>e.id===estimationRequestId);
  if(!er) return {ok:false, error:'Estimation request not found.'};
  // Phase 37 MEDIUM FIX — a zero rate, a negative quantity, or a negative rate were all silently
  // summed into the costing with no error at all (live-confirmed in the Phase 2 adversarial
  // audit). Blocked the same way createMaterialIssue() already blocks a non-positive qty
  // elsewhere in this file — an existing pattern, not a new invented rule. A decimal quantity
  // (0.5) or a decimal rate is unaffected — only non-positive values are rejected.
  const lineErrors = [];
  (lines||[]).forEach((l,idx)=>{
    if(!(+l.qty>0)) lineErrors.push(`Line ${idx+1}: quantity must be greater than zero (got ${l.qty}).`);
    if(!(+l.rate>0)) lineErrors.push(`Line ${idx+1}: rate must be greater than zero (got ${l.rate}).`);
  });
  if(lineErrors.length) return {ok:false, error:'Costing rejected: '+lineErrors.join(' | ')};
  // Phase 39 CRITICAL FIX — found live: `overheadPct:+overheadPct||0` / `profitPct:+profitPct||0`
  // silently converted garbled input ("garbage" -> NaN -> 0) to a real 0% figure with ok:true —
  // a typo silently became "no overhead/no profit" instead of an error. A negative overheadPct
  // (overhead cost cannot be negative) was also accepted uncaught (proven live: -50%). profitPct's
  // SIGN is deliberately left unrestricted here — a genuine loss-leader quote is a real, if rare,
  // business decision, not a data-entry mistake — but it must still be a real, finite number, same
  // as every other field. No upper bound is imposed on either field: an unusually high markup is a
  // business-policy question this audit does not invent an answer to, not a mathematical
  // impossibility the way an out-of-range tax rate or a >100% discount is (see createQuotation()).
  if(overheadPct!==undefined && overheadPct!==null && overheadPct!==''){
    const n = Number(overheadPct);
    if(!Number.isFinite(n)) return {ok:false, error:`Overhead % must be a real number — got "${overheadPct}".`};
    if(n<0) return {ok:false, error:`Overhead % cannot be negative — got ${n}.`};
  }
  if(profitPct!==undefined && profitPct!==null && profitPct!==''){
    const n = Number(profitPct);
    if(!Number.isFinite(n)) return {ok:false, error:`Profit % must be a real number — got "${profitPct}".`};
  }
  // Exact-duplicate lines are surfaced as a WARNING, never a hard block — two genuinely identical
  // items (e.g. two matching wardrobes at the same rate) are a legitimate real Appletree scenario;
  // this only flags it for the estimator to confirm, mirroring the existing BOM-quota
  // warn-vs-block idiom already used elsewhere in this file.
  const seen = new Map();
  const duplicateWarnings = [];
  (lines||[]).forEach((l,idx)=>{
    const key = [l.category, (l.description||'').trim().toLowerCase(), +l.qty, +l.rate].join('|');
    if(seen.has(key)) duplicateWarnings.push(`Line ${idx+1} is an exact duplicate of line ${seen.get(key)+1} (same category, description, qty and rate) — confirm this is intentional, not a copy-paste error.`);
    seen.set(key, idx);
  });
  const cats = {Material:0, Labour:0, Transport:0, Installation:0, Other:0};
  (lines||[]).forEach(l=>{ const amt = (+l.qty||0)*(+l.rate||0); if(cats[l.category]!==undefined) cats[l.category]+=amt; });
  const baseCost = Object.values(cats).reduce((s,v)=>s+v,0);
  const overheadAmt = baseCost * (+overheadPct||0)/100;
  const sellingPrice = (baseCost+overheadAmt) * (1 + (+profitPct||0)/100);
  const priorVersions = DB.costingVersions.filter(c=>c.estimationRequestId===estimationRequestId);
  const version = {
    id:'COST-'+String(DB.costingVersions.length+1).padStart(4,'0'), estimationRequestId, version: priorVersions.length+1,
    lines: (lines||[]).map(l=>({...l, amount:(+l.qty||0)*(+l.rate||0)})),
    materialCost:cats.Material, labourCost:cats.Labour, transportCost:cats.Transport, installationCost:cats.Installation, otherCost:cats.Other,
    baseCost, overheadPct:+overheadPct||0, overheadAmt, profitPct:+profitPct||0, sellingPrice,
    reason: reason || (priorVersions.length===0 ? 'Initial costing' : 'Revision'), createdBy:actor.id, createdAt:nowIso()
  };
  DB.costingVersions.push(version); save();
  logAudit({type:'CostingVersionCreated', costingVersionId:version.id, estimationRequestId, version:version.version, duplicateWarnings: duplicateWarnings.length?duplicateWarnings:undefined, userId:actor.id, role:actor.role});
  return {ok:true, costingVersion:version, duplicateWarnings: duplicateWarnings.length?duplicateWarnings:undefined};
}

function nextQuotationNo(){ return nextDocNumber('QTN') || ('QTN/'+String(DB.quotations.length+1).padStart(4,'0')); }
function createQuotation({leadId, estimationRequestId, costingVersionId, customerId, prospectName, validityDays, discountPct, terms, paymentTerms, notes, actor}){
  const costing = DB.costingVersions.find(c=>c.id===costingVersionId);
  if(!costing) return {ok:false, error:'Costing version not found.'};
  // Phase 39 CRITICAL FIX — found live: a discountPct of 150 was accepted with no bound check at
  // all, producing a real quotation (QTN-0018) with finalPrice = -₹250,247.50 — a mathematically
  // impossible negative customer-facing selling price. `+discountPct||0` also silently converted
  // any garbled discount input to a real 0% discount instead of rejecting it. 0-100% is not an
  // invented business policy — a discount outside that range cannot produce a sane price under any
  // interpretation, unlike overheadPct/profitPct above, which can legitimately be unusual.
  if(discountPct!==undefined && discountPct!==null && discountPct!==''){
    const n = Number(discountPct);
    if(!Number.isFinite(n)) return {ok:false, error:`Discount % must be a real number — got "${discountPct}".`};
    if(n<0 || n>100) return {ok:false, error:`Discount % must be between 0 and 100 — got ${n}.`};
  }
  const discount = +discountPct||0;
  const finalPrice = costing.sellingPrice * (1 - discount/100);
  const margin = finalPrice - (costing.materialCost+costing.labourCost+costing.transportCost+costing.installationCost+costing.otherCost);
  const q = {
    id:nextId(DB.quotations, 'QTN-', 4), quotationNo: nextQuotationNo(), revision:0, previousRevisionId:null,
    leadId, estimationRequestId, costingVersionId, customerId:customerId||null, prospectName:prospectName||null,
    date:new Date().toISOString().slice(0,10), validityDays:+validityDays||30,
    baseCost:costing.baseCost, sellingPrice:costing.sellingPrice, discountPct:discount, finalPrice, margin,
    terms:terms||'', paymentTerms:paymentTerms||'', notes:notes||'',
    status:'Draft', createdBy:actor.id, createdAt:nowIso(), approvedBy:null, approvedAt:null
  };
  DB.quotations.push(q); save();
  if(leadId) changeLeadStatus({leadId, newStatus:'QUOTATION', actor});
  logAudit({type:'QuotationCreated', quotationId:q.id, userId:actor.id, role:actor.role});
  return {ok:true, quotation:q};
}
function requiredDiscountApprovalRole(discountPct){
  const rules = [...DB.discountApprovalRules].sort((a,b)=>(a.upToPct??Infinity)-(b.upToPct??Infinity));
  for(const r of rules){ if(r.upToPct===null || discountPct<=r.upToPct) return r.requiredRole; }
  return 'CEO';
}
function submitQuotation({id, actor}){
  const q = DB.quotations.find(x=>x.id===id);
  if(!q) return {ok:false, error:'Quotation not found.'};
  if(q.status!=='Draft') return {ok:false, error:`Cannot submit — quotation is "${q.status}", not Draft.`};
  const reqRole = requiredDiscountApprovalRole(q.discountPct);
  q.status = reqRole ? 'PendingApproval' : 'Approved';
  if(!reqRole){ q.approvedBy='(auto — within no-approval threshold)'; q.approvedAt=nowIso(); }
  save();
  logAudit({type:'QuotationSubmitted', quotationId:id, discountPct:q.discountPct, requiredApprovalRole:reqRole, userId:actor.id, role:actor.role});
  return {ok:true, quotation:q};
}
function approveQuotationDiscount({id, actor}){
  const q = DB.quotations.find(x=>x.id===id);
  if(!q) return {ok:false, error:'Quotation not found.'};
  if(q.status!=='PendingApproval') return {ok:false, error:`Cannot approve — quotation is "${q.status}", not PendingApproval.`};
  const reqRole = requiredDiscountApprovalRole(q.discountPct);
  if(reqRole && actor.role!==reqRole && !(actor.role==='Admin')){
    return {ok:false, error:`This quotation's ${q.discountPct}% discount requires approval by "${reqRole}" (per BOS §1.6 policy) — "${actor.role}" is not authorized.`};
  }
  if(q.createdBy===actor.id && !['CEO','Admin'].includes(actor.role)){
    return {ok:false, error:'Segregation of duties: you created this quotation and cannot also approve its discount.'};
  }
  q.status='Approved'; q.approvedBy=actor.id; q.approvedAt=nowIso(); save();
  logAudit({type:'DiscountApproved', quotationId:id, discountPct:q.discountPct, userId:actor.id, role:actor.role});
  return {ok:true, quotation:q};
}
// Revision — the OLD quotation is marked Superseded (never edited/deleted), a NEW one is created.
// Phase 39 CRITICAL FIX — found live: `{ ...q, ..., ...changes }` spread an ENTIRELY unvalidated
// caller-supplied object directly onto the new revision record, AFTER the deliberate
// `status:'Draft', approvedBy:null, approvedAt:null` reset — meaning `changes` could (and, live-
// tested, did) override every one of those right back: a real revision was created with
// `status:'Approved'`, `approvedBy:'FAKE-INJECTED'`, `approvedAt:'2020-01-01'`, and
// `finalPrice:999999999` — a fabricated approval record with an arbitrary price, completely
// bypassing submitQuotation()/approveQuotationDiscount() and the entire discount-approval-role
// gate. Fixed with an explicit whitelist of the only fields a revision may legitimately change;
// every computed field (baseCost/sellingPrice/finalPrice/margin) is always RE-DERIVED from the
// costing version + the (now-validated) discountPct, never taken from caller input directly, and
// status/approvedBy/approvedAt can never be set by this function at all — only by the real
// submit/approve workflow, exactly like a brand-new quotation.
const QUOTATION_REVISABLE_FIELDS = new Set(['prospectName','validityDays','discountPct','terms','paymentTerms','notes','customerId']);
function reviseQuotation({id, changes, reason, actor}){
  const q = DB.quotations.find(x=>x.id===id);
  if(!q) return {ok:false, error:'Quotation not found.'};
  if(['Accepted','Superseded'].includes(q.status)) return {ok:false, error:`Cannot revise a "${q.status}" quotation.`};
  const safeChanges = {};
  for(const [k,v] of Object.entries(changes||{})){
    if(!QUOTATION_REVISABLE_FIELDS.has(k)) return {ok:false, error:`"${k}" cannot be set directly on a quotation revision — it is either derived from the costing version or controlled by the submit/approve workflow.`};
    safeChanges[k] = v;
  }
  if(safeChanges.customerId && !DB.customers.find(c=>c.id===safeChanges.customerId)) return {ok:false, error:`Unknown customer "${safeChanges.customerId}".`};
  const costing = DB.costingVersions.find(c=>c.id===q.costingVersionId);
  if(!costing) return {ok:false, error:'The costing version behind this quotation no longer exists — cannot recompute a revision.'};
  const newDiscountPct = safeChanges.discountPct!==undefined ? safeChanges.discountPct : q.discountPct;
  if(newDiscountPct!==undefined && newDiscountPct!==null && newDiscountPct!==''){
    const n = Number(newDiscountPct);
    if(!Number.isFinite(n)) return {ok:false, error:`Discount % must be a real number — got "${newDiscountPct}".`};
    if(n<0 || n>100) return {ok:false, error:`Discount % must be between 0 and 100 — got ${n}.`};
  }
  const discount = +newDiscountPct||0;
  const finalPrice = costing.sellingPrice * (1 - discount/100);
  const margin = finalPrice - (costing.materialCost+costing.labourCost+costing.transportCost+costing.installationCost+costing.otherCost);
  const rev = { ...q, ...safeChanges, id:nextId(DB.quotations, 'QTN-', 4), revision:q.revision+1, previousRevisionId:q.id,
    quotationNo:q.quotationNo, status:'Draft', createdBy:actor.id, createdAt:nowIso(), approvedBy:null, approvedAt:null,
    baseCost:costing.baseCost, sellingPrice:costing.sellingPrice, discountPct:discount, finalPrice, margin };
  DB.quotations.push(rev);
  q.status='Superseded'; save();
  logAudit({type:'QuotationRevised', quotationId:id, newRevisionId:rev.id, revision:rev.revision, reason:reason||'', userId:actor.id, role:actor.role});
  return {ok:true, quotation:rev, superseded:q.id};
}
function recordAcceptance({quotationId, status, acceptedBy, evidenceRef, notes, actor}){
  const q = DB.quotations.find(x=>x.id===quotationId);
  if(!q) return {ok:false, error:'Quotation not found.'};
  if(!['Approved','Sent'].includes(q.status)) return {ok:false, error:`Cannot record acceptance — quotation is "${q.status}", must be Approved/Sent first.`};
  const acc = { id:'ACC-'+String(DB.acceptances.length+1).padStart(4,'0'), quotationId, status: status||'Pending',
    acceptedBy: acceptedBy||null, acceptedDate: status==='Accepted' ? new Date().toISOString().slice(0,10) : null,
    evidenceRef: evidenceRef||null, notes:notes||'', evidenceMethod: 'MANUAL_RECORD — E-SIGNATURE INTEGRATION PENDING',
    userId:actor.id, at:nowIso() };
  DB.acceptances.push(acc);
  if(status==='Accepted') q.status='Accepted';
  save();
  logAudit({type:'AcceptanceRecorded', quotationId, status:acc.status, userId:actor.id, role:actor.role});
  return {ok:true, acceptance:acc};
}

// DEFECT FOUND & FIXED (Phase 20 §2 gap-discovery audit): this function accepted its own
// `gstNumber` parameter/field, independent of the `gstin` field Phase 19 added to the SAME
// Customer entity for the SAME real-world concept (a customer's GST registration number). In
// practice `gstNumber` was never actually populated by the one real internal caller
// (`wonTransition`), so no live data was lost — but the duplicate field was a genuine data-model
// risk for the real accounts team (two differently-named, differently-defaulted fields for one
// concept, only one of which the Phase 19 UI/audit trail actually knows about). Consolidated onto
// `gstin` — the field with the working setter, audit trail (`CustomerGSTINChanged`), and
// normalization (uppercase-trim) already built and tested in Phase 19.
function findOrCreateCustomer({name, contact, billingAddress, siteAddress, gstin, paymentTerms, salesOwnerId, leadId, quotationId, actor}){
  // Phase 14 P1 fix — a live forensic audit found this function had NO name requirement at all
  // (a POST omitting `name` entirely created a real, nameless customer, CUST-037) — the exact
  // same class of gap createVendorMaster() already closed for vendors; mirrors that function's
  // own guard verbatim, not a new validation concept.
  if(!name || !name.trim()) return {ok:false, error:'Customer name is required.'};
  // Phase 37 HIGH FIX — matching by name alone (live-reproduced in the Phase 2 audit: "Ramesh Kumar
  // Interiors" and "Ramesh Kumar Interior", identical GSTIN, created as two separate customers)
  // meant the one field that actually, uniquely identifies a real business entity was never
  // checked. GSTIN match now takes priority over the name heuristic — a genuine GST number match
  // is far stronger evidence of "same customer" than a text-normalized name ever was. Note: this
  // master has no structured phone/email fields at all today (only free-text `contact`), so a
  // phone/email dedup check is not possible without first adding those fields — disclosed, not
  // silently assumed solved by this fix.
  const normGstin = gstin ? String(gstin).trim().toUpperCase() : null;
  const existing = (normGstin && DB.customers.find(c=>c.gstin && c.gstin===normGstin))
    || DB.customers.find(c=>c.name && name && c.name.trim().toLowerCase()===name.trim().toLowerCase());
  if(existing){
    const matchedBy = (normGstin && existing.gstin===normGstin) ? 'GSTIN' : 'name';
    logAudit({type:'CustomerLinked', customerId:existing.id, leadId, quotationId, matchedBy, userId:actor.id, role:actor.role, note:'Matched by '+matchedBy+' — not a full fuzzy-match dedup engine'});
    return {ok:true, customer:existing, created:false};
  }
  const cust = { id: nextId(DB.customers, 'CUST-', 3), name, contact:contact||'', billingAddress:billingAddress||'', siteAddress:siteAddress||'',
    gstin: gstin ? String(gstin).trim().toUpperCase() : null, paymentTerms:paymentTerms||'', active:true, salesOwnerId:salesOwnerId||actor.id,
    createdFromLeadId:leadId||null, createdFromQuotationId:quotationId||null, createdAt:nowIso(), createdBy:actor.id };
  DB.customers.push(cust); save();
  logAudit({type:'CustomerCreated', customerId:cust.id, leadId, quotationId, userId:actor.id, role:actor.role});
  return {ok:true, customer:cust, created:true};
}

function freezeStandardCostBaseline({projectId, costingVersionId, approvedRevenue, reason, actor}){
  const costing = DB.costingVersions.find(c=>c.id===costingVersionId);
  if(!costing) return {ok:false, error:'Costing version not found.'};
  const prior = DB.standardCostBaselines.filter(b=>b.projectId===projectId);
  const baseline = { id:'BASE-'+String(DB.standardCostBaselines.length+1).padStart(4,'0'), projectId, version:prior.length+1, costingVersionId,
    materialCost:costing.materialCost, labourCost:costing.labourCost, transportCost:costing.transportCost, installationCost:costing.installationCost, otherCost:costing.otherCost,
    totalStandardCost: costing.materialCost+costing.labourCost+costing.transportCost+costing.installationCost+costing.otherCost,
    approvedRevenue: +approvedRevenue||0, expectedMargin: (+approvedRevenue||0) - (costing.materialCost+costing.labourCost+costing.transportCost+costing.installationCost+costing.otherCost),
    reason: reason || (prior.length===0?'Initial baseline at project creation':'Re-baseline'), createdBy:actor.id, createdAt:nowIso() };
  DB.standardCostBaselines.push(baseline); save();
  logAudit({type:'BaselineCreated', baselineId:baseline.id, projectId, version:baseline.version, userId:actor.id, role:actor.role});
  return {ok:true, baseline};
}

// Won transition — validated SERVER-SIDE, not by any UI button state (§16).
function wonTransition({quotationId, projectManagerId, startDate, expectedCompletion, actor}){
  const q = DB.quotations.find(x=>x.id===quotationId);
  if(!q) return {ok:false, error:'Quotation not found.'};
  // Idempotency guard against the exact race §39 warns about (two users hitting Won
  // simultaneously must not create two projects/customers). Checked and set synchronously,
  // with no I/O in between, so Node's single-threaded event loop cannot interleave two
  // concurrent calls between the check and the set — same pattern as the Phase 6A clearing guard.
  if(q.wonProjectId) return {ok:false, error:`This quotation was already marked Won — project ${q.wonProjectId} already exists.`};
  if(q.status!=='Accepted') return {ok:false, error:`Cannot mark Won — quotation status is "${q.status}", must be Accepted first.`};
  const acceptance = DB.acceptances.filter(a=>a.quotationId===quotationId).slice(-1)[0];
  if(!acceptance || acceptance.status!=='Accepted') return {ok:false, error:'No valid acceptance record found for this quotation.'};
  if(!q.approvedBy) return {ok:false, error:'Quotation was never through commercial/discount approval.'};

  let customer;
  if(q.customerId){ customer = DB.customers.find(c=>c.id===q.customerId); }
  if(!customer){
    const lead = DB.leads.find(l=>l.id===q.leadId);
    const r = findOrCreateCustomer({name: q.prospectName || lead?.name || ('Customer for '+q.quotationNo), contact: lead?.contact, salesOwnerId: lead?.salesOwnerId, leadId:q.leadId, quotationId:q.id, actor});
    if(!r.ok) return r;
    customer = r.customer;
  }
  const project = { id:nextId(DB.projects, 'PRJ-', 3), name:`${customer.name} — ${q.quotationNo}`,
    budget: q.finalPrice, customerId:customer.id, leadId:q.leadId, quotationId:q.id, estimationRequestId:q.estimationRequestId,
    salesOwnerId: DB.leads.find(l=>l.id===q.leadId)?.salesOwnerId || null, projectManagerId: projectManagerId||null,
    site: DB.estimationRequests.find(e=>e.id===q.estimationRequestId)?.site || '', startDate: startDate||null, expectedCompletion: expectedCompletion||null,
    status:'PLANNED', approvedRevenue:q.finalPrice, advanceRequiredAmount:null, createdBy:actor.id, createdAt:nowIso() };
  DB.projects.push(project);
  q.wonProjectId = project.id; // set immediately, synchronously — closes the race window
  if(q.leadId) changeLeadStatus({leadId:q.leadId, newStatus:'WON', actor});
  save();
  const baseline = freezeStandardCostBaseline({projectId:project.id, costingVersionId:q.costingVersionId, approvedRevenue:q.finalPrice, reason:'Initial baseline at project creation', actor});
  logAudit({type:'Won', quotationId, projectId:project.id, customerId:customer.id, userId:actor.id, role:actor.role});
  return {ok:true, project, customer, baseline: baseline.baseline};
}

function setProjectAdvanceRequirement({projectId, amount, actor}){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return {ok:false, error:'Project not found.'};
  p.advanceRequiredAmount = +amount>0 ? +amount : null; save();
  logAudit({type:'AdvanceRequirementSet', projectId, amount:p.advanceRequiredAmount, userId:actor.id, role:actor.role});
  return {ok:true, project:p};
}
// Reuses the EXISTING Phase 5 draft lifecycle — Bank Dr / Customer Advance Liability Cr — not a
// new posting mechanism. Never recognized as revenue (§22).
function draftCustomerAdvance({customerId, projectId, amount, date, narration, createdByUserId, createdByRole}){
  const amt = +amount||0;
  if(!customerId || !projectId || amt<=0) return {ok:false, error:'Customer, project and a positive amount are required.'};
  const inactiveErr = assertCustomerSelectable(customerId); if(inactiveErr) return {ok:false, error:inactiveErr};
  // Phase 39 FIX — same cross-field consistency gap fixed in draftCustomerInvoice(): a phantom
  // project was accepted uncaught, and a project belonging to a DIFFERENT customer was never
  // checked against the supplied customerId.
  const proj = DB.projects.find(p=>p.id===projectId);
  if(!proj) return {ok:false, error:`Unknown project "${projectId}".`};
  if(proj.customerId && proj.customerId!==customerId) return {ok:false, error:`Project "${projectId}" belongs to a different customer ("${proj.customerId}"), not "${customerId}" — cannot record an advance from one customer against another customer's project.`};
  const lines = [ {account:'1000', debit:amt, credit:0, customerId, projectId}, {account:'2100', debit:0, credit:amt, customerId, projectId} ];
  return createDraft({date, narration:narration||'Customer Advance', docTypeCode:'RCPT', sourceType:'Customer Advance', docCategory:'CustomerAdvance', party:customerId, lines, createdByUserId, createdByRole});
}
function projectFinancialReadiness(projectId){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return null;
  // Phase 16 §13 — netted credit-debit (same reversal-visibility fix class as §13's other cases):
  // a reversed Customer Advance would otherwise still count toward Financial Readiness forever.
  const advanceReceived = DB.journalEntries.filter(je=>je.docCategory==='CustomerAdvance' && je.lines.some(l=>l.projectId===projectId))
    .flatMap(je=>je.lines).filter(l=>l.projectId===projectId && l.account==='2100').reduce((s,l)=>s+l.credit-l.debit,0);
  return { projectId, advanceRequiredAmount:p.advanceRequiredAmount, advanceReceived,
    financiallyReady: p.advanceRequiredAmount!=null && advanceReceived >= p.advanceRequiredAmount - 0.01,
    status: p.advanceRequiredAmount==null ? 'BUSINESS THRESHOLD PENDING — no advance requirement set for this project yet' : (advanceReceived>=p.advanceRequiredAmount-0.01?'Financially Ready':'Advance Pending') };
}

function submitDesign({projectId, version, actor}){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return {ok:false, error:'Project not found.'};
  const prior = DB.designs.filter(d=>d.projectId===projectId);
  const d = { id:'DSN-'+String(DB.designs.length+1).padStart(4,'0'), projectId, version: version||(prior.length+1),
    submittedBy:actor.id, submittedDate:nowIso(), reviewerId:null, status:'Submitted', approvedDate:null, remarks:null };
  DB.designs.push(d); save();
  logAudit({type:'DesignSubmitted', designId:d.id, projectId, version:d.version, userId:actor.id, role:actor.role});
  return {ok:true, design:d};
}
function reviewDesign({designId, status, remarks, actor}){
  const d = DB.designs.find(x=>x.id===designId);
  if(!d) return {ok:false, error:'Design not found.'};
  if(!DESIGN_STATUSES.includes(status)) return {ok:false, error:`Invalid status "${status}".`};
  if(d.status==='Approved') return {ok:false, error:'This design version is already Approved and cannot be silently overwritten — submit a new version instead.'};
  d.status=status; d.reviewerId=actor.id; d.remarks=remarks||''; if(status==='Approved') d.approvedDate=nowIso();
  save();
  logAudit({type:'DesignReviewed', designId, projectId:d.projectId, newState:status, userId:actor.id, role:actor.role});
  return {ok:true, design:d};
}

// Project Variation Phase 2 — a Change Request may optionally reference the specific commercial
// baseline (a quotation revision) it varies. NOTE ON ARCHITECTURE: this codebase has no separate
// "Quotation Revision" collection — a revision IS its own row in DB.quotations (chained via
// `revision`/`previousRevisionId`, sharing one `quotationNo`across the chain — see reviseQuotation()).
// So "quotationRevisionId" from the brief's target model is not a missing concept, it is exactly
// DB.quotations.id, and a distinct field name would invent a duplicate concept for something that
// already exists. costingVersionId is deliberately NOT stored redundantly here either: a quotation
// row already carries its own costingVersionId, so it is reachable via quotationId -> that
// quotation's costingVersionId without a second FK that could drift out of sync with the first.
// A quotation's authoritative link to the project it belongs to is `wonProjectId` (set once, at
// Won, and never reassigned) — NOT merely "does it equal project.quotationId" — because a project
// could in principle carry a LATER revision than the one it was originally won on; wonProjectId is
// the one field this codebase itself already treats as the source of truth for that ownership.
function assertChangeRequestQuotationLink(quotationId, projectId){
  if(!quotationId) return {ok:true};
  const q = DB.quotations.find(x=>x.id===quotationId);
  if(!q) return {ok:false, error:`Quotation "${quotationId}" does not exist.`};
  if(q.wonProjectId!==projectId) return {ok:false, error:`Quotation "${quotationId}" does not belong to project "${projectId}" — cannot link a variation to another project's commercial baseline.`};
  return {ok:true};
}
const CHANGE_REQUEST_REVISABLE_FIELDS = new Set(['description','reason','supportingReference','costImpact','revenueImpact','scheduleImpactDays','quotationId']);
function createChangeRequest({projectId, description, reason, quotationId, supportingReference, costImpact, revenueImpact, scheduleImpactDays, actor}){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return {ok:false, error:'Project not found.'};
  // Project Variation Phase 2 — genuinely missing field, confirmed absent in the prior phase's own
  // investigation: a Change Request could previously be raised with zero justification. Mandatory,
  // matching the reason field every other approval-adjacent document in this codebase already
  // requires (Purchase Requisition, GRN weighment override, Damage Report, BOM rejection, etc.).
  if(!reason || !String(reason).trim()) return {ok:false, error:'A reason is required to raise a Change Request.'};
  { const _q = assertChangeRequestQuotationLink(quotationId, projectId); if(!_q.ok) return _q; }
  // Financial edge-case hardening — same class of fix Phase 39 already applied to Quotation/Costing
  // (discountPct/overheadPct/profitPct): a bare `+costImpact||0` would silently turn a garbled or
  // non-finite input into a real 0, not an error. Sign is deliberately unrestricted for both (a
  // variation can legitimately reduce cost or reduce revenue), but both must be real, finite numbers.
  for(const [label,val] of [['costImpact',costImpact],['revenueImpact',revenueImpact]]){
    if(val!==undefined && val!==null && val!==''){
      const n = Number(val);
      if(!Number.isFinite(n)) return {ok:false, error:`${label} must be a real number — got "${val}".`};
    }
  }
  if(scheduleImpactDays!==undefined && scheduleImpactDays!==null && scheduleImpactDays!==''){
    const n = Number(scheduleImpactDays);
    if(!Number.isFinite(n)) return {ok:false, error:`scheduleImpactDays must be a real number — got "${scheduleImpactDays}".`};
  }
  // Financial Reconciliation phase — same class of fix as P0-4's BOM numbering: replaced the unsafe
  // length-based id with the centralized, collision-safe nextId()/maxIdSuffix() mechanism already
  // used everywhere else in this file. No second numbering algorithm invented.
  const cr = { id: nextId(DB.changeRequests, 'CR-', 4), documentNo: nextDocNumber('CR'), projectId,
    description:description||'', reason:String(reason).trim(), quotationId:quotationId||null, supportingReference:supportingReference||'',
    costImpact:+costImpact||0, revenueImpact:+revenueImpact||0, scheduleImpactDays:+scheduleImpactDays||0,
    status:'Draft', createdBy:actor.id, createdAt:nowIso(),
    submittedBy:null, submittedAt:null, approvedBy:null, approvedAt:null,
    rejectedBy:null, rejectedAt:null, rejectReason:null, cancelledBy:null, cancelledAt:null, cancellationReason:null,
    // Project Variation Phase 4 — explicit variation consumption, per the approved financial policy:
    // an Approved CR's revenueImpact is only ever reduced by an EXPLICIT invoice allocation, posted
    // through postDraft() (see validateVariationAllocations()/postDraft() below) — never inferred
    // from invoice dates, amounts, or CR ordering. availableRevenue is intentionally NOT a stored
    // field — it is always (revenueImpact - consumedRevenue), computed on read, so it can never
    // drift out of sync with the two numbers that actually define it.
    consumedRevenue: 0 };
  DB.changeRequests.push(cr); save();
  logAudit({type:'ChangeRequestCreated', changeRequestId:cr.id, projectId, quotationId:cr.quotationId, userId:actor.id, role:actor.role});
  return {ok:true, changeRequest:cr};
}
// Project Variation Phase 2 — real state machine, mirroring the ALREADY-ESTABLISHED BOM lifecycle
// (BOM_STATUSES/submitBOM/approveBOM/rejectBOM above) exactly, rather than inventing a new one.
// Deliberately does NOT include a distinct "Under Review" state: this codebase's own precedent
// (BOM) goes straight Submitted -> Approved/Rejected with no separate reviewer step, and CR reuses
// that same precedent rather than adding a workflow concept nothing else in the system has.
// Deliberately does NOT include "Superseded": BOM uses Superseded because only ONE Approved BOM
// should ever be active per project+site+scope (a real scope-collision concept). A Change Request
// has no equivalent — approved variations are cumulative/additive (projectBillingCeiling() SUMS
// every Approved CR's revenueImpact), not mutually exclusive baselines, so there is nothing for a
// later CR to "supersede." Considered and deliberately not implemented, not a silent omission.
const CHANGE_REQUEST_STATUSES = ['Draft','Submitted','Approved','Rejected','Cancelled'];
function submitChangeRequest({id, actor}){
  const cr = DB.changeRequests.find(x=>x.id===id);
  if(!cr) return {ok:false, error:'Change Request not found.'};
  if(cr.status!=='Draft') return {ok:false, error:`Cannot submit — "${cr.status}", not Draft.`};
  if(!can(actor,'submit')) return {ok:false, error:`Role "${actor.role}" cannot submit a Change Request.`};
  cr.status='Submitted'; cr.submittedBy=actor.id; cr.submittedAt=nowIso(); save();
  logAudit({type:'ChangeRequestSubmitted', changeRequestId:id, projectId:cr.projectId, userId:actor.id, role:actor.role});
  return {ok:true, changeRequest:cr};
}
function approveChangeRequest({id, actor}){
  const cr = DB.changeRequests.find(x=>x.id===id);
  if(!cr) return {ok:false, error:'Change request not found.'};
  // Project Variation Phase 2 — status guard tightened from "!=='Draft'" to "!=='Submitted'" now
  // that a real Submitted state exists (Draft -> Approved directly is no longer a valid transition
  // — see the API bypass tests for this exact attack). Any CR created before this phase is either
  // 'Draft' (must now be explicitly submitted first, same as it would have to be re-approved under
  // the old rule too) or already 'Approved' (untouched, no re-approval needed or possible).
  if(cr.status!=='Submitted') return {ok:false, error:`Cannot approve — "${cr.status}" — a Change Request must be Submitted before it can be approved.`};
  if(!(['Admin','CEO','FinanceManager'].includes(actor.role))) return {ok:false, error:`Role "${actor.role}" cannot approve Change Requests.`};
  // Business Process Control Closure phase — segregation of duties, matching the SAME convention
  // already used everywhere else in this file for a creator/approver pair (Purchase Requisition,
  // Purchase Order, Quotation discount, BOM, etc: `createdBy===actor.id` blocked unless CEO/Admin).
  // Real gap LIVE PROVEN absent before this fix. Approving a Change Request has real financial
  // consequence (its revenueImpact directly raises a project's customer-invoice billing ceiling via
  // projectBillingCeiling()), so it deserves the same genuine second-person check every other
  // commercial-impact approval in this codebase already has — not a new, stricter, invented policy.
  if(cr.createdBy===actor.id && !['CEO','Admin'].includes(actor.role)){
    return {ok:false, error:'Segregation of duties: Change Request creator cannot also be the approver.'};
  }
  cr.status='Approved'; cr.approvedBy=actor.id; cr.approvedAt=nowIso(); save();
  logAudit({type:'ChangeRequestApproved', changeRequestId:id, projectId:cr.projectId, userId:actor.id, role:actor.role});
  // Deliberately does NOT auto-create a new baseline/re-price anything — §25: "do not implement
  // full variation billing... but the data model must not prevent it later." A FinanceManager/
  // CEO can call freezeStandardCostBaseline() again manually if a re-baseline is warranted.
  return {ok:true, changeRequest:cr};
}
function rejectChangeRequest({id, reason, actor}){
  const cr = DB.changeRequests.find(x=>x.id===id);
  if(!cr) return {ok:false, error:'Change Request not found.'};
  if(cr.status!=='Submitted') return {ok:false, error:`Cannot reject — "${cr.status}", not Submitted.`};
  if(!(['Admin','CEO','FinanceManager'].includes(actor.role))) return {ok:false, error:`Role "${actor.role}" cannot reject Change Requests.`};
  if(!reason || !String(reason).trim()) return {ok:false, error:'A reason is required to reject a Change Request.'};
  cr.status='Rejected'; cr.rejectedBy=actor.id; cr.rejectedAt=nowIso(); cr.rejectReason=String(reason).trim(); save();
  logAudit({type:'ChangeRequestRejected', changeRequestId:id, projectId:cr.projectId, reason:cr.rejectReason, userId:actor.id, role:actor.role});
  return {ok:true, changeRequest:cr};
}
// Rejected -> Draft, with an optional whitelist-based edit in the same call — mirrors
// reviseQuotation()'s own established whitelist pattern (QUOTATION_REVISABLE_FIELDS) rather than
// inventing a second "safe field update" mechanism. History (rejectedBy/At/rejectReason) is
// deliberately left untouched — it remains a permanent record of the LAST rejection even after the
// document moves back to Draft, matching this codebase's "never silently erase history" convention.
function reviseChangeRequest({id, changes, actor}){
  const cr = DB.changeRequests.find(x=>x.id===id);
  if(!cr) return {ok:false, error:'Change Request not found.'};
  if(cr.status!=='Rejected') return {ok:false, error:`Cannot revise — "${cr.status}", not Rejected.`};
  if(!can(actor,'edit')) return {ok:false, error:`Role "${actor.role}" cannot revise a Change Request.`};
  const safeChanges = {};
  for(const [k,v] of Object.entries(changes||{})){
    if(!CHANGE_REQUEST_REVISABLE_FIELDS.has(k)) return {ok:false, error:`"${k}" cannot be set directly on a revision.`};
    safeChanges[k] = v;
  }
  const newQuotationId = safeChanges.quotationId!==undefined ? safeChanges.quotationId : cr.quotationId;
  { const _q = assertChangeRequestQuotationLink(newQuotationId, cr.projectId); if(!_q.ok) return _q; }
  for(const [label,val] of [['costImpact',safeChanges.costImpact],['revenueImpact',safeChanges.revenueImpact],['scheduleImpactDays',safeChanges.scheduleImpactDays]]){
    if(val!==undefined && val!==null && val!==''){
      const n = Number(val);
      if(!Number.isFinite(n)) return {ok:false, error:`${label} must be a real number — got "${val}".`};
    }
  }
  if(safeChanges.reason!==undefined && (!safeChanges.reason || !String(safeChanges.reason).trim())) return {ok:false, error:'A reason is required.'};
  Object.assign(cr, safeChanges);
  if(safeChanges.quotationId!==undefined) cr.quotationId = safeChanges.quotationId||null;
  if(safeChanges.costImpact!==undefined) cr.costImpact = +safeChanges.costImpact||0;
  if(safeChanges.revenueImpact!==undefined) cr.revenueImpact = +safeChanges.revenueImpact||0;
  if(safeChanges.scheduleImpactDays!==undefined) cr.scheduleImpactDays = +safeChanges.scheduleImpactDays||0;
  if(safeChanges.reason!==undefined) cr.reason = String(safeChanges.reason).trim();
  cr.status='Draft'; save();
  logAudit({type:'ChangeRequestRevised', changeRequestId:id, projectId:cr.projectId, changedFields:Object.keys(safeChanges), userId:actor.id, role:actor.role});
  return {ok:true, changeRequest:cr};
}
// Approved -> Cancelled. Same role tier as approve/reject (the people authorized to decide a
// variation's commercial fate are the same people authorized to later withdraw that decision) — not
// a new, invented tier. No creator-vs-canceller SoD is enforced here (unlike approve): cancellation
// is a subsequent, separate control decision by the same authority tier, the same shape as
// disposeFixedAsset()/reverseEntry() in this codebase, neither of which requires a different actor
// than the original poster.
// Project Variation Phase 4 — governing financial policy (explicitly given, not inferred): an
// Approved CR may be cancelled ONLY when it has zero customer-billing CONSUMPTION — i.e.
// consumedRevenue===0. Once ANY amount has been explicitly allocated to a posted invoice against
// this CR (postDraft(), see below), cancellation is permanently blocked — the already-posted
// invoice is never touched, reversed, or credit-noted by this function, and no historical journal
// entry is read or modified here at all. This is a real behavior change from Phase 2/3 (which
// allowed cancellation regardless of consumption, producing the live-proven negative-remaining-
// ceiling scenario) — this phase's own governing policy explicitly supersedes that prior behavior.
function cancelChangeRequest({id, reason, actor}){
  const cr = DB.changeRequests.find(x=>x.id===id);
  if(!cr) return {ok:false, error:'Change Request not found.'};
  if(cr.status!=='Approved') return {ok:false, error:`Cannot cancel — "${cr.status}", not Approved.`};
  if(!(['Admin','CEO','FinanceManager'].includes(actor.role))) return {ok:false, error:`Role "${actor.role}" cannot cancel Change Requests.`};
  if(!reason || !String(reason).trim()) return {ok:false, error:'A reason is required to cancel a Change Request.'};
  if(+cr.consumedRevenue>0.001){
    logAudit({type:'ChangeRequestCancellationBlocked', changeRequestId:id, projectId:cr.projectId, consumedRevenue:cr.consumedRevenue, revenueImpact:cr.revenueImpact, userId:actor.id, role:actor.role});
    return {ok:false, error:`Cannot cancel — ₹${(+cr.consumedRevenue).toLocaleString('en-IN')} of this Change Request's ₹${(+cr.revenueImpact).toLocaleString('en-IN')} variation has already been consumed by posted customer billing (see invoicesConsumingChangeRequest("${id}") for the specific invoices). The already-posted billing is never reversed by cancellation — this Change Request must remain Approved.`, consumedRevenue:cr.consumedRevenue};
  }
  cr.status='Cancelled'; cr.cancelledBy=actor.id; cr.cancelledAt=nowIso(); cr.cancellationReason=String(reason).trim(); save();
  logAudit({type:'ChangeRequestCancelled', changeRequestId:id, projectId:cr.projectId, reason:cr.cancellationReason, revenueImpact:cr.revenueImpact, consumedRevenue:cr.consumedRevenue, userId:actor.id, role:actor.role});
  return {ok:true, changeRequest:cr};
}
// Bidirectional traceability, per Phase 4's requirement: given a CR, which invoices (draft or
// posted) have allocated against it. Purely a read-side query over the existing jeDrafts collection
// — no new collection, no denormalized copy that could drift.
function invoicesConsumingChangeRequest(changeRequestId){
  return DB.jeDrafts.filter(d=>Array.isArray(d.variationAllocations) && d.variationAllocations.some(a=>a.changeRequestId===changeRequestId))
    .map(d=>({draftId:d.id, status:d.status, postedEntryId:d.postedEntryId,
      allocatedAmount: d.variationAllocations.filter(a=>a.changeRequestId===changeRequestId).reduce((s,a)=>s+(+a.amount||0),0),
      counted: d.status==='Posted' }));
}
// Project Variation Phase 5 — the same reverse-lookup shape, extended forward down the execution
// chain: CR -> BOMs, and CR -> POs (with GRNs derived one more hop through each PO's own poId,
// rather than stored redundantly — see createGRN()'s VariationGRNReceived comment).
function bomsForChangeRequest(changeRequestId){
  return DB.boms.filter(b=>b.changeRequestId===changeRequestId)
    .map(b=>({bomId:b.id, docNo:b.docNo, status:b.status, version:b.version, projectId:b.projectId}));
}
// Project Variation Phase 9 — DEFECT FOUND & FIXED, live-proven during this phase's own "hide
// variation as baseline" testing: a PO created with materialRequestId (tracing to a variation BOM)
// but with changeRequestId deliberately omitted was correctly classified VARIATION by
// resolveProcurementScope() (the authoritative classifier) — but this function, doing its own
// separate direct-field-only lookup, never found it, so the CR's own /execution traversal silently
// UNDER-REPORTED its true procurement footprint. Fixed by reusing resolveProcurementScope() itself
// for every PO once (not reimplementing its derivation logic a second time), so the two can never
// disagree again. `direct` and `derived` are mutually exclusive by construction (derived explicitly
// excludes any PO that already has its own changeRequestId), so no PO is ever double-counted.
function posForChangeRequest(changeRequestId){
  const direct = DB.purchaseOrders.filter(p=>p.changeRequestId===changeRequestId);
  const derived = DB.purchaseOrders.filter(p=>{
    if(p.changeRequestId) return false;
    const s = resolveProcurementScope({docType:'PurchaseOrder', docId:p.id});
    return s.scope==='VARIATION' && s.changeRequestId===changeRequestId;
  });
  return [...direct, ...derived].map(p=>({poId:p.id, poNo:p.poNo, status:p.status, total:p.total, projectId:p.projectId,
    relationship: p.changeRequestId===changeRequestId ? 'direct (PO.changeRequestId)' : 'derived (materialRequestId chain)',
    grns: DB.grns.filter(g=>g.poId===p.id).map(g=>({grnId:g.id, grnNo:g.grnNo,
      totalAcceptedValue: r2((g.lines||[]).reduce((s,l)=>s+(+l.qtyAccepted||0)*(+l.rate||0),0))}))}));
}
// Project Variation Phase 6 — derived, multi-hop: CR -> BOM -> Material Requirement (real FK), then
// Material Requirement -> Material Request (via requirementIds, a real, PRE-EXISTING FK this phase
// did not need to add) -> RFQ -> Supplier Comparison -> PO. Each hop is walked explicitly and
// labeled `direct` (a stored FK) or `derived` (found by scanning the next collection for a
// reference back) — never fabricated when a hop genuinely does not exist for a given requirement.
// Purchase Requisition is DELIBERATELY EXCLUDED from this chain — see the report's §D architecture
// finding: PR (free-text items, no materialId, no materialRequirementId) is a structurally SEPARATE,
// parallel gate on PO creation, not a link in this chain, and fabricating one here would be exactly
// the "decorative traceability" this phase was told not to build.
function materialRequirementsForChangeRequest(changeRequestId){
  const bomIds = new Set(bomsForChangeRequest(changeRequestId).map(b=>b.bomId));
  return DB.materialRequirements.filter(m=>m.bomId && bomIds.has(m.bomId)).map(m=>{
    const materialRequest = DB.materialRequests.find(mr=>Array.isArray(mr.requirementIds) && mr.requirementIds.includes(m.id));
    let rfq = null, comparison = null, pos = [];
    if(materialRequest){
      rfq = DB.rfqs.find(r=>r.materialRequestId===materialRequest.id) || null;
      if(rfq) comparison = DB.supplierComparisons.find(c=>c.rfqId===rfq.id) || null;
      pos = DB.purchaseOrders.filter(p=>p.materialRequestId===materialRequest.id).map(p=>({poId:p.id, status:p.status}));
    }
    return { requirementId:m.id, docNo:m.docNo, status:m.status, bomId:m.bomId, materialId:m.materialId, qty:m.qty,
      materialRequest: materialRequest?{id:materialRequest.id, status:materialRequest.status, relationship:'derived (requirementIds)'}:null,
      rfq: rfq?{id:rfq.id, status:rfq.status, relationship:'derived (materialRequestId)'}:null,
      comparison: comparison?{id:comparison.id, relationship:'derived (rfqId)'}:null,
      purchaseOrdersViaMaterialRequest: pos };
  });
}

// ---------- Project Variation Phase 7 — scope classification, source integrity, variation value ----------
// A single authoritative classifier, per §5. IMPORTANT, stated explicitly rather than hidden in
// behavior: for a TOP-LEVEL document (BOM, and a Material Requirement raised independently of any
// BOM), "no changeRequestId" is classified BASELINE — not because "no CR = baseline" is assumed as
// a blanket inference rule, but because that IS this architecture's own current, designed meaning of
// an untagged document (CR tagging is optional-by-policy — see the report's §C). UNKNOWN is reserved
// for genuine ambiguity: the document itself does not exist, or a derivation hop points at a record
// that cannot be found. A downstream/derived document (Material Requirement via bomId, Purchase
// Order via materialRequestId) never re-decides this on its own — it always defers to whatever its
// upstream source resolves to, so the classification is consistent along the whole chain.
// Project Variation Phase 11 — DERIVED, never stored: a project is "variation-active" exactly
// when it currently has at least one Approved Change Request. Recomputed on every call so it can
// never drift out of sync with DB.changeRequests (same "derived, not stored" discipline as
// availableRevenue/consumedRevenue above). This is intentionally REVERSIBLE: if a project's only
// Approved CR is later cancelled (only possible while consumedRevenue===0 — see
// cancelChangeRequest()), the project reverts to not-variation-active. Whether governance should
// instead remain permanently "entered" once triggered is left as an explicit, undecided
// MANAGEMENT DECISION (see the accompanying report) — a permanent-entry model would require
// STORED state (project.variationActive) instead, deliberately not built without that
// authorization, per this phase's own "prefer derived state, avoid redundant state" instruction.
function variationActive(projectId){
  return DB.changeRequests.some(cr => cr.projectId===projectId && cr.status==='Approved');
}
function resolveProcurementScope({docType, docId}){
  const base = {docType, docId, scope:'UNKNOWN', projectId:null, changeRequestId:null, sourceDocument:null, sourceType:null, traceabilityPath:[]};
  if(!docType || !docId) return base;
  if(docType==='BOM'){
    const bom = DB.boms.find(b=>b.id===docId);
    if(!bom) return base;
    return {...base, scope: bom.changeRequestId?'VARIATION':'BASELINE', projectId:bom.projectId, changeRequestId:bom.changeRequestId||null,
      sourceType:'DIRECT', traceabilityPath:['BOM']};
  }
  if(docType==='MaterialRequirement'){
    const mrq = DB.materialRequirements.find(m=>m.id===docId);
    if(!mrq) return base;
    if(!mrq.bomId) return {...base, scope:'BASELINE', projectId:mrq.projectId, sourceType:'DIRECT', traceabilityPath:['MaterialRequirement']};
    const bomScope = resolveProcurementScope({docType:'BOM', docId:mrq.bomId});
    if(bomScope.scope==='UNKNOWN'){
      // The BOM this requirement claims to trace to does not exist — SOURCE NOT FOUND, distinct from
      // "no source was ever supplied" (that case returns sourceType:'DIRECT' above, not this branch).
      return {...base, projectId:mrq.projectId, sourceDocument:mrq.bomId, sourceType:'BOM', traceabilityPath:['MaterialRequirement','BOM (SOURCE NOT FOUND)']};
    }
    return {...bomScope, docType, docId, sourceDocument:mrq.bomId, sourceType:'BOM', traceabilityPath:['MaterialRequirement', ...bomScope.traceabilityPath]};
  }
  if(docType==='PurchaseOrder'){
    const po = DB.purchaseOrders.find(p=>p.id===docId);
    if(!po) return base;
    if(po.changeRequestId){
      return {...base, scope:'VARIATION', projectId:po.projectId, changeRequestId:po.changeRequestId, sourceType:'DIRECT', traceabilityPath:['PurchaseOrder']};
    }
    if(po.materialRequestId){
      const mr = DB.materialRequests.find(x=>x.id===po.materialRequestId);
      if(mr && Array.isArray(mr.requirementIds)){
        for(const rid of mr.requirementIds){
          const s = resolveProcurementScope({docType:'MaterialRequirement', docId:rid});
          if(s.scope==='VARIATION'){
            return {...s, docType, docId, sourceDocument:po.materialRequestId, sourceType:'MaterialRequest', traceabilityPath:['PurchaseOrder','MaterialRequest', ...s.traceabilityPath]};
          }
        }
      }
      return {...base, scope:'BASELINE', projectId:po.projectId, sourceDocument:po.materialRequestId, sourceType:'MaterialRequest', traceabilityPath:['PurchaseOrder','MaterialRequest']};
    }
    if(po.purchaseRequisitionId){
      // Purchase Requisition is a deliberately SEPARATE, parallel gate (Phase 6 finding) — it carries
      // no material/CR relationship of its own, so a PR-sourced PO is BASELINE by the same "no
      // relationship exists to elevate it" reasoning, never fabricated as variation.
      return {...base, scope:'BASELINE', projectId:po.projectId, sourceDocument:po.purchaseRequisitionId, sourceType:'PurchaseRequisition', traceabilityPath:['PurchaseOrder','PurchaseRequisition']};
    }
    return {...base, scope:'BASELINE', projectId:po.projectId, sourceType:'DIRECT', traceabilityPath:['PurchaseOrder']};
  }
  return base;
}

// Project Variation Phase 7 §14 — deliberately kept as SEPARATE figures, never summed as if they
// were interchangeable (PO value is a COMMITMENT, GRN value is a RECEIPT, consumedRevenue is BILLED
// revenue — three different accounting moments, not three costs to add together). No equality
// between revenueImpact/costImpact and any of these is assumed or enforced anywhere in this function.
function changeRequestProcurementValueSummary(changeRequestId){
  const cr = DB.changeRequests.find(c=>c.id===changeRequestId);
  if(!cr) return null;
  const pos = posForChangeRequest(changeRequestId);
  const procurementCommittedValue = r2(pos.reduce((s,p)=>s+(+p.total||0),0));
  const grnReceivedValue = r2(pos.reduce((s,p)=>s+p.grns.reduce((s2,g)=>s2+(+g.totalAcceptedValue||0),0),0));
  // Inventory CONSUMED value — derived via this CR's BOMs' own Issue movements (the existing,
  // unmodified valuation basis createMaterialIssue() already posts at, moving-average rate at time
  // of issue — not re-derived or re-priced here).
  const bomIds = bomsForChangeRequest(changeRequestId).map(b=>b.bomId);
  const inventoryConsumedValue = r2(DB.inventoryMovements.filter(m=>bomIds.includes(m.bomId) && m.type==='Issue')
    .reduce((s,m)=>s+r2((+m.qty||0)*(+m.valuationRate||0)),0));
  const billedVariationValue = +cr.consumedRevenue||0;
  return { changeRequestId, revenueImpact:+cr.revenueImpact||0, costImpact:+cr.costImpact||0,
    procurementCommittedValue, grnReceivedValue, inventoryConsumedValue, billedVariationValue,
    note:'These five figures are independent accounting moments (approval, commitment, receipt, consumption, billing) — none is derived from another, and none is assumed equal to costImpact/revenueImpact.' };
}

// Project Variation Phase 7 §15 — ONLY the cost categories this codebase can actually attribute to a
// CR are included. Labour and "Other Direct Cost" have NO stored relationship to a Change Request
// anywhere in this codebase (labourWages/projectExpenses carry projectId, never bomId or
// changeRequestId) — reported as NOT TRACEABLE, never estimated, allocated, or defaulted to zero
// silently (zero would falsely imply "no labour cost," not "unknown labour cost").
function changeRequestVariationProfitability(changeRequestId){
  const cr = DB.changeRequests.find(c=>c.id===changeRequestId);
  if(!cr) return null;
  const values = changeRequestProcurementValueSummary(changeRequestId);
  const variationRevenue = values.billedVariationValue;
  const variationMaterialCost = values.inventoryConsumedValue;
  const grossContribution = r2(variationRevenue - variationMaterialCost);
  return { changeRequestId, variationRevenue, variationMaterialCost,
    variationLabourCost: 'NOT TRACEABLE', variationOtherDirectCost: 'NOT TRACEABLE',
    grossContribution, grossContributionBasis:'variationRevenue - variationMaterialCost ONLY (labour/other direct cost not traceable to a CR in this codebase — excluded, not assumed zero)',
    dimensions: { projectId:cr.projectId, changeRequestId, quotationId:cr.quotationId,
      boms: bomsForChangeRequest(changeRequestId).map(b=>b.bomId),
      purchaseOrders: posForChangeRequest(changeRequestId).map(p=>p.poId),
      invoices: invoicesConsumingChangeRequest(changeRequestId).filter(i=>i.counted).map(i=>i.draftId) } };
}

// ============================================================
// Phase 7 — Procurement → Inventory → Supplier Bill → AP → Payment → Manufacturing Cost
// ============================================================
// Valuation policy decision, made explicit rather than invented (§19 allows this): inventory
// is valued at MOVING AVERAGE (recomputed from real receipt history each time), fully
// implemented — not just "architecture supports it." `material.standardCost` remains a
// reference field for estimation/costing purposes (Phase 6B) only; it does NOT drive actual
// inventory valuation. Standard-Cost-with-variance (price-variance postings) was NOT built —
// disclosed as a real simplification, not hidden.
//
// GL account flow (uses ONLY the existing postJournalEntry — no second accounting engine):
//   GRN:              Dr Inventory (1200)         / Cr GR/IR Clearing (2050)   — at PO rate × qty accepted
//   Supplier Invoice:  Dr GR/IR Clearing (2050) [+ Dr Input Tax 1300] / Cr AP (2000) — clears GR/IR when matched
//   Material Issue:    Dr Project Material Cost (5000) / Cr Inventory (1200)   — at moving-average rate
// This is the concrete implementation of §21/§31/§32's repeated "purchased cost ≠ inventory
// value ≠ project actual consumption" requirement.

// Project Variation Phase 6 — the actual authoritative gap Phase 5 identified: a REAL, deterministic
// BOM -> Material Requirement link, closing "MR is fully disconnected from BOM/CR." Deliberately a
// SEPARATE pool from projectBomEntitlement()/materialBomQuota() (the existing Material ISSUE
// entitlement engine, which tracks stock already consumed) — this tracks how much of a BOM line's
// approved quantity has already been REQUISITIONED FOR PURCHASE, a genuinely different question
// ("how much do we still need to buy" vs. "how much can still be pulled from the warehouse"). Not a
// second issue-entitlement engine; a first, previously-missing requisition-entitlement one.
function materialRequirementBomEntitlement({bomId, materialId}){
  const bom = DB.boms.find(b=>b.id===bomId);
  if(!bom) return null;
  const line = bom.lines.find(l=>l.materialId===materialId);
  if(!line) return null;
  const approvedQty = +line.qty||0;
  const wastageQty = r2(approvedQty * ((+line.scrapPct||0)/100));
  const totalAllowed = r2(approvedQty + wastageQty);
  // Every non-Rejected MR against this same BOM+material counts toward "already requisitioned" —
  // a Rejected one legitimately frees its quantity back up for a fresh requisition, mirroring the
  // Return-nets-against-Issue convention projectBomEntitlement() already uses for the issue side.
  const alreadyRequisitioned = r2(DB.materialRequirements.filter(m=>m.bomId===bomId && m.materialId===materialId && m.status!=='REJECTED')
    .reduce((s,m)=>s+(+m.qty||0),0));
  return { bomId, materialId, approvedQty, wastageQty, totalAllowed, alreadyRequisitioned, remainingQty: r2(totalAllowed-alreadyRequisitioned) };
}
function createMaterialRequirement({projectId, materialId, qty, uom, requiredDate, priority, reason, bomId, actor}){
  if(!projectId || !materialId || !(+qty>0)) return {ok:false, error:'Project, material and a positive quantity are required.'};
  // Project Variation Phase 7 — DISABLED by default, same mechanism/reasoning as createBOM()'s own
  // gate immediately above it in this file's call order.
  // Project Variation Phase 9 — NAMING CAVEAT, confirmed live: this flag only requires a bomId to be
  // PRESENT — it does NOT, on its own, guarantee that BOM itself carries a changeRequestId. With
  // bomRequireCR left OFF, an MR can satisfy this gate by referencing a perfectly ordinary, untagged
  // BOM, so materialRequirementRequireCR alone does NOT reliably enforce CR traceability at the MR
  // level despite its name — the minimum combination that actually does is bomRequireCR:true AND
  // materialRequirementRequireCR:true together (see the accompanying report's policy-combination
  // findings). Not changed here: altering what this flag enforces would be a business-policy choice
  // this phase was not authorized to make, not a code defect to silently correct.
  if(DB.variationTaggingPolicy && DB.variationTaggingPolicy.materialRequirementRequireCR && !bomId){
    return {ok:false, error:'Policy requires every Material Requirement to reference a BOM (DB.variationTaggingPolicy.materialRequirementRequireCR is enabled) — none was supplied.'};
  }
  // Project Variation Phase 6 — optional, validated exactly like BOM.changeRequestId/PO.changeRequestId:
  // an ordinary, independently-raised MR (baseline OR variation-not-yet-tagged) is completely
  // unaffected. When bomId IS supplied, the CR that authorized the underlying variation is
  // deliberately NOT duplicated onto this record — it is always derivable, one hop away, via
  // bomId -> BOM.changeRequestId, exactly the same non-duplication reasoning already applied to
  // GRN.poId -> PO.changeRequestId in Phase 5.
  if(bomId){
    const bom = DB.boms.find(b=>b.id===bomId);
    if(!bom) return {ok:false, error:`BOM "${bomId}" does not exist.`};
    if(bom.status!=='Approved') return {ok:false, error:`BOM "${bomId}" is "${bom.status}", not Approved — a Material Requirement cannot be raised against a BOM that has not been approved.`};
    if(bom.projectId!==projectId) return {ok:false, error:`BOM "${bomId}" belongs to project "${bom.projectId}" — cannot raise a Material Requirement in project "${projectId}" against another project's BOM.`};
    if(!bom.lines.some(l=>l.materialId===materialId)) return {ok:false, error:`Material "${materialId}" does not appear on BOM "${bomId}" — cannot raise a requirement for it against this BOM.`};
    const ent = materialRequirementBomEntitlement({bomId, materialId});
    if(+qty > ent.remainingQty + 0.001) return {ok:false, error:`Requested quantity ${qty} exceeds BOM "${bomId}"'s remaining requisitionable quantity for "${materialId}" (${ent.remainingQty} of ${ent.totalAllowed} total allowed, ${ent.alreadyRequisitioned} already requisitioned).`};
  }
  const req = { id: nextId(DB.materialRequirements, 'MRQ-', 4), docNo: nextDocNumber('MRQ'), projectId, materialId, qty:+qty, uom:uom||'',
    requiredDate:requiredDate||null, priority:priority||'Normal', reason:reason||'', status:'DRAFT', bomId:bomId||null, createdBy:actor.id, createdAt:nowIso() };
  DB.materialRequirements.push(req); save();
  logAudit({type:'MaterialRequirementCreated', requirementId:req.id, projectId, bomId:req.bomId, userId:actor.id, role:actor.role});
  // Distinct, additional event ONLY when this requirement is actually BOM-tagged (never fabricated
  // for an ordinary, untagged requirement) — and only when that BOM is itself variation-tagged, so
  // the event genuinely means "this requirement traces to an approved variation," not merely "this
  // requirement happens to cite a BOM."
  if(req.bomId){
    const bom = DB.boms.find(b=>b.id===req.bomId);
    if(bom && bom.changeRequestId){
      logAudit({type:'VariationMaterialRequirementCreated', changeRequestId:bom.changeRequestId, projectId, bomId:req.bomId, requirementId:req.id, materialId, qty:+qty, userId:actor.id, role:actor.role});
    }
  }
  return {ok:true, requirement:req};
}
function submitMaterialRequirement({id, actor}){
  const r = DB.materialRequirements.find(x=>x.id===id);
  if(!r) return {ok:false, error:'Requirement not found.'};
  if(r.status!=='DRAFT') return {ok:false, error:`Cannot submit — "${r.status}", not DRAFT.`};
  r.status='SUBMITTED'; save();
  return {ok:true, requirement:r};
}
function approveMaterialRequirement({id, actor}){
  const r = DB.materialRequirements.find(x=>x.id===id);
  if(!r) return {ok:false, error:'Requirement not found.'};
  if(r.status!=='SUBMITTED') return {ok:false, error:`Cannot approve — "${r.status}", not SUBMITTED.`};
  if(r.createdBy===actor.id && !['CEO','Admin'].includes(actor.role)) return {ok:false, error:'Segregation of duties: creator cannot approve.'};
  r.status='APPROVED'; save();
  logAudit({type:'MaterialRequirementApproved', requirementId:id, userId:actor.id, role:actor.role});
  return {ok:true, requirement:r};
}

function createMaterialRequest({projectId, requirementIds, lines, actor}){
  if(!projectId || !Array.isArray(lines) || !lines.length) return {ok:false, error:'Project and at least one line are required.'};
  const mr = { id:'MR-'+String(DB.materialRequests.length+1).padStart(4,'0'), reqNo:nextDocNumber('MR'), projectId,
    requirementIds:requirementIds||[], lines, status:'DRAFT', createdBy:actor.id, createdAt:nowIso() };
  DB.materialRequests.push(mr);
  (requirementIds||[]).forEach(rid=>{ const r=DB.materialRequirements.find(x=>x.id===rid); if(r && r.status==='APPROVED') r.status='PARTIALLY_PROCESSED'; });
  save();
  logAudit({type:'MaterialRequestCreated', materialRequestId:mr.id, projectId, userId:actor.id, role:actor.role});
  return {ok:true, materialRequest:mr};
}
function submitMaterialRequest({id, actor}){
  const mr = DB.materialRequests.find(x=>x.id===id);
  if(!mr) return {ok:false, error:'Material Request not found.'};
  if(mr.status!=='DRAFT') return {ok:false, error:`Cannot submit — "${mr.status}", not DRAFT.`};
  mr.status='SUBMITTED'; save();
  return {ok:true, materialRequest:mr};
}
function approveMaterialRequest({id, actor}){
  const mr = DB.materialRequests.find(x=>x.id===id);
  if(!mr) return {ok:false, error:'Material Request not found.'};
  if(mr.status!=='SUBMITTED') return {ok:false, error:`Cannot approve — "${mr.status}", not SUBMITTED.`};
  if(mr.createdBy===actor.id && !['CEO','Admin'].includes(actor.role)) return {ok:false, error:'Segregation of duties: creator cannot approve.'};
  mr.status='APPROVED'; save();
  logAudit({type:'MaterialRequestApproved', materialRequestId:id, userId:actor.id, role:actor.role});
  return {ok:true, materialRequest:mr};
}
function rejectMaterialRequest({id, reason, actor}){
  const mr = DB.materialRequests.find(x=>x.id===id);
  if(!mr) return {ok:false, error:'Material Request not found.'};
  if(mr.status!=='SUBMITTED') return {ok:false, error:`Cannot reject — "${mr.status}", not SUBMITTED.`};
  mr.status='REJECTED'; mr.rejectReason=reason||''; save();
  return {ok:true, materialRequest:mr};
}

function createRFQ({projectId, materialRequestId, supplierIds, lines, requiredDate, terms, responseDeadline, actor}){
  const mr = DB.materialRequests.find(x=>x.id===materialRequestId);
  if(!mr || mr.status!=='APPROVED') return {ok:false, error:'Source Material Request must exist and be APPROVED before an RFQ can be issued.'};
  const rfq = { id:'RFQ-'+String(DB.rfqs.length+1).padStart(4,'0'), rfqNo:nextDocNumber('RFQ'), projectId, materialRequestId,
    supplierIds:supplierIds||[], lines:lines||mr.lines, requiredDate:requiredDate||null, terms:terms||'', responseDeadline:responseDeadline||null,
    status:'Issued', createdBy:actor.id, createdAt:nowIso() };
  DB.rfqs.push(rfq);
  mr.status='CONVERTED'; save();
  logAudit({type:'RFQIssued', rfqId:rfq.id, supplierCount:(supplierIds||[]).length, userId:actor.id, role:actor.role});
  return {ok:true, rfq};
}

function recordSupplierQuotation({rfqId, supplierId, lines, leadTime, validity, paymentTerms, actor}){
  const rfq = DB.rfqs.find(x=>x.id===rfqId);
  if(!rfq) return {ok:false, error:'RFQ not found.'};
  const priorVersions = DB.supplierQuotations.filter(q=>q.rfqId===rfqId && q.supplierId===supplierId);
  const total = (lines||[]).reduce((s,l)=>s+(+l.qty||0)*(+l.rate||0), 0);
  const sq = { id:'SQ-'+String(DB.supplierQuotations.length+1).padStart(4,'0'), rfqId, supplierId, version:priorVersions.length+1,
    lines:lines||[], total, leadTime:leadTime||'', validity:validity||'', paymentTerms:paymentTerms||'', createdAt:nowIso(), createdBy:actor.id };
  DB.supplierQuotations.push(sq); save(); // never overwrites a prior version — always a new record
  logAudit({type:'SupplierQuotationRecorded', supplierQuotationId:sq.id, rfqId, supplierId, version:sq.version, userId:actor.id, role:actor.role});
  return {ok:true, supplierQuotation:sq};
}

function createSupplierComparison({rfqId, recommendedSupplierId, reason, actor}){
  const rfq = DB.rfqs.find(x=>x.id===rfqId);
  if(!rfq) return {ok:false, error:'RFQ not found.'};
  const quotesLatestPerSupplier = {};
  DB.supplierQuotations.filter(q=>q.rfqId===rfqId).forEach(q=>{ if(!quotesLatestPerSupplier[q.supplierId] || q.version>quotesLatestPerSupplier[q.supplierId].version) quotesLatestPerSupplier[q.supplierId]=q; });
  const rows = Object.values(quotesLatestPerSupplier).map(q=>({supplierId:q.supplierId, supplierQuotationId:q.id, total:q.total, leadTime:q.leadTime, paymentTerms:q.paymentTerms}));
  if(rows.length<2) return {ok:false, error:'At least 2 supplier quotations are required for a comparison (do not auto-select without a real comparison).'};
  const comp = { id:'CMP-'+String(DB.supplierComparisons.length+1).padStart(4,'0'), rfqId, rows,
    recommendedSupplierId:recommendedSupplierId||null, reason:reason||'', status:'PendingApproval', approvedBy:null, createdBy:actor.id, createdAt:nowIso() };
  DB.supplierComparisons.push(comp); save();
  logAudit({type:'SupplierComparisonCreated', comparisonId:comp.id, rfqId, recommendedSupplierId, userId:actor.id, role:actor.role});
  return {ok:true, comparison:comp};
}
function approveSupplierComparison({id, actor}){
  const c = DB.supplierComparisons.find(x=>x.id===id);
  if(!c) return {ok:false, error:'Comparison not found.'};
  if(c.status!=='PendingApproval') return {ok:false, error:`Cannot approve — "${c.status}".`};
  if(c.createdBy===actor.id && !['CEO','Admin'].includes(actor.role)) return {ok:false, error:'Segregation of duties: creator cannot approve their own recommendation.'};
  c.status='Approved'; c.approvedBy=actor.id; save();
  logAudit({type:'SupplierComparisonApproved', comparisonId:id, userId:actor.id, role:actor.role});
  return {ok:true, comparison:c};
}

function requiredPOApprovalRole(amount){
  const rules = [...DB.poApprovalRules].sort((a,b)=>(a.upToAmount??Infinity)-(b.upToAmount??Infinity));
  for(const r of rules){ if(r.upToAmount===null || amount<=r.upToAmount) return r.requiredRole; }
  return 'CEO';
}
// Project Variation Phase 8 — closes the two disclosed Phase 7 gaps: materialRequestId/
// purchaseRequisitionId/supplierComparisonId (+ rfqId, the same risk class, same one-line fix) were
// all previously stored on a PO with ZERO existence/project/status validation — a PO could
// reference a nonexistent, cross-project, or nonsensical-status source document and nothing caught
// it. This is REFERENTIAL INTEGRITY, deliberately independent of the requirePRForPO POLICY switch
// (§9 of the brief): whether or not a PR is REQUIRED, a PR that IS voluntarily referenced must be
// real, same-project, and Approved — the existing requirePRForPO-gated check below (which only ever
// validated existence+status, never project) is left completely untouched; this function is a
// broader, always-on layer beneath it, not a replacement.
function assertPoSourceDocumentsConsistent({projectId, changeRequestId, materialRequestId, rfqId, purchaseRequisitionId, supplierComparisonId}){
  if(purchaseRequisitionId){
    const pr = DB.purchaseRequisitions.find(x=>x.id===purchaseRequisitionId);
    if(!pr) return {ok:false, error:`Purchase Requisition "${purchaseRequisitionId}" does not exist.`};
    // A PR may be site-scoped only (no projectId) — that case cannot be cross-checked against a PO
    // (which carries no siteId field of its own), so it is not rejected; only a genuine PROJECT
    // mismatch is blocked, never a structurally-unverifiable case treated as if it were a violation.
    if(pr.projectId && pr.projectId!==projectId) return {ok:false, error:`Purchase Requisition "${purchaseRequisitionId}" belongs to project "${pr.projectId}" — cannot reference it from project "${projectId}".`};
    if(pr.status!=='Approved') return {ok:false, error:`Purchase Requisition "${purchaseRequisitionId}" is "${pr.status}" — only an Approved, not-yet-converted Purchase Requisition can be referenced by a new PO (a "Converted" PR is already tied to a different PO; referencing it again would be a duplicate use).`};
  }
  let mr = null;
  let derivedChangeRequestId = null, derivedFrom = null;
  if(materialRequestId){
    mr = DB.materialRequests.find(x=>x.id===materialRequestId);
    if(!mr) return {ok:false, error:`Material Request "${materialRequestId}" does not exist.`};
    if(mr.projectId!==projectId) return {ok:false, error:`Material Request "${materialRequestId}" belongs to project "${mr.projectId}" — cannot reference it from project "${projectId}".`};
    if(!['APPROVED','CONVERTED'].includes(mr.status)) return {ok:false, error:`Material Request "${materialRequestId}" is "${mr.status}" — only an Approved (or already RFQ-converted) Material Request can be referenced by a PO.`};
    // Project Variation Phase 10 — DEFECT FOUND & FIXED, live-proven during this phase's own testing:
    // this derivation used to run ONLY inside the supplierComparisonId branch below, so a PO
    // supplying materialRequestId ALONE (no comparison) could carry an explicit changeRequestId that
    // silently contradicted the CR its own materialRequestId chain actually traced to — nothing
    // caught it. Moved here so it runs whenever materialRequestId is present at all, comparison or
    // not — the single check at the bottom of this function now sees it regardless of which fields
    // were supplied.
    if(Array.isArray(mr.requirementIds)){
      for(const rid of mr.requirementIds){
        const s = resolveProcurementScope({docType:'MaterialRequirement', docId:rid});
        if(s.scope==='VARIATION'){ derivedChangeRequestId = s.changeRequestId; derivedFrom = 'Material Request'; break; }
      }
    }
  }
  let rfq = null;
  if(rfqId){
    rfq = DB.rfqs.find(x=>x.id===rfqId);
    if(!rfq) return {ok:false, error:`RFQ "${rfqId}" does not exist.`};
    if(rfq.projectId!==projectId) return {ok:false, error:`RFQ "${rfqId}" belongs to project "${rfq.projectId}" — cannot reference it from project "${projectId}".`};
    if(materialRequestId && rfq.materialRequestId!==materialRequestId) return {ok:false, error:`RFQ "${rfqId}" was issued against Material Request "${rfq.materialRequestId}", not "${materialRequestId}" — inconsistent source documents.`};
  }
  if(supplierComparisonId){
    const cmp = DB.supplierComparisons.find(x=>x.id===supplierComparisonId);
    if(!cmp) return {ok:false, error:`Supplier Comparison "${supplierComparisonId}" does not exist.`};
    const cmpRfq = DB.rfqs.find(x=>x.id===cmp.rfqId);
    if(!cmpRfq) return {ok:false, error:`Supplier Comparison "${supplierComparisonId}" references RFQ "${cmp.rfqId}", which no longer exists — its project cannot be verified.`};
    if(cmpRfq.projectId!==projectId) return {ok:false, error:`Supplier Comparison "${supplierComparisonId}" traces (via its RFQ) to project "${cmpRfq.projectId}" — cannot reference it from project "${projectId}".`};
    if(rfqId && cmp.rfqId!==rfqId) return {ok:false, error:`Supplier Comparison "${supplierComparisonId}" belongs to RFQ "${cmp.rfqId}", not "${rfqId}" — inconsistent source documents.`};
    // Same check as the rfqId branch above, but reachable even when the caller supplies
    // supplierComparisonId + materialRequestId WITHOUT separately repeating rfqId — the comparison's
    // own chain is walked one hop further (Comparison -> RFQ -> materialRequestId) so this
    // inconsistency cannot slip through just because rfqId itself was omitted from the request.
    if(materialRequestId && cmpRfq.materialRequestId!==materialRequestId) return {ok:false, error:`Supplier Comparison "${supplierComparisonId}" traces (via its RFQ) to Material Request "${cmpRfq.materialRequestId}", not "${materialRequestId}" — inconsistent source documents.`};
    if(!cmp.recommendedSupplierId) return {ok:false, error:`Supplier Comparison "${supplierComparisonId}" has no recommended supplier recorded — cannot be used as a PO source.`};
    // If materialRequestId was NOT separately supplied, derive the chain-CR from the comparison's
    // own RFQ->materialRequestId instead (same derivation, different starting point) — this is the
    // ONLY case where derivedChangeRequestId isn't already set by the materialRequestId branch above.
    if(!derivedChangeRequestId){
      const cmpMr = DB.materialRequests.find(x=>x.id===cmpRfq.materialRequestId);
      if(cmpMr && Array.isArray(cmpMr.requirementIds)){
        for(const rid of cmpMr.requirementIds){
          const s = resolveProcurementScope({docType:'MaterialRequirement', docId:rid});
          if(s.scope==='VARIATION'){ derivedChangeRequestId = s.changeRequestId; derivedFrom = 'Supplier Comparison'; break; }
        }
      }
    }
  }
  if(changeRequestId && derivedChangeRequestId && changeRequestId!==derivedChangeRequestId){
    return {ok:false, error:`Inconsistent source documents: the supplied changeRequestId "${changeRequestId}" does not match the Change Request derived from the ${derivedFrom}'s own upstream chain ("${derivedChangeRequestId}") — a Purchase Order cannot claim two different authorizing variations at once.`};
  }
  // Project Variation Phase 11 — returned (not just checked) so createPurchaseOrder() can run its
  // own project-aware mandatory-tagging check against the SAME derivation, without a second,
  // duplicate chain-walk.
  return {ok:true, derivedChangeRequestId, derivedFrom};
}
function createPurchaseOrder({projectId, materialRequestId, rfqId, supplierComparisonId, purchaseRequisitionId, vendorId, lines, deliveryLocation, expectedDate, paymentTerms, terms, actor, overrideReason, changeRequestId}){
  if(!projectId || !vendorId || !Array.isArray(lines) || !lines.length) return {ok:false, error:'Project, vendor and at least one line are required.'};
  // Project Variation Phase 5 — optional traceability only, same shape as assertBomChangeRequestLink():
  // a PO MAY be tagged with the Approved Change Request that authorized this procurement. Not a new
  // mandatory gate (requirePRForPO stays untouched, per instruction) — a baseline PO with no
  // changeRequestId is completely unaffected. GRN inherits this traceability by DERIVING it through
  // po.changeRequestId (poId is already GRN's own authoritative upstream reference) rather than
  // duplicating the field a second time — the same "prefer the authoritative upstream document"
  // principle already applied to BOM's costingVersionId/quotationRevisionId decision in Phase 2.
  { const _cr = assertPoChangeRequestLink(changeRequestId, projectId); if(!_cr.ok) return _cr; }
  // Project Variation Phase 7 — DISABLED by default, same mechanism as createBOM()/
  // createMaterialRequirement()'s own gates.
  if(DB.variationTaggingPolicy && DB.variationTaggingPolicy.purchaseOrderRequireCR && !changeRequestId){
    return {ok:false, error:'Policy requires every Purchase Order to reference an Approved Change Request (DB.variationTaggingPolicy.purchaseOrderRequireCR is enabled) — none was supplied.'};
  }
  // Project Variation Phase 8 — referential integrity for every OTHER optional source reference,
  // always on (independent of any policy toggle — see the function's own comment above).
  let _src;
  { _src = assertPoSourceDocumentsConsistent({projectId, changeRequestId, materialRequestId, rfqId, purchaseRequisitionId, supplierComparisonId}); if(!_src.ok) return _src; }
  // Project Variation Phase 11 — project-aware, chain-derived mandatory tagging. Unlike Phase 7's
  // blunt purchaseOrderRequireCR (which demands a CR on EVERY PO project-wide, including projects
  // with zero variation history — see Phase 10's report), this only fires when the PO's OWN
  // upstream chain (materialRequestId/supplierComparisonId, already walked by
  // assertPoSourceDocumentsConsistent() above) independently proves variation lineage AND that
  // lineage's Change Request is CURRENTLY Approved (not merely once-Approved-then-cancelled — see
  // report §12/§16: forcing propagation of a CR that would itself now be rejected as non-Approved
  // would be a dead end, not a control). A PO with no such chain relationship — pure baseline work,
  // even on a project that has other, unrelated Approved CRs — is never touched by this check.
  if(DB.variationTaggingPolicy && DB.variationTaggingPolicy.enabled && DB.variationTaggingPolicy.purchaseOrderRequireCRForVariation
     && _src.derivedChangeRequestId && !changeRequestId && variationActive(projectId)){
    const derivedCr = DB.changeRequests.find(c=>c.id===_src.derivedChangeRequestId);
    if(derivedCr && derivedCr.status==='Approved'){
      return {ok:false, error:`Policy requires explicit Change Request tagging for variation-linked procurement (DB.variationTaggingPolicy.purchaseOrderRequireCRForVariation is enabled): this Purchase Order's source chain (via ${_src.derivedFrom}) already traces to Change Request "${_src.derivedChangeRequestId}" — supply changeRequestId:"${_src.derivedChangeRequestId}" explicitly rather than leaving it implicit.`};
    }
  }
  // Phase 33 (adversarial audit thread) Part D — closed-project gate. Also closes a distinct,
  // narrower gap found alongside it: this function previously never confirmed the project actually
  // EXISTS at all (only that projectId was a non-empty string) — assertProjectOpenForPosting()'s
  // own existence check now covers that too, as a side effect of adding the status gate, not a
  // separately-scoped fix.
  { const _po = assertProjectOpenForPosting(projectId, actor, {overrideReason, action:'create a Purchase Order'}); if(!_po.ok) return _po; }
  const vendorInactiveErr = assertVendorSelectable(vendorId); if(vendorInactiveErr) return {ok:false, error:vendorInactiveErr};
  // ERP AUDIT FIX (ERP-046, High) — materialId validation was CONDITIONAL (`if(l.materialId)`), so
  // a PO line omitting materialId entirely skipped the check altogether and was accepted with no
  // inventory identity at all — live-proven by the audit. GRN already requires every line to
  // resolve to `po.lines[idx].materialId` (see createGRN), so a materialId-less PO line is
  // unreceivable in a way createGRN can even validate — this closes the gap at its source instead.
  // ERP AUDIT FIX (ERP-029, High) — qty/rate/uom had no validation at all beyond feeding straight
  // into the `total` calculation below via `+l.qty||0` — negative, zero, non-numeric and Infinity
  // values were all silently coerced rather than rejected, live-proven by the audit.
  for(let i=0;i<lines.length;i++){
    const l = lines[i];
    if(!l.materialId) return {ok:false, error:`Line ${i}: material is required on every Purchase Order line.`};
    const err = assertMaterialSelectable(l.materialId); if(err) return {ok:false, error:err};
    const _qChk = assertPositiveFiniteNumber(l.qty, `Line ${i} quantity`);
    if(!_qChk.ok) return _qChk;
    const _rChk = assertNonNegativeFiniteNumber(l.rate, `Line ${i} rate`);
    if(!_rChk.ok) return _rChk;
    if(!l.uom || !String(l.uom).trim()) return {ok:false, error:`Line ${i}: UOM is required.`};
  }
  const total = lines.reduce((s,l)=>s+(+l.qty||0)*(+l.rate||0), 0);
  // Phase 33 SOP §1/§7 — Purchase Requisition gate. Configurable, DEFAULTS OFF
  // (DB.purchaseApprovalConfig.requirePRForPO) — every existing PO-creation call site/test is
  // completely unaffected until Appletree Finance formally adopts this as a live control (flipping
  // a business process, not just a code deploy). When ON: every PO needs either an APPROVED,
  // not-yet-converted PR reference, or qualifies for the SOP's own defined site-petty exception
  // (total within the configured daily limit). See PHASE33_SOP_GAP_REGISTER.md #1.
  let pr = null;
  if(DB.purchaseApprovalConfig && DB.purchaseApprovalConfig.requirePRForPO){
    const sitePettyLimit = DB.purchaseApprovalConfig.sitePettyDailyLimit || 5000;
    const qualifiesForSitePettyException = total <= sitePettyLimit;
    if(purchaseRequisitionId){
      pr = DB.purchaseRequisitions.find(x=>x.id===purchaseRequisitionId);
      if(!pr) return {ok:false, error:'Purchase Requisition not found.'};
      if(pr.status!=='Approved') return {ok:false, error:`Cannot raise a PO against PR "${purchaseRequisitionId}" — status is "${pr.status}", not Approved.`};
    } else if(!qualifiesForSitePettyException){
      return {ok:false, error:`No Purchase Order without an approved Purchase Requisition reference (SOP §7), except the site-petty exception (≤ ₹${sitePettyLimit.toLocaleString('en-IN')}). This PO's ₹${total.toLocaleString('en-IN')} total exceeds that — supply an approved purchaseRequisitionId.`};
    }
  }
  const po = { id:nextId(DB.purchaseOrders, 'PO-', 4), poNo:null, projectId, materialRequestId:materialRequestId||null,
    rfqId:rfqId||null, supplierComparisonId:supplierComparisonId||null, purchaseRequisitionId:purchaseRequisitionId||null, vendorId, lines, total,
    deliveryLocation:deliveryLocation||'', expectedDate:expectedDate||null, paymentTerms:paymentTerms||'', terms:terms||'',
    status:'Draft', createdBy:actor.id, createdAt:nowIso(), approvedBy:null, approvedAt:null,
    qtyReceivedByLine:{}, qtyInvoicedByLine:{}, changeRequestId:changeRequestId||null };
  DB.purchaseOrders.push(po); save();
  if(pr){ pr.status='Converted'; pr.convertedToPoId=po.id; save(); }
  logAudit({type:'PurchaseOrderCreated', poId:po.id, projectId, vendorId, total, purchaseRequisitionId:purchaseRequisitionId||null, changeRequestId:po.changeRequestId, userId:actor.id, role:actor.role});
  // Project Variation Phase 5 — distinct, additional event (not a replacement for the generic
  // PurchaseOrderCreated above) ONLY when this PO is actually variation-tagged — never fabricated
  // for an untagged, baseline PO.
  if(po.changeRequestId){
    logAudit({type:'VariationPOCreated', changeRequestId:po.changeRequestId, projectId, poId:po.id, vendorId, total, userId:actor.id, role:actor.role});
  }
  return {ok:true, po};
}
// Phase 42 FIX — found via cross-function mutation-chain analysis (a class my earlier scripted
// per-function scan missed, since it only looks for multiple DB.*.push() calls WITHIN one
// function body, not across a caller→callee boundary): both functions below mutate the PO's own
// fields (status/approvedBy/poNo) in one step, then call createCommitmentFromPO() — a SEPARATE
// push+save — in a second step, with no shared transaction boundary. A throw inside
// createCommitmentFromPO() (or anything it calls) would leave the PO permanently marked
// Approved/auto-approved, with a real poNo already assigned, but NO commitment record ever
// created — an operational-control inconsistency (a PO the commitment/budget-tracking module
// would never see) of the exact same "mutate, then a later step fails silently uncompensated"
// shape this whole audit series has repeatedly found and fixed elsewhere. Wrapped in
// withTransaction() rather than hand-rolling a third bespoke rollback variant.
function submitPurchaseOrder({id, actor}){
  const po = DB.purchaseOrders.find(x=>x.id===id);
  if(!po) return {ok:false, error:'PO not found.'};
  if(po.status!=='Draft') return {ok:false, error:`Cannot submit — "${po.status}", not Draft.`};
  return withTransaction(actor, {name:'submitPurchaseOrder'}, () => {
    const reqRole = requiredPOApprovalRole(po.total);
    po.status = reqRole ? 'Submitted' : 'Approved';
    if(!reqRole){ po.poNo = nextDocNumber('PO'); po.approvedBy='(auto — within no-approval threshold)'; po.approvedAt=nowIso(); createCommitmentFromPO(po); }
    logAudit({type:'PurchaseOrderSubmitted', poId:id, total:po.total, requiredApprovalRole:reqRole, userId:actor.id, role:actor.role});
    return {ok:true, po};
  });
}
// Phase 12 P0 fix — see the poApprovalAuthorityMatrix seed comment above for the full policy
// rationale. Returns the configured authority for a role, or an all-false/null default for any
// role not explicitly listed (e.g. Sales, SiteInCharge) — no role gets authority by omission.
function poApprovalAuthorityFor(role){
  const m = DB.poApprovalAuthorityMatrix;
  return (m && m.roles && m.roles[role]) || {financialApprovalAuthority:false, selfApprovalAllowed:false, selfApprovalLimit:null};
}
function approvePurchaseOrder({id, actor}){
  const po = DB.purchaseOrders.find(x=>x.id===id);
  if(!po) return {ok:false, error:'PO not found.'};
  if(po.status!=='Submitted') return {ok:false, error:`Cannot approve — "${po.status}", not Submitted.`};
  const reqRole = requiredPOApprovalRole(po.total);
  const approverAuthority = poApprovalAuthorityFor(actor.role);
  // Phase 12 P0 fix (was: `actor.role!=='Admin'`) — being Admin no longer, by itself, satisfies
  // the required-approval-role tier. System Administration Authority != Financial Approval
  // Authority for Purchase Orders (Phase 12 brief §1/§4). Any role — Admin included — may only
  // stand in for the required tier if poApprovalAuthorityMatrix explicitly grants it
  // financialApprovalAuthority; this defaults false for Admin, so today's behavior for Admin is
  // now the same as any other role with no configured PO approval authority.
  if(reqRole && actor.role!==reqRole && !approverAuthority.financialApprovalAuthority){
    return {ok:false, error:`This PO's ₹${po.total.toLocaleString('en-IN')} value requires approval by "${reqRole}" (per BOS §1.6 policy) — "${actor.role}" is not authorized. (Role "${actor.role}" has no Purchase Order financial approval authority configured — see poApprovalAuthorityMatrix.)`};
  }
  // Phase 12 P0 fix (was: `!['CEO','Admin'].includes(actor.role)`) — creator identity is compared
  // by stable user ID (po.createdBy===actor.id), never display name/session, and a role change
  // cannot bypass it (the check re-evaluates actor.role's CURRENT authority every time, not a
  // cached value). Neither CEO nor Admin is blanket-exempted any more: a creator who is also the
  // approver may only proceed if their role's self-approval policy explicitly permits it, up to
  // a FINALISED rupee limit — never merely because the role is CEO/Admin.
  const isCreator = po.createdBy===actor.id;
  let selfApprovalPermitted = null; // null = not a self-approval case at all
  if(isCreator && reqRole){
    selfApprovalPermitted = !!(approverAuthority.selfApprovalAllowed && approverAuthority.selfApprovalLimit!=null && po.total<=approverAuthority.selfApprovalLimit);
    if(!selfApprovalPermitted){
      const limitTxt = approverAuthority.selfApprovalLimit==null ? 'NOT SET — management decision required (see poApprovalAuthorityMatrix)' : `₹${approverAuthority.selfApprovalLimit.toLocaleString('en-IN')}`;
      return {ok:false, error:`Segregation of duties: PO creator cannot also be PO approver for a PO requiring "${reqRole}" approval, unless a finalised self-approval limit covering ₹${po.total.toLocaleString('en-IN')} is configured for role "${actor.role}" (currently ${limitTxt}).`};
    }
  }
  // Approval Audit Trail (Phase 12 §7) — computed relative to the CREATOR's own role/authority,
  // not merely who happens to approve, so this is a stable property of the transaction: would
  // THIS creator, under current policy, ever have been allowed to approve their own PO? If not,
  // independent approval was required regardless of who actually ends up approving it.
  const creatorRole = (DB.users.find(u=>u.id===po.createdBy)||{}).role || null;
  const creatorAuthority = poApprovalAuthorityFor(creatorRole);
  // Mirrors the two-step logic approvePurchaseOrder() itself applies to an actual approver:
  // the creator's OWN role must first satisfy the required tier (either by being the exact
  // required role, or by holding broader financialApprovalAuthority — e.g. CEO approving a
  // FinanceManager-tier PO), and only then does the self-approval limit matter. Using only
  // `creatorRole===reqRole` here (an earlier draft of this fix) under-counted a CEO who created a
  // lower-tier PO as always requiring independent approval, even when their own self-approval
  // limit genuinely covered it — a real bug in the AUDIT TRAIL's accuracy, caught in testing
  // before shipping, never a security gap (the actual approval check below was never affected).
  const creatorSatisfiesTier = !!reqRole && (creatorRole===reqRole || creatorAuthority.financialApprovalAuthority===true);
  const creatorCouldSelfApprove = creatorSatisfiesTier && !!(creatorAuthority.selfApprovalAllowed && creatorAuthority.selfApprovalLimit!=null && po.total<=creatorAuthority.selfApprovalLimit);
  const independentApprovalRequired = !!reqRole && !creatorCouldSelfApprove;
  return withTransaction(actor, {name:'approvePurchaseOrder'}, () => {
    po.status='Approved'; po.approvedBy=actor.id; po.approvedByRole=actor.role; po.approvedAt=nowIso(); po.poNo = nextDocNumber('PO');
    po.approvalLevel = reqRole || '(auto — within no-approval threshold)';
    po.independentApprovalRequired = independentApprovalRequired;
    po.selfApprovalDecision = selfApprovalPermitted===null ? null : (selfApprovalPermitted ? 'SELF-APPROVAL = POLICY-ALLOWED' : 'SELF-APPROVAL = POLICY-BLOCKED');
    _fault('PO_APPROVE_BEFORE_COMMITMENT');
    createCommitmentFromPO(po);
    logAudit({type:'PurchaseOrderApproved', poId:id, amount:po.total, vendorId:po.vendorId,
      creatorUserId:po.createdBy, creatorRole,
      approverUserId:actor.id, approverRole:actor.role, approvalTimestamp:po.approvedAt,
      approvalDecision:'Approved', approvalLevel:po.approvalLevel,
      independentApprovalRequired, selfApprovalPermittedByPolicy:selfApprovalPermitted,
      userId:actor.id, role:actor.role});
    return {ok:true, po};
  });
}
function rejectPurchaseOrder({id, reason, actor}){
  const po = DB.purchaseOrders.find(x=>x.id===id);
  if(!po) return {ok:false, error:'PO not found.'};
  if(po.status!=='Submitted') return {ok:false, error:`Cannot reject — "${po.status}".`};
  po.status='Cancelled'; po.rejectReason=reason||''; save();
  return {ok:true, po};
}
// Phase 24 Part C — a real "cancel an ALREADY-APPROVED PO" capability, built specifically because
// the Commitment lifecycle's own required test (§C7) needs it: a commitment created at approval
// must have a real way to be released. rejectPurchaseOrder() above only ever applied to
// 'Submitted' (pre-approval, no commitment exists yet) — this is a distinct, narrower capability,
// not a general PO-editing feature. PO AMENDMENT (§C8, changing amounts on an approved PO) is
// deliberately NOT built here — it is a materially different, larger capability with no existing
// precedent in this codebase, and the brief explicitly says to document that as a gap rather than
// build unrelated functionality.
function cancelApprovedPurchaseOrder({id, reason, actor}){
  const po = DB.purchaseOrders.find(x=>x.id===id);
  if(!po) return {ok:false, error:'PO not found.'};
  if(!['Approved','PartiallyReceived'].includes(po.status)) return {ok:false, error:`Cannot cancel — "${po.status}" (only an Approved or PartiallyReceived PO can be cancelled here).`};
  if(!reason || !String(reason).trim()) return {ok:false, error:'A reason is required to cancel an approved PO.'};
  po.status='Cancelled'; po.cancelReason=reason; po.cancelledBy=actor.id; po.cancelledAt=nowIso(); save();
  const release = releaseCommitment(po.id, reason, actor);
  // Phase 41 FIX — "commitmentReleased:0" used to mean either "nothing was open to release" or
  // "the release itself failed" — indistinguishable. This is a PO cancellation, not a GL/stock
  // posting (releaseCommitment never touches DB.journalEntries or inventory), so a release failure
  // does not need to block the cancellation itself; it's now at least visibly reported instead of
  // silently presented as a normal zero.
  logAudit({type:'PurchaseOrderCancelled', poId:id, reason, releasedCommitment: release.ok?release.releasedAmount:0, commitmentReleaseError: release.ok?undefined:release.error, userId:actor.id, role:actor.role});
  return {ok:true, po, commitmentReleased: release.ok?release.releasedAmount:0, commitmentReleaseWarning: release.ok?undefined:release.error};
}
// ============================================================
// Phase 24 Part C — Operational Commitment Engine. Deliberately NOT accounting postings: a
// commitment never calls postJournalEntry() and never touches DB.journalEntries — it is a
// separate, project-linked, auditable OPERATIONAL model that tracks "how much of an approved PO
// has not yet become a real cost," exactly the distinction the brief itself draws (Part N):
// financial events -> the one central engine; operational commitments -> this model. The GL
// (actual cost) is unaffected by anything in this section — it only ever grows via the EXISTING
// GRN-driven postJournalEntry() call in createGRN(), unchanged.
// ============================================================
function createCommitmentFromPO(po){
  const c = { id:'COMMIT-'+String(DB.commitments.length+1).padStart(4,'0'), poId:po.id, projectId:po.projectId||null, vendorId:po.vendorId,
    originalAmount:r2(po.total), consumedAmount:0, remainingAmount:r2(po.total), status:'Open',
    sourceDocument:po.poNo||po.id, createdAt:nowIso(), lastUpdated:nowIso() };
  DB.commitments.push(c); save();
  logAudit({type:'CommitmentCreated', commitmentId:c.id, poId:po.id, projectId:po.projectId, amount:c.originalAmount});
  return c;
}
function findOpenCommitmentForPO(poId){ return DB.commitments.find(c=>c.poId===poId && c.status==='Open'); }
function reduceCommitment(poId, consumedDelta, reason){
  const c = findOpenCommitmentForPO(poId);
  if(!c) return null;
  c.consumedAmount = r2(c.consumedAmount + consumedDelta);
  c.remainingAmount = r2(Math.max(0, c.originalAmount - c.consumedAmount));
  if(c.remainingAmount <= 0.01) c.status = 'FullyConsumed';
  c.lastUpdated = nowIso();
  save();
  logAudit({type:'CommitmentReduced', commitmentId:c.id, poId, consumedDelta:r2(consumedDelta), remainingAmount:c.remainingAmount, reason:reason||''});
  return c;
}
function releaseCommitment(poId, reason, actor){
  const c = findOpenCommitmentForPO(poId);
  if(!c) return {ok:false, error:'No open commitment found for this PO.'};
  const released = c.remainingAmount;
  c.remainingAmount = 0; c.status = 'Released'; c.releaseReason = reason||''; c.lastUpdated = nowIso();
  save();
  logAudit({type:'CommitmentReleased', commitmentId:c.id, poId, releasedAmount:released, reason:reason||'', userId:actor.id, role:actor.role});
  return {ok:true, commitment:c, releasedAmount:released};
}
function projectCommitments(projectId){
  const list = projectId ? DB.commitments.filter(c=>c.projectId===projectId) : DB.commitments;
  return { commitments:list,
    totalOriginal: r2(list.reduce((s,c)=>s+c.originalAmount,0)),
    totalConsumed: r2(list.reduce((s,c)=>s+c.consumedAmount,0)),
    totalRemaining: r2(list.filter(c=>c.status!=='Released').reduce((s,c)=>s+c.remainingAmount,0)) };
}

// ---------- Inventory ledger (real movement records — never just a "current stock" number) ----------
// Phase 30 CRITICAL FIX — found live via a database-integrity sweep: MV-000121 and MV-000124 each
// existed TWICE in DB.inventoryMovements, with genuinely different content (different material,
// quantity, type, and timestamp minutes apart — not a duplicate write of the same event). Root
// cause: two separate call sites computed a new movement's id from `DB.inventoryMovements.length+1`
// — a scheme that silently collides with an EXISTING id the moment the array's length ever
// decouples from the highest id actually issued (e.g. after any historical removal/restore of
// entries during this Lab's long testing history). A count-based id is only safe if the array is
// guaranteed append-only forever; this codebase does not guarantee that. Fixed by deriving the next
// id from the MAXIMUM existing numeric suffix instead — correct regardless of the array's current
// length, and safe even if a future removal ever changes it again.
// Phase 31 §29 — generalized the Phase 30 fix into a shared helper after a full 105-collection
// scan found the SAME array.length+1 collision defect in a second collection (inventoryAdjustments,
// IADJ-0015 existed 3 times). Every future collection using this pattern should call this instead
// of re-deriving `array.length+1` locally.
// Phase 32 §C — hardened against a malformed/foreign-format id: only a value that ACTUALLY starts
// with the given prefix is considered (item.id.startsWith(prefix)), not merely "prefix appears
// somewhere in the string" — a stray id from a different series, an imported record with an
// unrelated format, or a manually-inserted string could otherwise inflate max with a bogus number.
function maxIdSuffix(collection, prefix){
  let max = 0;
  for(const item of collection){
    const idStr = String(item.id);
    if(!idStr.startsWith(prefix)) continue;
    const n = parseInt(idStr.slice(prefix.length), 10);
    if(!Number.isNaN(n) && n>max) max = n;
  }
  return max;
}
// Phase 32 §C — the shared, safe ID generator every collection below now uses. Derives the next
// suffix from the MAXIMUM existing one, never from collection.length (the root cause of the two
// real collisions found in Phases 30/31). Correctly handles: an empty/missing collection (returns
// prefix+1, padded), a gap from a historical deletion (returns max+1, not length+1 — a gap is
// simply skipped, never reused), a restored/imported record with a higher-than-expected number
// (the next id correctly jumps past it), and a malformed/foreign-prefix id (ignored, per
// maxIdSuffix's own hardening above).
function nextId(collection, prefix, padLength){
  return prefix + String(maxIdSuffix(collection, prefix)+1).padStart(padLength, '0');
}
// Phase 35 Part B/C — a full repository-wide re-census (not regex-only; every remaining
// `array.length+1`-style occurrence was individually read, not just pattern-matched) found 72 real
// occurrences still unconverted after Phases 32-34's 21. Classified by financial/inventory/
// master-data/security blast radius rather than fixing all 72 indiscriminately. HIGH/CRITICAL,
// fixed this phase (18 collections): auditLog (the forensic trail itself — this phase's own focus
// on audit completeness makes an audit-ID collision directly relevant), tdsDeductions (real tax
// compliance data), customers/vendors/materials (MASTER DATA — a collision here would poison every
// future invoice/bill/GRN/issue that references the colliding id, not just one transaction; current
// low record counts do not make the underlying pattern safe), users (a colliding user id is a
// security/authorization risk, not merely a data-quality one), bankAccounts (resolved into every
// GL posting's account), financialPeriods (the posting-gate record itself), pettyCashFloats/
// pettyCashVouchers (real cash), bankImportBatches/bankImportLines/bankStatementLines (feed real GL
// postings via postBankImportLine()), installations (feeds postInstallationLabourCost's GL
// posting), amcContracts (feeds real customer billing via draftAMCBillingInvoice), jobWorkOrders/
// siteMaterialRequisitions/deliveryChallans (carry real inventory value, tagged to a project). The
// remaining ~54 occurrences (CRM/estimation pipeline, pre-PO procurement pipeline, production/QC/
// service-ticket/after-sales tracking, commitments, standard-cost baselines, opening-balance setup,
// timesheets/tasks/risk/attachments/import-batch metadata) are lower financial/security blast
// radius and were NOT fixed this phase — explicitly disclosed as MEDIUM/LOW/BENIGN in the Phase 35
// report, not silently declared safe.
function nextInventoryMovementId(){
  return 'MV-'+String(maxIdSuffix(DB.inventoryMovements, 'MV-')+1).padStart(6,'0');
}
function postInventoryMovement({type, materialId, qty, uom, warehouseId, projectId, sourceType, sourceId, valuationRate, actor, locationId, siteId, id, capability, capabilityCtx, bomId, bomVersion, excessRequestId}){
  // Phase 26 §6 — same write-point capability containment as postJournalEntry(). This function
  // has ALWAYS returned the raw movement object on success (never {ok:false} — it had no failure
  // path before this phase), so none of its 17 existing call sites check for a failure shape.
  // Rather than silently change the return contract (risking a caller treating a rejection object
  // as a real movement and writing a corrupt requirement/status update), a capability failure here
  // THROWS — caught by server.js's existing top-level try/catch (a clean 500, no partial write,
  // no crash) rather than risking undefined behavior in 17 callers that have never had to check.
  // For every one of those 17 existing callers this can never actually fire: each already ran the
  // SAME rule, moments earlier, via its own domain guard (Phase 25/26) — this is real defense in
  // depth for a FUTURE caller, not a live behavior change for any current one.
  const _capResult = checkWritePointCapability(capability, actor, capabilityCtx);
  if(!_capResult.ok) throw new Error('postInventoryMovement: capability check failed — '+_capResult.error);
  // Phase 28 §3 — capability-to-operation binding (see checkOperationBinding's header comment,
  // near CAPABILITY_REGISTRY). Same "actor authorized, but is this the RIGHT capability" check as
  // postJournalEntry(), using this write's own type/sourceType as the operation signature.
  const _bindResult = checkOperationBinding('INVENTORY', capability, { type, sourceType });
  if(!_bindResult.ok) throw new Error('postInventoryMovement: operation binding failed — '+_bindResult.error);
  // locationId is a purely optional, additive dimension (bin/shelf within a warehouse).
  // Every pre-existing caller omits it and behaves byte-for-byte as before; getStockLevel() only
  // filters on it when a caller explicitly asks, so warehouse-level stock totals are unaffected.
  // Phase 33 — siteId is the same idea for the Finance SOP's site-level material subledger: a
  // purely additive dimension used ONLY by the new 'SiteReceipt'/'SiteConsumption' movement types
  // (issueToSite()/createMaterialIssue({siteId})). getStockLevel()'s reduce() recognizes neither
  // type and falls through its `return s` default, so a site movement never affects warehouse
  // stock regardless of what warehouseId it carries — verified safe, not assumed.
  const mv = { id: id || nextInventoryMovementId(), type, materialId, qty:+qty, uom:uom||'',
    warehouseId, locationId:locationId||null, siteId:siteId||null, projectId:projectId||null, sourceType, sourceId, date:new Date().toISOString().slice(0,10),
    userId:actor.id, role:actor.role, valuationRate:+valuationRate||0, valuationAmount:Math.round((+qty)*(+valuationRate||0)*100)/100, at:nowIso(),
    // BOM Governance phase — purely additive traceability fields (null for every pre-existing caller):
    // which BOM/version an ordinary issue was validated against, and which Excess Material Issue
    // Approval request (if any) authorized the portion beyond the normal entitlement.
    bomId:bomId||null, bomVersion:bomVersion||null, excessRequestId:excessRequestId||null };
  DB.inventoryMovements.push(mv); save();
  return mv;
}
function getSiteStockLevel(materialId, siteId){
  return DB.inventoryMovements.filter(m=>m.materialId===materialId && m.siteId===siteId)
    .reduce((s,m)=>{ if(m.type==='SiteReceipt') return s+m.qty; if(m.type==='SiteConsumption'||m.type==='SiteReturn') return s-m.qty; return s; }, 0);
}
function getSiteMovingAverageRate(materialId, siteId){
  const moves = DB.inventoryMovements.filter(m=>m.materialId===materialId && m.siteId===siteId);
  let qty=0, val=0;
  for(const m of moves){
    if(m.type==='SiteReceipt'){ qty+=m.qty; val+=m.valuationAmount; }
    else if(m.type==='SiteConsumption'||m.type==='SiteReturn'){ const rate=qty>0?val/qty:0; qty-=m.qty; val-=m.qty*rate; }
  }
  if(qty<=0.0001) return 0;
  return val/qty;
}
function getStockLevel(materialId, warehouseId, locationId){
  // Phase 28 — locationId is an OPTIONAL third filter; every existing call site passes only the
  // first two args, so `locationId` is undefined and this behaves exactly as before.
  return DB.inventoryMovements.filter(m=>m.materialId===materialId && (!warehouseId || m.warehouseId===warehouseId) && (!locationId || m.locationId===locationId))
    .reduce((s,m)=>{
      if(m.type==='Receipt' || m.type==='TransferIn') return s+m.qty;
      if(m.type==='Issue' || m.type==='TransferOut' || m.type==='Return') return s-m.qty;
      if(m.type==='Adjustment') return s+m.qty; // qty can be negative for a downward adjustment
      return s;
    }, 0);
}
// DEFECT FOUND & FIXED (Phase 16 §13 Reconciliation Gate): the original formula averaged
// "total value received all-time / total quantity received all-time," which conflates receipts
// with the portion of them already consumed — it never nets out issues. This meant "current
// inventory value" (stock × this rate) silently drifted from the ACTUAL GL Inventory (1200)
// balance the instant an issue happened BETWEEN two receipts at different prices (proven with a
// minimal repro: receive 100@₹100, issue 50, receive 100@₹200 → old formula reported ₹150/unit
// ×150 units = ₹22,500, but the real GL balance was ₹25,000 — a genuine ₹2,500 miss in that one
// case, ₹38,495.99 across the Phase 16 volume dataset). This is not a policy question — Moving
// Average remains the approved valuation METHOD (POL-02); this only makes the existing formula
// actually compute a correct moving average of what's currently on hand, by replaying every
// movement (not just receipts) in the order they actually happened and maintaining a running
// balance — issues/transfers-out/returns remove value at the average rate AS OF that point,
// exactly like a real perpetual moving-average costing system.
function getMovingAverageRate(materialId, warehouseId){
  const moves = DB.inventoryMovements.filter(m=>m.materialId===materialId && m.warehouseId===warehouseId);
  let qty = 0, val = 0;
  for(const m of moves){
    if(m.type==='Receipt' || m.type==='TransferIn'){ qty += m.qty; val += m.valuationAmount; }
    else if(m.type==='Issue' || m.type==='TransferOut' || m.type==='Return'){
      const rate = qty>0 ? val/qty : 0;
      qty -= m.qty; val -= m.qty*rate;
    } else if(m.type==='Adjustment'){
      if(m.qty>0){ qty += m.qty; val += m.valuationAmount; }
      else { const rate = qty>0 ? val/qty : 0; qty += m.qty; val += m.qty*rate; } // m.qty negative here
    }
  }
  if(qty<=0.0001) return 0;
  return val/qty;
}

function createGRN({poId, warehouseId, lines, receivedBy, actor, overrideReason}){
  { const _a = assertCanCreateGRN(actor); if(!_a.ok) return _a; }
  const po = DB.purchaseOrders.find(x=>x.id===poId);
  if(!po) return {ok:false, error:'PO not found.'};
  if(!['Approved','PartiallyReceived'].includes(po.status)) return {ok:false, error:`Cannot receive against a PO with status "${po.status}".`};
  // Phase 14 P0 fix — a live forensic audit found createGRN() had NO warehouseId validation at
  // all (neither required-field nor existence check), unlike every other warehouse-touching
  // function in this file (createInventoryTransfer, createInventoryAdjustment, createLocation,
  // createStockCount, importMasterData, issueToSite, returnFromSite, dispatchToJobWorker — all 8
  // already guard this the same way). Live-proven exploit before this fix: a GRN with
  // warehouseId:"WH-999-FAKE" (or omitted entirely) was accepted, posted a real GL entry, and
  // created phantom stock in a warehouse that does not exist. This mirrors the EXACT existing
  // "Unknown warehouse" idiom used elsewhere (see createInventoryAdjustment) — same message
  // shape, same check, no new validation concept introduced.
  if(!warehouseId) return {ok:false, error:'A destination warehouse is required to receive a GRN.'};
  if(!DB.warehouses.find(w=>w.id===warehouseId)) return {ok:false, error:`Unknown warehouse "${warehouseId}".`};
  // Phase 33 (adversarial audit thread) Part D — closed-project gate, derived from the PO's own
  // project (a GRN carries no projectId of its own). Reuses the SAME overrideReason field already
  // used below for the weighment-variance override, same rationale as createMaterialIssue().
  { const _po2 = assertProjectOpenForPosting(po.projectId, actor, {overrideReason, action:'create a GRN'}); if(!_po2.ok) return _po2; }
  // ERP AUDIT FIX (ERP-026, Critical) — qtyAccepted previously had NO validation of its own: a
  // negative value passed the over-receipt check below (it only ever makes the running total
  // SMALLER, never trips ">"), then was silently skipped from receiptLines/inventory/GL further
  // down (both gated on `+l.qtyAccepted>0`) while STILL being added — as a negative number — to
  // po.qtyReceivedByLine, live-proven to genuinely reduce the PO's tracked received quantity with
  // zero corresponding inventory or GL movement. A ZERO qtyAccepted line stays legitimate and is
  // NOT rejected here — the existing UI always submits one line per PO line, using 0/blank to mean
  // "not received in this GRN" for a partial multi-line receipt (see submitGRN() in index.html) —
  // only a genuinely negative/non-finite/non-numeric value is a real defect. A GRN where every
  // single line is zero (nothing actually received) is rejected separately below, once, rather
  // than per-line, since that is a whole-document defect, not a per-line one.
  const errors = [];
  let anyPositiveLine = false;
  (lines||[]).forEach((l,idx)=>{
    const poLine = po.lines[idx];
    if(!poLine) { errors.push(`Line ${idx}: no matching PO line.`); return; }
    const raw = (l.qtyAccepted===undefined || l.qtyAccepted===null || l.qtyAccepted==='') ? 0 : l.qtyAccepted;
    const _qChk = assertNonNegativeFiniteNumber(raw, `Line ${idx} qtyAccepted`);
    if(!_qChk.ok) { errors.push(_qChk.error); return; }
    if(_qChk.value>0) anyPositiveLine = true;
    const alreadyReceived = po.qtyReceivedByLine[idx] || 0;
    const tolerance = poLine.qty * (GRN_TOLERANCE_PCT/100);
    if(alreadyReceived + _qChk.value > poLine.qty + tolerance + 0.001){
      errors.push(`Line ${idx}: over-receipt — PO ordered ${poLine.qty}, already received ${alreadyReceived}, attempting ${l.qtyAccepted} (tolerance ${GRN_TOLERANCE_PCT}%, BUSINESS POLICY REQUIRED if this needs to change).`);
    }
  });
  if(!anyPositiveLine) errors.push('A GRN must receive a positive quantity on at least one line — a GRN where every line is zero records nothing.');
  if(errors.length) return {ok:false, error:'GRN rejected: '+errors.join(' | ')};

  // Phase 33 SOP §1/§8 — weighment/measurement variance gate. Purely additive optional per-line
  // fields (weighmentQtyAtPurchase / weighmentQtyAtFactoryGate) — a line supplying neither behaves
  // exactly as before this phase, which is every existing caller/test. When BOTH are supplied, a
  // variance beyond the configured tolerance (DB.weighmentTolerancePct, SOP's own example: 1%)
  // must be "investigated BEFORE payment release" — modeled as requiring an authorized
  // overrideReason to accept the GRN at all, the same "block unless authorized" idiom already used
  // by the BOM-quota and three-way-match checks elsewhere in this file, not a new one.
  const weighmentIssues = [];
  (lines||[]).forEach((l,idx)=>{
    if(l.weighmentQtyAtPurchase!=null && l.weighmentQtyAtFactoryGate!=null){
      const purchaseQty = +l.weighmentQtyAtPurchase, gateQty = +l.weighmentQtyAtFactoryGate;
      if(purchaseQty>0){
        const variancePct = Math.abs(purchaseQty-gateQty)/purchaseQty*100;
        if(variancePct > (DB.weighmentTolerancePct!=null?DB.weighmentTolerancePct:1)) weighmentIssues.push({line:idx, purchaseQty, gateQty, variancePct:r2(variancePct)});
      }
    }
  });
  if(weighmentIssues.length && !overrideReason){
    return {ok:false, error:`EXCEPTION — INVESTIGATION REQUIRED: weighment/measurement variance beyond tolerance (SOP §1/§8) on line(s) ${weighmentIssues.map(w=>w.line).join(', ')} — must be investigated BEFORE payment release. A FinanceManager/Purchase/CEO/Admin must record an authorized overrideReason to accept this GRN anyway.`, weighmentIssues};
  }
  if(weighmentIssues.length) logAudit({type:'GRNWeighmentVarianceOverridden', poId, weighmentIssues, overrideReason, userId:actor.id, role:actor.role});

  const grn = { id:nextId(DB.grns, 'GRN-', 4), grnNo:nextDocNumber('GRN'), poId, supplierId:po.vendorId, projectId:po.projectId, warehouseId,
    lines: (lines||[]).map((l,idx)=>({...l, materialId:po.lines[idx]?.materialId, rate:po.lines[idx]?.rate})),
    weighmentIssues,
    receivedBy: receivedBy||actor.id, date:new Date().toISOString().slice(0,10), createdBy:actor.id, createdAt:nowIso(),
    // Phase 27 — per-line "already invoiced" tracking, mirroring the PO's own qtyReceivedByLine/
    // qtyInvoicedByLine pattern. Nothing wrote to a GRN-level equivalent before this phase because
    // no PO-aware billing UI existed to need it — draftSupplierInvoiceFromPO() only ever validated
    // an invoice against the GRN's raw accepted qty, never against what had already been billed
    // against that same GRN line, so a second identical invoice against the same GRN passed the
    // same three-way match the first one did. See draftSupplierInvoiceFromPO() below.
    qtyInvoicedByLine:{} };

  // Phase 41 CRITICAL FIX — this function used to push the GRN, post the Receipt movement(s), and
  // mutate the PO's received-quantity/status UNCONDITIONALLY, then attempt the GL posting
  // afterward without ever checking whether it succeeded — the same defect class already found
  // and fixed in createInventoryAdjustment(). A closed-period (or any other) GL failure left real
  // stock received and a PO marked Fully/PartiallyReceived with zero accounting entry behind it,
  // while the API still reported ok:true. Fixed the same way: compute the value/lines needed for
  // the GL attempt from pure data (no writes yet), attempt postJournalEntry() FIRST, and only
  // commit the GRN/movements/PO-state/commitment-reduction if that succeeds.
  let totalAcceptedValue = 0;
  const receiptLines = [];
  grn.lines.forEach((l,idx)=>{
    if(+l.qtyAccepted>0){
      // Phase 21 §7/§8 — UoM Conversion applied HERE, at the one point Purchase-UOM quantities
      // enter inventory. Inventory itself (postInventoryMovement/getMovingAverageRate) is
      // completely untouched — it still only ever sees a base-unit qty and a base-unit rate,
      // exactly as before this phase. The accounting VALUE is mathematically preserved: PO qty
      // (in Purchase UOM) x PO rate (Rs per Purchase UOM) === convertedQty (in Base UOM) x
      // convertedRate (Rs per Base UOM), since convertedQty = qty*factor and convertedRate =
      // rate/factor. A material with no configured conversion (factor 1, the default for every
      // material created before this phase) behaves byte-for-byte as it always has.
      const material = DB.materials.find(mt=>mt.id===l.materialId);
      const factor = (material && material.purchaseConversionFactor) || 1;
      const baseQty = r2((+l.qtyAccepted) * factor);
      const baseRate = factor ? (+l.rate) / factor : (+l.rate);
      const baseUom = (material && material.uom) || l.uom;
      receiptLines.push({materialId:l.materialId, qty:baseQty, uom:baseUom, valuationRate:baseRate, locationId:l.locationId||null});
      totalAcceptedValue += (+l.qtyAccepted)*(+l.rate);
    }
  });

  _fault('GRN_BEFORE_GL'); // Phase 35 Part A stage 1: before any mutation
  // Phase 35 CRITICAL FIX (continued below) — jesLen MUST be captured BEFORE postJournalEntry() is
  // even attempted, not after: an earlier version of this fix captured it afterward, which meant a
  // later rollback restored everything EXCEPT the GL entry itself (re-attacked and confirmed live —
  // see the Phase 35 report). The snapshot below is the single source of truth for what "no
  // mutation happened yet" means for this function, taken before the very first write.
  const _rb = {
    jesLen: DB.journalEntries.length,
    grnsLen: DB.grns.length, movesLen: DB.inventoryMovements.length, auditLen: DB.auditLog.length,
    poQtyReceivedByLine: {...po.qtyReceivedByLine}, poStatus: po.status,
    commitment: (() => { const c = DB.commitments.find(x=>x.poId===poId && x.status==='Open'); return c ? {...c} : null; })()
  };
  // GRN posting: Dr Inventory / Cr GR/IR Clearing — through the EXISTING engine, no new posting path.
  let glResult = {ok:true};
  if(totalAcceptedValue>0.01){
    glResult = postJournalEntry({ date:grn.date, narration:`GRN ${grn.grnNo} against PO ${po.poNo}`, sourceType:'GRN', sourceId:grn.id,
      voucherNo:grn.grnNo, party:po.vendorId, docCategory:'GRN', branchId:projectBranch(po.projectId),
      lines:[ {account:'1200', debit:totalAcceptedValue, credit:0, vendorId:po.vendorId, projectId:po.projectId},
        {account:'2050', debit:0, credit:totalAcceptedValue, vendorId:po.vendorId, projectId:po.projectId} ],
      actor, capability:'GRN_RECEIPT', overrideReason });
    if(!glResult.ok){
      // Nothing has been written yet — no GRN record, no stock movement, no PO status change, no
      // commitment reduction. Audited (via durableFailureAudit, ERP-059B — see
      // ERP-059B-TRANSACTION-DESIGN.md — the direct logAudit() call this used to be was silently
      // erased by withTransaction()'s rollback every time) so a rejected GRN attempt is traceable.
      return {ok:false, error:glResult.error, durableFailureAudit:{type:'GRNRejected', poId, totalAcceptedValue, glError:glResult.error}};
    }
  }

  // Phase 35 CRITICAL FIX — found live via deliberate fault injection (Part A): everything from
  // here down used to be a plain, unguarded sequence of separate mutations. GL had ALREADY been
  // committed (pushed + saved by postJournalEntry, above) by the time this point is reached, so an
  // exception ANYWHERE in this sequence — a bug in a later line, a future developer's mistake, an
  // out-of-memory error, anything synchronous — left a REAL, PERMANENT divergence: a fully-posted
  // GL entry (Dr Inventory/Cr GR-IR) with some or all of {the GRN document, the inventory
  // movement(s), the PO's own received-quantity tracking} silently missing. Proven live in 3
  // distinct ways: (1) exception before DB.grns.push — GL exists with NO GRN and NO inventory at
  // all (a pure GL orphan); (2) exception mid-inventory-loop — GRN+GL exist claiming BOTH lines
  // received, but only ONE line's physical stock actually moved; (3) exception after inventory but
  // before the PO status update — GRN+GL+ALL inventory correctly committed, but po.qtyReceivedByLine
  // never advances, so a legitimate-looking retry (which computes remaining qty FROM that field)
  // receives and posts the ENTIRE quantity a SECOND time — a real, silent double-GL/double-stock
  // event with no error, no warning, and no idempotency guard catching it, because nothing about a
  // retry LOOKS like a duplicate once the interrupted attempt's own bookkeeping trail is broken.
  // Fixed with a compensating rollback: everything below (GRN, inventory, PO fields, save, audit,
  // commitment) now runs inside a try/catch that restores every value to its exact pre-mutation
  // state — INCLUDING truncating the just-posted GL entry back out of DB.journalEntries — if
  // anything throws before the function would otherwise return successfully, then re-throws so the
  // caller/route still sees the same 500 it always did. This is a real, generically-applicable
  // pattern (snapshot lengths/values, truncate/restore on catch), not a per-symptom patch — the
  // same shape is applied to createMaterialIssue() immediately below for the identical defect class.
  // (_rb was captured above, before the GL attempt — see the comment there.)
  try {
    _fault('GRN_AFTER_GL_BEFORE_INVENTORY'); // Phase 35 Part A stage 2: after GL, before inventory
    DB.grns.push(grn);
    let __grnFaultLineIdx = 0;
    receiptLines.forEach(rl=>{
      postInventoryMovement({type:'Receipt', materialId:rl.materialId, qty:rl.qty, uom:rl.uom, warehouseId, projectId:po.projectId,
        sourceType:'GRN', sourceId:grn.id, valuationRate:rl.valuationRate, actor, locationId:rl.locationId, capability:'GRN_RECEIPT' });
      __grnFaultLineIdx++;
      if(__grnFaultLineIdx===1 && receiptLines.length>1) _fault('GRN_MID_INVENTORY_LOOP'); // Phase 35 Part A stage 3: during inventory (after line 1, before line 2)
    });
    _fault('GRN_AFTER_INVENTORY_BEFORE_STATUS'); // Phase 35 Part A stage 4: after inventory, before source-document finalization
    grn.lines.forEach((l,idx)=>{ po.qtyReceivedByLine[idx] = (po.qtyReceivedByLine[idx]||0) + (+l.qtyAccepted||0); });
    const fullyReceived = po.lines.every((pl,idx)=> (po.qtyReceivedByLine[idx]||0) >= pl.qty - 0.001);
    po.status = fullyReceived ? 'FullyReceived' : 'PartiallyReceived';
    _fault('GRN_AFTER_STATUS_BEFORE_SAVE'); // Phase 35 Part A stage 5: after finalization, before save/audit
    save();
    _fault('GRN_DURING_AUDIT'); // Phase 35 Part A stage 6: during audit write
    logAudit({type:'GRNCreated', grnId:grn.id, poId, totalAcceptedValue, userId:actor.id, role:actor.role});
    // Project Variation Phase 5 — derived, not stored: GRN carries no changeRequestId field of its
    // own (poId is already its authoritative upstream reference — duplicating the FK a second time
    // would only risk it drifting from the PO's own value). Logged ONLY when the PO being received
    // against actually is variation-tagged — never fabricated for an ordinary baseline GRN.
    if(po.changeRequestId){
      logAudit({type:'VariationGRNReceived', changeRequestId:po.changeRequestId, projectId:po.projectId, poId, grnId:grn.id, totalAcceptedValue, userId:actor.id, role:actor.role});
    }
    _fault('GRN_DURING_DEPENDENT_COMMITMENT'); // Phase 35 Part A stage 7: during dependent/secondary record creation
    // Phase 24 Part C4/C5/C6/C11 — Commitment is reduced by the VALUE actually received (at PO
    // rate, the same basis the original commitment was created on), NEVER by touching the GL
    // entry just posted above. This is the operational-commitment side effect, completely separate
    // from the accounting side effect two lines above it — proving §C11's requirement directly:
    // the ₹100,000 commitment does not become a ₹100,000 GL expense; only the ₹actually-received
    // value ever reaches the GL, and the commitment separately shrinks by that same amount.
    if(totalAcceptedValue>0.01) reduceCommitment(poId, totalAcceptedValue, `GRN ${grn.grnNo}`);
    return {ok:true, grn, poStatus:po.status, glEntry: glResult.entry||null};
  } catch(e) {
    DB.grns.length = _rb.grnsLen;
    DB.inventoryMovements.length = _rb.movesLen;
    DB.auditLog.length = _rb.auditLen;
    DB.journalEntries.length = _rb.jesLen; // rolls back the GL entry postJournalEntry() already committed
    po.qtyReceivedByLine = _rb.poQtyReceivedByLine;
    po.status = _rb.poStatus;
    if(_rb.commitment){ const c = DB.commitments.find(x=>x.id===_rb.commitment.id); if(c) Object.assign(c, _rb.commitment); }
    save();
    logAudit({type:'GRNRolledBackOnFailure', poId, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}

// ---------- Three-way match ----------
function checkThreeWayMatch({poId, grnId, invoiceLines}){
  const po = DB.purchaseOrders.find(x=>x.id===poId);
  const grn = DB.grns.find(x=>x.id===grnId);
  if(!po || !grn) return {matched:false, mismatches:['PO or GRN not found.']};
  const mismatches = [];
  invoiceLines.forEach((il,idx)=>{
    const grnLine = grn.lines[idx];
    const poLine = po.lines[idx];
    if(!grnLine || !poLine){ mismatches.push(`Line ${idx}: no matching GRN/PO line.`); return; }
    // Phase 27 — was `qty !== grnLine.qtyAccepted` (exact equality), which made PARTIAL billing
    // impossible: any invoice for less than the full GRN qty was flagged as a "mismatch" requiring
    // a FinanceManager/CEO/Admin exception, even though partial billing is completely legitimate
    // (Part 11 of the Phase 27 brief). A genuine mismatch is invoicing MORE than the GRN ever
    // accepted for this line; invoicing less (partial) is not a mismatch at all. Billing beyond
    // what remains AFTER prior partial bills (i.e. duplicate/over-billing across multiple
    // invoices against the same GRN) is a separate, non-overridable hard block already enforced
    // by checkInvoiceableBalance() before this function is even reached — this function only
    // judges whether THIS invoice's qty/rate look like a legitimate claim against the PO/GRN.
    if((+il.qty) > (+grnLine.qtyAccepted) + 0.001) mismatches.push(`Line ${idx}: qty mismatch — invoice ${il.qty} exceeds GRN accepted ${grnLine.qtyAccepted}.`);
    if(Math.abs((+il.rate) - (+poLine.rate)) > 0.01) mismatches.push(`Line ${idx}: rate mismatch — invoice ₹${il.rate} vs PO ₹${poLine.rate}.`);
  });
  return {matched: mismatches.length===0, mismatches};
}
// Extends (does not replace) draftSupplierInvoice — PO/GRN-linked invoices run 3-way match;
// invoices with no poId (ad-hoc, e.g. Phase-5-style) are unaffected, exactly as before.
// Phase 27 — the "already invoiced" guard. This is a SEPARATE check from checkThreeWayMatch()
// (which validates a line's qty/rate against what the PO/GRN say for THAT bill in isolation) —
// this one validates against what has ALREADY been billed against the same GRN line across ALL
// prior bills, which is exactly the dimension the Phase 26 audit found missing: nothing tracked
// "invoiced-to-date" per GRN line, so a second full bill against an already-fully-billed GRN line
// passed the same three-way match the first one did (rate/qty vs the GRN's raw accepted qty never
// changes). Not overridable by a three-way-match exception — an exception authorizes "this line
// doesn't match the PO/GRN as expected," never "bill more than was ever received."
function checkInvoiceableBalance({grn, invoiceLines}){
  const errors = [];
  (invoiceLines||[]).forEach((il,idx)=>{
    const grnLine = grn.lines[idx];
    if(!grnLine) return; // reported separately by checkThreeWayMatch
    const alreadyInvoiced = grn.qtyInvoicedByLine?.[idx] || 0;
    const balance = r2((+grnLine.qtyAccepted||0) - alreadyInvoiced);
    if((+il.qty) > balance + 0.001){
      errors.push(`Line ${idx}: invoice qty ${il.qty} exceeds the remaining invoiceable balance of ${balance} (GRN accepted ${grnLine.qtyAccepted}, already invoiced ${alreadyInvoiced}).`);
    }
  });
  return {ok: errors.length===0, errors};
}
function draftSupplierInvoiceFromPO({poId, grnId, invoiceLines, taxCode, date, narration, authorizedException, exceptionReason, createdByUserId, createdByRole, jobWorkOrderId}){
  const po = DB.purchaseOrders.find(x=>x.id===poId);
  const grn = DB.grns.find(x=>x.id===grnId);
  if(!po || !grn) return {ok:false, error:'PO or GRN not found.'};
  if(grn.reversed) return {ok:false, error:`Cannot invoice against GRN ${grn.grnNo} — it was reversed on ${grn.reversedAt}. The physical receipt it recorded no longer stands.`};
  if(grn.poId!==poId) return {ok:false, error:'That GRN does not belong to the selected PO.'};
  // Quick Control Fixes phase — same optional Job Work Fee traceability check as draftSupplierInvoice()
  // above, for completeness/consistency (a PO/GRN-matched bill is not the typical path for a job-work
  // processing fee, but the field is supported here too rather than leaving one of the two supplier-
  // bill entry points silently unable to carry it).
  if(jobWorkOrderId){
    const jwo = DB.jobWorkOrders.find(x=>x.id===jobWorkOrderId);
    if(!jwo) return {ok:false, error:`Job Work Order "${jobWorkOrderId}" does not exist.`};
    if(jwo.projectId && jwo.projectId!==po.projectId) return {ok:false, error:`Job Work Order "${jobWorkOrderId}" belongs to project "${jwo.projectId}" — a supplier bill for it must be raised against that same project, not "${po.projectId}".`};
  }
  if(!grn.qtyInvoicedByLine) grn.qtyInvoicedByLine = {}; // GRNs created before Phase 27 lack the field
  const balanceCheck = checkInvoiceableBalance({grn, invoiceLines});
  if(!balanceCheck.ok) return {ok:false, error:'Invoice rejected — already fully or partially billed: '+balanceCheck.errors.join(' | ')};
  const match = checkThreeWayMatch({poId, grnId, invoiceLines});
  if(!match.matched && !authorizedException){
    return {ok:false, error:'Three-way match failed: '+match.mismatches.join(' | ')+' — a FinanceManager/CEO/Admin must record an authorized exception to proceed.', mismatches:match.mismatches};
  }
  if(!match.matched && authorizedException){
    DB.threeWayMatchExceptions.push({ id:'3WM-'+String(DB.threeWayMatchExceptions.length+1).padStart(4,'0'), poId, grnId, mismatches:match.mismatches,
      authorizedBy:createdByUserId, reason:exceptionReason||'', at:nowIso() });
    logAudit({type:'ThreeWayMatchExceptionAuthorized', poId, grnId, mismatches:match.mismatches, userId:createdByUserId, role:createdByRole});
  }
  const base = invoiceLines.reduce((s,l)=>s+(+l.qty)*(+l.rate),0);
  const tax = taxCode ? calcTax(taxCode, base) : null;
  const lines = [ {account:'2050', debit:base, credit:0, vendorId:po.vendorId, projectId:po.projectId} ]; // clears GR/IR raised at GRN
  if(tax && tax.taxAmount>0) lines.push({account:'1300', debit:tax.taxAmount, credit:0, vendorId:po.vendorId, projectId:po.projectId, taxCode});
  lines.push({account:'2000', debit:0, credit:base+(tax?tax.taxAmount:0), vendorId:po.vendorId, projectId:po.projectId, taxCode:taxCode||null});
  const draft = createDraft({date, narration:narration||`Supplier Invoice against ${po.poNo}/${grn.grnNo}`, docTypeCode:'BILL', sourceType:'Supplier Bill (3-way matched)',
    docCategory:'SupplierInvoice', party:po.vendorId, lines, createdByUserId, createdByRole, jobWorkOrderId});
  if(draft.ok){
    draft.draft.poId=poId; draft.draft.grnId=grnId; draft.draft.invoiceLines=invoiceLines;
    // Reserve the billed qty against the GRN/PO the moment the draft is created — not deferred to
    // Post — matching the existing design precedent of Commitment being created at PO Approval
    // (before GRN even exists), i.e. this engine already reserves against a document's business
    // effect as soon as the document exists, not only once it reaches the GL. rejectDraft() /
    // cancelDraft() / reverseEntry() release this reservation again — see releaseInvoiceReservation().
    invoiceLines.forEach((il,idx)=>{
      grn.qtyInvoicedByLine[idx] = r2((grn.qtyInvoicedByLine[idx]||0) + (+il.qty));
      if(po.qtyInvoicedByLine) po.qtyInvoicedByLine[idx] = r2((po.qtyInvoicedByLine[idx]||0) + (+il.qty));
    });
    save();
  }
  // Phase 39 FIX — found incidentally during Phase 3 testing: when createDraft() failed (e.g. a
  // missing date), its real `.error` string was silently discarded here, leaving the caller with
  // only `{ok:false, matched:true, mismatches:[]}` and no usable explanation at all. Propagate the
  // real reason through, exactly like every other `if(!x.ok) return x;` guard in this file already
  // does for its own fallible calls.
  if(!draft.ok) return {ok:false, error:draft.error};
  return {ok:true, draft:draft.draft, matched:match.matched, mismatches:match.mismatches};
}
// Phase 27 — the release side of the reservation made above. Called from rejectDraft/cancelDraft
// (a PO-aware bill that never reaches Post must not permanently block re-billing the same GRN
// line) and from reverseEntry (a POSTED PO-aware bill that is later reversed must reopen the same
// balance so it can be correctly rebilled) — same "additive hook, does not touch the accounting
// entry itself" pattern already used in reverseEntry() for restoring a GRN-reversal's commitment.
function releaseInvoiceReservation(draft){
  if(!draft || !draft.grnId || !Array.isArray(draft.invoiceLines)) return;
  const grn = DB.grns.find(g=>g.id===draft.grnId);
  const po = DB.purchaseOrders.find(p=>p.id===draft.poId);
  draft.invoiceLines.forEach((il,idx)=>{
    if(grn && grn.qtyInvoicedByLine) grn.qtyInvoicedByLine[idx] = r2(Math.max(0, (grn.qtyInvoicedByLine[idx]||0) - (+il.qty)));
    if(po && po.qtyInvoicedByLine) po.qtyInvoicedByLine[idx] = r2(Math.max(0, (po.qtyInvoicedByLine[idx]||0) - (+il.qty)));
  });
  save();
}
// Phase 27 — read-only projection for the new PO-aware Supplier Bill UI (Part 3 of the brief).
// Lets the accountant pick a Supplier and immediately see every GRN line that still has an
// invoiceable balance, with the exact fields the brief specifies (PO/GRN/Item/Qty/Received/
// AlreadyInvoiced/Balance/Rate). Computed server-side, not left to the client to re-derive from
// raw GRN/PO data, so the UI can never show a balance out of step with what the server will
// actually accept.
function invoiceableGRNsForVendor(vendorId){
  const grns = DB.grns.filter(g=>g.supplierId===vendorId);
  return grns.map(grn=>{
    const po = DB.purchaseOrders.find(p=>p.id===grn.poId);
    const lines = grn.lines.map((l,idx)=>{
      const alreadyInvoiced = grn.qtyInvoicedByLine?.[idx] || 0;
      const balance = r2((+l.qtyAccepted||0) - alreadyInvoiced);
      const material = DB.materials.find(m=>m.id===l.materialId);
      return { idx, materialId:l.materialId, description: material?material.description:l.materialId, uom: l.uom||(material?material.uom:''),
        qtyAccepted:+l.qtyAccepted||0, rate:+l.rate||0, alreadyInvoiced, balance };
    }).filter(l=>l.balance>0.01);
    return { grnId:grn.id, grnNo:grn.grnNo, poId:grn.poId, poNo: po?po.poNo:null, projectId:grn.projectId, date:grn.date, lines };
  }).filter(g=>g.lines.length>0);
}

function createPurchaseReturn({grnId, materialId, qty, reason, actor}){
  { const _a = assertCanCreatePurchaseReturn(actor); if(!_a.ok) return _a; }
  const grn = DB.grns.find(x=>x.id===grnId);
  if(!grn) return {ok:false, error:'GRN not found.'};
  const line = grn.lines.find(l=>l.materialId===materialId);
  if(!line) return {ok:false, error:'Material not found on this GRN.'};
  // Phase 17 CRITICAL FIX — found live via repository-wide sweep: a non-numeric qty ("not-a-
  // number") made `+qty` NaN, and `NaN > anything` is always false, so this guard never rejected
  // it — the NaN then reached postInventoryMovement() and corrupted getStockLevel() for MAT-1 to
  // null, live, a second time in this engagement (same root cause as Phase 15's DEFECT-15-01,
  // now confirmed to also exist here). Closed the same way as every prior instance.
  { const _v = assertPositiveFiniteNumber(qty, 'Quantity'); if(!_v.ok) return _v; }
  const available = getStockLevel(materialId, grn.warehouseId);
  if(+qty > available + 0.001) return {ok:false, error:`Cannot return ${qty} — only ${available} in stock (would create negative stock).`};
  // Phase 41 CRITICAL FIX — same defect class as createInventoryAdjustment()/createGRN()/
  // createMaterialIssue(): this used to push the return record, post the stock-restoring
  // movement, and only THEN attempt the GL entry without ever checking its result — a GL failure
  // left stock restored and a fully persisted return document with no accounting entry behind it,
  // while still reporting ok:true. The document id/number are pure computed values (no write yet),
  // so they're safe to use for the GL attempt before anything is committed.
  const retId = nextId(DB.purchaseReturns, 'PRET-', 4);
  const retNo = nextDocNumber('PRET');
  const value = (+qty)*(+line.rate);
  const _pretJesLen = DB.journalEntries.length, _pretDocLen = DB.purchaseReturns.length, _pretMovesLen = DB.inventoryMovements.length;
  const glResult = postJournalEntry({ date:new Date().toISOString().slice(0,10), narration:`Purchase Return ${retNo} against GRN ${grn.grnNo}`,
    sourceType:'PurchaseReturn', sourceId:retId, voucherNo:retNo, party:grn.supplierId, docCategory:'PurchaseReturn',
    lines:[ {account:'2050', debit:value, credit:0, vendorId:grn.supplierId, projectId:grn.projectId}, {account:'1200', debit:0, credit:value, vendorId:grn.supplierId, projectId:grn.projectId} ],
    actor, capability:'PURCHASE_RETURN', overrideReason:reason });
  if(!glResult.ok){
    // ERP-059B — durableFailureAudit, see ERP-059B-TRANSACTION-DESIGN.md.
    return {ok:false, error:glResult.error, durableFailureAudit:{type:'PurchaseReturnRejected', grnId, materialId, qty, value, glError:glResult.error}};
  }
  // Phase 36 Part J — same defect class as createGRN()/createMaterialIssue() (Phase 35): GL is
  // committed above; an exception before the document push, or between the document push and the
  // inventory movement, previously left a real GL-vs-inventory divergence with no rollback.
  try {
    _fault('PRET_AFTER_GL_BEFORE_DOC'); // Phase 36 Part J
    const ret = { id:retId, retNo, grnId, materialId, qty:+qty, reason:reason||'', status:'Posted', createdBy:actor.id, createdAt:nowIso() };
    DB.purchaseReturns.push(ret); save();
    _fault('PRET_AFTER_DOC_BEFORE_INVENTORY'); // Phase 36 Part J
    postInventoryMovement({type:'Return', materialId, qty, uom:line.uom, warehouseId:grn.warehouseId, projectId:grn.projectId, sourceType:'PurchaseReturn', sourceId:ret.id, valuationRate:line.rate, actor, capability:'PURCHASE_RETURN' });
    logAudit({type:'PurchaseReturnCreated', returnId:ret.id, grnId, materialId, qty, userId:actor.id, role:actor.role});
    return {ok:true, purchaseReturn:ret, glEntry:glResult.entry};
  } catch(e) {
    DB.journalEntries.length = _pretJesLen;
    DB.purchaseReturns.length = _pretDocLen;
    DB.inventoryMovements.length = _pretMovesLen;
    save();
    logAudit({type:'PurchaseReturnRolledBackOnFailure', grnId, materialId, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}

// ================== Phase 28 — Purchases Intelligence (all read-only, computed from existing
// PO/GRN/Invoice/Payment data — no new posting, no new master, no new accounting surface) ==================
function procurementIntelligence(){
  const vendors = DB.vendors.filter(v=>v.active!==false);
  const perVendor = vendors.map(v=>{
    const pos = DB.purchaseOrders.filter(po=>po.vendorId===v.id && po.status!=='Draft' && po.status!=='Rejected');
    const grns = DB.grns.filter(g=>g.supplierId===v.id);
    let totalOrderedQty=0, totalAcceptedQty=0, totalRejectedQty=0, cycleDaysSum=0, cycleCount=0, onTimeCount=0, deliveryCount=0;
    grns.forEach(g=>{
      const po = DB.purchaseOrders.find(p=>p.id===g.poId);
      g.lines.forEach(l=>{ totalAcceptedQty += (+l.qtyAccepted||0); totalRejectedQty += (+l.qtyRejected||0); });
      if(po && po.approvedAt){ cycleDaysSum += Math.max(0, (new Date(g.date) - new Date(po.approvedAt)) / 86400000); cycleCount++; }
      if(po && po.expectedDate){ deliveryCount++; if(new Date(g.date) <= new Date(po.expectedDate)) onTimeCount++; }
    });
    pos.forEach(po=>po.lines.forEach(l=>{ totalOrderedQty += (+l.qty||0); }));
    const totalSpend = r2(pos.reduce((s,po)=>s+po.total,0));
    const rejectionPct = (totalAcceptedQty+totalRejectedQty)>0 ? r2(100*totalRejectedQty/(totalAcceptedQty+totalRejectedQty)) : 0;
    const onTimePct = deliveryCount>0 ? r2(100*onTimeCount/deliveryCount) : null;
    const avgCycleDays = cycleCount>0 ? r2(cycleDaysSum/cycleCount) : null;
    return { vendorId:v.id, name:v.name, totalPOs:pos.length, totalSpend, totalGRNs:grns.length, rejectionPct, onTimePct, avgCycleDays };
  });
  return { vendors: perVendor, totalSpend: r2(perVendor.reduce((s,v)=>s+v.totalSpend,0)) };
}
// A simple, disclosed composite score (0-100) — NOT a claimed industry-standard formula, just a
// transparent, auditable blend of the three metrics procurementIntelligence() already computes.
// Weighting (50% on-time, 30% rejection, 20% spend-scale) is a reasonable starting default, not an
// approved Appletree policy — same "documented, not invented as fact" discipline as every other
// unapproved default in this Lab (see maxFuturePostingDays).
function vendorRating(){
  const {vendors} = procurementIntelligence();
  const maxSpend = Math.max(1, ...vendors.map(v=>v.totalSpend));
  return vendors.map(v=>{
    const onTimeScore = v.onTimePct===null ? null : v.onTimePct;
    const qualityScore = 100 - v.rejectionPct;
    const scaleScore = r2(100*v.totalSpend/maxSpend);
    const parts = [onTimeScore!==null?{w:0.5,s:onTimeScore}:null, {w:0.3,s:qualityScore}, {w:0.2,s:scaleScore}].filter(Boolean);
    const totalW = parts.reduce((s,p)=>s+p.w,0);
    const rating = totalW>0 ? r2(parts.reduce((s,p)=>s+p.w*p.s,0)/totalW) : null;
    return { ...v, rating, ratingNote:'Composite score (50% on-time delivery, 30% quality/rejection, 20% spend scale) — a disclosed default weighting, not an approved Appletree policy.' };
  }).sort((a,b)=>(b.rating||0)-(a.rating||0));
}
// Reporting Implementation Phase — DEFECT FOUND & FIXED (forensic reporting audit): this used to
// include Cancelled POs at full value in `orderedValue`, overstating every vendor's reported
// purchase total by however many orders it later cancelled (live-proven: VEND-1's 17 Cancelled
// POs inflated its reported total by exactly ₹10,90,000). Same exclusion convention already used
// elsewhere in this file for the identical concept (see `projectFinancial360()`'s poGrossValue,
// `DB.purchaseOrders.filter(po=>po.projectId===projectId && po.status!=='Cancelled')`) — not a
// new policy, just applied consistently here too. A Cancelled PO is still fully visible via
// GET /api/purchase-orders (the PO list itself is untouched) — it is only excluded from this
// specific "how much have we actually ordered from this vendor" aggregate, where it belongs.
// Reporting Implementation Phase — extended to accept the same {dateFrom, dateTo, projectId,
// status} filter shape already established by companyProjectProfitability() elsewhere in this
// file, for consistency. Kept backward-compatible: a bare string first argument (the original
// `purchaseVendorReport(vendorId)` call shape) still works unchanged — this was the function's
// only actual call site (server.js), but the fallback costs nothing and avoids a silent breaking
// change to an exported function.
function purchaseVendorReport(vendorIdOrOptions){
  const opts = (typeof vendorIdOrOptions === 'string' || vendorIdOrOptions == null) ? {vendorId: vendorIdOrOptions} : (vendorIdOrOptions||{});
  const {vendorId, dateFrom, dateTo, projectId, status} = opts;
  const pos = DB.purchaseOrders.filter(po=>
    (!vendorId || po.vendorId===vendorId) &&
    // Cancelled POs are excluded from the default "how much have we ordered" view (see this
    // function's own fix comment above) — UNLESS the caller explicitly asked to see Cancelled
    // POs via the status filter, which is a legitimate, different question ("show me what was
    // cancelled") and must not silently return empty.
    (status ? po.status===status : po.status!=='Cancelled') &&
    (!projectId || po.projectId===projectId) &&
    (!dateFrom || po.createdAt >= dateFrom) &&
    (!dateTo || po.createdAt <= (dateTo+'T23:59:59.999Z'))
  );
  return pos.map(po=>{
    const grns = DB.grns.filter(g=>g.poId===po.id);
    const grnValue = r2(grns.reduce((s,g)=>s+g.lines.reduce((s2,l)=>s2+(+l.qtyAccepted||0)*(+l.rate||0),0),0));
    const invoices = DB.jeDrafts.filter(d=>d.poId===po.id && d.postedEntryId);
    const invoicedValue = r2(invoices.reduce((s,d)=>s+(d.lines.find(l=>l.account==='2050')?.debit||0),0));
    const paidValue = r2(invoices.reduce((s,d)=>{
      const cleared = DB.clearings.filter(c=>c.type==='AP' && c.invoiceEntryId===d.postedEntryId).reduce((s2,c)=>s2+c.amount,0);
      return s+cleared;
    },0));
    return { poId:po.id, poNo:po.poNo, vendorId:po.vendorId, vendorName:(DB.vendors.find(v=>v.id===po.vendorId)||{}).name, projectId:po.projectId,
      status:po.status, orderedValue:po.total, grnValue, invoicedValue, paidValue, outstandingValue:r2(invoicedValue-paidValue) };
  });
}

// DEFECT FOUND & FIXED (Phase 14 Accountant UAT): a credit note could be posted against an
// invoice that was ALREADY fully cleared, applying its full amount as a clearing regardless of
// how much was actually still open — driving the invoice's open balance NEGATIVE (an "over-
// cleared" invoice, an accounting-integrity violation no real system should ever allow).
// `postCustomerReceipt()`/`postSupplierPayment()` already correctly cap against
// `openItem.open` before calling `applyClearing()`; this function (and the two sibling
// Customer Credit/Debit Note functions below) never had that same guard. Same root cause,
// same fix, applied everywhere `applyClearing()` is invoked from a credit-note-style function.
// Phase 14 FIX (Phase 13 DEFECT-13-03, by code symmetry with the live-proven DEFECT-13-02) —
// this used to post the FULL amount to Material Cost with no tax-line reversal at all, silently
// stranding whatever Input Tax the original bill had claimed. splitOriginalTax() below derives
// the base/tax proportion from the ORIGINAL POSTED bill's own lines (never from today's tax
// master, which per Part G/B cannot even be edited after creation) — historically immune by
// construction, not merely by convention.
// Phase 34 CRITICAL FIX — found live via Scenario 9: this used to derive `baseTotal` by filtering
// the original entry's lines for a caller-supplied, HARDCODED `baseAccount` (e.g. '5000' for a
// supplier bill). That is only correct for the ad-hoc draftSupplierInvoice() path, which debits
// Material Cost (5000) directly. A PO/GRN-matched bill (draftSupplierInvoiceFromPO() — the
// standard 3-way-matched path, not an edge case) instead clears the GR/IR liability raised at GRN
// time, debiting account 2050, and NEVER has a 5000 line at all. Filtering for '5000' against such
// a bill found zero matching lines, so baseTotal was 0, which silently fell through to "tax:0" —
// the ENTIRE Debit/Debit-Note amount was booked as if it were 100% base with ZERO tax reversed,
// even though the original bill was genuinely GST-taxed. Proven live: a DN against a PO-linked
// ₹11,800 (₹10,000+18% GST) bill posted Dr AP 2950 / Cr Material Cost 2950 with NO Input Tax line
// at all — a real, silent ITC-overclaim exposure (Input Tax Recoverable never reduced), exactly
// what this function's own Phase 14 fix was built to prevent, just not for this billing path.
// Fixed by deriving `baseTotal` from the entry's own balanced gross total (totalDebit, which by
// double-entry construction always equals totalCredit for ANY posted JE) minus the tax total —
// this is correct regardless of which specific account happens to hold the base portion, so it
// works identically whether the base sits on 5000, 2050, 4000, or any future billing path. The
// `baseAccount` parameter is no longer needed by any caller and has been removed from this
// function and all 4 call sites (2 supplier, 2 customer) rather than kept as a silently-ignored
// parameter that would misleadingly suggest it still does something.
function splitOriginalTax({originalEntry, taxAccount, amount}){
  const taxLine = originalEntry.lines.find(l=>l.account===taxAccount);
  const taxTotal = taxLine ? (taxLine.debit||taxLine.credit||0) : 0;
  const grossTotal = originalEntry.totalDebit; // balanced JE: totalDebit === totalCredit === gross
  const baseTotal = r2(grossTotal - taxTotal);
  if(taxTotal<=0 || baseTotal<=0) return { base: r2(amount), tax: 0, taxCode: null };
  const effectiveRate = taxTotal/baseTotal; // derived from what was ACTUALLY posted, not recalculated
  const tax = r2(amount * effectiveRate/(1+effectiveRate));
  const base = r2(amount - tax); // remainder, so base+tax always sums exactly to amount
  return { base, tax, taxCode: taxLine.taxCode||null };
}
function createSupplierCreditNote({supplierInvoiceEntryId, amount, reason, actor}){
  { const _a = assertCanCreateSupplierCreditNote(actor); if(!_a.ok) return _a; }
  // Phase 14 FIX — found live while re-testing the tax fix below: `!amount || +amount<=0` alone
  // lets a non-numeric string (e.g. "abc") through, since a non-empty string is truthy and every
  // NaN comparison is false. That silently produced a fully-posted, zero-value phantom document
  // (real CN number, real JE, real clearing — all zeros) instead of a clean rejection.
  { const _v = assertPositiveFiniteNumber(amount, 'Amount'); if(!_v.ok) return _v; }
  const inv = DB.journalEntries.find(e=>e.id===supplierInvoiceEntryId);
  if(!inv || inv.docCategory!=='SupplierInvoice') return {ok:false, error:'Supplier invoice not found.'};
  const apLine = inv.lines.find(l=>l.account==='2000');
  if(!apLine) return {ok:false, error:'Invoice has no AP line.'};
  const openItem = supplierOpenItems(apLine.vendorId).find(i=>i.entryId===supplierInvoiceEntryId);
  if(!openItem || +amount > openItem.open + 0.01) return {ok:false, error:`Credit note amount ₹${(+amount).toLocaleString('en-IN')} exceeds the invoice's open balance of ₹${(openItem?openItem.open:0).toLocaleString('en-IN')} — cannot over-clear an invoice.`};
  // Phase 41 FIX — used to push+save the credit-note record BEFORE the GL attempt; a GL failure
  // was correctly reported (never a false ok:true) but a fully persisted, document-numbered
  // credit note survived with no journal entry behind it. id/number are pure computed values,
  // safe to use for the GL attempt before committing anything.
  const cnId = nextId(DB.supplierCreditNotes, 'SCN-', 4), cnNo = nextDocNumber('SCN');
  const split = splitOriginalTax({originalEntry:inv, taxAccount:'1300', amount:+amount});
  // AP adjustment: Dr AP (reduces what's owed) / Cr Material Cost (the base portion) / Cr Input Tax
  // (the tax portion, proportional to what THIS bill actually posted) — posted through the
  // existing engine, then applied as a clearing against the original invoice so the open-item
  // math (Phase 5) accounts for it correctly.
  const glLines = [ {account:'2000', debit:+amount, credit:0, vendorId:apLine.vendorId, projectId:apLine.projectId} ];
  glLines.push({account:'5000', debit:0, credit:split.base, vendorId:apLine.vendorId, projectId:apLine.projectId});
  if(split.tax>0) glLines.push({account:'1300', debit:0, credit:split.tax, vendorId:apLine.vendorId, projectId:apLine.projectId, taxCode:split.taxCode});
  const _scnJesLen = DB.journalEntries.length, _scnDocLen = DB.supplierCreditNotes.length, _scnClearingsLen = DB.clearings.length;
  const result = postJournalEntry({ date:new Date().toISOString().slice(0,10), narration:`Supplier Credit Note ${cnNo}`, sourceType:'Supplier Credit Note',
    sourceId:cnId, voucherNo:cnNo, party:apLine.vendorId, docCategory:'SupplierInvoice',
    lines:glLines,
    actor, capability:'AP_CREDIT_NOTE', overrideReason:reason });
  if(!result.ok) return result;
  // Phase 36 Part I — same defect class as postCustomerReceipt()/postSupplierPayment() (Part H):
  // GL is committed above; an exception before the document push, or between the document push and
  // applyClearing(), previously left a real GL-vs-document-vs-AP-subledger divergence with no
  // rollback at all. jesLen captured before the GL attempt (see supplierCreditNoteJesLen above).
  try {
    _fault('SCN_AFTER_GL_BEFORE_DOC'); // Phase 36 Part I
    const cn = { id:cnId, cnNo, supplierInvoiceEntryId, amount:+amount, baseAmount:split.base, taxAmount:split.tax, taxCode:split.taxCode, reason:reason||'', createdBy:actor.id, createdAt:nowIso() };
    DB.supplierCreditNotes.push(cn); save();
    _fault('SCN_AFTER_DOC_BEFORE_CLEARING'); // Phase 36 Part I
    const clr = applyClearing({type:'AP', invoiceEntryId:supplierInvoiceEntryId, paymentEntryId:result.entry.id, amount:+amount, actor});
    logAudit({type:'SupplierCreditNoteCreated', creditNoteId:cn.id, amount, taxAmount:split.tax, userId:actor.id, role:actor.role});
    return {ok:true, creditNote:cn, entry:result.entry, clearing:clr};
  } catch(e) {
    DB.journalEntries.length = _scnJesLen;
    DB.supplierCreditNotes.length = _scnDocLen;
    DB.clearings.length = _scnClearingsLen;
    save();
    logAudit({type:'SupplierCreditNoteRolledBackOnFailure', supplierInvoiceEntryId, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}
// Phase 24 Part B — Supplier Debit Note (Phase 23 audit finding: Customer side has both Credit
// and Debit Note; Supplier side only ever had Credit Note). A Debit Note issued BY THE BUYER
// (Appletree) to a supplier records "we are debiting your account" in standard Indian
// buyer-side accounting/GST usage — for every one of the six approved scenarios (short receipt,
// damaged material, quality rejection, supplier overcharge, price dispute, purchase return), the
// buyer-side effect is identical to a Credit Note's: it REDUCES what Appletree owes the supplier.
// The accounting DIRECTION here is therefore deliberately mirrored from the already-proven
// Supplier Credit Note above (Dr AP / Cr Material Cost) — not invented from scratch — because
// that is the correct, existing, approved transaction architecture for a buyer-side AP reduction;
// this is a genuinely separate DOCUMENT (own numbering series SDN, own reason taxonomy, own audit
// type, own trace) satisfying the real gap (no such document existed at all), not a new
// accounting treatment. Where a scenario might carry GST-specific documentation requirements
// beyond what this Lab's tax engine already models, that is disclosed as BUSINESS POLICY /
// GST-COMPLIANCE REQUIRED, not guessed.
const SUPPLIER_DEBIT_NOTE_REASONS = ['Short Receipt','Damaged Material','Quality Rejection','Supplier Overcharge','Price Dispute','Purchase Return','Other'];
function createSupplierDebitNote({supplierInvoiceEntryId, amount, reasonCategory, reasonDetail, projectId, actor}){
  { const _a = assertCanCreateSupplierDebitNote(actor); if(!_a.ok) return _a; }
  // Phase 14 FIX — same non-numeric-amount hole as createSupplierCreditNote, closed the same way.
  { const _v = assertPositiveFiniteNumber(amount, 'Amount'); if(!_v.ok) return _v; }
  const inv = DB.journalEntries.find(e=>e.id===supplierInvoiceEntryId);
  if(!inv || inv.docCategory!=='SupplierInvoice') return {ok:false, error:'Supplier invoice not found.'};
  const apLine = inv.lines.find(l=>l.account==='2000');
  if(!apLine) return {ok:false, error:'Invoice has no AP line.'};
  if(!SUPPLIER_DEBIT_NOTE_REASONS.includes(reasonCategory)) return {ok:false, error:`Reason must be one of: ${SUPPLIER_DEBIT_NOTE_REASONS.join(', ')}.`};
  if(reasonCategory==='Other' && (!reasonDetail || !String(reasonDetail).trim())) return {ok:false, error:'"Other" requires a mandatory written explanation — a reason category alone is not enough.'};
  const openItem = supplierOpenItems(apLine.vendorId).find(i=>i.entryId===supplierInvoiceEntryId);
  if(!openItem || +amount > openItem.open + 0.01) return {ok:false, error:`Debit note amount ₹${(+amount).toLocaleString('en-IN')} exceeds the invoice's open balance of ₹${(openItem?openItem.open:0).toLocaleString('en-IN')} — cannot over-clear an invoice.`};
  // Phase 41 FIX — same reordering as createSupplierCreditNote above: attempt GL before committing.
  const dnId = nextId(DB.supplierDebitNotes, 'SDN-', 4), dnNo = nextDocNumber('SDN');
  const dnProjectId = projectId||apLine.projectId;
  // Phase 14 FIX (Phase 13 DEFECT-13-02, live-proven) — same splitOriginalTax() derivation as
  // createSupplierCreditNote: Input Tax Recoverable must be reduced proportionally, or the ERP
  // permanently retains ITC on a purchase that was debited/returned — a real ITC-overclaim
  // exposure under GST Rule 42/43, not just a bookkeeping mismatch.
  const split = splitOriginalTax({originalEntry:inv, taxAccount:'1300', amount:+amount});
  const glLines = [ {account:'2000', debit:+amount, credit:0, vendorId:apLine.vendorId, projectId:dnProjectId} ];
  glLines.push({account:'5000', debit:0, credit:split.base, vendorId:apLine.vendorId, projectId:dnProjectId});
  if(split.tax>0) glLines.push({account:'1300', debit:0, credit:split.tax, vendorId:apLine.vendorId, projectId:dnProjectId, taxCode:split.taxCode});
  const _sdnJesLen = DB.journalEntries.length, _sdnDocLen = DB.supplierDebitNotes.length, _sdnClearingsLen = DB.clearings.length;
  const result = postJournalEntry({ date:new Date().toISOString().slice(0,10), narration:`Supplier Debit Note ${dnNo} — ${reasonCategory}${reasonDetail?': '+reasonDetail:''}`, sourceType:'Supplier Debit Note',
    sourceId:dnId, voucherNo:dnNo, party:apLine.vendorId, docCategory:'SupplierInvoice',
    lines:glLines,
    actor, capability:'AP_DEBIT_NOTE', overrideReason:reasonDetail||reasonCategory });
  if(!result.ok) return result;
  // Phase 36 Part I — same defect class/fix as createSupplierCreditNote() above.
  try {
    _fault('SDN_AFTER_GL_BEFORE_DOC'); // Phase 36 Part I
    const dn = { id:dnId, dnNo, supplierInvoiceEntryId, vendorId:apLine.vendorId,
      projectId: dnProjectId, amount:+amount, baseAmount:split.base, taxAmount:split.tax, taxCode:split.taxCode, reasonCategory, reasonDetail:reasonDetail||'', createdBy:actor.id, createdAt:nowIso() };
    DB.supplierDebitNotes.push(dn); save();
    _fault('SDN_AFTER_DOC_BEFORE_CLEARING'); // Phase 36 Part I
    const clr = applyClearing({type:'AP', invoiceEntryId:supplierInvoiceEntryId, paymentEntryId:result.entry.id, amount:+amount, actor});
    logAudit({type:'SupplierDebitNoteCreated', debitNoteId:dn.id, vendorId:apLine.vendorId, reasonCategory, amount, taxAmount:split.tax, userId:actor.id, role:actor.role});
    return {ok:true, debitNote:dn, entry:result.entry, clearing:clr};
  } catch(e) {
    DB.journalEntries.length = _sdnJesLen;
    DB.supplierDebitNotes.length = _sdnDocLen;
    DB.clearings.length = _sdnClearingsLen;
    save();
    logAudit({type:'SupplierDebitNoteRolledBackOnFailure', supplierInvoiceEntryId, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}

// Phase 30 (§ Material Issue / BOM / Material Request alignment) — mirrors the real offline
// Appletree ERP's own established Material Issue policy: every issue is checked against the
// project's BOM quota, and issuing beyond that quota does not silently proceed. The offline ERP's
// exact mechanism (auto-create a separate CEO Approval Request instead of the direct issue) is a
// distinct workflow object this Lab doesn't have; the FAITHFUL equivalent already established
// elsewhere in THIS codebase is the override-reason + manager-tier pattern (see closed period
// posting, Damage Reports, Inventory Adjustments) — an over-quota issue requires Admin/CEO/
// FinanceManager authorization and a recorded reason, exactly like every other "this needs a
// human override, not a silent block or a silent pass" control in this Lab. Nothing invented: the
// BOM-derived quota itself reuses the EXACT SAME formula issueProductionMaterial() already applies
// (bomLine.qty * plannedQty * (1+scrapPct/100)), summed across every Production Order this project
// has raised against material-containing BOMs — a material with no BOM/Production Order at all
// simply has no quota to check against (inBom:false), matching the offline ERP's own "not in BOM,
// check with supervisor" (a warning, not a block).
function materialBomQuota({projectId, materialId}){
  const boms = DB.boms.filter(b=>b.projectId===projectId && b.status==='Approved');
  let budgetQty = 0, inBom = false;
  boms.forEach(bom=>{
    bom.lines.forEach(line=>{
      if(line.materialId!==materialId) return;
      inBom = true;
      DB.productionOrders.filter(p=>p.bomId===bom.id).forEach(po=>{
        budgetQty += (+line.qty) * po.plannedQty * (1 + (+line.scrapPct||0)/100);
      });
    });
  });
  budgetQty = r2(budgetQty);
  const usedQty = r2(DB.inventoryMovements.filter(m=>m.projectId===projectId && m.materialId===materialId)
    .reduce((s,m)=>{
      if(m.type==='Issue') return s+m.qty;
      if(m.type==='Return') return s-m.qty; // a Purchase/Material Return against this project reduces usage
      return s;
    },0));
  const remainingQty = r2(budgetQty - usedQty);
  const pctUsed = budgetQty>0 ? r2(100*usedQty/budgetQty) : (inBom ? 0 : null);
  return { projectId, materialId, inBom, budgetQty, usedQty, remainingQty, pctUsed };
}
// ---------- Function-level (capability) authorization — Phase 24 §4/§5 ----------
// Moved here from server.js so there is exactly ONE authoritative definition — server.js keeps a
// local `const isProjectManagerOf = D.isProjectManagerOf;` alias so its 54 existing call sites are
// unchanged. A ProjectManager is "assigned" to a project via EITHER the Phase-6A static seed list
// (assignedProjects) OR the dynamic assignment set on the project itself during Won (Phase 6B).
function isProjectManagerOf(actor, projectId){
  if(actor.role!=='ProjectManager') return false;
  if((actor.assignedProjects||[]).includes(projectId)) return true;
  const p = DB.projects.find(x=>x.id===projectId);
  return !!(p && p.projectManagerId===actor.id);
}
// Mirrors isProjectManagerOf's shape for the Sites master (Phase 24 §1) — a SiteInCharge is
// "in charge of" a site only if DB.sites records them as such; this did not exist before Phase 24,
// which is exactly how a SiteInCharge could act on ANY site, not just their own.
function isSiteInChargeOf(actor, siteId){
  if(actor.role!=='SiteInCharge') return false;
  const s = DB.sites.find(x=>x.id===siteId);
  return !!(s && s.siteInChargeUserId===actor.id);
}
// Phase 24 §1/§4 — the capability check for createMaterialIssue(), embedded IN the domain function
// itself (not just in a route wrapper) so no current or future route/caller can reach a real GL
// posting and inventory movement without passing this check. This directly closes the Phase 23
// duplicate-door finding: /api/material-issues and /api/site-material-consumption both call
// createMaterialIssue() — before Phase 24, the SECOND route had its own, weaker, unrelated
// authorization (SOP_SITE_ROLES) that could still reach this function even when this check would
// have refused it. Now BOTH routes (and any future one) are protected identically because the
// check lives here, not in either caller.
//
// Two genuinely different business operations share this one function (see the Phase 24 audit
// report §1 for the full business-intent investigation):
//   - siteId supplied  → Site Consumption (material already delivered to a site, drawn from that
//     site's own subledger). Scoped to the SiteInCharge actually assigned to THAT site, or to
//     Admin/CEO/Purchase/FinanceManager (the same oversight tier already trusted with the rest of
//     the Site Material SOP chain — requisition approval, receipt recording).
//   - siteId absent (warehouseId given) → direct warehouse-to-project issue. Scoped to the
//     ProjectManager who owns THAT project, or to Admin/CEO/Purchase — unchanged from Phase 23.
function assertCanCreateMaterialIssue(actor, {projectId, siteId}){
  if(siteId){
    if(['Admin','CEO','Purchase','FinanceManager'].includes(actor.role)) return {ok:true};
    if(isSiteInChargeOf(actor, siteId)) return {ok:true};
    return {ok:false, error: actor.role==='SiteInCharge'
      ? `Role "SiteInCharge" is not in charge of site "${siteId}" — cannot record consumption there.`
      : `Role "${actor.role}" is not authorized to record Site Material Consumption.`};
  }
  if(['Admin','CEO','Purchase'].includes(actor.role)) return {ok:true};
  if(isProjectManagerOf(actor, projectId)) return {ok:true};
  return {ok:false, error:`Role "${actor.role}" is not authorized to perform this action.`};
}
// ============================================================================================
// Phase 25 §2/§3/§5 — the remaining 22 dangerous GL-posting functions now each get their own
// named capability guard, embedded in the function itself, exactly like Phase 24's 3. Every rule
// below was copied from the CURRENT route-level check (read fresh, not assumed from naming — see
// the Phase 25 report §2/§3 for the specific case, postInstallationLabourCost, where "the labour
// cost functions all use the same rule" would have been WRONG: postProductionLabourCost and
// postServiceLabourCost use the broad can(actor,'create') tag, while postInstallationLabourCost
// uses a narrower, project-scoped rule (EXEC_CREATE_ROLES OR PM-of-that-installation's-project) —
// three siblings, three different rules, none collapsed into the others). Each of the 11 routes
// that already declared this exact rule at the route level (roles:[...]/permission:'x') now has
// its route registration changed to call the SAME function below via authCheck, so the route and
// the domain function can never drift apart — one authoritative definition, read twice.
function assertCanClearReceipt(actor){ return can(actor,'clear') ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot clear a customer receipt.`}; }
function assertCanPaySupplier(actor){ return can(actor,'pay') ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot pay a supplier.`}; }
function assertCanCreateSupplierCreditNote(actor){ return ['Admin','CEO','FinanceManager','Accountant'].includes(actor.role) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot create a Supplier Credit Note.`}; }
function assertCanCreateSupplierDebitNote(actor){ return ['Admin','CEO','FinanceManager','Accountant'].includes(actor.role) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot create a Supplier Debit Note.`}; }
function assertCanCreateCustomerCreditNote(actor){ return ['Admin','CEO','FinanceManager','Accountant'].includes(actor.role) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot create a Customer Credit Note.`}; }
function assertCanCreateCustomerDebitNote(actor){ return ['Admin','CEO','FinanceManager','Accountant'].includes(actor.role) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot create a Customer Debit Note.`}; }
function assertCanCreateInventoryAdjustment(actor){ return ['Admin','CEO','FinanceManager'].includes(actor.role) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot create an Inventory Adjustment.`}; }
// Phase 33 Part D — the SINGLE shared rule for "may a NEW cost/revenue/inventory transaction be
// posted against this project." Found this phase: reverseEntry() was the ONLY place in the entire
// codebase that ever checked project.status — every cost-creating function (createMaterialIssue,
// recordLabourWages, recordProjectExpense, createPurchaseOrder, createGRN, and every draft-based
// posting via postDraft) checked at most that the project EXISTS, never that it is still OPEN. A
// CLOSED project could silently keep accruing new GL/inventory postings forever (proven live —
// see PHASE33 report §4). Policy is not invented here: it is the EXACT same shape already approved
// and in production for the two existing precedents in this codebase — the closed-FINANCIAL-PERIOD
// override in postJournalEntry() (Phase 19) and the closed-PROJECT-REVERSAL override in
// reverseEntry() (Phase 41) — CLOSED blocks by default; CEO/Admin may override with a mandatory,
// non-blank reason; every override is audited. This is the ONE place that rule is defined — every
// caller below delegates to it rather than re-implementing any part of the check itself.
function assertProjectOpenForPosting(projectId, actor, {overrideReason, action}={}){
  if(!projectId) return {ok:true}; // not every posting is project-linked; nothing to gate
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return {ok:false, error:`Unknown project "${projectId}".`};
  if(p.status!=='CLOSED') return {ok:true};
  if(!['CEO','Admin'].includes(actor.role)){
    return {ok:false, error:`Cannot ${action||'post'} — project ${p.id} (${p.name}) is CLOSED. Only CEO/Admin may post a new transaction against a closed project, and only with an explicit reason.`};
  }
  if(!overrideReason || !String(overrideReason).trim()){
    return {ok:false, error:`Project ${p.id} (${p.name}) is CLOSED. Your role ("${actor.role}") is authorized to override, but a reason is required for every closed-project posting override.`};
  }
  logAudit({type:'ClosedProjectPostingOverride', projectId:p.id, action:action||'post', reason:overrideReason, userId:actor.id, role:actor.role});
  return {ok:true};
}
function assertCanCreateGRN(actor){ return ['Admin','CEO','Purchase'].includes(actor.role) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot create a GRN.`}; }
function assertCanCreatePurchaseReturn(actor){ return ['Admin','CEO','Purchase'].includes(actor.role) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot create a Purchase Return.`}; }
function assertCanRecordLabourWages(actor, projectId){ return (['Admin','CEO','FinanceManager','Accountant'].includes(actor.role) || isProjectManagerOf(actor, projectId)) ? {ok:true} : {ok:false, error:`Role "${actor.role}" is not authorized to perform this action.`}; }
function assertCanRecordProjectExpense(actor, projectId){ return (['Admin','CEO','FinanceManager','Accountant'].includes(actor.role) || isProjectManagerOf(actor, projectId)) ? {ok:true} : {ok:false, error:`Role "${actor.role}" is not authorized to perform this action.`}; }
function assertCanCapitalizeFixedAsset(actor){ return can(actor,'post') ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot capitalize a fixed asset.`}; }
function assertCanDisposeFixedAsset(actor){ return can(actor,'post') ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot dispose a fixed asset.`}; }
function assertCanPostAssetDepreciation(actor){ return can(actor,'post') ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot post asset depreciation.`}; }
// Phase 35 Part F — transferFixedAsset() previously had NO domain-level authorization check at
// all, relying solely on the route's can(actor,'edit') — a permission Purchase/Sales/Estimator/
// SiteInCharge all hold, none of whom have any authority over the other three fixed-asset lifecycle
// actions on the SAME object. Not an invented policy: this mirrors the three sibling functions
// immediately above exactly (same object, same lifecycle, same 'post' tier already established as
// this codebase's fixed-asset authority level) — a Transfer is a real asset-lifecycle event in
// standard accounting terminology (it changes which project/custodian future depreciation and
// disposal proceeds attribute to), not a routine "edit a text field" action.
function assertCanTransferFixedAsset(actor){ return can(actor,'post') ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot transfer a fixed asset.`}; }
function assertCanTransferBankFunds(actor){ return can(actor,'pay') ? {ok:true} : {ok:false, error:`Role "${actor.role}" is not authorized to transfer between bank/cash accounts.`}; }
function assertCanPostBankImportLine(actor){ return can(actor,'post') ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot post a bank import line to the GL.`}; }
// NOTE the deliberate asymmetry across these 3 labour-cost siblings — preserved exactly, not
// harmonized: Production and Service use the broad can(actor,'create') tag; Installation alone
// uses the narrower EXEC_CREATE_ROLES-or-owning-PM rule the old route enforced via execAllowed().
function assertCanPostProductionLabourCost(actor){ return can(actor,'create') ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot post production labour cost.`}; }
function assertCanPostServiceLabourCost(actor){ return can(actor,'create') ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot post service labour cost.`}; }
function assertCanPostInstallationLabourCost(actor, projectId){ return (['Admin','CEO','Purchase'].includes(actor.role) || isProjectManagerOf(actor, projectId)) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot post installation labour cost.`}; }
function assertCanRecognizeAMCRevenue(actor){ return ['Admin','CEO','FinanceManager','Accountant'].includes(actor.role) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot recognize AMC revenue.`}; }
function assertCanReplenishPettyCash(actor){ return ['Admin','CEO','FinanceManager'].includes(actor.role) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot replenish a Petty Cash Float.`}; }
// reverseITCForWriteOff has exactly one caller (createDamageReport(), internal-only — no external
// route calls it directly), already gated at roles:['Admin','CEO','FinanceManager']. This guard
// intentionally mirrors that SAME rule rather than a different one — it can never fire differently
// than the caller's own check already would, so it adds real defense-in-depth (a future second
// caller inherits protection automatically) without any risk of breaking the existing internal
// workflow, per Part 6's instruction not to create redundant checks that could do that.
function assertCanReverseITCForWriteOff(actor){ return ['Admin','CEO','FinanceManager'].includes(actor.role) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot reverse ITC for a write-off.`}; }
// Phase 26 §11 — the 7 inventory-only functions (no GL exposure) get the SAME treatment as the 25
// GL-posting functions, extending write-point containment (see CAPABILITY_REGISTRY below) beyond
// just the GL-posting set. Each rule copied verbatim from the CURRENT route-level check.
function assertCanCreateInventoryTransfer(actor){ return ['Admin','CEO','Purchase'].includes(actor.role) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot create an Inventory Transfer.`}; }
function assertCanImportMasterData(actor){ return can(actor,'masterData') ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot import master data.`}; }
function assertCanIssueToSite(actor){ return ['Admin','CEO','FinanceManager','Purchase'].includes(actor.role) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot issue material to a site.`}; }
// Targeted P1 Remediation phase — same authorization tier as assertCanIssueToSite (the exact reverse
// movement) — not a new, invented policy, the natural symmetric application of the existing one.
function assertCanReturnFromSite(actor){ return ['Admin','CEO','FinanceManager','Purchase'].includes(actor.role) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot record a return from a site.`}; }
function assertCanDispatchToJobWorker(actor){ return ['Admin','CEO','FinanceManager','Purchase'].includes(actor.role) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot dispatch material to a Job Worker.`}; }
function assertCanReturnFromJobWorker(actor){ return ['Admin','CEO','FinanceManager','Purchase'].includes(actor.role) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot record a Job Work return.`}; }
function assertCanRecordJobWorkScrap(actor){ return ['Admin','CEO','FinanceManager','Purchase'].includes(actor.role) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot record Job Work scrap.`}; }
function assertCanDirectDispatchFromJobWorker(actor){ return ['Admin','CEO','FinanceManager','Purchase'].includes(actor.role) ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot record a Job Work direct customer dispatch.`}; }
// ---------- Material Issue — the ONLY event that hits Project Actual Cost (§21/§31) ----------
function createMaterialIssue({projectId, materialId, qty, warehouseId, purpose, requestedBy, actor, sourceType, sourceId, overrideReason, locationId, materialRequirementId, siteId, excessRequestId}){
  { const _a = assertCanCreateMaterialIssue(actor, {projectId, siteId}); if(!_a.ok) return _a; }
  // Phase 33 Part D — closed-project gate, run before any other validation/mutation. Reuses the
  // SAME overrideReason field already used a few lines below for the BOM-quota override — one
  // authorization act by a manager-tier actor can legitimately satisfy both conditions at once
  // when both happen to apply; each is still logged as its own distinct audit event type.
  { const _po = assertProjectOpenForPosting(projectId, actor, {overrideReason, action:'issue material'}); if(!_po.ok) return _po; }
  const material = DB.materials.find(m=>m.id===materialId);
  if(!material) return {ok:false, error:'Material not found.'};
  // Phase 30 P29-2 FIX: there was no qty>0 guard here at all. A negative qty passed the
  // "qty > available" check trivially (negative < any positive available) and posted as a real
  // Issue movement — but getStockLevel() computes an Issue's effect as `stock - qty`, so a
  // negative qty actually INCREASED recorded stock while being audited as a "Material Issue."
  // Same discipline as createDamageReport()'s existing `if(!qty || +qty<=0)` guard — rejected
  // before any inventory movement, GL posting, or project cost is touched. No partial transaction.
  // Phase 15 FIX — same NaN-through-truthy-string hole as createInventoryAdjustment(); closed the
  // same way so a malformed qty can never reach postInventoryMovement() and poison a stock sum.
  { const _v = assertPositiveFiniteNumber(qty, 'Quantity'); if(!_v.ok) return _v; }
  const inactiveErr = assertMaterialSelectable(materialId); if(inactiveErr) return {ok:false, error:inactiveErr};
  // Phase 14 P0 fix, defense-in-depth alongside the createGRN() fix above — the warehouse-scoped
  // branch (siteId not supplied) had no existence check on warehouseId either; it happened to be
  // caught only indirectly, by a fabricated warehouse always reporting 0 stock (getStockLevel on
  // an unknown warehouseId returns 0, not an error). That masked the real gap: if phantom stock
  // ever existed under a fake warehouse ID (e.g. via the createGRN() gap just fixed), this
  // function would have issued against it with zero complaint. Same "Unknown warehouse" idiom as
  // every other warehouse-touching function in this file — not a new validation concept.
  if(!siteId){
    if(!warehouseId) return {ok:false, error:'A warehouse is required to issue material (or supply siteId for site consumption).'};
    if(!DB.warehouses.find(w=>w.id===warehouseId)) return {ok:false, error:`Unknown warehouse "${warehouseId}".`};
  }
  // Phase 33 — Site Consumption. When siteId is supplied, this issue consumes material already
  // sitting at a SITE's own subledger (via issueToSite()'s SiteReceipt movement), not material
  // still in a warehouse — so availability is checked against getSiteStockLevel(), and the ledger
  // records a 'SiteConsumption' movement instead of 'Issue'. Every pre-Phase-33 caller omits
  // siteId, so this branch never runs for any existing call site.
  const available = siteId ? getSiteStockLevel(materialId, siteId) : getStockLevel(materialId, warehouseId);
  if(+qty > available + 0.001) return {ok:false, error: siteId
    ? `Cannot consume ${qty} ${material.uom} at site ${siteId} — only ${available} available there (not yet received from central store, or already consumed).`
    : `Cannot issue ${qty} ${material.uom} — only ${available} available in ${warehouseId} (negative stock is blocked, not silently allowed).`};

  // Material Requirement linkage — "material issue should be according to material request," per
  // the real offline ERP's own established practice. Optional, not force-required (this Lab's
  // architecture allows issues with no requirement behind them for good reason — e.g. Production
  // Order material issue, which is BOM-driven, not requirement-driven) — but if one IS supplied it
  // must genuinely be APPROVED, for THIS project and THIS material, and not already fulfilled.
  let requirement = null;
  if(materialRequirementId){
    requirement = DB.materialRequirements.find(r=>r.id===materialRequirementId);
    if(!requirement) return {ok:false, error:'Material Requirement not found.'};
    if(requirement.projectId!==projectId) return {ok:false, error:'That Material Requirement belongs to a different project.'};
    if(requirement.materialId!==materialId) return {ok:false, error:'That Material Requirement is for a different material.'};
    if(requirement.status!=='APPROVED') return {ok:false, error:`Cannot issue against Material Requirement "${materialRequirementId}" — status is "${requirement.status}", not APPROVED.`};
  }

  // BOM entitlement check — BOM Governance phase. Replaces the old materialBomQuota()-based gate
  // (which derived its "budget" from Production Order plannedQty — always 0 for an ordinary
  // interior-fit-out project that never raises a Production Order, proven live in the prior
  // investigation) with projectBomEntitlement(), which reads the approved quantity DIRECTLY off the
  // project's own active Approved BOM line. Only enforced when the material genuinely IS in the
  // project's approved BOM (inBom:true) — a material with no BOM line simply has nothing to check
  // against, matching the existing "not in BOM, nothing to check" policy for that case.
  // NEVER enforced for sourceType:'ProductionOrder' — that module keeps using the ORIGINAL
  // materialBomQuota()/Production-Order-derived quota unchanged (issueProductionMaterial() computes
  // its own qty directly from the same bomLine.qty*plannedQty*scrap formula), so gating it against
  // its own source would be circular. This is a deliberate two-track design: Production Orders keep
  // their existing Production-Order-quota control; ordinary project Material Issue now gets the
  // NEW, correct, BOM-approved-quantity control.
  const entitlement = projectBomEntitlement({projectId, materialId, siteId});
  let quotaWarning = null;
  let usedExcessRequest = null;
  if(entitlement.inBom && sourceType!=='ProductionOrder'){
    if(+qty > entitlement.remainingQty + 0.001){
      // Excess — NOT self-service. The old overrideReason bypass (proven live, in the prior
      // investigation, to let a non-manager self-authorize an unlimited excess by typing any
      // sentence) is gone. The ONLY way an excess quantity can post is a genuinely APPROVED Excess
      // Material Issue Approval request, raised and approved by a DIFFERENT person, covering AT
      // LEAST this quantity, not already fully consumed by an earlier issue, for this exact
      // project+material+site.
      if(excessRequestId){
        const xmi = DB.excessMaterialIssueRequests.find(x=>x.id===excessRequestId);
        if(!xmi) return {ok:false, error:`Excess Material Issue request "${excessRequestId}" not found.`};
        if(xmi.status!=='Approved') return {ok:false, error:`Excess Material Issue request "${excessRequestId}" is "${xmi.status}", not Approved — cannot post against it.`};
        if(xmi.projectId!==projectId || xmi.materialId!==materialId || (xmi.siteId||null)!==(siteId||null)){
          return {ok:false, error:`Excess Material Issue request "${excessRequestId}" does not match this project/material/site.`};
        }
        const remainingOnRequest = r2(xmi.requestedQty - xmi.consumedQty);
        if(+qty > remainingOnRequest + 0.001){
          return {ok:false, error:`Excess Material Issue request "${excessRequestId}" only covers ${remainingOnRequest} ${material.uom} more (already consumed ${xmi.consumedQty} of ${xmi.requestedQty}) — this issue of ${qty} exceeds it. A duplicate/second use of the same approval is blocked.`};
        }
        usedExcessRequest = xmi;
      } else {
        const excessQty = r2((+qty) - entitlement.remainingQty);
        return {ok:false, error:`Exceeds approved BOM entitlement for ${material.description} on ${projectId} — total allowed ${entitlement.totalAllowed} ${material.uom} (approved ${entitlement.approvedQty} + wastage ${entitlement.wastageQty}), already issued ${entitlement.usedQty}, only ${entitlement.remainingQty} remaining. This issue of ${qty} exceeds the remaining entitlement by ${excessQty} — an Excess Material Issue Approval request must be raised and approved by an authorized manager (Admin/CEO/FinanceManager, other than the requester) before this can post. Typing a reason here is no longer sufficient.`,
          requiresExcessApproval:true, entitlement, excessQty};
      }
    } else if(+qty > entitlement.remainingQty*0.8){
      quotaWarning = `${material.description} is now within 80% of its approved BOM entitlement for this project (issuing ${qty} of ${entitlement.remainingQty} ${material.uom} remaining, of ${entitlement.totalAllowed} total allowed).`;
    }
  }

  const rate = siteId ? getSiteMovingAverageRate(materialId, siteId) : getMovingAverageRate(materialId, warehouseId);
  const value = Math.round((+qty)*rate*100)/100;
  // Phase 41 CRITICAL FIX — same defect class as createInventoryAdjustment()/createGRN(): this
  // used to post the Issue movement FIRST, then attempt the GL entry without checking the result,
  // so a closed-period (or other) GL failure left real stock drawn down — and, if linked, a
  // Material Requirement flipped to CONVERTED — with zero accounting entry behind it, while still
  // reporting ok:true. The GL entry's own sourceId is (by design, used by reverseEntry() to find
  // the exact movement to compensate on reversal) the movement's own id — so the intended id is
  // precomputed here (safe: single-threaded, nothing else can push to DB.inventoryMovements
  // between this line and the actual postInventoryMovement call below) and the GL is attempted
  // FIRST using that id, before anything is written.
  const plannedMvId = nextInventoryMovementId();
  // Phase 35 CRITICAL FIX — same defect class and same fix shape as createGRN() above, found via
  // the identical fault-injection test: GL is committed below (via postJournalEntry, which pushes+
  // saves immediately) before the inventory movement/requirement-update/audit steps run. An
  // exception in that window previously left a real GL orphan (Material Issue expensed and
  // inventory reduced in the books, with NO corresponding inventoryMovements record), and a retry
  // would then post the SAME issue a second time with nothing to detect the duplication. jesLen
  // MUST be captured BEFORE postJournalEntry() is attempted (an earlier version of this fix
  // captured it afterward, which meant a rollback restored everything EXCEPT the GL entry itself —
  // re-attacked and confirmed live, see the Phase 35 report).
  const _rb2 = {
    jesLen: DB.journalEntries.length,
    movesLen: DB.inventoryMovements.length, auditLen: DB.auditLog.length,
    requirement: requirement ? {...requirement} : null,
    excessRequest: usedExcessRequest ? {...usedExcessRequest} : null
  };
  let glResult = {ok:true};
  if(value>0.01){
    glResult = postJournalEntry({ date:new Date().toISOString().slice(0,10), narration:`Material Issue: ${material.description} × ${qty} ${material.uom} — ${purpose||''}`,
      sourceType:'MaterialIssue', sourceId:plannedMvId, voucherNo:nextDocNumber('ISS'), docCategory:'MaterialIssue', branchId:projectBranch(projectId),
      lines:[ {account:'5000', debit:value, credit:0, projectId}, {account:'1200', debit:0, credit:value, projectId} ],
      actor, capability:'MATERIAL_ISSUE', capabilityCtx:{projectId, siteId}, overrideReason });
    if(!glResult.ok){
      // Nothing has been written yet — no movement, no requirement-status change, no stock impact.
      // ERP-059B — durableFailureAudit, see ERP-059B-TRANSACTION-DESIGN.md.
      return {ok:false, error:glResult.error, durableFailureAudit:{type:'MaterialIssueRejected', projectId, materialId, qty, value, glError:glResult.error}};
    }
  }
  const primaryBomRef = (entitlement.bomRefs && entitlement.bomRefs[0]) || null;
  try {
    _fault('ISSUE_AFTER_GL_BEFORE_INVENTORY'); // Phase 35 Part A stage 2/3: GL committed, before inventory
    const mv = postInventoryMovement({id:plannedMvId, type: siteId?'SiteConsumption':'Issue', materialId, qty, uom:material.uom, warehouseId: siteId?null:warehouseId, siteId:siteId||null, projectId, sourceType:sourceType||'MaterialIssue', sourceId:sourceId||null, valuationRate:rate, actor, locationId:locationId||null, capability:'MATERIAL_ISSUE', capabilityCtx:{projectId, siteId},
      bomId: primaryBomRef?primaryBomRef.bomId:null, bomVersion: primaryBomRef?primaryBomRef.version:null, excessRequestId: usedExcessRequest?usedExcessRequest.id:null });
    _fault('ISSUE_AFTER_INVENTORY_BEFORE_DEPENDENT'); // Phase 35 Part A stage 4/7: inventory committed, before dependent requirement update
    if(requirement){ requirement.status='CONVERTED'; requirement.convertedBy=actor.id; requirement.convertedAt=nowIso(); requirement.issuedMovementId=mv.id; save(); }
    // BOM Governance phase — consume the Excess Material Issue Approval request that authorized this
    // issue (if any), same transaction boundary as everything else above: a failure below rolls this
    // back exactly like the requirement-status change does. Marking it 'Consumed' once fully used (not
    // left 'Approved') is what makes a SECOND attempt to post against the same approval fail — the
    // duplicate-use block inside the entitlement check above only accepts status:'Approved'.
    if(usedExcessRequest){
      usedExcessRequest.consumedQty = r2(usedExcessRequest.consumedQty + (+qty));
      usedExcessRequest.consumingMovementIds.push(mv.id);
      if(usedExcessRequest.consumedQty >= usedExcessRequest.requestedQty - 0.001) usedExcessRequest.status = 'Consumed';
      save();
      logAudit({type:'ExcessMaterialIssueConsumed', xmiId:usedExcessRequest.id, movementId:mv.id, projectId, materialId, qty:+qty, userId:actor.id, role:actor.role});
    }
    _fault('ISSUE_BEFORE_AUDIT'); // Phase 35 Part A stage 6: before audit write
    logAudit({type:'MaterialIssue', movementId:mv.id, projectId, materialId, qty, value, materialRequirementId:materialRequirementId||null, bomId:mv.bomId, excessRequestId:mv.excessRequestId, userId:actor.id, role:actor.role});
    return {ok:true, movement:mv, valuationRate:rate, value, glEntry: glResult.entry||null, entitlement, quotaWarning, fulfilledRequirement: requirement, excessRequestUsed: usedExcessRequest};
  } catch(e) {
    DB.inventoryMovements.length = _rb2.movesLen;
    DB.auditLog.length = _rb2.auditLen;
    DB.journalEntries.length = _rb2.jesLen; // rolls back the GL entry postJournalEntry() already committed
    if(_rb2.requirement) Object.assign(requirement, _rb2.requirement);
    if(_rb2.excessRequest) Object.assign(usedExcessRequest, _rb2.excessRequest);
    save();
    logAudit({type:'MaterialIssueRolledBackOnFailure', projectId, materialId, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}

// ================== Phase 28 — Operations ==================
// Labour & Wages — day-labour engaged directly on a project (distinct from Production Labour,
// which is tied to a specific Production Order via postProductionLabourCost). Posts through the
// SAME central engine to the SAME Labour Cost account (5100) already used by production labour —
// one cost account, two legitimate sources, both fully traceable via docCategory.
function recordLabourWages({projectId, workerName, role, days, ratePerDay, date, bankAccountId, actor, overrideReason}){
  { const _a = assertCanRecordLabourWages(actor, projectId); if(!_a.ok) return _a; }
  if(!projectId || !DB.projects.find(p=>p.id===projectId)) return {ok:false, error:'A valid project is required.'};
  // Phase 33 Part D — closed-project gate.
  { const _po = assertProjectOpenForPosting(projectId, actor, {overrideReason, action:'record labour wages'}); if(!_po.ok) return _po; }
  if(!workerName) return {ok:false, error:'Worker name is required.'};
  // Phase 39 FIX — found live: the old check only validated the PRODUCT was positive, so
  // days:-5 and ratePerDay:-100 (both individually nonsensical) multiplied to a positive ₹500 and
  // passed uncaught — an "individually invalid, jointly valid-looking" combination, exactly the
  // class Part U of this audit specifically hunts for. Both factors are now validated individually.
  if(!(+days>0)) return {ok:false, error:`Days must be a positive number — got "${days}".`};
  if(!(+ratePerDay>0)) return {ok:false, error:`Rate per day must be a positive number — got "${ratePerDay}".`};
  const value = r2((+days||0)*(+ratePerDay||0));
  if(value<=0) return {ok:false, error:'Days and rate per day must both be positive.'};
  let bankGlAccount = '1000';
  if(bankAccountId){
    const acct = DB.bankAccounts.find(b=>b.id===bankAccountId);
    if(!acct) return {ok:false, error:`Unknown bank/cash account "${bankAccountId}".`};
    bankGlAccount = acct.glAccount;
  }
  // Phase 36 Part C — same defect class as createGRN()/createMaterialIssue(): GL commits below; an
  // exception before the document push previously left a real GL orphan with no rollback. jesLen
  // MUST be captured BEFORE postJournalEntry() runs (the exact mistake Phase 35 caught and fixed
  // in its own first draft — repeated here on the first pass and caught the same way via
  // fault-injection re-verification, not assumed correct).
  const _lbrJesLen = DB.journalEntries.length, _lbrDocLen = DB.labourWages.length;
  // Phase 13A §9 fix — the exact twin of Phase 12's recordProjectExpense() defect, found by a
  // systematic scan of every postJournalEntry() call site: overrideReason was accepted and
  // forwarded to the closed-PROJECT gate above, but never to postJournalEntry() itself — so the
  // closed-FINANCIAL-PERIOD override could never succeed through this endpoint no matter the role
  // or reason supplied. Now matches recordProjectExpense()'s already-fixed, already-tested pattern.
  const glResult = postJournalEntry({ date:date||new Date().toISOString().slice(0,10), narration:`Labour Wages — ${workerName} (${role||'Worker'}) x ${days} day(s)`,
    sourceType:'LabourWages', voucherNo:nextDocNumber('LBR', date), docCategory:'LabourWages',
    lines:[ {account:'5100', debit:value, credit:0, projectId}, {account:bankGlAccount, debit:0, credit:value, projectId} ],
    actor, capability:'LABOUR_WAGES', capabilityCtx:{projectId}, overrideReason });
  if(!glResult.ok) return glResult;
  try {
    _fault('LABOUR_AFTER_GL_BEFORE_DOC'); // Phase 36 Part C
    const rec = { id:nextId(DB.labourWages, 'LBR-', 4), projectId, workerName, role:role||'Worker', days:+days, ratePerDay:+ratePerDay, value,
      date:date||new Date().toISOString().slice(0,10), glEntryId:glResult.entry.id, createdBy:actor.id, createdAt:nowIso() };
    DB.labourWages.push(rec); save();
    logAudit({type:'LabourWagesRecorded', labourId:rec.id, projectId, workerName, value, userId:actor.id, role:actor.role});
    return {ok:true, labour:rec, glEntry:glResult.entry};
  } catch(e) {
    DB.journalEntries.length = _lbrJesLen;
    DB.labourWages.length = _lbrDocLen;
    save();
    logAudit({type:'LabourWagesRolledBackOnFailure', projectId, workerName, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}
// Project Expenses — miscellaneous site/project costs (site consumables, travel, permits) that
// are not Material Cost and not Labour Cost. Posts to the existing, previously-unused Site
// Expense account (5200) — an account that already existed in the chart of accounts with nothing
// ever posting to it.
function recordProjectExpense({projectId, category, amount, description, date, bankAccountId, actor, overrideReason}){
  { const _a = assertCanRecordProjectExpense(actor, projectId); if(!_a.ok) return _a; }
  if(!projectId || !DB.projects.find(p=>p.id===projectId)) return {ok:false, error:'A valid project is required.'};
  // Phase 33 Part D — closed-project gate.
  { const _po = assertProjectOpenForPosting(projectId, actor, {overrideReason, action:'record a project expense'}); if(!_po.ok) return _po; }
  const value = r2(+amount||0);
  if(value<=0) return {ok:false, error:'Amount must be positive.'};
  if(!category) return {ok:false, error:'A category is required.'};
  let bankGlAccount = '1000';
  if(bankAccountId){
    const acct = DB.bankAccounts.find(b=>b.id===bankAccountId);
    if(!acct) return {ok:false, error:`Unknown bank/cash account "${bankAccountId}".`};
    bankGlAccount = acct.glAccount;
  }
  // Phase 36 Part C — same defect class/fix as recordLabourWages() above; jesLen captured before GL.
  const _pexpJesLen = DB.journalEntries.length, _pexpDocLen = DB.projectExpenses.length;
  // Phase 12 P1 fix (Phase 11 §9 finding): overrideReason was accepted and forwarded to the
  // closed-PROJECT gate above, but never to postJournalEntry() — so the closed-FINANCIAL-PERIOD
  // override (a separate, later gate inside postJournalEntry itself) could never succeed through
  // this endpoint no matter the role or reason supplied. createMaterialIssue()'s equivalent call
  // already forwards it correctly; this now matches that existing, proven pattern exactly — no
  // change to the general period-control architecture itself.
  const glResult = postJournalEntry({ date:date||new Date().toISOString().slice(0,10), narration:`Project Expense — ${category}${description?': '+description:''}`,
    sourceType:'ProjectExpense', voucherNo:nextDocNumber('PEXP', date), docCategory:'ProjectExpense',
    lines:[ {account:'5200', debit:value, credit:0, projectId}, {account:bankGlAccount, debit:0, credit:value, projectId} ],
    actor, capability:'PROJECT_EXPENSE', capabilityCtx:{projectId}, overrideReason });
  if(!glResult.ok) return glResult;
  try {
    _fault('EXPENSE_AFTER_GL_BEFORE_DOC'); // Phase 36 Part C
    _crashFault('EXPENSE_CRASH_AFTER_GL_BEFORE_DOC'); // Phase 37 Part E
    const rec = { id:nextId(DB.projectExpenses, 'PEXP-', 4), projectId, category, amount:value, description:description||'',
      date:date||new Date().toISOString().slice(0,10), glEntryId:glResult.entry.id, createdBy:actor.id, createdAt:nowIso() };
    DB.projectExpenses.push(rec); save();
    _crashFault('EXPENSE_CRASH_AFTER_SAVE'); // Phase 37 Part E — the "should be durable" baseline point
    logAudit({type:'ProjectExpenseRecorded', expenseId:rec.id, projectId, category, value, userId:actor.id, role:actor.role});
    return {ok:true, expense:rec, glEntry:glResult.entry};
  } catch(e) {
    DB.journalEntries.length = _pexpJesLen;
    DB.projectExpenses.length = _pexpDocLen;
    save();
    logAudit({type:'ProjectExpenseRolledBackOnFailure', projectId, category, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}
// QC Dashboard — read-only aggregation over the EXISTING QC Checklist data (Phase 8). No new data.
function qcDashboard(){
  const byProject = {};
  DB.qcChecklists.forEach(c=>{
    if(!byProject[c.projectId]) byProject[c.projectId] = {projectId:c.projectId, total:0, passed:0, failed:0, pending:0};
    const b = byProject[c.projectId]; b.total++;
    if(c.result==='Pass') b.passed++; else if(c.result==='Fail') b.failed++; else b.pending++;
  });
  const rows = Object.values(byProject).map(b=>({...b, passRatePct: b.total>0 ? r2(100*b.passed/b.total) : null}));
  const totals = rows.reduce((s,r)=>({total:s.total+r.total, passed:s.passed+r.passed, failed:s.failed+r.failed, pending:s.pending+r.pending}), {total:0,passed:0,failed:0,pending:0});
  return { byProject: rows, totals: {...totals, passRatePct: totals.total>0 ? r2(100*totals.passed/totals.total) : null} };
}
// Project Timesheet — pure operational record-keeping (who worked on what, when, for how long).
// Deliberately does NOT post to the GL on its own — Labour & Wages above is the accounting event;
// a timesheet is a separate, informational record (matches the offline ERP's own separation of
// "Project Timesheet" from "Labour & Wages" as two distinct sidebar items).
function createTimesheetEntry({projectId, workerName, date, hours, task, actor}){
  if(!projectId || !DB.projects.find(p=>p.id===projectId)) return {ok:false, error:'A valid project is required.'};
  if(!workerName) return {ok:false, error:'Worker name is required.'};
  if(!hours || +hours<=0 || +hours>24) return {ok:false, error:'Hours must be between 0 and 24.'};
  const entry = { id:'TS-'+String(DB.timesheetEntries.length+1).padStart(5,'0'), projectId, workerName, date:date||new Date().toISOString().slice(0,10),
    hours:+hours, task:task||'', createdBy:actor.id, createdAt:nowIso() };
  DB.timesheetEntries.push(entry); save();
  logAudit({type:'TimesheetEntryCreated', entryId:entry.id, projectId, workerName, hours:+hours, userId:actor.id, role:actor.role});
  return {ok:true, entry};
}
// Tasks — a simple project task list. No accounting impact; pure operational tracking.
const TASK_STATUSES = ['Open','InProgress','Done','Cancelled'];
function createTask({projectId, title, assignedTo, dueDate, priority, actor}){
  if(!projectId || !DB.projects.find(p=>p.id===projectId)) return {ok:false, error:'A valid project is required.'};
  if(!title) return {ok:false, error:'A title is required.'};
  const task = { id:'TASK-'+String(DB.tasks.length+1).padStart(5,'0'), projectId, title, assignedTo:assignedTo||null, dueDate:dueDate||null,
    priority:priority||'Normal', status:'Open', createdBy:actor.id, createdAt:nowIso(), history:[{action:'Created', userId:actor.id, role:actor.role, at:nowIso()}] };
  DB.tasks.push(task); save();
  logAudit({type:'TaskCreated', taskId:task.id, projectId, title, userId:actor.id, role:actor.role});
  return {ok:true, task};
}
function updateTaskStatus({id, status, actor}){
  const task = DB.tasks.find(t=>t.id===id);
  if(!task) return {ok:false, error:'Task not found.'};
  if(!TASK_STATUSES.includes(status)) return {ok:false, error:`Status must be one of: ${TASK_STATUSES.join(', ')}.`};
  task.status = status; task.history.push({action:'StatusChanged', status, userId:actor.id, role:actor.role, at:nowIso()}); save();
  logAudit({type:'TaskStatusChanged', taskId:task.id, status, userId:actor.id, role:actor.role});
  return {ok:true, task};
}
// Risk Register — project risk tracking with a computed severity, same "compute, don't hand-type"
// discipline the Lab already applies elsewhere (e.g. commitment remaining amounts).
function riskSeverity(likelihood, impact){
  const score = (+likelihood||0)*(+impact||0);
  if(score>=15) return 'Critical'; if(score>=9) return 'High'; if(score>=4) return 'Medium'; return 'Low';
}
function createRiskEntry({projectId, description, likelihood, impact, mitigation, owner, actor}){
  if(!projectId || !DB.projects.find(p=>p.id===projectId)) return {ok:false, error:'A valid project is required.'};
  if(!description) return {ok:false, error:'A description is required.'};
  const lk = Math.min(5, Math.max(1, +likelihood||1)), im = Math.min(5, Math.max(1, +impact||1));
  const risk = { id:'RISK-'+String(DB.riskRegister.length+1).padStart(4,'0'), projectId, description, likelihood:lk, impact:im,
    severity: riskSeverity(lk,im), mitigation:mitigation||'', owner:owner||null, status:'Open', createdBy:actor.id, createdAt:nowIso() };
  DB.riskRegister.push(risk); save();
  logAudit({type:'RiskEntryCreated', riskId:risk.id, projectId, severity:risk.severity, userId:actor.id, role:actor.role});
  return {ok:true, risk};
}
function closeRiskEntry({id, actor}){
  const risk = DB.riskRegister.find(r=>r.id===id);
  if(!risk) return {ok:false, error:'Risk entry not found.'};
  risk.status = 'Closed'; risk.closedBy = actor.id; risk.closedAt = nowIso(); save();
  logAudit({type:'RiskEntryClosed', riskId:risk.id, userId:actor.id, role:actor.role});
  return {ok:true, risk};
}
// Weekly Scorecard — a POINT-IN-TIME snapshot, not a live-recomputed view. A scorecard's whole
// purpose is comparing THIS week's frozen numbers against LAST week's frozen numbers — a live
// query would just show "now" twice. Snapshot capture is an explicit, audited action (Admin/
// FinanceManager/CEO), not automatic, so nobody's numbers get silently overwritten by activity
// that happens after the week the snapshot was meant to represent.
function captureWeeklySnapshot({actor}){
  const projects = DB.projects.filter(p=>p.status==='ACTIVE' || p.status==='Won');
  let totalRevenue=0, totalCost=0;
  projects.forEach(p=>{ const pl = projectPL(p.id); totalRevenue += pl.revenue||0; totalCost += pl.cost||0; });
  const {totalRemaining} = projectCommitments(null);
  const arOpen = r2(DB.customers.reduce((s,c)=>s+customerOpenItems(c.id).reduce((s2,i)=>s2+i.open,0),0));
  const apOpen = r2(DB.vendors.reduce((s,v)=>s+supplierOpenItems(v.id).reduce((s2,i)=>s2+i.open,0),0));
  const snap = { id:'WSC-'+String(DB.weeklySnapshots.length+1).padStart(4,'0'), capturedAt:nowIso(), capturedBy:actor.id,
    activeProjects:projects.length, totalRevenue:r2(totalRevenue), totalCost:r2(totalCost), totalProfit:r2(totalRevenue-totalCost),
    marginPct: totalRevenue>0 ? r2(100*(totalRevenue-totalCost)/totalRevenue) : null, openCommitments:totalRemaining, arOpen, apOpen };
  DB.weeklySnapshots.push(snap); save();
  logAudit({type:'WeeklySnapshotCaptured', snapshotId:snap.id, userId:actor.id, role:actor.role});
  return {ok:true, snapshot:snap};
}

// ---------- Committed / Received / Invoiced / Paid / Consumed — kept as 5 distinct numbers (§32) ----------
function projectCostBreakdown(projectId){
  const pos = DB.purchaseOrders.filter(p=>p.projectId===projectId && ['Approved','PartiallyReceived','FullyReceived'].includes(p.status));
  const committed = pos.reduce((s,po)=>{
    const orderedValue = po.total;
    const invoicedQtyValue = po.lines.reduce((s2,l,idx)=>s2 + (po.qtyInvoicedByLine?.[idx]||0)*l.rate, 0);
    return s + Math.max(orderedValue - invoicedQtyValue, 0); // remaining open commitment
  }, 0);
  // Phase 37 CRITICAL FIX — a reversed GRN was still counted here forever (this "received" figure
  // read raw GRN lines directly, with no reversed-flag check at all), even after its GL posting
  // had been correctly reversed elsewhere. Excluding g.reversed keeps this in agreement with the
  // GL-netted committed/invoiced/consumed figures below, instead of being the one stale exception.
  const received = DB.grns.filter(g=>g.projectId===projectId && !g.reversed).reduce((s,g)=>s+g.lines.reduce((s2,l)=>s2+(+l.qtyAccepted||0)*(+l.rate||0),0), 0);
  // Phase 16 §13 — netted credit-debit: a reversed Supplier Invoice would otherwise still count
  // as "invoiced" in the Committed/Received/Invoiced/Paid/Consumed breakdown forever.
  const invoiced = DB.journalEntries.filter(je=>je.docCategory==='SupplierInvoice' && je.lines.some(l=>l.projectId===projectId))
    .flatMap(je=>je.lines).filter(l=>l.projectId===projectId && l.account==='2000').reduce((s,l)=>s+l.credit-l.debit,0);
  // Phase 7 PERFORMANCE FIX — profiled live: this line was DB.journalEntries.find() PER clearing
  // (a linear scan of up to 1533 entries), redone for every one of the ~245 projects in the
  // accumulated fixture dataset — 2.73ms of this function's 3.64ms average (75%). _jeById() below
  // is the SAME request-scoped, save()-invalidated memoization pattern already used for
  // customerOpenItems()/allLines() — one O(n) Map build instead of an O(n) scan per clearing per
  // project. Output is unchanged: same lookup, same result, just not repeated from scratch.
  const jeById = _jeById();
  const paid = DB.clearings.filter(c=>c.type==='AP').filter(c=>{ const inv=jeById.get(c.invoiceEntryId); return inv && inv.lines.some(l=>l.projectId===projectId); }).reduce((s,c)=>s+c.amount,0);
  // DEFECT FOUND & FIXED (Phase 16 §13 Reconciliation Gate): summed .debit only, never netting
  // .credit — a reversed Material Issue (whose reversal entry carries the SAME docCategory,
  // 'MaterialIssue', with debit/credit flipped) was silently still counted at its full original
  // value. Net debit-minus-credit correctly cancels a reversal to zero, exactly as the underlying
  // GL balance already does.
  const consumed = DB.journalEntries.filter(je=>je.docCategory==='MaterialIssue' && je.lines.some(l=>l.projectId===projectId))
    .flatMap(je=>je.lines).filter(l=>l.projectId===projectId && l.account==='5000').reduce((s,l)=>s+l.debit-l.credit,0);
  return {projectId, committed, received, invoiced, paid, consumed};
}

// ---------- BOM (versioned, never overwritten) ----------
// BOM Governance phase — lifecycle extended from the original 2-state (Draft/Approved) to a real
// maker-checker flow (Draft -> Submitted -> Approved/Rejected, plus Superseded when a later version
// of the SAME project+site+description scope is approved). Every existing field is preserved
// byte-for-byte; only new fields were added (siteId, submittedBy/At, approvedAt, rejectedBy/At/
// rejectReason, supersededBy/At) — no field was renamed, so every pre-existing caller (Production
// Order module, materialBomQuota()) keeps working unchanged.
const BOM_STATUSES = ['Draft','Submitted','Approved','Rejected','Superseded'];
// Project Variation Phase 2 — optional traceability only, per §7: a BOM MAY be tagged with the
// Approved Change Request that authorized its scope. Deliberately just ONE new field, not three:
// quotationRevisionId/costingVersionId are both reachable from a Change Request's own quotationId
// (quotationId -> quotation.costingVersionId), so storing them a second time on the BOM as well
// would duplicate information that can drift out of sync with its own source — see the note above
// createChangeRequest(). Requiring the CR be 'Approved' (not merely existing) mirrors the
// excessBillingApprovalId precedent (postDraft() requires status==='Approved' before consuming one)
// — a BOM should not be attributable to a variation that was never actually approved.
// Project Variation Phase 5 — generalized (docLabel param) so the SAME validation function backs
// both BOM.changeRequestId (Phase 2) and PurchaseOrder.changeRequestId (this phase) — one rule, one
// place, not a second copy that could drift. `assertBomChangeRequestLink` kept as the exported name
// (existing callers/tests use it) — it is now a thin, backward-compatible wrapper.
function assertDocumentChangeRequestLink(changeRequestId, projectId, docLabel){
  if(!changeRequestId) return {ok:true};
  const cr = DB.changeRequests.find(x=>x.id===changeRequestId);
  if(!cr) return {ok:false, error:`Change Request "${changeRequestId}" does not exist.`};
  if(cr.status!=='Approved') return {ok:false, error:`Change Request "${changeRequestId}" is "${cr.status}", not Approved — a ${docLabel} cannot be attributed to a variation that has not been approved.`};
  if(cr.projectId!==projectId) return {ok:false, error:`Change Request "${changeRequestId}" belongs to project "${cr.projectId}" — cannot attribute a ${docLabel} in project "${projectId}" to another project's variation.`};
  return {ok:true};
}
function assertBomChangeRequestLink(changeRequestId, projectId){ return assertDocumentChangeRequestLink(changeRequestId, projectId, 'BOM'); }
function assertPoChangeRequestLink(changeRequestId, projectId){ return assertDocumentChangeRequestLink(changeRequestId, projectId, 'PO'); }
function createBOM({projectId, siteId, description, lines, changeRequestId, actor}){
  if(!DB.projects.find(p=>p.id===projectId)) return {ok:false, error:'Project not found.'};
  if(siteId && !DB.sites.find(s=>s.id===siteId)) return {ok:false, error:'Site not found.'};
  if(!Array.isArray(lines) || !lines.length) return {ok:false, error:'A BOM must have at least one line.'};
  { const _cr = assertBomChangeRequestLink(changeRequestId, projectId); if(!_cr.ok) return _cr; }
  // Project Variation Phase 7 — DISABLED by default (DB.variationTaggingPolicy.bomRequireCR===false
  // for every existing installation). Real, tested enforcement (see the report's §C live proof), not
  // a UI-only restriction — but inert unless a future authorized decision turns this flag on.
  if(DB.variationTaggingPolicy && DB.variationTaggingPolicy.bomRequireCR && !changeRequestId){
    return {ok:false, error:'Policy requires every BOM to reference an Approved Change Request (DB.variationTaggingPolicy.bomRequireCR is enabled) — none was supplied.'};
  }
  for(const l of lines){
    if(!l.materialId || !DB.materials.find(m=>m.id===l.materialId)) return {ok:false, error:`Unknown material "${l.materialId}" on a BOM line.`};
    { const v = assertPositiveFiniteNumber(l.qty, `Approved quantity for ${l.materialId}`); if(!v.ok) return v; }
    if(l.scrapPct!==undefined && l.scrapPct!==null && l.scrapPct!==''){
      const sp = +l.scrapPct;
      if(!Number.isFinite(sp) || sp<0 || sp>100) return {ok:false, error:`Wastage % for ${l.materialId} must be between 0 and 100.`};
    }
  }
  const prior = DB.boms.filter(b=>b.projectId===projectId && (b.siteId||null)===(siteId||null) && b.description===description);
  // P0-4 FIX — this used to be 'BOM-'+String(DB.boms.length+1).padStart(4,'0'), the exact unsafe
  // length-based idiom the multi-phase ID-hardening campaign eliminated everywhere else (a gap
  // from a historical deletion, or a restored/imported record, would silently re-mint a colliding
  // ID). Now uses the SAME centralized, collision-safe nextId()/maxIdSuffix() mechanism as every
  // other document type in this file — no second numbering algorithm invented. docNo is a genuine,
  // human-readable, FY-scoped document number (nextDocNumber()), the same series-numbering
  // mechanism used by every other document type — but BOM is NOT a GL posting document: creating
  // or approving a BOM has zero GL/inventory effect (unchanged), and this docNo carries no
  // financial meaning of its own, purely a traceable document identifier alongside the internal id.
  const bom = { id: nextId(DB.boms, 'BOM-', 4), docNo: nextDocNumber('BOM'), projectId, siteId:siteId||null, description, version:prior.length+1,
    lines:(lines||[]).map(l=>({materialId:l.materialId, qty:+l.qty, uom:l.uom||(DB.materials.find(m=>m.id===l.materialId)||{}).uom||null, scrapPct:+l.scrapPct||0})),
    effectiveDate:new Date().toISOString().slice(0,10), status:'Draft', changeRequestId:changeRequestId||null,
    createdBy:actor.id, createdAt:nowIso(), submittedBy:null, submittedAt:null,
    approvedBy:null, approvedAt:null, rejectedBy:null, rejectedAt:null, rejectReason:null,
    supersededBy:null, supersededAt:null };
  DB.boms.push(bom); save();
  logAudit({type:'BOMCreated', bomId:bom.id, projectId, siteId:siteId||null, version:bom.version, changeRequestId:bom.changeRequestId, userId:actor.id, role:actor.role});
  // Project Variation Phase 5 — distinct, additional event when this BOM is actually variation-
  // tagged (never fabricated for an untagged, baseline BOM — see the report's explicit distinction).
  if(bom.changeRequestId){
    logAudit({type:'VariationBOMCreated', changeRequestId:bom.changeRequestId, projectId, bomId:bom.id, version:bom.version, userId:actor.id, role:actor.role});
  }
  return {ok:true, bom};
}
function submitBOM({id, actor}){
  const b = DB.boms.find(x=>x.id===id);
  if(!b) return {ok:false, error:'BOM not found.'};
  if(b.status!=='Draft') return {ok:false, error:`Cannot submit — "${b.status}", not Draft.`};
  if(!['Admin','CEO','Estimator'].includes(actor.role)) return {ok:false, error:`Role "${actor.role}" cannot submit a BOM for approval.`};
  b.status='Submitted'; b.submittedBy=actor.id; b.submittedAt=nowIso(); save();
  logAudit({type:'BOMSubmitted', bomId:id, projectId:b.projectId, siteId:b.siteId, version:b.version, userId:actor.id, role:actor.role});
  return {ok:true, bom:b};
}
function approveBOM({id, actor}){
  const b = DB.boms.find(x=>x.id===id);
  if(!b) return {ok:false, error:'BOM not found.'};
  if(b.status==='Approved') return {ok:false, error:'Already Approved — create a new version instead of overwriting.'};
  if(b.status!=='Submitted') return {ok:false, error:`Cannot approve — "${b.status}" — a BOM must be Submitted before it can be approved.`};
  if(!can(actor,'approve')) return {ok:false, error:`Role "${actor.role}" cannot approve BOMs.`};
  // Segregation of duties — same convention as every other create/approve pair in this codebase
  // (Purchase Requisition, Purchase Order, Payment Request, etc.): the creator cannot also approve,
  // except CEO/Admin who are already exempted from this rule everywhere else in the system.
  if(b.createdBy===actor.id && !['CEO','Admin'].includes(actor.role)) return {ok:false, error:'Segregation of duties: BOM creator cannot also be BOM approver.'};
  // Supersession — an approved BOM already covering the SAME project+site+description scope is not
  // silently overwritten (it remains a permanent, unmodified historical record — every Material Issue
  // and Excess Request already posted against it keeps referencing exactly that bomId/version) — it is
  // explicitly marked Superseded, with an audited note of how much had already been consumed against
  // it at the moment of supersession, so a revision after real consumption is never silent.
  const priorActive = DB.boms.filter(x=>x.id!==b.id && x.projectId===b.projectId && (x.siteId||null)===(b.siteId||null) &&
    x.description===b.description && x.status==='Approved');
  priorActive.forEach(old=>{
    const consumedAgainstOld = r2(DB.inventoryMovements.filter(m=>m.bomId===old.id && m.type==='Issue').reduce((s,m)=>s+m.qty,0));
    old.status='Superseded'; old.supersededBy=b.id; old.supersededAt=nowIso();
    logAudit({type:'BOMSuperseded', bomId:old.id, supersededBy:b.id, projectId:old.projectId, siteId:old.siteId, version:old.version,
      consumedQtyAtSupersession:consumedAgainstOld, userId:actor.id, role:actor.role});
  });
  b.status='Approved'; b.approvedBy=actor.id; b.approvedAt=nowIso(); save();
  logAudit({type:'BOMApproved', bomId:id, projectId:b.projectId, siteId:b.siteId, version:b.version, supersedes:priorActive.map(x=>x.id), userId:actor.id, role:actor.role});
  return {ok:true, bom:b, superseded:priorActive.map(x=>x.id)};
}
function rejectBOM({id, reason, actor}){
  const b = DB.boms.find(x=>x.id===id);
  if(!b) return {ok:false, error:'BOM not found.'};
  if(b.status!=='Submitted') return {ok:false, error:`Cannot reject — "${b.status}", not Submitted.`};
  if(!can(actor,'approve')) return {ok:false, error:`Role "${actor.role}" cannot reject BOMs.`};
  if(!reason || !String(reason).trim()) return {ok:false, error:'A reason is required to reject a BOM.'};
  b.status='Rejected'; b.rejectedBy=actor.id; b.rejectedAt=nowIso(); b.rejectReason=String(reason).trim(); save();
  logAudit({type:'BOMRejected', bomId:id, projectId:b.projectId, siteId:b.siteId, version:b.version, reason, userId:actor.id, role:actor.role});
  return {ok:true, bom:b};
}

// ---------- Project-level BOM Entitlement (ordinary Material Issue) ----------
// BOM Governance phase — the pre-existing materialBomQuota() (kept below, unchanged, still used by
// issueProductionMaterial() and the legacy BOQ Variance report) derives its "budget" from Production
// Order plannedQty — correct for the Factory/MES module, but meaningless for an ordinary interior
// fit-out project that never raises a Production Order (its budget would always compute as 0, which
// is exactly the gap the prior investigation proved live). This function instead reads the approved
// quantity DIRECTLY off the project's own active (status:'Approved') BOM line — no Production Order
// involved — and is what ordinary Material Issue now validates against (see createMaterialIssue()).
function activeBomsFor({projectId, siteId, materialId}){
  const candidates = DB.boms.filter(b=>b.projectId===projectId && b.status==='Approved' &&
    b.lines.some(l=>l.materialId===materialId));
  if(!candidates.length) return [];
  // Prefer a site-specific approved BOM (siteId matches the issue's own siteId) over a project-wide
  // one (siteId:null) — a site-scoped requirement is more specific than the project's general
  // allowance. No per-line site/area/room scoping exists anywhere else in this codebase (Purchase
  // Requisition, MRS, Delivery Challan all scope site at the DOCUMENT level) — this reuses that same
  // existing convention rather than inventing a new area/room concept the rest of the ERP doesn't have.
  const siteMatch = siteId ? candidates.filter(b=>b.siteId===siteId) : [];
  return siteMatch.length ? siteMatch : candidates.filter(b=>!b.siteId);
}
function projectBomEntitlement({projectId, materialId, siteId}){
  const boms = activeBomsFor({projectId, siteId, materialId});
  let approvedQty = 0, wastageQty = 0, inBom = false;
  const bomRefs = [];
  boms.forEach(bom=>{
    bom.lines.filter(l=>l.materialId===materialId).forEach(line=>{
      inBom = true;
      approvedQty = r2(approvedQty + (+line.qty));
      wastageQty = r2(wastageQty + r2((+line.qty) * ((+line.scrapPct||0)/100)));
      bomRefs.push({bomId:bom.id, version:bom.version, siteId:bom.siteId||null});
    });
  });
  const totalAllowed = r2(approvedQty + wastageQty);
  // Same Issue-minus-Return netting policy already established by materialBomQuota() below — a
  // Return against the same project/material/site restores the allowance it consumed. Site-scoped
  // issues (siteId supplied) are netted only against movements at that SAME site, so a site-specific
  // BOM's allowance is never silently drained by an unrelated warehouse-level issue.
  const usedQty = r2(DB.inventoryMovements.filter(m=>m.projectId===projectId && m.materialId===materialId &&
      (siteId ? m.siteId===siteId : !m.siteId))
    .reduce((s,m)=>{
      if(m.type==='Issue' || m.type==='SiteConsumption') return s+m.qty;
      if(m.type==='Return') return s-m.qty;
      return s;
    },0));
  const remainingQty = r2(totalAllowed - usedQty);
  return { projectId, materialId, siteId:siteId||null, inBom, bomRefs, approvedQty, wastageQty, totalAllowed, usedQty, remainingQty };
}

// ---------- Excess Material Issue Approval (genuine second-person maker-checker) ----------
// BOM Governance phase — replaces the old self-service `overrideReason` bypass that used to live
// inside createMaterialIssue()'s BOM-quota block (proven live, in the prior investigation, to let a
// non-manager self-authorize an unlimited excess by typing any sentence). The `overrideReason`
// parameter itself is untouched and still used, unchanged, for the SEPARATE closed-project-posting
// override in assertProjectOpenForPosting() above — that control is not affected by this change. An
// excess quantity must now be raised as its own request, then approved by someone OTHER than the
// requester who holds the 'approve' capability (Admin/CEO/FinanceManager — the same tier already used
// everywhere else in this codebase for a genuine second-person sign-off) before ANY part of the excess
// can post — see the gate inside createMaterialIssue() below.
function assertCanApproveExcessMaterialIssue(actor){ return can(actor,'approve') ? {ok:true} : {ok:false, error:`Role "${actor.role}" cannot approve an Excess Material Issue request.`}; }
function createExcessMaterialIssueRequest({projectId, siteId, materialId, requestedQty, reason, actor}){
  const authz = assertCanCreateMaterialIssue(actor, {projectId, siteId}); if(!authz.ok) return authz;
  if(!DB.projects.find(p=>p.id===projectId)) return {ok:false, error:'Project not found.'};
  const material = DB.materials.find(m=>m.id===materialId);
  if(!material) return {ok:false, error:'Material not found.'};
  { const v = assertPositiveFiniteNumber(requestedQty, 'Requested quantity'); if(!v.ok) return v; }
  if(!reason || !String(reason).trim()) return {ok:false, error:'A reason is required to request an excess Material Issue.'};
  const entitlement = projectBomEntitlement({projectId, materialId, siteId});
  if(+requestedQty <= entitlement.remainingQty + 0.001){
    return {ok:false, error:`Requested quantity (${requestedQty}) is within the remaining BOM entitlement (${entitlement.remainingQty}) — post the Material Issue directly, no excess approval is needed.`};
  }
  // Duplicate-request guard — the same requester asking again for the same project/site/material
  // while their earlier request is still Pending gets that SAME request back, not a second one.
  const dup = DB.excessMaterialIssueRequests.find(x=>x.projectId===projectId && x.materialId===materialId &&
    (x.siteId||null)===(siteId||null) && x.requestedBy===actor.id && x.status==='Pending');
  if(dup) return {ok:true, excessRequest:dup, duplicate:true, note:'An identical request from you is already Pending — reusing it rather than creating a duplicate.'};
  const xmi = { id:nextId(DB.excessMaterialIssueRequests, 'XMI-', 4), docNo:nextDocNumber('XMI'),
    projectId, siteId:siteId||null, materialId, bomRefs:entitlement.bomRefs,
    approvedQty:entitlement.approvedQty, wastageQty:entitlement.wastageQty, totalAllowed:entitlement.totalAllowed,
    previouslyIssuedQty:entitlement.usedQty, remainingQty:entitlement.remainingQty,
    requestedQty:+requestedQty, excessQty:r2(+requestedQty-entitlement.remainingQty), reason:String(reason).trim(),
    requestedBy:actor.id, requestedByRole:actor.role, requestedAt:nowIso(),
    status:'Pending', approvedBy:null, approvedByRole:null, approvedAt:null,
    rejectedBy:null, rejectedAt:null, rejectReason:null, cancelledBy:null, cancelledAt:null,
    consumedQty:0, consumingMovementIds:[] };
  DB.excessMaterialIssueRequests.push(xmi); save();
  logAudit({type:'ExcessMaterialIssueRequested', xmiId:xmi.id, projectId, siteId:siteId||null, materialId,
    requestedQty:+requestedQty, excessQty:xmi.excessQty, userId:actor.id, role:actor.role});
  return {ok:true, excessRequest:xmi};
}
function approveExcessMaterialIssueRequest({id, actor, overrideReason}){
  const xmi = DB.excessMaterialIssueRequests.find(x=>x.id===id);
  if(!xmi) return {ok:false, error:'Excess Material Issue request not found.'};
  if(xmi.status!=='Pending') return {ok:false, error:`Cannot approve — status is "${xmi.status}", not Pending.`};
  const authz = assertCanApproveExcessMaterialIssue(actor); if(!authz.ok) return authz;
  // Unconditional — deliberately NO Admin/CEO self-approval exemption here, unlike this codebase's
  // usual SoD convention (PR/PO/Payment Request, etc. all exempt CEO/Admin). This is the exact control
  // the prior investigation found broken (a requester self-authorizing by typing a reason) — the fix
  // must not reintroduce self-approval in any form, for any role.
  if(xmi.requestedBy===actor.id) return {ok:false, error:'Segregation of duties: the requester cannot approve their own Excess Material Issue request.'};
  // Same closed-project convention as every other posting-adjacent action in this codebase (see
  // assertProjectOpenForPosting's own header comment) — CLOSED blocks by default, CEO/Admin may
  // override with a mandatory, audited reason, same as everywhere else. Not a new absolute rule.
  const po = assertProjectOpenForPosting(xmi.projectId, actor, {overrideReason, action:'approve an Excess Material Issue request'});
  if(!po.ok) return po;
  // Re-validate against CURRENT entitlement, not the numbers captured at request time — a BOM
  // revision approved after the request was raised must invalidate a now-stale approval.
  const fresh = projectBomEntitlement({projectId:xmi.projectId, materialId:xmi.materialId, siteId:xmi.siteId});
  const freshBomIds = new Set(fresh.bomRefs.map(r=>r.bomId));
  const requestBomIds = new Set((xmi.bomRefs||[]).map(r=>r.bomId));
  const sameBom = freshBomIds.size===requestBomIds.size && [...freshBomIds].every(bid=>requestBomIds.has(bid));
  if(!sameBom){
    return {ok:false, error:'The BOM this request was raised against has since been revised (a new version was approved) — the original figures are stale. Reject this request and ask the requester to raise a new one against the current BOM.', staleBom:true, currentEntitlement:fresh};
  }
  xmi.status='Approved'; xmi.approvedBy=actor.id; xmi.approvedByRole=actor.role; xmi.approvedAt=nowIso(); save();
  logAudit({type:'ExcessMaterialIssueApproved', xmiId:xmi.id, projectId:xmi.projectId, materialId:xmi.materialId,
    requestedQty:xmi.requestedQty, excessQty:xmi.excessQty, userId:actor.id, role:actor.role});
  return {ok:true, excessRequest:xmi};
}
function rejectExcessMaterialIssueRequest({id, reason, actor}){
  const xmi = DB.excessMaterialIssueRequests.find(x=>x.id===id);
  if(!xmi) return {ok:false, error:'Excess Material Issue request not found.'};
  if(xmi.status!=='Pending') return {ok:false, error:`Cannot reject — status is "${xmi.status}", not Pending.`};
  const authz = assertCanApproveExcessMaterialIssue(actor); if(!authz.ok) return authz;
  if(xmi.requestedBy===actor.id) return {ok:false, error:'Segregation of duties: the requester cannot decide on their own Excess Material Issue request — ask another authorized approver, or Cancel it instead.'};
  xmi.status='Rejected'; xmi.rejectedBy=actor.id; xmi.rejectedAt=nowIso(); xmi.rejectReason=reason||''; save();
  logAudit({type:'ExcessMaterialIssueRejected', xmiId:xmi.id, projectId:xmi.projectId, materialId:xmi.materialId, reason, userId:actor.id, role:actor.role});
  return {ok:true, excessRequest:xmi};
}
function cancelExcessMaterialIssueRequest({id, actor}){
  const xmi = DB.excessMaterialIssueRequests.find(x=>x.id===id);
  if(!xmi) return {ok:false, error:'Excess Material Issue request not found.'};
  if(xmi.status!=='Pending') return {ok:false, error:`Cannot cancel — status is "${xmi.status}", not Pending.`};
  if(xmi.requestedBy!==actor.id && !['Admin','CEO'].includes(actor.role)) return {ok:false, error:'Only the original requester (or Admin/CEO) may cancel this request.'};
  xmi.status='Cancelled'; xmi.cancelledBy=actor.id; xmi.cancelledAt=nowIso(); save();
  logAudit({type:'ExcessMaterialIssueCancelled', xmiId:xmi.id, projectId:xmi.projectId, materialId:xmi.materialId, userId:actor.id, role:actor.role});
  return {ok:true, excessRequest:xmi};
}
// ---------- BOM Consumption Report (project-scoped, entitlement-based — NOT Production-Order-derived) ----------
function bomConsumptionReport(projectId){
  if(!projectId || !DB.projects.find(p=>p.id===projectId)) return {ok:false, error:'A valid project is required.'};
  const boms = DB.boms.filter(b=>b.projectId===projectId && b.status==='Approved');
  const seen = new Set();
  const lines = [];
  boms.forEach(bom=>{
    bom.lines.forEach(line=>{
      const key = line.materialId+'|'+(bom.siteId||'');
      if(seen.has(key)) return; // already summed across all matching BOMs by projectBomEntitlement itself
      seen.add(key);
      const ent = projectBomEntitlement({projectId, materialId:line.materialId, siteId:bom.siteId});
      const material = DB.materials.find(m=>m.id===line.materialId);
      const approvedExcess = r2(DB.excessMaterialIssueRequests.filter(x=>x.projectId===projectId && x.materialId===line.materialId &&
        (x.siteId||null)===(bom.siteId||null) && x.status==='Approved').reduce((s,x)=>s+x.consumedQty,0));
      const pendingExcess = r2(DB.excessMaterialIssueRequests.filter(x=>x.projectId===projectId && x.materialId===line.materialId &&
        (x.siteId||null)===(bom.siteId||null) && x.status==='Pending').reduce((s,x)=>s+x.requestedQty,0));
      const returned = r2(DB.inventoryMovements.filter(m=>m.projectId===projectId && m.materialId===line.materialId &&
        (bom.siteId ? m.siteId===bom.siteId : !m.siteId) && m.type==='Return').reduce((s,m)=>s+m.qty,0));
      lines.push({ projectId, siteId:bom.siteId||null, materialId:line.materialId, description:material?material.description:line.materialId,
        bomId:bom.id, bomVersion:bom.version, approvedQty:ent.approvedQty, wastageQty:ent.wastageQty, totalAllowed:ent.totalAllowed,
        issuedQty:ent.usedQty, remainingQty:ent.remainingQty, approvedExcessQty:approvedExcess, unapprovedExcessQty:0,
        pendingExcessRequestQty:pendingExcess, returnedQty:returned,
        variance:r2(ent.usedQty-ent.totalAllowed), variancePct: ent.totalAllowed>0 ? r2(100*ent.usedQty/ent.totalAllowed) : null });
    });
  });
  return { ok:true, projectId, lines,
    note:'unapprovedExcessQty is always 0 by construction — since this phase, no Material Issue can post beyond the remaining BOM entitlement without a genuinely approved Excess Material Issue request first, so an "unapproved excess" quantity in the ledger is now structurally impossible, not merely policed after the fact.' };
}

// ---------- Production Order foundation (§28 — not the full factory ERP) ----------
function createProductionOrder({projectId, bomId, plannedQty, actor}){
  const bom = DB.boms.find(x=>x.id===bomId);
  if(!bom || bom.status!=='Approved') return {ok:false, error:'BOM must exist and be Approved.'};
  // ERP AUDIT FIX (ERP-045, Critical) — the BOM's own project ownership was never checked: only
  // that SOME BOM existed and was Approved, not that it belonged to THIS production order's
  // project. Live-proven: an Approved BOM created for Project B could be assigned to a Production
  // Order for Project A, silently mixing one project's bill-of-materials (and its cost/BOM-quota
  // consumption downstream) into an unrelated project's production.
  if(bom.projectId!==projectId) return {ok:false, error:`BOM "${bomId}" belongs to project "${bom.projectId}", not "${projectId}" — a Production Order's BOM must belong to the same project.`};
  // ERP AUDIT FIX (ERP-027, Critical) — plannedQty was coerced with a bare `+plannedQty` and
  // never validated: negative, zero, non-numeric, NaN and Infinity all passed through and were
  // persisted as the order's planned quantity, live-proven by the audit. Uses the same central
  // validator as every other numeric fix this pass.
  const _pqChk = assertPositiveFiniteNumber(plannedQty, 'Planned quantity');
  if(!_pqChk.ok) return _pqChk;
  const po = { id:'PROD-'+String(DB.productionOrders.length+1).padStart(4,'0'), prodNo:nextDocNumber('PROD'), projectId, bomId,
    plannedQty:_pqChk.value, actualQty:0, status:'Released', materialIssues:[], labourCostEntries:[], createdBy:actor.id, createdAt:nowIso() };
  DB.productionOrders.push(po); save();
  logAudit({type:'ProductionOrderCreated', productionOrderId:po.id, projectId, bomId, plannedQty, userId:actor.id, role:actor.role});
  return {ok:true, productionOrder:po};
}
function issueProductionMaterial({productionOrderId, warehouseId, actor}){
  const prod = DB.productionOrders.find(x=>x.id===productionOrderId);
  if(!prod) return {ok:false, error:'Production Order not found.'};
  if(['Cancelled','Closed'].includes(prod.status)) return {ok:false, error:`Cannot issue material for a "${prod.status}" production order.`};
  const bom = DB.boms.find(x=>x.id===prod.bomId);
  const results = [];
  // Phase 43 CRITICAL FIX — found via call-graph analysis: this legacy-routed function calls
  // createMaterialIssue() (which itself posts GL/inventory) with no active transaction boundary —
  // PROVEN LIVE to be completely non-functional under Phase 38's enforce-mode write-point guard
  // (every real attempt threw "ARCHITECTURAL VIOLATION... DB.journalEntries.push() called outside
  // any active transaction boundary"). Wrapped PER LINE, not around the whole function, to
  // deliberately preserve the existing, disclosed "stop on first failure, keep prior successes"
  // behavior (the comment below) — an all-or-nothing wrap around the entire loop would silently
  // change accepted partial-BOM-issue business behavior, which this fix does not do.
  for(const line of bom.lines){
    const qty = (+line.qty) * prod.plannedQty * (1 + (+line.scrapPct||0)/100);
    const r = withTransaction(actor, {name:'issueProductionMaterial:line'}, () =>
      createMaterialIssue({projectId:prod.projectId, materialId:line.materialId, qty, warehouseId, purpose:`Production Order ${prod.prodNo}`, actor, sourceType:'ProductionOrder', sourceId:prod.id}));
    if(!r.ok) return r; // stop on first failure (e.g. insufficient stock) — do not partially consume silently
    results.push(r);
    prod.materialIssues.push(r.movement.id);
  }
  if(prod.status==='Released') prod.status='InProgress';
  save();
  return {ok:true, issues:results};
}
function holdProductionOrder({id, reason, actor}){
  const prod = DB.productionOrders.find(x=>x.id===id);
  if(!prod) return {ok:false, error:'Production Order not found.'};
  if(['Completed','Closed','Cancelled'].includes(prod.status)) return {ok:false, error:`Cannot hold a "${prod.status}" production order.`};
  prod.status='OnHold'; prod.holdReason=reason||''; save();
  return {ok:true, productionOrder:prod};
}
function resumeProductionOrder({id, actor}){
  const prod = DB.productionOrders.find(x=>x.id===id);
  if(!prod) return {ok:false, error:'Production Order not found.'};
  if(prod.status!=='OnHold') return {ok:false, error:`Cannot resume — "${prod.status}", not OnHold.`};
  prod.status = prod.materialIssues.length ? 'InProgress' : 'Released'; save();
  return {ok:true, productionOrder:prod};
}
function cancelProductionOrder({id, reason, actor}){
  const prod = DB.productionOrders.find(x=>x.id===id);
  if(!prod) return {ok:false, error:'Production Order not found.'};
  if(['Completed','Closed'].includes(prod.status)) return {ok:false, error:`Cannot cancel a "${prod.status}" production order — a completed order must be closed, not cancelled.`};
  prod.status='Cancelled'; prod.cancelReason=reason||''; save();
  logAudit({type:'ProductionOrderCancelled', productionOrderId:id, reason, userId:actor.id, role:actor.role});
  return {ok:true, productionOrder:prod};
}
function closeProductionOrder({id, actor}){
  const prod = DB.productionOrders.find(x=>x.id===id);
  if(!prod) return {ok:false, error:'Production Order not found.'};
  if(!['Completed','PartiallyCompleted'].includes(prod.status)) return {ok:false, error:`Cannot close — "${prod.status}" must be Completed or PartiallyCompleted first.`};
  prod.status='Closed'; save();
  return {ok:true, productionOrder:prod};
}
function postProductionLabourCost({productionOrderId, amount, actor, overrideReason}){
  { const _a = assertCanPostProductionLabourCost(actor); if(!_a.ok) return _a; }
  const prod = DB.productionOrders.find(x=>x.id===productionOrderId);
  if(!prod) return {ok:false, error:'Production Order not found.'};
  // Phase 33 (adversarial audit thread) Part D — closed-project gate, via the production order's own project.
  { const _po = assertProjectOpenForPosting(prod.projectId, actor, {overrideReason, action:'post production labour cost'}); if(!_po.ok) return _po; }
  // Phase 15 §2 — tagged with CC-FACTORY so it's now distinguishable from Installation labour
  // (CC-INSTALLATION), both of which previously shared account 5100 with no distinguishing tag.
  const _jesLenBeforePLC = DB.journalEntries.length;
  const result = postJournalEntry({ date:new Date().toISOString().slice(0,10), narration:`Production labour — ${prod.prodNo}`, sourceType:'ProductionLabour', sourceId:prod.id,
    voucherNo:nextDocNumber('JE'), docCategory:'ProductionLabour', branchId:projectBranch(prod.projectId),
    lines:[ {account:'5100', debit:+amount, credit:0, projectId:prod.projectId, costCentreId:'CC-FACTORY'}, {account:'1000', debit:0, credit:+amount, projectId:prod.projectId, costCentreId:'CC-FACTORY'} ],
    actor, capability:'PRODUCTION_LABOUR_COST', overrideReason });
  if(!result.ok) return result;
  // Phase 37 Part B fix — a fault at PROD_LABOUR_AFTER_GL_BEFORE_PUSH previously left the GL entry
  // committed with no corresponding entry in prod.labourCostEntries, permanently orphaning the GL
  // posting from the production order (proven live). Wrapped with the same snapshot/rollback pattern
  // used across Phases 35-37. Also adds the audit trail this function was previously missing entirely.
  try {
    _fault('PROD_LABOUR_AFTER_GL_BEFORE_PUSH');
    prod.labourCostEntries.push(result.entry.id);
    save();
    logAudit({type:'ProductionLabourCostPosted', productionOrderId:prod.id, entryId:result.entry.id, amount:+amount, userId:actor.id, role:actor.role});
    return {ok:true, entry:result.entry};
  } catch(e) {
    DB.journalEntries.length = _jesLenBeforePLC;
    save();
    logAudit({type:'ProductionLabourCostRolledBackOnFailure', productionOrderId:prod.id, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}
function completeProductionOrder({id, actualQty, rejectedQty, actor}){
  const prod = DB.productionOrders.find(x=>x.id===id);
  if(!prod) return {ok:false, error:'Production Order not found.'};
  if(['Cancelled','Closed'].includes(prod.status)) return {ok:false, error:`Cannot complete a "${prod.status}" production order.`};
  // ERP AUDIT FIX (ERP-028, Critical) — actualQty/rejectedQty were coerced with bare `+` and never
  // validated: negative, non-numeric, NaN, Infinity, and quantities wildly exceeding the order's
  // own plannedQty all passed through and were persisted, live-proven by the audit. actualQty must
  // be a genuine, non-negative, finite number; rejectedQty (optional, defaults to 0) the same; and
  // neither may push completion past what this order could ever plausibly have produced — a small
  // tolerance above plannedQty is allowed for real-world overrun, not an unbounded value.
  const _aqChk = assertNonNegativeFiniteNumber(actualQty, 'Actual quantity');
  if(!_aqChk.ok) return _aqChk;
  const _rqChk = assertNonNegativeFiniteNumber(rejectedQty==null || rejectedQty==='' ? 0 : rejectedQty, 'Rejected quantity');
  if(!_rqChk.ok) return _rqChk;
  const _maxPlausible = prod.plannedQty * 1.5 + 0.001; // generous over-production allowance; not a business policy, just an implausibility ceiling
  if(_aqChk.value > _maxPlausible) return {ok:false, error:`Actual quantity ${_aqChk.value} is implausibly far above the planned quantity of ${prod.plannedQty} — check for a data-entry error.`};
  if(_rqChk.value > _aqChk.value + 0.001) return {ok:false, error:`Rejected quantity ${_rqChk.value} cannot exceed actual quantity ${_aqChk.value}.`};
  prod.actualQty = _aqChk.value; prod.rejectedQty = _rqChk.value; prod.acceptedQty = _aqChk.value - _rqChk.value;
  prod.completionDate = new Date().toISOString().slice(0,10); prod.completedBy = actor.id;
  prod.status = (_aqChk.value >= prod.plannedQty - 0.001) ? 'Completed' : 'PartiallyCompleted';
  save();
  logAudit({type:'ProductionOrderCompleted', productionOrderId:id, actualQty, rejectedQty, status:prod.status, userId:actor.id, role:actor.role});
  // Finished-goods inventory/accounting is deliberately NOT posted here — §9 explicitly says
  // not to invent that accounting. Production Output is tracked operationally only this phase.
  return {ok:true, productionOrder:prod};
}

// ================== Phase 28 — Factory / MES ==================
// Machines — a simple equipment master. No accounting impact; used for Job Card assignment and
// utilization reporting only.
const MACHINE_STATUSES = ['Available','InUse','Maintenance','Down'];
function createMachine({name, type, actor}){
  if(!name) return {ok:false, error:'Machine name is required.'};
  const m = { id:'MCH-'+String(DB.machines.length+1).padStart(3,'0'), name, type:type||'General', status:'Available', createdBy:actor.id, createdAt:nowIso() };
  DB.machines.push(m); save();
  logAudit({type:'MachineCreated', machineId:m.id, name, userId:actor.id, role:actor.role});
  return {ok:true, machine:m};
}
function setMachineStatus({id, status, actor}){
  const m = DB.machines.find(x=>x.id===id);
  if(!m) return {ok:false, error:'Machine not found.'};
  if(!MACHINE_STATUSES.includes(status)) return {ok:false, error:`Status must be one of: ${MACHINE_STATUSES.join(', ')}.`};
  m.status = status; save();
  logAudit({type:'MachineStatusChanged', machineId:m.id, status, userId:actor.id, role:actor.role});
  return {ok:true, machine:m};
}
// Job Cards — the shop-floor execution unit UNDER a Production Order (an operation performed by a
// worker, optionally on a machine, with a planned date and actual start/end). Purely operational
// — it does not post to the GL itself; the Production Order's own existing material-issue/labour-
// cost mechanisms remain the only cost-bearing events, exactly as before this phase.
const JOB_CARD_STATUSES = ['Planned','InProgress','Completed','Cancelled'];
function createJobCard({productionOrderId, operation, machineId, assignedWorker, plannedDate, actor}){
  const prod = DB.productionOrders.find(x=>x.id===productionOrderId);
  if(!prod) return {ok:false, error:'Production Order not found.'};
  if(!operation) return {ok:false, error:'An operation name is required.'};
  if(machineId && !DB.machines.find(m=>m.id===machineId)) return {ok:false, error:'Unknown machine.'};
  const jc = { id:'JC-'+String(DB.jobCards.length+1).padStart(4,'0'), jcNo:nextDocNumber('JC'), productionOrderId, projectId:prod.projectId, operation,
    machineId:machineId||null, assignedWorker:assignedWorker||null, plannedDate:plannedDate||null, status:'Planned',
    actualStart:null, actualEnd:null, createdBy:actor.id, createdAt:nowIso() };
  DB.jobCards.push(jc); save();
  logAudit({type:'JobCardCreated', jobCardId:jc.id, productionOrderId, operation, userId:actor.id, role:actor.role});
  return {ok:true, jobCard:jc};
}
function startJobCard({id, actor}){
  const jc = DB.jobCards.find(x=>x.id===id);
  if(!jc) return {ok:false, error:'Job Card not found.'};
  if(jc.status!=='Planned') return {ok:false, error:`Cannot start — Job Card is "${jc.status}", not Planned.`};
  jc.status='InProgress'; jc.actualStart=nowIso();
  if(jc.machineId){ const m = DB.machines.find(x=>x.id===jc.machineId); if(m && m.status==='Available') m.status='InUse'; }
  save();
  logAudit({type:'JobCardStarted', jobCardId:jc.id, userId:actor.id, role:actor.role});
  return {ok:true, jobCard:jc};
}
function completeJobCard({id, actor}){
  const jc = DB.jobCards.find(x=>x.id===id);
  if(!jc) return {ok:false, error:'Job Card not found.'};
  if(jc.status!=='InProgress') return {ok:false, error:`Cannot complete — Job Card is "${jc.status}", not InProgress.`};
  jc.status='Completed'; jc.actualEnd=nowIso();
  if(jc.machineId){ const m = DB.machines.find(x=>x.id===jc.machineId); if(m && m.status==='InUse') m.status='Available'; }
  save();
  logAudit({type:'JobCardCompleted', jobCardId:jc.id, userId:actor.id, role:actor.role});
  return {ok:true, jobCard:jc};
}
// Production Schedule — a planned-date view over Production Orders + their Job Cards. Read-only.
function productionSchedule(){
  return DB.productionOrders.filter(p=>!['Cancelled','Closed'].includes(p.status)).map(p=>({
    productionOrderId:p.id, prodNo:p.prodNo, projectId:p.projectId, status:p.status, plannedQty:p.plannedQty,
    jobCards: DB.jobCards.filter(j=>j.productionOrderId===p.id).map(j=>({id:j.id, jcNo:j.jcNo, operation:j.operation, plannedDate:j.plannedDate, status:j.status, assignedWorker:j.assignedWorker, machineId:j.machineId}))
  }));
}
// Factory Dashboard — read-only aggregation over existing Production Orders + new Machines/Job Cards.
function factoryDashboard(){
  const byStatus = {};
  DB.productionOrders.forEach(p=>{ byStatus[p.status] = (byStatus[p.status]||0)+1; });
  const jcByStatus = {};
  DB.jobCards.forEach(j=>{ jcByStatus[j.status] = (jcByStatus[j.status]||0)+1; });
  const machineUtilPct = DB.machines.length ? r2(100*DB.machines.filter(m=>m.status==='InUse').length/DB.machines.length) : null;
  return { productionOrdersByStatus:byStatus, jobCardsByStatus:jcByStatus, totalMachines:DB.machines.length, machineUtilPct, activeMachines:DB.machines.filter(m=>m.status!=='Down') };
}
// Job Analysis — planned vs actual duration per completed Job Card. Read-only.
function jobAnalysis(){
  return DB.jobCards.filter(j=>j.actualStart && j.actualEnd).map(j=>{
    const durationHrs = r2((new Date(j.actualEnd)-new Date(j.actualStart))/3600000);
    return { jobCardId:j.id, jcNo:j.jcNo, productionOrderId:j.productionOrderId, operation:j.operation, plannedDate:j.plannedDate, durationHrs, assignedWorker:j.assignedWorker };
  });
}
// Job Cost Sheet — actual cost of a Production Order, derived ENTIRELY from the data the order
// already tracks on itself (materialIssues[]/labourCostEntries[] — see createProductionOrder/
// issueProductionMaterial/postProductionLabourCost above). No new cost source, no re-derivation.
function jobCostSheet(productionOrderId){
  const prod = DB.productionOrders.find(p=>p.id===productionOrderId);
  if(!prod) return {ok:false, error:'Production Order not found.'};
  const materialCost = r2(prod.materialIssues.reduce((s,mvId)=>{ const mv = DB.inventoryMovements.find(m=>m.id===mvId); return s+(mv?mv.valuationAmount:0); },0));
  const labourCost = r2(prod.labourCostEntries.reduce((s,jeId)=>{ const je = DB.journalEntries.find(e=>e.id===jeId); const line = je?je.lines.find(l=>l.account==='5100'):null; return s+(line?line.debit:0); },0));
  const bom = DB.boms.find(b=>b.id===prod.bomId);
  const plannedMaterialCost = bom ? r2(bom.lines.reduce((s,l)=>{ const mat = DB.materials.find(m=>m.id===l.materialId); return s+((+l.qty)*prod.plannedQty*(1+(+l.scrapPct||0)/100))*(mat?mat.standardCost:0); },0)) : null;
  return { ok:true, productionOrderId, prodNo:prod.prodNo, materialCost, labourCost, totalActualCost:r2(materialCost+labourCost), plannedMaterialCost, plannedQty:prod.plannedQty, actualQty:prod.actualQty||0 };
}
// Product Costing — a STANDARD cost estimate for a BOM (material at standard cost + labour/
// overhead estimated as a disclosed default percentage of material cost, NOT an approved
// Appletree overhead-allocation policy — same "documented, not invented as fact" discipline as
// maxFuturePostingDays and vendorRating's weighting).
const PRODUCT_COSTING_LABOUR_OVERHEAD_PCT = 15; // disclosed default, not an approved policy
function productCosting(bomId){
  const bom = DB.boms.find(b=>b.id===bomId);
  if(!bom) return {ok:false, error:'BOM not found.'};
  const materialCost = r2(bom.lines.reduce((s,l)=>{ const mat = DB.materials.find(m=>m.id===l.materialId); return s+((+l.qty)*(1+(+l.scrapPct||0)/100))*(mat?mat.standardCost:0); },0));
  const labourOverhead = r2(materialCost*PRODUCT_COSTING_LABOUR_OVERHEAD_PCT/100);
  return { ok:true, bomId, description:bom.description, materialCost, labourOverheadPct:PRODUCT_COSTING_LABOUR_OVERHEAD_PCT, labourOverhead, standardUnitCost:r2(materialCost+labourOverhead),
    note:`Labour/overhead is a disclosed ${PRODUCT_COSTING_LABOUR_OVERHEAD_PCT}% default, not an approved Appletree costing policy.` };
}
// Labour Performance — cost/hours per worker, combining Labour & Wages (project) + Timesheet
// hours where the same worker/project/date is recorded on both. Read-only.
function labourPerformance(){
  const byWorker = {};
  DB.labourWages.forEach(l=>{ if(!byWorker[l.workerName]) byWorker[l.workerName]={workerName:l.workerName, totalCost:0, totalDays:0, totalHours:0}; byWorker[l.workerName].totalCost+=l.value; byWorker[l.workerName].totalDays+=l.days; });
  DB.timesheetEntries.forEach(t=>{ if(!byWorker[t.workerName]) byWorker[t.workerName]={workerName:t.workerName, totalCost:0, totalDays:0, totalHours:0}; byWorker[t.workerName].totalHours+=t.hours; });
  return Object.values(byWorker).map(w=>({...w, costPerHour: w.totalHours>0 ? r2(w.totalCost/w.totalHours) : null}));
}

// ============================================================
// Phase 8 — Manufacturing → Dispatch → Delivery → Installation → QC → Snag → Handover → Billing → AR
// ============================================================
// §18/§21 discipline, enforced in code not just prose: NOTHING in this section posts to the
// GL except the customer invoice/receipt path, which reuses the EXISTING Phase 5/6B AR engine
// unchanged (createDraft → ... → postJournalEntry, draftCustomerInvoice). Dispatch, Delivery,
// Installation, QC, Snag, Handover are commercial/operational documents only.

// ---------- Dispatch ----------
function createDispatch({projectId, customerId, productionOrderId, items, vehicle, transporter, dispatchDate, destination, notes, actor}){
  if(!projectId || !Array.isArray(items) || !items.length) return {ok:false, error:'Project and at least one item are required.'};
  // ERP AUDIT FIX (ERP-030, Critical) — dispatch items were accepted with zero per-line
  // validation: a nonexistent materialId, a negative quantity, a zero quantity, and a non-numeric
  // quantity all passed through and were persisted into a real dispatch record, live-proven by the
  // audit. Each item is now checked for a genuine material reference and a positive, finite
  // quantity, matching the same discipline already used on GRN/Material Issue lines.
  for(let i=0;i<items.length;i++){
    const it = items[i];
    if(!it.materialId || !DB.materials.find(m=>m.id===it.materialId)) return {ok:false, error:`Item ${i}: unknown material "${it.materialId}".`};
    const _qChk = assertPositiveFiniteNumber(it.qty, `Item ${i} quantity`);
    if(!_qChk.ok) return _qChk;
  }
  const dsp = { id:'DSP-'+String(DB.dispatches.length+1).padStart(4,'0'), dspNo:null, projectId, customerId:customerId||null, productionOrderId:productionOrderId||null,
    items, vehicle:vehicle||'', transporter:transporter||'', dispatchDate:dispatchDate||null, destination:destination||'', notes:notes||'',
    status:'Draft', createdBy:actor.id, createdAt:nowIso(), approvedBy:null };
  DB.dispatches.push(dsp); save();
  logAudit({type:'DispatchCreated', dispatchId:dsp.id, projectId, userId:actor.id, role:actor.role});
  return {ok:true, dispatch:dsp};
}
function dispatchReadinessCheck(dsp){
  const reasons = [];
  if(dsp.productionOrderId){
    const prod = DB.productionOrders.find(p=>p.id===dsp.productionOrderId);
    if(!prod) reasons.push('Linked production order not found.');
    else if(!['Completed','PartiallyCompleted'].includes(prod.status)) reasons.push(`Linked production order is "${prod.status}", not yet Completed/PartiallyCompleted.`);
  }
  if(!dsp.customerId) reasons.push('Customer/site information is missing.');
  return {ready: reasons.length===0, reasons};
}
function markDispatchReady({id, actor}){
  const dsp = DB.dispatches.find(x=>x.id===id);
  if(!dsp) return {ok:false, error:'Dispatch not found.'};
  if(dsp.status!=='Draft') return {ok:false, error:`Cannot mark ready — "${dsp.status}", not Draft.`};
  const check = dispatchReadinessCheck(dsp);
  if(!check.ready) return {ok:false, error:'Dispatch prerequisites not met: '+check.reasons.join(' | ')};
  dsp.status='Ready'; save();
  return {ok:true, dispatch:dsp};
}
function approveDispatch({id, actor}){
  const dsp = DB.dispatches.find(x=>x.id===id);
  if(!dsp) return {ok:false, error:'Dispatch not found.'};
  if(dsp.status!=='Ready') return {ok:false, error:`Cannot approve — "${dsp.status}", not Ready.`};
  if(dsp.createdBy===actor.id && !['CEO','Admin'].includes(actor.role)) return {ok:false, error:'Segregation of duties: dispatch creator cannot approve.'};
  dsp.status='Approved'; dsp.approvedBy=actor.id; dsp.dspNo=nextDocNumber('DSP'); save();
  logAudit({type:'DispatchApproved', dispatchId:id, userId:actor.id, role:actor.role});
  return {ok:true, dispatch:dsp};
}
function markDispatched({id, actor}){
  const dsp = DB.dispatches.find(x=>x.id===id);
  if(!dsp) return {ok:false, error:'Dispatch not found.'};
  if(dsp.status!=='Approved') return {ok:false, error:`Cannot dispatch — "${dsp.status}", not Approved.`};
  dsp.status='Dispatched'; save();
  return {ok:true, dispatch:dsp};
}

// ---------- Delivery Confirmation ----------
// Phase 9 §18/§40 fix: the original version compared THIS call's quantity alone against
// the dispatch total (never summing PRIOR partial deliveries), and flipped dsp.status to
// 'Delivered' after the very first delivery record regardless of type — which silently
// blocked any second partial delivery against the same dispatch (the status guard below
// required 'Dispatched'). Net effect: a dispatch could only ever receive ONE delivery
// confirmation, full or partial, and multi-partial over-delivery was never checked.
// Root-caused via the Phase 9 UI Acceptance Test's required Partial→Partial→Partial→Final
// sequence. Fixed by tracking cumulative delivered qty across ALL prior delivery records
// for this dispatch, and only marking the dispatch 'Delivered' once that cumulative total
// reaches the dispatched qty.
function createDelivery({dispatchId, deliveredItems, receivedBy, evidenceRef, remarks, actor}){
  const dsp = DB.dispatches.find(x=>x.id===dispatchId);
  if(!dsp) return {ok:false, error:'Dispatch not found.'};
  if(dsp.status==='Delivered') return {ok:false, error:'This dispatch has already been fully delivered — no further delivery can be recorded against it.'};
  if(dsp.status!=='Dispatched') return {ok:false, error:`Cannot confirm delivery — dispatch is "${dsp.status}", not Dispatched.`};
  if(!Array.isArray(deliveredItems) || !deliveredItems.length) return {ok:false, error:'At least one delivered item is required.'};
  // ERP AUDIT FIX (ERP-031, Critical) — delivery quantity was reconciled against the dispatch
  // total, but the MATERIAL on each delivered line was never cross-checked against what was
  // actually dispatched — live-proven by the audit: a dispatch of Material A could be "delivered"
  // as Material B while satisfying the quantity check alone, a silent substitution with no
  // authorization or audit trail. No substitution workflow exists in this Lab (§ per the audit's
  // own recommendation to gate substitution behind an explicit, authorized process rather than
  // permit it implicitly) — so every delivered material must be one that was actually dispatched.
  const dispatchedMaterialIds = new Set(dsp.items.map(i=>i.materialId).filter(Boolean));
  if(dispatchedMaterialIds.size){
    for(let i=0;i<deliveredItems.length;i++){
      const mid = deliveredItems[i].materialId;
      if(mid && !dispatchedMaterialIds.has(mid)){
        return {ok:false, error:`Delivered item ${i} references material "${mid}", which was not part of dispatch ${dsp.id} — material substitution is not permitted without an explicit, authorized substitution process (not yet built in this Lab).`};
      }
    }
  }
  const totalDispatched = dsp.items.reduce((s,i)=>s+(+i.qty||0),0);
  const priorDeliveries = DB.deliveries.filter(d=>d.dispatchId===dispatchId);
  const priorDeliveredQty = priorDeliveries.reduce((s,d)=>s+d.deliveredItems.reduce((s2,i)=>s2+(+i.qty||0),0),0);
  if(priorDeliveredQty >= totalDispatched - 0.001) return {ok:false, error:'This dispatch has already been fully delivered — no further delivery can be recorded against it.'};
  const thisQty = deliveredItems.reduce((s,i)=>s+(+i.qty||0),0);
  if(thisQty <= 0) return {ok:false, error:'Delivered quantity must be greater than zero.'};
  const remainingBefore = totalDispatched - priorDeliveredQty;
  if(thisQty > remainingBefore + 0.001) return {ok:false, error:`Cannot deliver ${thisQty} — only ${r2(remainingBefore)} remains undelivered on this dispatch.`};
  const cumulativeAfter = priorDeliveredQty + thisQty;
  const type = cumulativeAfter >= totalDispatched - 0.001 ? 'Full' : 'Partial';
  const seq = priorDeliveries.length + 1;
  const dlv = { id:'DLV-'+String(DB.deliveries.length+1).padStart(4,'0'), dlvNo:nextDocNumber('DLV'), dispatchId, projectId:dsp.projectId, customerId:dsp.customerId,
    seq, deliveredItems, thisQty:r2(thisQty), cumulativeDeliveredQty:r2(cumulativeAfter), remainingQty:r2(totalDispatched-cumulativeAfter), type,
    date:new Date().toISOString().slice(0,10), receivedBy:receivedBy||'', evidenceRef:evidenceRef||'', remarks:remarks||'', createdBy:actor.id, createdAt:nowIso() };
  DB.deliveries.push(dlv);
  dsp.status = (type==='Full') ? 'Delivered' : 'Dispatched'; // stays 'Dispatched' — i.e. still open for further partials — until cumulative delivery is complete
  save();
  logAudit({type:'DeliveryConfirmed', deliveryId:dlv.id, dispatchId, deliveryType:type, seq, cumulativeDeliveredQty:dlv.cumulativeDeliveredQty, userId:actor.id, role:actor.role});
  return {ok:true, delivery:dlv};
}

// ---------- Installation ----------
function createInstallation({projectId, site, team, startDate, scope, actor}){
  const inst = { id: nextId(DB.installations, 'INST-', 4), instNo:nextDocNumber('INST'), projectId, site:site||'', team:team||[],
    startDate:startDate||null, completionDate:null, scope:scope||'', progressPct:0, remarks:'', issues:[], status:'Planned', labourEntryIds:[], createdBy:actor.id, createdAt:nowIso() };
  DB.installations.push(inst); save();
  logAudit({type:'InstallationCreated', installationId:inst.id, projectId, userId:actor.id, role:actor.role});
  return {ok:true, installation:inst};
}
// Phase 15 §2 — Installation Cost. Installation had ZERO cost-posting mechanism before this
// phase (pure progress tracking: progressPct/status/team, no GL linkage at all) — not merely a
// missing tag on an existing posting. Reuses the existing account 5100 (Labour Cost, same account
// Production/Service labour already use) and the existing Cost Centre dimension (adds one new
// row, CC-INSTALLATION, to the already-established 3-row master) rather than inventing a new
// account or a new dimension type.
function postInstallationLabourCost({installationId, amount, actor, overrideReason}){
  const inst = DB.installations.find(x=>x.id===installationId);
  if(!inst) return {ok:false, error:'Installation not found.'};
  { const _a = assertCanPostInstallationLabourCost(actor, inst.projectId); if(!_a.ok) return _a; }
  // Phase 33 (adversarial audit thread) Part D — closed-project gate, via the installation's own project.
  { const _po = assertProjectOpenForPosting(inst.projectId, actor, {overrideReason, action:'post installation labour cost'}); if(!_po.ok) return _po; }
  if(!(+amount>0)) return {ok:false, error:'Amount must be positive.'};
  const _jesLenBeforeILC = DB.journalEntries.length;
  const result = postJournalEntry({ date:new Date().toISOString().slice(0,10), narration:`Installation labour — ${inst.instNo}`, sourceType:'InstallationLabour', sourceId:inst.id,
    voucherNo:nextDocNumber('JE'), docCategory:'InstallationLabour', branchId:projectBranch(inst.projectId),
    lines:[ {account:'5100', debit:+amount, credit:0, projectId:inst.projectId, costCentreId:'CC-INSTALLATION'}, {account:'1000', debit:0, credit:+amount, projectId:inst.projectId, costCentreId:'CC-INSTALLATION'} ],
    actor, capability:'INSTALLATION_LABOUR_COST', capabilityCtx:{projectId: inst.projectId}, overrideReason });
  if(!result.ok) return result;
  // Phase 37 Part B/D fix — this was the exact function used to prove the audit-failure/duplicate-
  // retry defect (Part D). Its OWN GL-then-unprotected-push sequencing gap (independent of the
  // logAudit fix) is closed here with the same snapshot/rollback pattern used elsewhere this phase.
  try {
    _fault('INST_LABOUR_AFTER_GL_BEFORE_PUSH');
    inst.labourEntryIds.push(result.entry.id);
    save();
    logAudit({type:'InstallationLabourPosted', installationId:inst.id, amount:+amount, userId:actor.id, role:actor.role});
    return {ok:true, entry:result.entry};
  } catch(e) {
    DB.journalEntries.length = _jesLenBeforeILC;
    save();
    logAudit({type:'InstallationLabourRolledBackOnFailure', installationId:inst.id, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}
function updateInstallationProgress({id, progressPct, remarks, status, actor}){
  const inst = DB.installations.find(x=>x.id===id);
  if(!inst) return {ok:false, error:'Installation not found.'};
  if(inst.status==='Completed') return {ok:false, error:'Installation already Completed — cannot modify.'};
  if(progressPct!==undefined) inst.progressPct = Math.max(0, Math.min(100, +progressPct));
  if(remarks) inst.remarks = remarks;
  if(status){
    if(!INSTALLATION_STATUSES.includes(status)) return {ok:false, error:`Invalid status "${status}".`};
    inst.status = status;
    if(status==='Completed'){ inst.completionDate = new Date().toISOString().slice(0,10); inst.progressPct=100; }
  }
  save();
  return {ok:true, installation:inst};
}

// ---------- QC Checklist ----------
function createQCChecklist({projectId, installationId, items, inspector, actor}){
  // ERP AUDIT FIX (ERP-033, Critical) — installationId was stored with zero existence check, so a
  // QC record could reference an installation that never existed, live-proven by the audit.
  if(installationId && !DB.installations.find(i=>i.id===installationId)) return {ok:false, error:`Unknown installation "${installationId}".`};
  // ERP AUDIT FIX (ERP-032, Critical, part 1) — closing the gap at its source: a checklist created
  // with zero items has nothing meaningful to inspect, and previously flowed straight through to
  // submitQCResult() where `items.every(...)` on an empty array is vacuously TRUE — an empty
  // checklist could be marked Passed with no inspection having occurred at all, live-proven by the
  // audit. Rejecting an empty item list here removes the vacuous-truth path entirely rather than
  // patching around it downstream only.
  if(!Array.isArray(items) || !items.length) return {ok:false, error:'A QC checklist must have at least one inspection item.'};
  const qc = { id:'QCK-'+String(DB.qcChecklists.length+1).padStart(4,'0'), qckNo:nextDocNumber('QCK'), projectId, installationId:installationId||null,
    items: items.map(i=>({...i, passFail:i.passFail||'Pending'})), inspector:inspector||actor.id, date:new Date().toISOString().slice(0,10),
    status:'Pending', createdBy:actor.id, createdAt:nowIso() };
  DB.qcChecklists.push(qc); save();
  return {ok:true, qc};
}
function submitQCResult({id, items, actor}){
  const qc = DB.qcChecklists.find(x=>x.id===id);
  if(!qc) return {ok:false, error:'QC checklist not found.'};
  // ERP AUDIT FIX (ERP-032, Critical, part 2 — defense in depth) — createQCChecklist() now refuses
  // to create an empty checklist, but this is the second, independent path that could still reach
  // the same vacuous-truth bug: `[].every(...)` is TRUE, so replacing an existing checklist's items
  // with an empty array here would let it be marked Passed with nothing to show for it.
  if(!Array.isArray(items) || !items.length) return {ok:false, error:'Cannot submit a QC result with zero items.'};
  qc.items = items;
  const allPass = items.every(i=>i.passFail==='Pass');
  const anyFail = items.some(i=>i.passFail==='Fail' && i.critical);
  qc.status = items.some(i=>i.passFail==='Pending') ? 'InProgress' : (allPass ? 'Passed' : 'Failed');
  save();
  logAudit({type:'QCResultSubmitted', qcId:id, status:qc.status, userId:actor.id, role:actor.role});
  return {ok:true, qc};
}

// ---------- Snag Management ----------
function createSnag({projectId, site, description, severity, actor}){
  if(!SNAG_SEVERITIES.includes(severity)) return {ok:false, error:`Severity must be one of ${SNAG_SEVERITIES.join('/')}.`};
  const snag = { id:'SNG-'+String(DB.snags.length+1).padStart(4,'0'), sngNo:nextDocNumber('SNG'), projectId, site:site||'', description, severity,
    assignedTo:null, dueDate:null, status:'Open', resolution:null, verifiedBy:null, verifiedDate:null, createdBy:actor.id, createdAt:nowIso() };
  DB.snags.push(snag); save();
  logAudit({type:'SnagCreated', snagId:snag.id, projectId, severity, userId:actor.id, role:actor.role});
  return {ok:true, snag};
}
function assignSnag({id, assignedTo, dueDate, actor}){
  const snag = DB.snags.find(x=>x.id===id);
  if(!snag) return {ok:false, error:'Snag not found.'};
  if(snag.status!=='Open') return {ok:false, error:`Cannot assign — "${snag.status}", not Open.`};
  snag.assignedTo=assignedTo; snag.dueDate=dueDate||null; snag.status='Assigned'; save();
  return {ok:true, snag};
}
function resolveSnag({id, resolution, actor}){
  const snag = DB.snags.find(x=>x.id===id);
  if(!snag) return {ok:false, error:'Snag not found.'};
  if(!['Assigned','InProgress'].includes(snag.status)) return {ok:false, error:`Cannot resolve — "${snag.status}".`};
  snag.resolution=resolution; snag.status='Resolved'; save();
  return {ok:true, snag};
}
function verifySnag({id, actor}){
  const snag = DB.snags.find(x=>x.id===id);
  if(!snag) return {ok:false, error:'Snag not found.'};
  if(snag.status!=='Resolved') return {ok:false, error:`Cannot verify — "${snag.status}", not Resolved.`};
  // The person who resolved it should not be the same one verifying it — a real QC control.
  if(snag.assignedTo===actor.id && !['CEO','Admin'].includes(actor.role)) return {ok:false, error:'The assignee who resolved this snag cannot also verify it.'};
  snag.verifiedBy=actor.id; snag.verifiedDate=new Date().toISOString().slice(0,10); snag.status='Verified'; save();
  return {ok:true, snag};
}
function closeSnag({id, actor}){
  const snag = DB.snags.find(x=>x.id===id);
  if(!snag) return {ok:false, error:'Snag not found.'};
  if(snag.status!=='Verified') return {ok:false, error:`Cannot close — "${snag.status}", not Verified.`};
  snag.status='Closed'; save();
  return {ok:true, snag};
}

// ---------- Handover — gated server-side, never a bare status flip (§17) ----------
function handoverReadinessCheck(projectId){
  const reasons = [];
  const installs = DB.installations.filter(i=>i.projectId===projectId);
  if(!installs.length || !installs.every(i=>i.status==='Completed')) reasons.push('Installation not marked Completed.');
  // DEFECT FOUND & FIXED (Phase 8 live testing): this used to be `qcs.length && qcs.some(Failed)`
  // — fail-OPEN when no QC checklist existed at all, meaning handover could succeed WITHOUT QC
  // ever having been run. Fixed to fail-CLOSED: at least one QC checklist must exist and ALL
  // must be Passed. "No QC record" is not the same as "QC passed."
  const qcs = DB.qcChecklists.filter(q=>q.projectId===projectId);
  if(!qcs.length) reasons.push('No QC checklist has been run for this project.');
  else if(!qcs.every(q=>q.status==='Passed')) reasons.push('A QC checklist is not yet Passed (Pending/InProgress/Failed).');
  const openCriticalSnags = DB.snags.filter(s=>s.projectId===projectId && s.severity==='Critical' && s.status!=='Closed');
  if(openCriticalSnags.length) reasons.push(`${openCriticalSnags.length} Critical snag(s) not yet Closed.`);
  return {ready: reasons.length===0, reasons};
}
function createHandover({projectId, customerAcknowledgement, evidenceRef, remarks, actor}){
  // ERP AUDIT FIX (ERP-034, High) — no check prevented a second handover being recorded against a
  // project that already had one, live-proven by the audit. A duplicate handover can distort the
  // project's completion date, warranty start date, customer acceptance record, billing, and
  // service entitlement (all of which read the FIRST handover implicitly elsewhere in this Lab).
  // A genuine re-handover (e.g. correcting a bad evidence reference) is a revision decision, not a
  // silent second document — rejected here rather than guessing what a revision workflow should do.
  if(DB.handovers.some(h=>h.projectId===projectId)) return {ok:false, error:`Project "${projectId}" already has a handover on record — a duplicate handover is not permitted. If this handover needs correction, that requires an explicit revision process (not yet built in this Lab).`};
  const check = handoverReadinessCheck(projectId);
  if(!check.ready) return {ok:false, error:'Handover prerequisites not met: '+check.reasons.join(' | '), reasons:check.reasons};
  const ho = { id:'HO-'+String(DB.handovers.length+1).padStart(4,'0'), hoNo:nextDocNumber('HO'), projectId, date:new Date().toISOString().slice(0,10),
    responsibleUser:actor.id, customerAcknowledgement:customerAcknowledgement||'', evidenceRef:evidenceRef||'', remarks:remarks||'',
    evidenceMethod:'MANUAL_ACKNOWLEDGEMENT — E-SIGNATURE INTEGRATION PENDING', createdAt:nowIso() };
  DB.handovers.push(ho); save();
  logAudit({type:'HandoverCompleted', handoverId:ho.id, projectId, userId:actor.id, role:actor.role});
  return {ok:true, handover:ho};
}

// ---------- Billing Milestones — do NOT auto-invoice on execution events (§18/§21) ----------
function createBillingMilestone({projectId, milestoneType, amount, triggerNote, actor}){
  if(!MILESTONE_TYPES.includes(milestoneType)) return {ok:false, error:`Milestone type must be one of ${MILESTONE_TYPES.join('/')}.`};
  const bm = { id:nextId(DB.billingMilestones, 'BM-', 4), projectId, milestoneType, amount:+amount, triggerNote:triggerNote||'',
    status:'Pending', invoiceEntryId:null, createdBy:actor.id, createdAt:nowIso() };
  DB.billingMilestones.push(bm); save();
  return {ok:true, milestone:bm};
}
// A milestone becoming "Ready" is a manual/reviewed action (an authorized user confirms the
// underlying execution event happened) — never automatic just because a dispatch/installation/
// handover record exists. This is the concrete implementation of §18's explicit instruction.
function markMilestoneReady({id, actor}){
  const bm = DB.billingMilestones.find(x=>x.id===id);
  if(!bm) return {ok:false, error:'Milestone not found.'};
  if(bm.status!=='Pending') return {ok:false, error:`Cannot mark ready — "${bm.status}", not Pending.`};
  bm.status='Ready'; bm.readyConfirmedBy=actor.id; save();
  return {ok:true, milestone:bm};
}
// Extends (does not replace) draftCustomerInvoice — adds an optional billingMilestoneId link.
function draftCustomerInvoiceFromMilestone({milestoneId, customerId, projectId, taxCode, date, createdByUserId, createdByRole, variationAllocations}){
  const bm = DB.billingMilestones.find(x=>x.id===milestoneId);
  if(!bm) return {ok:false, error:'Billing milestone not found.'};
  if(bm.status!=='Ready') return {ok:false, error:`Cannot invoice — milestone is "${bm.status}", not Ready.`};
  const r = draftCustomerInvoice({customerId, projectId:projectId||bm.projectId, baseAmount:bm.amount, taxCode, date, narration:`Invoice for ${bm.milestoneType} milestone`, createdByUserId, createdByRole, variationAllocations});
  // Phase 45 CRITICAL FIX — found live in Phase 10: this used to set bm.status='Invoiced' the
  // moment the DRAFT was created, before the actual invoice had posted (or even been submitted/
  // approved) — confusing "a draft exists" with "the invoice is done," exactly the class of
  // mistake this fix eliminates. A milestone could end up permanently marked Invoiced while its
  // linked draft failed to post for any reason (bad reference, closed period, missing date...)
  // and could never be retried, because 'Invoiced' is not 'Ready' and re-invoicing was blocked.
  // Fixed: the milestone now moves to the distinct 'InvoiceDrafted' status here — genuinely
  // different from 'Invoiced', so nothing downstream can mistake one for the other — and only
  // reaches 'Invoiced' in postDraft() below, at the moment the invoice actually posts. If the
  // draft is instead rejected or cancelled, rejectDraft()/cancelDraft() revert the milestone to
  // 'Ready' so a fresh invoice attempt is always possible, never permanently stuck.
  if(r.ok){ bm.status='InvoiceDrafted'; bm.draftId=r.draft.id; r.draft.billingMilestoneId=milestoneId; save(); }
  return r;
}

// ---------- Project Closure Readiness — a real gate, not a UI status flip (§28) ----------
function projectClosureReadiness(projectId){
  const conditions = {};
  const prods = DB.productionOrders.filter(p=>p.projectId===projectId);
  // Deliberately fail-OPEN (unlike installationComplete/qcPassed above): not every project has
  // an in-house manufacturing component (e.g. pure trading/subcontracted work), so "zero
  // production orders" legitimately means "not applicable" here, not "skipped."
  conditions.productionComplete = !prods.length || prods.every(p=>['Completed','Closed','Cancelled'].includes(p.status));
  const installs = DB.installations.filter(i=>i.projectId===projectId);
  // Same fail-open defect as handoverReadinessCheck, fixed the same way: Installation and QC
  // are mandatory execution steps in this Lab's modeled chain (§3) — "no record" must NOT
  // count as "complete/passed." Production is left fail-open (§7 note below) because not
  // every project necessarily has an in-house manufacturing component — a deliberate,
  // disclosed asymmetry, not an oversight.
  conditions.installationComplete = installs.length>0 && installs.every(i=>i.status==='Completed');
  const qcs = DB.qcChecklists.filter(q=>q.projectId===projectId);
  conditions.qcPassed = qcs.length>0 && qcs.every(q=>q.status==='Passed');
  const criticalSnags = DB.snags.filter(s=>s.projectId===projectId && s.severity==='Critical');
  conditions.criticalSnagsClosed = criticalSnags.every(s=>s.status==='Closed');
  conditions.handoverComplete = DB.handovers.some(h=>h.projectId===projectId);
  const milestones = DB.billingMilestones.filter(m=>m.projectId===projectId);
  conditions.billingComplete = !milestones.length || milestones.every(m=>m.status==='Invoiced');
  const openItems = customerOpenItems(DB.projects.find(p=>p.id===projectId)?.customerId).filter(i=>i.projectId===projectId && i.open>0.01);
  conditions.receivablesCleared = openItems.length===0;
  const allReady = Object.values(conditions).every(Boolean);
  return {projectId, conditions, allReady};
}
function closeProject({projectId, actor, override, overrideReason}){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return {ok:false, error:'Project not found.'};
  const readiness = projectClosureReadiness(projectId);
  if(!readiness.allReady && !override) return {ok:false, error:'Project is not ready to close.', readiness};
  if(!readiness.allReady && override){
    if(!['CEO','Admin'].includes(actor.role)) return {ok:false, error:'Only CEO/Admin may override closure readiness.'};
    logAudit({type:'ProjectClosureOverride', projectId, unmetConditions: Object.entries(readiness.conditions).filter(([k,v])=>!v).map(([k])=>k), reason:overrideReason||'', userId:actor.id, role:actor.role});
  }
  p.status='CLOSED'; save();
  logAudit({type:'ProjectClosed', projectId, override:!!override, userId:actor.id, role:actor.role});
  return {ok:true, project:p, readiness};
}

// ============================================================
// Phase 10 — After-Sales: Warranty → Complaint → Ticket → Visit → Diagnosis →
// Material/Labour → Chargeable Billing / AMC → CAPA
// ============================================================
// §3/§18/§19/§31-33 discipline, enforced in code: NO second accounting engine, NO second
// inventory engine, NO new GL accounts. Chargeable service and AMC billing events reuse
// draftCustomerInvoice() completely UNMODIFIED (so AR open-items/ageing/receipt/clearing all
// keep working with zero changes), tagged afterward with a traceability field on the draft
// object — the exact pattern Phase 7's draftSupplierInvoiceFromPO already established for
// poId/grnId. Warranty material issue reuses createMaterialIssue() completely UNMODIFIED
// (same account 5000, same engine) — its sourceType/sourceId pass-through (already a Phase 7
// parameter) is used to tag the inventory movement 'ServiceVisit', which is how "Warranty
// Cost" is computed for reporting (§34/§35): a read-only rollup over already-existing,
// unmodified collections, not a new posting path. Service labour has no equivalent movement
// collection to derive from, so it gets its own thin posting function — same shape as the
// existing postProductionLabourCost(), same existing accounts (5100/1000), tagged with its own
// docCategory ('ServiceLabour') purely for reporting separation, exactly how 'ProductionLabour'
// already coexists with plain 'MaterialIssue' postings on the same accounts.

const WARRANTY_STATUSES_MANUAL = ['VOID','CANCELLED']; // time-computed statuses (NOT_STARTED/ACTIVE/EXPIRED) are derived, never stored
const COMPLAINT_STATUSES = ['NEW','TRIAGED','ASSIGNED','IN_PROGRESS','WAITING_CUSTOMER','WAITING_PARTS','RESOLVED','CLOSED','REJECTED'];
const TICKET_CLASSIFICATIONS = ['Warranty','Chargeable','AMC','Courtesy','RequiresInvestigation'];
const TICKET_STATUSES = ['NEW','ASSIGNED','IN_PROGRESS','WAITING_PARTS','RESOLVED','CLOSED','REJECTED'];
const VISIT_STATUSES = ['PLANNED','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED'];
const AMC_STATUSES = ['DRAFT','ACTIVE','EXPIRED','CANCELLED','RENEWED'];
const CAPA_STATUSES = ['OPEN','ANALYSIS','ACTION','VERIFICATION','EFFECTIVENESS','CLOSED'];
const CAPA_TRIGGERS = ['RepeatedFailure','SystemicIssue','QualityTrend','MajorComplaint','ManagementDecision','SafetyQualityEvent'];

// ---------- Warranty ----------
// §5: duration is NEVER defaulted — an explicit BUSINESS POLICY REQUIRED error is returned if
// the caller doesn't supply durationMonths, rather than assuming 1yr/2yr/etc.
function createWarranty({customerId, projectId, handoverId, product, warrantyType, coverage, exclusions, terms, durationMonths, startDate, actor}){
  if(!customerId || !DB.customers.find(c=>c.id===customerId)) return {ok:false, error:`Unknown customer "${customerId}".`};
  if(!projectId || !DB.projects.find(p=>p.id===projectId)) return {ok:false, error:`Unknown project "${projectId}".`};
  if(!durationMonths || +durationMonths<=0) return {ok:false, error:'BUSINESS POLICY REQUIRED: warranty duration (in months) must be explicitly specified — Appletree\'s actual warranty period policy is not documented in this Lab, so it cannot be assumed.'};
  // ERP AUDIT FIX (ERP-042, Critical) — handoverId was looked up but a MISS (nonexistent id) fell
  // straight through to the default-start-date branch with no rejection at all — the warranty was
  // still created and permanently stored the phantom handoverId, live-proven by the audit.
  // Existence is required whenever a value is actually supplied; omitting handoverId entirely
  // remains valid (not every warranty is necessarily tied to a formal handover record in this Lab).
  if(handoverId && !DB.handovers.find(h=>h.id===handoverId)) return {ok:false, error:`Unknown handover "${handoverId}".`};
  const ho = handoverId ? DB.handovers.find(h=>h.id===handoverId) : null;
  const start = startDate || (ho ? ho.date : new Date().toISOString().slice(0,10));
  const end = new Date(start); end.setMonth(end.getMonth() + (+durationMonths));
  const war = { id:'WAR-'+String(DB.warranties.length+1).padStart(4,'0'), warNo:nextDocNumber('WAR'), customerId, projectId, handoverId:handoverId||null,
    product:product||'', warrantyType:warrantyType||'Standard', coverage:coverage||'', exclusions:exclusions||'', terms:terms||'',
    durationMonths:+durationMonths, startDate:start, endDate:end.toISOString().slice(0,10), manualStatus:null,
    createdBy:actor.id, createdAt:nowIso() };
  DB.warranties.push(war); save();
  logAudit({type:'WarrantyCreated', warrantyId:war.id, customerId, projectId, durationMonths:+durationMonths, userId:actor.id, role:actor.role});
  return {ok:true, warranty:war};
}
function warrantyEffectiveStatus(war, asOfDate){
  if(war.manualStatus) return war.manualStatus; // VOID/CANCELLED always win
  const asOf = asOfDate || new Date().toISOString().slice(0,10);
  if(asOf < war.startDate) return 'NOT_STARTED';
  if(asOf > war.endDate) return 'EXPIRED';
  return 'ACTIVE';
}
function voidWarranty({id, reason, actor}){
  const war = DB.warranties.find(w=>w.id===id);
  if(!war) return {ok:false, error:'Warranty not found.'};
  if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return {ok:false, error:'Only Admin/CEO/FinanceManager may void a warranty.'};
  war.manualStatus='VOID'; war.voidReason=reason||''; save();
  logAudit({type:'WarrantyVoided', warrantyId:id, reason, userId:actor.id, role:actor.role});
  return {ok:true, warranty:war};
}
function cancelWarranty({id, reason, actor}){
  const war = DB.warranties.find(w=>w.id===id);
  if(!war) return {ok:false, error:'Warranty not found.'};
  if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return {ok:false, error:'Only Admin/CEO/FinanceManager may cancel a warranty.'};
  war.manualStatus='CANCELLED'; war.cancelReason=reason||''; save();
  logAudit({type:'WarrantyCancelled', warrantyId:id, reason, userId:actor.id, role:actor.role});
  return {ok:true, warranty:war};
}
// §6: eligibility is computed server-side, authoritative, never left to the browser.
function warrantyEligibility({warrantyId, claimDate, claimType, actor}){
  const war = DB.warranties.find(w=>w.id===warrantyId);
  if(!war) return {result:'NOT_ELIGIBLE', reasons:['No warranty record found for this claim.']};
  const asOf = claimDate || new Date().toISOString().slice(0,10);
  const status = warrantyEffectiveStatus(war, asOf);
  const reasons = [];
  if(status==='VOID') reasons.push('Warranty has been voided.');
  if(status==='CANCELLED') reasons.push('Warranty has been cancelled.');
  if(status==='NOT_STARTED') reasons.push(`Claim date ${asOf} is before warranty start ${war.startDate}.`);
  if(status==='EXPIRED') reasons.push(`Claim date ${asOf} is after warranty end ${war.endDate}.`);
  if(reasons.length) return {result:'NOT_ELIGIBLE', reasons, warrantyStatus:status};
  // Exclusion text is free-form and cannot be reliably auto-parsed — a textual match against
  // claimType routes to REQUIRES_REVIEW rather than a false-confidence auto-deny/auto-approve.
  if(claimType && war.exclusions && war.exclusions.toLowerCase().includes(String(claimType).toLowerCase())){
    return {result:'REQUIRES_REVIEW', reasons:[`Claim type "${claimType}" appears in this warranty's exclusions text — requires manual review, not an automated decision.`], warrantyStatus:status};
  }
  return {result:'ELIGIBLE', reasons:['Warranty is ACTIVE and claim date falls within coverage.'], warrantyStatus:status};
}

// ---------- Complaint / Service Request ----------
function createComplaint({customerId, projectId, warrantyId, site, product, reportedBy, contact, description, priority, severity, evidenceRef, actor}){
  if(!customerId || !description) return {ok:false, error:'Customer and description are required.'};
  const cmp = { id:'CMP-'+String(DB.complaints.length+1).padStart(4,'0'), cmpNo:nextDocNumber('CMP'), customerId, projectId:projectId||null, warrantyId:warrantyId||null,
    site:site||'', product:product||'', reportedBy:reportedBy||'', contact:contact||'', description, priority:priority||'Normal', severity:severity||'Minor',
    evidenceRef:evidenceRef||'', status:'NEW', classification:null, createdBy:actor.id, createdAt:nowIso() };
  DB.complaints.push(cmp); save();
  logAudit({type:'ComplaintCreated', complaintId:cmp.id, customerId, projectId, severity:cmp.severity, userId:actor.id, role:actor.role});
  return {ok:true, complaint:cmp};
}
// §9/§10: triage classification is a distinct, auditable decision — never assumed as Warranty.
function triageComplaint({id, classification, notes, actor}){
  const cmp = DB.complaints.find(c=>c.id===id);
  if(!cmp) return {ok:false, error:'Complaint not found.'};
  if(!TICKET_CLASSIFICATIONS.includes(classification)) return {ok:false, error:`Classification must be one of ${TICKET_CLASSIFICATIONS.join('/')}.`};
  if(!['NEW','TRIAGED'].includes(cmp.status)) return {ok:false, error:`Cannot triage — "${cmp.status}", not NEW/TRIAGED.`};
  cmp.classification = classification; cmp.triageNotes = notes||''; cmp.status='TRIAGED'; cmp.triagedBy=actor.id; save();
  logAudit({type:'ComplaintTriaged', complaintId:id, classification, userId:actor.id, role:actor.role});
  return {ok:true, complaint:cmp};
}
function changeComplaintStatus({id, newStatus, reason, actor}){
  const cmp = DB.complaints.find(c=>c.id===id);
  if(!cmp) return {ok:false, error:'Complaint not found.'};
  if(!COMPLAINT_STATUSES.includes(newStatus)) return {ok:false, error:`Status must be one of ${COMPLAINT_STATUSES.join('/')}.`};
  cmp.status = newStatus; if(reason) cmp.statusReason = reason; save();
  logAudit({type:'ComplaintStatusChanged', complaintId:id, newStatus, userId:actor.id, role:actor.role});
  return {ok:true, complaint:cmp};
}

// ---------- Service Ticket ----------
function createServiceTicket({complaintId, customerId, projectId, warrantyId, amcId, issue, priority, severity, dueDate, actor}){
  const complaint = complaintId ? DB.complaints.find(c=>c.id===complaintId) : null;
  if(complaintId && !complaint) return {ok:false, error:'Source complaint not found.'};
  // ERP AUDIT FIX (ERP-043, Critical) — warrantyId/amcId were accepted and stored with zero
  // existence check, so a ticket could reference a warranty or AMC contract that never existed,
  // live-proven by the audit. Both stay optional (a ticket need not be warranty/AMC-linked at all)
  // — only a genuinely supplied-but-nonexistent id is rejected.
  const _effWarrantyId = warrantyId || complaint?.warrantyId || null;
  if(_effWarrantyId && !DB.warranties.find(w=>w.id===_effWarrantyId)) return {ok:false, error:`Unknown warranty "${_effWarrantyId}".`};
  if(amcId && !DB.amcContracts.find(a=>a.id===amcId)) return {ok:false, error:`Unknown AMC contract "${amcId}".`};
  const tkt = { id:'TKT-'+String(DB.serviceTickets.length+1).padStart(4,'0'), tktNo:nextDocNumber('TKT'), complaintId:complaintId||null,
    customerId: customerId || complaint?.customerId, projectId: projectId || complaint?.projectId || null, warrantyId: warrantyId || complaint?.warrantyId || null, amcId:amcId||null,
    issue: issue || complaint?.description || '', priority: priority || complaint?.priority || 'Normal', severity: severity || complaint?.severity || 'Minor',
    classification: complaint?.classification || null, assignedTo:null, dueDate:dueDate||null, status:'NEW', escalations:[],
    createdBy:actor.id, createdAt:nowIso() };
  if(!tkt.customerId) return {ok:false, error:'Customer is required (directly or via a source complaint).'};
  DB.serviceTickets.push(tkt); save();
  if(complaint){ complaint.status='ASSIGNED'==complaint.status?complaint.status:'ASSIGNED'; save(); }
  logAudit({type:'ServiceTicketCreated', ticketId:tkt.id, complaintId, customerId:tkt.customerId, userId:actor.id, role:actor.role});
  return {ok:true, ticket:tkt};
}
function assignServiceTicket({id, assignedTo, dueDate, actor}){
  const tkt = DB.serviceTickets.find(t=>t.id===id);
  if(!tkt) return {ok:false, error:'Ticket not found.'};
  if(!assignedTo) return {ok:false, error:'assignedTo is required.'};
  tkt.assignedTo = assignedTo; if(dueDate) tkt.dueDate = dueDate; tkt.status='ASSIGNED';
  // POL-08: assignment is treated as the "first response" SLA checkpoint — the first
  // acknowledgement that someone is acting on the ticket. Only the FIRST assignment counts;
  // reassigning later never resets an already-recorded response time.
  if(!tkt.firstRespondedAt) tkt.firstRespondedAt = nowIso();
  save();
  logAudit({type:'ServiceTicketAssigned', ticketId:id, assignedTo, userId:actor.id, role:actor.role});
  return {ok:true, ticket:tkt};
}
function escalateServiceTicket({id, escalateTo, reason, actor}){
  const tkt = DB.serviceTickets.find(t=>t.id===id);
  if(!tkt) return {ok:false, error:'Ticket not found.'};
  if(!escalateTo || !reason) return {ok:false, error:'escalateTo and reason are required.'};
  tkt.escalations.push({escalateTo, reason, by:actor.id, at:nowIso()}); save();
  logAudit({type:'ServiceTicketEscalated', ticketId:id, escalateTo, reason, userId:actor.id, role:actor.role});
  return {ok:true, ticket:tkt};
}
function setTicketClassification({id, classification, actor}){
  const tkt = DB.serviceTickets.find(t=>t.id===id);
  if(!tkt) return {ok:false, error:'Ticket not found.'};
  if(!TICKET_CLASSIFICATIONS.includes(classification)) return {ok:false, error:`Classification must be one of ${TICKET_CLASSIFICATIONS.join('/')}.`};
  tkt.classification = classification; save();
  logAudit({type:'ServiceTicketClassified', ticketId:id, classification, userId:actor.id, role:actor.role});
  return {ok:true, ticket:tkt};
}

// ---------- Service Visit (+ Diagnosis) ----------
function createServiceVisit({ticketId, site, technician, visitDate, actor}){
  const tkt = DB.serviceTickets.find(t=>t.id===ticketId);
  if(!tkt) return {ok:false, error:'Service ticket not found.'};
  const vis = { id:'VIS-'+String(DB.serviceVisits.length+1).padStart(4,'0'), visNo:nextDocNumber('VIS'), ticketId, customerId:tkt.customerId, projectId:tkt.projectId,
    site:site||'', technician:technician||actor.id, visitDate:visitDate||new Date().toISOString().slice(0,10), startTime:null, endTime:null,
    diagnosis:null, rootCause:null, recommendedAction:null, partsRequired:'', labourRequired:'', warrantyDecision:null, chargeableDecision:null,
    workPerformed:'', materialIssueIds:[], labourEntryIds:[], remarks:'', customerAcknowledgement:'', evidenceRef:'',
    status:'PLANNED', createdBy:actor.id, createdAt:nowIso() };
  DB.serviceVisits.push(vis); save();
  if(tkt.status==='ASSIGNED') { tkt.status='IN_PROGRESS'; save(); }
  logAudit({type:'ServiceVisitCreated', visitId:vis.id, ticketId, userId:actor.id, role:actor.role});
  return {ok:true, visit:vis};
}
function startServiceVisit({id, actor}){
  const vis = DB.serviceVisits.find(v=>v.id===id);
  if(!vis) return {ok:false, error:'Service visit not found.'};
  if(!['PLANNED','ASSIGNED'].includes(vis.status)) return {ok:false, error:`Cannot start — "${vis.status}".`};
  vis.status='IN_PROGRESS'; vis.startTime=nowIso(); save();
  return {ok:true, visit:vis};
}
// §13: diagnosis captures the WARRANTY/CHARGEABLE DECISION explicitly — never auto-assumed.
// §13 also forbids posting anything financial directly from diagnosis — this function only
// records facts; material/labour/billing are separate, deliberate actions (below).
function recordDiagnosis({id, problem, rootCause, diagnosis, recommendedAction, partsRequired, labourRequired, warrantyDecision, chargeableDecision, estimatedAmount, disputed, actor}){
  const vis = DB.serviceVisits.find(v=>v.id===id);
  if(!vis) return {ok:false, error:'Service visit not found.'};
  if(vis.status==='COMPLETED') return {ok:false, error:'Visit already Completed — diagnosis is locked.'};
  if(warrantyDecision!==undefined && chargeableDecision!==undefined && warrantyDecision && chargeableDecision){
    return {ok:false, error:'A visit cannot be classified as BOTH warranty and chargeable — they must not be financially mixed (§10).'};
  }
  Object.assign(vis, {problem:problem||vis.problem, rootCause:rootCause||vis.rootCause, diagnosis:diagnosis||vis.diagnosis,
    recommendedAction:recommendedAction||vis.recommendedAction, partsRequired:partsRequired||vis.partsRequired, labourRequired:labourRequired||vis.labourRequired,
    warrantyDecision: warrantyDecision!==undefined?!!warrantyDecision:vis.warrantyDecision, chargeableDecision: chargeableDecision!==undefined?!!chargeableDecision:vis.chargeableDecision,
    estimatedAmount: estimatedAmount!==undefined?+estimatedAmount:vis.estimatedAmount, disputed: disputed!==undefined?!!disputed:vis.disputed});
  // POL-07 (approved threshold ₹10,000): a diagnosis above the threshold, OR flagged disputed
  // (regardless of amount), requires independent manager approval before it is final.
  vis.diagnosedBy = actor.id;
  vis.diagnosisApprovalStatus = diagnosisRequiresApproval({estimatedAmount:vis.estimatedAmount, disputed:vis.disputed}) ? 'PendingApproval' : 'NotRequired';
  save();
  logAudit({type:'DiagnosisRecorded', visitId:id, warrantyDecision:vis.warrantyDecision, chargeableDecision:vis.chargeableDecision, estimatedAmount:vis.estimatedAmount, disputed:vis.disputed, approvalStatus:vis.diagnosisApprovalStatus, userId:actor.id, role:actor.role});
  return {ok:true, visit:vis};
}
function completeServiceVisit({id, workPerformed, remarks, customerAcknowledgement, evidenceRef, actor}){
  const vis = DB.serviceVisits.find(v=>v.id===id);
  if(!vis) return {ok:false, error:'Service visit not found.'};
  if(vis.status==='COMPLETED') return {ok:false, error:'Already Completed.'};
  if(vis.status==='CANCELLED') return {ok:false, error:'Cannot complete a Cancelled visit.'};
  // POL-07: cannot complete/close out a visit whose diagnosis still needs manager approval —
  // the technician's classification is not yet final.
  if(vis.diagnosisApprovalStatus==='PendingApproval') return {ok:false, error:`This visit's diagnosis (₹${vis.estimatedAmount||0}${vis.disputed?', disputed':''}) requires manager approval before the visit can be completed — a technician cannot self-finalize a case above the ₹${DB.policyConfig.warrantyApprovalThreshold} threshold or a disputed case.`};
  vis.workPerformed = workPerformed||vis.workPerformed; vis.remarks = remarks||vis.remarks;
  vis.customerAcknowledgement = customerAcknowledgement||'';
  vis.evidenceRef = evidenceRef||'';
  vis.evidenceMethod = 'MANUAL_ACKNOWLEDGEMENT — E-SIGNATURE INTEGRATION PENDING';
  vis.status='COMPLETED'; vis.endTime=nowIso(); save();
  logAudit({type:'ServiceVisitCompleted', visitId:id, userId:actor.id, role:actor.role});
  return {ok:true, visit:vis};
}
function cancelServiceVisit({id, reason, actor}){
  const vis = DB.serviceVisits.find(v=>v.id===id);
  if(!vis) return {ok:false, error:'Service visit not found.'};
  if(vis.status==='COMPLETED') return {ok:false, error:'Cannot cancel a Completed visit.'};
  vis.status='CANCELLED'; vis.cancelReason=reason||''; save();
  return {ok:true, visit:vis};
}

// ---------- Service Material / Labour (reuses the existing engines, unmodified) ----------
// §14/§15: routes through the EXISTING createMaterialIssue() with zero modification — same
// account (5000), same inventory engine. sourceType/sourceId (already a Phase 7 parameter of
// createMaterialIssue) tags the movement 'ServiceVisit' for cost traceability/rollup (§17).
// Phase 43 CRITICAL FIX — same class as issueProductionMaterial(): legacy-routed, calls
// createMaterialIssue() with no active transaction boundary, PROVEN LIVE broken under enforce mode.
function issueServiceMaterial({visitId, materialId, qty, warehouseId, actor}){
  const vis = DB.serviceVisits.find(v=>v.id===visitId);
  if(!vis) return {ok:false, error:'Service visit not found.'};
  if(!vis.projectId) return {ok:false, error:'This service visit has no linked project — material issue requires a project for cost attribution.'};
  return withTransaction(actor, {name:'issueServiceMaterial'}, () => {
    const r = createMaterialIssue({projectId:vis.projectId, materialId, qty, warehouseId, purpose:`Service Visit ${vis.visNo||vis.id}`, actor, sourceType:'ServiceVisit', sourceId:visitId});
    if(!r.ok) return r;
    vis.materialIssueIds.push(r.movement.id);
    return r;
  });
}
// §16/§17: existing engine's own posting mechanism (postJournalEntry) is reused directly — same
// existing accounts (5100 Labour Cost / 1000 Bank) as postProductionLabourCost already uses.
// docCategory 'ServiceLabour' is a NEW document-type TAG (not a new account) purely so this
// figure can be rolled up separately in reporting — the identical technique 'ProductionLabour'
// already uses alongside plain 'MaterialIssue' postings on the very same accounts.
function postServiceLabourCost({visitId, technicianId, hours, rate, amount, actor, overrideReason}){
  { const _a = assertCanPostServiceLabourCost(actor); if(!_a.ok) return _a; }
  const vis = DB.serviceVisits.find(v=>v.id===visitId);
  if(!vis) return {ok:false, error:'Service visit not found.'};
  const value = amount!==undefined ? +amount : (+hours||0)*(+rate||0);
  if(!(value>0)) return {ok:false, error:'A positive labour amount (or hours × rate) is required.'};
  const result = postJournalEntry({ date:new Date().toISOString().slice(0,10), narration:`Service labour — ${vis.visNo||vis.id}`, sourceType:'ServiceVisit', sourceId:vis.id,
    voucherNo:nextDocNumber('JE'), docCategory:'ServiceLabour',
    lines:[ {account:'5100', debit:value, credit:0, projectId:vis.projectId||null, customerId:vis.customerId}, {account:'1000', debit:0, credit:value, projectId:vis.projectId||null} ],
    actor, capability:'SERVICE_LABOUR_COST', overrideReason });
  if(!result.ok) return result;
  vis.labourEntryIds.push(result.entry.id); save();
  logAudit({type:'ServiceLabourPosted', visitId, amount:value, userId:actor.id, role:actor.role});
  return {ok:true, entry:result.entry};
}
// §17: full cost traceability — Ticket -> Visit -> Material -> Labour, computed on demand from
// already-existing, already-correct collections (no shadow "final cost" number typed in).
function serviceTicketCostBreakdown(ticketId){
  const visits = DB.serviceVisits.filter(v=>v.ticketId===ticketId);
  let materialCost = 0, labourCost = 0;
  visits.forEach(v=>{
    v.materialIssueIds.forEach(mvId=>{ const mv = DB.inventoryMovements.find(m=>m.id===mvId); if(mv) materialCost += mv.valuationAmount; });
    v.labourEntryIds.forEach(entryId=>{ const je = DB.journalEntries.find(e=>e.id===entryId); if(je) je.lines.forEach(l=>{ if(l.account==='5100') labourCost += l.debit; }); });
  });
  return {ticketId, visitCount:visits.length, materialCost: Math.round(materialCost*100)/100, labourCost: Math.round(labourCost*100)/100, totalCost: Math.round((materialCost+labourCost)*100)/100};
}

// ---------- Chargeable Service Billing (reuses draftCustomerInvoice unmodified — §18) ----------
function draftServiceInvoice({ticketId, customerId, projectId, baseAmount, taxCode, date, createdByUserId, createdByRole}){
  const tkt = DB.serviceTickets.find(t=>t.id===ticketId);
  if(!tkt) return {ok:false, error:'Service ticket not found.'};
  if(tkt.classification!=='Chargeable') return {ok:false, error:`Cannot bill — ticket is classified "${tkt.classification||'(unclassified)'}", not Chargeable. Warranty work must not create customer AR (§19).`};
  const r = draftCustomerInvoice({customerId: customerId||tkt.customerId, projectId: projectId||tkt.projectId, baseAmount, taxCode, date, narration:`Chargeable Service — Ticket ${tkt.tktNo||tkt.id}`, createdByUserId, createdByRole});
  if(r.ok){ r.draft.serviceTicketId = ticketId; save(); }
  return r;
}

// ---------- AMC ----------
// §20: dates/value/terms are operator-supplied, never invented; no default price/frequency.
function createAMCContract({customerId, projectId, site, coveredSystems, startDate, endDate, contractValue, billingTerms, serviceFrequencyMonths, coverage, exclusions, sla, actor}){
  if(!customerId || !startDate || !endDate) return {ok:false, error:'Customer, start date and end date are required.'};
  // ERP AUDIT FIX (ERP-044, High) — customerId had a truthiness check but no EXISTENCE check, and
  // when a projectId was also supplied its OWNERSHIP (project.customerId === customerId) was never
  // verified — live-proven by the audit: an AMC could reference a phantom customer, or a real
  // project belonging to a DIFFERENT customer than the one on the contract.
  //
  // PHASE 1 CLOSURE GATE FIX (regression found by the historical suite, amc_tests.js) — the FIRST
  // version of this fix rejected a project whenever `_proj.customerId !== customerId`, which also
  // fires when `_proj.customerId` is simply null/unset. Checked against real production data
  // (server/db.json): 50 of 246 real projects have no customerId set at all (legacy/pre-linkage
  // projects, e.g. PRJ-1) — the fresh test seed's PRJ-1..PRJ-5 are ALL like this. The original fix
  // would have blocked AMC creation for roughly one in five real projects, a genuine regression,
  // not a false positive in the test. An unset project.customerId is an ABSENCE of data, not proof
  // of a mismatch — only a project that HAS a customerId AND it disagrees is a genuine conflict.
  if(!DB.customers.find(c=>c.id===customerId)) return {ok:false, error:`Unknown customer "${customerId}".`};
  if(projectId){
    const _proj = DB.projects.find(p=>p.id===projectId);
    if(!_proj) return {ok:false, error:`Unknown project "${projectId}".`};
    if(_proj.customerId && _proj.customerId!==customerId) return {ok:false, error:`Project "${projectId}" belongs to customer "${_proj.customerId}", not "${customerId}" — an AMC contract's project must belong to the same customer.`};
  }
  if(!(+contractValue>0)) return {ok:false, error:'BUSINESS POLICY REQUIRED: AMC contract value must be explicitly specified — no default AMC price exists in this Lab.'};
  if(!serviceFrequencyMonths || +serviceFrequencyMonths<=0) return {ok:false, error:'BUSINESS POLICY REQUIRED: AMC service frequency (months between visits) must be explicitly specified.'};
  const amc = { id: nextId(DB.amcContracts, 'AMC-', 4), amcNo:nextDocNumber('AMC'), customerId, projectId:projectId||null, site:site||'',
    coveredSystems:coveredSystems||'', startDate, endDate, contractValue:+contractValue, billingTerms:billingTerms||'', serviceFrequencyMonths:+serviceFrequencyMonths,
    coverage:coverage||'', exclusions:exclusions||'', sla:sla||'', status:'DRAFT', createdBy:actor.id, createdAt:nowIso() };
  DB.amcContracts.push(amc); save();
  logAudit({type:'AMCContractCreated', amcId:amc.id, customerId, contractValue:amc.contractValue, userId:actor.id, role:actor.role});
  return {ok:true, amc};
}
function activateAMCContract({id, actor}){
  const amc = DB.amcContracts.find(a=>a.id===id);
  if(!amc) return {ok:false, error:'AMC contract not found.'};
  if(amc.status!=='DRAFT') return {ok:false, error:`Cannot activate — "${amc.status}", not DRAFT.`};
  if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return {ok:false, error:'Only Admin/CEO/FinanceManager may activate an AMC contract.'};
  amc.status='ACTIVE'; amc.activatedBy=actor.id; save();
  logAudit({type:'AMCContractActivated', amcId:id, userId:actor.id, role:actor.role});
  return {ok:true, amc};
}
function cancelAMCContract({id, reason, actor}){
  const amc = DB.amcContracts.find(a=>a.id===id);
  if(!amc) return {ok:false, error:'AMC contract not found.'};
  if(['CANCELLED','EXPIRED'].includes(amc.status)) return {ok:false, error:`Already "${amc.status}".`};
  if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return {ok:false, error:'Only Admin/CEO/FinanceManager may cancel an AMC contract.'};
  amc.status='CANCELLED'; amc.cancelReason=reason||''; save();
  logAudit({type:'AMCContractCancelled', amcId:id, reason, userId:actor.id, role:actor.role});
  // §18: cancellation NEVER auto-posts a refund/write-off — no such policy has been approved.
  // The remaining deferred balance (money billed for service that will now never be delivered)
  // is surfaced honestly so a human decides, rather than the system silently doing nothing OR
  // silently inventing a refund/write-off entry.
  const sched = amcRevenueSchedule(id);
  const disclosure = sched.deferredBalance>0.005 ? `BUSINESS POLICY REQUIRED: ₹${sched.deferredBalance} remains deferred (billed but not yet recognized as revenue) as of cancellation — no refund/write-off policy is approved, so no accounting entry has been posted for this balance. A human must decide whether to refund the customer, write off the balance, or recognize it immediately, and that decision has not been made here.` : null;
  return {ok:true, amc, deferredBalanceAtCancellation: sched.deferredBalance, disclosure};
}
// §22: renewal is never automatic — a new, explicit, linked contract record is created.
function renewAMCContract({id, startDate, endDate, contractValue, actor}){
  const old = DB.amcContracts.find(a=>a.id===id);
  if(!old) return {ok:false, error:'AMC contract not found.'};
  if(!['ACTIVE','EXPIRED'].includes(old.status)) return {ok:false, error:`Cannot renew — "${old.status}".`};
  const r = createAMCContract({customerId:old.customerId, projectId:old.projectId, site:old.site, coveredSystems:old.coveredSystems,
    startDate: startDate||old.endDate, endDate, contractValue: contractValue||old.contractValue, billingTerms:old.billingTerms,
    serviceFrequencyMonths:old.serviceFrequencyMonths, coverage:old.coverage, exclusions:old.exclusions, sla:old.sla, actor});
  if(!r.ok) return r;
  old.status='RENEWED'; old.renewedIntoId=r.amc.id; save();
  r.amc.renewedFromId=old.id; save();
  logAudit({type:'AMCContractRenewed', oldAmcId:id, newAmcId:r.amc.id, userId:actor.id, role:actor.role});
  return {ok:true, amc:r.amc, previous:old};
}
// §21: AMC schedule creates planned service obligations — operational only, no accounting.
function createAMCScheduleEntry({amcId, plannedDate, actor}){
  const amc = DB.amcContracts.find(a=>a.id===amcId);
  if(!amc) return {ok:false, error:'AMC contract not found.'};
  if(amc.status!=='ACTIVE') return {ok:false, error:`Cannot schedule a visit — AMC is "${amc.status}", not ACTIVE.`};
  const sch = { id:'AMCSCH-'+String(DB.amcSchedules.length+1).padStart(4,'0'), amcId, plannedDate, status:'Planned', ticketId:null, createdBy:actor.id, createdAt:nowIso() };
  DB.amcSchedules.push(sch); save();
  return {ok:true, schedule:sch};
}
function linkAMCScheduleToTicket({scheduleId, ticketId, actor}){
  const sch = DB.amcSchedules.find(s=>s.id===scheduleId);
  if(!sch) return {ok:false, error:'AMC schedule entry not found.'};
  const tkt = DB.serviceTickets.find(t=>t.id===ticketId);
  if(!tkt) return {ok:false, error:'Service ticket not found.'};
  sch.ticketId = ticketId; sch.status='Ticketed'; save();
  return {ok:true, schedule:sch};
}
// §21: billing event reuses draftCustomerInvoice() unmodified — no deferred-revenue/contract-
// liability accounting is invented (§33 explicitly forbids it without approved policy); this is
// a plain, immediate invoice per billing event, tagged for traceability only.
// Phase 13 POL-05 (approved: Option B, deferred/monthly recognition). §16 required inspecting
// the existing Chart of Accounts before inventing anything: account 2100 "Customer Advance
// Liability" is exactly the right existing account — a Liability representing money the company
// owes future goods/service for — so it is REUSED here, not a new account. docCategory stays
// 'CustomerInvoice' so the AR engine (open items, ageing, receipt, clearing — all completely
// unmodified) keeps working; only the CREDIT side (2100 instead of 4000) differs from a normal
// invoice, achieving deferral without a second invoice/AR mechanism.
function draftAMCBillingInvoice({amcId, baseAmount, taxCode, date, createdByUserId, createdByRole}){
  const amc = DB.amcContracts.find(a=>a.id===amcId);
  if(!amc) return {ok:false, error:'AMC contract not found.'};
  if(amc.status!=='ACTIVE') return {ok:false, error:`Cannot bill — AMC is "${amc.status}", not ACTIVE.`};
  if(!amc.projectId) return {ok:false, error:'AMC contract has no linked project — billing requires one for AR/project attribution.'};
  const base = baseAmount!==undefined ? +baseAmount : amc.contractValue;
  if(!(base>0)) return {ok:false, error:'A positive billing amount is required.'};
  const tax = taxCode ? calcTax(taxCode, base) : null;
  const lines = [ {account:AR_ACCOUNT, debit: r2(base+(tax?tax.taxAmount:0)), credit:0, customerId:amc.customerId, projectId:amc.projectId, taxCode:taxCode||null},
    {account:'2100', debit:0, credit:r2(base), customerId:amc.customerId, projectId:amc.projectId} ];
  if(tax && tax.taxAmount>0) lines.push({account:'2200', debit:0, credit:r2(tax.taxAmount), customerId:amc.customerId, projectId:amc.projectId, taxCode});
  const r = createDraft({date, narration:`AMC Billing (Deferred Revenue) — ${amc.amcNo||amc.id}`, docTypeCode:'INV', sourceType:'AMC Billing', docCategory:'CustomerInvoice', party:amc.customerId, lines, createdByUserId, createdByRole});
  if(r.ok){ r.draft.amcContractId = amcId; save(); }
  return r;
}
function monthsBetweenInclusive(start, end){
  return Math.max(1, (end.getFullYear()-start.getFullYear())*12 + (end.getMonth()-start.getMonth()) + 1);
}
// Ledger-sourced (not a cached total) — recomputed from actual posted entries every time, so it
// can never silently drift from what was really posted.
// Phase 16 §13 — DEFECT FOUND & FIXED: unlike `amcRecognizedTotal()` immediately below (which
// already correctly excludes reversed entries), this one summed a billed entry's credit even
// after it had been reversed. Same fix — skip an entry once `reversedByEntryId` is set.
function amcBilledTotal(amcId){
  return r2(DB.jeDrafts.filter(d=>d.status==='Posted' && d.amcContractId===amcId)
    .reduce((s,d)=>{ const je=DB.journalEntries.find(e=>e.id===d.postedEntryId); if(!je || je.reversedByEntryId) return s; return s + je.lines.filter(l=>l.account==='2100').reduce((s2,l)=>s2+l.credit,0); }, 0));
}
function amcRecognizedTotal(amcId){
  return r2(DB.journalEntries.filter(je=>je.docCategory==='AMCRevenueRecognition' && je.sourceType==='AMC Revenue Recognition' && je.sourceId===amcId && !je.reversalOfId && !je.reversedByEntryId)
    .flatMap(je=>je.lines).filter(l=>l.account==='4000').reduce((s,l)=>s+l.credit,0));
}
// §14/§21 — the authoritative distinction management now requires: Contract Value, Billed,
// Recognized (Posted Revenue), and Deferred Balance are FOUR separate numbers, never conflated.
function amcRevenueSchedule(amcId){
  const amc = DB.amcContracts.find(a=>a.id===amcId);
  if(!amc) return null;
  const totalMonths = monthsBetweenInclusive(new Date(amc.startDate), new Date(amc.endDate));
  const billed = amcBilledTotal(amcId);
  const recognized = amcRecognizedTotal(amcId);
  return { amcId, contractValue: amc.contractValue, totalMonths, monthlyAmount: r2(amc.contractValue/totalMonths),
    billed, recognized, deferredBalance: r2(billed-recognized), recognizedPeriods: amc.recognizedPeriods||[] };
}
// §17: monthly recognition, capped so recognized NEVER exceeds what was actually billed/deferred
// (never fabricates revenue for an unbilled period) and never exceeds the contract value overall;
// the final recognizable period absorbs any rounding remainder so the totals land exactly, not
// approximately, on the contract value once fully billed and fully recognized.
function recognizeAMCRevenue({amcId, periodDate, actor, overrideReason}){
  { const _a = assertCanRecognizeAMCRevenue(actor); if(!_a.ok) return _a; }
  const amc = DB.amcContracts.find(a=>a.id===amcId);
  if(!amc) return {ok:false, error:'AMC contract not found.'};
  const period = (periodDate||new Date().toISOString().slice(0,10)).slice(0,7); // YYYY-MM
  if(!amc.recognizedPeriods) amc.recognizedPeriods = [];
  if(amc.recognizedPeriods.includes(period)) return {ok:false, error:`Period ${period} has already been recognized for this AMC contract — no double recognition.`};
  const sched = amcRevenueSchedule(amcId);
  if(sched.deferredBalance<=0.005) return {ok:false, error:'Nothing to recognize — deferred balance is zero (either not yet billed, or already fully recognized).'};
  const remainingPeriods = sched.totalMonths - sched.recognizedPeriods.length;
  const isFinalRecognizablePeriod = remainingPeriods<=1 || sched.deferredBalance <= sched.monthlyAmount + 0.01;
  const amount = isFinalRecognizablePeriod ? sched.deferredBalance : Math.min(sched.monthlyAmount, sched.deferredBalance);
  const _rDate = periodDate||new Date().toISOString().slice(0,10);
  const result = postJournalEntry({ date:_rDate, narration:`AMC Revenue Recognition — ${period} — ${amc.amcNo||amc.id}`,
    sourceType:'AMC Revenue Recognition', sourceId:amcId, voucherNo:nextDocNumber('JE', _rDate), docCategory:'AMCRevenueRecognition',
    lines:[ {account:'2100', debit:r2(amount), credit:0, projectId:amc.projectId, customerId:amc.customerId}, {account:'4000', debit:0, credit:r2(amount), projectId:amc.projectId, customerId:amc.customerId} ],
    actor, capability:'AMC_REVENUE_RECOGNITION', overrideReason });
  if(!result.ok) return result;
  amc.recognizedPeriods.push(period); save();
  logAudit({type:'AMCRevenueRecognized', amcId, period, amount:r2(amount), userId:actor.id, role:actor.role});
  return {ok:true, entry:result.entry, period, amount:r2(amount), schedule:amcRevenueSchedule(amcId)};
}

// ---------- CAPA ----------
// §26: CAPA is a deliberate escalation, never auto-created for every complaint — the trigger
// reason is a required, explicit field, not inferred.
function createCAPACase({trigger, sourceComplaintId, sourceTicketId, problem, actor}){
  if(!CAPA_TRIGGERS.includes(trigger)) return {ok:false, error:`Trigger must be one of ${CAPA_TRIGGERS.join('/')} — CAPA is not created automatically for every complaint.`};
  if(!problem) return {ok:false, error:'Problem statement is required.'};
  const capa = { id:'CAPA-'+String(DB.capaCases.length+1).padStart(4,'0'), capaNo:nextDocNumber('CAPA'), trigger, sourceComplaintId:sourceComplaintId||null, sourceTicketId:sourceTicketId||null,
    problem, rootCause:null, correction:null, correctiveAction:null, preventiveAction:null, owner:null, dueDate:null,
    evidence:null, verification:null, verifiedBy:null, effectivenessCheck:null, effectivenessCheckedBy:null, effectivenessResult:null,
    status:'OPEN', createdBy:actor.id, createdAt:nowIso() };
  DB.capaCases.push(capa); save();
  logAudit({type:'CAPACreated', capaId:capa.id, trigger, userId:actor.id, role:actor.role});
  return {ok:true, capa};
}
function recordCAPAAnalysis({id, rootCause, actor}){
  const capa = DB.capaCases.find(c=>c.id===id);
  if(!capa) return {ok:false, error:'CAPA case not found.'};
  if(!['OPEN','ANALYSIS'].includes(capa.status)) return {ok:false, error:`Cannot record analysis — "${capa.status}".`};
  capa.rootCause = rootCause; capa.status='ANALYSIS'; save();
  return {ok:true, capa};
}
function recordCAPAAction({id, correction, correctiveAction, preventiveAction, owner, dueDate, actor}){
  const capa = DB.capaCases.find(c=>c.id===id);
  if(!capa) return {ok:false, error:'CAPA case not found.'};
  if(!capa.rootCause) return {ok:false, error:'Root cause must be recorded before actions can be defined.'};
  if(!owner || !dueDate) return {ok:false, error:'Owner and due date are required.'};
  Object.assign(capa, {correction:correction||capa.correction, correctiveAction, preventiveAction, owner, dueDate, status:'ACTION'}); save();
  logAudit({type:'CAPAActionDefined', capaId:id, owner, dueDate, userId:actor.id, role:actor.role});
  return {ok:true, capa};
}
function recordCAPAVerification({id, evidence, actor}){
  const capa = DB.capaCases.find(c=>c.id===id);
  if(!capa) return {ok:false, error:'CAPA case not found.'};
  if(capa.status!=='ACTION') return {ok:false, error:`Cannot verify — "${capa.status}", not ACTION.`};
  // §27: the person who owns/implements the action should not be the sole verifier — a real SoD
  // control, same shape as the existing snag resolve/verify separation.
  if(capa.owner===actor.id && !['CEO','Admin'].includes(actor.role)) return {ok:false, error:'Segregation of duties: the CAPA owner who implemented the action cannot also verify it.'};
  capa.evidence = evidence; capa.verifiedBy = actor.id; capa.status='VERIFICATION'; save();
  logAudit({type:'CAPAVerified', capaId:id, userId:actor.id, role:actor.role});
  return {ok:true, capa};
}
// §28: effectiveness is a SEPARATE, explicit check — "action done" != "action proven effective".
function recordCAPAEffectivenessCheck({id, effectivenessCheck, effectivenessResult, actor}){
  const capa = DB.capaCases.find(c=>c.id===id);
  if(!capa) return {ok:false, error:'CAPA case not found.'};
  if(capa.status!=='VERIFICATION') return {ok:false, error:`Cannot record effectiveness — "${capa.status}", not VERIFICATION.`};
  if(capa.verifiedBy===actor.id && !['CEO','Admin'].includes(actor.role)) return {ok:false, error:'Segregation of duties: the person who verified completion cannot also confirm effectiveness.'};
  if(!['Effective','NotEffective'].includes(effectivenessResult)) return {ok:false, error:'effectivenessResult must be Effective or NotEffective.'};
  capa.effectivenessCheck = effectivenessCheck; capa.effectivenessResult = effectivenessResult; capa.effectivenessCheckedBy = actor.id; capa.status='EFFECTIVENESS'; save();
  logAudit({type:'CAPAEffectivenessChecked', capaId:id, effectivenessResult, userId:actor.id, role:actor.role});
  return {ok:true, capa};
}
function closeCAPACase({id, actor}){
  const capa = DB.capaCases.find(c=>c.id===id);
  if(!capa) return {ok:false, error:'CAPA case not found.'};
  if(capa.status!=='EFFECTIVENESS') return {ok:false, error:`Cannot close — "${capa.status}", not EFFECTIVENESS.`};
  if(capa.effectivenessResult!=='Effective') return {ok:false, error:`Cannot close — effectiveness check result was "${capa.effectivenessResult}", not Effective. A CAPA whose action did not prove effective must be reopened/re-actioned, not closed.`};
  capa.status='CLOSED'; capa.closedBy=actor.id; save();
  logAudit({type:'CAPAClosed', capaId:id, userId:actor.id, role:actor.role});
  return {ok:true, capa};
}

// ---------- Service Closure (§29) — a real gate, not a UI status flip ----------
function serviceTicketClosureReadiness(ticketId){
  const tkt = DB.serviceTickets.find(t=>t.id===ticketId);
  if(!tkt) return {ready:false, reasons:['Ticket not found.']};
  const reasons = [];
  const visits = DB.serviceVisits.filter(v=>v.ticketId===ticketId);
  if(!visits.length) reasons.push('No service visit has been recorded.');
  else if(!visits.some(v=>v.status==='COMPLETED')) reasons.push('No service visit is marked Completed.');
  const completed = visits.find(v=>v.status==='COMPLETED');
  if(completed && !completed.customerAcknowledgement) reasons.push('Completed visit has no customer acknowledgement recorded.');
  if(completed && !completed.diagnosis) reasons.push('Completed visit has no diagnosis recorded.');
  if(tkt.classification==='Chargeable'){
    const hasInvoice = DB.jeDrafts.some(d=>d.serviceTicketId===ticketId);
    if(!hasInvoice) reasons.push('Ticket is Chargeable but no service invoice has been drafted.');
  }
  return {ready: reasons.length===0, reasons};
}
function closeServiceTicket({id, actor}){
  const tkt = DB.serviceTickets.find(t=>t.id===id);
  if(!tkt) return {ok:false, error:'Ticket not found.'};
  if(tkt.status==='CLOSED') return {ok:false, error:'Ticket is already Closed.'};
  const readiness = serviceTicketClosureReadiness(id);
  if(!readiness.ready) return {ok:false, error:'Ticket prerequisites not met: '+readiness.reasons.join(' | '), reasons:readiness.reasons};
  tkt.status='CLOSED'; tkt.closedAt = nowIso(); save();
  const sla = ticketSlaStatus(id);
  logAudit({type:'ServiceTicketClosed', ticketId:id, userId:actor.id, role:actor.role, responseSla: sla?.response.status, visitSla: sla?.visit.status});
  return {ok:true, ticket:tkt, sla};
}

// ============================================================
// Phase 13 — Approved Policy Implementation
// ============================================================

// ---------- POL-06: Service Labour Rate Card (configuration structure only — §10/§19) ----------
function setServiceLabourRate({technicianLevel, skill, location, normalHourRate, overtimeRate, emergencyRate, weekendHolidayRate, travelRate, sacCode, actor}){
  if(!technicianLevel) return {ok:false, error:'technicianLevel is required.'};
  const key = `${technicianLevel}|${skill||''}|${location||''}`;
  let rate = DB.serviceLabourRates.find(r=>r.key===key);
  // Phase 19 §4 — SAC (Services Accounting Code) is OPTIONAL, attached at the rate-card level
  // since that's the closest thing this Lab has to a "service item" master. Never invented — an
  // empty/omitted sacCode stays null, exactly like every other optional tax-classification field.
  const fields = {normalHourRate:+normalHourRate||0, overtimeRate:+overtimeRate||0, emergencyRate:+emergencyRate||0, weekendHolidayRate:+weekendHolidayRate||0, travelRate:+travelRate||0, sacCode: sacCode!==undefined ? (sacCode||null) : (rate?rate.sacCode:null)};
  if(rate){ Object.assign(rate, fields); rate.updatedBy=actor.id; rate.updatedAt=nowIso(); }
  else { rate = { id:'RATE-'+String(DB.serviceLabourRates.length+1).padStart(4,'0'), key, technicianLevel, skill:skill||'', location:location||'', ...fields, configuredBy:actor.id, configuredAt:nowIso() }; DB.serviceLabourRates.push(rate); }
  save();
  logAudit({type:'ServiceLabourRateConfigured', rateId:rate.id, technicianLevel, skill, location, userId:actor.id, role:actor.role});
  return {ok:true, rate};
}
function getServiceLabourRate({technicianLevel, skill, location}){
  const key = `${technicianLevel}|${skill||''}|${location||''}`;
  const rate = DB.serviceLabourRates.find(r=>r.key===key);
  return rate ? {configured:true, rate} : {configured:false, status:'NOT_CONFIGURED'};
}

// ---------- POL-07: Warranty/Chargeable Diagnosis Approval (approved threshold: ₹10,000) ----------
// DB-backed and admin-editable (§14's Policy Configuration Screen), unlike GRN tolerance above —
// management explicitly described this as a value they may revise, not a hard-coded constant.
function diagnosisRequiresApproval({estimatedAmount, disputed}){
  if(disputed) return true; // any disputed case requires manager review regardless of amount
  return (+estimatedAmount||0) > DB.policyConfig.warrantyApprovalThreshold;
}
function setPolicyConfig({key, value, actor}){
  const editable = new Set(['warrantyApprovalThreshold','slaResponseHours','slaVisitHours','slaWarningThresholdHours']);
  if(!editable.has(key)) return {ok:false, error:`"${key}" is not an admin-editable policy value (some policies — e.g. GRN tolerance, inventory valuation method, AMC recognition method, role model — are fixed, tested architectural decisions, not runtime toggles).`};
  const old = DB.policyConfig[key];
  DB.policyConfig[key] = value===null ? null : +value;
  DB.policyConfig.history = DB.policyConfig.history||[];
  DB.policyConfig.history.push({key, oldValue:old, newValue:DB.policyConfig[key], changedBy:actor.id, changedByRole:actor.role, at:nowIso()});
  save();
  logAudit({type:'PolicyConfigChanged', key, oldValue:old, newValue:DB.policyConfig[key], userId:actor.id, role:actor.role});
  return {ok:true, policyConfig:DB.policyConfig};
}
function approveDiagnosis({visitId, decision, reason, actor}){
  const vis = DB.serviceVisits.find(v=>v.id===visitId);
  if(!vis) return {ok:false, error:'Service visit not found.'};
  if(vis.diagnosisApprovalStatus!=='PendingApproval') return {ok:false, error:`No diagnosis approval is pending for this visit (status: "${vis.diagnosisApprovalStatus||'NotRequired'}").`};
  // SoD: the technician who recorded the diagnosis cannot approve their own high-value/disputed
  // classification — mirrors the existing Snag/CAPA independent-verification pattern exactly.
  if(vis.diagnosedBy===actor.id && !['CEO','Admin'].includes(actor.role)) return {ok:false, error:'Segregation of duties: the technician who recorded this diagnosis cannot approve it themselves.'};
  if(!['Approved','Rejected'].includes(decision)) return {ok:false, error:'decision must be Approved or Rejected.'};
  vis.diagnosisApprovalStatus = decision==='Approved' ? 'Approved' : 'Rejected';
  vis.diagnosisApprovedBy = actor.id; vis.diagnosisApprovalReason = reason||''; vis.diagnosisApprovalAt = nowIso();
  save();
  logAudit({type:'DiagnosisApprovalDecision', visitId, decision, technicianId:vis.diagnosedBy, estimatedAmount:vis.estimatedAmount, disputed:!!vis.disputed, reason:reason||'', userId:actor.id, role:actor.role});
  return {ok:true, visit:vis};
}

// ---------- POL-08: Service SLA — CORRECTED per management's follow-up (two independent clocks,
// both measured from the same SLA Start = ticket creation; Resolution explicitly NOT approved
// yet and must never be fabricated). Approved: Response = 4h, Site Visit = 72h. Warning
// thresholds are NOT approved either — WARNING is only ever emitted if one is later configured;
// until then only ACTIVE/BREACHED/MET are shown, never a guessed warning window (§ "do not
// invent the warning percentage/time"). No endpoint anywhere accepts a caller-supplied SLA due
// date or SLA status — both are always purely computed from `tkt.createdAt`/event timestamps,
// never stored/settable, which is what makes "modify SLA via direct API" structurally impossible
// rather than merely permission-denied.
// DB-backed and admin-editable, defaulting to the approved values (Response=4h, Visit=72h);
// slaWarningThresholdHours stays null (no warning policy approved) until explicitly configured.
function slaClockStatus(startDate, targetHours, actualDate, now){
  const start = new Date(startDate);
  const due = new Date(start.getTime() + targetHours*3600000);
  if(actualDate){
    const actual = new Date(actualDate);
    return { due: due.toISOString(), actual: actualDate, status: actual<=due ? 'MET' : 'BREACHED' };
  }
  const warningHours = DB.policyConfig.slaWarningThresholdHours;
  let status = 'ACTIVE';
  if(now>due) status = 'BREACHED';
  else if(warningHours!=null && now >= new Date(due.getTime()-warningHours*3600000)) status = 'WARNING';
  return { due: due.toISOString(), actual: null, status };
}
function ticketSlaStatus(ticketId){
  const tkt = DB.serviceTickets.find(t=>t.id===ticketId);
  if(!tkt) return null;
  const now = new Date();
  const responseHours = DB.policyConfig.slaResponseHours, visitHours = DB.policyConfig.slaVisitHours;
  const firstVisit = DB.serviceVisits.filter(v=>v.ticketId===ticketId && v.startTime).sort((a,b)=>new Date(a.startTime)-new Date(b.startTime))[0];
  const response = slaClockStatus(tkt.createdAt, responseHours, tkt.firstRespondedAt||null, now);
  const visit = slaClockStatus(tkt.createdAt, visitHours, firstVisit?firstVisit.startTime:null, now);
  return {
    slaStart: tkt.createdAt,
    response: { ...response, status: 'SLA_RESPONSE_'+response.status, targetHours: responseHours },
    visit: { ...visit, status: 'SLA_VISIT_'+visit.status, targetHours: visitHours },
    resolution: { configured:false, status:'RESOLUTION SLA — NOT CONFIGURED' }
  };
}
function rejectServiceTicket({id, reason, actor}){
  const tkt = DB.serviceTickets.find(t=>t.id===id);
  if(!tkt) return {ok:false, error:'Ticket not found.'};
  if(['CLOSED','REJECTED'].includes(tkt.status)) return {ok:false, error:`Ticket is already "${tkt.status}".`};
  tkt.status='REJECTED'; tkt.rejectReason=reason||''; save();
  return {ok:true, ticket:tkt};
}

// ---------- Repeat Complaint Detection (§25) — read-only pattern surfacing, no new records ----------
function repeatComplaintHistory({customerId, projectId, product}){
  const complaints = DB.complaints.filter(c=> (customerId && c.customerId===customerId) || (projectId && c.projectId===projectId) || (product && c.product===product));
  const tickets = DB.serviceTickets.filter(t=> complaints.some(c=>c.id===t.complaintId) || (customerId && t.customerId===customerId) || (projectId && t.projectId===projectId));
  const visits = DB.serviceVisits.filter(v=>tickets.some(t=>t.id===v.ticketId));
  return {isRepeat: complaints.length>1, complaintCount:complaints.length, complaints, tickets, visits};
}

// ---------- Customer 360 aggregation (§4) — read-only composition, no duplicated customer data ----------
function customerAfterSalesSummary(customerId){
  return {
    customerId,
    warranties: DB.warranties.filter(w=>w.customerId===customerId).map(w=>({...w, effectiveStatus:warrantyEffectiveStatus(w)})),
    complaints: DB.complaints.filter(c=>c.customerId===customerId),
    tickets: DB.serviceTickets.filter(t=>t.customerId===customerId),
    visits: DB.serviceVisits.filter(v=>v.customerId===customerId),
    amcContracts: DB.amcContracts.filter(a=>a.customerId===customerId),
    outstandingAR: Math.round(customerOpenItems(customerId).reduce((s,i)=>s+i.open,0)*100)/100
  };
}

// ============================================================
// Phase 11 — Financial Integration, Management Control, Project/Customer Profitability
// ============================================================
// §3/§4/§6 discipline: NO second accounting engine, NO change to projectPL()'s existing code or
// output (it is byte-for-byte unchanged and is repurposed, unmodified, as the "Lifecycle P&L" —
// it was ALREADY summing every Income/Expense-account line tagged with a project, which already
// includes after-sales postings like ServiceLabour and chargeable-service/AMC customer invoices,
// since Phase 10 deliberately reused the same accounts/docCategories for AR compatibility). What
// Phase 11 adds is a NEW "Core" (original-project-only) computation that SUBTRACTS the
// after-sales-tagged amounts back out, and a NEW after-sales rollup — both are read-only
// aggregations over already-existing, already-correct collections, exactly like
// projectCostBreakdown() and serviceTicketCostBreakdown() before them.

// §12/§13/§14: computed ONLY from actual posted transactions — never a manually editable field,
// never counted from a draft/quote/visit before it is genuinely posted.
function afterSalesFinancials(projectId){
  const tickets = DB.serviceTickets.filter(t=>t.projectId===projectId);
  const warrantyTicketIds = new Set(tickets.filter(t=>t.classification==='Warranty').map(t=>t.id));
  const chargeableTicketIds = new Set(tickets.filter(t=>t.classification==='Chargeable').map(t=>t.id));
  const visits = DB.serviceVisits.filter(v=>v.projectId===projectId);

  let warrantyMaterial=0, warrantyLabour=0, chargeableMaterial=0, chargeableLabour=0;
  visits.forEach(v=>{
    const matCost = v.materialIssueIds.reduce((s,id)=>{ const mv=DB.inventoryMovements.find(m=>m.id===id); return s+(mv?mv.valuationAmount:0); },0);
    // DEFECT FOUND & FIXED (Phase 16 §13): `labourEntryIds` stores the ORIGINAL entry's ID only —
    // a reversal creates a NEW entry the visit record never learns about, so a reversed service
    // labour posting used to still count at full value forever. Skip an entry that has been
    // reversed (`reversedByEntryId` is set on the original when `reverseEntry()` runs).
    const labCost = v.labourEntryIds.reduce((s,id)=>{ const je=DB.journalEntries.find(e=>e.id===id); if(!je || je.reversedByEntryId) return s; return s + je.lines.filter(l=>l.account==='5100').reduce((s2,l)=>s2+l.debit,0); },0);
    if(warrantyTicketIds.has(v.ticketId)){ warrantyMaterial+=matCost; warrantyLabour+=labCost; }
    if(chargeableTicketIds.has(v.ticketId)){ chargeableMaterial+=matCost; chargeableLabour+=labCost; }
  });

  // §13: Chargeable Service Revenue comes ONLY from POSTED customer invoices (draft.status==='Posted'),
  // identified via the serviceTicketId tag draftServiceInvoice() attaches — never from draft/ticket/visit amounts.
  // Phase 16 §13 DEFECT FOUND & FIXED: skip an entry once reversed (same class as amcBilledTotal above).
  const chargeableRevenue = DB.jeDrafts.filter(d=>d.status==='Posted' && d.serviceTicketId && chargeableTicketIds.has(d.serviceTicketId))
    .reduce((s,d)=>{ const je=DB.journalEntries.find(e=>e.id===d.postedEntryId); if(!je || je.reversedByEntryId) return s; return s + je.lines.filter(l=>l.account==='4000').reduce((s2,l)=>s2+l.credit,0); },0);

  // §14: AMC Revenue comes ONLY from POSTED AMC invoices, never merely the contract value.
  // Phase 13 POL-05: AMC billing now credits Deferred Revenue (2100), not Revenue (4000)
  // directly — "Billed" and "Revenue" (recognized) are now genuinely different numbers, per
  // approved policy. Contract Value ≠ Billed ≠ Posted Revenue ≠ Collected, never conflated.
  const amcContractsForProject = DB.amcContracts.filter(a=>a.projectId===projectId);
  const amcContractValue = amcContractsForProject.reduce((s,a)=>s+a.contractValue,0);
  const amcBilled = amcContractsForProject.reduce((s,a)=>s+amcBilledTotal(a.id),0);
  const amcRevenue = amcContractsForProject.reduce((s,a)=>s+amcRecognizedTotal(a.id),0);
  const amcDeferredBalance = r2(amcBilled-amcRevenue);

  return {
    warrantyMaterialCost: r2(warrantyMaterial), warrantyLabourCost: r2(warrantyLabour), warrantyCost: r2(warrantyMaterial+warrantyLabour),
    chargeableServiceMaterialCost: r2(chargeableMaterial), chargeableServiceLabourCost: r2(chargeableLabour), chargeableServiceCost: r2(chargeableMaterial+chargeableLabour),
    chargeableServiceRevenue: r2(chargeableRevenue),
    amcContractValue: r2(amcContractValue), amcBilled: r2(amcBilled), amcRevenue: r2(amcRevenue), amcDeferredBalance
  };
}
// §6A: the "Core" project P&L — original project only, after-sales amounts subtracted back out
// of the SAME source lines projectPL() already sums, so Core + After-Sales == projectPL()'s
// existing (now relabeled "Lifecycle") total, by construction — never two independently-computed
// numbers that could silently drift apart.
function coreProjectPL(projectId){
  const lifecycle = projectPL(projectId);
  const as = afterSalesFinancials(projectId);
  const coreRevenue = r2(lifecycle.revenue - as.chargeableServiceRevenue - as.amcRevenue);
  const coreCost = r2(lifecycle.cost - as.warrantyCost - as.chargeableServiceCost);
  const coreProfit = r2(coreRevenue - coreCost);
  return { revenue: coreRevenue, cost: coreCost, profit: coreProfit, marginPct: coreRevenue>0 ? r2(coreProfit/coreRevenue*100) : null };
}
// §4/§5 — the authoritative Project Financial 360: every figure kept SEPARATE, never merged,
// each traceable to the read-only aggregation function that computed it (§28 traceability).
function projectFinancial360(projectId){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return {ok:false, error:'Project not found.'};
  const quotation = p.quotationId ? DB.quotations.find(q=>q.id===p.quotationId) : null;
  const changeRequests = DB.changeRequests.filter(c=>c.projectId===projectId);
  const approvedChanges = changeRequests.filter(c=>c.status==='Approved');
  const approvedChangeRevenue = r2(approvedChanges.reduce((s,c)=>s+c.revenueImpact,0));
  // Phase 14 §30/§48 Coverage Audit finding: `costImpact` has been captured on every Change
  // Request since Phase 6B but was never surfaced here — a real, cheap gap to close (existing
  // data, not invented). Maps to §30's "Other Approved Cost."
  const approvedChangeCost = r2(approvedChanges.reduce((s,c)=>s+(c.costImpact||0),0));
  const baseline = [...DB.standardCostBaselines.filter(b=>b.projectId===projectId)].sort((a,b)=>b.version-a.version)[0] || null;
  const costBreakdown = projectCostBreakdown(projectId); // committed/received/invoiced/paid/consumed — unchanged, Phase 7
  const invMovements = DB.inventoryMovements.filter(m=>m.projectId===projectId);
  const received = invMovements.filter(m=>m.type==='Receipt').reduce((s,m)=>s+m.valuationAmount,0);
  const issued = invMovements.filter(m=>m.type==='Issue').reduce((s,m)=>s+m.valuationAmount,0);
  // DEFECT FOUND & FIXED (Phase 16 §13 Reconciliation Gate): all three sums below used to total
  // .debit only, never netting .credit — a reversed Material Issue or Labour Cost entry (whose
  // reversal carries the same account with debit/credit flipped) was silently still counted at
  // its full original value, forever, in every project's Actual Cost / Financial 360 / P&L. Found
  // via a direct reversal test on a brand-new Installation Cost posting, then confirmed to be a
  // genuine PRE-EXISTING defect (reproduced identically on materialCost, unrelated to Phase 15/16
  // — see the Phase 16 report for the isolated repro). Fixed by netting debit-minus-credit
  // everywhere a project's actual cost is summed from GL lines, so a reversal now correctly zeros
  // itself out, exactly as the real GL balance already does.
  const materialCost = allLines().filter(l=>l.projectId===projectId).filter(l=>l.account==='5000').reduce((s,l)=>s+l.debit-l.credit,0);
  const labourCostAll = allLines().filter(l=>l.projectId===projectId).filter(l=>l.account==='5100').reduce((s,l)=>s+l.debit-l.credit,0);
  // Phase 15 §2 — real Installation Cost, sourced from CC-INSTALLATION-tagged 5100 lines
  // (posted via `postInstallationLabourCost()`). Subtracted from manufacturing.labourCost below
  // so the total (materialCost+labourCostAll, i.e. `cost.actual`) never changes — installation
  // cost is a re-labeled SLICE of the existing total, not an additional, double-counted figure.
  const installationCost = allLines().filter(l=>l.projectId===projectId && l.account==='5100' && l.costCentreId==='CC-INSTALLATION').reduce((s,l)=>s+l.debit-l.credit,0);
  const as = afterSalesFinancials(projectId);
  const lifecycle = projectPL(projectId);
  const core = coreProjectPL(projectId);
  const custOpen = customerOpenItems(p.customerId).filter(i=>i.projectId===projectId);
  const invoicedRevenue = custOpen.reduce((s,i)=>s+i.original,0);
  const collected = custOpen.reduce((s,i)=>s+(i.original-i.open),0);
  const outstanding = custOpen.reduce((s,i)=>s+i.open,0);
  return { ok:true, projectId,
    contract: { contractRevenue: quotation ? quotation.finalPrice : (p.approvedRevenue||null), approvedChangeRevenue, currentContractValue: r2((quotation?quotation.finalPrice:(p.approvedRevenue||0)) + approvedChangeRevenue) },
    // Phase 30 P29-1 FIX: `actual` used to be a locally-recomputed r2(materialCost+labourCostAll)
    // — a SECOND, competing cost formula that only ever looked at accounts 5000/5100 by name, so
    // it silently excluded Project Expense (5200, added in Phase 28) and any future Expense-type
    // account. `coreProjectPL().cost` (computed above as `core`) is the SAME authoritative,
    // already-tested calculation the top-of-screen summary and Profitability section both use —
    // it sums every Expense-type GL account generically (materialCost+labourCostAll+projectExpense
    // +...), already nets debit-credit (so reversals/credit notes are handled), and already
    // excludes after-sales cost correctly. There is now exactly ONE Project Actual Cost formula;
    // this field is a direct reference to it, not a recomputation.
    cost: { standardCost: baseline ? baseline.totalStandardCost : null, committed: costBreakdown.committed, received: costBreakdown.received, actual: core.cost, forecast: r2(costBreakdown.committed + core.cost) },
    // Phase 13 POL-11 (approved): PO Gross/Outstanding separately surfaced alongside the
    // EXISTING committed-cost logic (costBreakdown.committed), which is unchanged and unreplaced.
    procurement: { poGrossValue: r2(DB.purchaseOrders.filter(po=>po.projectId===projectId && po.status!=='Cancelled').reduce((s,po)=>s+po.total,0)),
      poInvoicedValue: costBreakdown.invoiced, poPaidValue: costBreakdown.paid,
      poOutstanding: r2(DB.purchaseOrders.filter(po=>po.projectId===projectId && po.status!=='Cancelled').reduce((s,po)=>s+po.total,0) - costBreakdown.invoiced),
      grnValue: costBreakdown.received, committedCost: costBreakdown.committed },
    // Phase 24 Part C10 — the REAL Commitment Engine (createCommitmentFromPO/reduceCommitment/
    // releaseCommitment), a proper lifecycle object, not a re-derived PO sum. `procurement.
    // committedCost` above is left unchanged/unreplaced (Phase 13 POL-11's own instruction, still
    // honored — nothing existing is removed), but THIS field is the one with a real create/
    // reduce/release audit trail behind it. Deliberately no "Budget" field — no budget model
    // exists in this Lab, and the brief explicitly says not to invent one.
    commitment: projectCommitments(projectId),
    inventory: { received: r2(received), issued: r2(issued), remaining: r2(received-issued) },
    manufacturing: { materialCost: r2(materialCost - as.warrantyMaterialCost - as.chargeableServiceMaterialCost), labourCost: r2(labourCostAll - as.warrantyLabourCost - as.chargeableServiceLabourCost - installationCost) },
    // §30 "Execution" — Phase 15 §2: Installation Cost is now REAL (see postInstallationLabourCost
    // above), sourced from CC-INSTALLATION-tagged lines, never a fabricated split.
    execution: { installationCost: r2(installationCost), approvedOtherCost: approvedChangeCost },
    revenue: { customerInvoice: r2(invoicedRevenue), postedRevenue: lifecycle.revenue, ar: r2(outstanding), collected: r2(collected), outstanding: r2(outstanding) },
    afterSales: as,
    profitability: { originalProjectMargin: core, currentProjectMargin: { revenue: r2(core.revenue+approvedChangeRevenue), cost: core.cost, profit: r2(core.revenue+approvedChangeRevenue-core.cost) },
      lifecycleMargin: lifecycle, afterSalesImpact: r2(as.chargeableServiceRevenue - as.chargeableServiceCost - as.warrantyCost + as.amcRevenue) }
  };
}
// §7 — Customer Profitability: composes existing per-project figures across every project this
// customer has, plus the existing customerOpenItems()/after-sales summary — no new engine.
function customerProfitability(customerId){
  const projects = DB.projects.filter(p=>p.customerId===customerId);
  // Phase 41 FIX — a project whose projectFinancial360() call failed used to be dropped from both
  // the row list AND the totals with zero indication anywhere in the response, silently
  // understating the customer's real numbers. Now the excluded project is named in `omitted` so a
  // reader knows the totals below are partial, not wrong.
  const omitted = [];
  const rows = projects.map(p=>{
    const f = projectFinancial360(p.id);
    if(!f.ok){ omitted.push({projectId:p.id, projectName:p.name, error:f.error}); return null; }
    return { projectId:p.id, projectName:p.name, revenue:f.revenue.postedRevenue, cost:f.profitability.lifecycleMargin.cost,
      warrantyCost:f.afterSales.warrantyCost, chargeableServiceRevenue:f.afterSales.chargeableServiceRevenue, chargeableServiceCost:f.afterSales.chargeableServiceCost,
      amcRevenue:f.afterSales.amcRevenue, ar:f.revenue.outstanding };
  }).filter(Boolean);
  const totalOpen = r2(customerOpenItems(customerId).reduce((s,i)=>s+i.open,0));
  // Reporting Implementation Phase — DEFECT FOUND & FIXED (forensic reporting audit): this
  // function used to trust `DB.projects.filter(p=>p.customerId===customerId)` as the complete
  // list of this customer's projects. If a project's OWN `customerId` field is null/stale while
  // its posted GL revenue lines still correctly carry `customerId` (AR postings take customerId
  // as an independent parameter, never derived from the project record), that project's real
  // revenue was silently excluded — with no error, no flag, nothing. Live-proven: PRJ-1 carries
  // customerId:null yet ₹4,31,536.38 of its posted revenue has customerId:'CUST-1' on the GL
  // lines directly. Per the audit's own root-cause classification, this is a DATA-model gap
  // (a stale project.customerId), not a calculation bug — so it is deliberately NOT "fixed" by
  // silently including that revenue in the totals above (that would change a real accounting
  // figure based on an inference, which the brief's own safety rules forbid) and NOT fixed by
  // mutating the historical project record out-of-band (also forbidden, and PRJ-1 is a
  // heavily-reused fixture elsewhere). Instead: detect it and disclose it, extending the SAME
  // omitted/partial mechanism already used above for the unrelated projectFinancial360-failure
  // case, so a caller/UI can no longer receive a silently-wrong "complete" answer.
  const customerProjectIds = new Set(projects.map(p=>p.id));
  const unlinkedByProject = {};
  DB.journalEntries.forEach(je => je.lines.forEach(l => {
    if(l.customerId===customerId && l.account==='4000' && l.projectId && !customerProjectIds.has(l.projectId)){
      unlinkedByProject[l.projectId] = r2((unlinkedByProject[l.projectId]||0) + ((l.credit||0)-(l.debit||0)));
    }
  }));
  const unlinkedRevenue = Object.entries(unlinkedByProject).map(([projectId, revenue]) => {
    const p = DB.projects.find(x=>x.id===projectId);
    return { projectId, projectName: p?p.name:'(project not found)', revenue,
      reason: p ? `Project's own customerId is "${p.customerId||'null'}", not "${customerId}" — but its posted GL revenue lines carry customerId:"${customerId}" directly.` : 'Project record no longer exists.' };
  });
  const unlinkedRevenueTotal = r2(unlinkedRevenue.reduce((s,u)=>s+u.revenue,0));
  return { customerId, projects: rows, omittedProjects: omitted.length?omitted:undefined,
    unlinkedRevenue: unlinkedRevenue.length?unlinkedRevenue:undefined,
    totals: { revenue: r2(rows.reduce((s,r)=>s+r.revenue,0)), cost: r2(rows.reduce((s,r)=>s+r.cost,0)), warrantyCost: r2(rows.reduce((s,r)=>s+r.warrantyCost,0)),
      chargeableServiceRevenue: r2(rows.reduce((s,r)=>s+r.chargeableServiceRevenue,0)), amcRevenue: r2(rows.reduce((s,r)=>s+r.amcRevenue,0)), outstandingAR: totalOpen,
      unlinkedRevenue: unlinkedRevenueTotal||undefined,
      partial: omitted.length>0 || unlinkedRevenue.length>0 } };
}

// ================== Phase 30 — Company-Wide Financial Statements ==================
// All three reports below derive EXCLUSIVELY from allLines() (the same flattened view of the
// single central journal every other report already uses) — no second calculation engine, no
// re-derivation of a number a different way. This is the direct fix for Phase 29's finding that
// no company-wide Balance Sheet or P&L existed anywhere in the Lab.

// Balance Sheet — classification is by the account's OWN configured `type` (Asset/Liability/
// Income/Expense — the only types this Lab's Chart of Accounts has ever used; there is no
// separate Equity type, and none is invented here). Current vs Non-current Asset is the one place
// a judgment call is unavoidable — Fixed Assets (1400) and Accumulated Depreciation (1450) are the
// only two accounts anywhere in the CoA that are unambiguously non-current; every other Asset
// account is Current. Equity = Retained Earnings (cumulative Income − Expense since inception),
// since no Capital/Contributed-Equity account has ever been configured for Appletree — disclosed,
// not invented. This identity is guaranteed to balance by the same double-entry invariant
// postJournalEntry() already enforces on every single posting (see the function's own comment for
// the algebra): Assets_net = Liabilities_net + (Income_net − Expense_net).
const BALANCE_SHEET_NON_CURRENT_ASSET_IDS = new Set(['1400','1450']);
function companyBalanceSheet(asOfDate){
  let lines = allLines();
  if(asOfDate) lines = lines.filter(l=>l.date<=asOfDate);
  const bal = {};
  lines.forEach(l=>{ bal[l.account] = bal[l.account] || {debit:0, credit:0}; bal[l.account].debit += l.debit; bal[l.account].credit += l.credit; });
  const KNOWN_TYPES = ['Asset','Liability','Income','Expense'];
  const rows = DB.accounts.map(a=>{
    const b = bal[a.id] || {debit:0, credit:0};
    return { accountId:a.id, name:a.name, type:a.type, net: r2(b.debit - b.credit) };
  }).filter(r=>Math.abs(r.net)>0.001);
  const unmappedAccounts = rows.filter(r=>!KNOWN_TYPES.includes(r.type));
  const currentAssets = rows.filter(r=>r.type==='Asset' && !BALANCE_SHEET_NON_CURRENT_ASSET_IDS.has(r.accountId));
  const nonCurrentAssets = rows.filter(r=>r.type==='Asset' && BALANCE_SHEET_NON_CURRENT_ASSET_IDS.has(r.accountId));
  const liabilityRows = rows.filter(r=>r.type==='Liability').map(r=>({...r, net:r2(-r.net)})); // credit-normal: flip sign to a natural positive balance
  const totalCurrentAssets = r2(currentAssets.reduce((s,r)=>s+r.net,0));
  const totalNonCurrentAssets = r2(nonCurrentAssets.reduce((s,r)=>s+r.net,0));
  const totalAssets = r2(totalCurrentAssets + totalNonCurrentAssets);
  const totalLiabilities = r2(liabilityRows.reduce((s,r)=>s+r.net,0));
  const totalIncome = r2(rows.filter(r=>r.type==='Income').reduce((s,r)=>s-r.net,0));
  const totalExpense = r2(rows.filter(r=>r.type==='Expense').reduce((s,r)=>s+r.net,0));
  const retainedEarnings = r2(totalIncome - totalExpense);
  const totalLiabilitiesAndEquity = r2(totalLiabilities + retainedEarnings);
  return {
    asOfDate: asOfDate || null,
    assets: { current: currentAssets, nonCurrent: nonCurrentAssets, totalCurrent: totalCurrentAssets, totalNonCurrent: totalNonCurrentAssets, total: totalAssets },
    liabilities: { rows: liabilityRows, total: totalLiabilities },
    equity: { retainedEarnings, total: retainedEarnings,
      note: 'No Capital/Contributed-Equity account is configured for Appletree — Equity here is entirely Retained Earnings (cumulative Income minus Expense since inception). BUSINESS POLICY REQUIRED if a real opening capital balance should be recorded separately.' },
    totalLiabilitiesAndEquity,
    difference: r2(totalAssets - totalLiabilitiesAndEquity),
    balanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
    unmappedAccounts
  };
}

// Company Profit & Loss — sums every Income/Expense-type account company-wide, over an optional
// date range. Same generic-by-type approach projectPL() already uses per-project; this is the
// identical technique applied without a projectId filter.
function companyProfitAndLoss({fromDate, toDate}){
  let lines = allLines();
  if(fromDate) lines = lines.filter(l=>l.date>=fromDate);
  if(toDate) lines = lines.filter(l=>l.date<=toDate);
  const bal = {};
  lines.forEach(l=>{
    const acct = DB.accounts.find(a=>a.id===l.account); if(!acct) return;
    if(acct.type!=='Income' && acct.type!=='Expense') return;
    bal[l.account] = bal[l.account] || {name:acct.name, type:acct.type, debit:0, credit:0};
    bal[l.account].debit += l.debit; bal[l.account].credit += l.credit;
  });
  const incomeAccounts = Object.entries(bal).filter(([,a])=>a.type==='Income').map(([id,a])=>({accountId:id, name:a.name, amount:r2(a.credit-a.debit)})).filter(a=>Math.abs(a.amount)>0.001);
  const expenseAccounts = Object.entries(bal).filter(([,a])=>a.type==='Expense').map(([id,a])=>({accountId:id, name:a.name, amount:r2(a.debit-a.credit)})).filter(a=>Math.abs(a.amount)>0.001);
  const totalRevenue = r2(incomeAccounts.reduce((s,a)=>s+a.amount,0));
  const materialCostAccount = expenseAccounts.find(a=>a.accountId==='5000');
  const materialCost = materialCostAccount ? materialCostAccount.amount : 0;
  const totalExpense = r2(expenseAccounts.reduce((s,a)=>s+a.amount,0));
  const grossProfit = r2(totalRevenue - materialCost);
  const netProfit = r2(totalRevenue - totalExpense);
  return { fromDate: fromDate||null, toDate: toDate||null, incomeAccounts, expenseAccounts,
    totalRevenue, materialCost, grossProfit, totalExpense, netProfit,
    marginPct: totalRevenue>0 ? r2(netProfit/totalRevenue*100) : null };
}

// General Ledger — an accountant-friendly filtered/running-balance view over the SAME central
// journal (allLines()). Not a second ledger: every row here is a direct read of a real posted
// line, sorted chronologically, with a running balance computed on the fly.
function generalLedger({account, fromDate, toDate, projectId, costCentreId, party, docCategory}){
  let lines = allLines();
  if(account) lines = lines.filter(l=>l.account===account);
  if(fromDate) lines = lines.filter(l=>l.date>=fromDate);
  if(toDate) lines = lines.filter(l=>l.date<=toDate);
  if(projectId) lines = lines.filter(l=>l.projectId===projectId);
  if(costCentreId) lines = lines.filter(l=>l.costCentreId===costCentreId);
  if(party) lines = lines.filter(l=>l.customerId===party || l.vendorId===party);
  if(docCategory) lines = lines.filter(l=>l.docCategory===docCategory);
  lines = [...lines].sort((a,b)=> (a.date<b.date?-1:a.date>b.date?1:0) || a.entryId.localeCompare(b.entryId));
  let balance = 0;
  const rows = lines.map(l=>{
    balance = r2(balance + l.debit - l.credit);
    return { date:l.date, voucherNo:l.voucherNo, docCategory:l.docCategory, entryId:l.entryId, narration:l.narration,
      party: l.customerId || l.vendorId || l.party || null, debit:l.debit, credit:l.credit, runningBalance:balance,
      projectId:l.projectId, costCentreId:l.costCentreId, reversed: !!l.reversedByEntryId, isReversal: !!l.reversalOfId };
  });
  return { rows, openingBalance:0, closingBalance: r2(balance),
    totalDebit: r2(rows.reduce((s,r)=>s+r.debit,0)), totalCredit: r2(rows.reduce((s,r)=>s+r.credit,0)) };
}

// Customer Ledger — the customer's AR subledger: every AR-control-account (1100) line tagged with
// this customerId, chronologically, with a running balance. Guaranteed to reconcile with
// customerOpenItems()/the AR control account, since both read the exact same underlying lines —
// just organized differently (per-invoice vs. chronological).
function customerLedger(customerId){
  const gl = generalLedger({account: AR_ACCOUNT, party: customerId});
  const openItems = customerOpenItems(customerId);
  const subledgerTotal = r2(openItems.reduce((s,i)=>s+i.open,0));
  return { customerId, ...gl, subledgerTotal, controlAccountBalance: gl.closingBalance,
    reconciles: Math.abs(subledgerTotal - gl.closingBalance) < 0.01 };
}
// Supplier Ledger — the mirror of Customer Ledger, against the AP control account (2000).
function supplierLedger(vendorId){
  const gl = generalLedger({account: AP_ACCOUNT, party: vendorId});
  const openItems = supplierOpenItems(vendorId);
  const subledgerTotal = r2(openItems.reduce((s,i)=>s+i.open,0));
  return { vendorId, ...gl, subledgerTotal, controlAccountBalance: r2(-gl.closingBalance),
    reconciles: Math.abs(subledgerTotal - r2(-gl.closingBalance)) < 0.01 };
}

// §8/§9 — a genuine company-wide aggregate (real transactions summed directly, not per-project
// financial-360 calls looped N times, and NOT a fabricated/estimated figure) for the Management
// and Finance dashboards. Only sums what's actually posted — same posted-only discipline as
// afterSalesFinancials().
function companyAfterSalesSummary(){
  let warrantyCost=0, chargeableRevenue=0, amcRevenue=0;
  const warrantyTicketIds = new Set(DB.serviceTickets.filter(t=>t.classification==='Warranty').map(t=>t.id));
  const chargeableTicketIds = new Set(DB.serviceTickets.filter(t=>t.classification==='Chargeable').map(t=>t.id));
  DB.serviceVisits.forEach(v=>{
    if(!warrantyTicketIds.has(v.ticketId)) return;
    warrantyCost += v.materialIssueIds.reduce((s,id)=>{ const mv=DB.inventoryMovements.find(m=>m.id===id); return s+(mv?mv.valuationAmount:0); },0);
    // Phase 16 §13 — same reversal-visibility fix as afterSalesFinancials() above.
    warrantyCost += v.labourEntryIds.reduce((s,id)=>{ const je=DB.journalEntries.find(e=>e.id===id); if(!je || je.reversedByEntryId) return s; return s + je.lines.filter(l=>l.account==='5100').reduce((s2,l)=>s2+l.debit,0); },0);
  });
  // Phase 16 §13 — same reversal-visibility fix as amcBilledTotal/afterSalesFinancials above.
  DB.jeDrafts.filter(d=>d.status==='Posted' && d.serviceTicketId && chargeableTicketIds.has(d.serviceTicketId)).forEach(d=>{
    const je = DB.journalEntries.find(e=>e.id===d.postedEntryId); if(je && !je.reversedByEntryId) chargeableRevenue += je.lines.filter(l=>l.account==='4000').reduce((s,l)=>s+l.credit,0);
  });
  // Phase 13 POL-05: AMC "revenue" is now the RECOGNIZED total (ledger-sourced from
  // AMCRevenueRecognition entries), not the billed amount — billed/recognized are different
  // numbers under deferred recognition.
  let amcBilled=0, amcDeferred=0;
  DB.amcContracts.forEach(a=>{ const sched = amcRevenueSchedule(a.id); amcRevenue += sched.recognized; amcBilled += sched.billed; amcDeferred += sched.deferredBalance; });
  return { totalWarrantyCost: r2(warrantyCost), totalChargeableServiceRevenue: r2(chargeableRevenue), totalAMCRevenue: r2(amcRevenue), totalAMCBilled: r2(amcBilled), totalAMCDeferredBalance: r2(amcDeferred) };
}

// ---------- POL-10: Company-Wide Project Profitability (approved) — computed live, never a
// manually maintained total; Core and Lifecycle margin kept explicitly separate throughout. ----------
function companyProjectProfitability({dateFrom, dateTo, projectId, customerId, projectManagerId, status}){
  let projects = DB.projects;
  if(projectId) projects = projects.filter(p=>p.id===projectId);
  if(customerId) projects = projects.filter(p=>p.customerId===customerId);
  if(projectManagerId) projects = projects.filter(p=>p.projectManagerId===projectManagerId);
  if(status) projects = projects.filter(p=>p.status===status);
  if(dateFrom) projects = projects.filter(p=>!p.createdAt || p.createdAt.slice(0,10)>=dateFrom);
  if(dateTo) projects = projects.filter(p=>!p.createdAt || p.createdAt.slice(0,10)<=dateTo);
  const rows = projects.map(p=>{
    const f = projectFinancial360(p.id);
    if(!f.ok) return null;
    return { projectId:p.id, projectName:p.name, status:p.status, projectManagerId:p.projectManagerId, customerId:p.customerId,
      coreRevenue:f.profitability.originalProjectMargin.revenue, coreCost:f.profitability.originalProjectMargin.cost, coreMargin:f.profitability.originalProjectMargin.profit,
      lifecycleRevenue:f.profitability.lifecycleMargin.revenue, lifecycleCost:f.profitability.lifecycleMargin.cost, lifecycleMargin:f.profitability.lifecycleMargin.profit,
      committed:f.cost.committed, actualCost:f.cost.actual, warrantyCost:f.afterSales.warrantyCost,
      chargeableServiceRevenue:f.afterSales.chargeableServiceRevenue, chargeableServiceCost:f.afterSales.chargeableServiceCost, amcRevenue:f.afterSales.amcRevenue };
  }).filter(Boolean);
  const sum = key => r2(rows.reduce((s,r)=>s+(r[key]||0),0));
  return { projects: rows, totals: {
    totalProjectRevenue: sum('coreRevenue'), totalProjectActualCost: sum('actualCost'), totalProjectCommitment: sum('committed'), totalProjectMargin: sum('coreMargin'),
    totalWarrantyCost: sum('warrantyCost'), totalChargeableServiceRevenue: sum('chargeableServiceRevenue'), totalChargeableServiceCost: sum('chargeableServiceCost'), totalAMCRevenue: sum('amcRevenue'),
    lifecycleRevenue: sum('lifecycleRevenue'), lifecycleCost: sum('lifecycleCost'), lifecycleMargin: sum('lifecycleMargin')
  } };
}

// ============================================================
// Phase 6 — Accountant MIS & Management MIS (pure composition — zero new financial calculations)
// ============================================================
// Every figure below is read directly from an existing, already-tested/reconciled function
// (customerAgeing, supplierAgeing, reconcileAR/AP, tdsComplianceSummary, companyProfitAndLoss,
// companyProjectProfitability, purchaseVendorReport, materialByVendor, labourCostByProject,
// projectVariationSummary). This section computes nothing financial of its own — it only
// aggregates/reshapes for dashboard display, and every KPI's own source function is named in its
// `source` field precisely so the UI can build a real drill-down, never a dead-end number.
function accountantMisSummary({dateFrom, dateTo}={}){
  const custAgeing = customerAgeing();
  const suppAgeing = supplierAgeing();
  const bucketSum = (rows,excludeCurrent)=> r2(rows.reduce((s,r)=>s + AGE_BUCKETS.filter(b=>!excludeCurrent||b!=='Current').reduce((s2,b)=>s2+(r.buckets[b]||0),0), 0));
  const pl = companyProfitAndLoss({fromDate:dateFrom||null, toDate:dateTo||null});
  const purchases = purchaseVendorReport({dateFrom, dateTo});
  const purchasesTotal = r2(purchases.reduce((s,r)=>s+r.orderedValue,0));
  const collections = r2(DB.clearings.filter(c=>c.type==='AR' && (!dateFrom||c.date>=dateFrom) && (!dateTo||c.date<=dateTo)).reduce((s,c)=>s+c.amount,0));
  const payments = r2(DB.clearings.filter(c=>c.type==='AP' && (!dateFrom||c.date>=dateFrom) && (!dateTo||c.date<=dateTo)).reduce((s,c)=>s+c.amount,0));
  const tds = tdsComplianceSummary();
  const projTotals = companyProjectProfitability({dateFrom, dateTo}).totals;
  const ar = reconcileAR(), ap = reconcileAP();
  // Unlinked revenue, company-wide — PERFORMANCE DEFECT FOUND & FIXED during this phase's own
  // live testing: the first version of this line called customerProfitability(c.id) once per
  // customer (23 customers in this dataset), and that function's own unlinked-revenue detection
  // re-scans EVERY journal entry line on each call — an O(customers x journalEntryLines) scan that
  // measured 8+ seconds here and pushed a dashboard load to 40+ seconds end-to-end, a genuine
  // violation of §24's "avoid repeated full-database scans." Replaced with the SAME detection
  // RULE customerProfitability() uses (a GL line with a customerId + account 4000 + projectId that
  // is not in THAT customer's own project list is "unlinked"), but evaluated in ONE single pass
  // over allLines() with an O(1) project->customerId lookup map — same logic, same result set,
  // ~20x fewer full-dataset scans. Verified to produce an IDENTICAL unlinkedRevenue set to the
  // original per-customer implementation before this fix was kept (see the Phase 6 report).
  const projectOwnerMap = {}; DB.projects.forEach(p=>{ projectOwnerMap[p.id] = p.customerId; });
  const custNameMap = {}; DB.customers.forEach(c=>{ custNameMap[c.id] = c.name; });
  const unlinkedByCustProj = {};
  allLines().forEach(l=>{
    if(!l.customerId || l.account!=='4000' || !l.projectId) return;
    if(projectOwnerMap[l.projectId]===l.customerId) return; // correctly linked — not an exception
    const key = l.customerId+'|'+l.projectId;
    unlinkedByCustProj[key] = r2((unlinkedByCustProj[key]||0) + ((l.credit||0)-(l.debit||0)));
  });
  const unlinkedRevenue = Object.entries(unlinkedByCustProj).map(([key,revenue])=>{
    const [customerId,projectId] = key.split('|');
    const p = DB.projects.find(x=>x.id===projectId);
    return { customerId, customerName: custNameMap[customerId]||customerId, projectId, projectName: p?p.name:'(project not found)', revenue,
      reason: p ? `Project's own customerId is "${p.customerId||'null'}", not "${customerId}" — but its posted GL revenue lines carry customerId:"${customerId}" directly.` : 'Project record no longer exists.' };
  });
  return {
    revenue: { value: pl.totalRevenue, source:'companyProfitAndLoss()' },
    collections: { value: collections, source:'DB.clearings (type AR)' },
    outstandingReceivables: { value: bucketSum(custAgeing,false), source:'customerAgeing()' },
    purchases: { value: purchasesTotal, source:'purchaseVendorReport()' },
    supplierPayments: { value: payments, source:'DB.clearings (type AP)' },
    outstandingPayables: { value: bucketSum(suppAgeing,false), source:'supplierAgeing()' },
    arOverdue: { value: bucketSum(custAgeing,true), source:'customerAgeing() — all buckets except Current' },
    apOverdue: { value: bucketSum(suppAgeing,true), source:'supplierAgeing() — all buckets except Current' },
    tdsDeducted: { value: tds.totalDeducted, source:'tdsComplianceSummary()' },
    tdsPayableBalance: { value: tds.tdsPayableBalance, source:'tdsComplianceSummary()' },
    projectRevenue: { value: projTotals.totalProjectRevenue, source:'companyProjectProfitability()' },
    projectCost: { value: projTotals.totalProjectActualCost, source:'companyProjectProfitability()' },
    projectProfit: { value: projTotals.totalProjectMargin, source:'companyProjectProfitability()' },
    control: { arReconciliation: ar, apReconciliation: ap, unlinkedRevenue, unlinkedRevenueTotal: r2(unlinkedRevenue.reduce((s,u)=>s+u.revenue,0)) },
    dateFrom: dateFrom||null, dateTo: dateTo||null
  };
}
function managementMisSummary({dateFrom, dateTo}={}){
  const pl = companyProfitAndLoss({fromDate:dateFrom||null, toDate:dateTo||null});
  const projs = companyProjectProfitability({dateFrom, dateTo});
  const activeProjects = DB.projects.filter(p=>!['Closed','Cancelled'].includes(p.status));
  // "Low margin" is a real, disclosed threshold (<10% core margin on projects with real revenue),
  // not a fabricated AI judgment — every project's own marginPct is shown so a reader can apply a
  // different threshold themselves.
  const projectRows = projs.projects.map(p=>({...p, marginPct: p.coreRevenue>0 ? r2(100*p.coreMargin/p.coreRevenue) : null}));
  const lowMarginProjects = projectRows.filter(p=>p.marginPct!=null && p.marginPct<10).sort((a,b)=>a.marginPct-b.marginPct);
  const custAgeing = customerAgeing();
  const suppAgeing = supplierAgeing();
  const topCustomerOutstanding = custAgeing.map(c=>({customerId:c.customer.id, customerName:c.customer.name, outstanding:c.total})).filter(c=>c.outstanding>0.01).sort((a,b)=>b.outstanding-a.outstanding).slice(0,10);
  const topVendorExposure = suppAgeing.map(v=>({vendorId:v.vendor.id, vendorName:v.vendor.name, outstanding:v.total})).filter(v=>v.outstanding>0.01).sort((a,b)=>b.outstanding-a.outstanding).slice(0,10);
  // Major material cost drivers — reuses materialByVendor() (Phase 5) with no material filter,
  // grouped up to material level (summing across its vendors) rather than a new calculation.
  const mbv = materialByVendor({});
  const byMaterial = {};
  mbv.rows.forEach(r=>{ if(!byMaterial[r.materialId]) byMaterial[r.materialId]={materialId:r.materialId, materialDescription:r.materialDescription, purchaseValue:0, grnValue:0};
    byMaterial[r.materialId].purchaseValue+=r.purchaseValue; byMaterial[r.materialId].grnValue+=r.grnValue; });
  const materialCostDrivers = Object.values(byMaterial).map(m=>({...m, purchaseValue:r2(m.purchaseValue), grnValue:r2(m.grnValue)})).sort((a,b)=>b.grnValue-a.grnValue).slice(0,10);
  // Variation (Change Request) profitability — reuses Phase 4's own functions verbatim, company-wide.
  let variationRevenue=0, variationCost=0, variationProfit=0;
  DB.changeRequests.filter(c=>c.status==='Approved').forEach(cr=>{
    const prof = changeRequestVariationProfitability(cr.id);
    if(prof){ variationRevenue+=prof.variationRevenue; variationCost+=prof.variationMaterialCost; variationProfit+=prof.grossContribution; }
  });
  // Labour cost company-wide — DEFECT FOUND & FIXED during this phase's own reconciliation check
  // against companyProfitAndLoss()'s Labour Cost (5100) line: labourCostByProject({}) only ever
  // iterates projects that appear in DB.labourWages, so it silently missed ₹500 of real GL 5100
  // activity posted with projectId:null (an orphan/company-level entry, not tied to any project).
  // The per-project breakdown below is still built from labourCostByProject() (correct for that
  // purpose — "project-less" cannot be a project row); the COMPANY-WIDE total instead sums
  // account 5100 across allLines() directly (the same source companyProfitAndLoss() itself uses),
  // so the two now agree exactly rather than the dashboard under-reporting by the orphan amount.
  const labourRows = labourCostByProject({});
  const totalLabourCost = r2(allLines().filter(l=>l.account==='5100').reduce((s,l)=>s+l.debit-l.credit,0));
  const labourCostWithNoProject = r2(totalLabourCost - labourRows.reduce((s,r)=>s+r.totalGL5100Cost,0));
  return {
    totalRevenue: {value:pl.totalRevenue, source:'companyProfitAndLoss()'},
    totalCost: {value:pl.totalExpense, source:'companyProfitAndLoss()'},
    grossProfit: {value:pl.netProfit, source:'companyProfitAndLoss()'},
    grossMarginPct: {value:pl.marginPct, source:'companyProfitAndLoss()'},
    activeProjectCount: {value:activeProjects.length, source:'DB.projects (status not Closed/Cancelled)'},
    lowMarginProjects: {value:lowMarginProjects, source:'companyProjectProfitability() — marginPct<10%'},
    projectCommitmentVsActual: {value:{committed:projs.totals.totalProjectCommitment, actual:projs.totals.totalProjectActualCost}, source:'companyProjectProfitability()'},
    procurementValue: {value: r2(purchaseVendorReport({dateFrom,dateTo}).reduce((s,r)=>s+r.orderedValue,0)), source:'purchaseVendorReport()'},
    materialConsumption: {value: r2(pl.materialCost), source:'companyProfitAndLoss() — Material Cost (account 5000)'},
    labourCost: {value: totalLabourCost, labourCostWithNoProject, source:'allLines() account 5100, company-wide — reconciles exactly to companyProfitAndLoss()\'s Labour Cost line; labourCostWithNoProject discloses any 5100 activity posted with no projectId (found live: ₹500 of orphan/company-level labour posting), which cannot appear in the per-project breakdown below.'},
    variationRevenue: {value:r2(variationRevenue), variationCost:r2(variationCost), variationProfit:r2(variationProfit), source:'changeRequestVariationProfitability() (Phase 4), summed across Approved CRs'},
    topCustomerOutstanding: {value: topCustomerOutstanding, source:'customerAgeing()'},
    topVendorExposure: {value: topVendorExposure, source:'supplierAgeing()'},
    materialCostDrivers: {value: materialCostDrivers, source:'materialByVendor() (Phase 5), grouped by material'},
    allProjects: {value: projectRows, source:'companyProjectProfitability()'},
    dateFrom: dateFrom||null, dateTo: dateTo||null,
    note:'"Low-margin" uses a disclosed <10% core-margin threshold, not a fabricated judgment — every project\'s own marginPct is returned so a different threshold can be applied. Every figure traces to the `source` function named alongside it; nothing here is calculated independently.'
  };
}

// ---------- POL-12: Real export payloads (CSV) — reuses existing, already-gated data functions
// only; no new data computation, purely serialization. Every call is audited by the API layer
// with user/date/time/report/filters/record-count/type (server.js). ----------
function csvEscape(v){ const s = v===undefined||v===null?'':String(v); return /[",\n\r]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; }
function toCsv(rows, columns){
  const header = columns.map(c=>csvEscape(c[0])).join(',');
  const lines = rows.map(r=>columns.map(c=>csvEscape(typeof c[1]==='function'?c[1](r):r[c[1]])).join(','));
  return [header, ...lines].join('\r\n');
}
function generateExport(report, filters, actor){
  filters = filters||{};
  let csv, count;
  if(report==='gl'){
    const rows = allLines();
    csv = toCsv(rows, [['Entry ID','entryId'],['Voucher','voucherNo'],['Date','date'],['Account','account'],['Debit','debit'],['Credit','credit'],['Project','projectId'],['Customer','customerId'],['Vendor','vendorId'],['Narration','narration']]);
    count = rows.length;
  } else if(report==='ar'){
    const rows = customerAgeing(filters.asOf);
    csv = toCsv(rows.map(r=>({customer:r.customer.name, ...r.buckets, total:r.total})), [['Customer','customer'], ...AGE_BUCKETS.map(b=>[b,b]), ['Total','total']]);
    count = rows.length;
  } else if(report==='ap'){
    const rows = supplierAgeing(filters.asOf);
    csv = toCsv(rows.map(r=>({vendor:r.vendor.name, ...r.buckets, total:r.total})), [['Vendor','vendor'], ...AGE_BUCKETS.map(b=>[b,b]), ['Total','total']]);
    count = rows.length;
  } else if(report==='project-pl'){
    const projects = filters.projectId ? DB.projects.filter(p=>p.id===filters.projectId) : DB.projects;
    const rows = projects.map(p=>({projectId:p.id, name:p.name, ...projectPL(p.id)}));
    csv = toCsv(rows, [['Project ID','projectId'],['Name','name'],['Revenue','revenue'],['Cost','cost'],['Profit','profit'],['Margin %','marginPct']]);
    count = rows.length;
  } else if(report==='inventory'){
    let rows = DB.inventoryMovements;
    if(filters.materialId) rows = rows.filter(m=>m.materialId===filters.materialId);
    csv = toCsv(rows, [['ID','id'],['Date','date'],['Material','materialId'],['Qty','qty'],['Type','type'],['Warehouse','warehouseId'],['Project','projectId'],['Source Type','sourceType'],['Source ID','sourceId'],['User','userId'],['Value','valuationAmount']]);
    count = rows.length;
  } else if(report==='financial-360'){
    if(!filters.projectId) return {ok:false, error:'projectId filter is required for a Financial 360 export.'};
    const f = projectFinancial360(filters.projectId);
    if(!f.ok) return f;
    const flat = {};
    ['contract','cost','procurement','inventory','manufacturing','revenue','afterSales'].forEach(sec=>{ Object.entries(f[sec]||{}).forEach(([k,v])=>{ flat[sec+'.'+k]=v; }); });
    flat['profitability.core.profit'] = f.profitability.originalProjectMargin.profit;
    flat['profitability.lifecycle.profit'] = f.profitability.lifecycleMargin.profit;
    csv = toCsv([flat], Object.keys(flat).map(k=>[k,k]));
    count = 1;
  } else if(report==='customer-profitability'){
    if(!filters.customerId) return {ok:false, error:'customerId filter is required for a Customer Profitability export.'};
    const p = customerProfitability(filters.customerId);
    csv = toCsv(p.projects, [['Project ID','projectId'],['Project','projectName'],['Revenue','revenue'],['Cost','cost'],['Warranty Cost','warrantyCost'],['Chargeable Revenue','chargeableServiceRevenue'],['AMC Revenue','amcRevenue'],['AR','ar']]);
    count = p.projects.length;
  } else if(report==='after-sales'){
    const s = companyAfterSalesSummary();
    csv = toCsv([s], Object.keys(s).map(k=>[k,k]));
    count = 1;
  } else {
    return {ok:false, error:`Unknown export report "${report}".`};
  }
  return {ok:true, csv, recordCount:count};
}

// ============================================================
// Phase 14 — SAP-Style Accounting Entry Architecture
// ============================================================
// §13 Attachments — metadata + small base64 payload stored in DB (no external file server in
// this zero-dependency offline lab). Genuinely real, not a stub: files are actually stored and
// retrievable. Capped at 1MB raw (base64 inflates ~37%, ~1.4MB) to stay safely under server.js's
// 2MB request-body cap (`server.js` line ~28) with room for the surrounding JSON — a real,
// disclosed limit, not a fake claim of unlimited storage.
const ATTACHMENT_MAX_BYTES = 1 * 1024 * 1024;
function attachFile({entityType, entityId, filename, mimeType, base64Data, docType, reference, actor}){
  if(!entityType || !entityId) return {ok:false, error:'entityType and entityId are required.'};
  if(!filename || !base64Data) return {ok:false, error:'filename and file data are required.'};
  const sizeBytes = Math.ceil(base64Data.length * 3/4);
  if(sizeBytes > ATTACHMENT_MAX_BYTES) return {ok:false, error:`File too large (${(sizeBytes/1024/1024).toFixed(2)}MB) — 2MB limit in this lab.`};
  // Phase 41 CRITICAL FIX — found live via numbering forensics (Part 17): `length+1` ID generation
  // collides the instant any attachment is deleted (deleteAttachment() does a real splice()) —
  // proven live: create 3 (ATT-00001/2/3), delete the middle one, create a 4th -> it was assigned
  // "ATT-00003", COLLIDING with the still-existing ATT-00003. Two records then share one ID;
  // getAttachment()'s .find() can only ever return the first, permanently orphaning the second
  // from lookup/delete. Fixed with the same nextId() max-suffix mechanism already used for
  // journalEntries/clearings/quotations (Phase 32/33) — immune to gaps left by deletion.
  const att = { id: nextId(DB.attachments, 'ATT-', 5), entityType, entityId, filename, mimeType:mimeType||'application/octet-stream',
    sizeBytes, base64Data, docType:docType||'Other', reference:reference||'', uploadedBy:actor.id, uploadedByRole:actor.role, uploadedAt:nowIso() };
  DB.attachments.push(att); save();
  logAudit({type:'AttachmentUploaded', attachmentId:att.id, entityType, entityId, filename, sizeBytes, userId:actor.id, role:actor.role});
  return {ok:true, attachment:{...att, base64Data:undefined}};
}
function listAttachments(entityType, entityId){
  return DB.attachments.filter(a=>a.entityType===entityType && a.entityId===entityId).map(a=>({...a, base64Data:undefined}));
}
function getAttachment(id){ return DB.attachments.find(a=>a.id===id); }
function deleteAttachment(id, actor){
  const idx = DB.attachments.findIndex(a=>a.id===id);
  if(idx<0) return {ok:false, error:'Attachment not found.'};
  const att = DB.attachments[idx];
  DB.attachments.splice(idx,1); save();
  logAudit({type:'AttachmentDeleted', attachmentId:id, entityType:att.entityType, entityId:att.entityId, filename:att.filename, userId:actor.id, role:actor.role});
  return {ok:true};
}

// §4/#3/#4 — Customer Credit Note / Debit Note. Mirror `createSupplierCreditNote`'s exact
// pattern (post through the unmodified engine, tag the SAME docCategory as the original invoice
// so reconciliation/Document Viewer/AR ageing all see it as an AR document with zero special-
// casing, then apply a real clearing against the original invoice) — proven pattern since Phase
// 7's Supplier Credit Note, now extended to the customer side which never had it.
function createCustomerCreditNote({customerInvoiceEntryId, amount, reason, actor}){
  { const _a = assertCanCreateCustomerCreditNote(actor); if(!_a.ok) return _a; }
  const inv = DB.journalEntries.find(e=>e.id===customerInvoiceEntryId);
  if(!inv || inv.docCategory!=='CustomerInvoice') return {ok:false, error:'Customer invoice not found.'};
  const arLine = inv.lines.find(l=>l.account===AR_ACCOUNT);
  if(!arLine) return {ok:false, error:'Invoice has no AR line.'};
  // Phase 14 FIX — non-numeric amount ("abc") used to slip past `!amount||+amount<=0` (a non-empty
  // string is truthy, and NaN comparisons are always false), producing a fully-posted, zero-value
  // phantom document instead of a clean rejection. Found live while re-testing the tax-split fix.
  { const _v = assertPositiveFiniteNumber(amount, 'Amount'); if(!_v.ok) return _v; }
  // DEFECT FOUND & FIXED (Phase 14 Accountant UAT) — same over-clearing gap as
  // createSupplierCreditNote above: never allow a credit note to clear more than what's
  // actually still open on the invoice.
  const openItem = customerOpenItems(arLine.customerId).find(i=>i.entryId===customerInvoiceEntryId);
  if(!openItem || +amount > openItem.open + 0.01) return {ok:false, error:`Credit note amount ₹${(+amount).toLocaleString('en-IN')} exceeds the invoice's open balance of ₹${(openItem?openItem.open:0).toLocaleString('en-IN')} — cannot over-clear an invoice.`};
  // Phase 41 FIX — same reordering as createSupplierCreditNote above: attempt GL before committing.
  const cnId = nextId(DB.customerCreditNotes, 'CCN-', 4), cnNo = nextDocNumber('CN');
  // Phase 14 FIX (Phase 13 DEFECT-13-01, live-proven) — splitOriginalTax() derives the base/tax
  // proportion from THIS invoice's own actually-posted lines, never from today's tax master.
  // Dr Revenue (the base portion) + Dr Output Tax (the tax portion) / Cr AR (the full amount).
  const split = splitOriginalTax({originalEntry:inv, taxAccount:'2200', amount:+amount});
  const glLines = [ {account:'4000', debit:split.base, credit:0, customerId:arLine.customerId, projectId:arLine.projectId} ];
  if(split.tax>0) glLines.push({account:'2200', debit:split.tax, credit:0, customerId:arLine.customerId, projectId:arLine.projectId, taxCode:split.taxCode});
  glLines.push({account:AR_ACCOUNT, debit:0, credit:+amount, customerId:arLine.customerId, projectId:arLine.projectId});
  const _ccnJesLen = DB.journalEntries.length, _ccnDocLen = DB.customerCreditNotes.length, _ccnClearingsLen = DB.clearings.length;
  const result = postJournalEntry({ date:new Date().toISOString().slice(0,10), narration:`Customer Credit Note ${cnNo}`, sourceType:'Customer Credit Note',
    sourceId:cnId, voucherNo:cnNo, party:arLine.customerId, docCategory:'CustomerInvoice',
    lines:glLines,
    actor, capability:'AR_CREDIT_NOTE', overrideReason:reason });
  if(!result.ok) return result;
  // Phase 36 Part I — same defect class/fix as createSupplierCreditNote() above.
  try {
    _fault('CCN_AFTER_GL_BEFORE_DOC'); // Phase 36 Part I
    const cn = { id:cnId, cnNo, customerInvoiceEntryId, amount:+amount, baseAmount:split.base, taxAmount:split.tax, taxCode:split.taxCode, reason:reason||'', createdBy:actor.id, createdAt:nowIso() };
    DB.customerCreditNotes.push(cn); save();
    _fault('CCN_AFTER_DOC_BEFORE_CLEARING'); // Phase 36 Part I
    const clr = applyClearing({type:'AR', invoiceEntryId:customerInvoiceEntryId, paymentEntryId:result.entry.id, amount:+amount, actor});
    logAudit({type:'CustomerCreditNoteCreated', creditNoteId:cn.id, amount, taxAmount:split.tax, userId:actor.id, role:actor.role});
    return {ok:true, creditNote:cn, entry:result.entry, clearing:clr};
  } catch(e) {
    DB.journalEntries.length = _ccnJesLen;
    DB.customerCreditNotes.length = _ccnDocLen;
    DB.clearings.length = _ccnClearingsLen;
    save();
    logAudit({type:'CustomerCreditNoteRolledBackOnFailure', customerInvoiceEntryId, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}
function createCustomerDebitNote({customerInvoiceEntryId, amount, reason, actor}){
  { const _a = assertCanCreateCustomerDebitNote(actor); if(!_a.ok) return _a; }
  const inv = DB.journalEntries.find(e=>e.id===customerInvoiceEntryId);
  if(!inv || inv.docCategory!=='CustomerInvoice') return {ok:false, error:'Customer invoice not found.'};
  const arLine = inv.lines.find(l=>l.account===AR_ACCOUNT);
  if(!arLine) return {ok:false, error:'Invoice has no AR line.'};
  // Phase 14 FIX — same non-numeric-amount hole as createCustomerCreditNote, closed the same way.
  { const _v = assertPositiveFiniteNumber(amount, 'Amount'); if(!_v.ok) return _v; }
  // Phase 41 FIX — same reordering as createSupplierCreditNote above: attempt GL before committing.
  const dnId = nextId(DB.customerDebitNotes, 'CDN-', 4), dnNo = nextDocNumber('DN');
  // Phase 14 FIX (Phase 13 DEFECT-13-03, by code symmetry) — same splitOriginalTax() derivation:
  // a debit note referencing a taxed invoice must charge the SAME tax treatment that invoice used
  // (same customer, same nature of supply), derived from what was actually posted, not guessed.
  // Dr AR (increases what the customer owes) / Cr Revenue + Cr Output Tax — a genuine NEW open
  // item, not a clearing against the original (a debit note adds a balance, it doesn't reduce one).
  const split = splitOriginalTax({originalEntry:inv, taxAccount:'2200', amount:+amount});
  const glLines = [ {account:AR_ACCOUNT, debit:+amount, credit:0, customerId:arLine.customerId, projectId:arLine.projectId} ];
  glLines.push({account:'4000', debit:0, credit:split.base, customerId:arLine.customerId, projectId:arLine.projectId});
  if(split.tax>0) glLines.push({account:'2200', debit:0, credit:split.tax, customerId:arLine.customerId, projectId:arLine.projectId, taxCode:split.taxCode});
  const _cdnJesLen = DB.journalEntries.length, _cdnDocLen = DB.customerDebitNotes.length;
  const result = postJournalEntry({ date:new Date().toISOString().slice(0,10), narration:`Customer Debit Note ${dnNo} (ref ${inv.voucherNo})`, sourceType:'Customer Debit Note',
    sourceId:dnId, voucherNo:dnNo, party:arLine.customerId, docCategory:'CustomerInvoice',
    lines:glLines,
    actor, capability:'AR_DEBIT_NOTE', overrideReason:reason });
  if(!result.ok) return result;
  // Phase 36 Part I — same defect class/fix (no applyClearing() step here — a Customer Debit Note
  // adds a NEW open item rather than clearing one, per this function's own design — but the GL-
  // orphan-if-document-push-fails risk is identical).
  try {
    _fault('CDN_AFTER_GL_BEFORE_DOC'); // Phase 36 Part I
    const dn = { id:dnId, dnNo, customerInvoiceEntryId, amount:+amount, baseAmount:split.base, taxAmount:split.tax, taxCode:split.taxCode, reason:reason||'', createdBy:actor.id, createdAt:nowIso() };
    DB.customerDebitNotes.push(dn); save();
    logAudit({type:'CustomerDebitNoteCreated', debitNoteId:dn.id, amount, taxAmount:split.tax, userId:actor.id, role:actor.role});
    return {ok:true, debitNote:dn, entry:result.entry};
  } catch(e) {
    DB.journalEntries.length = _cdnJesLen;
    DB.customerDebitNotes.length = _cdnDocLen;
    save();
    logAudit({type:'CustomerDebitNoteRolledBackOnFailure', customerInvoiceEntryId, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}

// #17/#18 — Inventory Transfer (no GL impact — same company, same valuation, moving-average rate
// carried across; `getStockLevel()` already accounted for 'TransferIn'/'TransferOut' movement
// types since Phase 7, they simply had no creation function wired to them until now) / Inventory
// Adjustment (real GL impact — a genuine new account, 5300, since no existing account correctly
// represents inventory shrinkage/found-stock without misclassifying it).
function createInventoryTransfer({materialId, qty, uom, fromWarehouseId, toWarehouseId, reason, actor}){
  { const _a = assertCanCreateInventoryTransfer(actor); if(!_a.ok) return _a; }
  // Phase 45 FIX — found live in Phase 10: this checked stock availability BEFORE checking
  // whether the material even existed, so a nonexistent material was rejected with "only 0
  // available" — technically not false, but the actual reason (no such material) was never
  // surfaced, misdiagnosing a typo as a stock shortage. Required order per the Phase 11 brief:
  // material existence → material status → source warehouse → stock → quantity. Reuses the same
  // assertMaterialSelectable() guard already relied on in two other functions.
  const materialErr = assertMaterialSelectable(materialId); if(materialErr) return {ok:false, error:materialErr};
  if(!DB.warehouses.find(w=>w.id===fromWarehouseId)) return {ok:false, error:`Unknown source warehouse "${fromWarehouseId}".`};
  if(!DB.warehouses.find(w=>w.id===toWarehouseId)) return {ok:false, error:`Unknown destination warehouse "${toWarehouseId}".`};
  if(!fromWarehouseId || !toWarehouseId || fromWarehouseId===toWarehouseId) return {ok:false, error:'Select two different warehouses.'};
  // Phase 15 FIX — same NaN-through-truthy-string hole closed the same way as
  // createInventoryAdjustment()/createMaterialIssue().
  { const _v = assertPositiveFiniteNumber(qty, 'Quantity'); if(!_v.ok) return _v; }
  const available = getStockLevel(materialId, fromWarehouseId);
  if(+qty > available + 0.001) return {ok:false, error:`Cannot transfer ${qty} — only ${available} available at ${fromWarehouseId}.`};
  const rate = getMovingAverageRate(materialId, fromWarehouseId);
  // Phase 33 (adversarial audit thread) Part U — a real inventory-ledger-adjacent document.
  // Phase 36 Part J — no GL is involved here, but the SAME atomicity risk exists between the two
  // separate movements: an exception after TransferOut but before TransferIn would remove stock
  // from the source warehouse with nothing appearing at the destination — a real, silent stock
  // loss, not merely a bookkeeping gap.
  const _itrDocLen = DB.inventoryTransfers.length, _itrMovesLen = DB.inventoryMovements.length;
  try {
    const tr = { id:nextId(DB.inventoryTransfers, 'ITR-', 4), trNo:nextDocNumber('ITR'), materialId, qty:+qty, uom:uom||'',
      fromWarehouseId, toWarehouseId, reason:reason||'', rate, createdBy:actor.id, createdAt:nowIso() };
    DB.inventoryTransfers.push(tr); save();
    _fault('ITR_AFTER_DOC_BEFORE_OUT'); // Phase 36 Part J
    postInventoryMovement({type:'TransferOut', materialId, qty, uom, warehouseId:fromWarehouseId, sourceType:'InventoryTransfer', sourceId:tr.id, valuationRate:rate, actor, capability:'INVENTORY_TRANSFER' });
    _fault('ITR_AFTER_OUT_BEFORE_IN'); // Phase 36 Part J
    postInventoryMovement({type:'TransferIn', materialId, qty, uom, warehouseId:toWarehouseId, sourceType:'InventoryTransfer', sourceId:tr.id, valuationRate:rate, actor, capability:'INVENTORY_TRANSFER' });
    logAudit({type:'InventoryTransferCreated', transferId:tr.id, materialId, qty, fromWarehouseId, toWarehouseId, userId:actor.id, role:actor.role});
    return {ok:true, transfer:tr};
  } catch(e) {
    DB.inventoryTransfers.length = _itrDocLen;
    DB.inventoryMovements.length = _itrMovesLen;
    save();
    logAudit({type:'InventoryTransferRolledBackOnFailure', materialId, fromWarehouseId, toWarehouseId, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}
function createInventoryAdjustment({materialId, qty, uom, warehouseId, reason, actor}){
  { const _a = assertCanCreateInventoryAdjustment(actor); if(!_a.ok) return _a; }
  if(!warehouseId) return {ok:false, error:'Warehouse is required.'};
  // Phase 44 CRITICAL FIX — found live in the Phase 8 adversarial audit: a nonexistent materialId
  // was never rejected — it silently fell through to `(DB.materials.find(...)||{}).standardCost
  // || 0`, producing a real, permanently-persisted ₹0 stock row (proven live: "MAT-PHANTOM-999",
  // qty 5, value ₹0, visible in the Stock Report) for a material that had never been created.
  // Reuses the SAME existence+active check createMaterialIssue() already relies on, rather than a
  // second, differently-worded validation for the same real-world rule.
  if(!DB.warehouses.find(w=>w.id===warehouseId)) return {ok:false, error:`Unknown warehouse "${warehouseId}".`};
  const materialErr = assertMaterialSelectable(materialId); if(materialErr) return {ok:false, error:materialErr};
  // Phase 15 CRITICAL FIX — found live: a non-numeric qty ("not-a-number") slipped past
  // `!qty || +qty===0` (a non-empty string is truthy, and NaN===0 is false), then propagated as
  // NaN all the way into postInventoryMovement() — permanently corrupting getStockLevel() for that
  // material/warehouse to `null` for every future transaction. Same root-cause class as the Phase
  // 14 CN/DN "abc"-amount hole, but with a far worse blast radius here since it poisons a running
  // SUM (inventory movements), not a single document's own fields.
  { const _v = assertNonZeroFiniteNumber(qty, 'Quantity'); if(!_v.ok) return {ok:false, error:'Quantity must be a non-zero, finite number (positive = found/increase, negative = shrinkage/decrease).'}; }
  if(!reason) return {ok:false, error:'A reason is required for every inventory adjustment — never silent.'};
  if(+qty < 0){
    const available = getStockLevel(materialId, warehouseId);
    if(Math.abs(+qty) > available + 0.001) return {ok:false, error:`Cannot reduce by ${Math.abs(qty)} — only ${available} in stock.`};
  }
  const rate = getMovingAverageRate(materialId, warehouseId) || (DB.materials.find(m=>m.id===materialId)||{}).standardCost || 0;
  const value = r2(Math.abs(+qty) * rate);
  // Phase 41 CRITICAL FIX — found in Phase 4's error-propagation audit: this function used to
  // create the adjustment record AND post the inventory movement FIRST, then attempt the GL
  // posting afterward without ever checking whether it succeeded. A closed-period (or any other)
  // GL failure left real stock changed with zero accounting entry behind it, while the API still
  // reported ok:true. Strategy C from the Phase 5 brief — pre-validate/attempt the step that CAN
  // fail (postJournalEntry, which enforces period-close, balance, etc.) BEFORE committing anything
  // that CANNOT fail on its own (DB.inventoryAdjustments.push / postInventoryMovement are pure
  // synchronous writes with no rejection path once the guards above have already passed). This is
  // not a compensating-rollback design — there is nothing to compensate, because nothing is
  // written until the fallible step has already succeeded. A true DB transaction (BEGIN/COMMIT)
  // is not available on this single-JSON-file architecture and this project will not pretend
  // otherwise; reordering is the correct, honest equivalent for the operations this function
  // actually performs.
  // Phase 31 CRITICAL FIX — same defect class as Phase 30's MV- collision, found via a full
  // 105-collection scan Phase 30's narrower 17-collection check had not covered:
  // IADJ-0015 existed THREE times with genuinely different content (same length+1 root cause,
  // same timestamps as the MV- collision — both defects came from the same underlying test
  // traffic). Fixed the same way: derive from the maximum existing numeric suffix, not array length.
  const adjId = 'IADJ-'+String(maxIdSuffix(DB.inventoryAdjustments, 'IADJ-')+1).padStart(4,'0');
  const adjNo = nextDocNumber('IADJ');
  // Phase 36 Part J — jesLen captured BEFORE the GL attempt below (the exact Phase-35-class mistake
  // of capturing it afterward was made on this function's first pass too, caught by re-running this
  // fault-injection test, and fixed here — see the Phase 36 report).
  const _iadjJesLen = DB.journalEntries.length, _iadjDocLen = DB.inventoryAdjustments.length, _iadjMovesLen = DB.inventoryMovements.length;
  let glResult = {ok:true};
  if(value>0.01){
    const lines = (+qty>0)
      ? [ {account:'1200', debit:value, credit:0, projectId:null}, {account:'5300', debit:0, credit:value, projectId:null} ]   // increase found
      : [ {account:'5300', debit:value, credit:0, projectId:null}, {account:'1200', debit:0, credit:value, projectId:null} ]; // decrease/shrinkage
    glResult = postJournalEntry({ date:new Date().toISOString().slice(0,10), narration:`Inventory Adjustment ${adjNo} — ${reason}`, sourceType:'InventoryAdjustment',
      sourceId:adjId, voucherNo:adjNo, docCategory:'InventoryAdjustment', lines, actor, capability:'INVENTORY_ADJUSTMENT', overrideReason:reason });
    if(!glResult.ok){
      // Nothing has been written yet — DB.inventoryAdjustments, DB.inventoryMovements, and the
      // document-number counter are all still exactly as they were before this call. Audited
      // (via durableFailureAudit, ERP-059B — see ERP-059B-TRANSACTION-DESIGN.md) so a rejected
      // inventory-adjustment attempt is traceable, matching the same treatment given to rejected
      // reversal attempts elsewhere in this file.
      return {ok:false, error:glResult.error, durableFailureAudit:{type:'InventoryAdjustmentRejected', materialId, qty, warehouseId, reason, value, glError:glResult.error}};
    }
  }
  // Phase 36 Part J CRITICAL FIX — the comment above ("not a compensating-rollback design — there
  // is nothing to compensate, because nothing is written until the fallible step has already
  // succeeded") is only true against postJournalEntry()'s own CONTROLLED {ok:false} rejection path.
  // It does not protect against an UNEXPECTED synchronous exception thrown anywhere after the GL
  // has already succeeded — the exact gap this phase's fault injection targets, and the same class
  // Phase 35 found in createGRN()/createMaterialIssue(). "Reordering" alone was never sufficient.
  try {
    _fault('IADJ_AFTER_GL_BEFORE_DOC'); // Phase 36 Part J
    const adj = { id:adjId, adjNo, materialId, qty:+qty, uom:uom||'', warehouseId, reason, rate, value, createdBy:actor.id, createdAt:nowIso() };
    DB.inventoryAdjustments.push(adj); save();
    _fault('IADJ_AFTER_DOC_BEFORE_INVENTORY'); // Phase 36 Part J
    postInventoryMovement({type:'Adjustment', materialId, qty, uom, warehouseId, sourceType:'InventoryAdjustment', sourceId:adj.id, valuationRate:rate, actor, capability:'INVENTORY_ADJUSTMENT' });
    logAudit({type:'InventoryAdjustmentCreated', adjustmentId:adj.id, materialId, qty, warehouseId, reason, value, userId:actor.id, role:actor.role});
    return {ok:true, adjustment:adj, glEntry:glResult.entry||null};
  } catch(e) {
    DB.journalEntries.length = _iadjJesLen;
    DB.inventoryAdjustments.length = _iadjDocLen;
    DB.inventoryMovements.length = _iadjMovesLen;
    save();
    logAudit({type:'InventoryAdjustmentRolledBackOnFailure', materialId, warehouseId, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}

// ================== Phase 28 — Inventory Operations ==================
// Locations — a lightweight, OPTIONAL bin/shelf dimension within a warehouse. Deliberately does
// NOT replace the warehouse concept anywhere; it's an additive drill-down some purchases/GRN
// lines may tag (see createGRN's optional per-line locationId), purely for "where exactly in the
// warehouse" reporting.
function createLocation({warehouseId, code, description, actor}){
  if(!warehouseId || !DB.warehouses.find(w=>w.id===warehouseId)) return {ok:false, error:'A valid warehouse is required.'};
  if(!code) return {ok:false, error:'A location code is required.'};
  if(DB.locations.find(l=>l.warehouseId===warehouseId && l.code===code)) return {ok:false, error:`Location "${code}" already exists in this warehouse.`};
  const loc = { id:'LOC-'+String(DB.locations.length+1).padStart(4,'0'), warehouseId, code, description:description||'', active:true, createdBy:actor.id, createdAt:nowIso() };
  DB.locations.push(loc); save();
  logAudit({type:'LocationCreated', locationId:loc.id, warehouseId, code, userId:actor.id, role:actor.role});
  return {ok:true, location:loc};
}
function stockByLocation(){
  const rows = {};
  DB.inventoryMovements.filter(m=>m.locationId).forEach(m=>{
    const key = m.materialId+'|'+m.warehouseId+'|'+m.locationId;
    if(!rows[key]) rows[key] = {materialId:m.materialId, warehouseId:m.warehouseId, locationId:m.locationId, qty:0};
    const sign = (m.type==='Receipt'||m.type==='TransferIn') ? 1 : (m.type==='Issue'||m.type==='TransferOut'||m.type==='Return') ? -1 : (m.type==='Adjustment' ? Math.sign(m.qty)||1 : 0);
    rows[key].qty += m.type==='Adjustment' ? m.qty : sign*Math.abs(m.qty);
  });
  return Object.values(rows).filter(r=>Math.abs(r.qty)>0.001).map(r=>{
    const material = DB.materials.find(m=>m.id===r.materialId);
    const loc = DB.locations.find(l=>l.id===r.locationId);
    return {...r, materialDescription: material?material.description:r.materialId, locationCode: loc?loc.code:r.locationId, qty:r2(r.qty)};
  });
}
// Stock Report — a genuine summary (material x warehouse: current qty, moving-average rate,
// current value), distinct from the raw chronological Movement Ledger the Lab already had.
// Read-only, derived entirely from existing inventoryMovements — no new posting, no new data.
function stockReport(){
  const keys = new Set(DB.inventoryMovements.map(m=>m.materialId+'|'+m.warehouseId));
  return [...keys].map(k=>{
    const [materialId, warehouseId] = k.split('|');
    const qty = r2(getStockLevel(materialId, warehouseId));
    const rate = getMovingAverageRate(materialId, warehouseId);
    const material = DB.materials.find(m=>m.id===materialId);
    return { materialId, description: material?material.description:materialId, uom: material?material.uom:'', warehouseId, qty, rate:r2(rate), value:r2(qty*rate) };
  }).filter(r=>Math.abs(r.qty)>0.001 || r.value>0.01);
}

// ============================================================
// Phase 5 — Material Analytics & Cross-Dimensional Reporting
// ============================================================
// Forensic data-model audit (performed before any code below was written):
//  - Every inventoryMovements row carries EITHER warehouseId (never siteId) OR siteId (never
//    warehouseId) — Warehouse-scope types (Receipt/Issue/TransferIn/TransferOut/Return/Adjustment)
//    vs Site-scope types (SiteReceipt/SiteConsumption/SiteReturn). Job Work types
//    (JobWorkReceipt/Return/Scrap/DirectDispatch) carry NEITHER — a third location scope, tied only
//    to projectId. postInventoryMovement() itself never merges these; every function below preserves
//    that same separation and never sums a warehouse qty with a site qty into one inventory figure.
//  - Existing authoritative valuation — reused directly, never reimplemented:
//    getStockLevel()/getMovingAverageRate() (warehouse, full-history Moving Average replay) and
//    getSiteStockLevel()/getSiteMovingAverageRate() (site, the same algorithm, separate ledger).
//  - "Damage" is NOT a distinct movement type. Every Damage Report posts as a generic 'Adjustment'
//    movement (sourceType:'InventoryAdjustment') through the SAME createInventoryAdjustment() engine
//    a manual stock-count variance uses. The two are distinguished below only by cross-referencing
//    DB.damageReports[].adjustmentId against the movement's own sourceId — never by inventing a new
//    movement type or guessing from the reason text.
//  - "Issue" (warehouse) / "SiteConsumption" (site) ARE this codebase's own concept of material
//    consumption against a project — there is no further, separate "Consumption" movement type.
//    Reported once, under one label, rather than fabricating a second, redundant figure.
//  - Purchase Order lines carry the ORDERED qty/rate (a commitment); GRN lines carry the RECEIVED
//    qty/rate (the actual, accepted transaction, and the rate Receipt movements are valued at) —
//    kept as two distinct figures throughout, matching this codebase's own pre-existing PO-vs-GRN
//    distinction (Vendor-wise Purchase Report, Project Financial 360).
//  - Purchase Orders carry no dedicated "order date" field — createdAt is used for date-range
//    filtering, the same convention already used by the Journal Register and other date-filtered
//    reports in this codebase.
// All functions below are strictly read-only: no DB.*.push, no save(), no postJournalEntry/
// postInventoryMovement call anywhere in this section.

function _materialLabel(materialId){ const m=DB.materials.find(x=>x.id===materialId); return m?m.description:materialId; }
function _vendorLabel(vendorId){ const v=DB.vendors.find(x=>x.id===vendorId); return v?v.name:vendorId; }
function _damageAdjustmentIds(){ return new Set(DB.damageReports.map(d=>d.adjustmentId)); }

// ---- 5.1 Material Quantity + Value Flow (Opening -> ... -> Closing) — warehouse/site kept separate ----
function materialMovementFlow({materialId, warehouseId, siteId, dateFrom, dateTo}){
  if(!materialId || !DB.materials.find(m=>m.id===materialId)) return {ok:false, error:'A valid material is required.'};
  if(warehouseId && siteId) return {ok:false, error:'Specify a warehouse OR a site, not both — they are physically different inventory and are never merged.'};
  const damageIds = _damageAdjustmentIds();
  let moves = DB.inventoryMovements.filter(m=>m.materialId===materialId);
  if(warehouseId) moves = moves.filter(m=>m.warehouseId===warehouseId);
  else if(siteId) moves = moves.filter(m=>m.siteId===siteId);
  else moves = moves.filter(m=>m.warehouseId || m.siteId); // excludes Job Work (neither) — a third scope this report does not claim to cover
  moves = [...moves].sort((a,b)=>(a.date||'').localeCompare(b.date||'') || String(a.id).localeCompare(String(b.id)));

  const z = ()=>({qty:0, value:0});
  const b = { purchaseOrderedQty:0, purchaseOrderedValue:0, grn:z(), issue:z(), returned:z(), transferIn:z(), transferOut:z(), adjustment:z(), damage:z() };
  let runQty=0, runVal=0, openingQty=0, openingValue=0, openingCaptured=!dateFrom;
  moves.forEach(m=>{
    if(dateFrom && !openingCaptured && m.date>=dateFrom){ openingQty=r2(runQty); openingValue=r2(runVal); openingCaptured=true; }
    if(dateTo && m.date>dateTo) return; // stop applying beyond the window's end — closing is AS OF dateTo, not "now"
    const within = !dateFrom || m.date>=dateFrom;
    if(m.type==='Receipt' || m.type==='TransferIn' || m.type==='SiteReceipt'){
      // SiteReceipt is bucketed into `grn` for schema consistency across warehouse/site scope, but is
      // NOT a GRN document — it is sourced via a Site Material Requisition (see note below).
      runQty+=m.qty; runVal+=m.valuationAmount;
      if(within){ const t = m.type==='TransferIn'?b.transferIn:b.grn; t.qty+=m.qty; t.value+=m.valuationAmount; }
    } else if(m.type==='Issue' || m.type==='TransferOut' || m.type==='Return' || m.type==='SiteConsumption' || m.type==='SiteReturn'){
      const rate = runQty>0.0001 ? runVal/runQty : 0;
      runQty-=m.qty; runVal-=r2(m.qty*rate);
      if(within){ const t = (m.type==='TransferOut') ? b.transferOut : (m.type==='Return'||m.type==='SiteReturn') ? b.returned : b.issue; t.qty+=m.qty; t.value+=r2(m.qty*rate); }
    } else if(m.type==='Adjustment'){
      if(m.qty>0){ runQty+=m.qty; runVal+=m.valuationAmount; if(within){ b.adjustment.qty+=m.qty; b.adjustment.value+=m.valuationAmount; } }
      else {
        const rate = runQty>0.0001 ? runVal/runQty : 0;
        runQty+=m.qty; runVal+=r2(m.qty*rate);
        if(within){ const isDamage = damageIds.has(m.sourceId); const t = isDamage?b.damage:b.adjustment; t.qty+=m.qty; t.value+=r2(m.qty*rate); }
      }
    }
  });
  if(!openingCaptured){ openingQty=r2(runQty); openingValue=r2(runVal); } // dateFrom given but after every movement
  const closingQty = r2(runQty), closingValue = r2(runVal);
  // A PO carries no warehouse/site of its own (that is decided at GRN time) — Purchase Ordered
  // Qty/Value is therefore always the material's COMPANY-WIDE ordered commitment, even when this
  // report is scoped to one warehouse/site (disclosed explicitly in the note below, not silently
  // shown as if it were warehouse/site-specific).
  DB.purchaseOrders.forEach(po=>{
    if(po.status==='Cancelled') return;
    const d = (po.createdAt||'').slice(0,10);
    if(dateFrom && d<dateFrom) return; if(dateTo && d>dateTo) return;
    (po.lines||[]).forEach(l=>{ if(l.materialId===materialId){ b.purchaseOrderedQty+=+l.qty||0; b.purchaseOrderedValue+=r2((+l.qty||0)*(+l.rate||0)); } });
  });
  // Independent cross-check against the pre-existing authoritative function, when closing = current
  // (no dateTo given) and single-location-scoped — the exact "identify discrepancies rather than
  // hiding them" instruction, operationalized as a real comparison, not a tautology.
  let reconciliation = null;
  if(!dateTo && (warehouseId || siteId)){
    const authoritative = warehouseId ? r2(getStockLevel(materialId, warehouseId)) : r2(getSiteStockLevel(materialId, siteId));
    reconciliation = { authoritativeClosingQty: authoritative, thisReportClosingQty: closingQty, matches: Math.abs(authoritative-closingQty)<0.01 };
  }
  return { ok:true, materialId, materialDescription:_materialLabel(materialId), uom:(DB.materials.find(m=>m.id===materialId)||{}).uom||'',
    scope:{warehouseId:warehouseId||null, siteId:siteId||null}, dateFrom:dateFrom||null, dateTo:dateTo||null,
    openingQty, openingValue,
    purchaseOrderedQty:r2(b.purchaseOrderedQty), purchaseOrderedValue:r2(b.purchaseOrderedValue),
    grnQty:r2(b.grn.qty), grnValue:r2(b.grn.value),
    issueQty:r2(b.issue.qty), issueValue:r2(b.issue.value),
    returnQty:r2(b.returned.qty), returnValue:r2(b.returned.value),
    transferInQty:r2(b.transferIn.qty), transferInValue:r2(b.transferIn.value),
    transferOutQty:r2(b.transferOut.qty), transferOutValue:r2(b.transferOut.value),
    adjustmentQty:r2(b.adjustment.qty), adjustmentValue:r2(b.adjustment.value),
    damageQty:r2(b.damage.qty), damageValue:r2(b.damage.value),
    closingQty, closingValue, reconciliation,
    note:(warehouseId ? 'Purchase Ordered Qty/Value is this material\'s COMPANY-WIDE ordered commitment (a PO carries no warehouse/site of its own — that is only decided at GRN time), NOT restricted to the warehouse this report is scoped to. '
        : siteId ? 'Purchase Ordered Qty/Value is this material\'s COMPANY-WIDE ordered commitment, NOT restricted to this site. "GRN Qty/Value" for a SITE-scoped run reflects SiteReceipt movements (sourced via a Site Material Requisition, not a Goods Receipt Note) — labeled the same field for schema consistency with the warehouse view, but not literally a GRN document here. '
        : '')
      + 'GRN Qty/Value = Receipt movements (received, at accepted rate) — a separate figure from Purchase Ordered Qty/Value (the PO-line commitment, may differ due to partial receipt or price variance). "Issue" already IS this codebase\'s own concept of consumption against a project (there is no separate Consumption movement type) — reported once, not duplicated. Damage Qty/Value is a DERIVED subset of Adjustment (every Damage Report posts as a generic Adjustment movement) — the Adjustment figures above EXCLUDE Damage to avoid double-counting.' };
}

// ---- 5.2 Material Rate History — sourced from GRN lines (the actual received rate), not PO (quoted) ----
function materialRateHistory({materialId, vendorId}){
  if(!materialId || !DB.materials.find(m=>m.id===materialId)) return {ok:false, error:'A valid material is required.'};
  const rows = [];
  DB.grns.forEach(g=>{
    (g.lines||[]).forEach(l=>{
      if(l.materialId!==materialId) return;
      if(vendorId && g.supplierId!==vendorId) return;
      rows.push({ date:g.date, vendorId:g.supplierId, vendorName:_vendorLabel(g.supplierId), qty:+l.qtyAccepted||0, rate:+l.rate||0,
        docType:'GRN', docId:g.id, docNo:g.grnNo, poId:g.poId, projectId:g.projectId });
    });
  });
  rows.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const latest = rows[0]||null, earliest = rows[rows.length-1]||null;
  const byVendor = {};
  rows.forEach(r=>{
    if(!byVendor[r.vendorId]) byVendor[r.vendorId]={vendorId:r.vendorId, vendorName:r.vendorName, qty:0, value:0, minRate:Infinity, maxRate:-Infinity, transactions:0};
    const v=byVendor[r.vendorId]; v.qty+=r.qty; v.value+=r2(r.qty*r.rate); v.minRate=Math.min(v.minRate,r.rate); v.maxRate=Math.max(v.maxRate,r.rate); v.transactions++;
  });
  const vendorComparison = Object.values(byVendor).map(v=>({...v, qty:r2(v.qty), value:r2(v.value), minRate:r2(v.minRate), maxRate:r2(v.maxRate), weightedAvgRate: v.qty>0.0001?r2(v.value/v.qty):0}));
  return { ok:true, materialId, materialDescription:_materialLabel(materialId), transactions:rows,
    latestPurchaseRate: latest?latest.rate:null, latestPurchaseDate: latest?latest.date:null,
    earliestPurchaseRate: earliest?earliest.rate:null, earliestPurchaseDate: earliest?earliest.date:null,
    rateVariance: (latest && earliest && rows.length>1) ? r2(latest.rate-earliest.rate) : null,
    vendorComparison,
    note:'Sourced from GRN lines only — the actual RECEIVED rate at acceptance, not the quoted PO rate (which may differ due to weighment variance). "Weighted Avg Rate" per vendor is a genuine value/qty ratio from real transactions, not a fabricated or estimated average.' };
}

// ---- 5.3 Material x Project — consumption (Issue/SiteConsumption) + receipt (GRN direct-to-project) ----
function materialByProject({materialId, projectId, dateFrom, dateTo}){
  const inWindow = (d)=> (!dateFrom||d>=dateFrom) && (!dateTo||d<=dateTo);
  const rows = {};
  const key = (m)=>m.materialId+'|'+m.projectId;
  DB.inventoryMovements.filter(m=>(m.type==='Issue'||m.type==='SiteConsumption') && m.projectId && (!materialId||m.materialId===materialId) && (!projectId||m.projectId===projectId) && inWindow(m.date))
    .forEach(m=>{ const k=key(m); if(!rows[k]) rows[k]={materialId:m.materialId, projectId:m.projectId, consumedQty:0, consumedValue:0, warehouseConsumedQty:0, siteConsumedQty:0, receivedQty:0, receivedValue:0};
      rows[k].consumedQty+=m.qty; rows[k].consumedValue+=r2(m.valuationAmount);
      if(m.type==='Issue') rows[k].warehouseConsumedQty+=m.qty; else rows[k].siteConsumedQty+=m.qty; });
  DB.inventoryMovements.filter(m=>m.type==='Receipt' && m.projectId && (!materialId||m.materialId===materialId) && (!projectId||m.projectId===projectId) && inWindow(m.date))
    .forEach(m=>{ const k=key(m); if(!rows[k]) rows[k]={materialId:m.materialId, projectId:m.projectId, consumedQty:0, consumedValue:0, warehouseConsumedQty:0, siteConsumedQty:0, receivedQty:0, receivedValue:0};
      rows[k].receivedQty+=m.qty; rows[k].receivedValue+=r2(m.valuationAmount); });
  const result = Object.values(rows).map(r=>({...r, consumedQty:r2(r.consumedQty), consumedValue:r2(r.consumedValue), warehouseConsumedQty:r2(r.warehouseConsumedQty), siteConsumedQty:r2(r.siteConsumedQty),
    receivedQty:r2(r.receivedQty), receivedValue:r2(r.receivedValue),
    materialDescription:_materialLabel(r.materialId), projectName:(DB.projects.find(p=>p.id===r.projectId)||{}).name||r.projectId }));
  return { ok:true, rows:result,
    note:'Consumed Qty/Value = Issue (warehouse, warehouseConsumedQty) + SiteConsumption (site, siteConsumedQty) movements against this project — the two are also shown separately, never silently merged. Received Qty/Value = GRN receipts posted directly to this project — the procurement side, a separate figure from consumption.' };
}

// ---- 5.4 Material x Vendor — purchase (PO, ordered) + GRN (received), from real PO/GRN line data ----
function materialByVendor({materialId, vendorId, dateFrom, dateTo}){
  const poRows = {}, grnRows = {};
  DB.purchaseOrders.forEach(po=>{
    if(po.status==='Cancelled') return;
    if(vendorId && po.vendorId!==vendorId) return;
    const d=(po.createdAt||'').slice(0,10); if(dateFrom&&d<dateFrom) return; if(dateTo&&d>dateTo) return;
    (po.lines||[]).forEach(l=>{ if(materialId && l.materialId!==materialId) return;
      const k=l.materialId+'|'+po.vendorId;
      if(!poRows[k]) poRows[k]={materialId:l.materialId, vendorId:po.vendorId, purchaseQty:0, purchaseValue:0, poIds:new Set()};
      poRows[k].purchaseQty+=+l.qty||0; poRows[k].purchaseValue+=r2((+l.qty||0)*(+l.rate||0)); poRows[k].poIds.add(po.id); });
  });
  DB.grns.forEach(g=>{
    if(vendorId && g.supplierId!==vendorId) return;
    if(dateFrom&&g.date<dateFrom) return; if(dateTo&&g.date>dateTo) return;
    (g.lines||[]).forEach(l=>{ if(materialId && l.materialId!==materialId) return;
      const k=l.materialId+'|'+g.supplierId;
      if(!grnRows[k]) grnRows[k]={materialId:l.materialId, vendorId:g.supplierId, grnQty:0, grnValue:0, grnIds:new Set()};
      grnRows[k].grnQty+=+l.qtyAccepted||0; grnRows[k].grnValue+=r2((+l.qtyAccepted||0)*(+l.rate||0)); grnRows[k].grnIds.add(g.id); });
  });
  const allKeys = new Set([...Object.keys(poRows), ...Object.keys(grnRows)]);
  const rows = [...allKeys].map(k=>{
    const [mId,vId]=k.split('|'); const po=poRows[k]||{purchaseQty:0,purchaseValue:0,poIds:new Set()}; const g=grnRows[k]||{grnQty:0,grnValue:0,grnIds:new Set()};
    return { materialId:mId, materialDescription:_materialLabel(mId), vendorId:vId, vendorName:_vendorLabel(vId),
      purchaseQty:r2(po.purchaseQty), purchaseValue:r2(po.purchaseValue), poCount:po.poIds.size,
      grnQty:r2(g.grnQty), grnValue:r2(g.grnValue), grnCount:g.grnIds.size, actualRate: g.grnQty>0.0001?r2(g.grnValue/g.grnQty):null };
  });
  return { ok:true, rows, note:'Purchase Qty/Value from PO lines (ordered commitment); GRN Qty/Value from GRN lines (received actual, at accepted rate) — kept separate. "Actual Rate" is grnValue/grnQty, a real weighted rate from received transactions.' };
}

// ---- 5.5 Material x Project x Vendor — the same PO/GRN line data, 3-way grouped ----
function materialByProjectVendor({materialId, projectId, vendorId, dateFrom, dateTo}){
  const poRows = {}, grnRows = {};
  DB.purchaseOrders.forEach(po=>{
    if(po.status==='Cancelled') return;
    if(vendorId && po.vendorId!==vendorId) return; if(projectId && po.projectId!==projectId) return;
    const d=(po.createdAt||'').slice(0,10); if(dateFrom&&d<dateFrom) return; if(dateTo&&d>dateTo) return;
    (po.lines||[]).forEach(l=>{ if(materialId && l.materialId!==materialId) return;
      const k=l.materialId+'|'+po.projectId+'|'+po.vendorId;
      if(!poRows[k]) poRows[k]={materialId:l.materialId, projectId:po.projectId, vendorId:po.vendorId, purchaseQty:0, purchaseValue:0, poIds:new Set()};
      poRows[k].purchaseQty+=+l.qty||0; poRows[k].purchaseValue+=r2((+l.qty||0)*(+l.rate||0)); poRows[k].poIds.add(po.id); });
  });
  DB.grns.forEach(g=>{
    if(vendorId && g.supplierId!==vendorId) return; if(projectId && g.projectId!==projectId) return;
    if(dateFrom&&g.date<dateFrom) return; if(dateTo&&g.date>dateTo) return;
    (g.lines||[]).forEach(l=>{ if(materialId && l.materialId!==materialId) return;
      const k=l.materialId+'|'+g.projectId+'|'+g.supplierId;
      if(!grnRows[k]) grnRows[k]={materialId:l.materialId, projectId:g.projectId, vendorId:g.supplierId, grnQty:0, grnValue:0, grnIds:new Set()};
      grnRows[k].grnQty+=+l.qtyAccepted||0; grnRows[k].grnValue+=r2((+l.qtyAccepted||0)*(+l.rate||0)); grnRows[k].grnIds.add(g.id); });
  });
  const allKeys = new Set([...Object.keys(poRows), ...Object.keys(grnRows)]);
  const rows = [...allKeys].map(k=>{
    const [mId,pId,vId]=k.split('|'); const po=poRows[k]||{purchaseQty:0,purchaseValue:0,poIds:new Set()}; const g=grnRows[k]||{grnQty:0,grnValue:0,grnIds:new Set()};
    return { materialId:mId, materialDescription:_materialLabel(mId), projectId:pId, projectName:(DB.projects.find(p=>p.id===pId)||{}).name||pId,
      vendorId:vId, vendorName:_vendorLabel(vId), purchaseQty:r2(po.purchaseQty), purchaseValue:r2(po.purchaseValue), poCount:po.poIds.size,
      grnQty:r2(g.grnQty), grnValue:r2(g.grnValue), grnCount:g.grnIds.size, actualRate: g.grnQty>0.0001?r2(g.grnValue/g.grnQty):null };
  });
  return { ok:true, rows, note:'Same real PO/GRN line relationships as Material x Vendor, 3-way grouped by material+project+vendor — no artificial relationship is created where a PO/GRN does not actually carry all three.' };
}

// ---- 5.6 Warehouse vs Site — never merged; "Total Physical Qty" is explicitly qty-only ----
function warehouseVsSiteAnalysis(materialId){
  if(!materialId || !DB.materials.find(m=>m.id===materialId)) return {ok:false, error:'A valid material is required.'};
  const whIds = new Set(DB.inventoryMovements.filter(m=>m.materialId===materialId && m.warehouseId).map(m=>m.warehouseId));
  const siteIds = new Set(DB.inventoryMovements.filter(m=>m.materialId===materialId && m.siteId).map(m=>m.siteId));
  const warehouse = [...whIds].map(wid=>{ const qty=r2(getStockLevel(materialId,wid)); const rate=getMovingAverageRate(materialId,wid);
    return {warehouseId:wid, warehouseName:(DB.warehouses.find(w=>w.id===wid)||{}).name||wid, qty, rate:r2(rate), value:r2(qty*rate)}; }).filter(r=>Math.abs(r.qty)>0.001||r.value>0.01);
  const site = [...siteIds].map(sid=>{ const qty=r2(getSiteStockLevel(materialId,sid)); const rate=getSiteMovingAverageRate(materialId,sid);
    return {siteId:sid, siteName:(DB.sites.find(s=>s.id===sid)||{}).name||sid, qty, rate:r2(rate), value:r2(qty*rate)}; }).filter(r=>Math.abs(r.qty)>0.001||r.value>0.01);
  const totalWarehouseQty=r2(warehouse.reduce((s,r)=>s+r.qty,0)), totalWarehouseValue=r2(warehouse.reduce((s,r)=>s+r.value,0));
  const totalSiteQty=r2(site.reduce((s,r)=>s+r.qty,0)), totalSiteValue=r2(site.reduce((s,r)=>s+r.value,0));
  return { ok:true, materialId, materialDescription:_materialLabel(materialId), warehouse, site,
    totalWarehouseQty, totalWarehouseValue, totalSiteQty, totalSiteValue, totalPhysicalQty:r2(totalWarehouseQty+totalSiteQty),
    note:'"Total Physical Qty" is a PHYSICAL-QUANTITY-ONLY figure (units on hand, wherever they sit) — Warehouse and Site inventory carry SEPARATE moving-average rate histories (getMovingAverageRate vs getSiteMovingAverageRate), so their VALUES are shown side by side and never summed into one combined "total value."' };
}

// ---- 5.7 Cross-Dimensional — Vendor x Project, reusing purchaseVendorReport()'s own PO-level rows ----
function vendorProjectMatrix({vendorId, projectId, dateFrom, dateTo, status}){
  const poRows = purchaseVendorReport({vendorId, projectId, dateFrom, dateTo, status});
  const grouped = {};
  poRows.forEach(r=>{
    const k=r.vendorId+'|'+r.projectId;
    if(!grouped[k]) grouped[k]={vendorId:r.vendorId, vendorName:r.vendorName, projectId:r.projectId, projectName:(DB.projects.find(p=>p.id===r.projectId)||{}).name||r.projectId,
      poCount:0, grnCount:0, orderedValue:0, grnValue:0, invoicedValue:0, paidValue:0, outstandingValue:0, poIds:[]};
    const g=grouped[k]; g.poCount++; g.orderedValue+=r.orderedValue; g.grnValue+=r.grnValue; g.invoicedValue+=r.invoicedValue; g.paidValue+=r.paidValue; g.outstandingValue+=r.outstandingValue;
    g.poIds.push(r.poId); g.grnCount += DB.grns.filter(x=>x.poId===r.poId).length;
  });
  return { ok:true, rows: Object.values(grouped).map(g=>({...g, orderedValue:r2(g.orderedValue), grnValue:r2(g.grnValue), invoicedValue:r2(g.invoicedValue), paidValue:r2(g.paidValue), outstandingValue:r2(g.outstandingValue)})),
    note:'Grouped directly from purchaseVendorReport()\'s own PO-level rows by vendor+project pair — the SAME authoritative figures the Vendor-wise Purchase Report shows, not a second calculation.' };
}

// ---- 5.8 Cross-Dimensional — Project x Material (Planned vs Actual), reusing bomConsumptionReport() ----
function projectMaterialPlanVsActual(projectId){
  const bcr = bomConsumptionReport(projectId);
  if(!bcr.ok) return bcr;
  const actual = materialByProject({projectId});
  const actualByMaterial = {}; actual.rows.forEach(r=>{ actualByMaterial[r.materialId]=r; });
  const rows = bcr.lines.map(l=>{
    const material = DB.materials.find(m=>m.id===l.materialId);
    const plannedCostEstimate = material ? r2(l.totalAllowed*(+material.standardCost||0)) : null;
    const act = actualByMaterial[l.materialId];
    return { ...l, plannedCostEstimate, actualConsumedValue: act?act.consumedValue:0, consumptionPct: l.totalAllowed>0 ? r2(100*l.issuedQty/l.totalAllowed) : null };
  });
  return { ok:true, projectId, rows,
    note: bcr.note + ' Planned Cost is an ESTIMATE (Approved+Wastage Qty x material.standardCost — bomConsumptionReport() itself carries no cost field, so this is explicitly labeled an estimate, not an actual). Actual Consumed Value reuses materialByProject()\'s own Issue/SiteConsumption valuation — not re-derived.' };
}

// ---- 5.9 Cross-Dimensional — Project x Variation, reusing the Phase 4 CR reporting functions verbatim ----
function projectVariationSummary(projectId){
  const crs = DB.changeRequests.filter(c=>c.projectId===projectId);
  const rows = crs.map(cr=>{
    const val = changeRequestProcurementValueSummary(cr.id);
    const prof = changeRequestVariationProfitability(cr.id);
    return { changeRequestId:cr.id, documentNo:cr.documentNo, status:cr.status, description:cr.description,
      revenueImpact:cr.revenueImpact, costImpact:cr.costImpact, consumedRevenue:cr.consumedRevenue,
      procurementCommittedValue: val?val.procurementCommittedValue:null, grnReceivedValue: val?val.grnReceivedValue:null, inventoryConsumedValue: val?val.inventoryConsumedValue:null,
      variationRevenue: prof?prof.variationRevenue:null, variationMaterialCost: prof?prof.variationMaterialCost:null, grossContribution: prof?prof.grossContribution:null };
  });
  return { ok:true, projectId, rows,
    note:'Every figure is reused verbatim from changeRequestProcurementValueSummary()/changeRequestVariationProfitability() (Phase 4) — this only lists them per project; no CR profitability calculation is duplicated.' };
}

// ============================================================
// Phase 6 — Labour-wise Project Cost Analytics
// ============================================================
// Forensic labour data-model audit (performed before any code below was written):
//  - DB.labourWages is the ONLY collection with real per-worker labour cost detail: id, projectId,
//    workerName (FREE TEXT — there is no workerId anywhere in this codebase), role, days,
//    ratePerDay, value, date, glEntryId. There is no hours/quantity/site/contractor field on this
//    record — offering those as filters would silently promise data that was never captured, so
//    they are not offered; "role" (Worker/Carpenter/etc.) is this data model's only work-category
//    dimension, and is used as both "Work Category" and "Labour Type" below rather than
//    fabricating a second field that does not exist.
//  - DB.timesheetEntries (hours, workerName) exists but is EMPTY in this dataset. The pre-existing
//    labourPerformance() already merges it by exact workerName match for its cost-per-hour figure
//    — reused verbatim below, not reimplemented.
//  - GL account 5100 (Labour Cost) is the AUTHORITATIVE total project labour cost and is ALREADY
//    fully included in projectFinancial360()'s cost figures (coreProjectPL().cost sums every
//    Expense-type account, including 5100, netted for reversals) — confirmed by reading that
//    function's own source, not assumed. So §6's concern ("does profitability already include
//    labour") is answered: YES, it already does, and this phase does not touch that calculation.
//  - What is MISSING is WORKER-LEVEL detail. Proven live (PRJ-1): GL 5100 for that project is fed
//    by THREE distinct posting sources — LabourWages (worker-detailed, sourceType:'LabourWages'),
//    InstallationLabour (postInstallationLabourCost — a LUMP SUM against CC-INSTALLATION, no
//    worker breakdown at all), and Production labour cost (postProductionLabourCost — likewise a
//    lump sum). This means DB.labourWages' own total will legitimately be LESS than a project's
//    full GL 5100 balance whenever installation/production labour was also posted — every function
//    below computes and discloses this split explicitly, never silently presenting the
//    worker-attributed figure as "the" project's total labour cost.
//  - A labourWages record's `value` field is HISTORICAL and is never mutated (this codebase's own
//    discipline). If its glEntryId was later reversed (proven live: PRJ-10 LBR-0013, ₹3,000,
//    reversed to a net 0 GL impact), the CURRENT net GL contribution is 0, not `value`. Every
//    function below computes and returns BOTH `value` (as originally recorded) and `netGlImpact`
//    (0 if reversed), and never conflates the two.
function _labourEntryReversed(glEntryId){ return DB.journalEntries.some(e=>e.reversalOfId===glEntryId); }
function labourWageEntries({projectId, workerName, role, dateFrom, dateTo, amountFrom, amountTo}){
  let rows = DB.labourWages.filter(l=>
    (!projectId || l.projectId===projectId) &&
    (!workerName || l.workerName.trim().toLowerCase()===String(workerName).trim().toLowerCase()) &&
    (!role || l.role===role) &&
    (!dateFrom || l.date>=dateFrom) && (!dateTo || l.date<=dateTo) &&
    (amountFrom===undefined || amountFrom===null || amountFrom==='' || l.value>=+amountFrom) &&
    (amountTo===undefined || amountTo===null || amountTo==='' || l.value<=+amountTo)
  );
  return rows.map(l=>{
    const reversed = _labourEntryReversed(l.glEntryId);
    return { ...l, projectName:(DB.projects.find(p=>p.id===l.projectId)||{}).name||l.projectId,
      reversed, netGlImpact: reversed?0:l.value, month:(l.date||'').slice(0,7),
      site:'N/A — not tracked in this data model', contractor:'N/A — not tracked in this data model', hours:'N/A — not tracked (only Days is captured)' };
  });
}
// Per project: the worker-attributed portion (from DB.labourWages, reversal-aware) vs. the FULL
// authoritative GL 5100 balance for that project (all sources) — the gap is real, disclosed, never
// hidden or forced to reconcile by adjusting either figure.
function labourCostByProject({projectId}){
  const projIds = projectId ? [projectId] : [...new Set(DB.labourWages.map(l=>l.projectId))];
  return projIds.map(pid=>{
    const entries = DB.labourWages.filter(l=>l.projectId===pid);
    const workerAttributedCost = r2(entries.reduce((s,l)=>s+(_labourEntryReversed(l.glEntryId)?0:l.value),0));
    const jes = DB.journalEntries.filter(e=>e.lines.some(l=>l.projectId===pid && l.account==='5100'));
    const totalGL5100Cost = r2(jes.reduce((s,je)=>s+je.lines.filter(l=>l.projectId===pid&&l.account==='5100').reduce((s2,l)=>s2+l.debit-l.credit,0),0));
    const sourceBreakdown = {};
    jes.forEach(je=>{ const src=je.sourceType||'Unknown'; sourceBreakdown[src]=(sourceBreakdown[src]||0)+je.lines.filter(l=>l.projectId===pid&&l.account==='5100').reduce((s,l)=>s+l.debit-l.credit,0); });
    Object.keys(sourceBreakdown).forEach(k=>sourceBreakdown[k]=r2(sourceBreakdown[k]));
    return { projectId:pid, projectName:(DB.projects.find(p=>p.id===pid)||{}).name||pid,
      workerAttributedCost, totalGL5100Cost, otherLabourCost: r2(totalGL5100Cost-workerAttributedCost),
      entryCount: entries.length, reversedEntryCount: entries.filter(l=>_labourEntryReversed(l.glEntryId)).length, sourceBreakdown,
      note:'workerAttributedCost/totalGL5100Cost are fully reversal-netted (sum to the true current balance). sourceBreakdown is a RAW per-sourceType posting total, including its own "Reversal" bucket separately — it sums to totalGL5100Cost, but an individual source figure (e.g. LabourWages) is NOT itself netted against a later reversal of one of its own entries, so it will not always equal workerAttributedCost.' };
  });
}
// Data-quality DETECTOR only — never auto-merges. Levenshtein distance is a real, standard
// string-similarity measure (not a fabricated heuristic); every flagged pair is presented for
// human review, and the original, distinct records are never altered by this function.
function _levenshtein(a,b){
  const dp = Array.from({length:a.length+1}, (_,i)=>{ const row=new Array(b.length+1).fill(0); row[0]=i; return row; });
  for(let j=0;j<=b.length;j++) dp[0][j]=j;
  for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++) dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[a.length][b.length];
}
function labourIdentityQualityReport(){
  const issues = [];
  DB.labourWages.forEach(l=>{ if(!l.workerName || !l.workerName.trim()) issues.push({type:'Blank worker name', labourId:l.id, projectId:l.projectId}); });
  const names = [...new Set(DB.labourWages.map(l=>l.workerName).filter(Boolean))];
  const byNormalized = {};
  names.forEach(n=>{ const norm=n.trim().toLowerCase().replace(/\s+/g,' '); (byNormalized[norm]=byNormalized[norm]||[]).push(n); });
  Object.values(byNormalized).forEach(group=>{ const distinct=[...new Set(group)]; if(distinct.length>1) issues.push({type:'Inconsistent casing/whitespace — same normalized name, NOT auto-merged', names:distinct}); });
  const normNames = Object.keys(byNormalized);
  for(let i=0;i<normNames.length;i++) for(let j=i+1;j<normNames.length;j++){
    const a=normNames[i], b=normNames[j];
    if(Math.abs(a.length-b.length)>3 || Math.min(a.length,b.length)<=3) continue;
    const d = _levenshtein(a,b);
    if(d>0 && d<=2) issues.push({type:'Potential identity duplicate — review required, NOT auto-merged', names:[byNormalized[a][0], byNormalized[b][0]], editDistance:d});
  }
  return { ok:true, totalDistinctWorkerNames:names.length, issues,
    note:'A DATA-QUALITY DETECTOR ONLY. No worker identity is ever automatically merged by this function or by any report built on it — every flagged pair/group requires human review (and, if genuinely the same worker, a real business decision about introducing a workerId, which this data model does not currently have) before any consolidation.' };
}

// ============================================================
// Phase 7 — Report Variants / Favorites
// ============================================================
// A variant stores ONLY a filter/display CONFIGURATION (reportId, filters, dateRange, grouping,
// sorting, dimensions) — never a copy of report DATA, never a permissions token, never a cached
// result. "Loading" a variant on the client is nothing more than pre-filling the same filter
// inputs a user would otherwise type by hand and re-issuing the SAME report API call — which is
// re-authorized from scratch by that route's own existing role/project checks every single time.
// This is what makes §3's requirement structurally true rather than merely tested-true: there is
// no code path by which a variant can hand back data its owner is no longer authorized to see,
// because a variant never carries data in the first place. Every function below is scoped to
// `ownerId===actor.id` — a user can only list/rename/delete/favorite their OWN variants; there is
// no "shared" or "public" variant concept in this phase (not asked for, not built).
function createReportVariant({reportId, name, filters, dateRange, grouping, sorting, dimensions, actor}){
  if(!reportId || !String(reportId).trim()) return {ok:false, error:'A report ID is required.'};
  if(!name || !String(name).trim()) return {ok:false, error:'A variant name is required.'};
  const dupe = DB.reportVariants.find(v=>v.ownerId===actor.id && v.reportId===reportId && v.name.trim().toLowerCase()===name.trim().toLowerCase());
  if(dupe) return {ok:false, error:`You already have a variant named "${name.trim()}" for this report — rename or delete the existing one first.`};
  const v = { id: nextId(DB.reportVariants, 'RVAR-', 4), reportId, name:name.trim(), ownerId:actor.id, ownerRole:actor.role,
    filters: filters||{}, dateRange: dateRange||{dateFrom:null,dateTo:null}, grouping: grouping||null, sorting: sorting||null, dimensions: dimensions||null,
    favorite:false, createdAt:nowIso(), updatedAt:nowIso() };
  DB.reportVariants.push(v); save();
  logAudit({type:'ReportVariantCreated', variantId:v.id, reportId, name:v.name, userId:actor.id, role:actor.role});
  return {ok:true, variant:v};
}
function listReportVariants({reportId, actor}){
  return DB.reportVariants.filter(v=>v.ownerId===actor.id && (!reportId || v.reportId===reportId))
    .sort((a,b)=> (b.favorite - a.favorite) || b.updatedAt.localeCompare(a.updatedAt));
}
function renameReportVariant({id, name, actor}){
  const v = DB.reportVariants.find(x=>x.id===id);
  if(!v) return {ok:false, error:'Variant not found.'};
  if(v.ownerId!==actor.id) return {ok:false, error:'You can only rename your own variants.'};
  if(!name || !String(name).trim()) return {ok:false, error:'A variant name is required.'};
  const dupe = DB.reportVariants.find(x=>x.id!==id && x.ownerId===actor.id && x.reportId===v.reportId && x.name.trim().toLowerCase()===name.trim().toLowerCase());
  if(dupe) return {ok:false, error:`You already have a variant named "${name.trim()}" for this report.`};
  v.name = name.trim(); v.updatedAt = nowIso(); save();
  logAudit({type:'ReportVariantRenamed', variantId:id, newName:v.name, userId:actor.id, role:actor.role});
  return {ok:true, variant:v};
}
function deleteReportVariant({id, actor}){
  const idx = DB.reportVariants.findIndex(x=>x.id===id);
  if(idx===-1) return {ok:false, error:'Variant not found.'};
  const v = DB.reportVariants[idx];
  if(v.ownerId!==actor.id) return {ok:false, error:'You can only delete your own variants.'};
  DB.reportVariants.splice(idx,1); save();
  logAudit({type:'ReportVariantDeleted', variantId:id, reportId:v.reportId, name:v.name, userId:actor.id, role:actor.role});
  return {ok:true};
}
function toggleFavoriteReportVariant({id, actor}){
  const v = DB.reportVariants.find(x=>x.id===id);
  if(!v) return {ok:false, error:'Variant not found.'};
  if(v.ownerId!==actor.id) return {ok:false, error:'You can only favorite/unfavorite your own variants.'};
  v.favorite = !v.favorite; v.updatedAt = nowIso(); save();
  return {ok:true, variant:v};
}

// ============================================================
// Phase 9 — Orphan Reconciliation Detector (strictly read-only)
// ============================================================
// Forensic audit finding (before this function was written): this codebase uses TWO DIFFERENT,
// genuinely inconsistent linkage conventions between a journal entry and its source business
// document — never previously documented in one place:
//   (a) FORWARD: the JE stores sourceId pointing AT the document (GRN, MaterialIssue [pointing at
//       the inventory movement, not a separate "issue" document — none exists], Supplier/Customer
//       Invoice [pointing at the jeDrafts record], Fixed Asset events, Credit/Debit Notes,
//       Purchase Returns, Inventory Adjustments, Reversals [pointing at the entry being reversed],
//       Payments/Receipts [pointing at the INVOICE entry they clear, not their own document]).
//   (b) REVERSE: the document stores glEntryId pointing AT the JE, and the JE's own sourceId is
//       null (LabourWages, ProjectExpense — both proven live in Phase 8/9 testing).
// A correct orphan detector MUST check both directions per sourceType, or it produces false
// positives — confirmed live during this function's own construction: a naive reverse-only scan
// against this dataset misclassified 675 genuinely well-linked entries (GRNs, Material Issues,
// Invoices, etc. that use the FORWARD convention) as "orphans." That defect was caught before
// being shipped, not shipped and found later — the corrected two-direction table below is what
// actually runs.
// Some sourceTypes have NO real source document by design (a Manual/Manual JE is deliberately
// standalone; a Reversal's "source" is the entry it reverses, already covered by the forward
// check) — these are never called orphans. A handful of sourceTypes are KNOWN HISTORICAL TEST
// ARTIFACTS from this codebase's own earlier fault-injection phases (NaiveTest, Phase38NaiveTest,
// P26Test, P26DirectTest, TotallyUnrelatedMadeUpSourceType) — real, deliberately-injected records
// kept per this codebase's "never mutate/delete history" discipline, separated out explicitly
// rather than silently counted as either "fine" or "broken."
const _ORPHAN_SOURCE_MAP = {
  // sourceType: {dir:'forward', collection, matchField} — JE.sourceId must equal that record's [matchField||'id']
  'GRN':                          {dir:'forward', collection:'grns'},
  'MaterialIssue':                {dir:'forward', collection:'inventoryMovements'},
  'Supplier Bill (3-way matched)':{dir:'forward', collection:'jeDrafts'},
  'Supplier Bill':                {dir:'forward', collection:'jeDrafts'},
  'Customer Invoice':             {dir:'forward', collection:'jeDrafts'},
  'Manual':                       {dir:'forward', collection:'jeDrafts'},
  'Manual JE':                    {dir:'forward', collection:'jeDrafts'},
  'Supplier Payment':             {dir:'forward', collection:'journalEntries'}, // points at the invoice entry it clears
  'Customer Receipt':             {dir:'forward', collection:'journalEntries'},
  'Reversal':                     {dir:'forward', collection:'journalEntries'}, // points at the entry being reversed
  'FixedAssetCapitalization':     {dir:'forward', collection:'fixedAssets'},
  'Depreciation':                 {dir:'forward', collection:'fixedAssets'},
  'FixedAssetDisposal':           {dir:'forward', collection:'fixedAssets'},
  'PurchaseReturn':               {dir:'forward', collection:'purchaseReturns'},
  'InventoryAdjustment':          {dir:'forward', collection:'inventoryAdjustments'},
  'Supplier Credit Note':         {dir:'forward', collection:'supplierCreditNotes'},
  'Supplier Debit Note':          {dir:'forward', collection:'supplierDebitNotes'},
  'Customer Credit Note':         {dir:'forward', collection:'customerCreditNotes'},
  'Customer Debit Note':          {dir:'forward', collection:'customerDebitNotes'},
  'DamageReport':                 {dir:'forward', collection:'damageReports'},
  'ProductionLabour':             {dir:'forward', collection:'productionOrders'},
  'InstallationLabour':           {dir:'forward', collection:'installations'},
  'JobWorkScrapWriteOff':         {dir:'forward', collection:'jobWorkOrders'},
  'BankImportAllocation':         {dir:'forward', collection:'bankImportLines'},
  'LabourWages':                  {dir:'reverse', collection:'labourWages'},
  'ProjectExpense':               {dir:'reverse', collection:'projectExpenses'},
  // No dedicated source-document collection exists in this codebase for these — the JE itself IS
  // the record (same status as Manual, disclosed rather than silently matched or flagged).
  'BankTransfer':                 {dir:'none'},
  'SiteReturnLoss':               {dir:'none'}, // sourceId observed to be a SITE id, not a document id — a real, disclosed modeling inconsistency, not fabricated as a match
};
const _KNOWN_TEST_ARTIFACT_SOURCE_TYPES = new Set(['NaiveTest','Phase38NaiveTest','P26Test','P26DirectTest','TotallyUnrelatedMadeUpSourceType']);
function orphanReconciliationReport(){
  const byId = {}; // collectionName -> Map(id -> record)
  Object.keys(DB).forEach(k=>{ if(Array.isArray(DB[k])) byId[k] = new Map(DB[k].filter(r=>r&&r.id).map(r=>[r.id, r])); });
  const linked = [], orphans = [], noSourceExpected = [], knownTestArtifacts = [], unmappedType = [];
  DB.journalEntries.forEach(je=>{
    if(_KNOWN_TEST_ARTIFACT_SOURCE_TYPES.has(je.sourceType)){ knownTestArtifacts.push({id:je.id, sourceType:je.sourceType, sourceId:je.sourceId, date:je.date, amount:je.totalDebit}); return; }
    const rule = _ORPHAN_SOURCE_MAP[je.sourceType];
    if(!rule){ unmappedType.push({id:je.id, sourceType:je.sourceType||'(null)', sourceId:je.sourceId, date:je.date, amount:je.totalDebit}); return; }
    if(rule.dir==='none'){ noSourceExpected.push({id:je.id, sourceType:je.sourceType}); return; }
    if(rule.dir==='forward'){
      if(je.sourceId && byId[rule.collection] && byId[rule.collection].has(je.sourceId)){ linked.push(je.id); return; }
      orphans.push({id:je.id, sourceType:je.sourceType, expectedSourceId:je.sourceId, expectedCollection:rule.collection, actualSource:'NOT FOUND', date:je.date, amount:r2(je.totalDebit), narration:je.narration, severity: Math.abs(je.totalDebit)>10000?'High':'Medium'});
    } else { // reverse
      const found = (DB[rule.collection]||[]).find(r=>r.glEntryId===je.id);
      if(found){ linked.push(je.id); return; }
      orphans.push({id:je.id, sourceType:je.sourceType, expectedSourceId:null, expectedCollection:rule.collection, actualSource:'NOT FOUND (no '+rule.collection+' record references this JE via glEntryId)', date:je.date, amount:r2(je.totalDebit), narration:je.narration, severity: Math.abs(je.totalDebit)>10000?'High':'Medium'});
    }
  });

  // ---- Inventory Movement without a valid material (separate check, same read-only discipline) ----
  const invMovementOrphans = DB.inventoryMovements.filter(m=>!DB.materials.find(x=>x.id===m.materialId))
    .map(m=>({id:m.id, type:m.type, materialId:m.materialId, date:m.date, valuationAmount:m.valuationAmount, severity:'Low'}));

  // ---- Clearing without a valid payment/receipt JE ----
  const clearingOrphans = DB.clearings.filter(c=>!DB.journalEntries.find(je=>je.id===c.paymentEntryId))
    .map(c=>({id:c.id, type:c.type, invoiceEntryId:c.invoiceEntryId, paymentEntryId:c.paymentEntryId, amount:c.amount, date:c.date, severity:'High'}));

  // ---- GRN without a valid PO (mandatory linkage) ----
  const grnOrphans = DB.grns.filter(g=>!DB.purchaseOrders.find(p=>p.id===g.poId)).map(g=>({id:g.id, poId:g.poId, date:g.date, severity:'High'}));

  return {
    ok:true, generatedAt:nowIso(),
    summary:{ totalJournalEntries:DB.journalEntries.length, linked:linked.length, noSourceDocumentByDesign:noSourceExpected.length,
      knownHistoricalTestArtifacts:knownTestArtifacts.length, unmappedSourceType:unmappedType.length, genuineOrphans:orphans.length,
      inventoryMovementOrphans:invMovementOrphans.length, clearingOrphans:clearingOrphans.length, grnWithoutValidPO:grnOrphans.length },
    orphans, unmappedType, knownTestArtifacts, invMovementOrphans, clearingOrphans, grnOrphans,
    note:'Read-only. Distinguishes: (1) genuinely linked, (2) no source document by design (Manual/BankTransfer/SiteReturnLoss), (3) known historical test artifacts from this codebase\'s own earlier fault-injection phases, (4) an sourceType this detector has never been taught to map (flagged for review, never silently ignored or silently flagged), (5) genuine orphans. Nothing here is auto-repaired, merged, or deleted.'
  };
}

// Damage Reports — a purpose-built, reason-taxonomy-driven front end over the SAME
// createInventoryAdjustment() engine (same pattern as Supplier Debit Note mirroring Supplier
// Credit Note in Phase 24): NOT a second accounting/inventory mechanism. Always a decrease
// (damaged stock cannot be "found"), always tagged with its own docCategory/sourceType so it is
// separately reportable from a generic manual adjustment, and always requires a reason from a
// fixed taxonomy (with a mandatory written explanation for "Other") rather than free text alone.
const DAMAGE_REPORT_REASONS = ['Water Damage','Transit/Handling Damage','Expired/Obsolete','Manufacturing Defect','Warehouse Accident','Other'];
function createDamageReport({materialId, qty, warehouseId, reasonCategory, explanation, actor}){
  if(!DAMAGE_REPORT_REASONS.includes(reasonCategory)) return {ok:false, error:`Reason must be one of: ${DAMAGE_REPORT_REASONS.join(', ')}.`};
  if(reasonCategory==='Other' && !explanation) return {ok:false, error:'"Other" requires a mandatory written explanation.'};
  // Phase 15 FIX — same NaN-through-truthy-string hole closed the same way as
  // createInventoryAdjustment(), which this function calls into (defense in depth: fixed at both
  // layers so the error surfaces here, with the right context, rather than from the callee).
  { const _v = assertPositiveFiniteNumber(qty, 'Quantity'); if(!_v.ok) return _v; }
  const reasonText = `Damage Report — ${reasonCategory}${explanation?': '+explanation:''}`;
  const adj = createInventoryAdjustment({materialId, qty:-Math.abs(+qty), warehouseId, reason:reasonText, actor});
  if(!adj.ok) return adj;
  const dmg = { id:'DMG-'+String(DB.damageReports.length+1).padStart(4,'0'), dmgNo:nextDocNumber('DMG'), materialId, qty:Math.abs(+qty), warehouseId,
    reasonCategory, explanation:explanation||'', value:adj.adjustment.value, adjustmentId:adj.adjustment.id, glEntryId:adj.glEntry?adj.glEntry.id:null,
    itcReversed:0, itcReversalGlEntryId:null, createdBy:actor.id, createdAt:nowIso() };
  DB.damageReports.push(dmg);
  // Phase 34 SOP §2 — every Damage Report reason IS a genuine loss/damage per the SOP's own list
  // (ITC not available on lost/destroyed/written-off goods) — reverse the proportional input tax
  // originally claimed on this material, through the SAME central engine, tagged to this report.
  const itc = reverseITCForWriteOff({materialId, qty:Math.abs(+qty), warehouseId, sourceType:'DamageReport', sourceId:dmg.id, actor});
  if(itc.ok && itc.reversed>0){ dmg.itcReversed = itc.reversed; dmg.itcReversalGlEntryId = itc.glEntry.id; }
  // Phase 41 FIX — a failed ITC reversal used to report `itcReversal:null`, indistinguishable from
  // "not applicable" (nothing to reverse). The damage report's own inventory+GL effect is already
  // correctly committed by this point (via the fixed createInventoryAdjustment above), so a failed
  // *secondary* compliance step is surfaced as an explicit, visible warning rather than silently
  // rolling back an otherwise-valid transaction or hiding that manual follow-up is now needed.
  if(!itc.ok) dmg.itcReversalWarning = itc.error;
  save();
  logAudit({type:'DamageReportCreated', damageReportId:dmg.id, materialId, qty:dmg.qty, warehouseId, reasonCategory, value:dmg.value, itcReversed:dmg.itcReversed, itcReversalFailed: itc.ok?undefined:itc.error, userId:actor.id, role:actor.role});
  return {ok:true, damageReport:dmg, adjustment:adj.adjustment, glEntry:adj.glEntry,
    itcReversal: itc.ok ? {amount:itc.reversed, glEntry:itc.glEntry||null} : null,
    itcReversalWarning: itc.ok ? undefined : `Input Tax Credit reversal did not post: ${itc.error} — this damage report's inventory/GL effect is valid; the ITC reversal needs manual follow-up.`};
}

// Stock Counts — a physical/cycle count session: snapshot the system qty for a set of materials
// in a warehouse at count time, let the counter record what they actually found, then post the
// variance for each line through the SAME createInventoryAdjustment() engine used by damage
// reports and manual adjustments above — one inventory-valuation mechanism, three front ends.
function createStockCount({warehouseId, materialIds, actor}){
  if(!warehouseId || !DB.warehouses.find(w=>w.id===warehouseId)) return {ok:false, error:'A valid warehouse is required.'};
  if(!Array.isArray(materialIds) || !materialIds.length) return {ok:false, error:'At least one material is required.'};
  const lines = materialIds.map(materialId=>({ materialId, systemQty: r2(getStockLevel(materialId, warehouseId)), countedQty:null }));
  const sc = { id:'SCT-'+String(DB.stockCounts.length+1).padStart(4,'0'), sctNo:nextDocNumber('SCT'), warehouseId, lines, status:'Open',
    createdBy:actor.id, createdAt:nowIso(), completedBy:null, completedAt:null };
  DB.stockCounts.push(sc); save();
  logAudit({type:'StockCountCreated', stockCountId:sc.id, warehouseId, materialCount:materialIds.length, userId:actor.id, role:actor.role});
  return {ok:true, stockCount:sc};
}
function submitStockCount({id, countedQtys, actor}){
  const sc = DB.stockCounts.find(x=>x.id===id);
  if(!sc) return {ok:false, error:'Stock count not found.'};
  if(sc.status!=='Open') return {ok:false, error:`This stock count is already "${sc.status}".`};
  const adjustments = [];
  const failedLines = [];
  // Phase 43 CRITICAL FIX — same class as issueProductionMaterial()/issueServiceMaterial(): legacy-
  // routed, calls createInventoryAdjustment() (GL/inventory-touching) with no active transaction
  // boundary, PROVEN LIVE broken under enforce mode. Wrapped PER LINE to preserve the existing,
  // Phase-41-established "a failed line is recorded and the count still completes" behavior.
  sc.lines.forEach((line,idx)=>{
    const counted = +countedQtys[idx];
    if(counted===undefined || counted===null || isNaN(counted)) return;
    line.countedQty = r2(counted);
    const variance = r2(line.countedQty - line.systemQty);
    if(Math.abs(variance)>0.001){
      const adj = withTransaction(actor, {name:'submitStockCount:line'}, () =>
        createInventoryAdjustment({materialId:line.materialId, qty:variance, warehouseId:sc.warehouseId,
          reason:`Stock Count ${sc.sctNo} — system ${line.systemQty}, counted ${line.countedQty}`, actor}));
      // Phase 41 FIX — a line whose variance-adjustment failed (e.g. closed period) used to be
      // silently skipped, with the stock count still marked Completed as if every variance had
      // been posted. Now the failure is recorded on the line itself and in the response, so a
      // variance that never actually got posted isn't indistinguishable from one that did.
      if(adj.ok){ line.adjustmentId = adj.adjustment.id; adjustments.push(adj.adjustment); }
      else { line.adjustmentError = adj.error; failedLines.push({materialId:line.materialId, variance, error:adj.error}); }
    }
  });
  sc.status = 'Completed'; sc.completedBy = actor.id; sc.completedAt = nowIso();
  sc.hadFailedAdjustments = failedLines.length>0;
  save();
  logAudit({type:'StockCountCompleted', stockCountId:sc.id, adjustmentCount:adjustments.length, failedLines: failedLines.length?failedLines:undefined, userId:actor.id, role:actor.role});
  return {ok:true, stockCount:sc, adjustments, failedLines: failedLines.length?failedLines:undefined};
}

// §14 Journal Templates — reusable header/line patterns for recurring narrations (Rent/Security/
// Utility/Provision). A template creates a normal Draft through the UNMODIFIED `createDraft()` —
// it pre-fills the form, it does not bypass Submit/Approve/Post/authorization/balancing in any way.
function createJournalTemplate({name, category, docTypeCode, lines, defaultNarration, branchId, actor}){
  if(!name || !Array.isArray(lines) || lines.length<2) return {ok:false, error:'Template needs a name and at least 2 lines.'};
  const t = { id:'JT-'+String(DB.journalTemplates.length+1).padStart(3,'0'), tmplNo:nextDocNumber('JT'), name, category:category||'General',
    docTypeCode:docTypeCode||'JE', lines, defaultNarration:defaultNarration||name, branchId:branchId||null, createdBy:actor.id, createdAt:nowIso(), active:true };
  DB.journalTemplates.push(t); save();
  logAudit({type:'JournalTemplateCreated', templateId:t.id, name, userId:actor.id, role:actor.role});
  return {ok:true, template:t};
}
function listJournalTemplates(){ return DB.journalTemplates.filter(t=>t.active); }
function createDraftFromTemplate({templateId, date, amount, narration, branchId, createdByUserId, createdByRole}){
  const t = DB.journalTemplates.find(x=>x.id===templateId && x.active);
  if(!t) return {ok:false, error:'Template not found.'};
  // A template's stored lines carry a `pctOfAmount` weight (defaults to matching debit/credit
  // shape at 100%) rather than a hardcoded amount, so ONE template can be reused at any amount —
  // e.g. "Security Wage" at ₹37,440 one month, a different figure the next, never silently reused
  // verbatim (§14 does not permit inventing a fixed recurring amount).
  if(!amount || +amount<=0) return {ok:false, error:'Amount is required to instantiate a template.'};
  const lines = t.lines.map(l=>({ ...l, debit: l.debit>0 ? r2(+amount * (l.pctOfAmount!=null?l.pctOfAmount:1)) : 0, credit: l.credit>0 ? r2(+amount * (l.pctOfAmount!=null?l.pctOfAmount:1)) : 0 }));
  return createDraft({ date, narration:narration||t.defaultNarration, docTypeCode:t.docTypeCode, sourceType:'Journal Template', docCategory:'JournalVoucher',
    lines, branchId:branchId||t.branchId, createdByUserId, createdByRole });
}

// §15 Recurring Entries — NO background scheduler exists in this stateless dev server (a real,
// disclosed limitation, not hidden), so "Next Run" is informational and a human must explicitly
// trigger generation. What IS real: generation always creates a normal Draft (never an
// auto-posted entry) that still needs Submit/Approve/Post — §15's explicit "must not
// automatically post unauthorized transactions" requirement is structurally impossible to
// violate here, since nothing in this code path can reach `postDraft()`.
function createRecurringEntry({templateId, frequency, startDate, endDate, amount, narration, actor}){
  const t = DB.journalTemplates.find(x=>x.id===templateId && x.active);
  if(!t) return {ok:false, error:'Template not found.'};
  if(!['Monthly','Quarterly','Yearly'].includes(frequency)) return {ok:false, error:'Frequency must be Monthly, Quarterly, or Yearly.'};
  const re = { id:'REC-'+String(DB.recurringEntries.length+1).padStart(3,'0'), recNo:nextDocNumber('REC'), templateId, frequency, startDate, endDate:endDate||null,
    amount:+amount, narration:narration||t.defaultNarration, nextRunDate:startDate, lastRunDate:null, status:'Active', createdBy:actor.id, createdAt:nowIso() };
  DB.recurringEntries.push(re); save();
  logAudit({type:'RecurringEntryCreated', recurringId:re.id, templateId, frequency, userId:actor.id, role:actor.role});
  return {ok:true, recurring:re};
}
function listRecurringEntries(){ return DB.recurringEntries; }
function advanceRecurrenceDate(dateStr, frequency){
  const d = new Date(dateStr);
  if(frequency==='Monthly') d.setMonth(d.getMonth()+1);
  else if(frequency==='Quarterly') d.setMonth(d.getMonth()+3);
  else d.setFullYear(d.getFullYear()+1);
  return d.toISOString().slice(0,10);
}
// DEFECT FOUND & FIXED (Phase 14 own regression, phase14_accounting_tests.js): the first version
// generated only ONE due period per recurring rule per call, silently leaving 2 of 3 overdue
// periods ungenerated when the trigger hadn't been run in a while. Real accounting software (and
// this policy's own "Next Run" tracking) expects a catch-up run to produce EVERY overdue period,
// not just the earliest one — fixed with a while-loop that keeps generating (still only Drafts,
// never posted) until nextRunDate is no longer due, exactly like a missed month of security-wage
// entries should all appear for review, not trickle out one manual click at a time.
function generateDueRecurringDrafts({asOfDate, actor}){
  const today = asOfDate || new Date().toISOString().slice(0,10);
  const generated = [];
  // Phase 41 FIX — a rule whose draft-creation failed partway through its due periods (e.g. a
  // closed period blocking one month but not the next) used to just `break` silently, and the
  // whole batch still reported ok:true with a shorter `generated` list — no indication a rule was
  // left short of its actual due date. Now each stall is recorded (skippedDue) and surfaced.
  const skipped = [];
  DB.recurringEntries.filter(r=>r.status==='Active').forEach(r=>{
    while(r.status==='Active' && r.nextRunDate<=today && (!r.endDate || r.nextRunDate<=r.endDate)){
      const draftResult = createDraftFromTemplate({ templateId:r.templateId, date:r.nextRunDate, amount:r.amount, narration:r.narration, createdByUserId:actor.id, createdByRole:actor.role });
      if(!draftResult.ok){
        skipped.push({recurringEntryId:r.id, dueDate:r.nextRunDate, error:draftResult.error});
        break;
      }
      draftResult.draft.recurringEntryId = r.id;
      r.lastRunDate = r.nextRunDate; r.nextRunDate = advanceRecurrenceDate(r.nextRunDate, r.frequency);
      if(r.endDate && r.nextRunDate>r.endDate) r.status='Completed';
      generated.push(draftResult.draft);
    }
  });
  save();
  logAudit({type:'RecurringDraftsGenerated', count:generated.length, asOfDate:today, skipped: skipped.length?skipped:undefined, userId:actor.id, role:actor.role});
  return {ok:true, generated, skipped: skipped.length?skipped:undefined};
}

// §16 Controlled Excel/CSV Import — Excel→Validation→Draft→Review→Approval→Post, never a direct
// post. Zero npm dependencies in this lab (established since Phase 6A), so CSV is the accepted
// format — it round-trips cleanly with POL-12's own CSV exports. Every imported row still goes
// through the SAME `createDraft()`/balance-check/RBAC/period-control path as manual entry; import
// only assembles the lines, it never calls `postDraft()`.
function parseImportCsv(csvText){
  const lines = csvText.split(/\r?\n/).filter(l=>l.trim().length);
  if(lines.length<2) return {ok:false, error:'CSV needs a header row plus at least one data row.'};
  const header = lines[0].split(',').map(h=>h.trim());
  const required = ['Account','Debit','Credit'];
  for(const r of required) if(!header.includes(r)) return {ok:false, error:`Missing required column "${r}".`};
  const rows = lines.slice(1).map(l=>{
    const cells = l.split(',').map(c=>c.trim());
    const row = {}; header.forEach((h,i)=>row[h]=cells[i]);
    return row;
  });
  return {ok:true, header, rows};
}
function importJournalCSV({csvText, date, narration, branchId, createdByUserId, createdByRole}){
  const parsed = parseImportCsv(csvText);
  if(!parsed.ok) return parsed;
  const errors = [];
  const lines = parsed.rows.map((row,idx)=>{
    if(!row.Account) errors.push(`Row ${idx+1}: missing Account.`);
    if(!DB.accounts.find(a=>a.id===row.Account)) errors.push(`Row ${idx+1}: unknown account "${row.Account}".`);
    if(row.Project && !DB.projects.find(p=>p.id===row.Project)) errors.push(`Row ${idx+1}: unknown project "${row.Project}".`);
    if(row.CostCentre && !DB.costCentres.find(c=>c.id===row.CostCentre)) errors.push(`Row ${idx+1}: unknown cost centre "${row.CostCentre}".`);
    if(row.TaxCode && !DB.taxCodes.find(t=>t.code===row.TaxCode)) errors.push(`Row ${idx+1}: unknown tax code "${row.TaxCode}".`);
    return { account:row.Account, debit:+row.Debit||0, credit:+row.Credit||0, projectId:row.Project||null, costCentreId:row.CostCentre||null, taxCode:row.TaxCode||null, remarks:row.Remarks||'' };
  });
  const sim = simulateDraft(lines);
  if(!sim.balanced) errors.push(`Import is not balanced — total debit ₹${sim.totalDebit.toFixed(2)} ≠ total credit ₹${sim.totalCredit.toFixed(2)}.`);
  const batch = { id:'IMP-'+String(DB.importBatches.length+1).padStart(3,'0'), rowCount:parsed.rows.length, errors, valid:errors.length===0, createdBy:createdByUserId, createdAt:nowIso() };
  if(errors.length){ DB.importBatches.push(batch); save(); return {ok:false, error:'Import validation failed.', errors, batch}; }
  const draft = createDraft({ date, docDate:date, narration:narration||'Imported Journal Entry', docTypeCode:'JE', sourceType:'CSV Import', docCategory:'JournalVoucher',
    lines, branchId, createdByUserId, createdByRole });
  if(draft.ok){ batch.draftId = draft.draft.id; }
  DB.importBatches.push(batch); save();
  logAudit({type:'JournalImported', batchId:batch.id, rowCount:batch.rowCount, draftId:draft.draft && draft.draft.id, userId:createdByUserId, role:createdByRole});
  return draft.ok ? {ok:true, draft:draft.draft, batch} : draft;
}

// §18 — lightweight branch data-scope: only enforced when a user actually has assignedBranches
// set (mirrors the existing assignedProjects/assignedCustomers pattern exactly — most roles have
// none set and are unrestricted, same as today).
function branchAllowed(actor, branchId){
  if(!branchId) return true;
  if(!actor.assignedBranches || !actor.assignedBranches.length) return true;
  return actor.assignedBranches.includes(branchId);
}

// §36 — Entry-Type Catalogue, generated from the actual posting call sites (grounded in code,
// not hand-maintained prose that could drift). Used by the Phase 14 report and by
// `/api/accounting/entry-types` for a live, always-current matrix.
function entryTypeCatalogue(){
  const seen = new Map();
  DB.journalEntries.forEach(je=>{
    const key = je.docCategory || je.sourceType || 'Manual';
    if(!seen.has(key)) seen.set(key, {docCategory:key, count:0, sampleSourceTypes:new Set()});
    const e = seen.get(key); e.count++; e.sampleSourceTypes.add(je.sourceType);
  });
  return Array.from(seen.values()).map(e=>({...e, sampleSourceTypes:Array.from(e.sampleSourceTypes)}));
}

// ============================================================
// Phase 19 §4/§5 — HSN (materials) / SAC (services, on the rate card) / Customer GSTIN.
// APPROVED decision A for both: capability required, but NEITHER is mandatory — a customer or
// material may exist with the field blank forever, and creation/invoicing is never blocked for
// its absence. No real HSN/SAC/GSTIN value is invented anywhere in this Lab; only what an
// authorized user (masterData tier) explicitly types in is ever stored.
// ============================================================
// ============================================================
// Phase 19 §28 (APPROVED — Decision B: strong password requirement + existing lockout, NO
// expiry). No user-creation or password-change endpoint existed anywhere before this phase —
// users were seed-only — so this policy had nothing real to enforce against. Building the
// minimal real surface (Create User, Admin-authorized Reset, self-service Change) so the policy
// is genuinely testable, not just described. Existing seeded passwords (e.g. "Admin@12345")
// already satisfy this bar, confirmed by inspection, so no seed data needed to change.
// ============================================================
function validatePasswordStrength(password){
  const p = String(password||'');
  const errors = [];
  if(p.length < 8) errors.push('at least 8 characters');
  if(!/[A-Z]/.test(p)) errors.push('at least one uppercase letter');
  if(!/[a-z]/.test(p)) errors.push('at least one lowercase letter');
  if(!/[0-9]/.test(p)) errors.push('at least one digit');
  if(!/[^A-Za-z0-9]/.test(p)) errors.push('at least one special character');
  return { valid: errors.length===0, errors };
}
// Phase 44 FIX — found via a fresh audit-coverage measurement: this function is reached only via
// a legacy route (/api/admin/users, no `auditReject` wrapper), and it only ever called logAudit()
// on the SUCCESS path — every rejection (duplicate username, invalid role, weak password) left
// zero audit trail. Live-measured: 10 duplicate-username attempts produced 0 matching audit
// entries, versus the SAME class of rejection on a modern-routed endpoint (e.g. /api/ar/invoice),
// which is automatically audited as `BusinessRuleRejected` by the dispatch layer. User-account
// creation rejections are exactly the kind of event a security review would want a trail for
// (repeated attempts to claim an existing/admin-like username, for instance).
function createUser({username, name, role, password, assignedProjects, assignedCustomers, actor}){
  if(!username || !username.trim()) return {ok:false, error:'Username is required.'};
  if(!ROLES.includes(role)){
    // ERP-059B — durableFailureAudit, see ERP-059B-TRANSACTION-DESIGN.md.
    return {ok:false, error:`Unknown role "${role}". Do not invent a new role — must be one of: ${ROLES.join(', ')}.`,
      durableFailureAudit:{type:'UserCreationRejected', reason:'InvalidRole', attemptedUsername:username, attemptedRole:role}};
  }
  // Phase 39 CRITICAL FIX — found live: the uniqueness check was case-sensitive only, so "ADMIN"
  // was accepted as a genuinely separate account from the real "admin" — two visually-confusable
  // logins for two different real identities (or a second account for the same person by
  // accident), a real security/audit-trail risk (which "admin" did a given login/audit-log entry
  // actually mean?). Login itself already matches usernames exact-case only (server.js), so this
  // fix does not change which account an EXISTING login authenticates as — it only closes the
  // door on creating a new, confusable duplicate going forward.
  if(DB.users.find(u=>u.username.toLowerCase()===username.trim().toLowerCase())){
    // ERP-059B — durableFailureAudit, see ERP-059B-TRANSACTION-DESIGN.md.
    return {ok:false, error:'Username already exists.', durableFailureAudit:{type:'UserCreationRejected', reason:'DuplicateUsername', attemptedUsername:username}};
  }
  const strength = validatePasswordStrength(password);
  if(!strength.valid){
    // ERP-059B — durableFailureAudit. Note: `strength.errors` is a fixed list of policy-rule
    // names (e.g. "needs a digit") — never the attempted password itself, so this stays compliant
    // with the "never persist a password" rule the design doc requires.
    return {ok:false, error:'Password does not meet the strong-password policy — missing: '+strength.errors.join(', ')+'.',
      durableFailureAudit:{type:'UserCreationRejected', reason:'WeakPassword', attemptedUsername:username, missing:strength.errors}};
  }
  const {hash, salt} = hashPassword(password);
  const user = { id: nextId(DB.users, 'U-', 4), username:username.trim(), name:name||username, role, active:true,
    assignedProjects:assignedProjects||null, assignedCustomers:assignedCustomers||null,
    passwordHash:hash, passwordSalt:salt, failedLoginCount:0, lockedUntil:null, mustChangePassword:false };
  DB.users.push(user); save();
  logAudit({type:'UserCreated', createdUserId:user.id, createdUsername:user.username, createdRole:role, userId:actor.id, role:actor.role});
  return {ok:true, user:{id:user.id, username:user.username, name:user.name, role:user.role}};
}
// "Authorized recovery" (§28) — an Admin/CEO resets a locked-out or forgotten password for
// another user. Clears the lockout too, since a fresh valid credential makes the lockout moot.
function resetUserPassword({userId, newPassword, actor}){
  const u = DB.users.find(x=>x.id===userId);
  if(!u) return {ok:false, error:'User not found.'};
  const strength = validatePasswordStrength(newPassword);
  if(!strength.valid) return {ok:false, error:'Password does not meet the strong-password policy — missing: '+strength.errors.join(', ')+'.'};
  const {hash, salt} = hashPassword(newPassword);
  u.passwordHash = hash; u.passwordSalt = salt; u.failedLoginCount = 0; u.lockedUntil = null;
  save();
  logAudit({type:'UserPasswordReset', targetUserId:u.id, targetUsername:u.username, userId:actor.id, role:actor.role});
  return {ok:true};
}
function changeOwnPassword({actor, currentPassword, newPassword}){
  const u = DB.users.find(x=>x.id===actor.id);
  if(!u) return {ok:false, error:'User not found.'};
  if(!verifyPassword(currentPassword, u.passwordHash, u.passwordSalt)) return {ok:false, error:'Current password is incorrect.'};
  const strength = validatePasswordStrength(newPassword);
  if(!strength.valid) return {ok:false, error:'Password does not meet the strong-password policy — missing: '+strength.errors.join(', ')+'.'};
  const {hash, salt} = hashPassword(newPassword);
  u.passwordHash = hash; u.passwordSalt = salt;
  save();
  logAudit({type:'UserPasswordChanged', userId:u.id, username:u.username, role:actor.role});
  return {ok:true};
}

// ============================================================
// Phase 19 §26/§27 (APPROVED — Decision A, required). Real Fixed Asset capability, built on the
// SAME shared posting engine (§31 — no separate hidden accounting system). Lifecycle: Purchase
// (register, no GL impact yet) -> Capitalization (the REAL GL event, Dr 1400/Cr Bank-or-AP) ->
// Depreciation (Dr 5400/Cr 1450, repeatable) -> Transfer (register-only, no GL impact — a
// location/custodian change is not itself an accounting event) -> Disposal (removes cost +
// accumulated depreciation, books the gain/loss plug). Reversal reuses the EXISTING generic
// reverseEntry() for free — Capitalization/Depreciation/Disposal postings are ordinary journal
// entries, nothing bespoke.
//
// ACCOUNTING POLICY REQUIRED, never silently defaulted: useful life, depreciation method, and
// residual value must be explicitly supplied at capitalization — capitalizeFixedAsset() rejects
// the call outright if any is missing, rather than assuming a number. Depreciation amount is only
// AUTO-COMPUTED when the method the USER already chose is 'StraightLine' (pure arithmetic
// execution of a policy that was already explicitly selected, not a new invention); any other
// method requires an explicit amount per posting, since no formula for it is assumed here.
// ============================================================
function createFixedAsset({assetCode, assetName, assetClass, purchaseDate, cost, location, custodian, projectId, sourceInvoiceEntryId, actor}){
  if(!assetName) return {ok:false, error:'Asset name is required.'};
  if(!purchaseDate) return {ok:false, error:'Purchase date is required.'};
  if(!(+cost>0)) return {ok:false, error:'Cost must be a positive number.'};
  const id = nextId(DB.fixedAssets, 'FA-', 4);
  const asset = { id, assetCode: assetCode||id, assetName, assetClass: assetClass||null, purchaseDate, cost:+cost,
    location: location||null, custodian: custodian||null, projectId: projectId||null, sourceInvoiceEntryId: sourceInvoiceEntryId||null,
    status: 'Purchased', capitalizationDate:null, capitalizationEntryId:null,
    usefulLifeMonths:null, depreciationMethod:null, residualValue:null,
    disposalDate:null, disposalProceeds:null, disposalEntryId:null,
    transferHistory:[], createdBy:actor.id, createdAt:nowIso() };
  DB.fixedAssets.push(asset); save();
  logAudit({type:'FixedAssetCreated', assetId:id, assetName, cost:+cost, userId:actor.id, role:actor.role});
  return {ok:true, asset};
}
function assetAccumulatedDepreciation(assetId){
  return r2(DB.journalEntries.filter(je=>je.docCategory==='Depreciation' && je.sourceId===assetId && !je.reversedByEntryId)
    .flatMap(je=>je.lines).filter(l=>l.account==='1450').reduce((s,l)=>s+l.credit-l.debit,0));
}
function assetNetBookValue(asset){ return r2(asset.cost - assetAccumulatedDepreciation(asset.id)); }
function capitalizeFixedAsset({assetId, capitalizationDate, fundingSource, vendorId, usefulLifeMonths, depreciationMethod, residualValue, overrideReason, actor}){
  { const _a = assertCanCapitalizeFixedAsset(actor); if(!_a.ok) return _a; }
  const asset = DB.fixedAssets.find(a=>a.id===assetId);
  if(!asset) return {ok:false, error:'Fixed asset not found.'};
  if(asset.status!=='Purchased') return {ok:false, error:`Cannot capitalize — asset is "${asset.status}", not Purchased.`};
  if(!capitalizationDate) return {ok:false, error:'Capitalization date is required.'};
  // Phase 34 Part A — closed-project gate, via the asset's own project. Reuses the SAME
  // overrideReason field already threaded through to postJournalEntry() below for the
  // closed-PERIOD override, matching the Phase 33 GRN/Material-Issue precedent exactly.
  { const _po = assertProjectOpenForPosting(asset.projectId, actor, {overrideReason, action:'capitalize a fixed asset'}); if(!_po.ok) return _po; }
  if(usefulLifeMonths===undefined || usefulLifeMonths===null || usefulLifeMonths==='') return {ok:false, error:'ACCOUNTING POLICY REQUIRED — Useful Life (months) must be explicitly specified; it is never defaulted.'};
  if(!depreciationMethod) return {ok:false, error:'ACCOUNTING POLICY REQUIRED — Depreciation Method must be explicitly specified; it is never defaulted.'};
  if(residualValue===undefined || residualValue===null || residualValue==='') return {ok:false, error:'ACCOUNTING POLICY REQUIRED — Residual Value must be explicitly specified (enter 0 if genuinely nil — it is never silently assumed).'};
  if(+usefulLifeMonths<=0) return {ok:false, error:'Useful Life must be a positive number of months.'};
  if(+residualValue<0 || +residualValue>=asset.cost) return {ok:false, error:'Residual Value must be ≥ 0 and less than the asset cost.'};
  let lines, docCategory='FixedAssetCapitalization';
  if(fundingSource==='AP'){
    if(!vendorId) return {ok:false, error:'A vendor is required when funding source is AP (unpaid).'};
    lines = [ {account:'1400', debit:asset.cost, credit:0, vendorId, projectId:asset.projectId}, {account:'2000', debit:0, credit:asset.cost, vendorId, projectId:asset.projectId} ];
  } else if(fundingSource==='Bank'){
    lines = [ {account:'1400', debit:asset.cost, credit:0, projectId:asset.projectId}, {account:'1000', debit:0, credit:asset.cost, projectId:asset.projectId} ];
  } else {
    return {ok:false, error:'fundingSource must be "Bank" (paid directly) or "AP" (payable to a vendor).'};
  }
  const _capJesLen = DB.journalEntries.length;
  const _capBefore = {status:asset.status, capitalizationDate:asset.capitalizationDate, capitalizationEntryId:asset.capitalizationEntryId, usefulLifeMonths:asset.usefulLifeMonths, depreciationMethod:asset.depreciationMethod, residualValue:asset.residualValue};
  const result = postJournalEntry({ date:capitalizationDate, narration:`Fixed Asset Capitalization — ${asset.assetCode} (${asset.assetName})`,
    sourceType:'FixedAssetCapitalization', sourceId:asset.id, voucherNo:nextDocNumber('FA', capitalizationDate), docCategory, party:vendorId||null,
    lines, actor, capability:'FIXED_ASSET_CAPITALIZE', overrideReason });
  if(!result.ok) return result;
  // Phase 36 Part K CRITICAL FIX — same defect class as createGRN()/createMaterialIssue() (Phase
  // 35): GL commits above via an object-field mutation (not a push), so an exception between GL
  // success and this mutation left asset.status stuck at 'Purchased' while the GL already showed
  // it capitalized — and since assertCanCapitalizeFixedAsset's own guard only checks
  // asset.status!=='Purchased', a retry would be silently ALLOWED and would double-capitalize the
  // same physical asset's cost into the Fixed Asset account a second time.
  try {
    _fault('CAPITALIZE_AFTER_GL_BEFORE_STATUS'); // Phase 36 Part K
    asset.status='Capitalized'; asset.capitalizationDate=capitalizationDate; asset.capitalizationEntryId=result.entry.id;
    asset.usefulLifeMonths=+usefulLifeMonths; asset.depreciationMethod=depreciationMethod; asset.residualValue=+residualValue;
    save();
    logAudit({type:'FixedAssetCapitalized', assetId:asset.id, cost:asset.cost, usefulLifeMonths:+usefulLifeMonths, depreciationMethod, residualValue:+residualValue, userId:actor.id, role:actor.role});
    return {ok:true, asset, entry:result.entry};
  } catch(e) {
    DB.journalEntries.length = _capJesLen;
    Object.assign(asset, _capBefore);
    save();
    logAudit({type:'FixedAssetCapitalizationRolledBackOnFailure', assetId:asset.id, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}
function _monthDayCount(dateStr){ const [y,m] = dateStr.split('-').map(Number); return new Date(y, m, 0).getDate(); }
function computeStraightLineMonthly(asset, periodDate){
  if(asset.depreciationMethod!=='StraightLine' || !asset.usefulLifeMonths) return null;
  const full = r2((asset.cost - asset.residualValue) / asset.usefulLifeMonths);
  // Phase 37 MEDIUM FIX — partial-period proration. Previously every asset depreciated a full
  // period's charge regardless of WHEN in that period it was capitalized (day 1 and day 28 of the
  // same month were charged identically). This prorates ONLY the calendar month that actually
  // contains the capitalization date, by the fraction of that month remaining from the
  // capitalization day onward (inclusive) — every later period still gets the full monthly amount
  // exactly as before, since its periodDate month will no longer match capitalizationDate's month.
  if(periodDate && asset.capitalizationDate && asset.capitalizationDate.slice(0,7)===periodDate.slice(0,7)){
    const totalDays = _monthDayCount(periodDate);
    const capDay = +asset.capitalizationDate.split('-')[2];
    const daysUsed = Math.max(1, totalDays - capDay + 1);
    return r2(full * daysUsed / totalDays);
  }
  return full;
}
function postAssetDepreciation({assetId, periodDate, amount, overrideReason, actor}){
  { const _a = assertCanPostAssetDepreciation(actor); if(!_a.ok) return _a; }
  const asset = DB.fixedAssets.find(a=>a.id===assetId);
  if(!asset) return {ok:false, error:'Fixed asset not found.'};
  if(asset.status!=='Capitalized') return {ok:false, error:`Cannot depreciate — asset is "${asset.status}", not Capitalized.`};
  // Phase 34 Part A — closed-project gate, via the asset's own project.
  { const _po = assertProjectOpenForPosting(asset.projectId, actor, {overrideReason, action:'post asset depreciation'}); if(!_po.ok) return _po; }
  if(!periodDate) return {ok:false, error:'Period date is required.'};
  let value = amount!==undefined && amount!==null && amount!=='' ? +amount : computeStraightLineMonthly(asset, periodDate);
  if(value===null) return {ok:false, error:`No amount was supplied, and depreciation method "${asset.depreciationMethod}" has no built-in formula in this Lab — an explicit amount is required for any method other than StraightLine.`};
  if(!(value>0)) return {ok:false, error:'Depreciation amount must be positive.'};
  const already = assetAccumulatedDepreciation(assetId);
  const maxDepreciable = r2(asset.cost - asset.residualValue - already);
  if(value > maxDepreciable + 0.01) return {ok:false, error:`Cannot depreciate ₹${value} — only ₹${maxDepreciable} remains depreciable before hitting the residual value floor.`};
  const result = postJournalEntry({ date:periodDate, narration:`Depreciation — ${asset.assetCode} (${asset.assetName}) — ${periodDate.slice(0,7)}`,
    sourceType:'Depreciation', sourceId:asset.id, voucherNo:nextDocNumber('JE', periodDate), docCategory:'Depreciation',
    lines:[ {account:'5400', debit:value, credit:0, projectId:asset.projectId}, {account:'1450', debit:0, credit:value, projectId:asset.projectId} ],
    actor, capability:'FIXED_ASSET_DEPRECIATION', overrideReason });
  if(!result.ok) return result;
  logAudit({type:'FixedAssetDepreciationPosted', assetId, periodDate, amount:value, userId:actor.id, role:actor.role});
  return {ok:true, entry:result.entry, accumulatedDepreciation: r2(already+value), netBookValue: assetNetBookValue(asset)};
}
function transferFixedAsset({assetId, newLocation, newCustodian, newProjectId, reason, actor}){
  { const _a = assertCanTransferFixedAsset(actor); if(!_a.ok) return _a; }
  const asset = DB.fixedAssets.find(a=>a.id===assetId);
  if(!asset) return {ok:false, error:'Fixed asset not found.'};
  if(asset.status==='Disposed') return {ok:false, error:'Cannot transfer a disposed asset.'};
  if(!reason) return {ok:false, error:'A reason is required for every asset transfer.'};
  // Quick Control Fixes phase — the destination project, when supplied, must be a real project:
  // this function already validates every OTHER destination-adjacent thing (asset exists, not
  // disposed, reason given) but previously accepted any string as newProjectId, silently attributing
  // an asset's future depreciation/disposal postings to a project that does not exist. Same
  // "Unknown project" validation this codebase already uses everywhere else a bare projectId is
  // accepted (see DB.projects.find(...) call sites throughout this file) — not a new policy.
  if(newProjectId!==undefined && newProjectId!==null && !DB.projects.find(p=>p.id===newProjectId)) return {ok:false, error:`Unknown project "${newProjectId}".`};
  // Phase 34 Part A — closed-project gate, via the asset's CURRENT project (reassigning an asset
  // OUT of a closed project's register is the meaningful mutation here; this function has no GL/
  // inventory effect of its own, but it does change which project future depreciation/disposal
  // postings attribute to). Reuses the function's own already-mandatory `reason` field — this
  // function requires one unconditionally regardless of project status, so an ordinary open-project
  // transfer is completely unaffected; only a CLOSED-project transfer additionally requires the
  // actor to be CEO/Admin.
  // Quick Control Fixes phase — corrected a stale comment that used to stand here claiming "this
  // function has no assertCanXxx() domain-level role check at all." That was true when Phase 34
  // wrote it, but Phase 35 Part F (see assertCanTransferFixedAsset() above, and the call at the top
  // of this function) already closed that gap. Left uncorrected, the old comment would have
  // wrongly told a future reader — or this very phase's own investigation — that the gate was
  // still missing when it was not; verified live against the current code before writing this note.
  { const _po = assertProjectOpenForPosting(asset.projectId, actor, {overrideReason:reason, action:'transfer a fixed asset'}); if(!_po.ok) return _po; }
  // Quick Control Fixes phase — DEFECT FOUND & FIXED (live-proven during this phase's own test 9,
  // "transfer into a closed project"): the check immediately above only ever validated the asset's
  // CURRENT (source) project — moving an asset INTO a closed project was completely unchecked, so a
  // plain FinanceManager transfer, no override reason consumed for that purpose, silently succeeded
  // in attributing a live asset's future depreciation/disposal to a CLOSED project's register. Fixed
  // by applying the SAME existing assertProjectOpenForPosting() gate to the destination project too,
  // symmetric with the source-side check right above — not a new mechanism, the other half of the
  // one that already existed. Only runs when the transfer actually changes project (newProjectId
  // supplied, non-null, and different from the asset's current project); an ordinary location/
  // custodian-only transfer is unaffected.
  if(newProjectId!==undefined && newProjectId!==null && newProjectId!==asset.projectId){
    const _po2 = assertProjectOpenForPosting(newProjectId, actor, {overrideReason:reason, action:'transfer a fixed asset into this project'});
    if(!_po2.ok) return _po2;
  }
  const before = {location:asset.location, custodian:asset.custodian, projectId:asset.projectId};
  asset.transferHistory.push({from:before, to:{location:newLocation||asset.location, custodian:newCustodian||asset.custodian, projectId:newProjectId!==undefined?newProjectId:asset.projectId}, reason, by:actor.id, at:nowIso()});
  if(newLocation!==undefined) asset.location = newLocation;
  if(newCustodian!==undefined) asset.custodian = newCustodian;
  if(newProjectId!==undefined) asset.projectId = newProjectId;
  save();
  logAudit({type:'FixedAssetTransferred', assetId, before, after:{location:asset.location, custodian:asset.custodian, projectId:asset.projectId}, reason, userId:actor.id, role:actor.role});
  return {ok:true, asset};
}
function disposeFixedAsset({assetId, disposalDate, disposalProceeds, reason, overrideReason, actor}){
  { const _a = assertCanDisposeFixedAsset(actor); if(!_a.ok) return _a; }
  const asset = DB.fixedAssets.find(a=>a.id===assetId);
  if(!asset) return {ok:false, error:'Fixed asset not found.'};
  if(asset.status!=='Capitalized') return {ok:false, error:`Cannot dispose — asset is "${asset.status}", not Capitalized.`};
  // Phase 34 Part A — closed-project gate, via the asset's own project.
  { const _po = assertProjectOpenForPosting(asset.projectId, actor, {overrideReason, action:'dispose a fixed asset'}); if(!_po.ok) return _po; }
  if(!disposalDate) return {ok:false, error:'Disposal date is required.'};
  // Phase 19 CRITICAL FIX — the "16th instance": `+disposalProceeds || 0` silently turned a
  // malformed value ("not-a-number") into ₹0 proceeds, live-tested to book a full loss equal to
  // the asset's entire net book value with no error or warning — a genuine typo could misstate a
  // real disposal by the full asset cost. A genuinely omitted proceeds value (undefined/null/'')
  // still correctly defaults to 0 — only a SUPPLIED-but-unparseable value is now rejected.
  let proceeds = 0;
  if(disposalProceeds!==undefined && disposalProceeds!==null && disposalProceeds!==''){
    const _v = assertNonNegativeFiniteNumber(disposalProceeds, 'Disposal proceeds');
    if(!_v.ok) return {ok:false, error:'Disposal proceeds must be a non-negative, finite number (omit entirely if there genuinely were none).'};
    proceeds = _v.value;
  }
  const accumDep = assetAccumulatedDepreciation(assetId);
  const nbv = r2(asset.cost - accumDep);
  const gain = r2(proceeds - nbv); // positive = gain, negative = loss
  const lines = [ {account:'1450', debit:accumDep, credit:0, projectId:asset.projectId} ]; // remove accumulated depreciation
  if(proceeds>0) lines.push({account:'1000', debit:proceeds, credit:0, projectId:asset.projectId}); // cash received
  if(gain<0) lines.push({account:'5500', debit:-gain, credit:0, projectId:asset.projectId}); // loss (debit — an expense)
  lines.push({account:'1400', debit:0, credit:asset.cost, projectId:asset.projectId}); // remove full cost
  if(gain>0) lines.push({account:'5500', debit:0, credit:gain, projectId:asset.projectId}); // gain (credit — reduces expense/other income)
  const _dispJesLen = DB.journalEntries.length;
  const _dispBefore = {status:asset.status, disposalDate:asset.disposalDate, disposalProceeds:asset.disposalProceeds, disposalEntryId:asset.disposalEntryId};
  const result = postJournalEntry({ date:disposalDate, narration:`Fixed Asset Disposal — ${asset.assetCode} (${asset.assetName}) — ${reason||'no reason given'}`,
    sourceType:'FixedAssetDisposal', sourceId:asset.id, voucherNo:nextDocNumber('FA', disposalDate), docCategory:'FixedAssetDisposal',
    lines, actor, capability:'FIXED_ASSET_DISPOSE', overrideReason });
  if(!result.ok) return result;
  // Phase 36 Part K CRITICAL FIX — same defect class/fix as capitalizeFixedAsset() above: without
  // this, an interrupted disposal would leave GL showing the asset's cost/depreciation removed
  // while asset.status stayed 'Capitalized', permitting a retry to double-dispose the same asset
  // (removing its already-removed cost/depreciation a second time and double-booking the gain/loss).
  try {
    _fault('DISPOSE_AFTER_GL_BEFORE_STATUS'); // Phase 36 Part K
    asset.status='Disposed'; asset.disposalDate=disposalDate; asset.disposalProceeds=proceeds; asset.disposalEntryId=result.entry.id;
    save();
    logAudit({type:'FixedAssetDisposed', assetId, disposalDate, proceeds, nbv, gain, userId:actor.id, role:actor.role});
    return {ok:true, asset, entry:result.entry, netBookValue:nbv, gainOrLoss:gain};
  } catch(e) {
    DB.journalEntries.length = _dispJesLen;
    Object.assign(asset, _dispBefore);
    save();
    logAudit({type:'FixedAssetDisposalRolledBackOnFailure', assetId, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}
function listFixedAssets(){
  return DB.fixedAssets.map(a=>({...a, accumulatedDepreciation: a.status==='Purchased'?0:assetAccumulatedDepreciation(a.id), netBookValue: a.status==='Purchased'?a.cost:assetNetBookValue(a)}));
}
// §34 — Fixed Asset Register = Fixed Asset GL; Accumulated Depreciation = Depreciation Ledger.
function reconcileFixedAssets(){
  // Phase 22 self-test defect fix: a Disposed asset's cost/accumulated-depreciation are correctly
  // REMOVED from the GL by disposeFixedAsset() (Cr 1400 full cost, Dr 1450 full accum. dep — the
  // asset leaves the balance sheet, exactly as real disposal accounting requires). The register
  // side must exclude Disposed assets too, for the same reason — otherwise this reconciliation
  // permanently mismatches the moment ANY asset is ever disposed, comparing "still on the books"
  // (GL, correctly zero) against "every asset that was ever capitalized, including retired ones"
  // (the old register calculation). Found live via the Phase 22 self-test's full lifecycle
  // (create->capitalize->depreciate->transfer->dispose) — no prior phase's fixed-asset testing
  // had exercised reconciliation AFTER a disposal.
  const onBooks = DB.fixedAssets.filter(a=>a.status!=='Purchased' && a.status!=='Disposed');
  const registerCost = r2(onBooks.reduce((s,a)=>s+a.cost,0));
  const glCost = r2(allLines().filter(l=>l.account==='1400').reduce((s,l)=>s+l.debit-l.credit,0));
  const registerAccumDep = r2(onBooks.reduce((s,a)=>s+assetAccumulatedDepreciation(a.id),0));
  const glAccumDep = r2(allLines().filter(l=>l.account==='1450').reduce((s,l)=>s+l.credit-l.debit,0));
  const disposedCount = DB.fixedAssets.filter(a=>a.status==='Disposed').length;
  return { registerCost, glCost, costMatches: Math.abs(registerCost-glCost)<0.02,
    registerAccumDep, glAccumDep, accumDepMatches: Math.abs(registerAccumDep-glAccumDep)<0.02,
    assetCount: onBooks.length, disposedCount };
}

// ============================================================
// Phase 19 §7-19 (APPROVED — Decision A, required). Real ICICI Bank Statement Import, built
// against the ACTUAL supplied statement (`icici_statement_121.csv`, a faithful row-for-row
// transcription of the CEO's real "OpTransactionHistoryUX320-08-2026" PDF — studied first, per
// instruction, not guessed). Columns match §9 exactly: No./Transaction ID/Value Date/Txn Posted
// Date/Cheque No./Description/Cr-Dr/Transaction Amount/Available Balance.
//
// Import is explicitly NOT the same as accounting posting (§8) — a line only ever becomes a real
// GL entry when an accountant deliberately Allocates it (`postBankImportLine`), which then routes
// through the SAME shared `postJournalEntry()` engine as everything else (§31). Everything before
// that is classification/matching METADATA only.
//
// Per the CEO's explicit instruction this phase: the statement's own printed account number is
// stored as raw, UNRESOLVED metadata on the batch (`statementAccountNumber`) — it is NEVER
// auto-matched, renamed, or merged into the existing Bank Account master (which still only has
// the one Phase-15-evidenced "...1112" record). A mismatch is flagged, never silently resolved.
// ============================================================
function parseICICIDate(d){
  // "29/04/2026" -> "2026-04-29"
  const [dd,mm,yyyy] = String(d).trim().split('/');
  return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
}
function parseICICICsv(csvText){
  const lines = String(csvText).split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(!lines.length) return {rows:[], errors:['Empty statement.']};
  const header = lines[0].split(',').map(h=>h.trim().toLowerCase());
  const idx = (name)=>header.indexOf(name);
  const iNo=idx('no'), iTxnId=idx('transaction id'), iValueDate=idx('value date'), iPostedDate=idx('txn posted date'),
    iCheque=idx('cheque no'), iDesc=idx('description'), iCrDr=idx('cr/dr'), iAmount=idx('transaction amount'), iBalance=idx('available balance');
  const required = {No:iNo, 'Transaction ID':iTxnId, 'Value Date':iValueDate, 'Txn Posted Date':iPostedDate, 'Cr/Dr':iCrDr, 'Transaction Amount':iAmount, 'Available Balance':iBalance};
  const missing = Object.entries(required).filter(([,i])=>i<0).map(([n])=>n);
  if(missing.length) return {rows:[], errors:[`Statement is missing required column(s): ${missing.join(', ')}. Expected the real ICICI export header — do not guess the format.`]};
  const rows = [], errors = [];
  for(let r=1;r<lines.length;r++){
    // Simple CSV split is safe here — the real statement's description field never contains a
    // literal comma once transcribed (verified against the actual PDF); a quoted-field parser
    // would be needed for a general-purpose CSV importer, out of scope for this ICICI-specific one.
    const cols = lines[r].split(',');
    if(cols.length < header.length){ errors.push(`Row ${r+1}: expected ${header.length} columns, got ${cols.length} — skipped.`); continue; }
    try{
      // Phase 18 CRITICAL FIX — found live: r2() has its own `(+n||0)` fallback, which silently
      // turns a malformed amount into 0 BEFORE the `isNaN(row.amount)` check below ever runs —
      // the check was written correctly but permanently defeated by the shared rounding helper it
      // validated the OUTPUT of instead of the raw input. A "not-a-number" Transaction Amount
      // imported cleanly as a ₹0 statement line rather than being rejected. Validate the raw
      // column value first; only round it once it's confirmed to be a real number.
      const rawAmount = cols[iAmount];
      if(!assertFiniteNumber(rawAmount, {fieldName:'Transaction Amount'}).ok){
        errors.push(`Row ${r+1}: invalid Transaction Amount "${rawAmount}" — skipped.`); continue;
      }
      const row = {
        rowNo: +cols[iNo], bankTxnId: cols[iTxnId].trim(), valueDate: parseICICIDate(cols[iValueDate]),
        postedDate: parseICICIDate(cols[iPostedDate].split(' ')[0]), postedTime: cols[iPostedDate].split(' ').slice(1).join(' ')||null,
        chequeNo: cols[iCheque].trim()==='-' ? null : cols[iCheque].trim(),
        rawDescription: cols[iDesc], crDr: cols[iCrDr].trim().toUpperCase(),
        amount: r2(+rawAmount), availableBalance: r2(+cols[iBalance])
      };
      if(!row.bankTxnId || !['CR','DR'].includes(row.crDr)){ errors.push(`Row ${r+1}: malformed data — skipped.`); continue; }
      rows.push(row);
    } catch(e){ errors.push(`Row ${r+1}: parse error — ${e.message}.`); }
  }
  return {rows, errors};
}
// §10 — extraction only, NEVER authoritative. Every hint is explicitly a SUGGESTION for the
// accountant to confirm, matching "does NOT automatically prove the Project is Flykart."
function extractDescriptionHints(rawDescription){
  const d = rawDescription;
  const utrMatch = d.match(/IN\d{14}/);
  const invoiceMatch = d.match(/\/(INV\d+|W\d+|PO\d+|TQ\d+|B\d+|MGB\d+\w*)/i);
  const typeMatch = d.match(/^(NEFT-RETURN|CLG|INF\/NEFT|INF\/INFT|MMT\/IMPS|GIB|BIL\/BPAY|NEFT-FBBT)/i) ||
    (/NEFT/.test(d)?['NEFT']:null) || (/IMPS/.test(d)?['IMPS']:null) || (/INFT/.test(d)?['INFT']:null) ||
    (/BBPS/.test(d)?['BBPS']:null) || (/GIB.*GST/i.test(d)?['GST']:null) || (/GIB.*DTAX/i.test(d)?['DTAX']:null) || null;
  const segments = d.split('/');
  const possiblePartyName = segments.length>1 ? segments[segments.length-1].trim() : null;
  const isSalaryOrWage = /salary|wage/i.test(d);
  const isReturn = /NEFT-RETURN|Incorrect Account Number|NEFT-FBBT.*FASTNOT ELIGIBLE/i.test(d);
  return {
    possibleUTR: utrMatch ? utrMatch[0] : null,
    possibleReference: invoiceMatch ? invoiceMatch[1] : null,
    possibleBankTxnType: Array.isArray(typeMatch) ? typeMatch[0] : (typeMatch ? typeMatch[0] : null),
    possiblePartyName, isSalaryOrWage, isReturn
  };
}
// §11/§12 — a SUGGESTED classification only, never auto-chosen accounting. Confidently only when
// the description contains an explicit, unambiguous keyword; otherwise "Unknown", forcing
// accountant review rather than guessing.
// DEFECT FOUND & FIXED (this phase's own test suite, §19.9): "fund transfer" keyword detection
// was placed AFTER the CR-branch early-return, so a real CREDIT fund transfer (row 33 in the
// actual statement — "fund transfer from open pay") never reached that check and fell through to
// the generic "Other Receipt" label. Fund transfers can genuinely be either direction, so the
// keyword check must run BEFORE the CR/DR branch splits, not only inside the DR branch.
function classifyBankLine(row, hints){
  if(hints.isReturn) return 'Returned Transaction';
  if(/fund transfer/i.test(row.rawDescription)) return 'Fund Transfer (confirm)';
  if(row.crDr==='CR'){
    if(row.amount >= 100000) return 'Possible Customer Receipt / Large Credit (confirm)';
    return 'Other Receipt / Transfer (confirm)';
  }
  if(hints.isSalaryOrWage) return 'Salary / Wage Payment (confirm)';
  if(/GST|DTAX/i.test(row.rawDescription)) return 'GST / Tax Payment (confirm)';
  if(/BBPS/i.test(row.rawDescription)) return 'Utility / Bill Payment (confirm)';
  if(/ASSET PURCHASE/i.test(row.rawDescription)) return 'Asset Purchase (confirm)';
  if(/Rawmateril|Raw material|Rawmaterial|Material for|Material purchase|Goods purchase/i.test(row.rawDescription)) return 'Supplier / Material Payment (confirm)';
  if(/Labour|putty work|partition|Painting work|frame work/i.test(row.rawDescription)) return 'Labour Payment (confirm)';
  return 'Unknown (confirm)';
}
function createBankImportBatch({bankAccountId, csvText, statementAccountNumber, label, actor}){
  if(!bankAccountId || !DB.bankAccounts.find(b=>b.id===bankAccountId)) return {ok:false, error:'A valid bankAccountId is required.'};
  const {rows, errors:parseErrors} = parseICICICsv(csvText);
  if(!rows.length) return {ok:false, error:'No valid transaction rows found. '+parseErrors.join(' ')};
  const bankAccount = DB.bankAccounts.find(b=>b.id===bankAccountId);
  const accountNumberMismatch = statementAccountNumber && bankAccount.accountNumberLast4 && !statementAccountNumber.endsWith(bankAccount.accountNumberLast4)
    ? `Statement account number "${statementAccountNumber}" does not match the configured bank account's last 4 digits ("${bankAccount.accountNumberLast4}") — UNRESOLVED, flagged for accountant/CEO confirmation. Import proceeds against the selected bank account regardless.`
    : null;
  // Phase 41 FIX — found via the defect-class-propagation search (Part 26): this function pushes
  // to TWO collections (bankImportBatches, bankImportLines) across a multi-row forEach loop, with
  // no withTransaction() and no save() inside the loop — a throw partway (e.g. a malformed
  // rawDescription reaching extractDescriptionHints) would leave an in-memory-only, genuinely
  // partial batch (a batch record claiming a rowCount that doesn't match however many lines
  // actually got pushed before the throw) that a LATER, unrelated save() elsewhere in the process
  // would silently flush to disk — the exact durability-boundary class characterized in Phase 37
  // Part E, now closed here the same way the 5 legacy GL/inventory functions were closed in Phase
  // 38: wrap the whole operation in the central withTransaction() primitive. Bank import lines are
  // metadata-only (never a GL posting), so the blast radius was reconciliation-tool confusion, not
  // financial-statement corruption — but the same class of gap is the same class of gap regardless
  // of severity, per the mission's explicit "one fixed function does not close the defect class" rule.
  return withTransaction(actor, {name:'createBankImportBatch'}, () => {
  const batch = { id: nextId(DB.bankImportBatches, 'BIB-', 4), bankAccountId, statementAccountNumber: statementAccountNumber||null,
    accountNumberMismatch, label: label||'', importedBy:actor.id, importedByRole:actor.role, importedAt: nowIso(),
    rowCount: rows.length, parseErrors, duplicateCount:0, errorCount:0 };
  DB.bankImportBatches.push(batch);

  // §15 — running balance validation. Opening balance derived from the FIRST row (balance after
  // that row, minus/plus its own movement) — the statement itself never states an explicit
  // opening balance line, exactly like a real ICICI export.
  let running = rows[0].crDr==='CR' ? r2(rows[0].availableBalance - rows[0].amount) : r2(rows[0].availableBalance + rows[0].amount);
  const createdLines = [];
  rows.forEach(row=>{
    running = row.crDr==='CR' ? r2(running + row.amount) : r2(running - row.amount);
    const balanceMatches = Math.abs(running - row.availableBalance) < 0.02;
    const hints = extractDescriptionHints(row.rawDescription);
    // §14 — duplicate detection by Transaction ID across ALL prior batches (not just this one),
    // never by description alone.
    const isDuplicate = DB.bankImportLines.some(l=>l.bankTxnId===row.bankTxnId);
    let status = 'Imported';
    if(isDuplicate) status = 'Duplicate';
    else if(hints.isReturn) status = 'Returned';
    const line = { id: nextId(DB.bankImportLines, 'BIL-', 5), batchId:batch.id, bankAccountId,
      rowNo:row.rowNo, bankTxnId:row.bankTxnId, valueDate:row.valueDate, postedDate:row.postedDate, postedTime:row.postedTime,
      chequeNo:row.chequeNo, rawDescription:row.rawDescription, normalizedDescription: row.rawDescription.replace(/\s+/g,' ').trim(),
      crDr:row.crDr, amount:row.amount, statementBalance:row.availableBalance, computedRunningBalance:running, balanceMatches,
      extractedHints:hints, suggestedClassification: classifyBankLine(row, hints),
      status, matchedEntryId:null, matchedDocumentType:null, matchConfidence:null,
      isReturned: hints.isReturn, returnOfLineId:null, excludeReason:null, postedEntryId:null,
      duplicateOfLineId: isDuplicate ? DB.bankImportLines.find(l=>l.bankTxnId===row.bankTxnId).id : null,
      createdAt: nowIso() };
    DB.bankImportLines.push(line);
    createdLines.push(line);
    if(isDuplicate) batch.duplicateCount++;
    if(!balanceMatches) batch.errorCount++;
  });
  // §13 — link each Returned line back to its ORIGINAL transaction by matching the UTR embedded
  // in the return's own description against an earlier line's bankTxnId/UTR — proven possible on
  // this exact real statement (row 43 "NEFT-RETURN-IN42620852272606..." matches row 40's UTR).
  createdLines.filter(l=>l.isReturned).forEach(retLine=>{
    const utrInReturn = (retLine.rawDescription.match(/IN\d{14}/)||[])[0];
    if(!utrInReturn) return;
    const original = DB.bankImportLines.find(l=>l.id!==retLine.id && l.extractedHints.possibleUTR===utrInReturn && l.crDr==='DR');
    if(original){ retLine.returnOfLineId = original.id; }
  });
  logAudit({type:'BankImportBatchCreated', batchId:batch.id, bankAccountId, rowCount:rows.length, duplicateCount:batch.duplicateCount,
    balanceErrorCount:batch.errorCount, accountNumberMismatch: !!accountNumberMismatch, userId:actor.id, role:actor.role});
  return {ok:true, batch, lines:createdLines, parseErrors};
  });
}
function listBankImportLines({batchId, bankAccountId, status, crDr}){
  let rows = DB.bankImportLines;
  if(batchId) rows = rows.filter(l=>l.batchId===batchId);
  if(bankAccountId) rows = rows.filter(l=>l.bankAccountId===bankAccountId);
  if(status) rows = rows.filter(l=>l.status===status);
  if(crDr) rows = rows.filter(l=>l.crDr===crDr);
  return rows;
}
function matchBankImportLine({lineId, entryId, actor}){
  const line = DB.bankImportLines.find(l=>l.id===lineId);
  if(!line) return {ok:false, error:'Bank import line not found.'};
  if(['Posted','Duplicate','Excluded'].includes(line.status)) return {ok:false, error:`Cannot match a line that is "${line.status}".`};
  const entry = DB.journalEntries.find(e=>e.id===entryId);
  if(!entry) return {ok:false, error:'Target accounting entry not found.'};
  if(Math.abs(entry.totalDebit - line.amount) > 0.02 && Math.abs(entry.totalCredit - line.amount) > 0.02){
    return {ok:false, error:`Amount mismatch — bank line ₹${line.amount.toLocaleString('en-IN')} vs document ₹${Math.max(entry.totalDebit,entry.totalCredit).toLocaleString('en-IN')}. Match rejected, not forced.`};
  }
  line.status = 'Matched'; line.matchedEntryId = entryId; line.matchedDocumentType = entry.docCategory||entry.sourceType;
  save();
  logAudit({type:'BankImportLineMatched', lineId, entryId, userId:actor.id, role:actor.role});
  return {ok:true, line};
}
function unmatchBankImportLine({lineId, actor}){
  const line = DB.bankImportLines.find(l=>l.id===lineId);
  if(!line) return {ok:false, error:'Bank import line not found.'};
  if(line.status==='Posted') return {ok:false, error:'Cannot unmatch a line that already has a directly-posted accounting entry — reverse that entry first.'};
  line.status = line.isReturned ? 'Returned' : 'Imported'; line.matchedEntryId=null; line.matchedDocumentType=null;
  save();
  logAudit({type:'BankImportLineUnmatched', lineId, userId:actor.id, role:actor.role});
  return {ok:true, line};
}
function excludeBankImportLine({lineId, reason, actor}){
  const line = DB.bankImportLines.find(l=>l.id===lineId);
  if(!line) return {ok:false, error:'Bank import line not found.'};
  if(!reason) return {ok:false, error:'A reason is required to exclude a bank transaction.'};
  if(line.status==='Posted') return {ok:false, error:'Cannot exclude a line that already has a posted accounting entry.'};
  line.status='Excluded'; line.excludeReason=reason;
  save();
  logAudit({type:'BankImportLineExcluded', lineId, reason, userId:actor.id, role:actor.role});
  return {ok:true, line};
}
function markBankImportLineReturned({lineId, returnOfLineId, actor}){
  const line = DB.bankImportLines.find(l=>l.id===lineId);
  if(!line) return {ok:false, error:'Bank import line not found.'};
  line.isReturned = true; line.status='Returned';
  if(returnOfLineId){
    if(!DB.bankImportLines.find(l=>l.id===returnOfLineId)) return {ok:false, error:'Referenced original line not found.'};
    line.returnOfLineId = returnOfLineId;
  }
  save();
  logAudit({type:'BankImportLineMarkedReturned', lineId, returnOfLineId:line.returnOfLineId, userId:actor.id, role:actor.role});
  return {ok:true, line};
}
// "Allocate" (§17) — the ONE action that actually creates a real accounting entry from a bank
// line, through the SAME shared engine, never a parallel posting path. The accountant chooses the
// OTHER side of the entry (an account); the Bank side (1000) is always automatic and correct.
function postBankImportLine({lineId, glAccount, projectId, customerId, vendorId, narration, overrideReason, actor}){
  { const _a = assertCanPostBankImportLine(actor); if(!_a.ok) return _a; }
  const line = DB.bankImportLines.find(l=>l.id===lineId);
  if(!line) return {ok:false, error:'Bank import line not found.'};
  if(['Posted','Duplicate','Excluded'].includes(line.status)) return {ok:false, error:`Cannot post — line is "${line.status}".`};
  if(!glAccount || !DB.accounts.find(a=>a.id===glAccount)) return {ok:false, error:'A valid GL account is required for the other side of this entry.'};
  const lines = line.crDr==='CR'
    ? [ {account:'1000', debit:line.amount, credit:0, projectId, customerId, vendorId}, {account:glAccount, debit:0, credit:line.amount, projectId, customerId, vendorId} ]
    : [ {account:glAccount, debit:line.amount, credit:0, projectId, customerId, vendorId}, {account:'1000', debit:0, credit:line.amount, projectId, customerId, vendorId} ];
  const _jesLenBeforeBIL = DB.journalEntries.length;
  const result = postJournalEntry({ date:line.valueDate, narration:narration||`Bank import allocation — ${line.rawDescription.slice(0,80)}`,
    sourceType:'BankImportAllocation', sourceId:line.id, voucherNo:nextDocNumber('JE', line.valueDate), docCategory:'BankImportAllocation',
    lines, actor, capability:'BANK_IMPORT_POST', overrideReason });
  if(!result.ok) return result;
  const _lineBefore = {status:line.status, postedEntryId:line.postedEntryId};
  try {
    _fault('BANKIMPORT_AFTER_GL_BEFORE_STATUS');
    line.status='Posted'; line.postedEntryId=result.entry.id;
    save();
    logAudit({type:'BankImportLinePosted', lineId, entryId:result.entry.id, glAccount, amount:line.amount, userId:actor.id, role:actor.role});
    return {ok:true, entry:result.entry, line};
  } catch(e) {
    DB.journalEntries.length = _jesLenBeforeBIL;
    Object.assign(line, _lineBefore);
    save();
    logAudit({type:'BankImportLineRolledBackOnFailure', lineId, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    throw e;
  }
}
function reconcileBankImportLine({lineId, actor}){
  const line = DB.bankImportLines.find(l=>l.id===lineId);
  if(!line) return {ok:false, error:'Bank import line not found.'};
  if(!['Matched','Posted'].includes(line.status)) return {ok:false, error:`Cannot reconcile — line must be Matched or Posted first (currently "${line.status}").`};
  line.status='Reconciled';
  save();
  logAudit({type:'BankImportLineReconciled', lineId, userId:actor.id, role:actor.role});
  return {ok:true, line};
}
// §16 — Bank Reconciliation. `erpBankBalance` reads GL account 1000 company-wide, since this Lab
// (unchanged since Phase 15) has ONE unified Bank/Cash control account, not a sub-account per
// physical bank — a real, disclosed architectural boundary, not something invented this phase.
function bankImportReconciliationSummary(bankAccountId){
  const lines = DB.bankImportLines.filter(l=>l.bankAccountId===bankAccountId && l.status!=='Duplicate');
  const latestBatchLine = lines.slice().sort((a,b)=> (a.valueDate+String(a.rowNo).padStart(5,'0')).localeCompare(b.valueDate+String(b.rowNo).padStart(5,'0'))).pop();
  const statementBalance = latestBatchLine ? latestBatchLine.statementBalance : null;
  // Phase 24 Part A7 — was hardcoded to account 1000 regardless of which bank account this
  // reconciliation is actually for; now uses THAT account's own glAccount, so Bank A's
  // reconciliation can never accidentally include Bank B's postings.
  const acctForRecon = DB.bankAccounts.find(b=>b.id===bankAccountId);
  const reconGlAccount = acctForRecon ? acctForRecon.glAccount : '1000';
  const erpBankBalance = r2(allLines().filter(l=>l.account===reconGlAccount).reduce((s,l)=>s+l.debit-l.credit,0));
  const outstandingDeposits = lines.filter(l=>l.crDr==='CR' && !['Posted','Reconciled','Excluded','Returned'].includes(l.status));
  const outstandingPayments = lines.filter(l=>l.crDr==='DR' && !['Posted','Reconciled','Excluded','Returned'].includes(l.status));
  const unmatched = lines.filter(l=>l.status==='Imported');
  const returned = lines.filter(l=>l.isReturned);
  const balanceMismatches = lines.filter(l=>!l.balanceMatches);
  return { bankAccountId, statementBalance, erpBankBalance,
    difference: statementBalance!==null ? r2(statementBalance - erpBankBalance) : null,
    outstandingDeposits: outstandingDeposits.map(l=>({id:l.id, date:l.valueDate, amount:l.amount, description:l.normalizedDescription})),
    outstandingDepositsTotal: r2(outstandingDeposits.reduce((s,l)=>s+l.amount,0)),
    outstandingPayments: outstandingPayments.map(l=>({id:l.id, date:l.valueDate, amount:l.amount, description:l.normalizedDescription})),
    outstandingPaymentsTotal: r2(outstandingPayments.reduce((s,l)=>s+l.amount,0)),
    unmatchedCount: unmatched.length, returnedCount: returned.length,
    statementLineBalanceMismatches: balanceMismatches.map(l=>({id:l.id, rowNo:l.rowNo, statementBalance:l.statementBalance, computedRunningBalance:l.computedRunningBalance})) };
}

// ============================================================
// Phase 20 §3/§4 — Master Data Import Framework. The accounts team will configure the REAL
// Appletree Chart of Accounts, Customers, Suppliers, Items, Projects, Cost Centres, Banks, Tax
// Codes, and Fixed Assets after handover — none of it is invented here. What this phase builds is
// the CAPABILITY to enter/import that data safely: validation, duplicate checking, audit,
// authorization, and an error report that never partially imports an invalid row.
//
// Several of these masters (Vendors, Materials, Projects, Cost Centres, Tax Codes) had NO
// creation function at all before this phase — they were seed-only since Phase 4/6A/7. Building
// real single-record creators for each (masterData-gated, audited, duplicate-checked) is a
// genuine, previously-missing piece of the technical build, not a business-data decision.
// ============================================================
// Phase 44 FIX — same class as createUser() above: legacy route, only audited on success.
function createVendorMaster({name, gstNumber, paymentTerms, category, actor}){
  if(!name || !name.trim()) return {ok:false, error:'Vendor name is required.'};
  if(DB.vendors.find(v=>v.name.trim().toLowerCase()===name.trim().toLowerCase())){
    logAudit({type:'VendorCreationRejected', reason:'DuplicateName', attemptedName:name, userId:actor.id, role:actor.role});
    return {ok:false, error:`A vendor named "${name}" already exists.`};
  }
  // Phase 37 HIGH FIX — name-only dedup let the same GSTIN be registered under two different
  // vendor names. GST number is the real identity here; block it the same way a name clash is
  // already blocked, rather than silently creating a second vendor record for the same business.
  const normGst = gstNumber ? String(gstNumber).trim().toUpperCase() : null;
  if(normGst){
    const gstMatch = DB.vendors.find(v=>v.gstNumber && String(v.gstNumber).trim().toUpperCase()===normGst);
    if(gstMatch){
      logAudit({type:'VendorCreationRejected', reason:'DuplicateGSTIN', attemptedName:name, gstNumber:normGst, existingVendorId:gstMatch.id, userId:actor.id, role:actor.role});
      return {ok:false, error:`GST number ${normGst} is already registered to vendor "${gstMatch.name}" (${gstMatch.id}).`};
    }
  }
  const v = { id: nextId(DB.vendors, 'VEND-', 2), name:name.trim(), gstNumber:gstNumber||'', paymentTerms:paymentTerms||'', category:category||'', active:true, createdBy:actor.id, createdAt:nowIso() };
  DB.vendors.push(v); save();
  logAudit({type:'VendorCreated', vendorId:v.id, name:v.name, userId:actor.id, role:actor.role});
  return {ok:true, vendor:v};
}
// Phase 44 FIX — same class as createUser()/createVendorMaster(): legacy route, only audited on
// success. Scoped to the duplicate-detection rejections specifically (the security-relevant
// subset — a repeated attempt to register an already-claimed code/description/GSTIN/name is worth
// a trail; a fat-fingered missing field is not).
function createMaterialMaster({code, description, category, uom, standardCost, taxCode, hsnCode, stockItem, actor}){
  if(!code || !description || !uom) return {ok:false, error:'Code, Description and UOM are all required.'};
  if(DB.materials.find(m=>m.code.trim().toLowerCase()===code.trim().toLowerCase())){
    logAudit({type:'MaterialCreationRejected', reason:'DuplicateCode', attemptedCode:code, userId:actor.id, role:actor.role});
    return {ok:false, error:`A material with code "${code}" already exists.`};
  }
  // Phase 37 HIGH FIX — code-only dedup let the identical material be registered twice under two
  // different codes, since description was never checked. Exact-normalized description match is
  // blocked the same way a code clash already is; a genuinely different material sharing a
  // similar-but-not-identical description is unaffected.
  const descMatch = DB.materials.find(m=>m.description && m.description.trim().toLowerCase()===description.trim().toLowerCase());
  if(descMatch){
    logAudit({type:'MaterialCreationRejected', reason:'DuplicateDescription', attemptedDescription:description, existingMaterialId:descMatch.id, userId:actor.id, role:actor.role});
    return {ok:false, error:`A material with the identical description "${description}" already exists as ${descMatch.id} (${descMatch.code}).`};
  }
  if(taxCode && !DB.taxCodes.find(t=>t.code===taxCode)) return {ok:false, error:`Unknown tax code "${taxCode}".`};
  // Phase 39 CRITICAL FIX — found live: `standardCost:+standardCost||0` silently converted a
  // garbled cost ("garbage" -> NaN -> 0) to a real ₹0 standard cost with ok:true, and a negative
  // cost (-500) was accepted uncaught too. standardCost feeds Standard Costing / Mfg Cost
  // Analytics directly — a silently-zeroed or negative cost corrupts every downstream variance
  // calculation for this material with no error at the point the mistake was actually made.
  if(standardCost!==undefined && standardCost!==null && standardCost!==''){
    const n = Number(standardCost);
    if(!Number.isFinite(n)) return {ok:false, error:`Standard Cost must be a real number — got "${standardCost}".`};
    if(n<0) return {ok:false, error:`Standard Cost cannot be negative — got ${n}.`};
  }
  const m = { id: nextId(DB.materials, 'MAT-', 3), code:code.trim(), description, category:category||'General', uom,
    // Phase 21 §7/§8 — UoM Conversion. `uom` (unchanged field, unchanged meaning) IS the base/stock
    // unit inventory has always been tracked and valued in. purchaseUom/purchaseConversionFactor
    // default to the base unit / 1 — i.e. NO conversion — so every pre-existing material and every
    // already-tested transaction this engagement has run is completely unaffected unless a real
    // conversion is explicitly configured via setMaterialUomConversion(). Not inventing Appletree's
    // actual conversion factors (e.g. 1 Sheet = X Sq.Ft) — those are configured, never hardcoded.
    purchaseUom: uom, purchaseConversionFactor: 1,
    stockItem: stockItem!==false, standardCost:+standardCost||0, valuationMethod:'MovingAverage', taxCode:taxCode||null, hsnCode:hsnCode||null,
    active:true, reorderLevel:0, minStock:0, maxStock:0, createdBy:actor.id, createdAt:nowIso() };
  DB.materials.push(m); save();
  logAudit({type:'MaterialCreated', materialId:m.id, code:m.code, userId:actor.id, role:actor.role});
  return {ok:true, material:m};
}
// ============================================================
// Phase 21 §5/§6 — Master Data Edit / Deactivate (audit finding: Customer, Vendor and Material
// were create-only — zero code path anywhere could edit or retire an existing record). Rules,
// exactly as instructed: no destructive deletion, ever; if a master already carries real
// accounting history, only non-identity/non-financial fields may still be edited (protecting what
// a past transaction actually meant); Active/Inactive replaces deletion — an inactive master
// cannot be selected for a NEW transaction, but every historical transaction referencing it stays
// fully visible and unaffected. Every edit/deactivate is audited field-by-field (old -> new),
// matching every other audited mutation already in this codebase. Gated by the SAME 'masterData'
// permission (Admin/CEO only) the existing create-endpoints already use — not a new role concept.
// ============================================================
function customerHasAccountingHistory(customerId){ return DB.journalEntries.some(e => e.lines.some(l => l.customerId===customerId)); }
function vendorHasAccountingHistory(vendorId){ return DB.journalEntries.some(e => e.lines.some(l => l.vendorId===vendorId)); }
function materialHasAccountingHistory(materialId){
  return DB.journalEntries.some(e => e.lines.some(l => l.itemId===materialId)) || DB.inventoryMovements.some(m => m.materialId===materialId);
}
// Fields locked once history exists — because a historical journal/inventory line stores only the
// ID, any report or reconciliation reads the master's OTHER fields live off the CURRENT record,
// not a point-in-time snapshot. Silently changing these after history exists would misrepresent
// what a past transaction actually meant. `id`/`code` are never editable at all, with or without
// history — they are the permanent join key.
const CUSTOMER_LOCKED_FIELDS_WITH_HISTORY = ['gstin'];
const VENDOR_LOCKED_FIELDS_WITH_HISTORY = ['gstNumber'];
const MATERIAL_LOCKED_FIELDS_WITH_HISTORY = ['uom', 'taxCode']; // uom locked: changing it after transactions exist would misrepresent every historical quantity
function _applyMasterEdit({record, changes, reason, lockedAlways, lockedWithHistory, hasHistory, entityLabel}){
  if(!record) return {ok:false, error:`${entityLabel} not found.`};
  const changeLog = [];
  for(const field of Object.keys(changes||{})){
    if(lockedAlways.includes(field)) return {ok:false, error:`Field "${field}" can never be changed on a ${entityLabel.toLowerCase()} — it is the permanent identity/join key for all historical transactions.`};
    if(hasHistory && lockedWithHistory.includes(field)) return {ok:false, error:`Field "${field}" cannot be changed — this ${entityLabel.toLowerCase()} already has accounting history, and changing "${field}" would silently alter the meaning of past transactions.`};
    const oldValue = record[field], newValue = changes[field];
    if(oldValue===newValue) continue;
    changeLog.push({field, oldValue, newValue});
  }
  if(hasHistory && changeLog.length && (!reason || !String(reason).trim())) return {ok:false, error:`A reason is required to edit a ${entityLabel.toLowerCase()} that already has accounting history.`};
  changeLog.forEach(({field,newValue})=>{ record[field]=newValue; });
  return {ok:true, changeLog};
}
function editCustomer({customerId, changes, reason, actor}){
  const c = DB.customers.find(x=>x.id===customerId);
  const hasHistory = c ? customerHasAccountingHistory(customerId) : false;
  const r = _applyMasterEdit({record:c, changes, reason, lockedAlways:['id'], lockedWithHistory:CUSTOMER_LOCKED_FIELDS_WITH_HISTORY, hasHistory, entityLabel:'Customer'});
  if(!r.ok) return r;
  if(r.changeLog.length){ c.lastEditedBy=actor.id; c.lastEditedAt=nowIso(); save();
    logAudit({type:'CustomerEdited', customerId, changes:r.changeLog, hadAccountingHistory:hasHistory, reason:reason||null, userId:actor.id, role:actor.role}); }
  return {ok:true, customer:c, changed:r.changeLog.map(x=>x.field)};
}
// Phase 20 CRITICAL FIX — a new defect class found live: `active===false` / `active!==false`
// use strict equality, so a STRING "false" (an easy mistake from any caller that stringifies form
// values) is neither `===false` nor treated as deactivating — `'false'!==false` is `true`, so the
// record was silently REACTIVATED instead of deactivated, while the API still returned `ok:true`.
// Confirmed live on setCustomerActive(); the identical `active===false`/`!==false` pattern is
// repeated verbatim in setVendorActive() and setMaterialActive() below, so all three are fixed
// with this one shared normalizer rather than three separate inline fixes.
function isFalseLike(v){ return v===false || v==='false' || v===0 || v==='0'; }
function setCustomerActive({customerId, active, reason, actor}){
  const c = DB.customers.find(x=>x.id===customerId);
  if(!c) return {ok:false, error:'Customer not found.'};
  if(isFalseLike(active) && (!reason || !String(reason).trim())) return {ok:false, error:'A reason is required to deactivate a customer.'};
  const old = c.active;
  c.active = !isFalseLike(active);
  if(old===c.active) return {ok:true, customer:c, changed:false};
  save();
  logAudit({type: c.active?'CustomerReactivated':'CustomerDeactivated', customerId, reason:reason||null, userId:actor.id, role:actor.role});
  return {ok:true, customer:c, changed:true};
}
function editVendorMaster({vendorId, changes, reason, actor}){
  const v = DB.vendors.find(x=>x.id===vendorId);
  const hasHistory = v ? vendorHasAccountingHistory(vendorId) : false;
  const r = _applyMasterEdit({record:v, changes, reason, lockedAlways:['id'], lockedWithHistory:VENDOR_LOCKED_FIELDS_WITH_HISTORY, hasHistory, entityLabel:'Vendor'});
  if(!r.ok) return r;
  if(r.changeLog.length){ v.lastEditedBy=actor.id; v.lastEditedAt=nowIso(); save();
    logAudit({type:'VendorEdited', vendorId, changes:r.changeLog, hadAccountingHistory:hasHistory, reason:reason||null, userId:actor.id, role:actor.role}); }
  return {ok:true, vendor:v, changed:r.changeLog.map(x=>x.field)};
}
function setVendorActive({vendorId, active, reason, actor}){
  const v = DB.vendors.find(x=>x.id===vendorId);
  if(!v) return {ok:false, error:'Vendor not found.'};
  if(isFalseLike(active) && (!reason || !String(reason).trim())) return {ok:false, error:'A reason is required to deactivate a vendor.'};
  const old = v.active;
  v.active = !isFalseLike(active);
  if(old===v.active) return {ok:true, vendor:v, changed:false};
  save();
  logAudit({type: v.active?'VendorReactivated':'VendorDeactivated', vendorId, reason:reason||null, userId:actor.id, role:actor.role});
  return {ok:true, vendor:v, changed:true};
}
function editMaterialMaster({materialId, changes, reason, actor}){
  const m = DB.materials.find(x=>x.id===materialId);
  const hasHistory = m ? materialHasAccountingHistory(materialId) : false;
  const r = _applyMasterEdit({record:m, changes, reason, lockedAlways:['id','code'], lockedWithHistory:MATERIAL_LOCKED_FIELDS_WITH_HISTORY, hasHistory, entityLabel:'Material'});
  if(!r.ok) return r;
  if(r.changeLog.length){ m.lastEditedBy=actor.id; m.lastEditedAt=nowIso(); save();
    logAudit({type:'MaterialEdited', materialId, changes:r.changeLog, hadAccountingHistory:hasHistory, reason:reason||null, userId:actor.id, role:actor.role}); }
  return {ok:true, material:m, changed:r.changeLog.map(x=>x.field)};
}
function setMaterialActive({materialId, active, reason, actor}){
  const m = DB.materials.find(x=>x.id===materialId);
  if(!m) return {ok:false, error:'Material not found.'};
  if(isFalseLike(active) && (!reason || !String(reason).trim())) return {ok:false, error:'A reason is required to deactivate a material.'};
  const old = m.active;
  m.active = !isFalseLike(active);
  if(old===m.active) return {ok:true, material:m, changed:false};
  save();
  logAudit({type: m.active?'MaterialReactivated':'MaterialDeactivated', materialId, reason:reason||null, userId:actor.id, role:actor.role});
  return {ok:true, material:m, changed:true};
}
// Guards used at the point a NEW transaction is created (not retroactively — historical
// transactions referencing an inactive master are never touched or hidden).
// Phase 32 DEFECT FOUND & FIXED (ID-tampering audit, Part 26): all three of these guards only
// ever checked "does this exist AND is it inactive" — `if(v && v.active===false)` — so a
// completely FABRICATED id (v undefined) fell through silently, returning null (no error), rather
// than being rejected. Live-reproduced: `createPurchaseOrder` accepted vendorId "VEND-FAKE-999"
// and created a real PO; `draftCustomerInvoice`/`draftSupplierInvoice` did the same for a
// fabricated customer/vendor id, producing a real draft that could be posted all the way to the
// GL against a party that never existed. Fixed at this single shared root (all 6 call sites
// across PO/Customer-Invoice/Supplier-Bill/Customer-Advance/Damage-Report immediately benefit,
// not just one) rather than patching each caller individually — same "fix at the lowest common
// point" discipline as the r2() rounding fix. Functions that already had their OWN separate
// `!record` existence check before calling this (e.g. createMaterialIssue) are unaffected — this
// guard now simply agrees with them instead of being the one exception that didn't check.
function assertCustomerSelectable(customerId){
  const c = DB.customers.find(x=>x.id===customerId);
  if(!c) return `Customer "${customerId}" does not exist.`;
  if(c.active===false) return `Customer "${c.name}" (${customerId}) is INACTIVE and cannot be used on a new transaction.`;
  return null;
}
function assertVendorSelectable(vendorId){
  const v = DB.vendors.find(x=>x.id===vendorId);
  if(!v) return `Vendor "${vendorId}" does not exist.`;
  if(v.active===false) return `Vendor "${v.name}" (${vendorId}) is INACTIVE and cannot be used on a new transaction.`;
  return null;
}
// Phase 21 §7/§8 — configure a material's Purchase UOM -> Base/Stock UOM conversion. Changing the
// factor does NOT retroactively touch any already-posted transaction: every past GRN already
// captured its own converted base-unit quantity as a fixed number at the moment it was posted
// (see createGRN below), never a live-recomputed formula — so this is safe to change even after
// history exists, unlike the identity-locked fields in MATERIAL_LOCKED_FIELDS_WITH_HISTORY.
function setMaterialUomConversion({materialId, purchaseUom, purchaseConversionFactor, actor}){
  const m = DB.materials.find(x=>x.id===materialId);
  if(!m) return {ok:false, error:'Material not found.'};
  const factor = +purchaseConversionFactor;
  if(!(factor > 0)) return {ok:false, error:'Conversion factor must be a positive number (zero and negative factors are rejected).'};
  if(!purchaseUom || !String(purchaseUom).trim()) return {ok:false, error:'Purchase UOM is required.'};
  const old = { purchaseUom:m.purchaseUom, purchaseConversionFactor:m.purchaseConversionFactor };
  m.purchaseUom = String(purchaseUom).trim();
  m.purchaseConversionFactor = factor;
  save();
  logAudit({type:'MaterialUomConversionChanged', materialId, baseUom:m.uom, old, new:{purchaseUom:m.purchaseUom, purchaseConversionFactor:factor}, userId:actor.id, role:actor.role});
  return {ok:true, material:m};
}
function assertMaterialSelectable(materialId){
  const m = DB.materials.find(x=>x.id===materialId);
  if(!m) return `Material "${materialId}" does not exist.`;
  if(m.active===false) return `Material "${m.code}" (${materialId}) is INACTIVE and cannot be used on a new transaction.`;
  return null;
}
// P0-1 FIX — this is the Phase 20 Master Data Import Framework's direct project-master creator,
// self-documented (see the "Master Data Import Framework" comment block above, Phase 20 §3/§4) as
// existing specifically for the accounts team to enter/import REAL post-handover data — never as
// an alternative to the quotation-driven wonTransition() path for an ordinary operational project.
// It was already gated to Admin/CEO only (masterData permission, server.js), but nothing made that
// intent explicit or auditable: an Admin/CEO could use it to spin up a fully 'ACTIVE' project with
// no customer, no quotation, and no PM, indistinguishable in the audit log from a genuine data-
// migration entry. LIVE PROVEN in the prior SOP-to-ERP audit (PRJ-030, name-only). The fix does not
// add a new role or a new approval tier (Part 11 — no invented policy) — it makes the SAME already-
// restricted action require an explicit, mandatory, audited declaration of WHY this path is being
// used outside the normal sales pipeline, so every such project is self-documenting rather than
// silently indistinguishable from a normal one.
function createProjectMaster({name, budget, customerId, branchId, projectManagerId, migrationReason, sourceReference, actor}){
  if(!name || !name.trim()) return {ok:false, error:'Project name is required.'};
  if(!migrationReason || !String(migrationReason).trim()){
    return {ok:false, error:'This is the direct/administrative project-creation path, intended for data migration and administrative use, not for an ordinary operational project (use the quotation Won-transition instead). A reason is mandatory — state why this project is being created outside the normal Lead→Quotation→Won pipeline (e.g. "post-handover migration of an in-flight project from the legacy system").'};
  }
  if(customerId && !DB.customers.find(c=>c.id===customerId)) return {ok:false, error:`Unknown customer "${customerId}".`};
  if(branchId && !DB.branches.find(b=>b.id===branchId)) return {ok:false, error:`Unknown branch "${branchId}".`};
  if(projectManagerId && !DB.users.find(u=>u.id===projectManagerId && u.role==='ProjectManager')) return {ok:false, error:`Unknown or non-PM user "${projectManagerId}".`};
  // Phase 39 CRITICAL FIX — found live: `budget:+budget||0` silently converted a garbled budget
  // ("not-a-number" -> NaN -> 0) to a real ₹0 budget with ok:true, and a negative budget
  // (-100000) was accepted uncaught too. Budget feeds Financial Readiness / overrun checks
  // throughout the Project module — a silently-zeroed budget makes every future expense look
  // like a budget overrun for the wrong reason (a typo, not a real ₹0 budget decision).
  if(budget!==undefined && budget!==null && budget!==''){
    const n = Number(budget);
    if(!Number.isFinite(n)) return {ok:false, error:`Budget must be a real number — got "${budget}".`};
    if(n<0) return {ok:false, error:`Budget cannot be negative — got ${n}.`};
  }
  // Phase 32 §C — also fixed the pre-existing FORMAT inconsistency: this path never zero-padded
  // (would have produced "PRJ-11" while wonTransition() produces "PRJ-011") — now consistent.
  const p = { id:nextId(DB.projects, 'PRJ-', 3), name:name.trim(), budget:+budget||0, status:'ACTIVE', projectManagerId:projectManagerId||null,
    salesOwnerId:null, quotationId:null, leadId:null, customerId:customerId||null, advanceRequiredAmount:null, branchId:branchId||null,
    // P0-1 FIX — explicit, permanent, auditable migration/admin context. isMigrationRecord is a
    // simple, honest marker (not a new status value — PROJECT_STATUSES is untouched, still 'ACTIVE')
    // so every downstream report/consumer that only understands the existing status enum keeps
    // working exactly as before; this is purely additive traceability, same discipline as every
    // other backward-compatible field addition in this file.
    isMigrationRecord: true, migrationReason: String(migrationReason).trim(), migrationSourceReference: sourceReference ? String(sourceReference).trim() : null,
    createdBy:actor.id, createdAt:nowIso() };
  DB.projects.push(p); save();
  logAudit({type:'ProjectCreatedViaMigration', projectId:p.id, name:p.name, customerId:p.customerId, projectManagerId:p.projectManagerId,
    budget:p.budget, migrationReason:p.migrationReason, migrationSourceReference:p.migrationSourceReference, userId:actor.id, role:actor.role});
  return {ok:true, project:p};
}
function createCostCentreMaster({id, name, actor}){
  if(!id || !name) return {ok:false, error:'Cost Centre ID and Name are both required.'};
  const ccId = 'CC-'+id.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'');
  if(DB.costCentres.find(c=>c.id===ccId)) return {ok:false, error:`Cost Centre "${ccId}" already exists.`};
  const cc = { id:ccId, name, createdBy:actor.id, createdAt:nowIso() };
  DB.costCentres.push(cc); save();
  logAudit({type:'CostCentreCreated', costCentreId:cc.id, name, userId:actor.id, role:actor.role});
  return {ok:true, costCentre:cc};
}
function createTaxCodeMaster({code, label, cgstPct, sgstPct, igstPct, actor}){
  if(!code || !label) return {ok:false, error:'Tax code and label are both required.'};
  if(DB.taxCodes.find(t=>t.code===code)) return {ok:false, error:`Tax code "${code}" already exists.`};
  // Phase 39 CRITICAL FIX — found live via deliberate fault injection: `+cgstPct||0` silently
  // converted a malformed rate ("abc" -> NaN -> 0) to a real 0% tax rate with ok:true, and neither
  // a negative percentage nor one over 100% was rejected at all (proven live: a tax code was
  // created with cgstPct:500). Since every future invoice/bill using this tax code computes its
  // GST straight from these three fields (calcTax()), a garbled or out-of-range rate here silently
  // under- or over-taxes every transaction that references it, with no error ever surfacing at the
  // point the real mistake was made. 0-100% is not an invented business policy — a GST percentage
  // outside that range is a mathematical impossibility for this field, not a judgment call.
  const pctFields = {cgstPct, sgstPct, igstPct};
  for(const [fname, fval] of Object.entries(pctFields)){
    if(fval===undefined || fval===null || fval==='') continue; // omitted entirely -> defaults to 0, unchanged behavior
    const n = Number(fval);
    if(!Number.isFinite(n)) return {ok:false, error:`${fname} must be a real number — got "${fval}".`};
    if(n<0 || n>100) return {ok:false, error:`${fname} must be between 0 and 100 — got ${n}.`};
  }
  const tc = { code, label, cgstPct:+cgstPct||0, sgstPct:+sgstPct||0, igstPct:+igstPct||0, active:true, createdBy:actor.id, createdAt:nowIso() };
  DB.taxCodes.push(tc); save();
  logAudit({type:'TaxCodeCreated', taxCode:code, userId:actor.id, role:actor.role});
  return {ok:true, taxCode:tc};
}
function createPaymentMethodMaster({code, name, category, actor}){
  if(!code || !name) return {ok:false, error:'Code and name are both required.'};
  const id = 'PM-'+code.trim().toUpperCase();
  if(DB.paymentMethods.find(m=>m.id===id)) return {ok:false, error:`Payment method "${code}" already exists.`};
  const pm = { id, code:code.trim().toUpperCase(), name, category:category||'Bank', active:true, createdBy:actor.id, createdAt:nowIso() };
  DB.paymentMethods.push(pm); save();
  logAudit({type:'PaymentMethodCreated', paymentMethodId:id, name, userId:actor.id, role:actor.role});
  return {ok:true, paymentMethod:pm};
}
function createAccountMaster({accountCode, accountName, accountType, parentAccount, controlAccount, taxRelevant, projectRelevant, costCentreRelevant, profitCentreRelevant, actor}){
  if(!accountCode || !accountName || !accountType) return {ok:false, error:'Account Code, Name and Type are all required.'};
  if(!['Asset','Liability','Income','Expense'].includes(accountType)) return {ok:false, error:`Account Type must be one of Asset/Liability/Income/Expense — got "${accountType}".`};
  if(DB.accounts.find(a=>a.id===accountCode)) return {ok:false, error:`Account code "${accountCode}" already exists.`};
  if(parentAccount && !DB.accounts.find(a=>a.id===parentAccount)) return {ok:false, error:`Unknown parent account "${parentAccount}".`};
  const acc = { id:accountCode, name:accountName, type:accountType, parentAccount:parentAccount||null, active:true,
    controlAccount: controlAccount===true||controlAccount==='true', taxRelevant: taxRelevant===true||taxRelevant==='true',
    projectRelevant: projectRelevant===true||projectRelevant==='true', costCentreRelevant: costCentreRelevant===true||costCentreRelevant==='true',
    profitCentreRelevant: profitCentreRelevant===true||profitCentreRelevant==='true', createdBy:actor.id, createdAt:nowIso() };
  DB.accounts.push(acc); save();
  logAudit({type:'AccountCreated', accountCode, accountName, accountType, userId:actor.id, role:actor.role});
  return {ok:true, account:acc};
}

// ---------- Generic CSV parsing + field validators, shared by every import type ----------
function genericCsvRows(csvText){
  const lines = String(csvText).split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(!lines.length) return {header:[], rows:[]};
  const header = lines[0].split(',').map(h=>h.trim());
  const rows = lines.slice(1).map(line=>{
    const cols = line.split(',');
    const obj = {};
    header.forEach((h,i)=> obj[h] = (cols[i]!==undefined ? cols[i].trim() : ''));
    return obj;
  });
  return {header, rows};
}
function isValidGSTIN(v){ return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(v); }
function isValidDateStr(v){ return /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)); }
function isValidAmountStr(v){ return v!=='' && v!==undefined && v!==null && !isNaN(+v); }

// Per-type import spec: requiredFields (must be non-empty), validateRow (returns an array of
// error strings — empty means valid), createRow (calls the REAL single-record creator above, so
// import and manual single-entry always go through the identical validation/audit path).
const MASTER_IMPORT_SPECS = {
  ChartOfAccounts: {
    requiredFields: ['accountCode','accountName','accountType'],
    validateRow(row){
      const errs = [];
      if(row.accountType && !['Asset','Liability','Income','Expense'].includes(row.accountType)) errs.push(`Account Type must be Asset/Liability/Income/Expense, got "${row.accountType}".`);
      if(DB.accounts.find(a=>a.id===row.accountCode)) errs.push(`Duplicate account code "${row.accountCode}".`);
      if(row.parentAccount && !DB.accounts.find(a=>a.id===row.parentAccount)) errs.push(`Unknown parent account "${row.parentAccount}".`);
      return errs;
    },
    createRow(row, actor){ return createAccountMaster({...row, actor}); }
  },
  Customers: {
    requiredFields: ['name'],
    validateRow(row){
      const errs = [];
      if(DB.customers.find(c=>c.name.trim().toLowerCase()===row.name.trim().toLowerCase())) errs.push(`Duplicate customer name "${row.name}" — will be linked, not re-created.`);
      if(row.gstin && !isValidGSTIN(row.gstin)) errs.push(`Invalid GSTIN format: "${row.gstin}".`);
      return errs.filter(e=>!e.includes('will be linked')); // duplicate customer is not an error — findOrCreateCustomer links it
    },
    createRow(row, actor){ return findOrCreateCustomer({...row, actor}); }
  },
  Suppliers: {
    requiredFields: ['name'],
    validateRow(row){
      const errs = [];
      if(DB.vendors.find(v=>v.name.trim().toLowerCase()===row.name.trim().toLowerCase())) errs.push(`Duplicate vendor name "${row.name}".`);
      if(row.gstNumber && !isValidGSTIN(row.gstNumber)) errs.push(`Invalid GSTIN format: "${row.gstNumber}".`);
      return errs;
    },
    createRow(row, actor){ return createVendorMaster({...row, actor}); }
  },
  Items: {
    requiredFields: ['code','description','uom'],
    validateRow(row){
      const errs = [];
      if(DB.materials.find(m=>m.code.trim().toLowerCase()===row.code.trim().toLowerCase())) errs.push(`Duplicate item code "${row.code}".`);
      if(row.taxCode && !DB.taxCodes.find(t=>t.code===row.taxCode)) errs.push(`Unknown tax code "${row.taxCode}".`);
      if(row.standardCost && !isValidAmountStr(row.standardCost)) errs.push(`Invalid standardCost "${row.standardCost}".`);
      return errs;
    },
    createRow(row, actor){ return createMaterialMaster({...row, actor}); }
  },
  ServiceLabourRates: {
    requiredFields: ['technicianLevel'],
    validateRow(row){ return []; },
    createRow(row, actor){ return setServiceLabourRate({...row, actor}); }
  },
  Projects: {
    // PHASE 1 CLOSURE GATE FIX (drift found by the historical suite's own reconciliation run,
    // via this closure gate's ERP-044 regression test) — createProjectMaster() has always
    // required a non-empty `migrationReason` (this IS the direct/administrative project-creation
    // path, not the normal quotation pipeline — see its own header comment), but this spec's
    // validateRow() never checked for it. Under the OLD, non-atomic importMasterData() engine this
    // was merely a confusing single-row REJECTED result; under the Phase-1-then-Phase-2 atomic
    // engine (ERP-017 fix) a row that passes Phase 1 but fails at Phase 2's createRow() call rolls
    // back the ENTIRE batch — so this drift needed to be closed here, at its source, rather than
    // surfacing as a misleading "should not happen" rollback error. Mirrors createProjectMaster's
    // own exact requirement and message so the two can never drift again silently.
    requiredFields: ['name', 'migrationReason'],
    validateRow(row){
      const errs = [];
      if(row.customerId && !DB.customers.find(c=>c.id===row.customerId)) errs.push(`Unknown customer "${row.customerId}".`);
      if(row.branchId && !DB.branches.find(b=>b.id===row.branchId)) errs.push(`Unknown branch "${row.branchId}".`);
      if(row.budget && !isValidAmountStr(row.budget)) errs.push(`Invalid budget "${row.budget}".`);
      return errs;
    },
    createRow(row, actor){ return createProjectMaster({...row, actor}); }
  },
  CostCentres: {
    requiredFields: ['id','name'],
    validateRow(row){ return DB.costCentres.find(c=>c.id==='CC-'+row.id.toUpperCase()) ? [`Duplicate cost centre "${row.id}".`] : []; },
    createRow(row, actor){ return createCostCentreMaster({...row, actor}); }
  },
  Banks: {
    // Phase 24 Part A — glAccount is now required: a bank/cash account imported without one can
    // no longer silently default to account 1000, since real multi-account GL segregation
    // depends on every account having its own distinct GL code.
    requiredFields: ['bankName','accountName','glAccount'],
    validateRow(row){ return []; },
    createRow(row, actor){ return createBankAccount({...row, actor}); }
  },
  PaymentMethods: {
    requiredFields: ['code','name'],
    validateRow(row){ return DB.paymentMethods.find(m=>m.id==='PM-'+row.code.toUpperCase()) ? [`Duplicate payment method code "${row.code}".`] : []; },
    createRow(row, actor){ return createPaymentMethodMaster({...row, actor}); }
  },
  FixedAssets: {
    requiredFields: ['assetName','purchaseDate','cost'],
    validateRow(row){
      const errs = [];
      if(!isValidDateStr(row.purchaseDate)) errs.push(`Invalid purchaseDate "${row.purchaseDate}" — expected YYYY-MM-DD.`);
      if(!isValidAmountStr(row.cost)) errs.push(`Invalid cost "${row.cost}".`);
      return errs;
    },
    createRow(row, actor){ return createFixedAsset({...row, actor}); }
  },
  TaxCodes: {
    requiredFields: ['code','label'],
    validateRow(row){ return DB.taxCodes.find(t=>t.code===row.code) ? [`Duplicate tax code "${row.code}".`] : []; },
    createRow(row, actor){ return createTaxCodeMaster({...row, actor}); }
  }
};
// §5 — validate → accept/reject per row, NEVER partial-import a row. §33 — rollback: nothing is
// written until every row in the batch has been validated; rows that fail validation are
// reported with a reason and simply never created (no partial record, nothing to roll back).
// ERP AUDIT FIX (ERP-017, Critical) — this function used to validate-and-commit ROW BY ROW in a
// single pass: row 1 valid -> created immediately; row 2 invalid -> rejected; row 3 valid ->
// created immediately. Live-proven by the audit: a batch with one bad row among good ones left the
// good rows PERMANENTLY PERSISTED even though the import as a whole was reported as having
// failures — "the import is not atomic." Rebuilt as the audit's own recommended two-phase sequence
// (§ "Validate entire file -> Preview -> Approve -> Commit entire batch"): PHASE 1 validates every
// row (required fields + spec.validateRow — neither has side effects) with ZERO calls to
// spec.createRow; if ANY row fails, the WHOLE BATCH is rejected and NOTHING is created — the
// per-row breakdown is still returned so the caller can see exactly what to fix. Only when every
// single row passes does PHASE 2 actually commit, calling spec.createRow() for each row in turn,
// wrapped in a snapshot/rollback (the same pattern used elsewhere in this file for multi-write
// sequences) in case a createRow() call throws partway through phase 2 despite passing validation.
// `dryRun:true` stops after Phase 1 and never proceeds to Phase 2 at all — the "preview" step the
// audit asked for, safe to call as many times as needed with zero risk of any write.
// DISCLOSED LIMITATION: Phase 1's validateRow() checks each row against ALREADY-PERSISTED state
// (e.g. an existing vendor with the same name) but not against SIBLING rows in the same
// not-yet-committed batch — two rows in one file introducing the "same" new vendor by name would
// both independently pass Phase 1 and both be created as separate records in Phase 2. This is a
// real, narrower gap than the atomicity defect just closed (duplicate DETECTION, not partial
// commit) and is not fixed here to avoid guessing what "the same" should mean per master type
// (exact name match? case-insensitive? — a policy question, not assumed).
function importMasterData({importType, csvText, actor, dryRun}){
  { const _a = assertCanImportMasterData(actor); if(!_a.ok) return _a; }
  const spec = MASTER_IMPORT_SPECS[importType];
  if(!spec) return {ok:false, error:`Unknown import type "${importType}". Must be one of: ${Object.keys(MASTER_IMPORT_SPECS).join(', ')}.`};
  const {rows} = genericCsvRows(csvText);
  if(!rows.length) return {ok:false, error:'No data rows found in the import file.'};

  // PHASE 1 — validate every row, commit nothing.
  const validated = rows.map((row, idx)=>{
    const missing = spec.requiredFields.filter(f=>!row[f] || !String(row[f]).trim());
    if(missing.length) return {row:idx+2, valid:false, reason:`Missing required field(s): ${missing.join(', ')}.`, data:row};
    const errs = spec.validateRow(row);
    if(errs.length) return {row:idx+2, valid:false, reason:errs.join(' '), data:row};
    return {row:idx+2, valid:true, reason:null, data:row};
  });
  const invalidRows = validated.filter(v=>!v.valid);
  if(invalidRows.length){
    const results = validated.map(v=>({row:v.row, status:'REJECTED', reason:v.reason||'Batch rejected — see other row(s) for the actual failure(s).', data:v.data}));
    // ERP-059B — durableFailureAudit, see ERP-059B-TRANSACTION-DESIGN.md.
    return {ok:false, error:`Import rejected — ${invalidRows.length} of ${rows.length} row(s) failed validation. NO records were created (atomic import — fix every row and re-submit the whole file).`, results,
      durableFailureAudit:{type:'MasterDataImportBatchRejected', importType, rowCount:rows.length, invalidCount:invalidRows.length}};
  }
  if(dryRun){
    return {ok:true, dryRun:true, message:`All ${rows.length} row(s) passed validation and are ready to commit. Re-submit without dryRun to actually import.`, results: validated.map(v=>({row:v.row, status:'WOULD_ACCEPT', reason:null, data:v.data}))};
  }

  // PHASE 2 — every row passed; commit them all, with rollback if anything throws partway through.
  const _rb = { collectionsBefore: {} };
  Object.keys(DB).filter(k=>Array.isArray(DB[k])).forEach(k=>{ _rb.collectionsBefore[k] = DB[k].length; });
  const results = [];
  try {
    validated.forEach(v=>{
      const r = spec.createRow(v.data, actor);
      if(!r.ok) throw new Error(`Row ${v.row} passed validation but failed on commit: ${r.error} — this should not happen (validateRow and createRow have drifted); the whole batch is being rolled back.`);
      results.push({row:v.row, status:'ACCEPTED', reason:null, data:v.data, created:Object.values(r).find(x=>x&&x.id)?.id||null});
    });
  } catch(e){
    Object.keys(_rb.collectionsBefore).forEach(k=>{ if(Array.isArray(DB[k])) DB[k].length = _rb.collectionsBefore[k]; });
    save();
    logAudit({type:'MasterDataImportRolledBackOnFailure', importType, error:String(e && e.message || e), userId:actor.id, role:actor.role});
    return {ok:false, error:'Import failed partway through commit and was fully rolled back — NO records from this batch were kept: '+String(e && e.message || e)};
  }
  const batch = { id:'MIB-'+String(DB.masterImportBatches.length+1).padStart(4,'0'), importType, importedBy:actor.id, importedByRole:actor.role, importedAt:nowIso(),
    rowCount:rows.length, acceptedCount:results.length, rejectedCount:0 };
  DB.masterImportBatches.push(batch); save();
  logAudit({type:'MasterDataImported', batchId:batch.id, importType, rowCount:batch.rowCount, acceptedCount:batch.acceptedCount, rejectedCount:batch.rejectedCount, userId:actor.id, role:actor.role});
  return {ok:true, batch, results};
}

// ============================================================
// Phase 20 §7-§10 — Opening Balance Engine. Deliberately reuses the EXISTING `createDraft()` /
// `submitDraft()` / `approveDraft()` / `postDraft()` lifecycle — the SAME central posting
// architecture as every other document (§16: "every entry must use the SAME central posting
// architecture... do not create separate hidden accounting systems"). An opening balance import
// creates real Drafts, tagged `openingBalanceBatchId` for traceability; the accountant then
// Submits/Approves/Posts them through the SAME Document Workflow screen as anything else — SoD,
// Financial Period lock, and audit all apply automatically, for free, with zero new code.
//
// Every opening entry books against account 3000 (Opening Balance Equity, §7 above) as the other
// side. Once every real opening balance is loaded correctly, 3000's balance should be exactly
// ZERO — that zero balance IS the "Opening Trial Balance Debit=Credit" proof (§7/§18), not a
// separate invented rule.
// ============================================================
const OPENING_BALANCE_SPECS = {
  OpeningAR: {
    requiredFields: ['customerId','invoiceRef','invoiceDate','amount'],
    validateRow(row){
      const errs = [];
      if(!DB.customers.find(c=>c.id===row.customerId)) errs.push(`Unknown customer "${row.customerId}".`);
      if(!isValidDateStr(row.invoiceDate)) errs.push(`Invalid invoiceDate "${row.invoiceDate}".`);
      if(!isValidAmountStr(row.amount) || +row.amount<=0) errs.push(`Invalid amount "${row.amount}".`);
      if(row.project && !DB.projects.find(p=>p.id===row.project)) errs.push(`Unknown project "${row.project}".`);
      if(DB.openingBalanceLines.some(l=>l.type==='OpeningAR' && l.customerId===row.customerId && l.invoiceRef===row.invoiceRef)) errs.push(`Duplicate opening AR document — customer "${row.customerId}" invoice ref "${row.invoiceRef}" already imported.`);
      return errs;
    },
    buildLines(row){ return [ {account:AR_ACCOUNT, debit:+row.amount, credit:0, customerId:row.customerId, projectId:row.project||null, reference:row.invoiceRef},
      {account:'3000', debit:0, credit:+row.amount, customerId:row.customerId, projectId:row.project||null} ]; },
    narration(row){ return `Opening AR — ${row.customerId} — ${row.invoiceRef}`; },
    dueDate(row){ return row.dueDate || undefined; },
    // DEFECT FOUND & FIXED (this phase's own test suite): without this, the posted opening
    // entry never appeared in customerOpenItems()/ageing at all — `AR_DOC_CATEGORIES` only
    // recognizes 'CustomerInvoice', not a separate 'OpeningBalance' category the rest of the
    // AR engine has never heard of. An imported Opening AR balance IS, functionally, an open
    // customer invoice for collection purposes — it must use the SAME category the rest of the
    // AR subledger keys off of (§16 consistency), distinguishable instead via `sourceType`.
    docCategory: 'CustomerInvoice'
  },
  OpeningAP: {
    requiredFields: ['vendorId','billRef','billDate','amount'],
    validateRow(row){
      const errs = [];
      if(!DB.vendors.find(v=>v.id===row.vendorId)) errs.push(`Unknown vendor "${row.vendorId}".`);
      if(!isValidDateStr(row.billDate)) errs.push(`Invalid billDate "${row.billDate}".`);
      if(!isValidAmountStr(row.amount) || +row.amount<=0) errs.push(`Invalid amount "${row.amount}".`);
      if(row.project && !DB.projects.find(p=>p.id===row.project)) errs.push(`Unknown project "${row.project}".`);
      if(DB.openingBalanceLines.some(l=>l.type==='OpeningAP' && l.vendorId===row.vendorId && l.billRef===row.billRef)) errs.push(`Duplicate opening AP document — vendor "${row.vendorId}" bill ref "${row.billRef}" already imported.`);
      return errs;
    },
    buildLines(row){ return [ {account:'3000', debit:+row.amount, credit:0, vendorId:row.vendorId, projectId:row.project||null},
      {account:AP_ACCOUNT, debit:0, credit:+row.amount, vendorId:row.vendorId, projectId:row.project||null, reference:row.billRef} ]; },
    narration(row){ return `Opening AP — ${row.vendorId} — ${row.billRef}`; },
    docCategory: 'SupplierInvoice' // same fix/reason as OpeningAR above
  },
  OpeningInventory: {
    requiredFields: ['materialId','warehouseId','qty','unitCost'],
    validateRow(row){
      const errs = [];
      if(!DB.materials.find(m=>m.id===row.materialId)) errs.push(`Unknown material "${row.materialId}".`);
      if(!DB.warehouses.find(w=>w.id===row.warehouseId)) errs.push(`Unknown warehouse "${row.warehouseId}".`);
      if(!isValidAmountStr(row.qty) || +row.qty<=0) errs.push(`Invalid qty "${row.qty}".`);
      if(!isValidAmountStr(row.unitCost) || +row.unitCost<0) errs.push(`Invalid unitCost "${row.unitCost}".`);
      if(DB.openingBalanceLines.some(l=>l.type==='OpeningInventory' && l.materialId===row.materialId && l.warehouseId===row.warehouseId)) errs.push(`Opening inventory for "${row.materialId}" at "${row.warehouseId}" was already imported — cannot import twice.`);
      return errs;
    },
    buildLines(row){ const value = r2(+row.qty * +row.unitCost); return [ {account:'1200', debit:value, credit:0}, {account:'3000', debit:0, credit:value} ]; },
    narration(row){ return `Opening Inventory — ${row.materialId} @ ${row.warehouseId}`; },
    extraEffect(row, actor){ postInventoryMovement({type:'Receipt', materialId:row.materialId, qty:+row.qty, uom:'', warehouseId:row.warehouseId, sourceType:'OpeningBalanceImport', sourceId:null, valuationRate:+row.unitCost, actor, capability:'MASTER_DATA_IMPORT' }); }
  },
  OpeningGLBalances: {
    requiredFields: ['accountCode','amount','drCr'],
    validateRow(row){
      const errs = [];
      if(!DB.accounts.find(a=>a.id===row.accountCode)) errs.push(`Unknown account code "${row.accountCode}".`);
      if(row.accountCode===AR_ACCOUNT || row.accountCode===AP_ACCOUNT || row.accountCode==='1200') errs.push(`Account "${row.accountCode}" is a subledger control account (AR/AP/Inventory) — use the Opening AR/Opening AP/Opening Inventory templates instead, not Opening GL Balances, to keep the subledger and control account in sync.`);
      if(!isValidAmountStr(row.amount) || +row.amount<=0) errs.push(`Invalid amount "${row.amount}".`);
      if(!['DR','CR'].includes((row.drCr||'').toUpperCase())) errs.push(`drCr must be DR or CR, got "${row.drCr}".`);
      return errs;
    },
    buildLines(row){ const isDr = row.drCr.toUpperCase()==='DR';
      return isDr ? [ {account:row.accountCode, debit:+row.amount, credit:0}, {account:'3000', debit:0, credit:+row.amount} ]
                   : [ {account:'3000', debit:+row.amount, credit:0}, {account:row.accountCode, debit:0, credit:+row.amount} ]; },
    narration(row){ return `Opening GL Balance — ${row.accountCode}`; }
  }
};
function importOpeningBalance({type, csvText, actor}){
  const spec = OPENING_BALANCE_SPECS[type];
  if(!spec) return {ok:false, error:`Unknown opening balance type "${type}". Must be one of: ${Object.keys(OPENING_BALANCE_SPECS).join(', ')}.`};
  const {rows} = genericCsvRows(csvText);
  if(!rows.length) return {ok:false, error:'No data rows found in the import file.'};
  const batch = { id:'OBB-'+String(DB.openingBalanceBatches.length+1).padStart(4,'0'), type, importedBy:actor.id, importedByRole:actor.role, importedAt:nowIso(), status:'Imported' };
  DB.openingBalanceBatches.push(batch);
  const results = [];
  rows.forEach((row, idx)=>{
    const missing = spec.requiredFields.filter(f=>!row[f] || !String(row[f]).trim());
    if(missing.length){ results.push({row:idx+2, status:'REJECTED', reason:`Missing required field(s): ${missing.join(', ')}.`}); return; }
    const errs = spec.validateRow(row);
    if(errs.length){ results.push({row:idx+2, status:'REJECTED', reason:errs.join(' ')}); return; }
    const lines = spec.buildLines(row);
    const draft = createDraft({ date: row.asOfDate||row.invoiceDate||row.billDate||new Date().toISOString().slice(0,10), docTypeCode:'OB',
      sourceType:'OpeningBalance', docCategory: spec.docCategory||'OpeningBalance', party: row.customerId||row.vendorId||null, lines,
      dueDate: spec.dueDate ? spec.dueDate(row) : undefined, narration: spec.narration(row), createdByUserId:actor.id, createdByRole:actor.role });
    if(!draft.ok){ results.push({row:idx+2, status:'REJECTED', reason:draft.error}); return; }
    draft.draft.openingBalanceBatchId = batch.id;
    const obLine = { id:'OBL-'+String(DB.openingBalanceLines.length+1).padStart(5,'0'), batchId:batch.id, type, draftId:draft.draft.id,
      customerId:row.customerId||null, vendorId:row.vendorId||null, invoiceRef:row.invoiceRef||null, billRef:row.billRef||null,
      materialId:row.materialId||null, warehouseId:row.warehouseId||null, qty:row.qty?+row.qty:null, unitCost:row.unitCost?+row.unitCost:null,
      accountCode:row.accountCode||null, inventoryMovementPosted:false, amount:+row.amount||r2((+row.qty||0)*(+row.unitCost||0)) };
    DB.openingBalanceLines.push(obLine);
    save();
    results.push({row:idx+2, status:'ACCEPTED', reason:null, draftId:draft.draft.id});
  });
  batch.rowCount = rows.length; batch.acceptedCount = results.filter(r=>r.status==='ACCEPTED').length; batch.rejectedCount = results.filter(r=>r.status==='REJECTED').length;
  save();
  logAudit({type:'OpeningBalanceImported', batchId:batch.id, obType:type, rowCount:batch.rowCount, acceptedCount:batch.acceptedCount, rejectedCount:batch.rejectedCount, userId:actor.id, role:actor.role});
  return {ok:true, batch, results};
}
function reconcileOpeningBalances(){
  const lines3000 = allLines().filter(l=>l.account==='3000');
  const balance = r2(lines3000.reduce((s,l)=>s+l.debit-l.credit,0));
  const batches = DB.openingBalanceBatches;
  const pendingDrafts = DB.openingBalanceLines.map(l=>DB.jeDrafts.find(d=>d.id===l.draftId)).filter(d=>d && d.status!=='Posted');
  return { openingBalanceEquityAccount:'3000', balance, isZero: Math.abs(balance)<0.02, batchCount:batches.length,
    totalLinesImported: DB.openingBalanceLines.length, pendingUnpostedCount: pendingDrafts.length,
    note: Math.abs(balance)<0.02 ? 'Zero balance — the opening trial balance loaded so far is internally consistent.' : 'Non-zero balance — either more opening entries remain to be loaded, or an error exists. Do not force this to zero manually.' };
}

function setMaterialHSN({materialId, hsnCode, actor}){
  const m = DB.materials.find(x=>x.id===materialId);
  if(!m) return {ok:false, error:'Material not found.'};
  const old = m.hsnCode;
  m.hsnCode = hsnCode ? String(hsnCode).trim() : null;
  save();
  logAudit({type:'MaterialHSNChanged', materialId, oldValue:old, newValue:m.hsnCode, userId:actor.id, role:actor.role});
  return {ok:true, material:m};
}
function setCustomerGSTIN({customerId, gstin, actor}){
  const c = DB.customers.find(x=>x.id===customerId);
  if(!c) return {ok:false, error:'Customer not found.'};
  const old = c.gstin;
  c.gstin = gstin ? String(gstin).trim().toUpperCase() : null;
  save();
  // §5 explicit requirement: audit changes to GSTIN specifically, not just folded into a generic
  // "customer edited" event — old/new value both recorded, matching the PolicyConfigChanged
  // pattern already used for other sensitive-field changes since Phase 13.
  logAudit({type:'CustomerGSTINChanged', customerId, oldValue:old, newValue:c.gstin, userId:actor.id, role:actor.role});
  return {ok:true, customer:c};
}

// ============================================================
// Phase 15 — Gap Closure
// ============================================================

// §3 Profit Centre — a real master-data mechanism, DELIBERATELY seeded empty (see freshDB()
// comment) since no real Appletree profit-centre value has ever been supplied, unlike Branch
// (Ulliyeri) which had direct screenshot evidence. Full CRUD/search/audit exists; the VALUES are
// management's to define, not invented here.
function createProfitCentre({code, name, actor}){
  if(!code || !name) return {ok:false, error:'Code and name are required.'};
  const id = 'PC-'+code.toUpperCase();
  if(DB.profitCentres.find(p=>p.id===id)) return {ok:false, error:'Profit centre code already exists.'};
  const pc = {id, code:code.toUpperCase(), name, active:true, createdBy:actor.id, createdAt:nowIso()};
  DB.profitCentres.push(pc); save();
  logAudit({type:'ProfitCentreCreated', profitCentreId:id, code:pc.code, name, userId:actor.id, role:actor.role});
  return {ok:true, profitCentre:pc};
}
function listProfitCentres(){ return DB.profitCentres.filter(p=>p.active); }

// §5 Bank Reconciliation. Existing architecture (audited first, per instruction): a single GL
// "Bank" account (1000), Payments/Receipts/Clearing already exist. What was missing: any concept
// of an individual bank account, or a bank statement line to match against postings. Built as a
// genuinely minimal, real workflow: Statement Line (imported) -> Match (link to an existing
// posted entry) -> Reconciled. Never auto-creates accounting entries for an unmatched item — an
// unmatched line just sits Unmatched until a human matches or a real accounting workflow (out of
// this phase's scope) is approved to handle it.
function listBankAccounts(){ return DB.bankAccounts.filter(b=>b.active); }
// Phase 24 Part A — Multi-Bank/Cash GL Segregation (Phase 23 audit finding: multiple bank account
// RECORDS could already be created, but every receipt/payment posted unconditionally to account
// 1000 regardless of which one was tagged). `type` ('Bank'/'Cash') is added to the SAME existing
// master — not a new parallel Cash Account entity — since a cash account is, for GL purposes,
// exactly the same shape as a bank account (an id, a name, a GL control account, a balance). Each
// account MUST have its own distinct glAccount for real segregation to mean anything; this is
// validated here, not assumed.
function createBankAccount({bankName, accountName, accountNumberLast4, glAccount, type, actor}){
  if(!bankName || !accountName) return {ok:false, error:'Bank name and account name are required.'};
  if(!glAccount) return {ok:false, error:'A distinct GL account is required for real bank/cash segregation — it can no longer default silently to account 1000.'};
  if(!DB.accounts.find(a=>a.id===glAccount)) return {ok:false, error:`Unknown GL account "${glAccount}".`};
  if(DB.bankAccounts.some(b=>b.glAccount===glAccount && b.active)) return {ok:false, error:`GL account "${glAccount}" is already used by another active bank/cash account — each account needs its OWN distinct GL account for real segregation, not a shared one.`};
  const acctType = type==='Cash' ? 'Cash' : 'Bank';
  const ba = {id: nextId(DB.bankAccounts, 'BANK-', 3), type:acctType, bankName, accountName, accountNumberLast4:accountNumberLast4||'', glAccount, active:true, createdBy:actor.id, createdAt:nowIso()};
  DB.bankAccounts.push(ba); save();
  logAudit({type:'BankAccountCreated', bankAccountId:ba.id, acctType, bankName, accountName, glAccount, userId:actor.id, role:actor.role});
  return {ok:true, bankAccount:ba};
}
// Per-account GL balance — the real proof that segregation works: each account's balance is
// derived from ONLY the journal lines posted to ITS OWN glAccount, nothing else.
function bankAccountBalances(){
  return DB.bankAccounts.map(b => ({
    id:b.id, type:b.type||'Bank', bankName:b.bankName, accountName:b.accountName, glAccount:b.glAccount, active:b.active,
    balance: r2(allLines().filter(l=>l.account===b.glAccount).reduce((s,l)=>s+l.debit-l.credit,0))
  }));
}
// A transfer between two bank/cash accounts — still just an ordinary 2-line journal entry
// assembled here and handed to the ONE central postJournalEntry() function, not a parallel
// posting engine. Dr the destination account's GL, Cr the source account's GL.
function createBankTransfer({fromAccountId, toAccountId, amount, date, narration, reference, actor, overrideReason}){
  { const _a = assertCanTransferBankFunds(actor); if(!_a.ok) return _a; }
  if(!(+amount>0)) return {ok:false, error:'Transfer amount must be positive.'};
  const from = DB.bankAccounts.find(b=>b.id===fromAccountId);
  const to = DB.bankAccounts.find(b=>b.id===toAccountId);
  if(!from) return {ok:false, error:`Unknown source account "${fromAccountId}".`};
  if(!to) return {ok:false, error:`Unknown destination account "${toAccountId}".`};
  if(from.id===to.id) return {ok:false, error:'Source and destination accounts must be different.'};
  if(from.active===false) return {ok:false, error:`Source account "${from.accountName}" is inactive.`};
  if(to.active===false) return {ok:false, error:`Destination account "${to.accountName}" is inactive.`};
  const lines = [ {account:to.glAccount, debit:+amount, credit:0}, {account:from.glAccount, debit:0, credit:+amount} ];
  const result = postJournalEntry({ date, narration: narration || `Transfer: ${from.accountName} -> ${to.accountName}`,
    sourceType:'BankTransfer', voucherNo:nextDocNumber('BXFR', date), docCategory:'BankTransfer', refNo1: reference||'',
    lines, actor, capability:'BANK_TRANSFER', overrideReason });
  if(!result.ok) return result;
  logAudit({type:'BankTransferPosted', fromAccountId, toAccountId, amount:+amount, entryId:result.entry.id, userId:actor.id, role:actor.role});
  return {ok:true, entry:result.entry};
}
// CSV format (generic, since no real ICICI statement export was supplied — the exact real
// format is BANK FORMAT CONFIGURATION REQUIRED, documented not guessed): Date,Reference,
// Description,Amount,Type(Debit/Credit). Import is metadata-only — it creates UNRECONCILED
// statement lines, never a GL posting of any kind.
function importBankStatement({bankAccountId, csvText, actor}){
  const ba = DB.bankAccounts.find(b=>b.id===bankAccountId);
  if(!ba) return {ok:false, error:'Bank account not found.'};
  const lines = (csvText||'').split(/\r?\n/).filter(l=>l.trim().length);
  if(lines.length<2) return {ok:false, error:'CSV needs a header row plus at least one data row.'};
  const header = lines[0].split(',').map(h=>h.trim());
  const required = ['Date','Reference','Amount','Type'];
  for(const r of required) if(!header.includes(r)) return {ok:false, error:`Missing required column "${r}". Expected: Date,Reference,Description,Amount,Type(Debit/Credit) — BANK FORMAT CONFIGURATION REQUIRED if your real statement export differs.`};
  const rows = lines.slice(1).map(l=>{ const c=l.split(','); const row={}; header.forEach((h,i)=>row[h]=(c[i]||'').trim()); return row; });
  const errors = [];
  rows.forEach((row,idx)=>{
    if(!row.Date) errors.push(`Row ${idx+1}: missing Date.`);
    if(!row.Amount || isNaN(+row.Amount)) errors.push(`Row ${idx+1}: invalid Amount.`);
    if(!['Debit','Credit'].includes(row.Type)) errors.push(`Row ${idx+1}: Type must be Debit or Credit.`);
  });
  if(errors.length) return {ok:false, error:'Bank statement import validation failed.', errors};
  const created = rows.map(row=>{
    const line = { id: nextId(DB.bankStatementLines, 'BSL-', 5), bankAccountId, date:row.Date, reference:row.Reference||'', description:row.Description||'',
      amount:r2(+row.Amount), type:row.Type, status:'Unmatched', matchedEntryId:null, reconciledDate:null, reconciledBy:null, importedBy:actor.id, importedAt:nowIso() };
    DB.bankStatementLines.push(line); return line;
  });
  save();
  logAudit({type:'BankStatementImported', bankAccountId, count:created.length, userId:actor.id, role:actor.role});
  return {ok:true, lines:created};
}
function matchBankStatementLine({lineId, entryId, actor}){
  const line = DB.bankStatementLines.find(l=>l.id===lineId);
  if(!line) return {ok:false, error:'Statement line not found.'};
  if(line.status==='Reconciled') return {ok:false, error:'Already reconciled.'};
  const entry = DB.journalEntries.find(e=>e.id===entryId);
  if(!entry) return {ok:false, error:'Accounting document not found.'};
  const bankLine = entry.lines.find(l=>l.account==='1000');
  if(!bankLine) return {ok:false, error:'That accounting document has no Bank (1000) line — cannot match.'};
  // Bank-statement Debit/Credit is from the BANK's perspective, the OPPOSITE polarity of our own
  // GL: a statement "Credit" (money deposited into our account) is a DEBIT to our own asset
  // account (Bank, 1000) in double-entry terms, and vice versa for a statement "Debit"
  // (withdrawal). DEFECT FOUND & FIXED (Phase 15 smoke test) — the first version compared them
  // with matching polarity, so every real receipt/payment failed to match.
  const entryAmount = line.type==='Credit' ? bankLine.debit : bankLine.credit;
  if(Math.abs(entryAmount - line.amount) > 0.01) return {ok:false, error:`Amount mismatch — statement line ₹${line.amount.toLocaleString('en-IN')} vs document ₹${entryAmount.toLocaleString('en-IN')}.`};
  line.status = 'Reconciled'; line.matchedEntryId = entryId; line.reconciledDate = new Date().toISOString().slice(0,10); line.reconciledBy = actor.id;
  save();
  logAudit({type:'BankStatementLineMatched', lineId, entryId, userId:actor.id, role:actor.role});
  return {ok:true, line};
}
function unmatchBankStatementLine({lineId, actor}){
  const line = DB.bankStatementLines.find(l=>l.id===lineId);
  if(!line) return {ok:false, error:'Statement line not found.'};
  line.status = 'Unmatched'; line.matchedEntryId = null; line.reconciledDate = null; line.reconciledBy = null;
  save();
  logAudit({type:'BankStatementLineUnmatched', lineId, userId:actor.id, role:actor.role});
  return {ok:true, line};
}
function bankReconciliationStatus(bankAccountId){
  const lines = DB.bankStatementLines.filter(l=>l.bankAccountId===bankAccountId);
  const matched = lines.filter(l=>l.status==='Reconciled');
  const unmatched = lines.filter(l=>l.status==='Unmatched');
  return { bankAccountId, totalLines:lines.length, matchedCount:matched.length, unmatchedCount:unmatched.length,
    unmatchedItems: unmatched, matchedItems: matched };
}

// ============================================================
// Phase 18 §2/§3 — Financial Period Control. Reuses the SAME role-tier already established for
// posting/approval authority (FinanceManager/CEO/Admin — the roles with post:true AND
// approve:true in ROLE_ACTIONS) to administer periods (Create/Close/Reopen), rather than
// inventing a new role. The separate, more sensitive question — "which role, if any, may post
// INTO a closed period without reopening it" — is deliberately NOT defaulted to this same tier;
// it lives on each period's own `overrideRole` field, starts null on every period, and can only
// be set by CEO/Admin (the two roles that already hold every other systemwide override in this
// engagement — SoD self-approval override, Backup/Restore). Until management explicitly approves
// a role for that field, it stays null and the period simply cannot be posted into once closed —
// the only path back in is an audited Reopen, never a silent bypass.
// ============================================================
const PERIOD_MANAGEMENT_ROLES = new Set(['FinanceManager','CEO','Admin']);
const PERIOD_OVERRIDE_CONFIG_ROLES = new Set(['CEO','Admin']);
function findPeriodForDate(dateStr){
  return DB.financialPeriods.find(p => dateStr >= p.startDate && dateStr <= p.endDate) || null;
}
function listFinancialPeriods(){ return DB.financialPeriods.slice().sort((a,b)=> a.startDate.localeCompare(b.startDate)); }
function createFinancialPeriod({name, startDate, endDate, actor}){
  if(!PERIOD_MANAGEMENT_ROLES.has(actor.role)) return {ok:false, error:`Role "${actor.role}" cannot create a financial period.`};
  if(!name || !startDate || !endDate) return {ok:false, error:'Name, Start Date and End Date are required.'};
  if(startDate > endDate) return {ok:false, error:'Start Date must be on or before End Date.'};
  const overlap = DB.financialPeriods.find(p => !(endDate < p.startDate || startDate > p.endDate));
  if(overlap) return {ok:false, error:`Overlaps existing period "${overlap.name}" (${overlap.startDate} to ${overlap.endDate}).`};
  const period = { id: nextId(DB.financialPeriods, 'FP-', 4), name, startDate, endDate, status:'Open',
    overrideRole: null, closedBy:null, closedByRole:null, closedAt:null, closeReason:null,
    reopenedBy:null, reopenedByRole:null, reopenedAt:null, reopenReason:null,
    createdBy:actor.id, createdByRole:actor.role, createdAt: nowIso() };
  DB.financialPeriods.push(period); save();
  logAudit({type:'FinancialPeriodCreated', periodId:period.id, name, startDate, endDate, userId:actor.id, role:actor.role});
  return {ok:true, period};
}
function closeFinancialPeriod({periodId, reason, actor}){
  if(!PERIOD_MANAGEMENT_ROLES.has(actor.role)) return {ok:false, error:`Role "${actor.role}" cannot close a financial period.`};
  const p = DB.financialPeriods.find(x=>x.id===periodId);
  if(!p) return {ok:false, error:'Period not found.'};
  if(p.status==='Closed') return {ok:false, error:'Period is already Closed.'};
  if(!reason) return {ok:false, error:'A reason is required to close a financial period.'};
  p.status='Closed'; p.closedBy=actor.id; p.closedByRole=actor.role; p.closedAt=nowIso(); p.closeReason=reason;
  save();
  logAudit({type:'FinancialPeriodClosed', periodId:p.id, name:p.name, reason, userId:actor.id, role:actor.role});
  return {ok:true, period:p};
}
function reopenFinancialPeriod({periodId, reason, actor}){
  if(!PERIOD_MANAGEMENT_ROLES.has(actor.role)) return {ok:false, error:`Role "${actor.role}" cannot reopen a financial period.`};
  const p = DB.financialPeriods.find(x=>x.id===periodId);
  if(!p) return {ok:false, error:'Period not found.'};
  if(p.status!=='Closed') return {ok:false, error:'Period is not Closed.'};
  if(!reason) return {ok:false, error:'A reason is required to reopen a financial period.'};
  p.status='Open'; p.reopenedBy=actor.id; p.reopenedByRole=actor.role; p.reopenedAt=nowIso(); p.reopenReason=reason;
  save();
  logAudit({type:'FinancialPeriodReopened', periodId:p.id, name:p.name, reason, userId:actor.id, role:actor.role});
  return {ok:true, period:p};
}
// Deliberately the MOST restricted configuration action in this whole Lab — narrower than
// masterData/configure — because it determines who can bypass a closed-period control. Not
// exposed as a general "configure" action; CEO/Admin only, always audited with old->new value.
function setPeriodOverrideRole({periodId, role, actor}){
  if(!PERIOD_OVERRIDE_CONFIG_ROLES.has(actor.role)) return {ok:false, error:`Role "${actor.role}" cannot configure a financial period's override role.`};
  const p = DB.financialPeriods.find(x=>x.id===periodId);
  if(!p) return {ok:false, error:'Period not found.'};
  if(role && !ROLES.includes(role)) return {ok:false, error:`Unknown role "${role}".`};
  const old = p.overrideRole;
  p.overrideRole = role || null; save();
  logAudit({type:'FinancialPeriodOverrideRoleSet', periodId:p.id, oldValue:old, newValue:p.overrideRole, userId:actor.id, role:actor.role});
  return {ok:true, period:p};
}
function periodTrialBalance(period){
  const lines = allLines().filter(l => l.date >= period.startDate && l.date <= period.endDate);
  let debit=0, credit=0;
  lines.forEach(l=>{ debit += l.debit; credit += l.credit; });
  return { debit:r2(debit), credit:r2(credit), balanced: Math.abs(debit-credit) < 0.02, lineCount: lines.length };
}
// §3 — Period-close reconciliation checklist. AR/AP/Inventory checks are deliberately point-in-
// time company-wide figures, not period-sliced sums: real open-item accounting reconciles a
// BALANCE "as of" a date, not a total "for" a date range, so this correctly mirrors how
// reconcileAR()/reconcileAP() and the Phase 16 moving-average check already work — not a new
// invented reconciliation rule, the existing architecture's own proof extended to a checklist.
function periodCloseReconciliation(periodId){
  const p = DB.financialPeriods.find(x=>x.id===periodId);
  if(!p) return {ok:false, error:'Period not found.'};
  const tb = periodTrialBalance(p);
  const ar = reconcileAR();
  const ap = reconcileAP();
  let invValue = 0;
  const pairs = new Set(DB.inventoryMovements.map(m=>m.materialId+'|'+m.warehouseId));
  pairs.forEach(key=>{ const [materialId, warehouseId] = key.split('|'); const stock = getStockLevel(materialId, warehouseId); const rate = getMovingAverageRate(materialId, warehouseId); invValue += stock*rate; });
  invValue = r2(invValue);
  const glInv = r2(allLines().filter(l=>l.account==='1200').reduce((s,l)=>s+l.debit-l.credit,0));
  const inventory = { computedValue: invValue, glBalance: glInv, matches: Math.abs(invValue-glInv) < 0.5 };
  const bankUnmatched = DB.bankStatementLines.filter(l=>l.status==='Unmatched').length;
  let amcMismatch = 0;
  DB.amcContracts.forEach(a=>{ const s = amcRevenueSchedule(a.id); if(Math.abs((s.billed - s.recognized) - s.deferredBalance) > 0.02) amcMismatch++; });
  const afterSales = companyAfterSalesSummary();
  const issues = [];
  if(!tb.balanced) issues.push(`Trial Balance for this period's own postings is NOT balanced (Debit ₹${tb.debit} vs Credit ₹${tb.credit}) — this should be structurally impossible; investigate immediately before closing.`);
  if(!ar.matches) issues.push(`AR subledger (₹${ar.subledgerTotal}) does not match the AR control account (₹${ar.controlAccountBalance}) — company-wide, as of now.`);
  if(!ap.matches) issues.push(`AP subledger (₹${ap.subledgerTotal}) does not match the AP control account (₹${ap.controlAccountBalance}) — company-wide, as of now.`);
  if(!inventory.matches) issues.push(`Computed Inventory value (₹${inventory.computedValue}) does not match GL Inventory balance (₹${inventory.glBalance}) — company-wide, as of now.`);
  if(bankUnmatched>0) issues.push(`${bankUnmatched} bank statement line(s) remain unmatched across all bank accounts — review before closing if any fall within this period.`);
  if(amcMismatch>0) issues.push(`${amcMismatch} AMC contract(s) show Billed − Recognized ≠ Deferred Balance — investigate before closing.`);
  return { ok:true, period:p, trialBalance:tb, ar, ap, inventory, bank:{unmatchedLines:bankUnmatched},
    amc:{contractsChecked:DB.amcContracts.length, mismatches:amcMismatch, totalBilled:afterSales.totalAMCBilled, totalRecognized:afterSales.totalAMCRevenue, totalDeferred:afterSales.totalAMCDeferredBalance},
    warranty:{totalCost:afterSales.totalWarrantyCost, note:'Sourced directly from posted GL lines — no separate subledger exists to drift from it.'},
    serviceRevenue:{totalChargeable:afterSales.totalChargeableServiceRevenue, note:'Sourced directly from posted GL lines — no separate subledger exists to drift from it.'},
    projectCosts:{note:'Project Actual Cost is a live GL-derived figure (Financial 360), not a separately maintained total — no reconciliation drift is structurally possible.'},
    projectRevenue:{note:'Same as above — Project Revenue is GL-derived.'},
    outstandingIssues: issues, readyToClose: issues.length===0 };
}

// ============================================================================================
// PHASE 33 — Apple Tree Finance SOP Compliance & Control Implementation
// Source of truth: Apple_Tree_SOP_Sent.docx (Apple Tree Pvt Ltd's real Finance Team SOP).
// Every new account/collection/doc-type follows the existing SEED + migration-guard discipline.
// Not one function below calls postJournalEntry() directly except through the ONE existing engine
// — no second GL/AP/AR/inventory engine is introduced anywhere in this section.
// ============================================================================================
const FINANCE_CONFIG_ROLES = new Set(['Admin','CEO','FinanceManager']);
const PURCHASE_APPROVAL_ROLES = new Set(['Purchase','FinanceManager','CEO','Admin']);
const CASH_LIMIT_OVERRIDE_ROLES = new Set(['Admin','CEO','FinanceManager']);

// ---------- Sites master ----------
function createSite({name, address, state, siteInChargeUserId, actor}){
  if(!name) return {ok:false, error:'Site name is required.'};
  if(siteInChargeUserId && !DB.users.find(u=>u.id===siteInChargeUserId)) return {ok:false, error:'Unknown Site In-charge user.'};
  const site = { id:'SITE-'+String(DB.sites.length+1).padStart(3,'0'), name, address:address||'', state:state||null,
    siteInChargeUserId:siteInChargeUserId||null, active:true, createdBy:actor.id, createdAt:nowIso() };
  DB.sites.push(site); save();
  logAudit({type:'SiteCreated', siteId:site.id, name, userId:actor.id, role:actor.role});
  return {ok:true, site};
}
function listSites(){ return DB.sites; }
function setSiteActive({siteId, active, actor}){
  const s = DB.sites.find(x=>x.id===siteId); if(!s) return {ok:false, error:'Site not found.'};
  s.active = !!active; save();
  logAudit({type:'SiteActiveSet', siteId, active:s.active, userId:actor.id, role:actor.role});
  return {ok:true, site:s};
}

// ---------- Company GST configuration + Place of Supply (SOP §1/§2/§6) ----------
function setCompanyGSTConfig({newGSTIN, oldGSTIN, companyState, turnoverExceeds10CrPrecedingFY, actor}){
  if(!FINANCE_CONFIG_ROLES.has(actor.role)) return {ok:false, error:`Role "${actor.role}" cannot configure company GST settings.`};
  if(!DB.companyGSTConfig) DB.companyGSTConfig = {};
  const before = {...DB.companyGSTConfig};
  const nGst = newGSTIN!==undefined ? (newGSTIN?String(newGSTIN).trim().toUpperCase():null) : DB.companyGSTConfig.newGSTIN;
  const oGst = oldGSTIN!==undefined ? (oldGSTIN?String(oldGSTIN).trim().toUpperCase():null) : DB.companyGSTConfig.oldGSTIN;
  if(nGst && oGst && nGst===oGst) return {ok:false, error:'New GSTIN cannot be the same as the erstwhile partnership firm\'s old GSTIN — SOP §2.1 requires a distinct new GSTIN for Apple Tree Pvt Ltd, never reused for sales or purchases.'};
  DB.companyGSTConfig.newGSTIN = nGst; DB.companyGSTConfig.oldGSTIN = oGst;
  if(companyState!==undefined) DB.companyGSTConfig.companyState = companyState||null;
  if(turnoverExceeds10CrPrecedingFY!==undefined) DB.companyGSTConfig.turnoverExceeds10CrPrecedingFY = !!turnoverExceeds10CrPrecedingFY;
  DB.companyGSTConfig.gstinConfirmedBy = actor.id; DB.companyGSTConfig.gstinConfirmedAt = nowIso();
  save();
  logAudit({type:'CompanyGSTConfigSet', before, after:{...DB.companyGSTConfig}, userId:actor.id, role:actor.role});
  return {ok:true, config:DB.companyGSTConfig};
}
function setCustomerState({customerId, state, actor}){
  const c = DB.customers.find(x=>x.id===customerId); if(!c) return {ok:false, error:'Customer not found.'};
  const old = c.state; c.state = state||null; save();
  logAudit({type:'CustomerStateChanged', customerId, oldValue:old, newValue:c.state, userId:actor.id, role:actor.role});
  return {ok:true, customer:c};
}
// Advisory determination only — calcTax()/draftCustomerInvoice() already support CGST+SGST vs
// IGST via whichever taxCode is selected (GST18/GST5 = intra-state split, GST12 = inter-state
// IGST per SEED.taxCodes); this closes the gap of nothing telling the user WHICH to pick, without
// changing draftCustomerInvoice()'s signature or behavior for any existing caller.
function determinePlaceOfSupply({customerId, siteState}){
  if(!DB.companyGSTConfig || !DB.companyGSTConfig.companyState){
    return {ok:false, error:'Company state is not configured (Company GST Configuration) — Place of Supply cannot be determined. CONFIGURATION REQUIRED.'};
  }
  const customer = DB.customers.find(c=>c.id===customerId);
  const placeOfSupplyState = siteState || (customer && customer.state) || null;
  if(!placeOfSupplyState) return {ok:false, error:'Neither a site state nor the customer\'s own state is on record — record one to determine Place of Supply.'};
  const sameState = placeOfSupplyState.trim().toLowerCase() === DB.companyGSTConfig.companyState.trim().toLowerCase();
  return { ok:true, placeOfSupplyState, companyState:DB.companyGSTConfig.companyState, taxType: sameState?'INTRA_STATE':'INTER_STATE',
    recommendedTaxCodeHint: sameState ? 'Use an intra-state code (CGST+SGST split, e.g. GST18/GST5).' : 'Use an inter-state code (full IGST, e.g. GST12) — required even for a B2C individual customer (SOP §6).' };
}

// ---------- Purchase Requisition (SOP §1/§7) ----------
const PR_STATUSES = ['Draft','Submitted','Approved','Rejected','Converted','Cancelled'];
function createPurchaseRequisition({projectId, siteId, raisedBy, items, jobSiteReference, actor}){
  if(!Array.isArray(items) || !items.length) return {ok:false, error:'At least one requisition line is required.'};
  for(const it of items){ if(!it.description || !(+it.qty>0)) return {ok:false, error:'Every line needs a description and a positive quantity.'}; }
  if(siteId && !DB.sites.find(s=>s.id===siteId)) return {ok:false, error:'Unknown site.'};
  // Phase 33 (adversarial audit thread) Part U — PRs gate PO creation under the SOP §7 requirement
  // (see createPurchaseOrder); a collision could let one PR's approval be silently reused/confused
  // for another's PO conversion.
  const pr = { id:nextId(DB.purchaseRequisitions, 'PR-', 4), prNo:null, projectId:projectId||null, siteId:siteId||null,
    raisedBy:raisedBy||actor.id, items, jobSiteReference:jobSiteReference||'', status:'Draft',
    createdBy:actor.id, createdAt:nowIso(), approvedBy:null, approvedAt:null, convertedToPoId:null };
  DB.purchaseRequisitions.push(pr); save();
  logAudit({type:'PurchaseRequisitionCreated', prId:pr.id, projectId, siteId, userId:actor.id, role:actor.role});
  return {ok:true, purchaseRequisition:pr};
}
function submitPurchaseRequisition({id, actor}){
  const pr = DB.purchaseRequisitions.find(x=>x.id===id); if(!pr) return {ok:false, error:'PR not found.'};
  if(pr.status!=='Draft') return {ok:false, error:`Cannot submit — "${pr.status}", not Draft.`};
  pr.status='Submitted'; pr.prNo = nextDocNumber('PR'); save();
  logAudit({type:'PurchaseRequisitionSubmitted', prId:id, userId:actor.id, role:actor.role});
  return {ok:true, purchaseRequisition:pr};
}
function approvePurchaseRequisition({id, actor}){
  const pr = DB.purchaseRequisitions.find(x=>x.id===id); if(!pr) return {ok:false, error:'PR not found.'};
  if(pr.status!=='Submitted') return {ok:false, error:`Cannot approve — "${pr.status}", not Submitted.`};
  if(!PURCHASE_APPROVAL_ROLES.has(actor.role) && actor.role!=='SiteInCharge') return {ok:false, error:`Role "${actor.role}" is not authorized to approve a Purchase Requisition.`};
  if(pr.siteId && actor.role==='SiteInCharge'){
    const estTotal = pr.items.reduce((s,it)=>s+((+it.estimatedRate||0)*(+it.qty||0)),0);
    const limit = (DB.purchaseApprovalConfig&&DB.purchaseApprovalConfig.sitePettyDailyLimit) || 5000;
    if(estTotal > limit) return {ok:false, error:`Estimated value ₹${estTotal.toLocaleString('en-IN')} exceeds the site-petty daily limit of ₹${limit.toLocaleString('en-IN')} — must be approved by Purchase/FinanceManager/CEO/Admin, not Site In-charge alone (SOP §7).`};
  } else if(actor.role==='SiteInCharge'){
    return {ok:false, error:'Site In-charge can only approve site-scoped Purchase Requisitions within the site-petty limit.'};
  }
  if(pr.createdBy===actor.id && !['CEO','Admin'].includes(actor.role)) return {ok:false, error:'Segregation of duties: PR creator cannot also be PR approver.'};
  pr.status='Approved'; pr.approvedBy=actor.id; pr.approvedAt=nowIso(); save();
  logAudit({type:'PurchaseRequisitionApproved', prId:id, userId:actor.id, role:actor.role});
  return {ok:true, purchaseRequisition:pr};
}
function rejectPurchaseRequisition({id, reason, actor}){
  const pr = DB.purchaseRequisitions.find(x=>x.id===id); if(!pr) return {ok:false, error:'PR not found.'};
  if(pr.status!=='Submitted') return {ok:false, error:`Cannot reject — "${pr.status}".`};
  pr.status='Rejected'; pr.rejectReason=reason||''; save();
  logAudit({type:'PurchaseRequisitionRejected', prId:id, reason, userId:actor.id, role:actor.role});
  return {ok:true, purchaseRequisition:pr};
}

// ---------- Cash Payment Limit engine (SOP §4) ----------
function isCashPayment({paymentMethodId}){
  if(paymentMethodId){ const pm = DB.paymentMethods.find(p=>p.id===paymentMethodId); if(pm && pm.category==='Cash') return true; }
  return false;
}
function checkCashLimit({kind, amount, isTransporter, actor, overrideReason, party, paymentMethodId, projectId}){
  const limits = DB.cashLimits || {};
  let cap = null, label = '';
  if(kind==='expense'){ cap = isTransporter ? limits.dailyTransporterExpense : limits.dailyExpensePerPerson; label = isTransporter?'transporter cash payment (₹35,000/day cap)':'cash payment to a single person (₹10,000/day cap)'; }
  else if(kind==='loanDepositReceived'){ cap = limits.loanDepositReceived; label='cash loan/deposit received (₹20,000 cap, incl. Director payments)'; }
  else if(kind==='loanDepositRepaid'){ cap = limits.loanDepositRepaid; label='cash loan/deposit repayment (₹20,000 cap)'; }
  else if(kind==='receiptAggregate'){ cap = limits.cashReceiptAggregate; label='cash receipt aggregate (₹2,00,000/day/person/event cap)'; }
  if(cap==null) return {ok:true};
  if(+amount <= cap) return {ok:true};
  if(overrideReason && CASH_LIMIT_OVERRIDE_ROLES.has(actor.role)){
    DB.cashControlExceptions.push({ id:'CCE-'+String(DB.cashControlExceptions.length+1).padStart(4,'0'), kind, amount:+amount, cap, exceededBy:r2(+amount-cap), reason:overrideReason,
      party:party||null, paymentMethodId:paymentMethodId||null, projectId:projectId||null, date:new Date().toISOString().slice(0,10),
      authorizedBy:actor.id, authorizedByRole:actor.role, at:nowIso() });
    save();
    logAudit({type:'CashControlLimitOverridden', kind, amount:+amount, cap, reason:overrideReason, userId:actor.id, role:actor.role});
    return {ok:true, overridden:true};
  }
  return {ok:false, error:`Exceeds the SOP §4 cash limit for ${label} — ₹${(+amount).toLocaleString('en-IN')} vs the ₹${cap.toLocaleString('en-IN')} cap. SOP-stated consequence: the entire expenditure is disallowed as a tax deduction / a penalty equal to the amount applies. A FinanceManager/CEO/Admin must record an authorized overrideReason to proceed anyway (still logged and reported).`};
}

// ---------- Seller-wise cumulative tracking + Section 194Q flag (SOP §1) ----------
function fyStartDateFor(dateStr){
  const [y,m] = String(dateStr).slice(0,10).split('-').map(Number);
  const startYear = (m>=4) ? y : y-1;
  return `${startYear}-04-01`;
}
function sellerCumulativePurchases(vendorId, asOfDate){
  const fyStart = fyStartDateFor(asOfDate || new Date().toISOString().slice(0,10));
  const bills = DB.journalEntries.filter(je=>je.docCategory==='SupplierInvoice' && !je.reversalOfId && je.date>=fyStart && je.lines.some(l=>l.vendorId===vendorId));
  const relevantTransactions = bills.map(je=>{ const l=je.lines.find(x=>x.vendorId===vendorId && x.account===AP_ACCOUNT); return {voucherNo:je.voucherNo, date:je.date, amount:l?l.credit:0}; });
  const cumulativeThisFY = r2(relevantTransactions.reduce((s,t)=>s+t.amount,0));
  const threshold = (DB.tdsConfig && DB.tdsConfig.goods && DB.tdsConfig.goods.thresholdPerSellerFY) || 5000000;
  return { vendorId, cumulativeThisFY, threshold, thresholdUtilizationPct: threshold>0?r2(100*cumulativeThisFY/threshold):0, crosses194Q: cumulativeThisFY > threshold, fyStart, relevantTransactions };
}
// Phase 36 §2.2 — PAN is a real, structural PART of a GSTIN (characters 3-12), never a separately
// fabricated value: this DERIVES it where a real GSTIN is on record, and honestly says "Not on
// record" otherwise — no vendor's PAN is ever invented.
function panFromGstin(gstin){ return (gstin && gstin.length>=12) ? gstin.slice(2,12) : null; }
function sellerCumulativeReport(){
  return DB.vendors.map(v=>({...sellerCumulativePurchases(v.id), vendorName:v.name, pan:panFromGstin(v.gstNumber)})).filter(r=>r.cumulativeThisFY>0);
}

// ---------- TDS engine (SOP §3) — SOP-sourced values, NOT independently verified tax law ----------
const TDS_CATEGORIES = ['goods','contractorJobWork','transport','professional','rent','commission'];
function computeTDS({category, billAmount, vendorId, hasPAN, isIndividualOrHUF, ownsUpTo10Carriages, hasTransporterDeclaration}){
  if(!TDS_CATEGORIES.includes(category)) return {ok:false, error:`Unknown TDS category "${category}".`};
  const cfg = (DB.tdsConfig||{})[category];
  if(!cfg || !cfg.active) return {ok:true, applicable:false, tdsAmount:0, ratePct:0, note:'Category not active in TDS configuration.'};
  const amount = +billAmount||0;
  let applicable = false, ratePct = 0, note = 'SOP-sourced value — not independently verified as current tax law. Tax/Legal review required.';
  if(category==='goods'){
    const cumulative = sellerCumulativePurchases(vendorId).cumulativeThisFY + amount;
    applicable = cumulative > cfg.thresholdPerSellerFY;
    ratePct = hasPAN===false ? cfg.noPanRatePct : cfg.ratePct;
    if(!DB.companyGSTConfig || !DB.companyGSTConfig.turnoverExceeds10CrPrecedingFY){ applicable = false; note += ' NOT APPLIED — Section 194Q turnover threshold (preceding FY > ₹10Cr) is not confirmed in Company GST Configuration.'; }
  } else if(category==='contractorJobWork' || category==='transport'){
    applicable = amount > cfg.singleBillThreshold;
    ratePct = isIndividualOrHUF ? cfg.rateIndividualHUFPct : cfg.rateOtherPct;
    if(category==='transport' && cfg.exemptionRequiresPanAndDeclaration && hasPAN && hasTransporterDeclaration && ownsUpTo10Carriages){ applicable=false; ratePct=0; note='Exempt — transporter furnished PAN + declaration + owns ≤10 carriages (SOP §3).'; }
  } else if(category==='professional'){
    applicable = amount > cfg.thresholdPerAnnum; ratePct = cfg.ratePct;
    note += ` SOP distinguishes a lower ${cfg.technicalServicesRatePct}% rate for "technical services" — select explicitly if applicable, not auto-detected.`;
  } else if(category==='rent'){
    applicable = amount > cfg.thresholdPerAnnum; ratePct = cfg.rateLandBuildingPct;
    note += ` SOP distinguishes a lower ${cfg.ratePlantMachineryPct}% rate for Plant & Machinery rent — select explicitly if applicable.`;
  } else if(category==='commission'){
    applicable = amount > cfg.thresholdFY; ratePct = cfg.ratePct; note = cfg.note;
  }
  const tdsAmount = applicable ? r2(amount * ratePct/100) : 0;
  return {ok:true, applicable, ratePct, tdsAmount, category, note, sopSourced:true, taxLegalReviewRequired:true};
}
function tdsComplianceSummary(){
  const total = r2(DB.tdsDeductions.reduce((s,t)=>s+t.tdsAmount,0));
  const byCategory = {};
  DB.tdsDeductions.forEach(t=>{ byCategory[t.category]=r2((byCategory[t.category]||0)+t.tdsAmount); });
  const tdsPayableBalance = r2(allLines().filter(l=>l.account==='2300').reduce((s,l)=>s+l.credit-l.debit,0));
  return {totalDeducted:total, byCategory, tdsPayableBalance, deductionCount:DB.tdsDeductions.length,
    disclaimer:'Rates/thresholds are the Finance SOP\'s own stated values — not independently verified as current tax law. Tax/Legal review required before relying on this for filing.'};
}

// ---------- Site Material Subledger (SOP §7.2/§8) ----------
const MRS_STATUSES = ['Draft','Submitted','Approved','Rejected','Issued','Cancelled'];
function createSiteMaterialRequisition({siteId, projectId, jobWorkOrderRef, items, actor}){
  const site = DB.sites.find(s=>s.id===siteId); if(!site) return {ok:false, error:'Site not found.'};
  if(!Array.isArray(items) || !items.length) return {ok:false, error:'At least one line is required.'};
  for(const it of items){
    if(!it.materialId || !(+it.qty>0)) return {ok:false, error:'Every line needs a material and a positive quantity.'};
    if(!DB.materials.find(m=>m.id===it.materialId)) return {ok:false, error:`Unknown material "${it.materialId}".`};
  }
  const mrs = { id: nextId(DB.siteMaterialRequisitions, 'MRS-', 4), mrsNo:null, siteId, projectId:projectId||null, jobWorkOrderRef:jobWorkOrderRef||'',
    items, status:'Draft', createdBy:actor.id, createdAt:nowIso(), approvedBy:null, approvedAt:null, issuedAt:null, deliveryChallanId:null };
  DB.siteMaterialRequisitions.push(mrs); save();
  logAudit({type:'SiteMaterialRequisitionCreated', mrsId:mrs.id, siteId, userId:actor.id, role:actor.role});
  return {ok:true, mrs};
}
function submitSiteMaterialRequisition({id, actor}){
  const mrs = DB.siteMaterialRequisitions.find(x=>x.id===id); if(!mrs) return {ok:false, error:'MRS not found.'};
  if(mrs.status!=='Draft') return {ok:false, error:`Cannot submit — "${mrs.status}", not Draft.`};
  mrs.status='Submitted'; mrs.mrsNo = nextDocNumber('MRS'); save();
  logAudit({type:'SiteMaterialRequisitionSubmitted', mrsId:id, userId:actor.id, role:actor.role});
  return {ok:true, mrs};
}
function approveSiteMaterialRequisition({id, actor}){
  const mrs = DB.siteMaterialRequisitions.find(x=>x.id===id); if(!mrs) return {ok:false, error:'MRS not found.'};
  if(mrs.status!=='Submitted') return {ok:false, error:`Cannot approve — "${mrs.status}", not Submitted.`};
  if(!['SiteInCharge','Purchase','FinanceManager','CEO','Admin'].includes(actor.role)) return {ok:false, error:`Role "${actor.role}" cannot approve a Site Material Requisition.`};
  const estValue = mrs.items.reduce((s,it)=>{ const m=DB.materials.find(mt=>mt.id===it.materialId); return s + ((+it.qty||0)*((m&&m.standardCost)||0)); },0);
  const limit = (DB.purchaseApprovalConfig&&DB.purchaseApprovalConfig.sitePettyDailyLimit)||5000;
  if(actor.role==='SiteInCharge' && estValue>limit) return {ok:false, error:`Estimated value ₹${estValue.toLocaleString('en-IN')} exceeds the site-petty daily limit — must be approved by Purchase/FinanceManager/CEO/Admin (SOP §8).`};
  if(mrs.createdBy===actor.id && !['CEO','Admin'].includes(actor.role)) return {ok:false, error:'Segregation of duties: MRS creator cannot also be MRS approver.'};
  mrs.status='Approved'; mrs.approvedBy=actor.id; mrs.approvedAt=nowIso(); save();
  logAudit({type:'SiteMaterialRequisitionApproved', mrsId:id, userId:actor.id, role:actor.role});
  return {ok:true, mrs};
}
function rejectSiteMaterialRequisition({id, reason, actor}){
  const mrs = DB.siteMaterialRequisitions.find(x=>x.id===id); if(!mrs) return {ok:false, error:'MRS not found.'};
  if(mrs.status!=='Submitted') return {ok:false, error:`Cannot reject — "${mrs.status}".`};
  mrs.status='Rejected'; mrs.rejectReason=reason||''; save();
  logAudit({type:'SiteMaterialRequisitionRejected', mrsId:id, reason, userId:actor.id, role:actor.role});
  return {ok:true, mrs};
}
// Central Store Issue against an approved MRS — posts the EXISTING 'Issue' movement at the
// warehouse (no GL, exactly like any other raw postInventoryMovement call — GL only happens at
// actual consumption, in createMaterialIssue({siteId})) PLUS a new 'SiteReceipt' movement, and
// generates a Delivery Challan capturing transporter/vehicle (SOP §7.2/§8 Step 3).
function issueToSite({mrsId, warehouseId, actor, transporterName, vehicleNo, overrideReason}){
  { const _a = assertCanIssueToSite(actor); if(!_a.ok) return _a; }
  const mrs = DB.siteMaterialRequisitions.find(x=>x.id===mrsId); if(!mrs) return {ok:false, error:'MRS not found.'};
  if(mrs.status!=='Approved') return {ok:false, error:`Cannot issue — MRS status is "${mrs.status}", not Approved.`};
  // Phase 34 Part A — closed-project gate. This moves real inventory value (warehouse -> site)
  // tagged to mrs.projectId; the later cost RECOGNITION event (createMaterialIssue({siteId})
  // consuming from the site) was already gated in Phase 33, but the positioning move itself was not.
  { const _po = assertProjectOpenForPosting(mrs.projectId, actor, {overrideReason, action:'issue material to a site'}); if(!_po.ok) return _po; }
  if(!warehouseId || !DB.warehouses.find(w=>w.id===warehouseId)) return {ok:false, error:'A valid source warehouse is required.'};
  const errors = [];
  mrs.items.forEach(it=>{
    const material = DB.materials.find(m=>m.id===it.materialId);
    const available = getStockLevel(it.materialId, warehouseId);
    if(+it.qty > available + 0.001) errors.push(`${material?material.description:it.materialId}: only ${available} available in ${warehouseId}, requested ${it.qty}.`);
  });
  if(errors.length) return {ok:false, error:'Cannot issue: '+errors.join(' | ')};
  // Phase 38 migration — replaced the Phase 37 bespoke snapshot/catch with the central
  // withTransaction() primitive (same rationale as dispatchToJobWorker() above).
  return withTransaction(actor, {name:'issueToSite'}, () => {
    const movementIds = [];
    mrs.items.forEach(it=>{
      const material = DB.materials.find(m=>m.id===it.materialId);
      const rate = getMovingAverageRate(it.materialId, warehouseId);
      _fault('ISSUE_TO_SITE_MID_LOOP');
      postInventoryMovement({type:'Issue', materialId:it.materialId, qty:it.qty, uom:material.uom, warehouseId, projectId:mrs.projectId, sourceType:'SiteMaterialRequisition', sourceId:mrs.id, valuationRate:rate, actor, capability:'SITE_ISSUE' });
      const mv = postInventoryMovement({type:'SiteReceipt', materialId:it.materialId, qty:it.qty, uom:material.uom, warehouseId:null, siteId:mrs.siteId, projectId:mrs.projectId, sourceType:'SiteMaterialRequisition', sourceId:mrs.id, valuationRate:rate, actor, capability:'SITE_ISSUE' });
      movementIds.push(mv.id);
    });
    _fault('ISSUE_TO_SITE_AFTER_MOVEMENTS_BEFORE_DC');
    const dc = { id: nextId(DB.deliveryChallans, 'DC-', 4), dcNo:nextDocNumber('DC'), mrsId:mrs.id, siteId:mrs.siteId, warehouseId,
      items:mrs.items, transporterName:transporterName||'', vehicleNo:vehicleNo||'', movementIds, status:'Dispatched',
      createdBy:actor.id, createdAt:nowIso() };
    DB.deliveryChallans.push(dc);
    mrs.status='Issued'; mrs.issuedAt=nowIso(); mrs.deliveryChallanId=dc.id;
    logAudit({type:'SiteMaterialIssued', mrsId:mrs.id, dcId:dc.id, siteId:mrs.siteId, userId:actor.id, role:actor.role});
    return {ok:true, deliveryChallan:dc, mrs};
  });
}
// Site Material Receipt Note — site-side confirmation, notes discrepancy vs the challan (SOP §8
// Step 4: "every discrepancy is investigated BEFORE material is used").
function createSiteMaterialReceipt({deliveryChallanId, receivedItems, actor}){
  const dc = DB.deliveryChallans.find(x=>x.id===deliveryChallanId); if(!dc) return {ok:false, error:'Delivery Challan not found.'};
  if(DB.siteMaterialReceipts.find(r=>r.deliveryChallanId===deliveryChallanId)) return {ok:false, error:'A Site Material Receipt already exists for this Delivery Challan.'};
  const discrepancies = [];
  (receivedItems||[]).forEach((ri,idx)=>{
    const dcLine = dc.items[idx];
    if(dcLine && +ri.qtyReceived !== +dcLine.qty) discrepancies.push({line:idx, materialId:dcLine.materialId, challanQty:dcLine.qty, receivedQty:+ri.qtyReceived, diff:r2(+dcLine.qty-(+ri.qtyReceived))});
  });
  const smr = { id:'SMR-'+String(DB.siteMaterialReceipts.length+1).padStart(4,'0'), smrNo:nextDocNumber('SMR'), deliveryChallanId, siteId:dc.siteId,
    receivedItems, discrepancies, receivedBy:actor.id, receivedAt:nowIso() };
  DB.siteMaterialReceipts.push(smr); save();
  if(discrepancies.length) logAudit({type:'SiteMaterialReceiptDiscrepancy', smrId:smr.id, dcId:dc.id, discrepancies, userId:actor.id, role:actor.role});
  return {ok:true, smr, hasDiscrepancy: discrepancies.length>0};
}
// ---------- Site Return (Targeted P1 Remediation phase) ----------
// A real, standalone transaction — NOT simulated with Inventory Adjustment (that function has no
// siteId parameter at all and could never represent this). Reverses issueToSite()'s own movement
// pair for a Usable-condition return: a SiteReturn movement decrements the site's pooled ledger
// (getSiteStockLevel/getSiteMovingAverageRate already handle this type correctly — it has been
// present in their formulas since Phase 33/34, waiting for a real poster) and a paired Receipt
// movement restores the SAME value to the warehouse, with ZERO GL effect — exactly matching
// issueToSite()'s own custody-only design (material was never expensed while at the site; it still
// isn't, it has simply moved back). A Damaged/Lost line is different: that material is genuinely
// gone, so no warehouse Receipt is posted for it, and its value is written off via the EXACT SAME
// Dr 5300 (Inventory Adjustment/Loss) / Cr 1200 (Inventory) pairing already used by Damage Reports
// and the Job Work Scrap Destroyed/Written-Off fix — no new account invented, no parallel
// accounting mechanism. The site ledger is POOLED (per site+material), the same design
// SiteConsumption already uses — there is no per-shipment/per-Delivery-Challan lot tracking
// anywhere in this codebase to tie a return back to one specific dispatch, so this doesn't invent
// one either; a return is simply bounded by whatever is currently in the pooled site balance.
const SITE_RETURN_CONDITIONS = ['Usable','Damaged','Lost'];
function returnFromSite({siteId, warehouseId, projectId, returnedItems, reason, actor, overrideReason}){
  { const _a = assertCanReturnFromSite(actor); if(!_a.ok) return _a; }
  if(!siteId || !DB.sites.find(s=>s.id===siteId)) return {ok:false, error:'A valid site is required.'};
  if(!warehouseId || !DB.warehouses.find(w=>w.id===warehouseId)) return {ok:false, error:'A valid destination warehouse is required.'};
  if(!Array.isArray(returnedItems) || !returnedItems.length) return {ok:false, error:'At least one return line is required.'};
  // Closed-project gate, same convention as issueToSite()/createMaterialIssue() — a Usable return
  // has no GL effect of its own but still moves real inventory value; a Damaged/Lost line has a
  // direct GL effect, so this gate applies unconditionally whenever a project is given.
  if(projectId){ const _po = assertProjectOpenForPosting(projectId, actor, {overrideReason, action:'return material from a site'}); if(!_po.ok) return _po; }
  const errors = [];
  returnedItems.forEach(it=>{
    if(!it.materialId || !DB.materials.find(m=>m.id===it.materialId)){ errors.push(`Unknown material "${it.materialId}".`); return; }
    { const v = assertPositiveFiniteNumber(it.qty, `Quantity for ${it.materialId}`); if(!v.ok){ errors.push(v.error); return; } }
    if(!SITE_RETURN_CONDITIONS.includes(it.condition)){ errors.push(`${it.materialId}: condition must be one of ${SITE_RETURN_CONDITIONS.join(', ')}.`); return; }
    const available = getSiteStockLevel(it.materialId, siteId);
    if(+it.qty > available + 0.001) errors.push(`${it.materialId}: only ${available} available at site "${siteId}" — cannot return more than is currently held there.`);
  });
  if(errors.length) return {ok:false, error:'Cannot return: '+errors.join(' | ')};

  const lossLines = returnedItems.filter(it=>it.condition!=='Usable');
  let totalLossValue = 0;
  lossLines.forEach(it=>{ totalLossValue = r2(totalLossValue + r2((+it.qty)*getSiteMovingAverageRate(it.materialId, siteId))); });
  // GL attempted FIRST, before any movement — same "attempt the fallible step first" convention as
  // every other GL-then-inventory function in this file (GRN, Material Issue, Job Work Scrap).
  let glResult = {ok:true};
  if(totalLossValue>0.01){
    glResult = postJournalEntry({ date:new Date().toISOString().slice(0,10),
      narration:`Site Return — Damaged/Lost material at site ${siteId}${reason?' — '+reason:''}`,
      sourceType:'SiteReturnLoss', sourceId:siteId, docCategory:'SiteReturnLoss',
      lines:[ {account:'5300', debit:totalLossValue, credit:0, projectId:projectId||null}, {account:'1200', debit:0, credit:totalLossValue, projectId:projectId||null} ],
      actor, capability:'SITE_RETURN', overrideReason });
    if(!glResult.ok){
      // ERP-059B — durableFailureAudit, see ERP-059B-TRANSACTION-DESIGN.md.
      return {ok:false, error:glResult.error, durableFailureAudit:{type:'SiteReturnRejected', siteId, warehouseId, glError:glResult.error}};
    }
  }
  const _jesLenBeforeReturn = DB.journalEntries.length;
  try {
    return withTransaction(actor, {name:'returnFromSite'}, () => {
      const movementIds = [];
      returnedItems.forEach(it=>{
        const material = DB.materials.find(m=>m.id===it.materialId);
        const rate = getSiteMovingAverageRate(it.materialId, siteId);
        _fault('SITE_RETURN_MID_LOOP');
        const srMv = postInventoryMovement({type:'SiteReturn', materialId:it.materialId, qty:+it.qty, uom:material.uom, warehouseId:null, siteId, projectId:projectId||null, sourceType:'SiteReturn', sourceId:null, valuationRate:rate, actor, capability:'SITE_RETURN'});
        movementIds.push(srMv.id);
        if(it.condition==='Usable'){
          const rcMv = postInventoryMovement({type:'Receipt', materialId:it.materialId, qty:+it.qty, uom:material.uom, warehouseId, projectId:projectId||null, sourceType:'SiteReturn', sourceId:srMv.id, valuationRate:rate, actor, capability:'SITE_RETURN'});
          movementIds.push(rcMv.id);
        }
      });
      _fault('SITE_RETURN_AFTER_MOVEMENTS_BEFORE_DOC');
      const sr = { id: nextId(DB.siteReturns, 'SRET-', 4), docNo: nextDocNumber('SRET'), siteId, warehouseId, projectId:projectId||null,
        items: returnedItems.map(it=>({materialId:it.materialId, qty:+it.qty, condition:it.condition})),
        reason:reason||'', totalLossValue:r2(totalLossValue), glEntryId: glResult.entry?glResult.entry.id:null,
        movementIds, createdBy:actor.id, createdAt:nowIso() };
      DB.siteReturns.push(sr); save();
      logAudit({type:'SiteReturnRecorded', siteReturnId:sr.id, siteId, warehouseId, projectId:projectId||null, items:sr.items, totalLossValue:sr.totalLossValue, glEntryId:sr.glEntryId, userId:actor.id, role:actor.role});
      return {ok:true, siteReturn:sr};
    });
  } catch(e) {
    if(totalLossValue>0.01) DB.journalEntries.length = _jesLenBeforeReturn; // rolls back the GL entry posted above, mirroring the GRN/Material-Issue/Job-Work-Scrap pattern
    throw e;
  }
}
function siteMaterialReconciliationReport(siteId){
  const sites = siteId ? DB.sites.filter(s=>s.id===siteId) : DB.sites;
  return sites.map(s=>{
    const materialIds = [...new Set(DB.inventoryMovements.filter(m=>m.siteId===s.id).map(m=>m.materialId))];
    const lines = materialIds.map(materialId=>{
      const material = DB.materials.find(m=>m.id===materialId);
      const received = r2(DB.inventoryMovements.filter(m=>m.siteId===s.id && m.materialId===materialId && m.type==='SiteReceipt').reduce((s2,m)=>s2+m.qty,0));
      const consumed = r2(DB.inventoryMovements.filter(m=>m.siteId===s.id && m.materialId===materialId && m.type==='SiteConsumption').reduce((s2,m)=>s2+m.qty,0));
      return {materialId, description:material?material.description:materialId, received, consumed, closing:r2(received-consumed)};
    });
    return {site:s, lines};
  });
}

// ---------- Payment maker-checker + (explicitly "Not Finalised") approval matrix (SOP §9) ----------
function paymentApprovalRoleFor(amount){
  const matrix = DB.paymentApprovalMatrix || {tiers:[]};
  const tier = (matrix.tiers||[]).find(t=>t.upTo==null || amount<=t.upTo);
  return tier ? tier.role : null;
}
// Phase 36 §2.4 — a real Draft->Review->Approved workflow for the Payment Approval Matrix.
// `finalised` becomes true ONLY through approvePaymentApprovalMatrix() below — never as a side
// effect of editing tiers (editing always drops it back to Draft, since an edited matrix is no
// longer the one that was approved).
function setPaymentApprovalTiers({tiers, actor}){
  if(!FINANCE_CONFIG_ROLES.has(actor.role)) return {ok:false, error:`Role "${actor.role}" cannot configure the Payment Approval Matrix.`};
  const m = DB.paymentApprovalMatrix;
  m.tiers = tiers; m.finalised = false; m.status = 'Draft'; m.approvedBy = null; m.approvedDate = null; m.approvalReference = null;
  save();
  logAudit({type:'PaymentApprovalMatrixTiersChanged', tiers, userId:actor.id, role:actor.role});
  return {ok:true, matrix:m};
}
function submitPaymentApprovalMatrixForReview({actor}){
  if(!FINANCE_CONFIG_ROLES.has(actor.role)) return {ok:false, error:`Role "${actor.role}" cannot submit the Payment Approval Matrix for review.`};
  const m = DB.paymentApprovalMatrix;
  if(m.status!=='Draft') return {ok:false, error:`Cannot submit — status is "${m.status}", not Draft.`};
  m.status = 'Review'; save();
  logAudit({type:'PaymentApprovalMatrixSubmittedForReview', userId:actor.id, role:actor.role});
  return {ok:true, matrix:m};
}
function approvePaymentApprovalMatrix({approvalReference, actor}){
  // Board-level policy sign-off — deliberately a NARROWER gate than ordinary Finance
  // configuration (SOP_FINANCE_ROLES includes FinanceManager; this does not), because this is the
  // one action that converts an illustrative SOP table into binding company policy.
  if(!['CEO','Admin'].includes(actor.role)) return {ok:false, error:`Role "${actor.role}" cannot approve the Payment Approval Matrix — this is a Board-level policy decision (CEO/Admin only), not a routine Finance configuration change.`};
  const m = DB.paymentApprovalMatrix;
  if(m.status!=='Review') return {ok:false, error:`Cannot approve — status is "${m.status}", not "Review". Submit it for review first.`};
  if(!approvalReference || !String(approvalReference).trim()) return {ok:false, error:'An approval reference (e.g. a Board Resolution number) is required — this can never be approved silently.'};
  m.status = 'Approved'; m.finalised = true; m.approvedBy = actor.id; m.approvedDate = new Date().toISOString().slice(0,10);
  m.approvalReference = approvalReference; m.version = (m.version||1);
  save();
  logAudit({type:'PaymentApprovalMatrixApproved', approvalReference, version:m.version, userId:actor.id, role:actor.role});
  return {ok:true, matrix:m};
}
// ---------- Phase 12 — PO Approval Authority Matrix governance (identical Draft->Review->
// Approved shape to the Payment Approval Matrix immediately above — same discipline, same
// board-level sign-off gate, deliberately not a new/different workflow pattern). Configuring
// this (Admin included) is System Administration Authority; it does NOT, by itself, grant the
// configuring user any Purchase Order financial approval authority — those are separate,
// exactly as the Phase 12 brief requires. ---------------------------------------------------
function setPOApprovalAuthorityMatrix({roles, actor}){
  if(!FINANCE_CONFIG_ROLES.has(actor.role)) return {ok:false, error:`Role "${actor.role}" cannot configure the PO Approval Authority Matrix.`};
  if(!roles || typeof roles!=='object') return {ok:false, error:'roles object is required.'};
  for(const [role, cfg] of Object.entries(roles)){
    if(!cfg || typeof cfg!=='object') return {ok:false, error:`Invalid config for role "${role}".`};
    if(cfg.selfApprovalLimit!=null && !(Number.isFinite(+cfg.selfApprovalLimit) && +cfg.selfApprovalLimit>=0)) return {ok:false, error:`selfApprovalLimit for "${role}" must be a non-negative number or null.`};
    if(typeof cfg.financialApprovalAuthority!=='boolean' || typeof cfg.selfApprovalAllowed!=='boolean') return {ok:false, error:`financialApprovalAuthority and selfApprovalAllowed for "${role}" must be true/false.`};
  }
  const m = DB.poApprovalAuthorityMatrix;
  m.roles = roles; m.finalised = false; m.status = 'Draft — edited, pending re-approval'; m.approvedBy = null; m.approvedDate = null; m.approvalReference = null;
  save();
  logAudit({type:'POApprovalAuthorityMatrixChanged', roles, userId:actor.id, role:actor.role});
  return {ok:true, matrix:m};
}
function submitPOApprovalAuthorityMatrixForReview({actor}){
  if(!FINANCE_CONFIG_ROLES.has(actor.role)) return {ok:false, error:`Role "${actor.role}" cannot submit the PO Approval Authority Matrix for review.`};
  const m = DB.poApprovalAuthorityMatrix;
  if(!String(m.status||'').startsWith('Draft')) return {ok:false, error:`Cannot submit — status is "${m.status}", not Draft.`};
  m.status = 'Review'; save();
  logAudit({type:'POApprovalAuthorityMatrixSubmittedForReview', userId:actor.id, role:actor.role});
  return {ok:true, matrix:m};
}
function approvePOApprovalAuthorityMatrix({approvalReference, actor}){
  // Same narrower Board-level gate as approvePaymentApprovalMatrix — converting this from an
  // illustrative/default config into binding self-approval policy is a management decision, not
  // a routine Finance edit. Approving this matrix is administration authority only; it never, by
  // itself, adds financial approval authority for the approving user.
  if(!['CEO','Admin'].includes(actor.role)) return {ok:false, error:`Role "${actor.role}" cannot approve the PO Approval Authority Matrix — this is a Board-level policy decision (CEO/Admin only).`};
  const m = DB.poApprovalAuthorityMatrix;
  if(m.status!=='Review') return {ok:false, error:`Cannot approve — status is "${m.status}", not "Review". Submit it for review first.`};
  if(!approvalReference || !String(approvalReference).trim()) return {ok:false, error:'An approval reference (e.g. a Board Resolution number) is required — this can never be approved silently.'};
  m.status = 'Approved'; m.finalised = true; m.approvedBy = actor.id; m.approvedDate = new Date().toISOString().slice(0,10);
  m.approvalReference = approvalReference; m.version = (m.version||1)+1;
  save();
  logAudit({type:'POApprovalAuthorityMatrixApproved', approvalReference, version:m.version, userId:actor.id, role:actor.role});
  return {ok:true, matrix:m};
}
function createPaymentRequest({vendorId, invoiceEntryId, amount, narration, actor}){
  const openItem = supplierOpenItems(vendorId).find(i=>i.entryId===invoiceEntryId);
  if(!openItem) return {ok:false, error:'That bill is not an open item for this vendor.'};
  // Phase 17 CRITICAL FIX — same NaN-through-truthy-string hole found repository-wide this phase.
  // Worse here than most instances: a NaN amount would also feed paymentApprovalRoleFor(NaN)
  // below, and since every NaN comparison is false, it could silently route to the LOWEST
  // approval tier instead of correctly requiring the tier a real (unparseable) amount might need.
  { const _v = assertPositiveFiniteNumber(amount, 'Amount'); if(!_v.ok) return _v; }
  if(+amount > openItem.open + 0.01) return {ok:false, error:`Amount exceeds the open balance of ₹${openItem.open.toLocaleString('en-IN')}.`};
  // Phase 33 (adversarial audit thread) Part U — a real payment-workflow document; a collision
  // could route/approve the wrong vendor's payment request.
  const req = { id:nextId(DB.paymentApprovals, 'PAYREQ-', 4), vendorId, invoiceEntryId, amount:+amount, narration:narration||'',
    status:'PendingApproval', requiredApprovalRole: paymentApprovalRoleFor(+amount), maker:actor.id, makerRole:actor.role,
    checker:null, checkerRole:null, approvedAt:null, executedBy:null, executedAt:null, paymentEntryId:null, createdAt:nowIso() };
  DB.paymentApprovals.push(req); save();
  logAudit({type:'PaymentRequestCreated', requestId:req.id, vendorId, amount:+amount, requiredApprovalRole:req.requiredApprovalRole, userId:actor.id, role:actor.role});
  return {ok:true, paymentRequest:req};
}
function approvePaymentRequest({id, actor}){
  const req = DB.paymentApprovals.find(x=>x.id===id); if(!req) return {ok:false, error:'Payment request not found.'};
  if(req.status!=='PendingApproval') return {ok:false, error:`Cannot approve — "${req.status}".`};
  if(req.maker===actor.id) return {ok:false, error:'Maker-checker: the person who raised this payment request cannot also approve it.'};
  if(req.requiredApprovalRole==='Director (CEO)' && !['CEO','Admin'].includes(actor.role)){
    return {ok:false, error:`This ₹${req.amount.toLocaleString('en-IN')} payment requires Director (CEO) approval per the (Not Finalised) SOP illustrative approval matrix.`};
  }
  req.status='Approved'; req.checker=actor.id; req.checkerRole=actor.role; req.approvedAt=nowIso(); save();
  logAudit({type:'PaymentRequestApproved', requestId:id, userId:actor.id, role:actor.role});
  return {ok:true, paymentRequest:req};
}
function rejectPaymentRequest({id, reason, actor}){
  const req = DB.paymentApprovals.find(x=>x.id===id); if(!req) return {ok:false, error:'Payment request not found.'};
  if(req.status!=='PendingApproval') return {ok:false, error:`Cannot reject — "${req.status}".`};
  req.status='Rejected'; req.rejectReason=reason||''; save();
  logAudit({type:'PaymentRequestRejected', requestId:id, reason, userId:actor.id, role:actor.role});
  return {ok:true, paymentRequest:req};
}
// Execution is a THIRD, distinct step from maker and checker ("at least 2, ideally 3, different
// people" — SOP §9). Internally calls the EXISTING postSupplierPayment() — no second posting path.
//
// Phase 43 CRITICAL FIX — found via call-graph analysis (this function was invisible to every
// prior phase's regression battery, which always exercised postSupplierPayment() through its OWN
// modern route, /api/ap/payment, never through this one): this function is reached ONLY via a
// legacy if-block route (/api/payment-requests/:id/execute), so it runs with NO active
// withTransaction() boundary. postSupplierPayment() does not open its own transaction either — it
// was written assuming its caller's ROUTE already provides one, true for its own modern route but
// NOT true for this second, independent caller. Under Phase 38's enforce-mode write-point guard,
// this meant `postJournalEntry()`'s internal `DB.journalEntries.push()` was being BLOCKED outright
// — PROVEN LIVE: every real attempt to execute an approved payment request failed with a generic
// 500, making the entire SOP §9 maker-checker-executor payment workflow non-functional, not merely
// theoretically at risk. (Before Phase 38's enforce-mode default, this same call chain would have
// been the exact "orphaned GL, no compensating rollback" defect class instead — enforce mode
// converted a silent corruption risk into a loud, total failure, which is the safer of the two but
// still a real regression this phase closes properly.) Fixed by wrapping the whole function in the
// central withTransaction() primitive, restoring both the transaction boundary AND, as a direct
// consequence, transactional consistency between the payment posting and the request's own status
// update (a second, real gap: without this, a failure between a successful payment and the status
// update would leave `req.status` stuck at "Approved" — the exact shape that lets a client retry
// re-execute postSupplierPayment() a second time and create a genuine duplicate payment).
function executePaymentRequest({id, date, paymentMethodId, bankAccountId, overrideReason, tdsCategory, tdsOptions, isTransporterPayment, actor}){
  const req = DB.paymentApprovals.find(x=>x.id===id); if(!req) return {ok:false, error:'Payment request not found.'};
  if(req.status!=='Approved') return {ok:false, error:`Cannot execute — "${req.status}", not Approved.`};
  if([req.maker, req.checker].includes(actor.id) && !['CEO','Admin'].includes(actor.role)){
    return {ok:false, error:'Maker-checker: execution must be a third person distinct from the maker and the approver (or CEO/Admin), per SOP §9.'};
  }
  return withTransaction(actor, {name:'executePaymentRequest'}, () => {
    const result = postSupplierPayment({vendorId:req.vendorId, invoiceEntryId:req.invoiceEntryId, amount:req.amount, date, narration:req.narration,
      actor, overrideReason, paymentMethodId, bankAccountId, tdsCategory, tdsOptions, isTransporterPayment});
    if(!result.ok) return result;
    _fault('PAYREQ_EXECUTE_AFTER_PAYMENT_BEFORE_STATUS');
    req.status='Executed'; req.executedBy=actor.id; req.executedAt=nowIso(); req.paymentEntryId=result.entry.id;
    logAudit({type:'PaymentRequestExecuted', requestId:id, entryId:result.entry.id, userId:actor.id, role:actor.role});
    return {ok:true, paymentRequest:req, entry:result.entry, clearing:result.clearing, tds:result.tds};
  });
}

// ---------- Petty Cash / Imprest (SOP §9.2) ----------
function createPettyCashFloat({siteId, custodianUserId, floatAmount, actor}){
  const site = DB.sites.find(s=>s.id===siteId); if(!site) return {ok:false, error:'Site not found.'};
  if(DB.pettyCashFloats.find(f=>f.siteId===siteId && f.active)) return {ok:false, error:'An active petty cash float already exists for this site.'};
  const amt = floatAmount!=null ? +floatAmount : (DB.pettyCashDefaultFloat||10000);
  const pcf = { id: nextId(DB.pettyCashFloats, 'PCF-', 4), pcfNo:nextDocNumber('PCF'), siteId, custodianUserId:custodianUserId||null,
    floatAmount:amt, active:true, createdBy:actor.id, createdAt:nowIso() };
  DB.pettyCashFloats.push(pcf); save();
  logAudit({type:'PettyCashFloatCreated', pcfId:pcf.id, siteId, floatAmount:amt, userId:actor.id, role:actor.role});
  return {ok:true, pettyCashFloat:pcf};
}
function recordPettyCashVoucher({pettyCashFloatId, amount, category, billReference, description, date, actor, overrideReason}){
  const pcf = DB.pettyCashFloats.find(x=>x.id===pettyCashFloatId); if(!pcf) return {ok:false, error:'Petty cash float not found.'};
  if(!pcf.active) return {ok:false, error:'This petty cash float is not active.'};
  if(!billReference) return {ok:false, error:'An original bill reference is required for every petty cash voucher (SOP §9.2) — no unconditional top-up.'};
  const amt = r2(+amount||0); if(amt<=0) return {ok:false, error:'Amount must be positive.'};
  const cashCheck = checkCashLimit({kind:'expense', amount:amt, isTransporter:false, actor, overrideReason, party:pcf.siteId});
  if(!cashCheck.ok) return cashCheck;
  const vouchersSoFar = r2(DB.pettyCashVouchers.filter(v=>v.pettyCashFloatId===pettyCashFloatId).reduce((s,v)=>s+v.amount,0));
  if(vouchersSoFar + amt > pcf.floatAmount + 0.01) return {ok:false, error:`Voucher total ₹${(vouchersSoFar+amt).toLocaleString('en-IN')} would exceed the sanctioned float of ₹${pcf.floatAmount.toLocaleString('en-IN')} — replenish the float before recording further vouchers.`};
  const v = { id: nextId(DB.pettyCashVouchers, 'PCV-', 4), pcvNo:nextDocNumber('PCV'), pettyCashFloatId, amount:amt, category:category||'Other',
    billReference, description:description||'', date:date||new Date().toISOString().slice(0,10), replenishedEntryId:null, createdBy:actor.id, createdAt:nowIso() };
  DB.pettyCashVouchers.push(v); save();
  logAudit({type:'PettyCashVoucherRecorded', pcvId:v.id, pettyCashFloatId, amount:amt, userId:actor.id, role:actor.role});
  return {ok:true, voucher:v};
}
function pettyCashReconciliation(pettyCashFloatId){
  const pcf = DB.pettyCashFloats.find(x=>x.id===pettyCashFloatId); if(!pcf) return {ok:false, error:'Petty cash float not found.'};
  const vouchers = DB.pettyCashVouchers.filter(v=>v.pettyCashFloatId===pettyCashFloatId);
  const vouchersTotal = r2(vouchers.reduce((s,v)=>s+v.amount,0));
  return {ok:true, pettyCashFloat:pcf, vouchers, vouchersTotal, expectedCashOnHand:r2(pcf.floatAmount-vouchersTotal), balanced: r2(pcf.floatAmount-vouchersTotal)>=-0.01};
}
function replenishPettyCashFloat({pettyCashFloatId, bankAccountId, actor}){
  { const _a = assertCanReplenishPettyCash(actor); if(!_a.ok) return _a; }
  const pcf = DB.pettyCashFloats.find(x=>x.id===pettyCashFloatId); if(!pcf) return {ok:false, error:'Petty cash float not found.'};
  const unreplenished = DB.pettyCashVouchers.filter(v=>v.pettyCashFloatId===pettyCashFloatId && !v.replenishedEntryId);
  const total = r2(unreplenished.reduce((s,v)=>s+v.amount,0));
  if(total<=0) return {ok:false, error:'No outstanding vouchers to replenish.'};
  let bankGlAccount='1000';
  if(bankAccountId){ const acct=DB.bankAccounts.find(b=>b.id===bankAccountId); if(!acct) return {ok:false, error:'Unknown bank/cash account.'}; bankGlAccount=acct.glAccount; }
  const site = DB.sites.find(s=>s.id===pcf.siteId);
  const glResult = postJournalEntry({ date:new Date().toISOString().slice(0,10), narration:`Petty Cash Replenishment — ${site?site.name:pcf.siteId}`,
    sourceType:'PettyCashReplenishment', voucherNo:nextDocNumber('PCV'), docCategory:'PettyCashReplenishment',
    lines:[ {account:'5200', debit:total, credit:0, projectId:null}, {account:bankGlAccount, debit:0, credit:total} ],
    actor, capability:'PETTY_CASH_REPLENISH' });
  if(!glResult.ok) return glResult;
  unreplenished.forEach(v=>{ v.replenishedEntryId = glResult.entry.id; });
  save();
  logAudit({type:'PettyCashReplenished', pcfId:pettyCashFloatId, total, userId:actor.id, role:actor.role});
  return {ok:true, glEntry:glResult.entry, replenishedAmount:total, voucherCount:unreplenished.length};
}

// ---------- SOP Compliance Dashboard ----------
function cashControlExceptionsReport(){ return DB.cashControlExceptions; }

// ============================================================================================
// PHASE 34 — Job Work / APOB Module (SOP §2.2, Section 143)
// Reuses the EXACT additive-dimension pattern Phase 33 used for the site material subledger: a
// new `jobWorkerId` field on the SAME existing inventoryMovements ledger, plus new movement types
// ('JobWorkIssue'/'JobWorkReceipt'/'JobWorkReturn'/'JobWorkScrap'/'JobWorkDirectDispatch') that
// getStockLevel()/getSiteStockLevel() both silently ignore (neither reduce() branch recognizes
// them — verified, not assumed). No second inventory engine. No GL posting at dispatch or
// return — sending material to a job worker and getting it back is a Delivery Challan movement
// (Rule 55(1)(c)), never a sale; Apple Tree's own inventory VALUE is completely unaffected by
// WHERE the goods physically sit. A job-work PROCESSING CHARGE billed by the job worker is a
// completely separate, already-existing transaction (an ordinary supplier bill/payment — Phase
// 33's 'contractorJobWork' TDS category already covers it) — never invented or auto-created here.
// ============================================================================================
function createJobWorker({name, address, gstin, registered, pan, state, actor}){
  if(!name) return {ok:false, error:'Job Worker name is required.'};
  const jw = { id:'JW-'+String(DB.jobWorkers.length+1).padStart(3,'0'), name, address:address||'',
    gstin: gstin?String(gstin).trim().toUpperCase():null, registered:!!registered, pan:pan||null, state:state||null,
    active:true, createdBy:actor.id, createdAt:nowIso() };
  DB.jobWorkers.push(jw); save();
  logAudit({type:'JobWorkerCreated', jobWorkerId:jw.id, name, registered:jw.registered, userId:actor.id, role:actor.role});
  return {ok:true, jobWorker:jw};
}
function setJobWorkerActive({jobWorkerId, active, actor}){
  const jw = DB.jobWorkers.find(x=>x.id===jobWorkerId); if(!jw) return {ok:false, error:'Job Worker not found.'};
  jw.active = !!active; save();
  logAudit({type:'JobWorkerActiveSet', jobWorkerId, active:jw.active, userId:actor.id, role:actor.role});
  return {ok:true, jobWorker:jw};
}
function getJobWorkerStockLevel(materialId, jobWorkerId){
  return DB.inventoryMovements.filter(m=>m.materialId===materialId && m.jobWorkerId===jobWorkerId)
    .reduce((s,m)=>{
      if(m.type==='JobWorkReceipt') return s+m.qty;
      if(m.type==='JobWorkReturn' || m.type==='JobWorkScrap' || m.type==='JobWorkDirectDispatch') return s-m.qty;
      return s;
    }, 0);
}
const JOB_WORK_ORDER_STATUSES = ['Dispatched','PartiallyReturned','Returned','DirectDispatched'];
function dispatchToJobWorker({projectId, customerId, jobWorkerId, warehouseId, lines, expectedReturnDate, isCapitalGoods, purpose, jobWorkReference, transporterName, vehicleNo, actor, overrideReason}){
  { const _a = assertCanDispatchToJobWorker(actor); if(!_a.ok) return _a; }
  // Phase 34 Part A — closed-project gate. Moves real inventory value (own stock, still an asset
  // of Apple Tree) out to a job worker's premises, tagged to projectId.
  { const _po = assertProjectOpenForPosting(projectId, actor, {overrideReason, action:'dispatch material to a job worker'}); if(!_po.ok) return _po; }
  const jw = DB.jobWorkers.find(x=>x.id===jobWorkerId); if(!jw) return {ok:false, error:'Job Worker not found.'};
  if(jw.active===false) return {ok:false, error:`Job Worker "${jw.name}" is inactive.`};
  if(!warehouseId || !DB.warehouses.find(w=>w.id===warehouseId)) return {ok:false, error:'A valid source warehouse is required.'};
  if(!Array.isArray(lines) || !lines.length) return {ok:false, error:'At least one material line is required.'};
  const errors = [];
  lines.forEach(l=>{
    if(!l.materialId || !(+l.qty>0)){ errors.push('Every line needs a material and a positive quantity.'); return; }
    if(!DB.materials.find(m=>m.id===l.materialId)){ errors.push(`Unknown material "${l.materialId}".`); return; }
    const available = getStockLevel(l.materialId, warehouseId);
    if(+l.qty > available + 0.001) errors.push(`${l.materialId}: only ${available} available in ${warehouseId}, requested ${l.qty}.`);
  });
  if(errors.length) return {ok:false, error:'Cannot dispatch: '+errors.join(' | ')};
  // Phase 38 migration — this function is still reached only via a legacy if-block route
  // (server.js never wraps it in a transaction at dispatch), so it now opens its OWN boundary via
  // the central withTransaction() primitive instead of the bespoke snapshot/catch block Phase 37
  // wrote for it — replacing ad-hoc per-function rollback with the ONE authoritative mechanism,
  // per the Phase 38 mission's explicit "do not leave old helper + new manager coexisting" rule.
  return withTransaction(actor, {name:'dispatchToJobWorker'}, () => {
    const movementIds = []; let totalValue = 0;
    lines.forEach(l=>{
      const material = DB.materials.find(m=>m.id===l.materialId);
      const rate = getMovingAverageRate(l.materialId, warehouseId);
      // DEFECT FOUND & FIXED (Phase 34 self-test): this originally posted type:'JobWorkIssue', a
      // movement type getStockLevel()'s reduce() does not recognize — it silently no-oped, leaving
      // warehouse stock UNCHANGED while the JobWorkReceipt movement below simultaneously credited
      // the job-worker-held stock, double-counting the dispatched qty as present in BOTH places at
      // once. Fixed to reuse the EXISTING, recognized 'Issue' type for the warehouse-side reduction
      // — the exact same pattern issueToSite() already uses for the site material subledger.
      _fault('DISPATCH_JOB_WORKER_MID_LOOP');
      postInventoryMovement({type:'Issue', materialId:l.materialId, qty:l.qty, uom:material.uom, warehouseId, projectId:projectId||null, sourceType:'JobWorkOrder', sourceId:null, valuationRate:rate, actor, capability:'JOB_WORK_DISPATCH' });
      const mv = postInventoryMovement({type:'JobWorkReceipt', materialId:l.materialId, qty:l.qty, uom:material.uom, warehouseId:null, jobWorkerId, projectId:projectId||null, sourceType:'JobWorkOrder', sourceId:null, valuationRate:rate, actor, capability:'JOB_WORK_DISPATCH' });
      movementIds.push(mv.id); totalValue += r2(l.qty*rate);
    });
    _fault('DISPATCH_JOB_WORKER_AFTER_MOVEMENTS_BEFORE_DOCS');
    const dc = { id: nextId(DB.deliveryChallans, 'DC-', 4), dcNo:nextDocNumber('DC'), jobWorkerId, warehouseId,
      items:lines, transporterName:transporterName||'', vehicleNo:vehicleNo||'', movementIds, status:'Dispatched', createdBy:actor.id, createdAt:nowIso() };
    DB.deliveryChallans.push(dc);
    const jwo = { id: nextId(DB.jobWorkOrders, 'JWO-', 4), jwoNo:nextDocNumber('JWO'), projectId:projectId||null, customerId:customerId||null,
      jobWorkerId, warehouseId, lines, value:r2(totalValue), isCapitalGoods:!!isCapitalGoods, dispatchDate:new Date().toISOString().slice(0,10),
      expectedReturnDate:expectedReturnDate||null, actualReturnDate:null, deliveryChallanId:dc.id, purpose:purpose||'', jobWorkReference:jobWorkReference||'',
      status:'Dispatched', movementIds, returnedQtyByLine:{}, scrapQtyByLine:{}, createdBy:actor.id, createdAt:nowIso() };
    DB.jobWorkOrders.push(jwo);
    movementIds.forEach(id=>{ const mv=DB.inventoryMovements.find(m=>m.id===id); if(mv) mv.sourceId=jwo.id; });
    logAudit({type:'JobWorkOrderDispatched', jwoId:jwo.id, jobWorkerId, warehouseId, value:jwo.value, userId:actor.id, role:actor.role});
    return {ok:true, jobWorkOrder:jwo, deliveryChallan:dc};
  });
}
function returnFromJobWorker({jwoId, returnedLines, actor, overrideReason}){
  { const _a = assertCanReturnFromJobWorker(actor); if(!_a.ok) return _a; }
  const jwo = DB.jobWorkOrders.find(x=>x.id===jwoId); if(!jwo) return {ok:false, error:'Job Work Order not found.'};
  if(!['Dispatched','PartiallyReturned'].includes(jwo.status)) return {ok:false, error:`Cannot return — status is "${jwo.status}".`};
  // Phase 34 Part A — closed-project gate, via the JWO's own project.
  { const _po = assertProjectOpenForPosting(jwo.projectId, actor, {overrideReason, action:'record a job-work return'}); if(!_po.ok) return _po; }
  const errors = [];
  (returnedLines||[]).forEach((rl,idx)=>{
    const line = jwo.lines[idx]; if(!line){ errors.push(`Line ${idx}: no matching dispatch line.`); return; }
    const already = (jwo.returnedQtyByLine[idx]||0) + (jwo.scrapQtyByLine[idx]||0);
    if(already + (+rl.qty||0) > line.qty + 0.001) errors.push(`Line ${idx}: returning ${rl.qty} would exceed the ${line.qty} originally dispatched (already accounted for: ${already}).`);
  });
  if(errors.length) return {ok:false, error:'Cannot return: '+errors.join(' | ')};
  // Phase 38 migration — replaced with the central withTransaction() primitive.
  return withTransaction(actor, {name:'returnFromJobWorker'}, () => {
    const movementIds = [];
    returnedLines.forEach((rl,idx)=>{
      if(!(+rl.qty>0)) return;
      const line = jwo.lines[idx];
      const material = DB.materials.find(m=>m.id===line.materialId);
      const rate = getMovingAverageRate(line.materialId, jwo.warehouseId) || 0;
      _fault('RETURN_JOB_WORKER_MID_LOOP');
      postInventoryMovement({type:'JobWorkReturn', materialId:line.materialId, qty:+rl.qty, uom:material.uom, warehouseId:null, jobWorkerId:jwo.jobWorkerId, projectId:jwo.projectId, sourceType:'JobWorkOrder', sourceId:jwo.id, valuationRate:rate, actor, capability:'JOB_WORK_RETURN' });
      const mv = postInventoryMovement({type:'Receipt', materialId:line.materialId, qty:+rl.qty, uom:material.uom, warehouseId:jwo.warehouseId, projectId:jwo.projectId, sourceType:'JobWorkOrder', sourceId:jwo.id, valuationRate:rate, actor, capability:'JOB_WORK_RETURN' });
      movementIds.push(mv.id);
      jwo.returnedQtyByLine[idx] = (jwo.returnedQtyByLine[idx]||0) + (+rl.qty);
    });
    _fault('RETURN_JOB_WORKER_AFTER_MOVEMENTS_BEFORE_STATUS');
    const fullyAccounted = jwo.lines.every((l,idx)=> ((jwo.returnedQtyByLine[idx]||0)+(jwo.scrapQtyByLine[idx]||0)) >= l.qty - 0.001);
    jwo.status = fullyAccounted ? 'Returned' : 'PartiallyReturned';
    if(fullyAccounted) jwo.actualReturnDate = new Date().toISOString().slice(0,10);
    logAudit({type:'JobWorkMaterialReturned', jwoId, movementIds, userId:actor.id, role:actor.role});
    return {ok:true, jobWorkOrder:jwo};
  });
}
const JOB_WORK_SCRAP_DISPOSITIONS = ['Sold By Job Worker (Registered, Tax-Paid)','Sold By Apple Tree','Destroyed/Written Off','Other'];
function recordJobWorkScrap({jwoId, lineIndex, qty, disposition, taxHandlingRef, actor, overrideReason}){
  { const _a = assertCanRecordJobWorkScrap(actor); if(!_a.ok) return _a; }
  const jwo = DB.jobWorkOrders.find(x=>x.id===jwoId); if(!jwo) return {ok:false, error:'Job Work Order not found.'};
  // Phase 34 Part A — closed-project gate, via the JWO's own project.
  { const _po = assertProjectOpenForPosting(jwo.projectId, actor, {overrideReason, action:'record job-work scrap'}); if(!_po.ok) return _po; }
  if(!JOB_WORK_SCRAP_DISPOSITIONS.includes(disposition)) return {ok:false, error:`Disposition must be one of: ${JOB_WORK_SCRAP_DISPOSITIONS.join(', ')}.`};
  const line = jwo.lines[lineIndex]; if(!line) return {ok:false, error:'Invalid line index.'};
  const already = (jwo.returnedQtyByLine[lineIndex]||0) + (jwo.scrapQtyByLine[lineIndex]||0);
  if(already + (+qty||0) > line.qty + 0.001) return {ok:false, error:'Scrap qty would exceed what remains undisposed on this line.'};
  const jobWorker = DB.jobWorkers.find(x=>x.id===jwo.jobWorkerId);
  const material = DB.materials.find(m=>m.id===line.materialId);
  const rate = getMovingAverageRate(line.materialId, jwo.warehouseId) || 0;
  if(disposition==='Sold By Job Worker (Registered, Tax-Paid)' && !jobWorker.registered){
    return {ok:false, error:'Cannot record "Sold By Job Worker (Registered, Tax-Paid)" — this job worker is NOT registered per the master record (SOP §2.2: an unregistered job worker\'s scrap disposal is Apple Tree\'s own tax responsibility).'};
  }
  // Financial Reconciliation phase — Destroyed/Written Off scrap is a genuine, permanent inventory
  // loss (the material is gone, no sale, no return) — exactly the same real-world event a Damage
  // Report represents, so it reuses that EXACT existing account pairing (Dr 5300 Inventory
  // Adjustment expense / Cr 1200 Inventory), not a new account invented for this phase. The other
  // three dispositions are left untouched: "Sold By Job Worker (Registered, Tax-Paid)" and "Sold By
  // Apple Tree" both already carry an explicit, previously-authored policy statement in this
  // function (taxFlag, below) that this is deliberately NOT auto-posted here — "Sold By Apple Tree"
  // explicitly defers to a separate, manual Customer Invoice; overriding that existing decision was
  // not asked for and is not made here. "Other" has no defined accounting treatment in the existing
  // architecture at all — BUSINESS DECISION REQUIRED, not guessed.
  const isWriteOff = disposition==='Destroyed/Written Off';
  const value = r2((+qty)*rate);
  let glResult = {ok:true};
  if(isWriteOff && value>0.01){
    glResult = postJournalEntry({ date:new Date().toISOString().slice(0,10),
      narration:`Job Work Scrap — Destroyed/Written Off — ${jwo.jwoNo||jwo.id} line ${lineIndex} (${material.description})`,
      sourceType:'JobWorkScrapWriteOff', sourceId:jwo.id, docCategory:'JobWorkScrapWriteOff',
      lines:[ {account:'5300', debit:value, credit:0, projectId:jwo.projectId||null}, {account:'1200', debit:0, credit:value, projectId:jwo.projectId||null} ],
      actor, capability:'JOB_WORK_SCRAP', overrideReason });
    if(!glResult.ok){
      // Nothing has been written yet — no movement, no scrapQtyByLine change, no scrap record.
      // ERP-059B — durableFailureAudit, see ERP-059B-TRANSACTION-DESIGN.md.
      return {ok:false, error:glResult.error, durableFailureAudit:{type:'JobWorkScrapRejected', jwoId, lineIndex, disposition, qty, value, glError:glResult.error}};
    }
  }
  // Phase 38 migration — replaced with the central withTransaction() primitive.
  const _jesLenBeforeScrap = DB.journalEntries.length;
  try {
    return withTransaction(actor, {name:'recordJobWorkScrap'}, () => {
      const mv = postInventoryMovement({type:'JobWorkScrap', materialId:line.materialId, qty:+qty, uom:material.uom, warehouseId:null, jobWorkerId:jwo.jobWorkerId, projectId:jwo.projectId, sourceType:'JobWorkOrder', sourceId:jwo.id, valuationRate:rate, actor, capability:'JOB_WORK_SCRAP' });
      _fault('JOB_WORK_SCRAP_AFTER_MOVEMENT_BEFORE_STATE');
      jwo.scrapQtyByLine[lineIndex] = (jwo.scrapQtyByLine[lineIndex]||0) + (+qty);
      const fullyAccounted = jwo.lines.every((l,idx)=> ((jwo.returnedQtyByLine[idx]||0)+(jwo.scrapQtyByLine[idx]||0)) >= l.qty - 0.001);
      if(fullyAccounted){ jwo.status='Returned'; jwo.actualReturnDate=new Date().toISOString().slice(0,10); }
      let taxFlag = null;
      if(disposition==='Sold By Job Worker (Registered, Tax-Paid)') taxFlag = 'Job worker handles tax directly — no Apple Tree GL entry required for this disposition (SOP §2.2).';
      else if(disposition==='Sold By Apple Tree') taxFlag = 'APPLE TREE TAX HANDLING REQUIRED — if this scrap generates real sale proceeds, record it through the normal Customer Invoice flow; no invoice is auto-generated here.';
      else if(isWriteOff) taxFlag = `Written off — Dr 5300 / Cr 1200 posted for ₹${value} (GL entry ${glResult.entry?glResult.entry.id:''}).`;
      const rec = { id:'JWSCRAP-'+String(DB.jobWorkScrapRecords.length+1).padStart(4,'0'), jwoId, lineIndex, materialId:line.materialId, qty:+qty, value:r2(qty*rate),
        jobWorkerId:jwo.jobWorkerId, jobWorkerRegistered:jobWorker.registered, disposition, taxHandlingRef:taxHandlingRef||'', taxFlag, movementId:mv.id,
        glEntryId: glResult.entry?glResult.entry.id:null, createdBy:actor.id, createdAt:nowIso() };
      DB.jobWorkScrapRecords.push(rec);
      logAudit({type:'JobWorkScrapRecorded', jwoId, disposition, qty:+qty, value, taxFlag, glEntryId:rec.glEntryId, userId:actor.id, role:actor.role});
      return {ok:true, scrapRecord:rec, jobWorkOrder:jwo};
    });
  } catch(e) {
    if(isWriteOff && value>0.01) DB.journalEntries.length = _jesLenBeforeScrap; // rolls back the GL entry posted above, mirroring the GRN/Material-Issue "attempt-GL-first, roll back on later failure" pattern
    throw e;
  }
}
// SOP §2.2 — direct supply from job-worker premises WITHOUT first returning: registered job
// worker -> permitted without APOB; unregistered -> Apple Tree must have already declared that
// premises as its own APOB. Never assumes an APOB exists — checks the real declaration record.
function directDispatchFromJobWorker({jwoId, lineIndex, qty, customerId, actor, overrideReason}){
  { const _a = assertCanDirectDispatchFromJobWorker(actor); if(!_a.ok) return _a; }
  const jwo = DB.jobWorkOrders.find(x=>x.id===jwoId); if(!jwo) return {ok:false, error:'Job Work Order not found.'};
  // Phase 34 Part A — closed-project gate, via the JWO's own project.
  { const _po = assertProjectOpenForPosting(jwo.projectId, actor, {overrideReason, action:'direct-dispatch material from a job worker'}); if(!_po.ok) return _po; }
  const jobWorker = DB.jobWorkers.find(x=>x.id===jwo.jobWorkerId);
  const line = jwo.lines[lineIndex]; if(!line) return {ok:false, error:'Invalid line index.'};
  const already = (jwo.returnedQtyByLine[lineIndex]||0) + (jwo.scrapQtyByLine[lineIndex]||0);
  if(already + (+qty||0) > line.qty + 0.001) return {ok:false, error:'Quantity would exceed what remains at this job worker.'};
  if(!jobWorker.registered){
    const apob = DB.apobDeclarations.find(a=>a.jobWorkerId===jobWorker.id && a.active);
    if(!apob) return {ok:false, error:'APOB REQUIRED — this job worker is unregistered; Apple Tree must declare this premises as its own Additional Place of Business (SOP §2.2/Section 2(85)) before a direct dispatch from here is compliant. No active APOB declaration is on record.', apobRequired:true};
  }
  const material = DB.materials.find(m=>m.id===line.materialId);
  const rate = getMovingAverageRate(line.materialId, jwo.warehouseId) || 0;
  const shipToRequired = shipToGstinRequired(new Date().toISOString().slice(0,10));
  // Phase 38 migration — replaced the Phase 37 bespoke snapshot/catch with the central
  // withTransaction() primitive (same rationale as the sibling job-work functions above).
  return withTransaction(actor, {name:'directDispatchFromJobWorker'}, () => {
    const mv = postInventoryMovement({type:'JobWorkDirectDispatch', materialId:line.materialId, qty:+qty, uom:material.uom, warehouseId:null, jobWorkerId:jwo.jobWorkerId, projectId:jwo.projectId, sourceType:'JobWorkOrder', sourceId:jwo.id, valuationRate:rate, actor, capability:'JOB_WORK_DIRECT_DISPATCH' });
    _fault('DIRECT_DISPATCH_JOB_WORKER_AFTER_MOVEMENT_BEFORE_STATE');
    jwo.returnedQtyByLine[lineIndex] = (jwo.returnedQtyByLine[lineIndex]||0) + (+qty);
    const fullyAccounted = jwo.lines.every((l,idx)=> ((jwo.returnedQtyByLine[idx]||0)+(jwo.scrapQtyByLine[idx]||0)) >= l.qty - 0.001);
    if(fullyAccounted) jwo.status='DirectDispatched';
    logAudit({type:'JobWorkDirectDispatchToCustomer', jwoId, customerId, qty:+qty, jobWorkerRegistered:jobWorker.registered, shipToGstinRequired:shipToRequired, userId:actor.id, role:actor.role});
    return {ok:true, movement:mv, jobWorkOrder:jwo, shipToGstinRequired:shipToRequired,
      note:'Apple Tree must issue the actual Tax Invoice for this dispatch through the normal Customer Invoice flow (bill-to Apple Tree / ship-from this location) — not auto-generated here.'};
  });
}
// ---------- Job Work aging (SOP §2.2 — 1yr inputs / 3yr capital goods, extendable, never auto-granted) ----------
const JOB_WORK_DEFAULT_INPUT_RETURN_DAYS = 365, JOB_WORK_DEFAULT_CAPITAL_GOODS_RETURN_DAYS = 1095;
function jobWorkAgingReport(){
  const today = new Date();
  return DB.jobWorkOrders.filter(j=>['Dispatched','PartiallyReturned'].includes(j.status)).map(j=>{
    const dispatchDate = new Date(j.dispatchDate);
    const defaultDays = j.isCapitalGoods ? JOB_WORK_DEFAULT_CAPITAL_GOODS_RETURN_DAYS : JOB_WORK_DEFAULT_INPUT_RETURN_DAYS;
    const dueDate = j.expectedReturnDate ? new Date(j.expectedReturnDate) : new Date(dispatchDate.getTime() + defaultDays*86400000);
    const extension = DB.jobWorkExtensions.find(e=>e.jwoId===j.id && e.approved);
    const effectiveDue = extension ? new Date(extension.newDueDate) : dueDate;
    const daysToDue = Math.floor((effectiveDue-today)/86400000);
    let status;
    if(daysToDue < 0) status = extension ? 'OVERDUE' : 'EXTENSION APPROVAL REQUIRED';
    else if(daysToDue <= 30) status = 'DUE SOON';
    else status = 'NORMAL';
    return { jwoId:j.id, jobWorkerId:j.jobWorkerId, isCapitalGoods:!!j.isCapitalGoods, dispatchDate:j.dispatchDate, dueDate:effectiveDue.toISOString().slice(0,10), daysToDue, status };
  });
}
function requestJobWorkExtension({jwoId, newDueDate, reason, actor}){
  const jwo = DB.jobWorkOrders.find(x=>x.id===jwoId); if(!jwo) return {ok:false, error:'Job Work Order not found.'};
  if(!reason) return {ok:false, error:'A reason is required to request an extension.'};
  if(!newDueDate) return {ok:false, error:'A new due date is required.'};
  const ext = { id:'JWEXT-'+String(DB.jobWorkExtensions.length+1).padStart(4,'0'), jwoId, newDueDate, reason, requestedBy:actor.id, requestedAt:nowIso(), approved:false, approvedBy:null, approvedAt:null };
  DB.jobWorkExtensions.push(ext); save();
  logAudit({type:'JobWorkExtensionRequested', jwoId, newDueDate, reason, userId:actor.id, role:actor.role});
  return {ok:true, extension:ext};
}
function approveJobWorkExtension({id, actor}){
  const ext = DB.jobWorkExtensions.find(x=>x.id===id); if(!ext) return {ok:false, error:'Extension request not found.'};
  if(ext.approved) return {ok:false, error:'Already approved.'};
  if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return {ok:false, error:`Role "${actor.role}" cannot approve a job-work return-period extension.`};
  ext.approved = true; ext.approvedBy = actor.id; ext.approvedAt = nowIso(); save();
  logAudit({type:'JobWorkExtensionApproved', jwoId:ext.jwoId, extensionId:id, userId:actor.id, role:actor.role});
  return {ok:true, extension:ext};
}
// ---------- APOB Declarations ----------
function createAPOBDeclaration({jobWorkerId, location, declarationDate, approvalReference, actor}){
  const jw = DB.jobWorkers.find(x=>x.id===jobWorkerId); if(!jw) return {ok:false, error:'Job Worker not found.'};
  const decl = { id:'APOB-'+String(DB.apobDeclarations.length+1).padStart(3,'0'), jobWorkerId, location:location||jw.address,
    declarationDate:declarationDate||new Date().toISOString().slice(0,10), approvalReference:approvalReference||'', active:true, createdBy:actor.id, createdAt:nowIso() };
  DB.apobDeclarations.push(decl); save();
  logAudit({type:'APOBDeclarationCreated', apobId:decl.id, jobWorkerId, userId:actor.id, role:actor.role});
  return {ok:true, apobDeclaration:decl};
}
function setAPOBDeclarationActive({id, active, actor}){
  const decl = DB.apobDeclarations.find(x=>x.id===id); if(!decl) return {ok:false, error:'APOB declaration not found.'};
  decl.active = !!active; save();
  logAudit({type:'APOBDeclarationActiveSet', apobId:id, active:decl.active, userId:actor.id, role:actor.role});
  return {ok:true, apobDeclaration:decl};
}

// ============================================================================================
// PHASE 34 — Ship-to GSTIN + E-way Bill (manual-entry tracking only — no government API claimed)
// ============================================================================================
function shipToGstinRequired(dispatchDate){
  const eff = DB.shipToGstinEffectiveDate || '2026-08-01';
  return (dispatchDate||new Date().toISOString().slice(0,10)) >= eff;
}
function ewayBillRequired(value){ return (+value||0) > 50000; }
function createEwayBillRecord({documentType, documentId, value, sourceLocation, destinationLocation, transporterName, vehicleNo, distanceKm, shipFromGSTIN, shipToGSTIN, customerId, actor}){
  if(!documentType || !documentId) return {ok:false, error:'A source document type and ID are required.'};
  const required = ewayBillRequired(value);
  const rec = { id:'EWB-'+String(DB.ewayBills.length+1).padStart(4,'0'), ewbNo:nextDocNumber('EWB'), documentType, documentId, value:r2(+value||0), required,
    number:null, generationDate:null, validity:null, transporterName:transporterName||'', vehicleNo:vehicleNo||'', distanceKm:distanceKm||null,
    sourceLocation:sourceLocation||'', destinationLocation:destinationLocation||'', shipFromGSTIN:shipFromGSTIN||null, shipToGSTIN:shipToGSTIN||null,
    customerId:customerId||null, status: required?'E-WAY BILL REQUIRED — NOT YET GENERATED':'NOT REQUIRED', createdBy:actor.id, createdAt:nowIso() };
  DB.ewayBills.push(rec); save();
  logAudit({type:'EwayBillRecordCreated', ewbId:rec.id, documentType, documentId, value:rec.value, required, userId:actor.id, role:actor.role});
  return {ok:true, ewayBill:rec};
}
// Records a number the user generated ON THE REAL GOVERNMENT PORTAL — never fabricated here, per
// the brief's explicit instruction not to falsely claim a government-system generation.
function recordEwayBillNumber({id, number, generationDate, validity, actor}){
  const rec = DB.ewayBills.find(x=>x.id===id); if(!rec) return {ok:false, error:'E-way bill record not found.'};
  if(!number) return {ok:false, error:'An e-way bill number is required — this records a number you generated on the government portal; it is never fabricated here.'};
  rec.number = number; rec.generationDate = generationDate||new Date().toISOString().slice(0,10); rec.validity = validity||null; rec.status = 'GENERATED (manually recorded)';
  save();
  logAudit({type:'EwayBillNumberRecorded', ewbId:id, number, userId:actor.id, role:actor.role});
  return {ok:true, ewayBill:rec};
}

// ============================================================================================
// PHASE 34 — ITC (Input Tax Credit) eligibility control (SOP §2)
// ============================================================================================
function reverseITCForWriteOff({materialId, qty, warehouseId, sourceType, sourceId, actor}){
  { const _a = assertCanReverseITCForWriteOff(actor); if(!_a.ok) return _a; }
  const material = DB.materials.find(m=>m.id===materialId);
  if(!material || !material.taxCode) return {ok:true, reversed:0, note:'No tax code on this material — nothing to reverse.'};
  const tc = DB.taxCodes.find(t=>t.code===material.taxCode);
  if(!tc) return {ok:true, reversed:0, note:'Unknown tax code — nothing to reverse.'};
  const totalRatePct = (tc.cgstPct||0)+(tc.sgstPct||0)+(tc.igstPct||0);
  const rate = getMovingAverageRate(materialId, warehouseId) || material.standardCost || 0;
  const baseValue = r2(Math.abs(qty) * rate);
  const itcAmount = r2(baseValue * totalRatePct/100);
  if(itcAmount<=0.01) return {ok:true, reversed:0};
  const glResult = postJournalEntry({ date:new Date().toISOString().slice(0,10), narration:`ITC Reversal — ${material.description} write-off (SOP §2: ITC not available on lost/destroyed/written-off goods)`,
    sourceType, sourceId, voucherNo:nextDocNumber('ITCR'), docCategory:'ITCReversal',
    lines:[ {account:'5310', debit:itcAmount, credit:0, projectId:null}, {account:'1300', debit:0, credit:itcAmount, projectId:null} ],
    actor, capability:'ITC_REVERSAL' });
  if(!glResult.ok) return glResult;
  logAudit({type:'ITCReversed', materialId, qty, itcAmount, sourceType, sourceId, userId:actor.id, role:actor.role});
  return {ok:true, reversed:itcAmount, glEntry:glResult.entry};
}
function itcReversalReport(){
  const lines = DB.journalEntries.filter(je=>je.docCategory==='ITCReversal' && !je.reversalOfId).flatMap(je=>je.lines.filter(l=>l.account==='5310').map(l=>({...l, voucherNo:je.voucherNo, date:je.date, narration:je.narration})));
  return { totalReversed: r2(lines.reduce((s,l)=>s+l.debit,0)), entries: lines };
}

// ============================================================================================
// PHASE 34 — BOQ vs Actual Consumption (wraps the EXISTING materialBomQuota() — no new BOQ
// master object built, per the brief's own "check whether the existing chain already satisfies
// this before building a new one" instruction. materialBomQuota() already computes budgeted vs.
// used QUANTITY per material per project, BOM-derived; this adds a cost lens and a wastage%/
// abnormal-consumption flag on top of it, in one project-wide report.
// ============================================================================================
function projectBOQVarianceReport(projectId){
  if(!projectId || !DB.projects.find(p=>p.id===projectId)) return {ok:false, error:'A valid project is required.'};
  const boms = DB.boms.filter(b=>b.projectId===projectId && b.status==='Approved');
  const materialIds = [...new Set(boms.flatMap(b=>b.lines.map(l=>l.materialId)))];
  const lines = materialIds.map(materialId=>{
    const quota = materialBomQuota({projectId, materialId});
    const material = DB.materials.find(m=>m.id===materialId);
    const rate = material ? (material.standardCost||0) : 0;
    const estimatedCost = r2(quota.budgetQty * rate);
    const actualCost = r2(quota.usedQty * rate);
    const wastagePct = quota.budgetQty>0 ? r2(100*(quota.usedQty-quota.budgetQty)/quota.budgetQty) : null;
    const abnormalConsumption = quota.budgetQty>0 && quota.usedQty > quota.budgetQty*1.1;
    return { materialId, description: material?material.description:materialId, estimatedQty:quota.budgetQty, actualQty:quota.usedQty,
      variance:r2(quota.usedQty-quota.budgetQty), variancePct:quota.pctUsed, estimatedCost, actualCost, costVariance:r2(actualCost-estimatedCost),
      wastagePct, abnormalConsumption };
  });
  return { ok:true, projectId, lines,
    note:'Cost columns use each material\'s Standard Cost as a consistent basis for both estimated and actual — this isolates the QUANTITY variance in Rupees; it is not a separate price-variance report (Standard Costing already covers price variance where needed).' };
}

// ============================================================================================
// PHASE 34 — Three-way-match applicability policy (SOP §9) — configurable by payment category,
// never silently decided. See PHASE33_SOP_COMPLIANCE_MATRIX.md's own disclosed tension.
// ============================================================================================
function paymentCategoryPolicyStatus(category){
  const cfg = (DB.threeWayMatchPolicyConfig && DB.threeWayMatchPolicyConfig.categories[category]) || null;
  if(!cfg) return {category, status:'UNKNOWN CATEGORY'};
  return { category, requiresThreeWayMatch:cfg.requiresThreeWayMatch, status: cfg.policyConfirmedByFinance ? 'TECHNICALLY COMPLIANT' : 'PAYMENT CONTROL POLICY REQUIRED', note:cfg.note };
}
function setThreeWayMatchPolicyConfirmed({category, confirmed, requiresThreeWayMatch, actor}){
  if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return {ok:false, error:`Role "${actor.role}" cannot confirm payment-control policy.`};
  const cfg = DB.threeWayMatchPolicyConfig.categories[category];
  if(!cfg) return {ok:false, error:`Unknown payment category "${category}".`};
  cfg.policyConfirmedByFinance = !!confirmed;
  if(requiresThreeWayMatch!==undefined) cfg.requiresThreeWayMatch = !!requiresThreeWayMatch;
  save();
  logAudit({type:'ThreeWayMatchPolicyConfirmed', category, confirmed:cfg.policyConfirmedByFinance, requiresThreeWayMatch:cfg.requiresThreeWayMatch, userId:actor.id, role:actor.role});
  return {ok:true, config:cfg};
}

// ============================================================================================
// PHASE 34 — SOP Compliance Dashboard, extended with the required status-category breakdown
// (§36 of the brief) — never a single collapsed "100% compliant" figure while any category
// still has open items.
// ============================================================================================
function sopComplianceDashboard(){
  const configurationRequired = [];
  if(!DB.companyGSTConfig || !DB.companyGSTConfig.newGSTIN) configurationRequired.push('Real Company GSTIN not yet supplied');
  if(!DB.companyGSTConfig || !DB.companyGSTConfig.companyState) configurationRequired.push('Company registered state not yet supplied');
  if(!DB.bankAccounts.some(b=>b.accountType==='Cash')) configurationRequired.push('No real Cash-type bank/cash account configured yet');
  const managementDecisions = [];
  if(!DB.paymentApprovalMatrix.finalised) managementDecisions.push('Payment Approval Matrix — SOP itself says "To Be Finalised"');
  if(DB.purchaseApprovalConfig.status==='POLICY NOT FINALISED') managementDecisions.push('PO approval threshold conflict (existing BOS §1.6 vs SOP ₹25,000) not reconciled');
  Object.entries(DB.threeWayMatchPolicyConfig.categories).forEach(([cat,cfg])=>{ if(!cfg.policyConfirmedByFinance) managementDecisions.push(`Payment control policy for "${cat}" not confirmed`); });
  const taxLegalReview = ['TDS rates/thresholds (SOP-sourced, not independently verified tax law)', 'Cash-limit figures (SOP-sourced, not independently verified as current Income Tax Act thresholds)'];
  const realWorldUATRequired = ['Real Apple Tree Finance Team UAT has not yet been performed', 'Real GSTIN/PAN/vendor classification/bank account data not yet supplied'];
  const futureEnhancement = ['Automatic multi-hop job-work re-dispatch chain tracking (single-hop only is built)', 'Real government e-way-bill API integration (manual-entry tracking only)'];
  return {
    companyGSTConfig: DB.companyGSTConfig, tdsConfig: DB.tdsConfig, cashLimits: DB.cashLimits,
    purchaseApprovalConfig: DB.purchaseApprovalConfig, paymentApprovalMatrix: DB.paymentApprovalMatrix,
    threeWayMatchPolicyConfig: DB.threeWayMatchPolicyConfig,
    openPurchaseRequisitions: DB.purchaseRequisitions.filter(p=>p.status==='Submitted').length,
    pendingSiteMaterialRequisitions: DB.siteMaterialRequisitions.filter(m=>m.status==='Submitted').length,
    pendingPaymentApprovals: DB.paymentApprovals.filter(p=>p.status==='PendingApproval').length,
    openCashControlExceptions: DB.cashControlExceptions.length,
    sellersCrossing194Q: sellerCumulativeReport().filter(r=>r.crosses194Q).length,
    totalTDSDeducted: tdsComplianceSummary().totalDeducted,
    totalITCReversed: itcReversalReport().totalReversed,
    activeSites: DB.sites.filter(s=>s.active).length,
    activePettyCashFloats: DB.pettyCashFloats.filter(f=>f.active).length,
    activeJobWorkers: DB.jobWorkers.filter(j=>j.active).length,
    openJobWorkOrders: DB.jobWorkOrders.filter(j=>['Dispatched','PartiallyReturned'].includes(j.status)).length,
    jobWorkAgingFlags: jobWorkAgingReport().filter(a=>a.status!=='NORMAL').length,
    ewayBillsRequiredNotGenerated: DB.ewayBills.filter(e=>e.required && e.status.includes('NOT YET GENERATED')).length,
    // §36 — the required status-category breakdown. Deliberately no single collapsed "compliant"
    // percentage while any of these categories are non-empty.
    statusBreakdown: {
      technicallyCompliant: 'Every control listed as "BUILT" in PHASE33_SOP_COMPLIANCE_REPORT.md + PHASE34_FINAL_REPORT.md is live and tested — see those reports for the itemized list.',
      configurationRequired, managementDecisions, taxLegalReview, realWorldUATRequired, futureEnhancement
    }
  };
}

// ============================================================================================
// PHASE 36 §9 — Document Flow / Traceability. A READ-ONLY assembler over data that already
// exists — it invents no new document relationships, it just walks the real `purchaseRequisitionId`/
// `poId`/`grnId`/`sourceId` reference chains already stored on each record (the same references
// every prior phase's own doclink navigation already relies on) and returns them as one ordered
// list so a screen can render "Previous -> Current -> Next" without the user memorizing IDs.
// ============================================================================================
function projectDocumentTrace(projectId){
  if(!projectId || !DB.projects.find(p=>p.id===projectId)) return {ok:false, error:'A valid project is required.'};
  const chain = [];
  DB.purchaseRequisitions.filter(p=>p.projectId===projectId).forEach(pr=>{
    chain.push({type:'Purchase Requisition', doc:pr.prNo||pr.id, date:pr.createdAt?.slice(0,10), status:pr.status});
    DB.purchaseOrders.filter(po=>po.purchaseRequisitionId===pr.id).forEach(po=>{
      chain.push({type:'Purchase Order', doc:po.poNo||po.id, date:po.createdAt?.slice(0,10), status:po.status, previous:pr.prNo||pr.id});
      DB.grns.filter(g=>g.poId===po.id).forEach(grn=>{
        chain.push({type:'GRN', doc:grn.grnNo||grn.id, date:grn.date, status:'Recorded', previous:po.poNo||po.id});
        const bill = DB.jeDrafts.find(d=>d.grnId===grn.id) || DB.journalEntries.find(je=>je.sourceType==='Supplier Bill (3-way matched)' && je.narration?.includes(grn.grnNo));
        if(bill){
          const billNo = bill.voucherNo || (DB.journalEntries.find(je=>je.id===bill.postedEntryId)||{}).voucherNo;
          chain.push({type:'Supplier Bill', doc:billNo||bill.id, date:bill.date, status:bill.status||'Posted', previous:grn.grnNo||grn.id});
        }
      });
    });
  });
  DB.paymentApprovals.filter(pq=>{
    const bill = DB.journalEntries.find(je=>je.id===pq.invoiceEntryId);
    return bill && bill.lines.some(l=>l.projectId===projectId);
  }).forEach(pq=>{
    chain.push({type:'Payment Request', doc:pq.id, date:pq.createdAt?.slice(0,10), status:pq.status});
  });
  DB.siteMaterialRequisitions.filter(m=>m.projectId===projectId).forEach(mrs=>{
    chain.push({type:'Site Material Requisition', doc:mrs.mrsNo||mrs.id, date:mrs.createdAt?.slice(0,10), status:mrs.status});
    if(mrs.deliveryChallanId){
      const dc = DB.deliveryChallans.find(d=>d.id===mrs.deliveryChallanId);
      if(dc){
        chain.push({type:'Delivery Challan', doc:dc.dcNo||dc.id, date:dc.createdAt?.slice(0,10), status:dc.status, previous:mrs.mrsNo||mrs.id});
        const smr = DB.siteMaterialReceipts.find(s=>s.deliveryChallanId===dc.id);
        if(smr) chain.push({type:'Site Material Receipt', doc:smr.smrNo||smr.id, date:smr.receivedAt?.slice(0,10), status:smr.discrepancies?.length?'Discrepancy noted':'Matched', previous:dc.dcNo||dc.id});
      }
    }
  });
  DB.inventoryMovements.filter(m=>m.projectId===projectId && m.type==='SiteConsumption').forEach(m=>{
    chain.push({type:'Site Consumption (Project Cost)', doc:m.id, date:m.date, status:'Posted'});
  });
  DB.jobWorkOrders.filter(j=>j.projectId===projectId).forEach(j=>{
    chain.push({type:'Job Work Order', doc:j.jwoNo||j.id, date:j.dispatchDate, status:j.status});
  });
  return {ok:true, projectId, chain};
}

// ============================================================================================
// PHASE 36 §7/§8 — One-Click Demo Scenario. Builds ONE real, connected, fully-traceable
// transaction chain using ONLY the existing domain functions above (no new posting/inventory
// logic here — this function is purely an orchestrator) so an accountant can open the chain end
// to end without having to type dozens of forms first. Every record created is tagged
// "PHASE36-DEMO" in its narration/purpose fields so it is trivially identifiable and never
// confusable with real data. Uses the dedicated UAT users as actors (not Admin for everything)
// so the maker-checker/SoD structure is visible in the resulting data, exactly as a real
// multi-person process would produce it.
// ============================================================================================
function seedDemoScenario(){
  const trace = [];
  const uatAdmin = DB.users.find(u=>u.id==='U-UAT-ADMIN');
  const uatFinance = DB.users.find(u=>u.id==='U-UAT-FIN');
  const uatPurchase = DB.users.find(u=>u.id==='U-UAT-PUR');
  const uatSite = DB.users.find(u=>u.id==='U-UAT-SITE');
  const uatAccountant = DB.users.find(u=>u.id==='U-UAT-ACC');
  const uatCeo = DB.users.find(u=>u.id==='U-UAT-CEO');
  if(!uatAdmin || !uatFinance || !uatPurchase || !uatSite || !uatAccountant || !uatCeo){
    return {ok:false, error:'The dedicated UAT users are not present in this database — run Reset UAT Data first, or this DB predates Phase 36.'};
  }
  const today = new Date().toISOString().slice(0,10);

  const proj = createProjectMaster({name:'PHASE36-DEMO Villa Interior Fitout', budget:500000, customerId:DB.customers[0].id, actor:uatAdmin});
  if(!proj.ok) return proj; trace.push({step:'Project', doc:proj.project.id});

  const site = createSite({name:'PHASE36-DEMO Site', address:'Demo Address, Kochi', state:'Kerala', actor:uatFinance});
  if(!site.ok) return site; trace.push({step:'Site', doc:site.site.id});

  const pr = createPurchaseRequisition({projectId:proj.project.id, items:[{description:'PHASE36-DEMO Plywood 18mm', qty:20, estimatedRate:2800}], actor:uatPurchase});
  if(!pr.ok) return pr; trace.push({step:'Purchase Requisition', doc:pr.purchaseRequisition.id});
  submitPurchaseRequisition({id:pr.purchaseRequisition.id, actor:uatPurchase});
  const prApprove = approvePurchaseRequisition({id:pr.purchaseRequisition.id, actor:uatFinance});
  if(!prApprove.ok) return prApprove;

  const po = createPurchaseOrder({projectId:proj.project.id, purchaseRequisitionId:pr.purchaseRequisition.id, vendorId:DB.vendors[0].id,
    lines:[{materialId:'MAT-1', qty:20, rate:2800}], actor:uatPurchase});
  if(!po.ok) return po; trace.push({step:'Purchase Order', doc:po.po.id});
  const poSubmit = submitPurchaseOrder({id:po.po.id, actor:uatPurchase});
  // DEFECT FOUND & FIXED (self-test, live run): this PO's ₹56,000 total is below the BOS §1.6
  // no-approval threshold (≤₹5,00,000), so submitPurchaseOrder() auto-approves it — calling
  // approvePurchaseOrder() unconditionally afterward then failed with "Cannot approve — Approved,
  // not Submitted." Only approve when it's genuinely still Submitted, matching real usage.
  if(poSubmit.ok && poSubmit.po.status==='Submitted'){
    const poApprove = approvePurchaseOrder({id:po.po.id, actor:uatFinance});
    if(!poApprove.ok) return poApprove;
  }

  const grn = createGRN({poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:20}], actor:uatPurchase});
  if(!grn.ok) return grn; trace.push({step:'GRN', doc:grn.grn.id});

  const bill = draftSupplierInvoiceFromPO({poId:po.po.id, grnId:grn.grn.id, invoiceLines:[{qty:20, rate:2800}], date:today,
    narration:'PHASE36-DEMO Supplier Bill', createdByUserId:uatAccountant.id, createdByRole:uatAccountant.role});
  if(!bill.ok) return bill; trace.push({step:'Supplier Bill (Draft)', doc:bill.draft.id});
  submitDraft(bill.draft.id, uatAccountant);
  const billApprove = approveDraft(bill.draft.id, uatFinance, 'PHASE36-DEMO approval');
  if(!billApprove.ok) return billApprove;
  const billPosted = postDraft(bill.draft.id, uatCeo);
  if(!billPosted.ok) return billPosted; trace.push({step:'AP Journal Entry', doc:billPosted.entry.id});

  const payReq = createPaymentRequest({vendorId:DB.vendors[0].id, invoiceEntryId:billPosted.entry.id, amount:56000, narration:'PHASE36-DEMO Payment', actor:uatPurchase});
  if(!payReq.ok) return payReq; trace.push({step:'Payment Request (maker: Purchase)', doc:payReq.paymentRequest.id});
  const payApprove = approvePaymentRequest({id:payReq.paymentRequest.id, actor:uatFinance});
  if(!payApprove.ok) return payApprove; trace.push({step:'Payment Approved (checker: Finance)', doc:payReq.paymentRequest.id});
  const payExec = executePaymentRequest({id:payReq.paymentRequest.id, date:today, actor:uatCeo});
  if(!payExec.ok) return payExec; trace.push({step:'Payment Executed + Clearing (executor: CEO)', doc:payExec.entry.id});

  const mrs = createSiteMaterialRequisition({siteId:site.site.id, projectId:proj.project.id, items:[{materialId:'MAT-1', qty:10}], actor:uatSite});
  if(!mrs.ok) return mrs; trace.push({step:'Site Material Requisition', doc:mrs.mrs.id});
  submitSiteMaterialRequisition({id:mrs.mrs.id, actor:uatSite});
  const mrsApprove = approveSiteMaterialRequisition({id:mrs.mrs.id, actor:uatFinance});
  if(!mrsApprove.ok) return mrsApprove;

  const issue = issueToSite({mrsId:mrs.mrs.id, warehouseId:'WH-1', actor:uatPurchase, transporterName:'PHASE36-DEMO Transport', vehicleNo:'KL-00-DEMO'});
  if(!issue.ok) return issue; trace.push({step:'Delivery Challan (site)', doc:issue.deliveryChallan.id});

  const receipt = createSiteMaterialReceipt({deliveryChallanId:issue.deliveryChallan.id, receivedItems:[{qtyReceived:10}], actor:uatSite});
  if(!receipt.ok) return receipt; trace.push({step:'Site Material Receipt', doc:receipt.smr.id});

  const consumption = createMaterialIssue({projectId:proj.project.id, materialId:'MAT-1', qty:6, siteId:site.site.id, purpose:'PHASE36-DEMO Installation', actor:uatSite});
  if(!consumption.ok) return consumption; trace.push({step:'Site Consumption (Project Actual Cost)', doc:consumption.movement.id});

  const pl = projectFinancial360(proj.project.id);
  trace.push({step:'Project P&L', doc:proj.project.id, actualCost: pl.ok?pl.cost.actual:null, contractRevenue: pl.ok?pl.contract.contractRevenue:null});

  logAudit({type:'DemoScenarioSeeded', projectId:proj.project.id, stepCount:trace.length, userId:uatAdmin.id, role:uatAdmin.role});
  return {ok:true, projectId:proj.project.id, siteId:site.site.id, trace};
}

// Phase 45 Part 19 — a temporary naive-developer re-test function (createNaivePhase45TestTransaction)
// and its route (/api/test/naive-phase45-transaction) were used here to prove whether the NEW
// blanket legacy-dispatch transaction wrapper (server.js) protects a function with ZERO atomicity
// code of its own, reached through an ordinary legacy route. They have been removed after producing
// their evidence: a legitimate call posted JE-1210 cleanly; a deliberately forced failure (throwing
// AFTER the GL entry was posted but before the function's own document push/save) left ZERO orphan
// — the opposite result from the identical experiment in Phase 37/38, which produced a permanent
// GL orphan under the pre-Phase-45 architecture. JE-1210 was reversed via the legitimate
// /api/journal/:id/reverse API before removal. Full findings are in the Phase 45 report, not
// retained as live code.
// Phase 46 Part 3 — a temporary FINAL naive-developer atomicity re-test function
// (createFinalNaiveCertificationTransaction) and its route (/api/test/final-naive-certification)
// were used here, on a freshly cold-started server, to repeat Phase 45's strongest test one last
// time for final certification. They have been removed after producing their evidence: two
// legitimate calls posted JE-1254/JE-1255 cleanly, each correctly paired with its own lead record;
// two deliberately forced failures (amount=999999, throwing after both the GL entry AND a SECOND
// collection mutation — DB.leads — with zero rollback code of the function's own) left ZERO trace
// in either collection, and a retry of the identical failing call produced no duplicate. JE-1254
// and JE-1255 were reversed via the legitimate /api/journal/:id/reverse API; the two legitimate
// test lead records were removed directly (pure test scaffolding, never real business data, with
// no GL/financial linkage of their own) before this function and route were deleted. Full findings
// are in the Phase 46 final certification report, not retained as live code.

// ============================================================
// Phase 10 (SAP Enterprise Capability Benchmark) — Material Replenishment
// Recommendation (read-only) and Project Budget/Commitment/Actual/Variance
// (read-only). Both functions are strictly read-only: no DB.*.push, no save(),
// no posting of any kind — pure aggregation over already-authoritative data,
// per the brief's explicit instruction ("do not create purchase orders
// automatically", "READ-ONLY RECOMMENDATION").
// ============================================================

// Forensic finding (this phase's own audit, confirmed by direct grep): material.reorderLevel/
// minStock/maxStock have existed on every material record since the original seed data, but were
// NEVER read by any function anywhere in this file — completely inert. This function is the first
// consumer of them. It does not create, approve, or send anything — it only computes and returns a
// recommendation table for a human buyer to act on.
//
// Netting logic (deliberately kept simple and traceable, not a full SAP MRP run):
//   Current Stock   = getStockLevel(materialId) summed across ALL warehouses (site stock is
//                      already allocated/consumed against a project, so it is correctly excluded —
//                      same warehouse/site separation this codebase already enforces everywhere
//                      else, see the Phase 5 comment above materialMovementFlow()).
//   Open Requirement = SUM(qty) of DB.materialRequirements for this material whose status is
//                      SUBMITTED, APPROVED, or PARTIALLY_PROCESSED (MR_STATUSES) — i.e. real,
//                      still-pending demand. DRAFT (not yet submitted) and REJECTED are excluded.
//                      CONVERTED is also excluded — once an RFQ/PO has actually been raised against
//                      a requirement (createRFQ flips it to CONVERTED), that demand is already being
//                      tracked by Open PO below; counting it in both places would double-count the
//                      same real-world need.
//   Available        = Current Stock - Open Requirement (can go negative — that is a genuine
//                      over-committed signal, not a bug, and is surfaced as-is, never floored at 0).
//   Open PO          = SUM, per PO line referencing this material, of (line.qty - qtyReceivedByLine)
//                      across every PO whose status is neither Draft nor Cancelled — i.e. real
//                      outstanding purchase-order quantity not yet received.
//   Suggested Purchase Qty = max(0, Open Requirement - Current Stock - Open PO). This matches the
//                      brief's own worked example exactly (Available:12, Requirement:25, OpenPO:5 =>
//                      Suggested:8 <=> 25-12-5=8) and is demand-driven, not reorder-point-driven.
//   belowMinStock    = a SEPARATE, independent informational flag (Current Stock + Open PO < minStock)
//                      shown alongside the suggestion, never blended into the demand-driven formula
//                      above — two distinct signals, not one fabricated composite.
//   "Preferred Vendor" — this codebase has no such master-data field (confirmed by this phase's
//                      audit). Rather than inventing one, this report surfaces `lastPurchasedFrom`,
//                      derived from the most recent non-cancelled PO for this material, explicitly
//                      labeled as a derived proxy, not a formal preferred-vendor designation.
function materialReplenishmentReport(){
  const openMrStatuses = new Set(['SUBMITTED','APPROVED','PARTIALLY_PROCESSED']);
  const activeOrderPoStatuses = new Set(['Submitted','Approved','PartiallyReceived']); // Draft/Cancelled/FullyReceived/Closed excluded
  const rows = DB.materials.filter(m=>m.active && m.stockItem).map(m=>{
    const currentStock = r2(getStockLevel(m.id));
    const openMrs = DB.materialRequirements.filter(r=>r.materialId===m.id && openMrStatuses.has(r.status));
    const openRequirementQty = r2(openMrs.reduce((s,r)=>s+(+r.qty||0),0));
    const available = r2(currentStock - openRequirementQty);
    let openPoQty = 0;
    DB.purchaseOrders.filter(po=>activeOrderPoStatuses.has(po.status)).forEach(po=>{
      po.lines.forEach((l,idx)=>{
        if(l.materialId!==m.id) return;
        const received = po.qtyReceivedByLine[idx]||0;
        openPoQty += Math.max(0, (+l.qty||0) - received);
      });
    });
    openPoQty = r2(openPoQty);
    const suggestedPurchaseQty = r2(Math.max(0, openRequirementQty - currentStock - openPoQty));
    const belowMinStock = !!(m.minStock>0) && (currentStock + openPoQty) < m.minStock;
    // Last-purchased-from — most recent non-cancelled PO line referencing this material, by po.createdAt.
    let lastPurchasedFrom = null, lastPurchaseDate = null;
    DB.purchaseOrders.filter(po=>po.status!=='Cancelled' && po.status!=='Draft' && po.lines.some(l=>l.materialId===m.id))
      .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
      .slice(0,1)
      .forEach(po=>{ const v=DB.vendors.find(x=>x.id===po.vendorId); lastPurchasedFrom = v?v.name:po.vendorId; lastPurchaseDate = po.createdAt; });
    // Linked project(s) / earliest required date — from the open requirements themselves.
    const projectIds = [...new Set(openMrs.map(r=>r.projectId).filter(Boolean))];
    const projectNames = projectIds.map(pid=>{ const p=DB.projects.find(x=>x.id===pid); return p?p.name:pid; });
    const requiredDates = openMrs.map(r=>r.requiredDate).filter(Boolean).sort();
    return {
      materialId:m.id, code:m.code, description:m.description, uom:m.uom,
      currentStock, openRequirementQty, available, openPoQty,
      minStock: m.minStock||0, minStockConfigured: !!(m.minStock>0), belowMinStock,
      suggestedPurchaseQty,
      needsAttention: suggestedPurchaseQty>0.001 || belowMinStock,
      lastPurchasedFrom, lastPurchaseDate,
      project: projectNames.length===0 ? null : (projectNames.length===1 ? projectNames[0] : `Multiple (${projectNames.length})`),
      requiredDate: requiredDates.length ? requiredDates[0] : null,
      openRequirementCount: openMrs.length
    };
  });
  return {
    ok:true, generatedAt:nowIso(),
    note:'Read-only recommendation, not an automated purchase run. "Suggested Purchase Qty" is demand-driven (Open Requirement minus Current Stock minus Open PO); "belowMinStock" is a separate, independent reorder-point signal. "lastPurchasedFrom" is derived from PO history, not a formal Preferred Vendor field (none exists in this codebase).',
    summary: { materialsScanned: rows.length, needingAttention: rows.filter(r=>r.needsAttention).length, belowMinStock: rows.filter(r=>r.belowMinStock).length },
    materials: rows
  };
}

// Forensic finding (this phase's own audit, and confirmed by a pre-existing code comment at
// projectFinancial360() itself): there is no "Budget" master-data field or model anywhere in this
// codebase — `project.budget` IS the customer-facing quotation.finalPrice (selling price), not an
// internal cost plan. A prior phase's brief explicitly instructed "no budget model exists in this
// Lab... do not invent one" — this function honors that: it does NOT add a new Budget field or
// entity anywhere. Instead it SURFACES an existing, already-computed, already-audited number that
// this Lab's own Costing engine produces but never previously exposed as a project-level cost plan:
// costingVersion.baseCost (material+labour+transport+installation+other, BEFORE overhead/profit
// markup — see createCostingVersion()). That is the genuine internal cost estimate a project was
// actually costed and won against, traceable one hop from Project via quotationId -> costingVersionId.
// For a project with no linked quotation (an Admin migration-record project, created directly via
// createProjectMaster()), plannedCost is honestly reported as null with an explicit reason — never
// fabricated.
function projectBudgetVarianceReport(projectId){
  const projects = projectId ? DB.projects.filter(p=>p.id===projectId) : DB.projects;
  const rows = projects.map(p=>{
    const quotation = p.quotationId ? DB.quotations.find(q=>q.id===p.quotationId) : null;
    const costingVersion = quotation && quotation.costingVersionId ? DB.costingVersions.find(c=>c.id===quotation.costingVersionId) : null;
    const plannedCost = costingVersion ? r2(costingVersion.baseCost) : null;
    const contractValue = quotation ? quotation.finalPrice : (p.approvedRevenue||null);
    const commitment = projectCommitments(p.id);
    const core = coreProjectPL(p.id);
    const actualCost = core.cost;
    const forecastCost = r2(commitment.totalRemaining + actualCost);
    const varianceVsActual = plannedCost!=null ? r2(plannedCost - actualCost) : null;
    const varianceVsForecast = plannedCost!=null ? r2(plannedCost - forecastCost) : null;
    const variancePct = (plannedCost!=null && plannedCost>0) ? r2((varianceVsForecast/plannedCost)*100) : null;
    return {
      projectId:p.id, projectName:p.name, status:p.status,
      plannedCost, plannedCostSource: costingVersion ? {quotationId:quotation.id, costingVersionId:costingVersion.id, costingVersionNo:costingVersion.version} : null,
      plannedCostUnavailableReason: plannedCost==null ? (p.quotationId? 'Linked quotation or costing version could not be found.' : 'No linked quotation (migrated/legacy project) — planned cost not available.') : null,
      contractValue,
      commitmentOpen: commitment.totalRemaining, commitmentConsumed: commitment.totalConsumed,
      actualCost, forecastCost,
      varianceVsActual, varianceVsForecast, variancePct,
      status_flag: plannedCost==null ? 'NO_PLAN' : (variancePct==null ? 'N/A' : (variancePct< -10 ? 'OVER_FORECAST' : (variancePct<0 ? 'AT_RISK' : 'WITHIN_PLAN')))
    };
  });
  return {
    ok:true, generatedAt:nowIso(),
    note:'"Planned Cost" is NOT a new Budget field/entity — it is the existing costingVersion.baseCost (internal cost estimate, pre-markup) that this project was actually won against, surfaced here for the first time as a project-level cost plan. Projects with no linked quotation (migration/legacy records) honestly show plannedCost:null rather than a fabricated figure.',
    projects: rows
  };
}

// Phase 12 §13 — HSN Data Quality report. Strictly read-only: reports which materials are
// missing an HSN code, never invents one. "Required?" is a disclosed judgement call (any active
// stock item is flagged as requiring one for GST reporting), not a claim about which specific
// HSN chapter/heading applies — that is business/tax knowledge this Lab does not have and will
// not guess at.
function hsnDataQualityReport(){
  const rows = DB.materials.map(m=>({
    materialId:m.id, code:m.code, description:m.description, active:!!m.active,
    currentHsn: m.hsnCode || null,
    required: !!m.active && !!m.stockItem,
    action: m.hsnCode ? 'None — HSN code on file' : (m.active && m.stockItem ? 'Obtain and enter the correct HSN code from Appletree\'s GST records — left blank here, not guessed' : 'Low priority — inactive or non-stock item')
  }));
  return {
    ok:true, generatedAt:nowIso(),
    note:'Read-only data-quality report. No HSN code is fabricated or inferred here — every material with currentHsn:null genuinely has none on file. "Required" flags active stock items only; it is not a determination of the correct HSN chapter/heading, which requires real GST/tax knowledge this report does not have.',
    summary:{ totalMaterials: rows.length, missingHsn: rows.filter(r=>!r.currentHsn).length, requiredAndMissing: rows.filter(r=>r.required && !r.currentHsn).length },
    materials: rows
  };
}
module.exports = {
  get DB(){ return DB; }, save, resetToFreshSeed, logAudit, withIdempotency, hashPayload,
  withTransaction, setEnforceTransactionBoundary, getEnforceTransactionBoundary,
  assertFiniteNumber, assertPositiveFiniteNumber, assertNonNegativeFiniteNumber, assertNonZeroFiniteNumber,
  ROLES, ROLE_ACTIONS, GL_VISIBLE_ROLES,
  nextDocNumber, postJournalEntry, createDraft, simulateDraft, findDraft, submitDraft, approveDraft, rejectDraft, postDraft, cancelDraft, reverseEntry,
  calcTax, draftCustomerInvoice, draftSupplierInvoice, allLines, customerOpenItems, supplierOpenItems, applyClearing,
  postCustomerReceipt, postSupplierPayment, reconcileAR, reconcileAP, projectPL, AGE_BUCKETS, customerAgeing, supplierAgeing,
  verifyPassword, hashPassword,
  // Phase 6B
  LEAD_STATUSES, ESTIMATION_STATUSES, QUOTATION_STATUSES, PROJECT_STATUSES, DESIGN_STATUSES,
  createLead, canSeeLead, addLeadActivity, changeLeadStatus,
  createEstimationRequest, setEstimationStatus, createCostingVersion,
  createQuotation, requiredDiscountApprovalRole, submitQuotation, approveQuotationDiscount, reviseQuotation, recordAcceptance,
  findOrCreateCustomer, freezeStandardCostBaseline, wonTransition,
  setProjectAdvanceRequirement, draftCustomerAdvance, projectFinancialReadiness,
  submitDesign, reviewDesign, createChangeRequest, approveChangeRequest,
  submitChangeRequest, rejectChangeRequest, reviseChangeRequest, cancelChangeRequest,
  CHANGE_REQUEST_STATUSES, assertChangeRequestQuotationLink, assertBomChangeRequestLink,
  validateVariationAllocations, invoicesConsumingChangeRequest,
  assertDocumentChangeRequestLink, assertPoChangeRequestLink, bomsForChangeRequest, posForChangeRequest,
  materialRequirementBomEntitlement, materialRequirementsForChangeRequest,
  resolveProcurementScope, changeRequestProcurementValueSummary, changeRequestVariationProfitability,
  assertPoSourceDocumentsConsistent, variationActive,
  // Phase 7
  MR_STATUSES, PO_STATUSES,
  createMaterialRequirement, submitMaterialRequirement, approveMaterialRequirement,
  createMaterialRequest, submitMaterialRequest, approveMaterialRequest, rejectMaterialRequest,
  createRFQ, recordSupplierQuotation, createSupplierComparison, approveSupplierComparison,
  requiredPOApprovalRole, createPurchaseOrder, submitPurchaseOrder, approvePurchaseOrder, rejectPurchaseOrder,
  postInventoryMovement, getStockLevel, getMovingAverageRate, createGRN, checkThreeWayMatch, draftSupplierInvoiceFromPO,
  checkInvoiceableBalance, invoiceableGRNsForVendor,
  createPurchaseReturn, createSupplierCreditNote, createMaterialIssue, materialBomQuota, projectCostBreakdown,
  isProjectManagerOf, isSiteInChargeOf, assertCanCreateMaterialIssue, can,
  assertCanClearReceipt, assertCanPaySupplier, assertCanCreateSupplierCreditNote, assertCanCreateSupplierDebitNote,
  assertCanCreateCustomerCreditNote, assertCanCreateCustomerDebitNote, assertCanCreateInventoryAdjustment,
  assertCanCreateGRN, assertCanCreatePurchaseReturn, assertCanRecordLabourWages, assertCanRecordProjectExpense,
  assertCanCapitalizeFixedAsset, assertCanDisposeFixedAsset, assertCanPostAssetDepreciation, assertCanTransferBankFunds,
  assertCanPostBankImportLine, assertCanPostProductionLabourCost, assertCanPostServiceLabourCost,
  assertCanPostInstallationLabourCost, assertCanRecognizeAMCRevenue, assertCanReplenishPettyCash, assertCanReverseITCForWriteOff,
  assertCanCreateInventoryTransfer, assertCanImportMasterData, assertCanIssueToSite, assertCanDispatchToJobWorker,
  assertCanReturnFromJobWorker, assertCanRecordJobWorkScrap, assertCanDirectDispatchFromJobWorker,
  CAPABILITY_REGISTRY, checkWritePointCapability, validateCapabilityRegistry, looksLikeRealAuthorizationCheck, EXPECTED_CAPABILITIES,
  GL_OPERATION_BINDING, INVENTORY_OPERATION_BINDING, checkOperationBinding, checkContentBinding, AR_SIDE_CAPABILITIES, AP_SIDE_CAPABILITIES,
  maxIdSuffix, nextId, assertProjectOpenForPosting, setTestFaultPoint, assertCanTransferFixedAsset, setSkipRollbackForBeforeTest, setTestCrashPoint,
  createSupplierDebitNote, SUPPLIER_DEBIT_NOTE_REASONS,
  cancelApprovedPurchaseOrder, projectCommitments,
  createBOM, approveBOM, createProductionOrder, issueProductionMaterial, postProductionLabourCost, completeProductionOrder,
  holdProductionOrder, resumeProductionOrder, cancelProductionOrder, closeProductionOrder,
  // Phase 8
  PROD_STATUSES, DISPATCH_STATUSES, INSTALLATION_STATUSES, QC_STATUSES, SNAG_STATUSES, SNAG_SEVERITIES, MILESTONE_TYPES,
  createDispatch, dispatchReadinessCheck, markDispatchReady, approveDispatch, markDispatched,
  createDelivery, createInstallation, updateInstallationProgress,
  createQCChecklist, submitQCResult,
  createSnag, assignSnag, resolveSnag, verifySnag, closeSnag,
  handoverReadinessCheck, createHandover,
  createBillingMilestone, markMilestoneReady, draftCustomerInvoiceFromMilestone,
  projectClosureReadiness, closeProject,
  // Phase 10 — After-Sales
  COMPLAINT_STATUSES, TICKET_CLASSIFICATIONS, TICKET_STATUSES, VISIT_STATUSES, AMC_STATUSES, CAPA_STATUSES, CAPA_TRIGGERS,
  createWarranty, warrantyEffectiveStatus, voidWarranty, cancelWarranty, warrantyEligibility,
  createComplaint, triageComplaint, changeComplaintStatus,
  createServiceTicket, assignServiceTicket, escalateServiceTicket, setTicketClassification,
  createServiceVisit, startServiceVisit, recordDiagnosis, completeServiceVisit, cancelServiceVisit,
  issueServiceMaterial, postServiceLabourCost, serviceTicketCostBreakdown, draftServiceInvoice,
  createAMCContract, activateAMCContract, cancelAMCContract, renewAMCContract, createAMCScheduleEntry, linkAMCScheduleToTicket, draftAMCBillingInvoice,
  amcRevenueSchedule, recognizeAMCRevenue, amcBilledTotal, amcRecognizedTotal, createRebillMilestone,
  createCAPACase, recordCAPAAnalysis, recordCAPAAction, recordCAPAVerification, recordCAPAEffectivenessCheck, closeCAPACase,
  serviceTicketClosureReadiness, closeServiceTicket, rejectServiceTicket,
  // Phase 13 — Approved Policy Implementation
  setServiceLabourRate, getServiceLabourRate,
  diagnosisRequiresApproval, approveDiagnosis, setPolicyConfig, ticketSlaStatus,
  repeatComplaintHistory, customerAfterSalesSummary,
  // Phase 11 — Financial Integration
  afterSalesFinancials, coreProjectPL, projectFinancial360, customerProfitability, companyAfterSalesSummary,
  // Phase 13
  companyProjectProfitability, generateExport,
  // Phase 14 — SAP-Style Accounting Entry Architecture
  attachFile, listAttachments, getAttachment, deleteAttachment,
  createCustomerCreditNote, createCustomerDebitNote,
  createInventoryTransfer, createInventoryAdjustment,
  createJournalTemplate, listJournalTemplates, createDraftFromTemplate,
  createRecurringEntry, listRecurringEntries, generateDueRecurringDrafts,
  parseImportCsv, importJournalCSV,
  branchAllowed, entryTypeCatalogue,
  // Phase 15
  postInstallationLabourCost,
  createProfitCentre, listProfitCentres,
  listBankAccounts, createBankAccount, importBankStatement, matchBankStatementLine, unmatchBankStatementLine, bankReconciliationStatus,
  // Phase 18 §2/§3 — Financial Period Control
  listFinancialPeriods, createFinancialPeriod, closeFinancialPeriod, reopenFinancialPeriod, setPeriodOverrideRole, periodCloseReconciliation, findPeriodForDate,
  // Phase 19 §4/§5 — HSN / Customer GSTIN
  setMaterialHSN, setCustomerGSTIN,
  // Phase 20 §3/§4 — Master Data Import Framework
  createVendorMaster, createMaterialMaster, createProjectMaster, createCostCentreMaster, createTaxCodeMaster, createPaymentMethodMaster, createAccountMaster,
  importMasterData, MASTER_IMPORT_SPECS,
  // Phase 21 §5/§6/§7/§8 — Master Data Edit/Deactivate + UoM Conversion
  editCustomer, setCustomerActive, editVendorMaster, setVendorActive, editMaterialMaster, setMaterialActive, setMaterialUomConversion,
  // Phase 21 §17 — Tax / Customer Advance reconciliation reports
  reconcileOutputTax, reconcileInputTax, reconcileCustomerAdvances,
  // Phase 24 Part A — Multi-Bank/Cash GL Segregation
  bankAccountBalances, createBankTransfer,
  // Phase 20 §7-§10 — Opening Balance Engine
  importOpeningBalance, reconcileOpeningBalances, OPENING_BALANCE_SPECS,
  // Phase 19 §28 — Password Security
  validatePasswordStrength, createUser, resetUserPassword, changeOwnPassword,
  // Phase 19 §26/§27 — Fixed Assets
  createFixedAsset, capitalizeFixedAsset, postAssetDepreciation, transferFixedAsset, disposeFixedAsset,
  listFixedAssets, reconcileFixedAssets, assetAccumulatedDepreciation, assetNetBookValue, computeStraightLineMonthly,
  // Phase 19 §7-19 — ICICI Bank Import
  parseICICICsv, createBankImportBatch, listBankImportLines, matchBankImportLine, unmatchBankImportLine,
  excludeBankImportLine, markBankImportLineReturned, postBankImportLine, reconcileBankImportLine, bankImportReconciliationSummary,
  // Phase 19 §25 — Annual Document Numbering
  financialYearKey,
  setProjectBranch, projectBranch,
  // Phase 17
  createBackup, listBackups, restoreBackup, validateRestoreCandidate, validateDatabaseSnapshot,
  // Phase 30 — company-wide financial statements + ledgers
  companyBalanceSheet, companyProfitAndLoss, generalLedger, customerLedger, supplierLedger,
  // Phase 28 — Purchases Intelligence / Inventory Operations / Operations / Factory-MES
  createLocation, stockByLocation, stockReport,
  DAMAGE_REPORT_REASONS, createDamageReport,
  createStockCount, submitStockCount,
  procurementIntelligence, vendorRating, purchaseVendorReport,
  recordLabourWages, recordProjectExpense, qcDashboard,
  createTimesheetEntry, TASK_STATUSES, createTask, updateTaskStatus,
  createRiskEntry, closeRiskEntry, captureWeeklySnapshot,
  MACHINE_STATUSES, createMachine, setMachineStatus,
  JOB_CARD_STATUSES, createJobCard, startJobCard, completeJobCard,
  productionSchedule, factoryDashboard, jobAnalysis, jobCostSheet, productCosting, labourPerformance,
  // Phase 33 — Finance SOP Compliance & Control Implementation
  createSite, listSites, setSiteActive,
  setCompanyGSTConfig, setCustomerState, determinePlaceOfSupply,
  PR_STATUSES, createPurchaseRequisition, submitPurchaseRequisition, approvePurchaseRequisition, rejectPurchaseRequisition,
  isCashPayment, checkCashLimit,
  fyStartDateFor, sellerCumulativePurchases, sellerCumulativeReport,
  TDS_CATEGORIES, computeTDS, tdsComplianceSummary,
  getSiteStockLevel, getSiteMovingAverageRate,
  MRS_STATUSES, createSiteMaterialRequisition, submitSiteMaterialRequisition, approveSiteMaterialRequisition, rejectSiteMaterialRequisition,
  issueToSite, createSiteMaterialReceipt, siteMaterialReconciliationReport,
  paymentApprovalRoleFor, createPaymentRequest, approvePaymentRequest, rejectPaymentRequest, executePaymentRequest,
  setPaymentApprovalTiers, submitPaymentApprovalMatrixForReview, approvePaymentApprovalMatrix,
  createPettyCashFloat, recordPettyCashVoucher, pettyCashReconciliation, replenishPettyCashFloat,
  cashControlExceptionsReport, sopComplianceDashboard,
  // Phase 34 — Job Work/APOB, Ship-to GSTIN, E-way Bill, ITC control, BOQ variance, payment policy
  createJobWorker, setJobWorkerActive, getJobWorkerStockLevel, JOB_WORK_ORDER_STATUSES,
  dispatchToJobWorker, returnFromJobWorker, JOB_WORK_SCRAP_DISPOSITIONS, recordJobWorkScrap, directDispatchFromJobWorker,
  jobWorkAgingReport, requestJobWorkExtension, approveJobWorkExtension,
  createAPOBDeclaration, setAPOBDeclarationActive,
  shipToGstinRequired, ewayBillRequired, createEwayBillRecord, recordEwayBillNumber,
  reverseITCForWriteOff, itcReversalReport,
  projectBOQVarianceReport,
  paymentCategoryPolicyStatus, setThreeWayMatchPolicyConfirmed,
  // Phase 36 — one-click demo scenario + document flow traceability
  seedDemoScenario, projectDocumentTrace,
  // BOM Governance phase — real project-level BOM entitlement, maker-checker excess approval
  BOM_STATUSES, submitBOM, rejectBOM, projectBomEntitlement, activeBomsFor,
  createExcessMaterialIssueRequest, approveExcessMaterialIssueRequest, rejectExcessMaterialIssueRequest,
  cancelExcessMaterialIssueRequest, assertCanApproveExcessMaterialIssue, bomConsumptionReport,
  // Phase 5 — Material Analytics & Cross-Dimensional Reporting
  materialMovementFlow, materialRateHistory, materialByProject, materialByVendor, materialByProjectVendor,
  warehouseVsSiteAnalysis, vendorProjectMatrix, projectMaterialPlanVsActual, projectVariationSummary,
  // Phase 6 — Labour Analytics, Global Search, Accountant/Management MIS
  labourWageEntries, labourCostByProject, labourIdentityQualityReport,
  accountantMisSummary, managementMisSummary,
  // Phase 7 — Report Variants
  createReportVariant, listReportVariants, renameReportVariant, deleteReportVariant, toggleFavoriteReportVariant,
  orphanReconciliationReport,
  // P0 Remediation phase — project creation control, invoice billing ceiling + excess approval,
  // goods-vendor 3-way-match enforcement, BOM numbering (BOM numbering fix has no new exports —
  // createBOM/approveBOM etc. are unchanged in shape, only their internals)
  projectBillingCeiling, createExcessBillingApprovalRequest, approveExcessBillingApprovalRequest,
  rejectExcessBillingApprovalRequest, cancelExcessBillingApprovalRequest, assertCanApproveExcessBilling,
  vendorRequiresThreeWayMatch,
  // Targeted P1 Remediation phase — real Site Return
  returnFromSite, assertCanReturnFromSite, SITE_RETURN_CONDITIONS,
  // Phase 10 — SAP Enterprise Capability Benchmark: MRP/Replenishment recommendation +
  // Project Budget/Commitment/Actual/Variance (both strictly read-only)
  materialReplenishmentReport, projectBudgetVarianceReport,
  // Phase 12 — Critical Control Remediation: PO self-approval policy framework, closed-period
  // Project Expense fix (no new export — internal-only change), HSN data quality (read-only)
  poApprovalAuthorityFor, setPOApprovalAuthorityMatrix, submitPOApprovalAuthorityMatrixForReview,
  approvePOApprovalAuthorityMatrix, hsnDataQualityReport
};
