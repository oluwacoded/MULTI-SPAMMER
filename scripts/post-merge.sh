#!/bin/bash
set -e

# Runs automatically after a task is merged into main.
# Keep it idempotent, non-interactive, and fast.

# Install/refresh workspace dependencies (no-op if already up to date).
pnpm install --frozen-lockfile=false
