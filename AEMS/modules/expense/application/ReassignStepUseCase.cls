VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ReassignStepUseCase"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
' v1 reassignment is self-only (the current assignee hands off their own
' pending action) -- see docs/WORKFLOW.md "Open questions".

Private mRepo As IExpenseRepository
Private mClock As IClock

Public Sub Init(repo As IExpenseRepository, clock As IClock)
    Set mRepo = repo
    Set mClock = clock
End Sub

Public Sub Execute(expenseId As String, fromUserId As String, toUserId As String)
    Dim expense As ExpenseRequest
    Set expense = mRepo.GetById(expenseId)
    expense.Reassign fromUserId, toUserId, mClock
    mRepo.Save expense
End Sub
