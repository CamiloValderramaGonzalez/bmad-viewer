import { loadIntegrationsConfig, saveGitHubIntegration, toPublicGitHubIntegration } from '../integration-store.js';
import { GitHubApiError, GitHubClient } from './github-client.js';
import { buildExistingIssuesMap, diffGitHubIssue, mapProjectToGitHubItems, parseBmadMarker, planGitHubSync } from './github-mapper.js';

export function validateGitHubIntegrationConfig(config) {
	if (!config || typeof config !== 'object') {
		throw new Error('GitHub integration config is required');
	}

	const normalizedRepo = normalizeGitHubRepositoryInput(config.owner, config.repo);
	if (!normalizedRepo.owner || !normalizedRepo.repo) {
		throw new Error('GitHub owner and repo are required');
	}

	const token = typeof config.token === 'string' ? config.token.trim() : '';
	const tokenEnvVar = typeof config.tokenEnvVar === 'string' ? config.tokenEnvVar.trim() : '';
	if (!token && !tokenEnvVar) {
		throw new Error('A GitHub token is required');
	}

	return {
		provider: 'github',
		owner: normalizedRepo.owner,
		repo: normalizedRepo.repo,
		...(token ? { token } : {}),
		...(tokenEnvVar ? { tokenEnvVar } : {}),
		project: config.project || null,
		mode: 'issues',
		connectedAt: config.connectedAt || new Date().toISOString(),
	};
}

export async function connectGitHubIntegration(projectRoot, config) {
	const current = loadIntegrationsConfig(projectRoot).github;
	const nextConfig = validateGitHubIntegrationConfig({
		...current,
		...config,
	});
	const client = createGitHubClient(nextConfig);

	const repository = await client.getRepository();
	if (repository.has_issues === false) {
		try {
			await client.enableIssues();
		} catch (error) {
			if (error instanceof GitHubApiError && (error.status === 403 || error.status === 404)) {
				throw new Error(`Issues are disabled in "${nextConfig.owner}/${nextConfig.repo}" and this token could not enable them automatically. Enable Issues in the repository settings or use a token with repository admin access.`);
			}
			throw error;
		}
	}
	saveGitHubIntegration(projectRoot, nextConfig);

	return {
		config: toPublicGitHubIntegration(nextConfig),
		repository: {
			fullName: repository.full_name,
			private: repository.private,
			htmlUrl: repository.html_url,
			defaultBranch: repository.default_branch,
		},
	};
}

export async function previewGitHubSync(projectRoot, projectData) {
	const config = getGitHubIntegrationOrThrow(projectRoot);
	const client = createGitHubClient(config);
	const desiredItems = mapProjectToGitHubItems(projectData);
	const existingIssues = await client.listIssues();

	return {
		config: toPublicGitHubIntegration(config),
		plan: planGitHubSync(existingIssues, desiredItems),
	};
}

export async function applyGitHubSync(projectRoot, projectData) {
	const config = getGitHubIntegrationOrThrow(projectRoot);
	const client = createGitHubClient(config);
	const desiredItems = mapProjectToGitHubItems(projectData);
	const issueSync = await syncGitHubIssues(client, desiredItems);

	return {
		config: toPublicGitHubIntegration(config),
		plan: issueSync.plan,
		applied: issueSync.applied,
	};
}

export async function syncGitHubProject(projectRoot, projectData) {
	const config = getGitHubIntegrationOrThrow(projectRoot);
	const client = createGitHubClient(config);
	const desiredItems = mapProjectToGitHubItems(projectData);
	const issueSync = await syncGitHubIssues(client, desiredItems);
	const projectSync = await syncGitHubProjectBoard(projectRoot, config, client, desiredItems, issueSync.issueMap, {
		projectTitle: getGitHubProjectTitle(config),
	});

	return {
		config: toPublicGitHubIntegration(projectSync.config),
		issues: {
			plan: issueSync.plan,
			applied: issueSync.applied,
		},
		project: projectSync.project,
	};
}

export async function syncGitHubStatusForStory(projectRoot, projectData, storyId) {
	const config = getGitHubIntegrationOrThrow(projectRoot);
	const client = createGitHubClient(config);
	const desiredItems = mapProjectToGitHubItems(projectData);
	const storyBmadId = `story:${storyId}`;
	const storyItem = desiredItems.find((item) => item.bmadId === storyBmadId);
	if (!storyItem) {
		throw new Error(`Story "${storyId}" is not available in the current BMAD project`);
	}

	const relatedItems = desiredItems.filter((item) => item.bmadId === storyBmadId || item.bmadId === `epic:${storyItem.epicNum}`);
	const issueSync = await syncSubsetOfGitHubIssues(client, relatedItems);

	let nextConfig = config;
	let project = null;
	if (config.project?.id || config.project?.title) {
		const projectSync = await syncGitHubProjectBoard(projectRoot, config, client, relatedItems, issueSync.issueMap, {
			projectTitle: config.project?.title || getGitHubProjectTitle(config),
			createIfMissing: true,
		});
		nextConfig = projectSync.config;
		project = projectSync.project;
	}

	return {
		config: toPublicGitHubIntegration(nextConfig),
		applied: issueSync.applied,
		storyId,
		project,
	};
}

