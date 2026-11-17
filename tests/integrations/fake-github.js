// In-memory fake of the slice of the GitHub REST and GraphQL APIs that the sync uses.
// Install with `fake.install()`; every request goes through a stubbed `globalThis.fetch`
// that throws on any host other than api.github.com, so tests never reach the network.

const API_HOST = 'api.github.com';

export const DEFAULT_STATUS_OPTIONS = [
	{ id: 'opt_todo', name: 'Todo' },
	{ id: 'opt_progress', name: 'In Progress' },
	{ id: 'opt_done', name: 'Done' },
];

export class FakeGitHub {
	constructor({ owner = 'octo-org', repo = 'octo-repo' } = {}) {
		this.owner = owner;
		this.repo = repo;
		this.ownerNodeId = `O_${owner}`;
		this.issues = [];
		this.projects = [];
		this.calls = [];
		this.nextIssueNumber = 1;
		this.nextProjectNumber = 1;
		this.nextItemNumber = 1;
		// Failure mode for getProjectV2's first-page query:
		// { network: true } | { status, html? } | { nullNode: true } | { notFoundError: true, notFoundPath? },
		// optionally with `projectId` to fail only lookups of that id.
		this.failProjectNode = null;
		// Failure mode for follow-up (after: $cursor) items pages: { network: true } | { nullNode: true }
		this.failItemsPage = null;
		this.originalFetch = null;
	}

	install() {
		this.originalFetch = globalThis.fetch;
		globalThis.fetch = (input, init) => this.fetch(input, init);
		return this;
	}

	uninstall() {
		if (this.originalFetch) {
			globalThis.fetch = this.originalFetch;
			this.originalFetch = null;
		}
	}

	resetCalls() {
		this.calls = [];
	}

	callsOf(op) {
		return this.calls.filter((call) => call.op === op);
	}

	// --- seeding helpers -------------------------------------------------

	addProject({ title, statusOptions = DEFAULT_STATUS_OPTIONS } = {}) {
		const number = this.nextProjectNumber++;
		const project = {
			id: `PVT_${number}`,
			title,
			url: `https://github.com/users/${this.owner}/projects/${number}`,
			closed: false,
			statusField: { id: `PVTSSF_${number}`, name: 'Status', options: statusOptions },
			items: [],
		};
		this.projects.push(project);
		return project;
	}

	addDraftItems(project, count, { atStart = true } = {}) {
		const drafts = [];
		for (let i = 0; i < count; i += 1) {
			drafts.push({ id: `PVTI_${this.nextItemNumber++}`, contentId: null, statusOptionId: null });
		}
		project.items = atStart ? [...drafts, ...project.items] : [...project.items, ...drafts];
	}

	// --- fetch routing ---------------------------------------------------

	async fetch(input, init = {}) {
		const url = new URL(typeof input === 'string' ? input : input.url);
		if (url.host !== API_HOST) {
			throw new Error(`FakeGitHub: refusing request to non-GitHub host ${url.host}`);
		}

		const method = (init.method || 'GET').toUpperCase();
		const body = init.body ? JSON.parse(init.body) : null;

		if (url.pathname === '/graphql' && method === 'POST') {
			return this.handleGraphql(body);
		}
		return this.handleRest(method, url, body);
	}

