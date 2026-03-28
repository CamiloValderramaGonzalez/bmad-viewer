# Product Overview

## What `bmad-viewer` Is

`bmad-viewer` is a local visual dashboard for BMAD projects. It reads the same folders and generated files that BMAD already produces and turns them into a searchable catalog plus an operational project board.

## Core Product Surfaces

- CLI entry point
- local HTTP server and browser dashboard
- wiki/catalog lens
- project dashboard lens
- editable BMAD board backed by `sprint-status`
- optional platform synchronization layer

## Product Value

- reduces recovery cost for developers
- makes BMAD visible to non-terminal users
- centralizes project context in a visual format
- keeps the filesystem as the source of truth

## Current Product Shape

Today the project is strongest as a local viewer and GitHub-synced BMAD board. The next product frontier is editor embedding through a VS Code extension.
