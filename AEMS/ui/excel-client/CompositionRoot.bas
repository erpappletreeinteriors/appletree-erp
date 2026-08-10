Attribute VB_Name = "CompositionRoot"
Option Explicit
' Wires concrete infrastructure/persistence implementations to the
' interfaces the Application layer depends on -- the only place in the
' project allowed to construct concrete repository/clock/id-generator
' classes directly (see docs/CODING_STANDARDS.md #3, Dependency Inversion).
' Presentation code (UserForms) reads these globals, never constructs a
' concrete repository itself.

Public gClock As IClock
Public gIdGen As IIdGenerator
Public gExpenseRepo As IExpenseRepository
Public gPaymentRepo As IPaymentRepository

Public Sub Bootstrap()
    Dim sysSheet As Worksheet
    Set sysSheet = ThisWorkbook.Worksheets("AEMS_System")

    Dim clock As New SystemClock
    Set gClock = clock

    Dim idGen As New GuidGenerator
    Set gIdGen = idGen

    Dim expenseRepo As New ExcelExpenseRepository
    expenseRepo.Init sysSheet, gIdGen
    Set gExpenseRepo = expenseRepo

    Dim paymentRepo As New ExcelPaymentRepository
    paymentRepo.Init sysSheet
    Set gPaymentRepo = paymentRepo
End Sub
