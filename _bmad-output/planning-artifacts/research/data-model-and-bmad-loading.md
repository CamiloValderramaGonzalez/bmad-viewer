# Data Model And BMAD Loading

## Central Module

The core aggregation logic lives in `src/data/data-model.js`.

## What It Loads

- BMAD module catalog from `_bmad/`
- product/project context from `_bmad-output/planning-artifacts`
- epic and story structure from `epics.md`
- project board state from `sprint-status`
- implementation story docs
- analysis, research and generated artifacts

## Why This Matters

The viewer depends on structure conventions instead of a custom database schema. That makes it easy to drop into an existing BMAD repo, but it also means artifact naming and folder layout must stay consistent.

## Recent Improvement

The project now supports writable `sprint-status` updates so the board is not just a passive status display anymore.
