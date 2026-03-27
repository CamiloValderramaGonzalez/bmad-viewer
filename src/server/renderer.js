import { BaseLayout } from '../templates/base-layout.js';
import { SidebarNav } from '../components/sidebar-nav.js';
import { StatsBox } from '../components/stats-box.js';
import { KanbanColumn } from '../components/kanban-column.js';
import { ProgressBar } from '../components/progress-bar.js';
import { escapeHtml } from '../utils/html-escape.js';

/**
 * Render the complete dashboard HTML.
 * @param {{wiki: object, project: object, config: object, aggregator: object}} dataModel
 * @returns {string} Complete HTML
 */
export function renderDashboard(dataModel) {
	const { wiki, project, config, aggregator } = dataModel;

	// Build sidebar with proper module/group/item structure
	const sidebar = SidebarNav({
		modules: wiki.modules,
		artifacts: project.artifacts,
		epics: project.epics,
		artifactGroups: project.artifactGroups,
	});

	// Build content data JSON for client-side rendering
	const contentMap = buildContentMap(wiki, project);

	// Build wiki view (initially shows welcome)
	const wikiContent = `<div id="wiki-view">
	<main class="content-area" id="content-area">
		<div class="content-area__breadcrumb" id="wiki-breadcrumb"></div>
		<div class="content-area__body" id="wiki-content-body">
			<h1>${escapeHtml(config.project_name || 'BMAD')} ${config.project_name ? '- bmad-viewer' : 'Viewer'}</h1>
			${config.projectContextHtml
				? `<div class="project-intro">${config.projectContextHtml}</div>`
				: ''}
			<p>Select an item from the sidebar to view its content, or use <kbd>Ctrl+K</kbd> to search.</p>
		</div>
	</main>
</div>`;

	// Build project view
	const storyList = project.storyList || [];
	const pending = storyList.filter((s) => s.status === 'backlog' || s.status === 'ready-for-dev');
	const inProgress = storyList.filter((s) => s.status === 'in-progress');
	const done = storyList.filter((s) => s.status === 'done' || s.status === 'review');

	const noData = project.epics.length === 0 && project.stories.total === 0;
	const configPanel = `<div class="path-config-panel${noData ? '' : ' path-config-panel--collapsed'}" id="path-config-panel">
	<div class="path-config-panel__toggle" id="path-config-toggle">
		<h3>${noData ? 'No project data found' : 'Custom paths'}</h3>
		<span class="path-config-panel__arrow" id="path-config-arrow">${noData ? '' : '&#9654;'}</span>
	</div>
	${noData ? '<p class="path-config-panel__hint" style="margin-bottom:12px">Could not auto-detect epics or sprint status. Specify custom paths below.</p>' : ''}
	<div class="path-config-panel__fields" id="path-config-fields">
		<label class="path-config-panel__label">
			<span>Output folder</span>
			<input type="text" id="custom-output-path" class="path-config-panel__input" placeholder="e.g. /project/_bmad-output" />
			<span class="path-config-panel__hint">Folder containing planning-artifacts, implementation-artifacts, etc.</span>
		</label>
		<label class="path-config-panel__label">
			<span>Epics file</span>
			<input type="text" id="custom-epics-path" class="path-config-panel__input" placeholder="e.g. /project/docs/epics.md" />
			<span class="path-config-panel__hint">Markdown file with epic/story definitions (## Epic N: / ### Story N.M:)</span>
		</label>
		<label class="path-config-panel__label">
			<span>Sprint status file</span>
			<input type="text" id="custom-sprint-status-path" class="path-config-panel__input" placeholder="e.g. /project/sprint-status.yaml" />
			<span class="path-config-panel__hint">YAML file (.yaml or .md) with development_status section</span>
		</label>
		<button class="path-config-panel__btn" id="apply-paths-btn">Apply</button>
		<span class="path-config-panel__status" id="path-config-status"></span>
	</div>
</div>`;

	// Mix bugs and pendientes into kanban columns as cards
	const pendingGlobal = (project.pendingItems || []).filter(i => !i.done).map(i => ({
		id: `global-${i.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
		title: i.title,
		status: 'backlog',
		epic: 'Global',
		detail: i.detail,
		cardType: 'global',
	}));
	const doneGlobal = (project.pendingItems || []).filter(i => i.done).map(i => ({
		id: `global-${i.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
		title: i.title,
		status: 'done',
		epic: 'Global',
		cardType: 'global',
	}));
	const bugCards = (project.bugs || []).map(b => ({
		id: b.id.toLowerCase(),
		title: b.description,
		status: b.status,
		epic: b.id,
		cardType: 'bug',
	}));
	const doneBugs = bugCards.filter(b => b.status === 'done');
	const activeBugs = bugCards.filter(b => b.status !== 'done');

	const allPending = [...pending, ...pendingGlobal, ...activeBugs.filter(b => b.status === 'backlog')];
	const allInProgress = [...inProgress, ...activeBugs.filter(b => b.status === 'in-progress')];
	const allDone = [...done, ...doneBugs, ...doneGlobal];

	const projectContent = `<div id="project-view" hidden>
	<div id="project-dashboard">
		${configPanel}
		${StatsBox({
			total: project.stories.total,
			pending: project.stories.pending,
			inProgress: project.stories.inProgress,
			done: project.stories.done,
		})}
		${ProgressBar({ completed: project.stories.done, total: project.stories.total })}
		<div class="kanban">
			${KanbanColumn({ title: 'Pending', stories: allPending })}
			${KanbanColumn({ title: 'In Progress', stories: allInProgress })}
			${KanbanColumn({ title: 'Done', stories: allDone })}
		</div>
	</div>
	<main class="content-area" id="project-content-area" hidden>
		<div class="content-area__breadcrumb" id="project-breadcrumb"></div>
		<div class="content-area__body" id="project-content-body"></div>
	</main>
</div>`;

	const content = wikiContent + projectContent;

	// Gather warnings
	const summary = aggregator.getSummary();
	const warnings = [...summary.errors, ...summary.warnings];

	return BaseLayout({
		title: `${config.project_name || 'BMAD'} - bmad-viewer`,
		sidebar,
		content,
		activeTab: 'wiki',
		warnings,
		contentMapJson: JSON.stringify(contentMap),
		projectName: config.project_name,
	});
}

/**
 * Build a content map keyed by item id for client-side lookup.
 */
function buildContentMap(wiki, project) {
	const map = {};

	// Wiki items
	for (const mod of wiki.modules) {
		for (const group of mod.groups) {
			for (const item of group.items) {
				map[item.id] = {
					html: item.html || '',
					name: item.name,
					type: item.type,
					module: mod.name,
					group: group.name,
				};
			}
		}
	}

	// Project artifacts
	for (const artifact of project.artifacts) {
		map[artifact.id] = {
			html: artifact.html || '',
			name: artifact.name,
			type: artifact.type || 'artifact',
		};
	}

	// Stories from sprint status + epics.md content
	const storyContents = project.storyContents || {};
	for (const epic of project.epics) {
		for (const story of epic.stories) {
			const key = `story/${story.id}`;
			if (!map[key]) {
				// Try to find content from epics.md parsing (key format: "epicNum-storyNum")
				const parts = story.id.split('-');
				const storyKey = `${parts[0]}-${parts[1]}`;
				const epicContent = storyContents[storyKey];
				const statusLabel = (story.status || 'backlog').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
				const statusBadge = `<p><strong>Epic ${escapeHtml(epic.num)}:</strong> ${escapeHtml(epic.name)} &nbsp; <span class="badge badge--${escapeHtml(story.status)}">${escapeHtml(statusLabel)}</span></p>`;

				map[key] = {
					html: epicContent
						? statusBadge + epicContent.html
						: `<h1>${escapeHtml(story.title)}</h1>${statusBadge}<p style="color:var(--text-muted);margin-top:24px">No detailed content found for this story.</p>`,
					name: epicContent ? epicContent.title : story.title,
					type: 'story',
				};
			}
		}
	}

	return map;
}
