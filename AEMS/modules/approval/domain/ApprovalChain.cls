VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ApprovalChain"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
' The Approval bounded context's core state machine. Owns the fixed 5-step
' chain (Supervisor -> Store -> Accounts -> Director -> Accounts Head) and
' enforces all legal transitions -- see docs/WORKFLOW.md for the confirmed
' chain and docs/SDD.md #2-3 for the state diagram and design rationale.
'
' Deliberately not a generic/config-driven workflow engine (KISS -- see
' docs/CODING_STANDARDS.md #3): there is exactly one workflow today.

Private pExpenseId As String
Private pIdGen As IIdGenerator
Private pSteps As Collection       ' ordered Collection of ApprovalStep
Private pHistory As Collection     ' ordered Collection of ApprovalHistoryEntry
Private pCurrentStepIndex As Long  ' 1-based index into pSteps
Private pReturnToStepIndex As Long ' 0 = none awaiting resubmission
Private pComplete As Boolean

Private Sub Class_Initialize()
    Set pSteps = New Collection
    Set pHistory = New Collection
    pCurrentStepIndex = 0
    pReturnToStepIndex = 0
    pComplete = False
End Sub

' inExpenseId, not expenseId: colliding with the ExpenseId Property name
' (case-insensitively) breaks this class's members from resolving when
' called from another module -- see docs/CODING_STANDARDS.md #1a.
Public Sub Init(inExpenseId As String, idGen As IIdGenerator)
    pExpenseId = inExpenseId
    Set pIdGen = idGen
End Sub

Public Property Get ExpenseId() As String
    ExpenseId = pExpenseId
End Property

Public Property Get Steps() As Collection
    Set Steps = pSteps
End Property

Public Property Get History() As Collection
    Set History = pHistory
End Property

Public Property Get IsComplete() As Boolean
    IsComplete = pComplete
End Property

' Read-only state exposure for persistence/display -- not a business-rule
' bypass, just visibility into current position.
Public Property Get CurrentStepIndex() As Long
    CurrentStepIndex = pCurrentStepIndex
End Property

Public Property Get ReturnToStepIndex() As Long
    ReturnToStepIndex = pReturnToStepIndex
End Property

Public Property Get CurrentStep() As ApprovalStep
    Set CurrentStep = pSteps(pCurrentStepIndex)
End Property

Public Property Get CurrentRole() As ApprovalRole
    CurrentRole = CurrentStep.Role
End Property

Public Sub Start(requesterId As String, clock As IClock)
    If pSteps.Count > 0 Then
        Err.Raise 10100, "ApprovalChain.Start", "Chain already started."
    End If
    AddStep arSupervisor
    AddStep arStore
    AddStep arAccounts
    AddStep arDirector
    AddStep arAccountsHead
    pCurrentStepIndex = 1
    AppendHistory arSupervisor, aaSubmit, requesterId, clock, "Submitted for approval."
End Sub

Public Sub Approve(actorId As String, comment As String, clock As IClock)
    Dim step As ApprovalStep
    Set step = CurrentStep
    EnsurePending step, "Approve"
    step.RecordAction assApproved, actorId, clock.UtcNow(), comment
    AppendHistory step.Role, aaApprove, actorId, clock, comment
    If pCurrentStepIndex = pSteps.Count Then
        pComplete = True
    Else
        pCurrentStepIndex = pCurrentStepIndex + 1
    End If
End Sub

Public Sub Reject(actorId As String, reason As String, clock As IClock)
    Dim step As ApprovalStep
    Set step = CurrentStep
    EnsurePending step, "Reject"
    If Len(Trim$(reason)) = 0 Then
        Err.Raise 10101, "ApprovalChain.Reject", "A reason is required to reject."
    End If
    step.RecordAction assRejected, actorId, clock.UtcNow(), reason
    AppendHistory step.Role, aaReject, actorId, clock, reason
End Sub

Public Sub SendBack(actorId As String, reason As String, clock As IClock)
    Dim step As ApprovalStep
    Set step = CurrentStep
    EnsurePending step, "SendBack"
    If Len(Trim$(reason)) = 0 Then
        Err.Raise 10102, "ApprovalChain.SendBack", "A reason is required to send back."
    End If
    step.RecordAction assSentBack, actorId, clock.UtcNow(), reason
    pReturnToStepIndex = pCurrentStepIndex
    AppendHistory step.Role, aaSendBack, actorId, clock, reason
End Sub

Public Sub Resubmit(actorId As String, clock As IClock)
    If pReturnToStepIndex = 0 Then
        Err.Raise 10103, "ApprovalChain.Resubmit", "No step is awaiting resubmission."
    End If
    Dim step As ApprovalStep
    Set step = pSteps(pReturnToStepIndex)
    step.ResetToPending
    pCurrentStepIndex = pReturnToStepIndex
    pReturnToStepIndex = 0
    AppendHistory step.Role, aaResubmit, actorId, clock, "Resubmitted after clarification."
End Sub

Public Sub Escalate(actorId As String, toUserId As String, clock As IClock)
    Dim step As ApprovalStep
    Set step = CurrentStep
    EnsurePending step, "Escalate"
    step.AssignedUserId = toUserId
    AppendHistory step.Role, aaEscalate, actorId, clock, "Escalated to " & toUserId
End Sub

Public Sub Reassign(fromUserId As String, toUserId As String, clock As IClock)
    Dim step As ApprovalStep
    Set step = CurrentStep
    EnsurePending step, "Reassign"
    If step.AssignedUserId <> fromUserId Then
        Err.Raise 10104, "ApprovalChain.Reassign", "Only the currently assigned approver can reassign this step."
    End If
    step.AssignedUserId = toUserId
    AppendHistory step.Role, aaReassign, fromUserId, clock, "Reassigned to " & toUserId
End Sub

' Repository-only hydration -- see ExpenseRequest.Hydrate for rationale.
Public Sub HydrateStep(step As ApprovalStep)
    pSteps.Add step
End Sub

Public Sub HydrateHistoryEntry(entry As ApprovalHistoryEntry)
    pHistory.Add entry
End Sub

Public Sub HydrateState(currentStepIndex As Long, returnToStepIndex As Long, isComplete As Boolean)
    pCurrentStepIndex = currentStepIndex
    pReturnToStepIndex = returnToStepIndex
    pComplete = isComplete
End Sub

Private Sub AddStep(role As ApprovalRole)
    Dim s As New ApprovalStep
    s.Init role
    pSteps.Add s
End Sub

Private Sub EnsurePending(step As ApprovalStep, caller As String)
    If step.Status <> assPending Then
        Err.Raise 10105, "ApprovalChain." & caller, "Current step is not Pending."
    End If
End Sub

Private Sub AppendHistory(role As ApprovalRole, action As ApprovalAction, actorId As String, clock As IClock, comment As String)
    Dim entry As New ApprovalHistoryEntry
    entry.Init pIdGen.NewId(), pExpenseId, role, action, actorId, clock.UtcNow(), comment
    pHistory.Add entry
End Sub
