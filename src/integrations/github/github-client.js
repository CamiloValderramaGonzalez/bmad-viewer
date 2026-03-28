const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_GRAPHQL_API = 'https://api.github.com/graphql';

export class GitHubClient {
	constructor({ owner, repo, token }) {
		this.owner = owner;
		this.repo = repo;
		this.token = token;
	}

	async getRepository() {
		return this.request(`/repos/${this.owner}/${this.repo}`);
	}

	async enableIssues() {
		return this.request(`/repos/${this.owner}/${this.repo}`, {
			method: 'PATCH',
			body: JSON.stringify({ has_issues: true }),
		});
	}

	async listIssues() {
		const issues = [];
		let page = 1;

		while (true) {
			const batch = await this.requestIssuesEndpoint(`/repos/${this.owner}/${this.repo}/issues?state=all&per_page=100&page=${page}`);
			const filtered = batch.filter((item) => !item.pull_request);
			issues.push(...filtered.map(mapIssueFromApi));

			if (batch.length < 100) break;
			page += 1;
		}

		return issues;
	}

	async createIssue(issue) {
		const created = await this.requestIssuesEndpoint(`/repos/${this.owner}/${this.repo}/issues`, {
			method: 'POST',
			body: JSON.stringify({
				title: issue.title,
				body: issue.body,
				labels: issue.labels,
			}),
		});
		return mapIssueFromApi(created);
	}

	async updateIssue(issueNumber, issue) {
		const updated = await this.requestIssuesEndpoint(`/repos/${this.owner}/${this.repo}/issues/${issueNumber}`, {
			method: 'PATCH',
			body: JSON.stringify({
				title: issue.title,
				body: issue.body,
				labels: issue.labels,
				state: issue.state,
			}),
		});
		return mapIssueFromApi(updated);
	}

	async closeIssue(issueNumber) {
		const closed = await this.requestIssuesEndpoint(`/repos/${this.owner}/${this.repo}/issues/${issueNumber}`, {
			method: 'PATCH',
			body: JSON.stringify({ state: 'closed' }),
		});
		return mapIssueFromApi(closed);
	}

	async requestIssuesEndpoint(path, init = {}) {
		try {
			return await this.request(path, init);
		} catch (error) {
			if (!(error instanceof GitHubApiError) || error.status !== 410) {
				throw error;
			}

			try {
				await this.enableIssues();
			} catch (enableError) {
				if (enableError instanceof GitHubApiError && (enableError.status === 403 || enableError.status === 404)) {
					throw new Error(`Issues are disabled in "${this.owner}/${this.repo}" and the token could not enable them automatically. Enable Issues in the repository settings or use a token with repository admin access.`);
				}
				throw enableError;
			}

			return this.request(path, init);
		}
	}

	async findProjectV2ByTitle(title) {
		const ownerData = await this.queryProjectsOwner(title);
		if (!ownerData) return null;

		const project = (ownerData.projectsV2?.nodes || []).find((node) => !node.closed && node.title === title);
		return project ? { ...project, ownerId: ownerData.id, ownerLogin: ownerData.login } : null;
	}

	async createProjectV2(ownerId, title) {
		const data = await this.graphql(
			`mutation($ownerId: ID!, $title: String!) {
				createProjectV2(input: { ownerId: $ownerId, title: $title }) {
					projectV2 {
						id
						title
						url
					}
				}
			}`,
			{ ownerId, title },
		);
		return data.createProjectV2.projectV2;
	}

	async getProjectV2(projectId) {
		const data = await this.graphql(
			`query($projectId: ID!) {
				node(id: $projectId) {
					... on ProjectV2 {
						id
						title
						url
						fields(first: 50) {
							nodes {
								__typename
								... on ProjectV2Field {
									id
									name
									dataType
								}
								... on ProjectV2IterationField {
									id
									name
									dataType
								}
								... on ProjectV2SingleSelectField {
									id
									name
									dataType
									options {
										id
										name
									}
								}
							}
						}
						items(first: 100) {
							nodes {
								id
								fieldValueByName(name: "Status") {
									... on ProjectV2ItemFieldSingleSelectValue {
										name
										optionId
									}
								}
								content {
									__typename
									... on Issue {
										id
										number
										title
										body
									}
								}
							}
						}
					}
				}
			}`,
			{ projectId },
		);

		return data.node;
	}

