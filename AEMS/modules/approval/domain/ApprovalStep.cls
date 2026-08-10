VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ApprovalStep"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
' One step in an ApprovalChain -- a single role's pending/decided action.
' Part of the Expense aggregate (see docs/SDD.md #1); never persisted alone.

Private pRole As ApprovalRole
Private pAssignedUserId As String
Private pStatus As ApprovalStepStatus
Private pActedBy As String
Private pActedAt As Date
Private pComment As String

' Parameters are "in"-prefixed to avoid colliding with this class's own
' Property names -- see docs/CODING_STANDARDS.md #1a.
Public Sub Init(inRole As ApprovalRole)
    pRole = inRole
    pStatus = assPending
    pAssignedUserId = vbNullString
End Sub

Public Property Get Role() As ApprovalRole
    Role = pRole
End Property

Public Property Get AssignedUserId() As String
    AssignedUserId = pAssignedUserId
End Property

Public Property Let AssignedUserId(ByVal value As String)
    pAssignedUserId = value
End Property

Public Property Get Status() As ApprovalStepStatus
    Status = pStatus
End Property

Public Property Get ActedBy() As String
    ActedBy = pActedBy
End Property

Public Property Get ActedAt() As Date
    ActedAt = pActedAt
End Property

Public Property Get Comment() As String
    Comment = pComment
End Property

Public Sub RecordAction(newStatus As ApprovalStepStatus, actorId As String, ByVal occurredAt As Date, inComment As String)
    pStatus = newStatus
    pActedBy = actorId
    pActedAt = occurredAt
    pComment = inComment
End Sub

Public Sub ResetToPending()
    pStatus = assPending
    pActedBy = vbNullString
    pActedAt = 0
    pComment = vbNullString
End Sub

' Repository-only hydration -- see ExpenseRequest.Hydrate for rationale
' (both the Public-not-Friend point and the "in"-prefixed parameters).
Public Sub Hydrate(inRole As ApprovalRole, inAssignedUserId As String, inStatus As ApprovalStepStatus, inActedBy As String, ByVal inActedAt As Date, inComment As String)
    pRole = inRole
    pAssignedUserId = inAssignedUserId
    pStatus = inStatus
    pActedBy = inActedBy
    pActedAt = inActedAt
    pComment = inComment
End Sub
