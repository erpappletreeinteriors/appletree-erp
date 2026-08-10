VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExcelExpenseRepository"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
Implements IExpenseRepository
' Excel Tables implementation of IExpenseRepository -- the only class allowed
' to reference these ListObjects directly (see docs/ARCHITECTURE.md #3 and
' docs/DATABASE.md #6 for the table schema).
'
' Save() replaces all child rows (line items/attachments/steps/history) for
' the expense on every save rather than diffing -- simplest correct approach
' for v1 given the small collection sizes involved; revisit if profiling
' ever shows it matters.

Private mExpensesTbl As ListObject
Private mLineItemsTbl As ListObject
Private mAttachmentsTbl As ListObject
Private mStepsTbl As ListObject
Private mHistoryTbl As ListObject
Private mIdGen As IIdGenerator

Public Sub Init(systemSheet As Worksheet, idGen As IIdGenerator)
    Set mExpensesTbl = systemSheet.ListObjects("tblExpenses")
    Set mLineItemsTbl = systemSheet.ListObjects("tblExpenseLineItems")
    Set mAttachmentsTbl = systemSheet.ListObjects("tblExpenseAttachments")
    Set mStepsTbl = systemSheet.ListObjects("tblApprovalSteps")
    Set mHistoryTbl = systemSheet.ListObjects("tblApprovalHistory")
    Set mIdGen = idGen
End Sub

Private Function IExpenseRepository_GetById(id As String) As ExpenseRequest
    Dim row As ListRow
    Set row = ExcelTableHelper.FindRowByKey(mExpensesTbl, "Id", id)
    If row Is Nothing Then
        Err.Raise 10008, "ExcelExpenseRepository.GetById", "No expense found with Id " & id
    End If
    Set IExpenseRepository_GetById = HydrateFromRow(row)
End Function

Private Function IExpenseRepository_GetByStatus(status As ExpenseStatus) As Collection
    Dim results As New Collection
    Dim rows As Collection
    Dim r As ListRow
    Set rows = ExcelTableHelper.FindRowsByColumnValue(mExpensesTbl, "Status", CLng(status))
    For Each r In rows
        results.Add HydrateFromRow(r)
    Next r
    Set IExpenseRepository_GetByStatus = results
End Function

Private Function IExpenseRepository_GetByRequester(requesterId As String) As Collection
    Dim results As New Collection
    Dim rows As Collection
    Dim r As ListRow
    Set rows = ExcelTableHelper.FindRowsByColumnValue(mExpensesTbl, "RequesterId", requesterId)
    For Each r In rows
        results.Add HydrateFromRow(r)
    Next r
    Set IExpenseRepository_GetByRequester = results
End Function

