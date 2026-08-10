VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "IExpenseRepository"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
' Interface -- see docs/DATABASE.md #2 and docs/SDD.md #4. Only a concrete
' persistence implementation (e.g. ExcelExpenseRepository) may reference a
' ListObject/Range; this interface's vocabulary is domain-only.

Public Function GetById(id As String) As ExpenseRequest
    Err.Raise 5, "IExpenseRepository.GetById", "Not implemented -- this is an interface."
End Function

Public Function GetByStatus(status As ExpenseStatus) As Collection
    Err.Raise 5, "IExpenseRepository.GetByStatus", "Not implemented -- this is an interface."
End Function

Public Function GetByRequester(requesterId As String) As Collection
    Err.Raise 5, "IExpenseRepository.GetByRequester", "Not implemented -- this is an interface."
End Function

Public Sub Save(expense As ExpenseRequest)
    Err.Raise 5, "IExpenseRepository.Save", "Not implemented -- this is an interface."
End Sub
