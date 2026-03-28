import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG_DIR = '.bmad-viewer';
const CONFIG_FILE = 'integrations.json';

export function getIntegrationsConfigPath(projectRoot) {
	return join(projectRoot, CONFIG_DIR, CONFIG_FILE);
}

export function loadIntegrationsConfig(projectRoot) {
	const configPath = getIntegrationsConfigPath(projectRoot);
	if (!existsSync(configPath)) {
		return { github: null };
	}

	try {
		const raw = readFileSync(configPath, 'utf8');
		const parsed = JSON.parse(raw);
		return {
			github: parsed.github || null,
		};
	} catch {
		return { github: null };
	}
}

export function saveIntegrationsConfig(projectRoot, config) {
	const configPath = getIntegrationsConfigPath(projectRoot);
	mkdirSync(join(projectRoot, CONFIG_DIR), { recursive: true });
	writeFileSync(configPath, `${JSON.stringify(config, null, '\t')}\n`, 'utf8');
	return configPath;
}

export function saveGitHubIntegration(projectRoot, githubConfig) {
	const current = loadIntegrationsConfig(projectRoot);
	const next = {
		...current,
		github: githubConfig,
	};
	saveIntegrationsConfig(projectRoot, next);
	return next;
}

export function toPublicIntegrationsConfig(config) {
	return {
		github: toPublicGitHubIntegration(config?.github || null),
	};
}

export function toPublicGitHubIntegration(config) {
	if (!config) return null;

	return {
		provider: config.provider || 'github',
		owner: config.owner || '',
		repo: config.repo || '',
		mode: config.mode || 'issues',
		connectedAt: config.connectedAt || null,
		authType: config.token ? 'token' : (config.tokenEnvVar ? 'env' : null),
		tokenStored: Boolean(config.token),
		tokenEnvVar: config.tokenEnvVar || '',
		project: config.project
			? {
				id: config.project.id || '',
				title: config.project.title || '',
				url: config.project.url || '',
			}
			: null,
	};
}
