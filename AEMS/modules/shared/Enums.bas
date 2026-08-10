Attribute VB_Name = "Enums"
Option Explicit
' Shared kernel: status/role enums used across the Expense, Approval, and
' Payment bounded contexts. No business rules here -- see ApprovalChain
' (modules/approval/domain) for transition rules.

Public Enum ExpenseStatus
    esDraft = 0
    esPendingSupervisor = 1
    esPendingStore = 2
    esPendingAccounts = 3
    esPendingDirector = 4
    esPendingAccountsHead = 5
    esApprovedForPayment = 6
    esPaid = 7
    esRejected = 8
    esNeedsClarification = 9
End Enum

Public Enum ApprovalRole
    arSupervisor = 0
    arStore = 1
    arAccounts = 2
    arDirector = 3
    arAccountsHead = 4
End Enum

Public Enum ApprovalStepStatus
    assPending = 0
    assApproved = 1
    assRejected = 2
    assSentBack = 3
    assSkipped = 4
End Enum

Public Enum ApprovalAction
    aaSubmit = 0
    aaApprove = 1
    aaReject = 2
    aaSendBack = 3
    aaResubmit = 4
    aaEscalate = 5
    aaReassign = 6
End Enum

Public Enum PaymentStatus
    psAwaitingPayment = 0
    psPaid = 1
    psReversed = 2
End Enum
