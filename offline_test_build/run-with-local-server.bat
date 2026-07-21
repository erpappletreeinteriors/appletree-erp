@echo off
echo Starting Appletree ERP offline test server...
echo (a browser window will open automatically)
powershell -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