	handleRest(method, url, body) {
		const repoPath = `/repos/${this.owner}/${this.repo}`;
		const path = url.pathname;

		if (path === repoPath && method === 'GET') {
			this.calls.push({ op: 'getRepository' });
			return json({
				full_name: `${this.owner}/${this.repo}`,
				private: false,
				html_url: `https://github.com/${this.owner}/${this.repo}`,
				default_branch: 'main',
				has_issues: true,
				owner: { login: this.owner, node_id: this.ownerNodeId },
			});
		}

		if (path === `${repoPath}/issues` && method === 'GET') {
			const perPage = Number(url.searchParams.get('per_page') || 30);
			const page = Number(url.searchParams.get('page') || 1);
			this.calls.push({ op: 'listIssues', page, perPage });
			const start = (page - 1) * perPage;
			return json(this.issues.slice(start, start + perPage).map(toRestIssue));
		}

		if (path === `${repoPath}/issues` && method === 'POST') {
			const number = this.nextIssueNumber++;
			const issue = {
				number,
				node_id: `I_${number}`,
				title: body.title,
				body: body.body || '',
				state: 'open',
				labels: [...(body.labels || [])],
			};
			this.issues.push(issue);
			this.calls.push({ op: 'createIssue', number, title: issue.title });
			return json(toRestIssue(issue), 201);
		}

		const issueMatch = path.match(new RegExp(`^${escapeRegExp(repoPath)}/issues/(\\d+)$`));
		if (issueMatch && method === 'PATCH') {
			const number = Number(issueMatch[1]);
			const issue = this.issues.find((candidate) => candidate.number === number);
			if (!issue) return json({ message: 'Not Found' }, 404, 'Not Found');

			const isClose = Object.keys(body).length === 1 && body.state === 'closed';
			if (body.title !== undefined) issue.title = body.title;
			if (body.body !== undefined) issue.body = body.body;
			if (body.labels !== undefined) issue.labels = [...body.labels];
			if (body.state !== undefined) issue.state = body.state;
			this.calls.push({ op: isClose ? 'closeIssue' : 'updateIssue', number });
			return json(toRestIssue(issue));
		}

		throw new Error(`FakeGitHub: unhandled REST ${method} ${path}`);
	}

