VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ApproveStepUseCase"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit

Private mRepo As IExpenseRepository
Private mClock As IClock

Public Sub Init(repo As IExpenseRepository, clock As IClock)
    Set mRepo = repo
    Set mClock = clock
End Sub

Public Sub Execute(expenseId As String, actorId As String, Optional comment As String = vbNullString)
    Dim expense As ExpenseRequest
    Set expense = mRepo.GetById(expenseId)
    expense.Approve actorId, comment, mClock
    mRepo.Save expense
End Sub
