@echo off
cd /d "%~dp0"
set "CRM_SCENARIO=1"
set "CRM_PORT=8782"
node --env-file-if-exists=.env server.mjs
