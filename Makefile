# Cartouche — Makefile
#
# Direct convenience targets for building, testing, and developing Cartouche.
#
# Prerequisites:
# - Node.js >= 20 and pnpm >= 9 (or npm)
# - Rust stable + cargo toolchain
# - Tauri CLI v2: `cargo install tauri-cli --version "^2" --locked` (or npx @tauri-apps/cli)

.PHONY: install install-frontend install-backend build build-frontend build-backend \
 test test-frontend test-backend lint lint-frontend lint-backend format \
 format-check dev dev-tauri clean check

# --- Install ---

install: install-frontend install-backend

install-frontend:
	pnpm install --frozen-lockfile || npm install

install-backend:
	cd src-tauri && cargo fetch

# --- Build ---

build: build-frontend build-backend

build-frontend:
	npm run build

build-backend:
	cd src-tauri && cargo build --release

# --- Test ---

test: test-frontend test-backend

test-frontend:
	npx vitest run

test-backend:
	cd src-tauri && cargo test

# --- Lint ---

lint: lint-frontend lint-backend

lint-frontend:
	npx eslint .

lint-backend:
	cd src-tauri && cargo clippy --all-targets -- -D warnings

# --- Format ---

format:
	npx prettier --write .
	cd src-tauri && cargo fmt

format-check:
	npx prettier --check .
	cd src-tauri && cargo fmt --check

# --- Dev ---

dev:
	npm run dev

dev-tauri:
	npx @tauri-apps/cli dev

# --- Clean ---

clean:
	rm -rf dist node_modules/.vite
	cd src-tauri && cargo clean

# --- All-in-one check (CI equivalent) ---

check: install lint test build
	@echo "install + lint + test + build all passed"

# --- GitHub Release Trigger ---

release-tag:
	git tag -f v0.1.0
	git push origin v0.1.0 --force
	@echo "Triggered GitHub Actions Release build for tag v0.1.0"


