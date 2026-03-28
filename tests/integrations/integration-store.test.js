import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadIntegrationsConfig, saveGitHubIntegration, toPublicIntegrationsConfig } from '../../src/integrations/integration-store.js';

describe('integration store', () => {
	it('persists github integration config', () => {
		const root = mkdtempSync(join(tmpdir(), 'bmad-viewer-'));

		try {
			saveGitHubIntegration(root, {
				provider: 'github',
				owner: 'octo-org',
				repo: 'octo-repo',
				token: 'ghp_secret_token',
			});

			const loaded = loadIntegrationsConfig(root);
			assert.equal(loaded.github.owner, 'octo-org');
			assert.equal(loaded.github.repo, 'octo-repo');
			assert.equal(loaded.github.token, 'ghp_secret_token');

			const publicConfig = toPublicIntegrationsConfig(loaded);
			assert.equal(publicConfig.github.owner, 'octo-org');
			assert.equal(publicConfig.github.repo, 'octo-repo');
			assert.equal(publicConfig.github.tokenStored, true);
			assert.equal('token' in publicConfig.github, false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
