import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { buildDataModel } from '../../src/data/data-model.js';

const tempDirs = [];

function makeProject(files) {
	const root = mkdtempSync(join(tmpdir(), 'bmad-viewer-parse-'));
	tempDirs.push(root);
	mkdirSync(join(root, '_bmad'), { recursive: true });
	for (const [relPath, content] of Object.entries(files)) {
		const full = join(root, relPath);
		mkdirSync(join(full, '..'), { recursive: true });
		writeFileSync(full, content, 'utf8');
	}
	return root;
}

after(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

const SPRINT_STATUS_MD = `# Sprint Status

### Epic 1: Foundation

| Story | Description | Status |
|-------|-------------|--------|
| 1.1 | Project setup | ✅ Done |
| 1.2 | Basic config | 🔄 In progress |

### Epic 2: Reporting

| Story | Description | Status |
|-------|-------------|--------|
| 2.1 | Export CSV | Pending |
| 2.2 | Charts | Review |
| 2.3 | Dashboards | Backlog |

## Bugs

| ID | Description | Epic | Status |
|----|-------------|------|--------|
| BUG-001 | Crash on load | Epic 1 | Pending |
| BUG-002 | Wrong colour | Epic 2 | ✅ Done |

## Pendientes

- [ ] **Write docs** - user guide
- [✅] **Ship it** - v1.0
- [x] Release notes
`;

const EPICS_MD = `# Epics

## Epic 1: Foundation

### Story 1.1: Project setup

Set up the repo.

### Story 1.2: Basic config

Add config.

---

## Epic 2: Reporting

### Story 2.1: Export CSV

Export data.

#### Story 2.2: Charts

Draw charts.
`;

const SPRINT_STATUS_YAML = `# Epic 1: Foundation Work
# Epic 3: Polish
development_status:
  epic-1: in-progress
  1-1-project-setup: done
  1-2-basic-config: review
  epic-3: backlog
  3-1-final-touches: backlog
`;

describe('buildDataModel parsing', () => {
	it('parses epics, story rows, bugs and pending items from markdown sprint-status', () => {
		const root = makeProject({
			'_bmad-output/implementation-artifacts/sprint-status.md': SPRINT_STATUS_MD,
		});
		const { project } = buildDataModel(root);

		assert.equal(project.board.sprintStatusFormat, 'markdown');
		assert.deepEqual(
			project.epics.map((e) => [e.num, e.name, e.status, e.stories.length]),
			[
				['1', 'Foundation', 'in-progress', 2],
				['2', 'Reporting', 'in-progress', 3],
			],
		);
		assert.deepEqual(
			project.storyList.map((s) => [s.id, s.title, s.status, s.epic]),
			[
				['1-1-project-setup', 'Project setup', 'done', '1'],
				['1-2-basic-config', 'Basic config', 'in-progress', '1'],
				['2-1-export-csv', 'Export CSV', 'backlog', '2'],
				['2-2-charts', 'Charts', 'review', '2'],
				['2-3-dashboards', 'Dashboards', 'backlog', '2'],
			],
		);
		assert.deepEqual(project.stories, { total: 5, pending: 2, inProgress: 2, done: 1 });
		assert.deepEqual(project.bugs, [
			{ id: 'BUG-001', description: 'Crash on load', epic: 'Epic 1', status: 'backlog' },
			{ id: 'BUG-002', description: 'Wrong colour', epic: 'Epic 2', status: 'done' },
		]);
		assert.deepEqual(project.pendingItems, [
			{ title: 'Write docs', detail: 'user guide', done: false },
			{ title: 'Ship it', detail: 'v1.0', done: true },
			{ title: 'Release notes', detail: '', done: true },
		]);
	});

	it('parses epics and stories from planning epics.md when no sprint-status exists', () => {
		const root = makeProject({
			'_bmad-output/planning-artifacts/epics.md': EPICS_MD,
		});
		const { project } = buildDataModel(root);

		assert.deepEqual(
			project.epics.map((e) => [e.num, e.name, e.stories.map((s) => s.id)]),
			[
				['1', 'Foundation', ['1-1', '1-2']],
				['2', 'Reporting', ['2-1', '2-2']],
			],
		);
		assert.deepEqual(Object.keys(project.storyContents), ['1-1', '1-2', '2-1', '2-2']);
		assert.equal(project.storyContents['2-2'].title, 'Charts');
		assert.match(project.storyContents['1-2'].html, /Add config/);
		assert.doesNotMatch(project.storyContents['1-2'].html, /Epic 2/);
		assert.equal(project.stories.total, 4);
	});

	it('reads epic names from YAML sprint-status comments', () => {
		const root = makeProject({
			'_bmad-output/implementation-artifacts/sprint-status.yaml': SPRINT_STATUS_YAML,
		});
		const { project } = buildDataModel(root);

		assert.equal(project.board.sprintStatusFormat, 'yaml');
		assert.deepEqual(
			project.epics.map((e) => [e.num, e.name, e.stories.length]),
			[
				['1', 'Foundation Work', 2],
				['3', 'Polish', 1],
			],
		);
	});

	it('yields empty lists when the sources contain no epics, stories, bugs or pending items', () => {
		const root = makeProject({
			'_bmad-output/implementation-artifacts/sprint-status.md': '# Sprint Status\n\nNothing yet.\n',
			'_bmad-output/planning-artifacts/epics.md': '# Epics\n\nTo be written.\n',
		});
		const { project } = buildDataModel(root);

		assert.deepEqual(project.epics, []);
		assert.deepEqual(project.storyList, []);
		assert.deepEqual(project.bugs, []);
		assert.deepEqual(project.pendingItems, []);
		assert.deepEqual(project.storyContents, {});
		assert.equal(project.board.sprintStatusFormat, null);
	});
});
