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

	const projectContent = `<div id="project-view" hidden>
	<div id="project-dashboard">
		${StatsBox({
			total: project.stories.total,
			pending: project.stories.pending,
			inProgress: project.stories.inProgress,
			done: project.stories.done,
		})}
		${ProgressBar({ completed: project.stories.done, total: project.stories.total })}
		<div class="kanban">
			${KanbanColumn({ title: 'Pending', stories: pending })}
			${KanbanColumn({ title: 'In Progress', stories: inProgress })}
			${KanbanColumn({ title: 'Done', stories: done })}
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
