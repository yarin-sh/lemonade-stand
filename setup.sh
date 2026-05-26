#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

MIN_NODE_MAJOR=20
MIN_NODE_MINOR=16
MIN_NPM_MAJOR=10

fail() {
  printf 'Setup failed: %s\n' "$1" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

check_node() {
  command_exists node || fail "Node.js is required. Install Node.js 20.16.0 or newer."

  node -e "
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < $MIN_NODE_MAJOR || (major === $MIN_NODE_MAJOR && minor < $MIN_NODE_MINOR)) {
  process.exit(1);
}
" || fail "Node.js 20.16.0 or newer is required. Current version: $(node --version)"
}

check_npm() {
  command_exists npm || fail "npm is required. Install npm 10 or newer."

  npm -v | awk -F. -v min="$MIN_NPM_MAJOR" '{ exit ($1 >= min ? 0 : 1) }' \
    || fail "npm 10 or newer is required. Current version: $(npm -v)"
}

create_env_file() {
  if [ -f ".env" ]; then
    printf '.env already exists, keeping it unchanged.\n'
    return
  fi

  if [ ! -f ".env.example" ]; then
    fail ".env.example is missing."
  fi

  cp ".env.example" ".env"
  printf 'Created .env from .env.example.\n'
}

install_dependencies() {
  local install_log

  printf 'Installing dependencies...\n'
  install_log="$(mktemp "${TMPDIR:-/tmp}/lemonade-npm-install.XXXXXX")"

  if ! npm install 2>&1 | tee "$install_log"; then
    rm -f "$install_log"
    fail "npm install failed."
  fi

  if grep -Eq '^(npm ERR!|npm error)' "$install_log"; then
    rm -f "$install_log"
    fail "npm install reported an npm error."
  fi

  rm -f "$install_log"
}

print_next_steps() {
  cat <<'EOF'

Setup complete.

Start the server:
  npm run dev:server

Start the client in another terminal:
  sudo npm run dev:client

Open the game:
  http://127.0.0.1/

EOF
}

check_node
check_npm
create_env_file
install_dependencies
print_next_steps
