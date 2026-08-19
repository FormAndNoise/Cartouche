# Cartouche — Root Makefile
# Proxies commands to the primary development worktree (.worktrees/t_99bad544_new)

WORKTREE := .worktrees/t_99bad544_new

.PHONY: install install-frontend install-backend build build-frontend build-backend \
        test test-frontend test-backend lint lint-frontend lint-backend format \
        format-check dev dev-tauri clean check

install:
	$(MAKE) -C $(WORKTREE) install

install-frontend:
	$(MAKE) -C $(WORKTREE) install-frontend

install-backend:
	$(MAKE) -C $(WORKTREE) install-backend

build:
	$(MAKE) -C $(WORKTREE) build

build-frontend:
	$(MAKE) -C $(WORKTREE) build-frontend

build-backend:
	$(MAKE) -C $(WORKTREE) build-backend

test:
	$(MAKE) -C $(WORKTREE) test

test-frontend:
	$(MAKE) -C $(WORKTREE) test-frontend

test-backend:
	$(MAKE) -C $(WORKTREE) test-backend

lint:
	$(MAKE) -C $(WORKTREE) lint

lint-frontend:
	$(MAKE) -C $(WORKTREE) lint-frontend

lint-backend:
	$(MAKE) -C $(WORKTREE) lint-backend

format:
	$(MAKE) -C $(WORKTREE) format

format-check:
	$(MAKE) -C $(WORKTREE) format-check

dev:
	$(MAKE) -C $(WORKTREE) dev

dev-tauri:
	$(MAKE) -C $(WORKTREE) dev-tauri

clean:
	$(MAKE) -C $(WORKTREE) clean

check:
	$(MAKE) -C $(WORKTREE) check
