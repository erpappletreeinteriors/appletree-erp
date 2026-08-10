VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpenseLineItem"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
' One line of an ExpenseRequest. Real field list (category-specific fields,
' tax handling, etc.) is TBD pending docs/BRD.md -- this is the minimal
' shape needed to make the workflow real.
'
' Amount is Double, not the VBA Currency type: using Currency as a type
' anywhere in a class here breaks that class's members being resolvable
' from other modules ("Method or data member not found" on unrelated
' properties), confirmed the hard way -- see the note on
' ExpenseRequest.CurrencyCode for the related naming-collision variant of
' the same underlying issue. Double's precision is adequate for INR amounts
' at this application's scale; revisit if that ever stops being true.

Private pDescription As String
Private pAmount As Double

Public Property Get Description() As String
    Description = pDescription
End Property

Public Property Let Description(ByVal value As String)
    If Len(Trim$(value)) = 0 Then
        Err.Raise 10000, "ExpenseLineItem.Description", "Description is required."
    End If
    pDescription = value
End Property

Public Property Get Amount() As Double
    Amount = pAmount
End Property

Public Property Let Amount(ByVal value As Double)
    If value <= 0 Then
        Err.Raise 10001, "ExpenseLineItem.Amount", "Line item amount must be positive."
    End If
    pAmount = value
End Property