	async addProjectV2ItemById(projectId, contentId) {
		const data = await this.graphql(
			`mutation($projectId: ID!, $contentId: ID!) {
				addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
					item {
						id
					}
				}
			}`,
			{ projectId, contentId },
		);
		return data.addProjectV2ItemById.item;
	}

	async updateProjectV2ItemStatus(projectId, itemId, fieldId, optionId) {
		const data = await this.graphql(
			`mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
				updateProjectV2ItemFieldValue(input: {
					projectId: $projectId,
					itemId: $itemId,
					fieldId: $fieldId,
					value: { singleSelectOptionId: $optionId }
				}) {
					projectV2Item {
						id
					}
				}
			}`,
			{ projectId, itemId, fieldId, optionId },
		);
		return data.updateProjectV2ItemFieldValue.projectV2Item;
	}

	async request(path, init = {}) {
		const response = await fetch(`${GITHUB_API_BASE}${path}`, {
			...init,
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${this.token}`,
				'X-GitHub-Api-Version': '2022-11-28',
				'Content-Type': 'application/json',
				...(init.headers || {}),
			},
		});

		if (!response.ok) {
			const bodyText = await response.text();
			throw new GitHubApiError(formatGitHubApiError({
				status: response.status,
				statusText: response.statusText,
				bodyText,
				owner: this.owner,
				repo: this.repo,
				path,
			}), {
				status: response.status,
				statusText: response.statusText,
				bodyText,
				path,
			});
		}

		return response.status === 204 ? null : response.json();
	}

	async graphql(query, variables = {}) {
		const response = await fetch(GITHUB_GRAPHQL_API, {
			method: 'POST',
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${this.token}`,
				'X-GitHub-Api-Version': '2022-11-28',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ query, variables }),
		});

		const payload = await response.json();
		if (!response.ok || payload.errors?.length) {
			const message = payload.errors?.map((error) => error.message).join('; ') || response.statusText;
			throw new Error(`GitHub GraphQL error: ${message}`);
		}

		return payload.data;
	}

	async queryProjectsOwner(projectQuery) {
		const data = await this.graphql(
			`query($owner: String!, $repo: String!, $projectQuery: String!) {
				repository(owner: $owner, name: $repo) {
					owner {
						__typename
						login
						... on User {
							id
							projectsV2(first: 20, query: $projectQuery) {
								nodes {
									id
									title
									url
									closed
								}
							}
						}
						... on Organization {
							id
							projectsV2(first: 20, query: $projectQuery) {
								nodes {
									id
									title
									url
									closed
								}
							}
						}
					}
				}
			}`,
			{ owner: this.owner, repo: this.repo, projectQuery },
		);

		return data.repository?.owner || null;
	}
}

export class GitHubApiError extends Error {
	constructor(message, details = {}) {
		super(message);
		this.name = 'GitHubApiError';
		this.status = details.status;
		this.statusText = details.statusText;
		this.bodyText = details.bodyText;
		this.path = details.path;
	}
}

function mapIssueFromApi(item) {
	return {
		number: item.number,
		nodeId: item.node_id || null,
		title: item.title,
		body: item.body || '',
		state: item.state,
		labels: (item.labels || []).map((label) => typeof label === 'string' ? label : label.name).filter(Boolean),
	};
}

function formatGitHubApiError({ status, statusText, bodyText, owner, repo, path }) {
	const payload = tryParseJson(bodyText);
	const apiMessage = payload && typeof payload.message === 'string' ? payload.message : '';
	const repoLabel = `${owner}/${repo}`;
	const isRepositoryEndpoint = path === `/repos/${owner}/${repo}`;

	if (status === 401) {
		return 'GitHub rejected the token. Verify that the personal access token is valid and not expired.';
	}

	if (status === 403) {
		return `GitHub denied access to "${repoLabel}". Verify that the token has permission to read and write issues in that repository.`;
	}

	if (status === 404 && isRepositoryEndpoint) {
		return `GitHub could not find "${repoLabel}". Verify the owner, the repository name, and that the token can access that repo if it is private.`;
	}

	if (status === 404) {
		return `GitHub could not access "${repoLabel}" for this operation. Verify that the repository exists, Issues are enabled, and the token has access.`;
	}

	if (status === 410) {
		return `Issues are disabled in "${repoLabel}". The viewer will try to enable them automatically if the token has repository admin access.`;
	}

	return `GitHub API error ${status}: ${apiMessage || bodyText || statusText}`;
}

function tryParseJson(value) {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}
