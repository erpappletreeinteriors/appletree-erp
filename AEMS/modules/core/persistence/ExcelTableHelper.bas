Attribute VB_Name = "ExcelTableHelper"
Option Explicit
' Generic ListObject (Excel Table) access helpers shared by repository
' implementations across bounded contexts. Persistence-layer only -- never
' reference ListObject/ListRow from modules/*/domain or
' modules/*/application (see docs/ARCHITECTURE.md #5).

Public Function FindRowByKey(tbl As ListObject, keyColumnName As String, keyValue As String) As ListRow
    Dim colIndex As Long
    Dim r As ListRow
    colIndex = tbl.ListColumns(keyColumnName).Index

    If Not tbl.DataBodyRange Is Nothing Then
        For Each r In tbl.ListRows
            If CStr(r.Range.Cells(1, colIndex).value) = keyValue Then
                Set FindRowByKey = r
                Exit Function
            End If
        Next r
    End If
    Set FindRowByKey = Nothing
End Function

Public Function FindRowsByColumnValue(tbl As ListObject, columnName As String, matchValue As Variant) As Collection
    Dim colIndex As Long
    Dim r As ListRow
    Dim results As New Collection
    colIndex = tbl.ListColumns(columnName).Index

    If Not tbl.DataBodyRange Is Nothing Then
        For Each r In tbl.ListRows
            If r.Range.Cells(1, colIndex).value = matchValue Then
                results.Add r
            End If
        Next r
    End If
    Set FindRowsByColumnValue = results
End Function

' Iterates by index, LAST row to FIRST, deleting matches as it goes.
' Deliberately not "collect ListRow references, then delete each" -- doing
' that throws "Application-defined or object-defined error" (1004) on the
' second+ delete, because removing a row shifts every row below it and
' invalidates the previously-captured references to rows further down the
' table. Iterating backwards means every row still to be checked is above
' (unaffected by) any row already deleted.
Public Sub DeleteRowsByColumnValue(tbl As ListObject, columnName As String, matchValue As Variant)
    If tbl.DataBodyRange Is Nothing Then Exit Sub
    Dim colIndex As Long
    Dim i As Long
    colIndex = tbl.ListColumns(columnName).Index
    For i = tbl.ListRows.Count To 1 Step -1
        If tbl.ListRows(i).Range.Cells(1, colIndex).Value = matchValue Then
            tbl.ListRows(i).Delete
        End If
    Next i
End Sub

Public Function GetValue(r As ListRow, tbl As ListObject, columnName As String) As Variant
    GetValue = r.Range.Cells(1, tbl.ListColumns(columnName).Index).value
End Function

Public Sub SetValue(r As ListRow, tbl As ListObject, columnName As String, value As Variant)
    r.Range.Cells(1, tbl.ListColumns(columnName).Index).value = value
End Sub

Public Function AddRow(tbl As ListObject) As ListRow
    Set AddRow = tbl.ListRows.Add
End Function

Public Function NzDate(v As Variant) As Date
    If IsEmpty(v) Or Len(CStr(v)) = 0 Then
        NzDate = 0
    Else
        NzDate = CDate(v)
    End If
End Function
