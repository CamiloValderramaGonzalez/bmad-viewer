# Product Brief: bmad-viewer

## Vision

Make BMAD projects understandable at a glance through a local visual viewer that works from the filesystem and does not require token-heavy agent prompts to recover project context.

## Problem Statement

BMAD projects accumulate planning files, workflows, generated artifacts and sprint tracking data, but day-to-day visibility is weak. Developers lose time asking the agent for state, stakeholders have no easy progress view, and solo builders often underuse the methodology because everything stays buried in markdown.

## Target Users

- Developers working inside a BMAD project
- Solo builders using AI-assisted delivery workflows
- Project stakeholders who need a visual progress view
- Contributors onboarding into an existing BMAD repository

## Product Goals

1. Show BMAD project status visually without extra setup
2. Browse project and methodology artifacts from one dashboard
3. Keep local BMAD state editable and truthful
4. Let teams sync BMAD work outward to delivery platforms when they choose

## Core Capabilities

1. CLI to auto-detect and launch the viewer
2. Wiki and project dashboard views with search
3. Live reload when project files change
4. Editable kanban board backed by `sprint-status`
5. Optional sync with GitHub, later Jira and Azure DevOps

## Current Constraints

- The viewer still relies on local BMAD folder structure being present
- GitHub sync is the only external integration currently implemented
- Jira and Azure DevOps are planned but not yet available
- Some UX and visualization flows still need refinement for real production projects
