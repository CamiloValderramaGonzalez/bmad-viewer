import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeGitHubRepositoryInput, pickGitHubProjectStatusOption, validateGitHubIntegrationConfig } from '../../src/integrations/github/github-sync.js';

describe('github sync config', () => {
	it('accepts owner/repo combined in repository field', () => {
		const normalized = normalizeGitHubRepositoryInput('', 'octo-org/octo-repo');
		assert.equal(normalized.owner, 'octo-org');
		assert.equal(normalized.repo, 'octo-repo');
	});

	it('accepts a full github repository url', () => {
		const normalized = normalizeGitHubRepositoryInput('', 'https://github.com/octo-org/octo-repo');
		assert.equal(normalized.owner, 'octo-org');
		assert.equal(normalized.repo, 'octo-repo');
	});

	it('normalizes config before validating it', () => {
		const config = validateGitHubIntegrationConfig({
			owner: '',
			repo: 'octo-org/octo-repo',
			token: 'ghp_secret_token',
		});

		assert.equal(config.owner, 'octo-org');
		assert.equal(config.repo, 'octo-repo');
		assert.equal(config.token, 'ghp_secret_token');
	});

	it('maps BMAD statuses to the default GitHub project status options', () => {
		const options = [
			{ id: 'todo', name: 'Todo' },
			{ id: 'progress', name: 'In Progress' },
			{ id: 'done', name: 'Done' },
		];

		assert.equal(pickGitHubProjectStatusOption(options, 'backlog').id, 'todo');
		assert.equal(pickGitHubProjectStatusOption(options, 'ready-for-dev').id, 'todo');
		assert.equal(pickGitHubProjectStatusOption(options, 'review').id, 'progress');
		assert.equal(pickGitHubProjectStatusOption(options, 'done').id, 'done');
	});
});
