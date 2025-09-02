#!/usr/bin/env bash
# Prevent committing .env and build outputs
set -e

if git diff --cached --name-only | grep -E "(^|/)\.env(\.|$)|(^|/)(dist|dist-server)(/|$)" >/dev/null; then
  echo "\nERROR: You're trying to commit a sensitive or build file (env or dist)."
  echo "Please remove it from staging: git reset HEAD <file>"
  echo "If you really intend to add a built artifact, add an exception to .gitignore or contact the repo maintainers.\n"
  exit 1
fi

exit 0
