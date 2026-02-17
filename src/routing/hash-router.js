/**
 * Parse hash route from URL.
 * @param {string} hash - e.g., '#wiki', '#proyecto', '#wiki/agent-1'
 * @returns {{view: string, id: string|null}}
 */
export function parseHash(hash) {
	const cleaned = (hash || '').replace(/^#\/?/, '');
	const parts = cleaned.split('/');
	const view = parts[0] || 'wiki';
	const id = parts.slice(1).join('/') || null;
	return { view, id };
}

/**
 * Generate client-side hash router script.
 * @returns {string} JavaScript code for client
 */
export function getRouterScript() {
	return `
function parseHash() {
	var cleaned = (location.hash || '').replace(/^#\\/?/, '');
	var parts = cleaned.split('/');
	return { view: parts[0] || 'wiki', id: parts.slice(1).join('/') || null };
}

function onHashChange() {
	var route = parseHash();
	var wikiView = document.getElementById('wiki-view');
	var projectView = document.getElementById('project-view');
	var tabs = document.querySelectorAll('.lens-tabs__tab');

	if (wikiView) wikiView.hidden = route.view !== 'wiki';
	if (projectView) projectView.hidden = route.view !== 'proyecto';

	tabs.forEach(function(tab) {
		var isActive = tab.dataset.tab === route.view;
		tab.classList.toggle('lens-tabs__tab--active', isActive);
		tab.setAttribute('aria-selected', isActive);
	});
}

window.addEventListener('hashchange', onHashChange);
document.addEventListener('DOMContentLoaded', function() {
	if (!location.hash) location.hash = '#wiki';
	onHashChange();

	document.querySelectorAll('.lens-tabs__tab').forEach(function(tab) {
		tab.addEventListener('click', function() {
			location.hash = '#' + this.dataset.tab;
		});
	});
});
`;
}
