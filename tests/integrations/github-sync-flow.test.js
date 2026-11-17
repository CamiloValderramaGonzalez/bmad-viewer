import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
	syncGitHubProject,
	syncGitHubStatusForStory,
} from '../../src/integrations/github/github-sync.js';
import {
	loadIntegrationsConfig,
	saveGitHubIntegration,
} from '../../src/integrations/integration-store.js';
import { FakeGitHub } from './fake-github.js';

const OWNER = 'octo-org';
const REPO = 'octo-repo';
const BOARD_TITLE = `${REPO} BMAD Board`;
const WRITE_OPS = [
	'createIssue',
	'updateIssue',
	'closeIssue',
	'createProjectV2',
	'addProjectV2ItemById',
	'updateProjectV2ItemStatus',
];

function buildProjectData(overrides = {}) {
	const storyList = [
		{ id: '1-1', epic: 1, title: 'Parse sprint file', status: 'done' },
		{ id: '1-2', epic: 1, title: 'Render board', status: 'in-progress' },
		{ id: '1-3', epic: 1, title: 'Live reload', status: 'backlog' },
		{ id: '2-1', epic: 2, title: 'GitHub connect', status: 'ready-for-dev' },
		{ id: '2-2', epic: 2, title: 'GitHub sync', status: 'backlog' },
	].map((story) => ({ ...story, status: overrides[story.id] || story.status }));

	const epics = [
		{ num: 1, name: 'Viewer core', status: 'in-progress' },
		{ num: 2, name: 'Integrations', status: 'backlog' },
	].map((epic) => ({
		...epic,
		stories: storyList.filter((story) => story.epic === epic.num),
	}));

	return { epics, storyList, storyContents: {} };
}

function writeOps(fake) {
	return fake.calls.filter((call) => WRITE_OPS.includes(call.op));
}

function issueNumberFor(fake, bmadId) {
	return fake.issues.find((issue) => issue.body.includes(`<!-- bmad:id=${bmadId} -->`)).number;
}

