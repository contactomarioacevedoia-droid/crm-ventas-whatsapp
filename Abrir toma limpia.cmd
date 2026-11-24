@echo off
cd /d "%~dp0"
set "CRM_SCENARIO=1"
set "CRM_PORT=8783"
set "CRM_EMPTY=1"
set "CRM_DB=./datos/toma.sqlite"
node --env-file-if-exists=.env server.mjs
