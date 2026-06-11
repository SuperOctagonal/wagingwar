@echo off
cd /d "%~dp0"
echo Clearing .next cache...
if exist .next rmdir /s /q .next
set NODE_OPTIONS=--use-system-ca
npx next dev -p 3001
pause
