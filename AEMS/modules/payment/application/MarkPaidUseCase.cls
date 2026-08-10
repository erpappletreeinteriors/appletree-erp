VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "MarkPaidUseCase"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
' Crosses the Expense and Payment aggregates -- acceptable at the
' application layer (see docs/SDD.md #5): loads both, applies each
' aggregate's own domain method, saves both. Neither aggregate reaches into
' the other's internals directly.

Private mExpenseRepo As IExpenseRepository
Private mPaymentRepo As IPaymentRepository
Private mClock As IClock
Private mIdGen As IIdGenerator

Public Sub Init(expenseRepo As IExpenseRepository, paymentRepo As IPaymentRepository, clock As IClock, idGen As IIdGenerator)
    Set mExpenseRepo = expenseRepo
    Set mPaymentRepo = paymentRepo
    Set mClock = clock
    Set mIdGen = idGen
End Sub

Public Sub Execute(expenseId As String, paidBy As String, paymentReference As String, method As String)
    Dim expense As ExpenseRequest
    Set expense = mExpenseRepo.GetById(expenseId)

    Dim payment As New PaymentRecord
    payment.Init mIdGen.NewId(), expenseId, method
    payment.MarkPaid paidBy, paymentReference, mClock.UtcNow()

    expense.MarkPaid

    mPaymentRepo.Save payment
    mExpenseRepo.Save expense
End Sub
