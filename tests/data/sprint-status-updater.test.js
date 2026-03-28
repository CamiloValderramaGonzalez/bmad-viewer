import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyStoryStatusUpdate } from '../../src/data/sprint-status-updater.js';

describe('applyStoryStatusUpdate', () => {
	it('updates YAML story status and keeps epic in progress while work remains', () => {
		const raw = `development_status:
  epic-1: backlog
  1-1-project-setup: done
  1-2-basic-functionality: backlog
`;

		const result = applyStoryStatusUpdate(raw, 'sprint-status.yaml', '1-2-basic-functionality', 'in-progress');

		assert.equal(result.format, 'yaml');
		assert.match(result.content, /1-2-basic-functionality: in-progress/);
		assert.match(result.content, /epic-1: in-progress/);
	});

	it('keeps YAML epic in progress while a story is still in review', () => {
		const raw = `development_status:
  epic-2: in-progress
  2-1-tests: done
  2-2-docs: review # final check
`;

		const result = applyStoryStatusUpdate(raw, 'sprint-status.yaml', '2-1-tests', 'done');

		assert.equal(result.epicStatus, 'in-progress');
		assert.match(result.content, /epic-2: in-progress/);
		assert.match(result.content, /2-2-docs: review # final check/);
	});

	it('marks YAML epic as done when every story is complete', () => {
		const raw = `development_status:
  epic-2: in-progress
  2-1-tests: done
  2-2-docs: review # final check
`;

		const result = applyStoryStatusUpdate(raw, 'sprint-status.yaml', '2-2-docs', 'done');

		assert.equal(result.epicStatus, 'done');
		assert.match(result.content, /epic-2: done/);
		assert.match(result.content, /2-2-docs: done # final check/);
	});

	it('returns epic to backlog when all YAML stories are pending again', () => {
		const raw = `development_status:
  epic-3: in-progress
  3-1-api: ready-for-dev
  3-2-ui: done
`;

		const result = applyStoryStatusUpdate(raw, 'sprint-status.yaml', '3-2-ui', 'backlog');

		assert.equal(result.epicStatus, 'backlog');
		assert.match(result.content, /epic-3: backlog/);
		assert.match(result.content, /3-2-ui: backlog/);
	});

	it('updates markdown sprint tables', () => {
		const raw = `## Epic 1: Foundation

| Story | Description | Status |
| --- | --- | --- |
| 1.1 | Setup repo | Done |
| 1.2 | Build UI | Backlog |
`;

		const result = applyStoryStatusUpdate(raw, 'sprint-status.md', '1-2-build-ui', 'in-progress');

		assert.equal(result.format, 'markdown');
		assert.match(result.content, /\| 1\.2 \| Build UI \| In Progress \|/);
	});

	it('throws when the story does not exist', () => {
		assert.throws(
			() => applyStoryStatusUpdate('development_status:\n  epic-1: backlog\n', 'sprint-status.yaml', '1-9-missing', 'done'),
			/was not found/,
		);
	});
});
