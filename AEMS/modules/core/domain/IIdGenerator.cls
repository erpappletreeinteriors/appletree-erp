VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "IIdGenerator"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
' Interface: unique-ID abstraction so domain/application code never generates
' identifiers itself (keeps entities decoupled from any one ID scheme).

Public Function NewId() As String
    Err.Raise 5, "IIdGenerator.NewId", "Not implemented -- this is an interface."
End Function
