VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "PaymentRecord"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
' Aggregate root of the Payment bounded context. Method values are TBD
' pending docs/BRD.md -- stored as free text for now, not an enum, so no
' business list is invented here.

Private pId As String
Private pExpenseId As String
Private pStatus As PaymentStatus
Private pMethod As String
Private pPaidAt As Date
Private pPaidBy As String
Private pPaymentReference As String

' Parameters are "in"-prefixed to avoid colliding with this class's own
' Property names -- see docs/CODING_STANDARDS.md #1a.
Public Sub Init(inId As String, inExpenseId As String, inMethod As String)
    pId = inId
    pExpenseId = inExpenseId
    pMethod = inMethod
    pStatus = psAwaitingPayment
End Sub

Public Property Get Id() As String
    Id = pId
End Property

Public Property Get ExpenseId() As String
    ExpenseId = pExpenseId
End Property

Public Property Get Status() As PaymentStatus
    Status = pStatus
End Property

Public Property Get Method() As String
    Method = pMethod
End Property

Public Property Get PaidAt() As Date
    PaidAt = pPaidAt
End Property

Public Property Get PaidBy() As String
    PaidBy = pPaidBy
End Property

Public Property Get PaymentReference() As String
    PaymentReference = pPaymentReference
End Property

Public Sub MarkPaid(inPaidBy As String, inPaymentReference As String, ByVal occurredAt As Date)
    If pStatus <> psAwaitingPayment Then
        Err.Raise 10200, "PaymentRecord.MarkPaid", "Payment is not AwaitingPayment."
    End If
    If Len(Trim$(inPaymentReference)) = 0 Then
        Err.Raise 10201, "PaymentRecord.MarkPaid", "A payment reference is required."
    End If
    pStatus = psPaid
    pPaidBy = inPaidBy
    pPaymentReference = inPaymentReference
    pPaidAt = occurredAt
End Sub

' Repository-only hydration -- see ExpenseRequest.Hydrate for rationale
' (both the Public-not-Friend point and the "in"-prefixed parameters).
Public Sub Hydrate(inId As String, inExpenseId As String, inStatus As PaymentStatus, inMethod As String, ByVal inPaidAt As Date, inPaidBy As String, inPaymentReference As String)
    pId = inId
    pExpenseId = inExpenseId
    pStatus = inStatus
    pMethod = inMethod
    pPaidAt = inPaidAt
    pPaidBy = inPaidBy
    pPaymentReference = inPaymentReference
End Sub

Public Sub Reverse(reason As String)
    If pStatus <> psPaid Then
        Err.Raise 10202, "PaymentRecord.Reverse", "Only a Paid payment can be reversed."
    End If
    If Len(Trim$(reason)) = 0 Then
        Err.Raise 10203, "PaymentRecord.Reverse", "A reason is required to reverse a payment."
    End If
    pStatus = psReversed
End Sub
