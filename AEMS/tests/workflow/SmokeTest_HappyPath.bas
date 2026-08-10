Attribute VB_Name = "SmokeTest_HappyPath"
Option Explicit
' Manual end-to-end smoke test for the full Submit -> Approve x5 -> Pay
' happy path (see docs/WORKFLOW.md, docs/SDD.md #2). Not a Rubberduck unit
' test (see docs/TESTING.md) -- a coarse "does the vertical slice actually
' work" check. Run via Application.Run("RunSmokeTest") or manually from the
' VBE. Writes PASS/FAIL detail to Home!A10.
'
' Result cell deliberately lives on "Home", not "AEMS_System" -- the system
' sheet is entirely covered edge-to-edge by ListObjects (see
' docs/DATABASE.md #6), and writing into any cell there risks landing on a
' live table's header/data range.

Public Sub RunSmokeTest()
    On Error GoTo Fail

    WriteProgress "step0"
    CompositionRoot.Bootstrap
    WriteProgress "step1: bootstrap"

    Dim submitUC As New SubmitExpenseUseCase
    submitUC.Init gExpenseRepo, gClock, gIdGen

    Dim items As New Collection
    Dim li1 As New ExpenseLineItem
    li1.Description = "Site visit fuel"
    li1.Amount = 1500
    items.Add li1

    Dim li2 As New ExpenseLineItem
    li2.Description = "Client lunch"
    li2.Amount = 2200
    items.Add li2
    WriteProgress "step2: line items"

    Dim expense As ExpenseRequest
    Set expense = submitUC.Execute("emp-smoketest", "Travel", "Smoke test expense", items)
    WriteProgress "step3: submit executed id=" & expense.Id

    AssertEqual CLng(esPendingSupervisor), CLng(expense.Status), "Status after submit"
    AssertEqual 3700, expense.TotalAmount, "TotalAmount after submit"
    WriteProgress "step4: post-submit asserts"

    Dim approveUC As New ApproveStepUseCase
    approveUC.Init gExpenseRepo, gClock

    approveUC.Execute expense.Id, "supervisor-1", "ok"
    WriteProgress "step5a: approved supervisor"
    approveUC.Execute expense.Id, "store-1", "ok"
    WriteProgress "step5b: approved store"
    approveUC.Execute expense.Id, "accounts-1", "ok"
    WriteProgress "step5c: approved accounts"
    approveUC.Execute expense.Id, "director-1", "ok"
    WriteProgress "step5d: approved director"
    approveUC.Execute expense.Id, "accountshead-1", "ok"
    WriteProgress "step5e: approved accountshead"

    Dim reloaded As ExpenseRequest
    Set reloaded = gExpenseRepo.GetById(expense.Id)
    WriteProgress "step6: reloaded"
    AssertEqual CLng(esApprovedForPayment), CLng(reloaded.Status), "Status after 5 approvals"
    AssertEqual 6, reloaded.Chain.History.Count, "History entry count (submit + 5 approvals)"
    WriteProgress "step7: post-approval asserts"

    Dim payUC As New MarkPaidUseCase
    payUC.Init gExpenseRepo, gPaymentRepo, gClock, gIdGen
    payUC.Execute expense.Id, "accounts-1", "NEFT-TEST-0001", "Bank Transfer"
    WriteProgress "step8: payment executed"

    Dim finalExpense As ExpenseRequest
    Set finalExpense = gExpenseRepo.GetById(expense.Id)
    AssertEqual CLng(esPaid), CLng(finalExpense.Status), "Status after payment"
    WriteProgress "step9: final status assert"

    Dim payment As PaymentRecord
    Set payment = gPaymentRepo.GetByExpenseId(expense.Id)
    AssertEqual CLng(psPaid), CLng(payment.Status), "Payment status"
    WriteProgress "step10: payment status assert"

    WriteResult "PASS: submit -> 5x approve -> pay round-tripped correctly (ExpenseId " & expense.Id & ")"
    Exit Sub

Fail:
    WriteResult "FAIL: " & Err.Number & " " & Err.Description & " | Source=" & Err.Source & " (see A9 for last completed step)"
End Sub

Private Sub AssertEqual(expected As Variant, actual As Variant, label As String)
    If expected <> actual Then
        Err.Raise vbObjectError + 1, "SmokeTest", label & " -- expected " & expected & ", got " & actual
    End If
End Sub

Private Sub WriteResult(msg As String)
    ThisWorkbook.Worksheets("Home").Range("A10").Value2 = msg
End Sub

Private Sub WriteProgress(msg As String)
    ThisWorkbook.Worksheets("Home").Range("A9").Value2 = msg
End Sub
