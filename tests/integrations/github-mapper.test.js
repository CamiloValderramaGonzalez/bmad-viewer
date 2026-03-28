import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapProjectToGitHubItems, parseBmadMarker, planGitHubSync } from '../../src/integrations/github/github-mapper.js';

describe('github mapper', () => {
	const project = {
		epics: [
			{
				num: '1',
				name: 'Foundation',
				status: 'in-progress',
				stories: [{ id: '1-1-setup', title: 'Setup repo', status: 'done', epic: '1' }],
			},
		],
		storyList: [
			{ id: '1-1-setup', title: 'Setup repo', status: 'done', epic: '1' },
			{ id: '1-2-ui', title: 'Build UI', status: 'review', epic: '1' },
		],
		storyContents: {
			'1-1': { title: 'Setup repo' },
			'1-2': { title: 'Build UI' },
		},
	};

	it('maps epics and stories to desired GitHub issues', () => {
		const items = mapProjectToGitHubItems(project);
		assert.equal(items.length, 3);
		assert.equal(items[0].bmadId, 'epic:1');
		assert.equal(items[1].bmadId, 'story:1-1-setup');
		assert.ok(items[2].labels.includes('bmad:status:review'));
	});

	it('extracts BMAD marker from issue bodies', () => {
		const marker = parseBmadMarker('hello\n<!-- bmad:id=story:1-2-ui -->\nworld');
		assert.equal(marker, 'story:1-2-ui');
	});

	it('creates a plan with create update and close operations', () => {
		const desired = mapProjectToGitHubItems(project);
		const existing = [
			{
				number: 10,
				title: 'Epic 1: Foundation',
				body: desired[0].body,
				state: 'open',
				labels: ['bmad', 'bmad:epic', 'bmad:status:backlog', 'bmad:epic:1'],
			},
			{
				number: 11,
				title: 'Legacy task',
				body: '<!-- bmad:id=story:9-9-legacy -->',
				state: 'open',
				labels: ['bmad'],
			},
		];

		const plan = planGitHubSync(existing, desired);
		assert.equal(plan.summary.create, 2);
		assert.equal(plan.summary.update, 1);
		assert.equal(plan.summary.close, 1);
		assert.equal(plan.update[0].issueNumber, 10);
		assert.equal(plan.close[0].issueNumber, 11);
	});
});
