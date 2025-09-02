#!/usr/bin/env bash
# Setup development environment hooks for this repository
set -e

HOOKS_DIR=.git/hooks
mkdir -p "$HOOKS_DIR"
ln -sf ../../scripts/check-sensitive.sh "$HOOKS_DIR/pre-commit"
chmod +x "$HOOKS_DIR/pre-commit"

echo "Pre-commit hook installed -> $HOOKS_DIR/pre-commit"
