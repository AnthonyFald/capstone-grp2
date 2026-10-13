#!/bin/bash
set -e
cd "$(dirname "$0")"
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