export function hasGitHubIntegration(projectRoot) {
	return Boolean(loadIntegrationsConfig(projectRoot).github);
}

export function normalizeGitHubRepositoryInput(ownerInput, repoInput) {
	const owner = String(ownerInput || '').trim();
	const repo = String(repoInput || '').trim();

	if (repo) {
		const repoMatch = parseGitHubRepoReference(repo);
		if (repoMatch) {
			return repoMatch;
		}
	}

	if (owner) {
		const ownerMatch = parseGitHubRepoReference(owner);
		if (ownerMatch) {
			return ownerMatch;
		}
	}

	return { owner, repo };
}

export function pickGitHubProjectStatusOption(options, bmadStatus) {
	const normalizedOptions = (options || []).map((option) => ({
		...option,
		normalizedName: normalizeStatusName(option.name),
	}));

	const candidateNames = {
		backlog: ['Backlog', 'Todo', 'To do'],
		'ready-for-dev': ['Ready for Dev', 'Ready', 'Todo', 'To do'],
		'in-progress': ['In Progress', 'Working', 'Doing'],
		review: ['Review', 'In Progress', 'Working'],
		done: ['Done', 'Complete', 'Completed'],
	}[bmadStatus] || ['Todo'];

	for (const candidateName of candidateNames) {
		const normalizedCandidate = normalizeStatusName(candidateName);
		const match = normalizedOptions.find((option) => option.normalizedName === normalizedCandidate);
		if (match) return match;
	}

	return normalizedOptions[0] || null;
}

function getGitHubIntegrationOrThrow(projectRoot) {
	const config = loadIntegrationsConfig(projectRoot);
	if (!config.github) {
		throw new Error('GitHub integration is not connected yet');
	}
	return config.github;
}

function createGitHubClient(config) {
	return new GitHubClient({
		owner: config.owner,
		repo: config.repo,
		token: resolveGitHubToken(config),
	});
}

async function syncGitHubIssues(client, desiredItems) {
	const existingIssues = await client.listIssues();
	const plan = planGitHubSync(existingIssues, desiredItems);
	const applied = {
		created: [],
		updated: [],
		closed: [],
	};

	for (const item of plan.create) {
		const created = await client.createIssue(item);
		applied.created.push({
			bmadId: item.bmadId,
			issueNumber: created.number,
			title: created.title,
		});
	}

	for (const item of plan.update) {
		const updated = await client.updateIssue(item.issueNumber, item);
		applied.updated.push({
			bmadId: item.bmadId,
			issueNumber: updated.number,
			title: updated.title,
		});
	}

	for (const item of plan.close) {
		const closed = await client.closeIssue(item.issueNumber);
		applied.closed.push({
			bmadId: item.bmadId,
			issueNumber: closed.number,
			title: closed.title,
		});
	}

	return {
		plan,
		applied,
		issueMap: buildExistingIssuesMap(await client.listIssues()),
	};
}

async function syncSubsetOfGitHubIssues(client, desiredItems) {
	const existingMap = buildExistingIssuesMap(await client.listIssues());
	const applied = {
		created: [],
		updated: [],
	};

	for (const item of desiredItems) {
		const existing = existingMap.get(item.bmadId);
		if (!existing) {
			const created = await client.createIssue(item);
			applied.created.push({
				bmadId: item.bmadId,
				issueNumber: created.number,
				title: created.title,
			});
			continue;
		}

		const diff = diffGitHubIssue(existing, item);
		if (diff.needsUpdate) {
			const updated = await client.updateIssue(diff.issue.issueNumber, diff.issue);
			applied.updated.push({
				bmadId: item.bmadId,
				issueNumber: updated.number,
				title: updated.title,
			});
		}
	}

	return {
		applied,
		issueMap: buildExistingIssuesMap(await client.listIssues()),
	};
}

