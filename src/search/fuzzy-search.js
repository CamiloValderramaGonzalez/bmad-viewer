import Fuse from 'fuse.js';

/**
 * Create a search index from wiki data.
 * @param {object} wikiData - Wiki data from data model
 * @returns {Fuse}
 */
export function createSearchIndex(wikiData) {
	const items = [];

	for (const mod of wikiData.modules || []) {
		for (const item of mod.items || []) {
			items.push({
				type: 'module-item',
				module: mod.name,
				id: item.id || item.ID || '',
				title: item.title || item.Title || item.name || '',
				description: item.description || item.Description || '',
			});
		}
	}

	for (const agent of wikiData.agents || []) {
		items.push({
			type: 'agent',
			title: agent.frontmatter?.title || extractTitleFromPath(agent.path),
			path: agent.path,
		});
	}

	for (const workflow of wikiData.workflows || []) {
		items.push({
			type: 'workflow',
			title: workflow.frontmatter?.title || extractTitleFromPath(workflow.path),
			path: workflow.path,
		});
	}

	const fuse = new Fuse(items, {
		keys: ['title', 'description', 'module'],
		threshold: 0.4,
		includeScore: true,
		minMatchCharLength: 2,
	});

	return fuse;
}

/**
 * Extract a display title from a file path.
 * @param {string} filePath
 * @returns {string}
 */
function extractTitleFromPath(filePath) {
	const name = (filePath || '')
		.split(/[/\\]/)
		.pop()
		.replace(/\.\w+$/, '');
	return name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Generate client-side search script.
 * @param {object[]} searchItems - Items for the search index
 * @returns {string} JavaScript code
 */
export function getSearchScript(searchItems) {
	return `
var searchItems = ${JSON.stringify(searchItems)};
var searchModal = document.getElementById('search-modal');
var searchInput = document.getElementById('search-input');
var searchResults = document.getElementById('search-results');
var searchTrigger = document.getElementById('search-trigger');

function openSearch() {
	searchModal.hidden = false;
	searchInput.value = '';
	searchInput.focus();
	searchResults.innerHTML = '';
}

function closeSearch() {
	searchModal.hidden = true;
	searchInput.blur();
}

function renderResults(query) {
	if (!query || query.length < 2) {
		searchResults.innerHTML = '';
		return;
	}

	var matches = searchItems.filter(function(item) {
		var t = (item.title || '').toLowerCase();
		var d = (item.description || '').toLowerCase();
		var q = query.toLowerCase();
		return t.includes(q) || d.includes(q);
	}).slice(0, 10);

	if (matches.length === 0) {
		searchResults.innerHTML = '<div class="search-modal__no-results">No results found for "' + query + '"<br><br>Try browsing: <a href="#wiki">Core</a>, <a href="#wiki">BMM</a>, <a href="#wiki">BMB</a>, <a href="#wiki">CIS</a></div>';
		return;
	}

	searchResults.innerHTML = matches.map(function(item) {
		return '<div class="search-modal__result" role="option" data-id="' + (item.id || '') + '" data-path="' + (item.path || '') + '">' +
			'<span class="search-modal__result-title">' + (item.title || 'Untitled') + '</span>' +
			'<span class="search-modal__result-type">' + (item.type || '') + '</span>' +
		'</div>';
	}).join('');
}

document.addEventListener('keydown', function(e) {
	if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
		e.preventDefault();
		openSearch();
	}
	if (e.key === 'Escape' && !searchModal.hidden) {
		closeSearch();
	}
});

if (searchTrigger) searchTrigger.addEventListener('click', openSearch);
if (searchInput) searchInput.addEventListener('input', function() { renderResults(this.value); });

searchModal.querySelector('.search-modal__backdrop').addEventListener('click', closeSearch);

searchResults.addEventListener('click', function(e) {
	var result = e.target.closest('.search-modal__result');
	if (result) {
		var id = result.dataset.id;
		if (id) location.hash = '#wiki/' + id;
		closeSearch();
	}
});
`;
}
