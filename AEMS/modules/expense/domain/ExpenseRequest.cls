VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpenseRequest"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
' Aggregate root of the Expense bounded context. Owns its ApprovalChain
' (composition -- saved/loaded together, see docs/SDD.md #1) and is the only
' place that changes its own Status; all transitions delegate the actual
' workflow rule-checking to the chain and then map the result back.
'
' No Excel/VBA-object-model references here -- see docs/ARCHITECTURE.md #5
' and docs/CODING_STANDARDS.md #1.
'
' The pModifiedAt/pModifiedBy update is inlined at each transition method
' rather than factored into a shared private helper. Originally a defensive
' workaround for a hang; that hang's real cause turned out to be a
' Property/parameter name collision (docs/CODING_STANDARDS.md #1a), now
' fixed. Left inlined since it's proven working; not a hard rule.

Private pId As String
Private pRequesterId As String
Private pCategory As String
Private pDescription As String
Private pCurrency As String
Private pStatus As ExpenseStatus
Private pCreatedAt As Date
Private pCreatedBy As String
Private pModifiedAt As Date
Private pModifiedBy As String
Private pLineItems As Collection
Private pAttachments As Collection
Private pChain As ApprovalChain

Private Sub Class_Initialize()
    Set pLineItems = New Collection
    Set pAttachments = New Collection
    pCurrency = "INR" ' fixed -- see docs/BRD.md #6 on currency scope
    pStatus = esDraft
End Sub

' Parameters are "in"-prefixed to avoid matching this class's own Property
' names case-insensitively: a parameter named e.g. "createdAt" colliding
' with the "CreatedAt" property broke this class's cross-module member
' resolution entirely (confirmed the hard way -- see the Hydrate note
' below for the fuller writeup).
Public Sub Init(inId As String, inRequesterId As String, inCategory As String, inDescription As String, ByVal inCreatedAt As Date)
    pId = inId
    pRequesterId = inRequesterId
    pCategory = inCategory
    pDescription = inDescription
    pCreatedAt = inCreatedAt
    pCreatedBy = inRequesterId
    pModifiedAt = inCreatedAt
    pModifiedBy = inRequesterId
End Sub

Public Property Get Id() As String
    Id = pId
End Property

Public Property Get RequesterId() As String
    RequesterId = pRequesterId
End Property

Public Property Get Category() As String
    Category = pCategory
End Property

Public Property Get Description() As String
    Description = pDescription
End Property

' Named CurrencyCode, not Currency: a property named "Currency" collides
' with the built-in VBA Currency data type used elsewhere in this class
' (TotalAmount's return type below) and silently breaks external member
' resolution ("Method or data member not found" on expense.Currency) even
' though the class otherwise compiles -- confirmed the hard way.
Public Property Get CurrencyCode() As String
    CurrencyCode = pCurrency
End Property

Public Property Get Status() As ExpenseStatus
    Status = pStatus
End Property

Public Property Get CreatedAt() As Date
    CreatedAt = pCreatedAt
End Property

Public Property Get CreatedBy() As String
    CreatedBy = pCreatedBy
End Property

Public Property Get ModifiedAt() As Date
    ModifiedAt = pModifiedAt
End Property

Public Property Get ModifiedBy() As String
    ModifiedBy = pModifiedBy
End Property

Public Property Get LineItems() As Collection
    Set LineItems = pLineItems
End Property

Public Property Get Attachments() As Collection
    Set Attachments = pAttachments
End Property

Public Property Get Chain() As ApprovalChain
    Set Chain = pChain
End Property

' Double, not Currency: see the note on ExpenseLineItem's Amount for why
' the Currency VBA type is avoided everywhere in this codebase.
Public Property Get TotalAmount() As Double
    Dim li As ExpenseLineItem
    Dim total As Double
    total = 0
    For Each li In pLineItems
        total = total + li.Amount
    Next li
    TotalAmount = total
End Property

Public Sub AddLineItem(item As ExpenseLineItem)
    If pStatus <> esDraft Then
        Err.Raise 10002, "ExpenseRequest.AddLineItem", "Cannot modify line items once submitted."
    End If
    pLineItems.Add item
End Sub

Public Sub AddAttachment(fileReference As String)
    pAttachments.Add fileReference
End Sub

Public Sub Submit(idGen As IIdGenerator, clock As IClock)
    If pStatus <> esDraft Then
        Err.Raise 10003, "ExpenseRequest.Submit", "Only a Draft request can be submitted."
    End If
    If pLineItems.Count = 0 Then
        Err.Raise 10004, "ExpenseRequest.Submit", "At least one line item is required to submit."
    End If
    Set pChain = New ApprovalChain
    pChain.Init pId, idGen
    pChain.Start pRequesterId, clock
    pStatus = esPendingSupervisor
    pModifiedAt = clock.UtcNow()
    pModifiedBy = pRequesterId
