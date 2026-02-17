import { escapeHtml } from '../utils/html-escape.js';

/**
 * Render sidebar navigation tree.
 * Wiki lens: Modules > Groups > Items
 * Project lens: Epics with stories + Artifacts section
 *
 * @param {{modules: Array, artifacts: Array, epics: Array}} props
 * @returns {string} HTML string
 */
export function SidebarNav({ modules, artifacts, epics }) {
	// Wiki sidebar content
	const modulesList = (modules || [])
		.map(
			(mod) => `
		<li class="sidebar-nav__module">
			<button class="sidebar-nav__toggle" aria-expanded="false" data-module="${escapeHtml(mod.id)}">
				<span class="sidebar-nav__arrow">&#9656;</span> ${escapeHtml(mod.name)}
			</button>
			<ul class="sidebar-nav__groups" hidden>
				${(mod.groups || [])
					.map(
						(group) => `
				<li class="sidebar-nav__group">
					<button class="sidebar-nav__group-toggle" aria-expanded="false">
						<span class="sidebar-nav__arrow">&#9656;</span> ${escapeHtml(group.name)} <span class="sidebar-nav__count">${group.items.length}</span>
					</button>
					<ul class="sidebar-nav__items" hidden>
						${(group.items || [])
							.map(
								(item) =>
									`<li class="sidebar-nav__item">
							<a href="#wiki/${escapeHtml(item.id)}" class="sidebar-nav__link" data-id="${escapeHtml(item.id)}">
								<span class="sidebar-nav__type-icon">${getTypeIcon(item.type)}</span>
								${escapeHtml(item.name)}
							</a>
						</li>`,
							)
							.join('\n')}
					</ul>
				</li>`,
					)
					.join('\n')}
			</ul>
		</li>`,
		)
		.join('\n');

	// Project sidebar: Sprint Dashboard link + Epics with stories + Artifacts
	const epicsList = (epics || [])
		.map(
			(epic) => `
		<li class="sidebar-nav__module">
			<button class="sidebar-nav__toggle sidebar-nav__toggle--epic" aria-expanded="false" data-epic="${escapeHtml(epic.num)}">
				<span class="sidebar-nav__arrow">&#9656;</span>
				<span class="sidebar-nav__epic-icon">${getEpicStatusIcon(epic.status)}</span>
				<span class="sidebar-nav__epic-label">E${escapeHtml(epic.num)}</span>
				<span class="sidebar-nav__epic-name">${escapeHtml(epic.name)}</span>
			</button>
			<ul class="sidebar-nav__items" hidden>
				${(epic.stories || [])
					.map(
						(story) =>
							`<li class="sidebar-nav__item">
						<a href="#project/story/${escapeHtml(story.id)}" class="sidebar-nav__link" data-id="story/${escapeHtml(story.id)}">
							<span class="sidebar-nav__status-dot sidebar-nav__status-dot--${escapeHtml(story.status)}"></span>
							${escapeHtml(story.title)}
						</a>
					</li>`,
					)
					.join('\n')}
			</ul>
		</li>`,
		)
		.join('\n');

	const artifactsList = (artifacts || [])
		.map(
			(art) => `
		<li class="sidebar-nav__item">
			<a href="#project/${escapeHtml(art.id)}" class="sidebar-nav__link sidebar-nav__link--artifact" data-id="${escapeHtml(art.id)}">
				<span class="sidebar-nav__type-icon">${getArtifactIcon(art.name)}</span>
				${escapeHtml(art.name || 'Untitled')}
			</a>
		</li>`,
		)
		.join('\n');

	return `<nav class="sidebar-nav" aria-label="BMAD Navigation">
	<div id="sidebar-wiki" class="sidebar-nav__lens">
		<h2 class="sidebar-nav__heading">Modules</h2>
		<ul class="sidebar-nav__list">
			${modulesList || '<li class="sidebar-nav__empty">No modules found</li>'}
		</ul>
	</div>
	<div id="sidebar-project" class="sidebar-nav__lens" hidden>
		<a href="#project" class="sidebar-nav__dashboard-link">
			<span>&#128202;</span> Sprint Dashboard
		</a>
		${epicsList ? `<h2 class="sidebar-nav__heading">Epics</h2>
		<ul class="sidebar-nav__list">${epicsList}</ul>` : ''}
		${artifactsList ? `<h2 class="sidebar-nav__heading">Artifacts</h2>
		<ul class="sidebar-nav__list">${artifactsList}</ul>` : ''}
	</div>
</nav>`;
}

/**
 * Get icon for item type.
 */
function getTypeIcon(type) {
	switch (type) {
		case 'agent': return '&#129302;';
		case 'workflow': return '&#9881;';
		case 'tasks': return '&#9745;';
		case 'resources': return '&#128218;';
		case 'teams': return '&#128101;';
		case 'story': return '&#128203;';
		case 'data': return '&#128202;';
		case 'testarch': return '&#128295;';
		default: return '&#128196;';
	}
}

/**
 * Get status icon for epic.
 */
function getEpicStatusIcon(status) {
	switch (status) {
		case 'done': return '&#9989;';
		case 'in-progress': return '&#128994;';
		default: return '&#9898;';
	}
}

/**
 * Get icon for artifact by name.
 */
function getArtifactIcon(name) {
	const lower = (name || '').toLowerCase();
	if (lower.includes('prd')) return '&#128220;';
	if (lower.includes('architecture')) return '&#127959;';
	if (lower.includes('product brief') || lower.includes('product-brief')) return '&#128203;';
	if (lower.includes('ux') || lower.includes('design')) return '&#127912;';
	if (lower.includes('epic')) return '&#128221;';
	return '&#128196;';
}
