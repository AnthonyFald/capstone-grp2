#!/bin/bash
set -e
cd "$(dirname "$0")"
if [ ! -f local-audio/requirements.txt ] || [ ! -f local-audio/server.py ]; then
  echo "The complete audio companion folder is missing."
  echo "Extract capstone-grp2-main.zip in Finder, then open capstone-grp2-main/demo-1."
  echo "Run Start Audio Demo.command from there. Keep it beside the local-audio folder."
  echo "No tools have been installed. This is not a Python installation error."
  exit 2
fi
echo "Starting the free local audio tools. First setup needs internet access."
if [ ! -x local-audio/.venv/bin/python ]; then
  if command -v python3.12 >/dev/null 2>&1; then
    python3.12 -m venv local-audio/.venv
  else
    python3 -m venv local-audio/.venv
  fi
fi
local-audio/.venv/bin/python -m pip install --disable-pip-version-check -r local-audio/requirements.txt
exec local-audio/.venv/bin/python local-audio/server.py
