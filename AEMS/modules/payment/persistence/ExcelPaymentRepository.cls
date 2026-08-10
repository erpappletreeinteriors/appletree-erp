VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExcelPaymentRepository"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
Implements IPaymentRepository
' Excel Tables implementation of IPaymentRepository -- see
' docs/DATABASE.md #6 for the tblPayments schema.

Private mPaymentsTbl As ListObject

Public Sub Init(systemSheet As Worksheet)
    Set mPaymentsTbl = systemSheet.ListObjects("tblPayments")
End Sub

' HydrateFromRow is inlined at each call site below rather than factored
' into a shared private helper -- see the note on
' ExcelExpenseRepository.IExpenseRepository_Save for why.

Private Function IPaymentRepository_GetByExpenseId(expenseId As String) As PaymentRecord
    Dim row As ListRow
    Set row = ExcelTableHelper.FindRowByKey(mPaymentsTbl, "ExpenseId", expenseId)
    If row Is Nothing Then
        Err.Raise 10204, "ExcelPaymentRepository.GetByExpenseId", "No payment found for ExpenseId " & expenseId
    End If

    Dim payment As New PaymentRecord
    payment.Hydrate _
        CStr(ExcelTableHelper.GetValue(row, mPaymentsTbl, "Id")), _
        CStr(ExcelTableHelper.GetValue(row, mPaymentsTbl, "ExpenseId")), _
        CLng(ExcelTableHelper.GetValue(row, mPaymentsTbl, "Status")), _
        CStr(ExcelTableHelper.GetValue(row, mPaymentsTbl, "Method")), _
        ExcelTableHelper.NzDate(ExcelTableHelper.GetValue(row, mPaymentsTbl, "PaidAt")), _
        CStr(ExcelTableHelper.GetValue(row, mPaymentsTbl, "PaidBy")), _
        CStr(ExcelTableHelper.GetValue(row, mPaymentsTbl, "PaymentReference"))
    Set IPaymentRepository_GetByExpenseId = payment
End Function

Private Function IPaymentRepository_GetAwaitingPayment() As Collection
    Dim results As New Collection
    Dim rows As Collection
    Dim r As ListRow
    Set rows = ExcelTableHelper.FindRowsByColumnValue(mPaymentsTbl, "Status", CLng(psAwaitingPayment))
    For Each r In rows
        Dim payment As New PaymentRecord
        payment.Hydrate _
            CStr(ExcelTableHelper.GetValue(r, mPaymentsTbl, "Id")), _
            CStr(ExcelTableHelper.GetValue(r, mPaymentsTbl, "ExpenseId")), _
            CLng(ExcelTableHelper.GetValue(r, mPaymentsTbl, "Status")), _
            CStr(ExcelTableHelper.GetValue(r, mPaymentsTbl, "Method")), _
            ExcelTableHelper.NzDate(ExcelTableHelper.GetValue(r, mPaymentsTbl, "PaidAt")), _
            CStr(ExcelTableHelper.GetValue(r, mPaymentsTbl, "PaidBy")), _
            CStr(ExcelTableHelper.GetValue(r, mPaymentsTbl, "PaymentReference"))
        results.Add payment
    Next r
    Set IPaymentRepository_GetAwaitingPayment = results
End Function

Private Sub IPaymentRepository_Save(payment As PaymentRecord)
    Dim row As ListRow
    Set row = ExcelTableHelper.FindRowByKey(mPaymentsTbl, "Id", payment.Id)
    If row Is Nothing Then
        Set row = ExcelTableHelper.AddRow(mPaymentsTbl)
    End If

    ExcelTableHelper.SetValue row, mPaymentsTbl, "Id", payment.Id
    ExcelTableHelper.SetValue row, mPaymentsTbl, "ExpenseId", payment.ExpenseId
    ExcelTableHelper.SetValue row, mPaymentsTbl, "Status", CLng(payment.Status)
    ExcelTableHelper.SetValue row, mPaymentsTbl, "Method", payment.Method
    ExcelTableHelper.SetValue row, mPaymentsTbl, "PaidAt", payment.PaidAt
    ExcelTableHelper.SetValue row, mPaymentsTbl, "PaidBy", payment.PaidBy
    ExcelTableHelper.SetValue row, mPaymentsTbl, "PaymentReference", payment.PaymentReference
End Sub

