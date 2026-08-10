VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "IPaymentRepository"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
' Interface -- see docs/DATABASE.md #2 and docs/SDD.md #4.

Public Function GetByExpenseId(expenseId As String) As PaymentRecord
    Err.Raise 5, "IPaymentRepository.GetByExpenseId", "Not implemented -- this is an interface."
End Function

Public Function GetAwaitingPayment() As Collection
    Err.Raise 5, "IPaymentRepository.GetAwaitingPayment", "Not implemented -- this is an interface."
End Function

Public Sub Save(payment As PaymentRecord)
    Err.Raise 5, "IPaymentRepository.Save", "Not implemented -- this is an interface."
End Sub