Private Sub IExpenseRepository_Save(expense As ExpenseRequest)
    Dim row As ListRow
    Set row = ExcelTableHelper.FindRowByKey(mExpensesTbl, "Id", expense.Id)
    If row Is Nothing Then
        Set row = ExcelTableHelper.AddRow(mExpensesTbl)
    End If

    ExcelTableHelper.SetValue row, mExpensesTbl, "Id", expense.Id
    ExcelTableHelper.SetValue row, mExpensesTbl, "RequesterId", expense.RequesterId
    ExcelTableHelper.SetValue row, mExpensesTbl, "Category", expense.Category
    ExcelTableHelper.SetValue row, mExpensesTbl, "Description", expense.Description
    ExcelTableHelper.SetValue row, mExpensesTbl, "Currency", expense.CurrencyCode
    ExcelTableHelper.SetValue row, mExpensesTbl, "Status", CLng(expense.Status)
    ExcelTableHelper.SetValue row, mExpensesTbl, "CreatedAt", expense.CreatedAt
    ExcelTableHelper.SetValue row, mExpensesTbl, "CreatedBy", expense.CreatedBy
    ExcelTableHelper.SetValue row, mExpensesTbl, "ModifiedAt", expense.ModifiedAt
    ExcelTableHelper.SetValue row, mExpensesTbl, "ModifiedBy", expense.ModifiedBy

    If expense.Chain Is Nothing Then
        ExcelTableHelper.SetValue row, mExpensesTbl, "ChainCurrentStepIndex", 0
        ExcelTableHelper.SetValue row, mExpensesTbl, "ChainReturnToStepIndex", 0
        ExcelTableHelper.SetValue row, mExpensesTbl, "ChainIsComplete", False
    Else
        ExcelTableHelper.SetValue row, mExpensesTbl, "ChainCurrentStepIndex", expense.Chain.CurrentStepIndex
        ExcelTableHelper.SetValue row, mExpensesTbl, "ChainReturnToStepIndex", expense.Chain.ReturnToStepIndex
        ExcelTableHelper.SetValue row, mExpensesTbl, "ChainIsComplete", expense.Chain.IsComplete
    End If

    ' Line items, attachments, steps, and history are inlined here rather
    ' than factored into private helper Subs. This started as a defensive
    ' workaround for a hang that was later root-caused to two unrelated
    ' bugs (a Property/parameter name collision -- see
    ' docs/CODING_STANDARDS.md #1a -- and DeleteRowsByColumnValue's unsafe
    ' delete order, see ExcelTableHelper.bas), both now fixed. Left inlined
    ' since it's proven working as-is and re-extracting hasn't been
    ' re-verified; not a hard rule like the #1a collision issue.

    ExcelTableHelper.DeleteRowsByColumnValue mLineItemsTbl, "ExpenseId", expense.Id
    Dim li As ExpenseLineItem
    Dim liRow As ListRow
    For Each li In expense.LineItems
        Set liRow = ExcelTableHelper.AddRow(mLineItemsTbl)
        ExcelTableHelper.SetValue liRow, mLineItemsTbl, "Id", mIdGen.NewId()
        ExcelTableHelper.SetValue liRow, mLineItemsTbl, "ExpenseId", expense.Id
        ExcelTableHelper.SetValue liRow, mLineItemsTbl, "Description", li.Description
        ExcelTableHelper.SetValue liRow, mLineItemsTbl, "Amount", li.Amount
    Next li

    ExcelTableHelper.DeleteRowsByColumnValue mAttachmentsTbl, "ExpenseId", expense.Id
    Dim fileRef As Variant
    Dim attRow As ListRow
    For Each fileRef In expense.Attachments
        Set attRow = ExcelTableHelper.AddRow(mAttachmentsTbl)
        ExcelTableHelper.SetValue attRow, mAttachmentsTbl, "Id", mIdGen.NewId()
        ExcelTableHelper.SetValue attRow, mAttachmentsTbl, "ExpenseId", expense.Id
        ExcelTableHelper.SetValue attRow, mAttachmentsTbl, "FileReference", fileRef
    Next fileRef

    If Not expense.Chain Is Nothing Then
        ExcelTableHelper.DeleteRowsByColumnValue mStepsTbl, "ExpenseId", expense.Id
        Dim step As ApprovalStep
        Dim stepRow As ListRow
        Dim stepOrder As Long
        stepOrder = 0
        For Each step In expense.Chain.Steps
            stepOrder = stepOrder + 1
            Set stepRow = ExcelTableHelper.AddRow(mStepsTbl)
            ExcelTableHelper.SetValue stepRow, mStepsTbl, "Id", mIdGen.NewId()
            ExcelTableHelper.SetValue stepRow, mStepsTbl, "ExpenseId", expense.Id
            ExcelTableHelper.SetValue stepRow, mStepsTbl, "StepOrder", stepOrder
            ExcelTableHelper.SetValue stepRow, mStepsTbl, "Role", CLng(step.Role)
            ExcelTableHelper.SetValue stepRow, mStepsTbl, "AssignedUserId", step.AssignedUserId
            ExcelTableHelper.SetValue stepRow, mStepsTbl, "Status", CLng(step.Status)
            ExcelTableHelper.SetValue stepRow, mStepsTbl, "ActedBy", step.ActedBy
            ExcelTableHelper.SetValue stepRow, mStepsTbl, "ActedAt", step.ActedAt
            ExcelTableHelper.SetValue stepRow, mStepsTbl, "Comment", step.Comment
        Next step

        ' Append-only: only add entries not already persisted (by Id).
        Dim entry As ApprovalHistoryEntry
        Dim existingHistRow As ListRow
        Dim histRow As ListRow
        For Each entry In expense.Chain.History
            Set existingHistRow = ExcelTableHelper.FindRowByKey(mHistoryTbl, "Id", entry.Id)
            If existingHistRow Is Nothing Then
                Set histRow = ExcelTableHelper.AddRow(mHistoryTbl)
                ExcelTableHelper.SetValue histRow, mHistoryTbl, "Id", entry.Id
                ExcelTableHelper.SetValue histRow, mHistoryTbl, "ExpenseId", expense.Id
                ExcelTableHelper.SetValue histRow, mHistoryTbl, "StepRole", CLng(entry.StepRole)
                ExcelTableHelper.SetValue histRow, mHistoryTbl, "Action", CLng(entry.Action)
                ExcelTableHelper.SetValue histRow, mHistoryTbl, "ActorId", entry.ActorId
                ExcelTableHelper.SetValue histRow, mHistoryTbl, "Timestamp", entry.Timestamp
                ExcelTableHelper.SetValue histRow, mHistoryTbl, "Comment", entry.Comment
            End If
        Next entry
    End If
End Sub

