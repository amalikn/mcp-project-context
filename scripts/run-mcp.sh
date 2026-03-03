#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
else
  echo "nvm not found at $NVM_DIR" >&2
  exit 1
fi

cd "$PROJECT_ROOT"
nvm use --silent 22 >/dev/null

if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
  npm install >/dev/null
fi

exec "$PROJECT_ROOT/node_modules/.bin/tsx" "$PROJECT_ROOT/src/index.ts"
