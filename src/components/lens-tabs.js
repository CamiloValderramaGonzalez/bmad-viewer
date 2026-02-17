/**
 * Render the Wiki/Proyecto lens tabs.
 * @param {{activeTab: string}} props
 * @returns {string} HTML string
 */
export function LensTabs({ activeTab }) {
	const wikiActive = activeTab === 'wiki' ? ' lens-tabs__tab--active' : '';
	const projectActive = activeTab === 'project' ? ' lens-tabs__tab--active' : '';

	return `<div class="lens-tabs" role="tablist">
	<button class="lens-tabs__tab${wikiActive}" role="tab" aria-selected="${activeTab === 'wiki'}" data-tab="wiki">&#128218; Wiki</button>
	<button class="lens-tabs__tab${projectActive}" role="tab" aria-selected="${activeTab === 'project'}" data-tab="project">&#128203; Project</button>
</div>`;
}