Private Function HydrateFromRow(row As ListRow) As ExpenseRequest
    Dim expense As New ExpenseRequest
    Dim id As String
    id = CStr(ExcelTableHelper.GetValue(row, mExpensesTbl, "Id"))

    expense.Hydrate id, _
        CStr(ExcelTableHelper.GetValue(row, mExpensesTbl, "RequesterId")), _
        CStr(ExcelTableHelper.GetValue(row, mExpensesTbl, "Category")), _
        CStr(ExcelTableHelper.GetValue(row, mExpensesTbl, "Description")), _
        CStr(ExcelTableHelper.GetValue(row, mExpensesTbl, "Currency")), _
        CLng(ExcelTableHelper.GetValue(row, mExpensesTbl, "Status")), _
        CDate(ExcelTableHelper.GetValue(row, mExpensesTbl, "CreatedAt")), _
        CStr(ExcelTableHelper.GetValue(row, mExpensesTbl, "CreatedBy")), _
        CDate(ExcelTableHelper.GetValue(row, mExpensesTbl, "ModifiedAt")), _
        CStr(ExcelTableHelper.GetValue(row, mExpensesTbl, "ModifiedBy"))

    Dim liRow As ListRow
    Dim item As ExpenseLineItem
    For Each liRow In ExcelTableHelper.FindRowsByColumnValue(mLineItemsTbl, "ExpenseId", id)
        Set item = New ExpenseLineItem
        item.Description = CStr(ExcelTableHelper.GetValue(liRow, mLineItemsTbl, "Description"))
        item.Amount = CCur(ExcelTableHelper.GetValue(liRow, mLineItemsTbl, "Amount"))
        expense.HydrateLineItem item
    Next liRow

    Dim attRow As ListRow
    For Each attRow In ExcelTableHelper.FindRowsByColumnValue(mAttachmentsTbl, "ExpenseId", id)
        expense.HydrateAttachment CStr(ExcelTableHelper.GetValue(attRow, mAttachmentsTbl, "FileReference"))
    Next attRow

    If CLng(ExcelTableHelper.GetValue(row, mExpensesTbl, "Status")) <> esDraft Then
        Dim chain As New ApprovalChain
        chain.Init id, mIdGen
        chain.HydrateState _
            CLng(ExcelTableHelper.GetValue(row, mExpensesTbl, "ChainCurrentStepIndex")), _
            CLng(ExcelTableHelper.GetValue(row, mExpensesTbl, "ChainReturnToStepIndex")), _
            CBool(ExcelTableHelper.GetValue(row, mExpensesTbl, "ChainIsComplete"))

        ' Steps must be re-added in StepOrder sequence -- sort inline here
        ' rather than via a separate private helper (see the note on
        ' IExpenseRepository_Save above for why helpers are avoided).
        Dim unsortedStepRows As Collection
        Set unsortedStepRows = ExcelTableHelper.FindRowsByColumnValue(mStepsTbl, "ExpenseId", id)
        Dim sortedStepRows As New Collection
        Dim candidateRow As ListRow
        Dim insertIndex As Long
        Dim isInserted As Boolean
        For Each candidateRow In unsortedStepRows
            Dim candidateOrder As Long
            candidateOrder = CLng(ExcelTableHelper.GetValue(candidateRow, mStepsTbl, "StepOrder"))
            isInserted = False
            For insertIndex = 1 To sortedStepRows.Count
                If candidateOrder < CLng(ExcelTableHelper.GetValue(sortedStepRows(insertIndex), mStepsTbl, "StepOrder")) Then
                    sortedStepRows.Add candidateRow, before:=insertIndex
                    isInserted = True
                    Exit For
                End If
            Next insertIndex
            If Not isInserted Then sortedStepRows.Add candidateRow
        Next candidateRow

        Dim sRow As ListRow
        Dim step As ApprovalStep
        For Each sRow In sortedStepRows
            Set step = New ApprovalStep
            step.Hydrate _
                CLng(ExcelTableHelper.GetValue(sRow, mStepsTbl, "Role")), _
                CStr(ExcelTableHelper.GetValue(sRow, mStepsTbl, "AssignedUserId")), _
                CLng(ExcelTableHelper.GetValue(sRow, mStepsTbl, "Status")), _
                CStr(ExcelTableHelper.GetValue(sRow, mStepsTbl, "ActedBy")), _
                ExcelTableHelper.NzDate(ExcelTableHelper.GetValue(sRow, mStepsTbl, "ActedAt")), _
                CStr(ExcelTableHelper.GetValue(sRow, mStepsTbl, "Comment"))
            chain.HydrateStep step
        Next sRow

        Dim hRow As ListRow
        Dim entry As ApprovalHistoryEntry
        For Each hRow In ExcelTableHelper.FindRowsByColumnValue(mHistoryTbl, "ExpenseId", id)
            Set entry = New ApprovalHistoryEntry
            entry.Init _
                CStr(ExcelTableHelper.GetValue(hRow, mHistoryTbl, "Id")), id, _
                CLng(ExcelTableHelper.GetValue(hRow, mHistoryTbl, "StepRole")), _
                CLng(ExcelTableHelper.GetValue(hRow, mHistoryTbl, "Action")), _
                CStr(ExcelTableHelper.GetValue(hRow, mHistoryTbl, "ActorId")), _
                CDate(ExcelTableHelper.GetValue(hRow, mHistoryTbl, "Timestamp")), _
                CStr(ExcelTableHelper.GetValue(hRow, mHistoryTbl, "Comment"))
            chain.HydrateHistoryEntry entry
        Next hRow

        expense.HydrateChain chain
    End If

    Set HydrateFromRow = expense
End Function
