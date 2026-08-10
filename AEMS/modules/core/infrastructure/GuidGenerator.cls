VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "GuidGenerator"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
Implements IIdGenerator
' Pseudo-random UUID v4-shaped implementation of IIdGenerator, generated
' purely in VBA (Rnd/Randomize) -- deliberately NOT using
' CreateObject("Scriptlet.TypeLib").Guid: that COM object is blocked by
' Office's macro security hardening (it was a known exploit vector for
' arbitrary file write) and calling it from VBA hangs on a blocked-object
' security prompt during automation. Collision risk here is negligible at
' this application's scale (thousands of records, not billions) -- this
' does not need to be cryptographically strong, just unique enough for
' local record keys.

Private Sub Class_Initialize()
    Randomize
End Sub

Private Function IIdGenerator_NewId() As String
    IIdGenerator_NewId = HexDigits(8) & "-" & HexDigits(4) & "-4" & HexDigits(3) & _
        "-" & VariantDigit() & HexDigits(3) & "-" & HexDigits(12)
End Function

Private Function HexDigits(count As Integer) As String
    Dim s As String
    Dim i As Integer
    For i = 1 To count
        s = s & Hex$(Int(Rnd() * 16))
    Next i
    HexDigits = s
End Function

Private Function VariantDigit() As String
    Const opts As String = "89AB"
    VariantDigit = Mid$(opts, Int(Rnd() * 4) + 1, 1)
End Function
