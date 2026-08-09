# Tarot Socket Board — Makefile
#
# Convenience targets so the whole project is `make install && make test`
# (or `make build && make test`) from a clean clone.
#
# Prerequisites (installed once, not managed here):
#   - Node.js >= 20 and pnpm >= 9  (https://pnpm.io)
#   - Rust stable + MSVC (Windows) or GCC (Linux) toolchain
#   - Tauri CLI: `cargo install tauri-cli --version "^2" --locked`
#
# On Windows this Makefile runs under Git Bash / MSYS2 (the same shell that
# ships with Git for Windows). GNU Make is invoked via `make`.

.PHONY: install install-frontend install-backend build build-frontend build-backend \
        test test-frontend test-backend lint lint-frontend lint-backend format \
        dev dev-tauri clean check

# --- Install ---

install: install-frontend install-backend

install-frontend:
	pnpm install --frozen-lockfile || pnpm install

install-backend:
	cd src-tauri && cargo fetch

# --- Build ---

build: build-frontend build-backend

build-frontend:
	pnpm build

build-backend:
	cd src-tauri && cargo build --release

# --- Test ---

test: test-frontend test-backend

test-frontend:
	pnpm test

test-backend:
	cd src-tauri && cargo test

# --- Lint ---

lint: lint-frontend lint-backend

lint-frontend:
	pnpm lint

lint-backend:
	cd src-tauri && cargo clippy --all-targets -- -D warnings

# --- Format ---

format:
	pnpm format
	cd src-tauri && cargo fmt

# --- Dev ---

dev:
	pnpm dev

dev-tauri:
	pnpm tauri dev

# --- Clean ---

clean:
	rm -rf dist node_modules/.vite
	cd src-tauri && cargo clean

# --- All-in-one check (CI equivalent) ---

check: install lint test build
	@echo "install + lint + test + build all passed"
