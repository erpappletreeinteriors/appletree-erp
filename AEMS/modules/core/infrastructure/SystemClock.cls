VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "SystemClock"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
Implements IClock
' Real-clock implementation of IClock. The only place in the codebase allowed
' to call Now() -- everything else takes a clock as a dependency.

Private Function IClock_UtcNow() As Date
    IClock_UtcNow = Now
End Function
