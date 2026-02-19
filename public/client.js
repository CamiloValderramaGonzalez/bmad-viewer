/* bmad-viewer client.js - Routing, WebSocket, Theme, Search, Sidebar */
(function () {
	'use strict';

	var contentMap = window.__BMAD_CONTENT__ || {};
	var wikiWelcomeHtml = '';
	var wikiBreadcrumbHtml = '';
	var pendingHighlight = null;

	/* ── Hash Router ── */
	function parseHash() {
		var cleaned = (location.hash || '').replace(/^#\/?/, '');
		var slashIdx = cleaned.indexOf('/');
		if (slashIdx === -1) {
			return { view: cleaned || 'wiki', id: null };
		}
		return { view: cleaned.substring(0, slashIdx), id: cleaned.substring(slashIdx + 1) };
	}

	function onHashChange() {
		var route = parseHash();
		var wikiView = document.getElementById('wiki-view');
		var projectView = document.getElementById('project-view');
		var tabs = document.querySelectorAll('.lens-tabs__tab');

		// Switch views
		if (wikiView) wikiView.hidden = route.view !== 'wiki';
		if (projectView) projectView.hidden = route.view !== 'project';

		// Switch sidebar lens
		var sidebarWiki = document.getElementById('sidebar-wiki');
		var sidebarProject = document.getElementById('sidebar-project');
		if (sidebarWiki) sidebarWiki.hidden = route.view !== 'wiki';
		if (sidebarProject) sidebarProject.hidden = route.view !== 'project';

		// Update tabs
		tabs.forEach(function (tab) {
			var isActive = tab.dataset.tab === route.view;
			tab.classList.toggle('lens-tabs__tab--active', isActive);
			tab.setAttribute('aria-selected', String(isActive));
		});

		// Load content if an id is specified
		if (route.id) {
			if (route.view === 'wiki') {
				loadWikiContent(route.id);
			} else if (route.view === 'project') {
				loadProjectContent(route.id);
			}
		} else if (route.view === 'wiki') {
			// Show welcome page when no specific item is selected
			showWikiWelcome();
		} else if (route.view === 'project') {
			// Show dashboard when no specific artifact is selected
			showProjectDashboard();
		}

		// Update active link highlight in sidebar
		updateActiveLink(route);
	}

	function loadWikiContent(id) {
		var item = contentMap[id];
		var contentBody = document.getElementById('wiki-content-body');
		var breadcrumb = document.getElementById('wiki-breadcrumb');

		if (!item || !contentBody) return;

		contentBody.innerHTML = item.html;

		// Build breadcrumb
		if (breadcrumb) {
			var parts = ['Wiki'];
			if (item.module) parts.push(item.module);
			if (item.group) parts.push(item.group);
			parts.push(item.name);

			var crumbs = parts.map(function (part, i) {
				if (i === parts.length - 1) {
					return '<span class="breadcrumb__current">' + escapeText(part) + '</span>';
				}
				return '<span class="breadcrumb__segment">' + escapeText(part) + '</span>';
			});
			breadcrumb.innerHTML = crumbs.join(' <span class="breadcrumb__sep">&rsaquo;</span> ');
		}

		if (pendingHighlight) {
			highlightAndScroll(contentBody, pendingHighlight);
			pendingHighlight = null;
		}
	}

	function loadProjectContent(id) {
		var item = contentMap[id];
		var dashboard = document.getElementById('project-dashboard');
		var contentArea = document.getElementById('project-content-area');
		var contentBody = document.getElementById('project-content-body');
		var breadcrumb = document.getElementById('project-breadcrumb');

		if (!item || !contentBody) return;

		// Hide dashboard, show content
		if (dashboard) dashboard.hidden = true;
		if (contentArea) contentArea.hidden = false;

		contentBody.innerHTML = item.html;

		// Build breadcrumb
		if (breadcrumb) {
			breadcrumb.innerHTML =
				'<a href="#project" class="breadcrumb__link">Project</a>' +
				' <span class="breadcrumb__sep">&rsaquo;</span> ' +
				'<span class="breadcrumb__current">' + escapeText(item.name) + '</span>';
		}

		if (pendingHighlight) {
			highlightAndScroll(contentBody, pendingHighlight);
			pendingHighlight = null;
		}
	}

	function highlightAndScroll(container, query) {
		var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
		var q = query.toLowerCase();
		var firstMark = null;

		var nodesToProcess = [];
		while (walker.nextNode()) {
			var node = walker.currentNode;
			if (node.nodeValue && node.nodeValue.toLowerCase().includes(q)) {
				nodesToProcess.push(node);
			}
		}

		for (var i = 0; i < nodesToProcess.length; i++) {
			var textNode = nodesToProcess[i];
			var text = textNode.nodeValue;
			var idx = text.toLowerCase().indexOf(q);
			if (idx === -1) continue;

			var before = text.substring(0, idx);
			var match = text.substring(idx, idx + query.length);
			var after = text.substring(idx + query.length);

			var mark = document.createElement('mark');
			mark.className = 'search-highlight';
			mark.textContent = match;

			var parent = textNode.parentNode;
			if (before) parent.insertBefore(document.createTextNode(before), textNode);
			parent.insertBefore(mark, textNode);
			if (after) parent.insertBefore(document.createTextNode(after), textNode);
			parent.removeChild(textNode);

			if (!firstMark) firstMark = mark;
		}

		if (firstMark) {
			setTimeout(function () {
				firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}, 50);

			// Clear highlights after 4 seconds
			setTimeout(function () {
				container.querySelectorAll('mark.search-highlight').forEach(function (el) {
					var txt = document.createTextNode(el.textContent);
					el.parentNode.replaceChild(txt, el);
				});
			}, 4000);
		}
	}

	function showWikiWelcome() {
		var contentBody = document.getElementById('wiki-content-body');
		var breadcrumb = document.getElementById('wiki-breadcrumb');
		if (contentBody && wikiWelcomeHtml) contentBody.innerHTML = wikiWelcomeHtml;
		if (breadcrumb) breadcrumb.innerHTML = wikiBreadcrumbHtml;
	}

	function showProjectDashboard() {
		var dashboard = document.getElementById('project-dashboard');
		var contentArea = document.getElementById('project-content-area');
		if (dashboard) dashboard.hidden = false;
		if (contentArea) contentArea.hidden = true;
	}

	function updateActiveLink(route) {
		// Remove all active states
		document.querySelectorAll('.sidebar-nav__link--active').forEach(function (el) {
			el.classList.remove('sidebar-nav__link--active');
		});

		if (!route.id) return;

		// Find and highlight matching link
		var selector = '.sidebar-nav__link[data-id="' + CSS.escape(route.id) + '"]';
		var activeLink = document.querySelector(selector);
		if (activeLink) {
			activeLink.classList.add('sidebar-nav__link--active');

			// Expand parent groups/modules if collapsed
			var parent = activeLink.closest('.sidebar-nav__items');
			while (parent) {
				parent.hidden = false;
				var toggle = parent.previousElementSibling;
				if (toggle && (toggle.classList.contains('sidebar-nav__toggle') || toggle.classList.contains('sidebar-nav__group-toggle'))) {
					toggle.setAttribute('aria-expanded', 'true');
					toggle.querySelector('.sidebar-nav__arrow').innerHTML = '&#9662;';
				}
				var grandparent = parent.closest('.sidebar-nav__groups');
				if (grandparent) {
					grandparent.hidden = false;
					var moduleToggle = grandparent.previousElementSibling;
					if (moduleToggle && moduleToggle.classList.contains('sidebar-nav__toggle')) {
						moduleToggle.setAttribute('aria-expanded', 'true');
						moduleToggle.querySelector('.sidebar-nav__arrow').innerHTML = '&#9662;';
					}
				}
				parent = null;
			}
		}
	}

	/* ── Theme Manager ── */
	function toggleTheme() {
		var current = document.documentElement.dataset.theme;
		var next = current === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = next;
		localStorage.setItem('bmad-theme', next);
		updateThemeButton(next);
	}

	function updateThemeButton() {
		// SVG icons are toggled via CSS [data-theme] selectors
	}

	/* ── Search Modal ── */
	function openSearch() {
		var modal = document.getElementById('search-modal');
		var input = document.getElementById('search-input');
		if (modal) modal.hidden = false;
		if (input) {
			input.value = '';
			input.focus();
		}
		var results = document.getElementById('search-results');
		if (results) results.innerHTML = '';
	}

	function closeSearch() {
		var modal = document.getElementById('search-modal');
		if (modal) modal.hidden = true;
	}

	// Cache stripped text for content search
	var textCache = {};
	function getPlainText(item) {
		if (!item._cacheKey) item._cacheKey = item.name + '|' + item.type;
		if (textCache[item._cacheKey] !== undefined) return textCache[item._cacheKey];
		var tmp = document.createElement('div');
		tmp.innerHTML = item.html || '';
		var text = (tmp.textContent || tmp.innerText || '').toLowerCase();
		textCache[item._cacheKey] = text;
		return text;
	}

	function handleSearch(query) {
		var results = document.getElementById('search-results');
		if (!results) return;

		if (!query || query.length < 2) {
			results.innerHTML = '';
			return;
		}

		var q = query.toLowerCase();
		var matches = [];

		// Search through content map — name, type, module, group, and body content
		for (var id in contentMap) {
			var item = contentMap[id];
			var nameMatch = (item.name || '').toLowerCase().includes(q);
			var typeMatch = (item.type || '').toLowerCase().includes(q);
			var moduleMatch = (item.module || '').toLowerCase().includes(q);
			var groupMatch = (item.group || '').toLowerCase().includes(q);
			var contentMatch = !nameMatch && !typeMatch && !moduleMatch && !groupMatch && getPlainText(item).includes(q);

			if (nameMatch || typeMatch || moduleMatch || groupMatch || contentMatch) {
				matches.push({ id: id, item: item, score: nameMatch ? 2 : (contentMatch ? 0 : 1), contentMatch: contentMatch });
			}
		}

		// Sort: name matches first, then metadata, then content
		matches.sort(function (a, b) { return b.score - a.score; });

		if (matches.length === 0) {
			results.innerHTML =
				'<div class="search-modal__no-results">No results found for "' +
				escapeText(query) + '"</div>';
			return;
		}

		// Group by type
		var grouped = {};
		matches.slice(0, 12).forEach(function (m) {
			var type = m.item.type || 'other';
			if (!grouped[type]) grouped[type] = [];
			grouped[type].push(m);
		});

		var categoryLabels = {
			'planning': 'Planning', 'research': 'Research', 'analysis': 'Analysis',
			'test-arch': 'Test Architecture', 'cis': 'CIS Sessions',
			'bmb-creation': 'BMB Creations', 'diagram': 'Diagrams',
			'story': 'Stories', 'agent': 'Agents', 'workflow': 'Workflows',
			'other': 'Other'
		};

		var html = '';
		for (var type in grouped) {
			var groupLabel = categoryLabels[type] || (type.charAt(0).toUpperCase() + type.slice(1) + 's');
			html += '<div class="search-modal__group-label">' + escapeText(groupLabel) + '</div>';
			grouped[type].forEach(function (m) {
				var view = m.id.startsWith('artifact/') || m.id.startsWith('story/') ? 'project' : 'wiki';
				var subtitle = m.item.module
					? (m.item.module + (m.item.group ? ' > ' + m.item.group : ''))
					: (categoryLabels[m.item.type] || m.item.type || '');
				var snippet = '';
				if (m.contentMatch) {
					var text = getPlainText(m.item);
					var idx = text.indexOf(q);
					if (idx !== -1) {
						var start = Math.max(0, idx - 30);
						var end = Math.min(text.length, idx + q.length + 50);
						var raw = text.substring(start, end).replace(/\s+/g, ' ');
						snippet = '<span class="search-modal__result-snippet">' +
							(start > 0 ? '...' : '') +
							escapeText(raw.substring(0, idx - start)) +
							'<mark>' + escapeText(raw.substring(idx - start, idx - start + q.length)) + '</mark>' +
							escapeText(raw.substring(idx - start + q.length)) +
							(end < text.length ? '...' : '') +
							'</span>';
					}
				}
				html +=
					'<a class="search-modal__result" href="#' + view + '/' + m.id + '"' + (m.contentMatch ? ' data-content-match="1"' : '') + '>' +
					'<span class="search-modal__result-title">' + escapeText(m.item.name) + '</span>' +
					'<span class="search-modal__result-type">' + escapeText(subtitle) + '</span>' +
					snippet +
					'</a>';
			});
		}

		results.innerHTML = html;
	}

	/* ── Sidebar Toggles ── */
	function initSidebarToggles() {
		// Module-level toggles
		document.querySelectorAll('.sidebar-nav__toggle').forEach(function (btn) {
			btn.addEventListener('click', function (e) {
				e.stopPropagation();
				var expanded = this.getAttribute('aria-expanded') === 'true';
				this.setAttribute('aria-expanded', String(!expanded));
				var list = this.nextElementSibling;
				if (list) list.hidden = expanded;
				var arrow = this.querySelector('.sidebar-nav__arrow');
				if (arrow) arrow.innerHTML = expanded ? '&#9656;' : '&#9662;';
			});
		});

		// Group-level toggles
		document.querySelectorAll('.sidebar-nav__group-toggle').forEach(function (btn) {
			btn.addEventListener('click', function (e) {
				e.stopPropagation();
				var expanded = this.getAttribute('aria-expanded') === 'true';
				this.setAttribute('aria-expanded', String(!expanded));
				var list = this.nextElementSibling;
				if (list) list.hidden = expanded;
				var arrow = this.querySelector('.sidebar-nav__arrow');
				if (arrow) arrow.innerHTML = expanded ? '&#9656;' : '&#9662;';
			});
		});
	}

	/* ── WebSocket Live Reload ── */
	function initWebSocket() {
		var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
		var wsUrl = protocol + '//' + location.host;
		var ws;

		function connect() {
			ws = new WebSocket(wsUrl);

			ws.onmessage = function (event) {
				try {
					var data = JSON.parse(event.data);
					if (data.type === 'file-changed') {
						location.reload();
					}
				} catch (e) {
					/* ignore parse errors */
				}
			};

			ws.onclose = function () {
				setTimeout(connect, 2000);
			};

			ws.onerror = function () {
				ws.close();
			};
		}

		connect();
	}

	/* ── Utilities ── */
	function escapeText(str) {
		var div = document.createElement('div');
		div.textContent = str;
		return div.innerHTML;
	}

	/* ── Init ── */
	document.addEventListener('DOMContentLoaded', function () {
		// Save welcome page HTML for restoring later
		var wikiBody = document.getElementById('wiki-content-body');
		if (wikiBody) wikiWelcomeHtml = wikiBody.innerHTML;
		var wikiBc = document.getElementById('wiki-breadcrumb');
		if (wikiBc) wikiBreadcrumbHtml = wikiBc.innerHTML;

		// Hash router
		if (!location.hash) location.hash = '#wiki';
		onHashChange();
		window.addEventListener('hashchange', onHashChange);

		// Tabs
		document.querySelectorAll('.lens-tabs__tab').forEach(function (tab) {
			tab.addEventListener('click', function () {
				location.hash = '#' + this.dataset.tab;
			});
		});

		// Theme
		updateThemeButton(document.documentElement.dataset.theme);
		var themeBtn = document.getElementById('theme-toggle');
		if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

		// Search
		var searchTrigger = document.getElementById('search-trigger');
		if (searchTrigger) searchTrigger.addEventListener('click', openSearch);

		var searchInput = document.getElementById('search-input');
		if (searchInput)
			searchInput.addEventListener('input', function () {
				handleSearch(this.value);
			});

		var backdrop = document.querySelector('.search-modal__backdrop');
		if (backdrop) backdrop.addEventListener('click', closeSearch);

		document.addEventListener('keydown', function (e) {
			if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
				e.preventDefault();
				openSearch();
			}
			if (e.key === 'Escape') closeSearch();
		});

		var searchResults = document.getElementById('search-results');
		if (searchResults) {
			searchResults.addEventListener('click', function (e) {
				var result = e.target.closest('.search-modal__result');
				if (result) {
					if (result.dataset.contentMatch) {
						var input = document.getElementById('search-input');
						pendingHighlight = input ? input.value : null;
					}
					closeSearch();
				}
			});
		}

		// Measure sticky header height
		var stickyTop = document.querySelector('.sticky-top');
		if (stickyTop) {
			document.documentElement.style.setProperty('--sticky-h', stickyTop.offsetHeight + 'px');
		}

		// Sidebar
		initSidebarToggles();

		// WebSocket
		initWebSocket();
	});
})();