	handleGraphql({ query, variables = {} }) {
		if (query.includes('createProjectV2(')) {
			this.calls.push({ op: 'createProjectV2', title: variables.title });
			const project = this.addProject({ title: variables.title });
			return gqlData({
				createProjectV2: {
					projectV2: { id: project.id, title: project.title, url: project.url },
				},
			});
		}

		if (query.includes('addProjectV2ItemById(')) {
			const project = this.requireProject(variables.projectId);
			let item = project.items.find((candidate) => candidate.contentId === variables.contentId);
			if (!item) {
				item = {
					id: `PVTI_${this.nextItemNumber++}`,
					contentId: variables.contentId,
					statusOptionId: null,
				};
				project.items.push(item);
			}
			this.calls.push({ op: 'addProjectV2ItemById', contentId: variables.contentId });
			return gqlData({ addProjectV2ItemById: { item: { id: item.id } } });
		}

		if (query.includes('updateProjectV2ItemFieldValue(')) {
			const project = this.requireProject(variables.projectId);
			const item = project.items.find((candidate) => candidate.id === variables.itemId);
			if (!item) throw new Error(`FakeGitHub: unknown project item ${variables.itemId}`);
			item.statusOptionId = variables.optionId;
			this.calls.push({
				op: 'updateProjectV2ItemStatus',
				itemId: item.id,
				contentId: item.contentId,
				optionId: variables.optionId,
			});
			return gqlData({ updateProjectV2ItemFieldValue: { projectV2Item: { id: item.id } } });
		}

		if (query.includes('repository(owner:')) {
			this.calls.push({ op: 'findProjectV2ByTitle', query: variables.projectQuery });
			const nodes = this.projects
				.filter((project) => project.title.includes(variables.projectQuery))
				.slice(0, 20)
				.map(({ id, title, url, closed }) => ({ id, title, url, closed }));
			return gqlData({
				repository: {
					owner: {
						__typename: 'User',
						login: this.owner,
						id: this.ownerNodeId,
						projectsV2: { nodes },
					},
				},
			});
		}

		if (query.includes('node(id:')) {
			const isFirstPage = query.includes('fields(first:');
			const projectId = variables.projectId;
			this.calls.push({
				op: isFirstPage ? 'getProjectV2' : 'getProjectV2Items',
				projectId,
				cursor: variables.cursor ?? null,
			});

			const failureApplies =
				this.failProjectNode &&
				(!this.failProjectNode.projectId || this.failProjectNode.projectId === projectId);
			if (!isFirstPage && this.failItemsPage) {
				if (this.failItemsPage.network) {
					throw new TypeError('fetch failed');
				}
				if (this.failItemsPage.nullNode) {
					return gqlData({ node: null });
				}
			}

			if (isFirstPage && failureApplies) {
				const failure = this.failProjectNode;
				if (failure.network) {
					throw new TypeError('fetch failed');
				}
				if (failure.nullNode) {
					return gqlData({ node: null });
				}
				if (failure.notFoundError) {
					return json({
						data: { node: null },
						errors: [
							{
								type: 'NOT_FOUND',
								path: failure.notFoundPath || ['node'],
								message: `Could not resolve to a node with the global id of '${projectId}'`,
							},
						],
					});
				}
				if (failure.status) {
					return failure.html
						? new Response('<html><body>Bad gateway</body></html>', {
								status: failure.status,
								statusText: 'Bad Gateway',
								headers: { 'Content-Type': 'text/html' },
							})
						: json({ message: 'Bad credentials' }, failure.status, 'Error');
				}
			}

			const project = this.projects.find((candidate) => candidate.id === projectId);
			if (!project) return gqlData({ node: null });

			const first = extractFirst(query);
			const usesCursor = /after:\s*\$cursor/.test(query);
			const start = usesCursor && variables.cursor ? Number(variables.cursor) : 0;
			const pageItems = project.items.slice(start, start + first);
			const end = start + pageItems.length;
			const items = {
				nodes: pageItems.map((item) => this.toProjectItemNode(project, item)),
				...(query.includes('pageInfo')
					? {
							pageInfo: {
								hasNextPage: end < project.items.length,
								endCursor: pageItems.length ? String(end) : null,
							},
						}
					: {}),
			};

			if (!isFirstPage) {
				return gqlData({ node: { items } });
			}

			return gqlData({
				node: {
					id: project.id,
					title: project.title,
					url: project.url,
					fields: {
						nodes: [
							{ __typename: 'ProjectV2Field', id: 'PVTF_title', name: 'Title', dataType: 'TITLE' },
							{
								__typename: 'ProjectV2SingleSelectField',
								id: project.statusField.id,
								name: 'Status',
								dataType: 'SINGLE_SELECT',
								options: project.statusField.options,
							},
						],
					},
					items,
				},
			});
		}

		throw new Error(`FakeGitHub: unhandled GraphQL query ${query.slice(0, 80)}`);
	}

	requireProject(projectId) {
		const project = this.projects.find((candidate) => candidate.id === projectId);
		if (!project) throw new Error(`FakeGitHub: unknown project ${projectId}`);
		return project;
	}

	toProjectItemNode(project, item) {
		const option = project.statusField.options.find((opt) => opt.id === item.statusOptionId);
		const issue = item.contentId
			? this.issues.find((candidate) => candidate.node_id === item.contentId)
			: null;
		return {
			id: item.id,
			fieldValueByName: option ? { name: option.name, optionId: option.id } : null,
			content: issue
				? {
						__typename: 'Issue',
						id: issue.node_id,
						number: issue.number,
						title: issue.title,
						body: issue.body,
					}
				: { __typename: 'DraftIssue' },
		};
	}
}

function toRestIssue(issue) {
	return {
		number: issue.number,
		node_id: issue.node_id,
		title: issue.title,
		body: issue.body,
		state: issue.state,
		labels: issue.labels.map((name) => ({ name })),
	};
}

function extractFirst(query) {
	const match = /items\(first:\s*(\d+)/.exec(query);
	return match ? Number(match[1]) : 100;
}

function gqlData(data) {
	return json({ data });
}

function json(payload, status = 200, statusText = 'OK') {
	return new Response(JSON.stringify(payload), {
		status,
		statusText,
		headers: { 'Content-Type': 'application/json' },
	});
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
