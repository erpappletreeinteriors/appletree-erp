VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "IClock"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
' Interface: current-time abstraction so domain/application code never calls
' Now() directly (makes workflow logic testable with a fixed clock).
' Named UtcNow for future-proofing, but returns local system time in v1 --
' Appletree is a single-timezone (Kerala/IST) operation, so no TZ handling
' exists yet. Revisit if a client outside IST is ever added.

Public Function UtcNow() As Date
    Err.Raise 5, "IClock.UtcNow", "Not implemented -- this is an interface."
End Function
