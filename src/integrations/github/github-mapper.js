function normalizeBodyText(text) {
	return (text || '').replace(/\r\n/g, '\n').trim();
}

export function mapProjectToGitHubItems(project) {
	const desired = [];
	const epicMap = new Map();
	const storyContents = project.storyContents || {};

	for (const epic of project.epics || []) {
		const epicId = `epic:${epic.num}`;
		const epicLabels = ['bmad', 'bmad:epic', `bmad:status:${epic.status}`, `bmad:epic:${epic.num}`];
		const epicBody = normalizeBodyText([
			`# BMAD Epic ${epic.num}`,
			'',
			epic.name,
			'',
			`Status: ${epic.status}`,
			`Stories: ${(epic.stories || []).length}`,
			'',
			'<!-- bmad:type=epic -->',
			`<!-- bmad:id=${epicId} -->`,
			`<!-- bmad:epic=${epic.num} -->`,
		].join('\n'));

		const epicItem = {
			bmadId: epicId,
			type: 'epic',
			title: `Epic ${epic.num}: ${epic.name}`,
			body: epicBody,
			labels: epicLabels,
			state: epic.status === 'done' ? 'closed' : 'open',
			epicNum: epic.num,
			bmadStatus: epic.status,
		};

		epicMap.set(epic.num, epicItem);
		desired.push(epicItem);
	}

	for (const story of project.storyList || []) {
		const storyKey = `${story.epic}-${story.id.split('-')[1]}`;
		const storyContent = storyContents[storyKey];
		const storyBody = normalizeBodyText([
			`# BMAD Story ${story.id}`,
			'',
			storyContent?.title || story.title,
			'',
			`Epic: ${story.epic}`,
			`Status: ${story.status}`,
			'',
			'<!-- bmad:type=story -->',
			`<!-- bmad:id=story:${story.id} -->`,
			`<!-- bmad:story=${story.id} -->`,
			`<!-- bmad:epic=${story.epic} -->`,
		].join('\n'));

		desired.push({
			bmadId: `story:${story.id}`,
			type: 'story',
			title: `${story.id} ${story.title}`,
			body: storyBody,
			labels: ['bmad', 'bmad:story', `bmad:status:${story.status}`, `bmad:epic:${story.epic}`],
			state: story.status === 'done' ? 'closed' : 'open',
			epicNum: story.epic,
			parentBmadId: epicMap.has(story.epic) ? `epic:${story.epic}` : null,
			bmadStatus: story.status,
		});
	}

	return desired;
}

export function parseBmadMarker(body) {
	const value = /<!--\s*bmad:id=([^\s]+)\s*-->/.exec(body || '');
	return value ? value[1] : null;
}

export function buildExistingIssuesMap(existingIssues) {
	const existingMap = new Map();
	for (const issue of existingIssues) {
		const bmadId = parseBmadMarker(issue.body || '');
		if (bmadId) {
			existingMap.set(bmadId, issue);
		}
	}
	return existingMap;
}

export function diffGitHubIssue(existing, desired) {
	if (!existing) return { needsUpdate: false };

	const labelSet = new Set(existing.labels || []);
	const normalizedLabels = [...desired.labels].sort().join('|');
	const currentLabels = [...labelSet].sort().join('|');
	const nextState = desired.state;
	const currentState = existing.state;
	const nextBody = normalizeBodyText(desired.body);
	const currentBody = normalizeBodyText(existing.body || '');

	if (existing.title !== desired.title || currentBody !== nextBody || currentLabels !== normalizedLabels || currentState !== nextState) {
		return {
			needsUpdate: true,
			issue: {
				...desired,
				issueNumber: existing.number,
				current: {
					title: existing.title,
					body: existing.body || '',
					labels: existing.labels || [],
					state: existing.state,
				},
			},
		};
	}

	return { needsUpdate: false };
}

export function planGitHubSync(existingIssues, desiredItems) {
	const existingMap = buildExistingIssuesMap(existingIssues);

	const plan = {
		create: [],
		update: [],
		close: [],
		summary: { create: 0, update: 0, close: 0 },
	};

	for (const item of desiredItems) {
		const existing = existingMap.get(item.bmadId);
		if (!existing) {
			plan.create.push(item);
			continue;
		}

		const diff = diffGitHubIssue(existing, item);
		if (diff.needsUpdate) {
			plan.update.push(diff.issue);
		}

		existingMap.delete(item.bmadId);
	}

	for (const [bmadId, issue] of existingMap.entries()) {
		if (issue.state !== 'closed') {
			plan.close.push({
				bmadId,
				issueNumber: issue.number,
				title: issue.title,
			});
		}
	}

	plan.summary = {
		create: plan.create.length,
		update: plan.update.length,
		close: plan.close.length,
	};

	return plan;
}
