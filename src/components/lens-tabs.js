/**
 * Render the Wiki/Proyecto lens tabs.
 * @param {{activeTab: string}} props
 * @returns {string} HTML string
 */
export function LensTabs({ activeTab }) {
	const wikiActive = activeTab === 'wiki' ? ' lens-tabs__tab--active' : '';
	const projectActive = activeTab === 'proyecto' ? ' lens-tabs__tab--active' : '';

	return `<div class="lens-tabs" role="tablist">
	<button class="lens-tabs__tab${wikiActive}" role="tab" aria-selected="${activeTab === 'wiki'}" data-tab="wiki">&#128218; Wiki</button>
	<button class="lens-tabs__tab${projectActive}" role="tab" aria-selected="${activeTab === 'proyecto'}" data-tab="proyecto">&#128203; Proyecto</button>
</div>`;
}