async function syncGitHubProjectBoard(projectRoot, config, client, desiredItems, issueMap, options = {}) {
	const ensured = await ensureGitHubProject(projectRoot, config, client, options.projectTitle || getGitHubProjectTitle(config), options.createIfMissing !== false);
	const projectInfo = ensured.projectInfo;
	const statusField = findGitHubProjectStatusField(projectInfo.fields?.nodes || []);
	if (!statusField) {
		throw new Error(`GitHub Project "${projectInfo.title}" does not have a Status field that can be updated.`);
	}

	const projectItems = buildGitHubProjectItemMap(projectInfo.items?.nodes || []);
	const applied = {
		project: {
			id: projectInfo.id,
			title: projectInfo.title,
			url: projectInfo.url,
		},
		added: [],
		updatedStatus: [],
	};

	for (const desiredItem of desiredItems) {
		const issue = issueMap.get(desiredItem.bmadId);
		if (!issue?.nodeId) continue;

		let projectItem = projectItems.get(desiredItem.bmadId);
		if (!projectItem) {
			const createdItem = await client.addProjectV2ItemById(projectInfo.id, issue.nodeId);
			projectItem = {
				id: createdItem.id,
				statusOptionId: null,
				statusName: null,
			};
			projectItems.set(desiredItem.bmadId, projectItem);
			applied.added.push({
				bmadId: desiredItem.bmadId,
				title: desiredItem.title,
			});
		}

		const desiredOption = pickGitHubProjectStatusOption(statusField.options || [], desiredItem.bmadStatus);
		if (!desiredOption) continue;
		if (projectItem.statusOptionId === desiredOption.id) continue;

		await client.updateProjectV2ItemStatus(projectInfo.id, projectItem.id, statusField.id, desiredOption.id);
		projectItem.statusOptionId = desiredOption.id;
		projectItem.statusName = desiredOption.name;
		applied.updatedStatus.push({
			bmadId: desiredItem.bmadId,
			title: desiredItem.title,
			status: desiredOption.name,
		});
	}

	return {
		config: ensured.config,
		project: applied,
	};
}

async function ensureGitHubProject(projectRoot, config, client, projectTitle, createIfMissing) {
	let projectInfo = null;

	if (config.project?.id) {
		try {
			projectInfo = await client.getProjectV2(config.project.id);
		} catch {
			projectInfo = null;
		}
	}

	if (!projectInfo && config.project?.title) {
		const existing = await client.findProjectV2ByTitle(config.project.title);
		if (existing) {
			projectInfo = await client.getProjectV2(existing.id);
		}
	}

	if (!projectInfo) {
		const existing = await client.findProjectV2ByTitle(projectTitle);
		if (existing) {
			projectInfo = await client.getProjectV2(existing.id);
		}
	}

	if (!projectInfo && createIfMissing) {
		const repository = await client.getRepository();
		const created = await client.createProjectV2(repository.owner.node_id, projectTitle);
		projectInfo = await client.getProjectV2(created.id);
	}

	if (!projectInfo) {
		throw new Error('GitHub Project board is not configured yet');
	}

	const nextConfig = {
		...config,
		project: {
			id: projectInfo.id,
			title: projectInfo.title,
			url: projectInfo.url,
		},
	};
	saveGitHubIntegration(projectRoot, nextConfig);

	return {
		config: nextConfig,
		projectInfo,
	};
}

function buildGitHubProjectItemMap(items) {
	const map = new Map();

	for (const item of items) {
		const body = item.content?.body || '';
		const bmadId = parseBmadMarker(body);
		if (!bmadId) continue;

		map.set(bmadId, {
			id: item.id,
			statusOptionId: item.fieldValueByName?.optionId || null,
			statusName: item.fieldValueByName?.name || null,
		});
	}

	return map;
}

function findGitHubProjectStatusField(fields) {
	return fields.find((field) => field && field.name === 'Status' && Array.isArray(field.options));
}

function getGitHubProjectTitle(config) {
	return `${config.repo} BMAD Board`;
}

function resolveGitHubToken(config) {
	if (config.token) {
		return config.token;
	}

	const token = process.env[config.tokenEnvVar];
	if (!token) {
		throw new Error(`GitHub token not found in environment variable ${config.tokenEnvVar}`);
	}
	return token;
}

function normalizeStatusName(value) {
	return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseGitHubRepoReference(value) {
	const cleaned = String(value || '').trim().replace(/\/+$/, '');
	if (!cleaned) return null;

	const urlMatch = cleaned.match(/^https?:\/\/github\.com\/([^\/\s]+)\/([^\/\s?#]+)$/i);
	if (urlMatch) {
		return { owner: urlMatch[1], repo: urlMatch[2] };
	}

	const pathMatch = cleaned.match(/^([^\/\s]+)\/([^\/\s]+)$/);
	if (pathMatch) {
		return { owner: pathMatch[1], repo: pathMatch[2] };
	}

	return null;
}