describe('github sync flow (fake GitHub)', () => {
	let root;
	let fake;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'bmad-viewer-gh-sync-'));
		fake = new FakeGitHub({ owner: OWNER, repo: REPO }).install();
		saveGitHubIntegration(root, {
			provider: 'github',
			owner: OWNER,
			repo: REPO,
			token: 'test',
			mode: 'issues',
		});
	});

	afterEach(() => {
		fake.uninstall();
		rmSync(root, { recursive: true, force: true });
	});

	it('the stubbed fetch refuses any host other than api.github.com', async () => {
		await assert.rejects(() => fetch('https://example.com/'), /non-GitHub host/);
	});

	it('fresh sync creates every issue, the Project, and adds each issue with its status', async () => {
		const result = await syncGitHubProject(root, buildProjectData());

		assert.equal(fake.issues.length, 7);
		assert.equal(result.issues.applied.created.length, 7);
		assert.equal(fake.callsOf('createProjectV2').length, 1);
		assert.equal(fake.projects.length, 1);

		const project = fake.projects[0];
		assert.equal(project.title, BOARD_TITLE);
		assert.equal(project.items.length, 7);
		assert.equal(result.project.added.length, 7);
		assert.equal(result.project.updatedStatus.length, 7);

		const statusOf = (bmadId) => {
			const issue = fake.issues.find((candidate) =>
				candidate.body.includes(`<!-- bmad:id=${bmadId} -->`),
			);
			const item = project.items.find((candidate) => candidate.contentId === issue.node_id);
			return project.statusField.options.find((opt) => opt.id === item.statusOptionId).name;
		};
		assert.equal(statusOf('story:1-1'), 'Done');
		assert.equal(statusOf('story:1-2'), 'In Progress');
		assert.equal(statusOf('story:1-3'), 'Todo');
		assert.equal(statusOf('story:2-1'), 'Todo');
		assert.equal(statusOf('epic:1'), 'In Progress');

		const stored = loadIntegrationsConfig(root).github;
		assert.equal(stored.project.id, project.id);
		assert.equal(stored.project.title, BOARD_TITLE);
		assert.equal(result.project.project.id, project.id);
	});

	it('re-sync right after a fresh sync makes no writes', async () => {
		// No done stories here: see the todo below for why.
		const data = () => buildProjectData({ '1-1': 'review' });
		await syncGitHubProject(root, data());
		fake.resetCalls();

		const result = await syncGitHubProject(root, data());

		assert.deepEqual(writeOps(fake), []);
		assert.deepEqual(result.issues.applied, { created: [], updated: [], closed: [] });
		assert.deepEqual(result.project.added, []);
		assert.deepEqual(result.project.updatedStatus, []);
	});

	it(
		're-sync right after a fresh sync makes no writes when some stories are done',
		{
			todo: 'POST /issues cannot set state, so a fresh sync leaves done items open and the next sync closes them via updateIssue',
		},
		async () => {
			await syncGitHubProject(root, buildProjectData());
			fake.resetCalls();
			await syncGitHubProject(root, buildProjectData());
			assert.deepEqual(writeOps(fake), []);
		},
	);

	it('large board: items past the first 100 are recognised, nothing is re-added', async () => {
		await syncGitHubProject(root, buildProjectData());
		const project = fake.projects[0];
		// Put 223 unrelated items ahead of the 7 BMAD items: 230 in total.
		fake.addDraftItems(project, 223, { atStart: true });
		assert.equal(project.items.length, 230);
		fake.resetCalls();

		const result = await syncGitHubProject(root, buildProjectData());

		assert.equal(fake.callsOf('addProjectV2ItemById').length, 0);
		assert.equal(fake.callsOf('updateProjectV2ItemStatus').length, 0);
		assert.deepEqual(result.project.added, []);
		assert.deepEqual(result.project.updatedStatus, []);
		assert.equal(project.items.length, 230);
	});

	it('large board, one moved: exactly one status update for that item', async () => {
		await syncGitHubProject(root, buildProjectData());
		const project = fake.projects[0];
		fake.addDraftItems(project, 223, { atStart: true });
		fake.resetCalls();

		const result = await syncGitHubProject(root, buildProjectData({ '1-3': 'in-progress' }));

		assert.equal(fake.callsOf('addProjectV2ItemById').length, 0);
		const statusCalls = fake.callsOf('updateProjectV2ItemStatus');
		assert.equal(statusCalls.length, 1);
		const movedIssue = fake.issues.find(
			(issue) => issue.number === issueNumberFor(fake, 'story:1-3'),
		);
		assert.equal(statusCalls[0].contentId, movedIssue.node_id);
		assert.equal(statusCalls[0].optionId, 'opt_progress');
		assert.deepEqual(result.project.added, []);
		assert.deepEqual(
			result.project.updatedStatus.map((item) => item.bmadId),
			['story:1-3'],
		);
	});

	it('stored project missing (null node): falls back to the title lookup', async () => {
		const project = fake.addProject({ title: BOARD_TITLE });
		saveGitHubIntegration(root, {
			...loadIntegrationsConfig(root).github,
			project: { id: 'PVT_deleted', title: BOARD_TITLE, url: '' },
		});

		const result = await syncGitHubProject(root, buildProjectData());

		assert.equal(fake.callsOf('findProjectV2ByTitle').length >= 1, true);
		assert.equal(fake.callsOf('createProjectV2').length, 0);
		assert.equal(result.project.project.id, project.id);
		assert.equal(loadIntegrationsConfig(root).github.project.id, project.id);
	});

	it('stored project missing (GraphQL NOT_FOUND): falls back to the title lookup', async () => {
		const project = fake.addProject({ title: BOARD_TITLE });
		saveGitHubIntegration(root, {
			...loadIntegrationsConfig(root).github,
			project: { id: 'PVT_stale', title: BOARD_TITLE, url: '' },
		});
		fake.failProjectNode = { notFoundError: true, projectId: 'PVT_stale' };

		const result = await syncGitHubProject(root, buildProjectData());

		assert.equal(fake.callsOf('findProjectV2ByTitle').length >= 1, true);
		assert.equal(fake.callsOf('createProjectV2').length, 0);
		assert.equal(result.project.project.id, project.id);
	});

	for (const [label, failure, pattern] of [
		['network error', { network: true }, /fetch failed/],
		['401', { status: 401 }, /GitHub GraphQL error/],
		['403', { status: 403 }, /GitHub GraphQL error/],
		['502 HTML body', { status: 502, html: true }, /GitHub GraphQL error/],
	]) {
		it(`stored project, transient failure (${label}): sync fails, no title lookup, no Project created`, async () => {
			await syncGitHubProject(root, buildProjectData());
			fake.resetCalls();
			fake.failProjectNode = failure;

			await assert.rejects(() => syncGitHubProject(root, buildProjectData()), pattern);
			assert.equal(fake.callsOf('findProjectV2ByTitle').length, 0);
			assert.equal(fake.callsOf('createProjectV2').length, 0);
			assert.equal(fake.projects.length, 1);

			fake.resetCalls();
			await assert.rejects(
				() => syncGitHubStatusForStory(root, buildProjectData({ '1-3': 'review' }), '1-3'),
				pattern,
			);
			assert.equal(fake.callsOf('findProjectV2ByTitle').length, 0);
			assert.equal(fake.callsOf('createProjectV2').length, 0);
			assert.equal(fake.projects.length, 1);
		});
	}

	for (const [label, failure, pattern] of [
		['null node', { nullNode: true }, /no Project for a follow-up items page/],
		['network error', { network: true }, /fetch failed/],
	]) {
		it(`large board, follow-up items page fails (${label}): sync fails with no Project writes`, async () => {
			await syncGitHubProject(root, buildProjectData());
			fake.addDraftItems(fake.projects[0], 223, { atStart: true });
			fake.resetCalls();
			fake.failItemsPage = failure;

			await assert.rejects(() => syncGitHubProject(root, buildProjectData()), pattern);
			assert.ok(fake.callsOf('getProjectV2Items').length >= 1);
			assert.equal(fake.callsOf('addProjectV2ItemById').length, 0);
			assert.equal(fake.callsOf('updateProjectV2ItemStatus').length, 0);
		});
	}

	it('stored project, nested NOT_FOUND (path not [node]): sync fails, no title lookup', async () => {
		await syncGitHubProject(root, buildProjectData());
		const storedId = loadIntegrationsConfig(root).github.project.id;
		fake.resetCalls();
		fake.failProjectNode = {
			notFoundError: true,
			notFoundPath: ['node', 'items', 'nodes', 0, 'content'],
			projectId: storedId,
		};

		await assert.rejects(() => syncGitHubProject(root, buildProjectData()), /GitHub GraphQL error/);
		assert.equal(fake.callsOf('findProjectV2ByTitle').length, 0);
		assert.equal(fake.callsOf('createProjectV2').length, 0);
		assert.equal(fake.projects.length, 1);
	});

	it('small board: one getProjectV2 request and no follow-up items page', async () => {
		await syncGitHubProject(root, buildProjectData());
		fake.addDraftItems(fake.projects[0], 93, { atStart: true });
		assert.equal(fake.projects[0].items.length, 100);
		fake.resetCalls();

		await syncGitHubProject(root, buildProjectData());

		assert.equal(fake.callsOf('getProjectV2').length, 1);
		assert.equal(fake.callsOf('getProjectV2Items').length, 0);
	});

	it('story status sync touches only that story and its epic', async () => {
		await syncGitHubProject(root, buildProjectData());
		fake.resetCalls();

		const result = await syncGitHubStatusForStory(
			root,
			buildProjectData({ '2-2': 'in-progress' }),
			'2-2',
		);

		const allowedNumbers = new Set([
			issueNumberFor(fake, 'story:2-2'),
			issueNumberFor(fake, 'epic:2'),
		]);
		const allowedNodeIds = new Set(
			fake.issues.filter((issue) => allowedNumbers.has(issue.number)).map((issue) => issue.node_id),
		);

		assert.equal(fake.callsOf('createIssue').length, 0);
		assert.equal(fake.callsOf('closeIssue').length, 0);
		assert.equal(fake.callsOf('createProjectV2').length, 0);
		assert.equal(fake.callsOf('addProjectV2ItemById').length, 0);
		const updates = fake.callsOf('updateIssue');
		assert.equal(updates.length, 1);
		assert.equal(updates[0].number, issueNumberFor(fake, 'story:2-2'));
		for (const call of fake.callsOf('updateProjectV2ItemStatus')) {
			assert.ok(allowedNodeIds.has(call.contentId), `unexpected status update ${call.contentId}`);
		}
		assert.deepEqual(
			result.project.updatedStatus.map((item) => item.bmadId),
			['story:2-2'],
		);
		assert.equal(result.storyId, '2-2');
	});
});
