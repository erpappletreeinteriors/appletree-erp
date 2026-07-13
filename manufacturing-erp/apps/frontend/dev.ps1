$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location -Path $PSScriptRoot
npm run dev -- --host
