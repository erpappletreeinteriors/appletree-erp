VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ApprovalHistoryEntry"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
' Immutable audit-trail entry -- once created via Init, never edited or
' deleted. See docs/SDD.md #1.

Private pId As String
Private pExpenseId As String
Private pStepRole As ApprovalRole
Private pAction As ApprovalAction
Private pActorId As String
Private pTimestamp As Date
Private pComment As String

' Parameters are "in"-prefixed to avoid colliding with this class's own
' Property names -- see docs/CODING_STANDARDS.md #1a.
Public Sub Init(inId As String, inExpenseId As String, inStepRole As ApprovalRole, inAction As ApprovalAction, inActorId As String, ByVal inTimestamp As Date, inComment As String)
    pId = inId
    pExpenseId = inExpenseId
    pStepRole = inStepRole
    pAction = inAction
    pActorId = inActorId
    pTimestamp = inTimestamp
    pComment = inComment
End Sub

Public Property Get Id() As String
    Id = pId
End Property

Public Property Get ExpenseId() As String
    ExpenseId = pExpenseId
End Property

Public Property Get StepRole() As ApprovalRole
    StepRole = pStepRole
End Property

Public Property Get Action() As ApprovalAction
    Action = pAction
End Property

Public Property Get ActorId() As String
    ActorId = pActorId
End Property

Public Property Get Timestamp() As Date
    Timestamp = pTimestamp
End Property

Public Property Get Comment() As String
    Comment = pComment
End Property
