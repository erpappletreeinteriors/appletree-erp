VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "SubmitExpenseUseCase"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
' Application layer: orchestrates repository + domain, contains no business
' rules itself (those live in ExpenseRequest/ApprovalChain). See
' docs/SDD.md #5.

Private mRepo As IExpenseRepository
Private mClock As IClock
Private mIdGen As IIdGenerator

Public Sub Init(repo As IExpenseRepository, clock As IClock, idGen As IIdGenerator)
    Set mRepo = repo
    Set mClock = clock
    Set mIdGen = idGen
End Sub

Public Function Execute(requesterId As String, category As String, description As String, lineItems As Collection) As ExpenseRequest
    Dim expense As New ExpenseRequest
    expense.Init mIdGen.NewId(), requesterId, category, description, mClock.UtcNow()

    Dim li As ExpenseLineItem
    For Each li In lineItems
        expense.AddLineItem li
    Next li

    expense.Submit mIdGen, mClock
    mRepo.Save expense
    Set Execute = expense
End Function
