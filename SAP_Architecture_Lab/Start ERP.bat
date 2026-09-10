@echo off
title Appletree ERP - SAP Architecture Lab
cd /d "%~dp0"

echo Starting the Appletree ERP (SAP Architecture Lab) server...
start "Appletree ERP Server - DO NOT CLOSE while using the ERP" node "%~dp0server\server.js"

timeout /t 2 /nobreak >nul
start "" "http://localhost:4001/login.html"

echo.
echo The server is running in the other window titled "Appletree ERP Server".
echo Your browser should now be open at the login page.
echo.
echo If the browser shows an error, wait a couple of seconds and refresh -
echo the server may still be starting up.
echo.
echo To STOP the ERP: close that other window (or press Ctrl+C inside it).
echo This window can be closed safely - it is not running the server itself.
echo.
pause