End Sub

Public Sub Resubmit(actorId As String, clock As IClock)
    If pStatus <> esNeedsClarification Then
        Err.Raise 10005, "ExpenseRequest.Resubmit", "Only a NeedsClarification request can be resubmitted."
    End If
    EnsureChain "Resubmit"
    pChain.Resubmit actorId, clock
    pStatus = RoleToStatus(pChain.CurrentRole)
    pModifiedAt = clock.UtcNow()
    pModifiedBy = actorId
End Sub

Public Sub Approve(actorId As String, comment As String, clock As IClock)
    EnsureChain "Approve"
    pChain.Approve actorId, comment, clock
    If pChain.IsComplete Then
        pStatus = esApprovedForPayment
    Else
        pStatus = RoleToStatus(pChain.CurrentRole)
    End If
    pModifiedAt = clock.UtcNow()
    pModifiedBy = actorId
End Sub

Public Sub Reject(actorId As String, reason As String, clock As IClock)
    EnsureChain "Reject"
    pChain.Reject actorId, reason, clock
    pStatus = esRejected
    pModifiedAt = clock.UtcNow()
    pModifiedBy = actorId
End Sub

Public Sub SendBack(actorId As String, reason As String, clock As IClock)
    EnsureChain "SendBack"
    pChain.SendBack actorId, reason, clock
    pStatus = esNeedsClarification
    pModifiedAt = clock.UtcNow()
    pModifiedBy = actorId
End Sub

Public Sub Escalate(actorId As String, toUserId As String, clock As IClock)
    EnsureChain "Escalate"
    pChain.Escalate actorId, toUserId, clock
    pModifiedAt = clock.UtcNow()
    pModifiedBy = actorId
End Sub

Public Sub Reassign(fromUserId As String, toUserId As String, clock As IClock)
    EnsureChain "Reassign"
    pChain.Reassign fromUserId, toUserId, clock
    pModifiedAt = clock.UtcNow()
    pModifiedBy = fromUserId
End Sub

Public Sub MarkPaid()
    If pStatus <> esApprovedForPayment Then
        Err.Raise 10006, "ExpenseRequest.MarkPaid", "Only a request ApprovedForPayment can be marked Paid."
    End If
    pStatus = esPaid
End Sub

Private Sub EnsureChain(caller As String)
    If pChain Is Nothing Then
        Err.Raise 10007, "ExpenseRequest." & caller, "Request has not been submitted -- no approval chain exists."
    End If
End Sub

' -- Repository-only hydration. Public rather than Friend: Friend-scoped
' procedures were not resolving as callable members across modules in this
' VBA project (confirmed via a real compile error, not a style choice) --
' Public is the only access level that reliably works here, so this is an
' enforced-by-review convention, not a compiler-enforced boundary. Bypasses
' business-rule checks deliberately: reloading a valid saved record is not
' a business transition. Never call these outside modules/expense/persistence.
'
' Parameters are "in"-prefixed (see Init above): a parameter matching a
' Property name case-insensitively (e.g. createdAt vs. the CreatedAt
' property) silently broke this class's members from resolving when called
' from another module -- "Method or data member not found" on the *first*
' external call site touched (expense.Hydrate here), regardless of which
' colliding parameter actually caused it. Confirmed by removing all
' collisions across every hydration method in this codebase and watching
' the compile error disappear. This is now a hard rule -- see
' docs/CODING_STANDARDS.md #1a.
Public Sub Hydrate(inId As String, inRequesterId As String, inCategory As String, inDescription As String, inCurrency As String, inStatus As ExpenseStatus, ByVal inCreatedAt As Date, inCreatedBy As String, ByVal inModifiedAt As Date, inModifiedBy As String)
    pId = inId
    pRequesterId = inRequesterId
    pCategory = inCategory
    pDescription = inDescription
    pCurrency = inCurrency
    pStatus = inStatus
    pCreatedAt = inCreatedAt
    pCreatedBy = inCreatedBy
    pModifiedAt = inModifiedAt
    pModifiedBy = inModifiedBy
End Sub

Public Sub HydrateLineItem(item As ExpenseLineItem)
    pLineItems.Add item
End Sub

Public Sub HydrateAttachment(fileReference As String)
    pAttachments.Add fileReference
End Sub

Public Sub HydrateChain(chain As ApprovalChain)
    Set pChain = chain
End Sub

Private Function RoleToStatus(role As ApprovalRole) As ExpenseStatus
    Select Case role
        Case arSupervisor:   RoleToStatus = esPendingSupervisor
        Case arStore:        RoleToStatus = esPendingStore
        Case arAccounts:     RoleToStatus = esPendingAccounts
        Case arDirector:     RoleToStatus = esPendingDirector
        Case arAccountsHead: RoleToStatus = esPendingAccountsHead
    End Select
End Function
