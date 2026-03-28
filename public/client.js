/* bmad-viewer client.js - Routing, WebSocket, Theme, Search, Sidebar */
(function () {
	'use strict';

	var contentMap = window.__BMAD_CONTENT__ || {};
	var wikiWelcomeHtml = '';
	var wikiBreadcrumbHtml = '';
	var pendingHighlight = null;
	var boardDragState = null;
	var boardSaveInFlight = false;

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

	function initKanbanBoard() {
		var board = document.querySelector('.kanban');
		if (!board || board.dataset.boardEditable !== 'true') return;

		board.addEventListener('dragstart', handleBoardDragStart);
		board.addEventListener('dragend', handleBoardDragEnd);

		board.querySelectorAll('[data-dropzone="true"]').forEach(function (container) {
			container.addEventListener('dragover', handleBoardDragOver);
			container.addEventListener('dragenter', handleBoardDragEnter);
			container.addEventListener('dragleave', handleBoardDragLeave);
			container.addEventListener('drop', handleBoardDrop);
		});
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
	function handleBoardDragStart(event) {
		if (boardSaveInFlight) {
			event.preventDefault();
			return;
		}

		var card = event.target.closest('.kanban-card[data-card-type="story"][data-draggable="true"]');
		if (!card) return;

		boardDragState = {
			card: card,
			originContainer: card.parentElement,
			originNextSibling: card.nextElementSibling,
			originStatus: getContainerStatus(card.parentElement),
		};

		card.classList.add('kanban-card--dragging');
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', card.dataset.id || '');
		}

		setBoardStatus('');
	}

	function handleBoardDragEnd() {
		if (boardDragState && boardDragState.card) {
			boardDragState.card.classList.remove('kanban-card--dragging');
		}

		clearDropTargets();
		if (!boardSaveInFlight) {
			boardDragState = null;
		}
	}

	function handleBoardDragEnter(event) {
		if (!boardDragState) return;
		var column = event.currentTarget.closest('.kanban-column');
		if (column) column.classList.add('kanban-column--drag-over');
	}

	function handleBoardDragLeave(event) {
		var column = event.currentTarget.closest('.kanban-column');
		if (!column) return;
		if (column.contains(event.relatedTarget)) return;
		column.classList.remove('kanban-column--drag-over');
	}

	function handleBoardDragOver(event) {
		if (!boardDragState) return;
		event.preventDefault();

		var container = event.currentTarget;
		var afterElement = getDragAfterElement(container, event.clientY);
		removeEmptyState(container);

		if (afterElement) {
			container.insertBefore(boardDragState.card, afterElement);
		} else {
			container.appendChild(boardDragState.card);
		}
	}

	function handleBoardDrop(event) {
		if (!boardDragState) return;
		event.preventDefault();

		var container = event.currentTarget;
		var nextStatus = getContainerStatus(container);
		var previousStatus = boardDragState.originStatus;
		var board = container.closest('.kanban');

		clearDropTargets();
		ensureEmptyState(boardDragState.originContainer);
		ensureEmptyState(container);

		if (!nextStatus || nextStatus === previousStatus) {
			restoreDraggedCard();
			syncBoardMetrics(board);
			return;
		}

		var card = boardDragState.card;
		var storyId = card.dataset.id;
		var storyTitle = card.querySelector('.kanban-card__title');
		var titleText = storyTitle ? storyTitle.textContent : storyId;
		var localSaveSucceeded = false;

		setBoardSaving(board, true);
		setBoardStatus('Saving "' + titleText + '" as ' + humanizeStatus(nextStatus) + '...', 'saving');

		fetch('/api/story-status', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ storyId: storyId, nextStatus: nextStatus }),
		})
			.then(function (response) { return response.json(); })
			.then(function (data) {
				if (!data.ok) {
					throw new Error(data.error || 'Could not save the new status');
				}

				localSaveSucceeded = true;
				applyCardStatus(card, nextStatus);
				syncBoardMetrics(board);
				setBoardStatus('Saved locally. Syncing connected platforms...', 'saving');
				return syncConnectedPlatformsForStory(storyId);
			})
			.then(function (syncResult) {
				if (syncResult && syncResult.github === 'synced') {
					setBoardStatus('Saved locally and synced to GitHub.', 'ok');
					return;
				}
				setBoardStatus('Saved locally. No connected platform needed a status sync.', 'ok');
			})
			.catch(function (error) {
				if (localSaveSucceeded) {
					syncBoardMetrics(board);
					setBoardStatus((error.message || 'The local change was saved, but platform sync failed') + '. Local status is already updated.', 'error');
					return;
				}

				restoreDraggedCard();
				syncBoardMetrics(board);
				setBoardStatus(error.message || 'Could not save the new status', 'error');
			})
			.finally(function () {
				setBoardSaving(board, false);
				boardDragState = null;
			});
	}

	function syncConnectedPlatformsForStory(storyId) {
		return fetch('/api/integrations/github/story-status', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ storyId: storyId }),
		})
			.then(function (response) { return response.json(); })
			.then(function (data) {
				if (!data.ok) {
					throw new Error(data.error || 'The local change was saved, but GitHub sync failed');
				}
				return {
					github: data.skipped ? 'skipped' : 'synced',
				};
			});
	}

	function restoreDraggedCard() {
		if (!boardDragState || !boardDragState.card || !boardDragState.originContainer) return;

		if (boardDragState.originNextSibling && boardDragState.originNextSibling.parentNode === boardDragState.originContainer) {
			boardDragState.originContainer.insertBefore(boardDragState.card, boardDragState.originNextSibling);
		} else {
			boardDragState.originContainer.appendChild(boardDragState.card);
		}

		ensureEmptyState(boardDragState.originContainer);
	}

	function setBoardSaving(board, saving) {
		boardSaveInFlight = saving;
		if (board) {
			board.classList.toggle('kanban--saving', saving);
		}

		document.querySelectorAll('.kanban-card[data-card-type="story"][data-draggable="true"]').forEach(function (card) {
			card.draggable = !saving;
			card.classList.toggle('kanban-card--disabled', saving);
		});
	}

	function setBoardStatus(message, kind) {
		var status = document.getElementById('board-save-status');
		if (!status) return;

		status.textContent = message || '';
		status.className = 'kanban-toolbar__status' + (kind ? ' kanban-toolbar__status--' + kind : '');
	}

	function syncBoardMetrics(board) {
		if (!board) return;

		board.querySelectorAll('.kanban-column').forEach(function (column) {
			var count = column.querySelector('[data-column-count]');
			if (count) {
				count.textContent = String(column.querySelectorAll('.kanban-card').length);
			}
			ensureEmptyState(column.querySelector('[data-column-cards]'));
		});

		var totalStories = board.querySelectorAll('.kanban-card[data-card-type="story"]').length;
		var pendingStories = board.querySelectorAll('.kanban-column[data-column-status="backlog"] .kanban-card[data-card-type="story"], .kanban-column[data-column-status="ready-for-dev"] .kanban-card[data-card-type="story"]').length;
		var activeStories = board.querySelectorAll('.kanban-column[data-column-status="in-progress"] .kanban-card[data-card-type="story"], .kanban-column[data-column-status="review"] .kanban-card[data-card-type="story"]').length;
		var doneStories = board.querySelectorAll('.kanban-column[data-column-status="done"] .kanban-card[data-card-type="story"]').length;
		var percentage = totalStories > 0 ? Math.round((doneStories / totalStories) * 100) : 0;

		setText('[data-stat-total]', totalStories);
		setText('[data-stat-pending]', pendingStories);
		setText('[data-stat-active]', activeStories);
		setText('[data-stat-done]', doneStories);
		setText('[data-progress-label]', percentage + '%');

		var progressRoot = document.querySelector('[data-progress-root]');
		if (progressRoot) progressRoot.setAttribute('aria-valuenow', String(percentage));
		var progressFill = document.querySelector('[data-progress-fill]');
		if (progressFill) progressFill.style.width = percentage + '%';
	}

	function setText(selector, value) {
		var element = document.querySelector(selector);
		if (element) {
			element.textContent = String(value);
		}
	}

	function applyCardStatus(card, status) {
		card.dataset.status = status;
		['backlog', 'ready-for-dev', 'in-progress', 'review', 'done'].forEach(function (name) {
			card.classList.remove('kanban-card--' + name);
		});
		card.classList.add('kanban-card--' + status);

		var badge = card.querySelector('[data-role="story-status-badge"]');
		if (badge) {
			['backlog', 'ready-for-dev', 'in-progress', 'review', 'done'].forEach(function (name) {
				badge.classList.remove('badge--' + name);
			});
			badge.classList.add('badge--' + status);
			badge.textContent = humanizeStatus(status);
		}
	}

	function clearDropTargets() {
		document.querySelectorAll('.kanban-column--drag-over').forEach(function (column) {
			column.classList.remove('kanban-column--drag-over');
		});
	}

	function getContainerStatus(container) {
		var column = container && container.closest('.kanban-column');
		return column ? column.dataset.columnStatus : '';
	}

	function getDragAfterElement(container, y) {
		var cards = Array.prototype.slice.call(container.querySelectorAll('.kanban-card:not(.kanban-card--dragging)'));

		return cards.reduce(function (closest, child) {
			var box = child.getBoundingClientRect();
			var offset = y - box.top - box.height / 2;

			if (offset < 0 && offset > closest.offset) {
				return { offset: offset, element: child };
			}

			return closest;
		}, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
	}

	function removeEmptyState(container) {
		if (!container) return;
		container.querySelectorAll('.kanban-column__empty').forEach(function (empty) {
			empty.remove();
		});
	}

	function ensureEmptyState(container) {
		if (!container) return;
		var hasCards = container.querySelector('.kanban-card');
		var empty = container.querySelector('.kanban-column__empty');

		if (hasCards && empty) {
			empty.remove();
			return;
		}

		if (!hasCards && !empty) {
			var message = document.createElement('p');
			message.className = 'kanban-column__empty';
			message.textContent = 'No stories';
			container.appendChild(message);
		}
	}

	function humanizeStatus(status) {
		if (status === 'ready-for-dev') return 'Ready for Dev';
		if (status === 'in-progress') return 'In Progress';
		return status.charAt(0).toUpperCase() + status.slice(1);
	}

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

	function initGitHubIntegration() {
		var modal = document.getElementById('integration-modal');
		if (!modal) return;

		loadGitHubIntegration();

		document.querySelectorAll('[data-open-integration]').forEach(function (button) {
			button.addEventListener('click', function () {
				openIntegrationModal(this.getAttribute('data-open-integration'));
			});
		});

		var closeBtn = document.getElementById('integration-modal-close');
		if (closeBtn) {
			closeBtn.addEventListener('click', closeIntegrationModal);
		}

		var backdrop = document.getElementById('integration-modal-backdrop');
		if (backdrop) {
			backdrop.addEventListener('click', closeIntegrationModal);
		}

		document.querySelectorAll('[data-provider-tab]').forEach(function (tab) {
			tab.addEventListener('click', function () {
				setActiveIntegrationProvider(this.getAttribute('data-provider-tab'));
			});
		});

		var connectBtn = document.getElementById('github-connect-btn');
		var projectBtn = document.getElementById('github-project-btn');
		var previewBtn = document.getElementById('github-preview-btn');
		var syncBtn = document.getElementById('github-sync-btn');

		if (connectBtn) {
			connectBtn.addEventListener('click', function () {
				var ownerInput = document.getElementById('github-owner-input');
				var repoInput = document.getElementById('github-repo-input');
				var tokenInput = document.getElementById('github-token-input');
				var payload = {
					owner: ownerInput ? ownerInput.value.trim() : '',
					repo: repoInput ? repoInput.value.trim() : '',
				};
				var nextToken = tokenInput ? tokenInput.value.trim() : '';
				if (nextToken) {
					payload.token = nextToken;
				}

				if (!payload.owner || !payload.repo) {
					setGitHubIntegrationStatus('Complete owner and repository before connecting.', 'error');
					return;
				}

				setGitHubBusy(true);
				setGitHubIntegrationStatus('Connecting GitHub repository...', 'saving');

				fetch('/api/integrations/github/connect', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				})
					.then(function (response) { return response.json(); })
					.then(function (data) {
						if (!data.ok) {
							throw new Error(data.error || 'Could not connect GitHub');
						}

						populateGitHubIntegration(data.config);
						setGitHubConnectionBadge(true, data.config.owner + '/' + data.config.repo);
						renderGitHubProjectState(data.config);
						setGitHubIntegrationStatus('Connected to ' + data.repository.fullName + '.', 'ok');
					})
					.catch(function (error) {
						setGitHubIntegrationStatus(error.message || 'Could not connect GitHub', 'error');
					})
					.finally(function () {
						setGitHubBusy(false);
					});
			});
		}

		if (projectBtn) {
			projectBtn.addEventListener('click', function () {
				setGitHubBusy(true);
				setGitHubIntegrationStatus('Creating or syncing the GitHub Project board...', 'saving');

				fetch('/api/integrations/github/project/sync', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: '{}',
				})
					.then(function (response) { return response.json(); })
					.then(function (data) {
						if (!data.ok) {
							throw new Error(data.error || 'Could not sync the GitHub Project board');
						}

						populateGitHubIntegration(data.config);
						setGitHubConnectionBadge(true, data.config.owner + '/' + data.config.repo);
						renderGitHubProjectState(data.config);
						renderGitHubProjectSummary(data.project, data.issues);
						setGitHubIntegrationStatus('GitHub Project board ready: ' + data.project.project.title + '.', 'ok');
					})
					.catch(function (error) {
						setGitHubIntegrationStatus(error.message || 'Could not sync the GitHub Project board', 'error');
					})
					.finally(function () {
						setGitHubBusy(false);
					});
			});
		}

		if (previewBtn) {
			previewBtn.addEventListener('click', function () {
				setGitHubBusy(true);
				setGitHubIntegrationStatus('Building GitHub sync preview...', 'saving');

				fetch('/api/integrations/github/preview', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: '{}',
				})
					.then(function (response) { return response.json(); })
					.then(function (data) {
						if (!data.ok) {
							throw new Error(data.error || 'Could not preview GitHub sync');
						}

						populateGitHubIntegration(data.config);
						setGitHubConnectionBadge(true, data.config.owner + '/' + data.config.repo);
						renderGitHubProjectState(data.config);
						renderGitHubPreview(data.plan);
						setGitHubIntegrationStatus('Preview ready. Review the operations before syncing.', 'ok');
					})
					.catch(function (error) {
						setGitHubIntegrationStatus(error.message || 'Could not preview GitHub sync', 'error');
					})
					.finally(function () {
						setGitHubBusy(false);
					});
			});
		}

		if (syncBtn) {
			syncBtn.addEventListener('click', function () {
				setGitHubBusy(true);
				setGitHubIntegrationStatus('Synchronizing BMAD to GitHub Issues...', 'saving');

				fetch('/api/integrations/github/sync', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: '{}',
				})
					.then(function (response) { return response.json(); })
					.then(function (data) {
						if (!data.ok) {
							throw new Error(data.error || 'Could not sync GitHub');
						}

						populateGitHubIntegration(data.config);
						setGitHubConnectionBadge(true, data.config.owner + '/' + data.config.repo);
						renderGitHubProjectState(data.config);
						renderGitHubAppliedSummary(data.applied, data.plan);
						setGitHubIntegrationStatus('GitHub sync completed. Created ' + data.applied.created.length + ', updated ' + data.applied.updated.length + ', closed ' + data.applied.closed.length + '.', 'ok');
					})
					.catch(function (error) {
						setGitHubIntegrationStatus(error.message || 'Could not sync GitHub', 'error');
					})
					.finally(function () {
						setGitHubBusy(false);
					});
			});
		}
	}

	function openIntegrationModal(provider) {
		var modal = document.getElementById('integration-modal');
		if (!modal) return;

		setActiveIntegrationProvider(provider || 'github');
		modal.hidden = false;
		document.body.classList.add('body--modal-open');
	}

	function closeIntegrationModal() {
		var modal = document.getElementById('integration-modal');
		if (!modal) return;

		modal.hidden = true;
		document.body.classList.remove('body--modal-open');
	}

	function setActiveIntegrationProvider(provider) {
		document.querySelectorAll('[data-provider-tab]').forEach(function (tab) {
			var active = tab.getAttribute('data-provider-tab') === provider;
			tab.classList.toggle('integration-modal__tab--active', active);
		});

		document.querySelectorAll('[data-provider-pane]').forEach(function (pane) {
			var active = pane.getAttribute('data-provider-pane') === provider;
			pane.hidden = !active;
			pane.classList.toggle('integration-pane--active', active);
		});
	}

	function loadGitHubIntegration() {
		fetch('/api/integrations')
			.then(function (response) { return response.json(); })
			.then(function (data) {
				if (!data || !data.github) {
					setGitHubConnectionBadge(false);
					renderGitHubProjectState(null);
					return;
				}

				populateGitHubIntegration(data.github);
				setGitHubConnectionBadge(true, data.github.owner + '/' + data.github.repo);
				renderGitHubProjectState(data.github);
				setGitHubIntegrationStatus(data.github.project && data.github.project.title
					? 'GitHub repository and project board are ready for sync.'
					: 'GitHub repository ready for manual preview and sync.', 'ok');
			})
			.catch(function () {
				setGitHubConnectionBadge(false);
				renderGitHubProjectState(null);
			});
	}

	function populateGitHubIntegration(config) {
		var ownerInput = document.getElementById('github-owner-input');
		var repoInput = document.getElementById('github-repo-input');
		var tokenInput = document.getElementById('github-token-input');

		if (ownerInput) ownerInput.value = config.owner || '';
		if (repoInput) repoInput.value = config.repo || '';
		if (tokenInput) {
			tokenInput.value = '';
			tokenInput.placeholder = config && config.tokenStored
				? 'Stored locally. Paste a new token only if you want to replace it.'
				: 'Paste your GitHub token';
		}
	}

	function setGitHubConnectionBadge(connected, label) {
		var badge = document.getElementById('github-connection-badge');
		var launcher = document.getElementById('github-launcher-status');
		var text = connected ? label : 'Not connected';

		if (badge) {
			badge.textContent = text;
			badge.className = 'integration-panel__badge' + (connected ? ' integration-panel__badge--connected' : '');
		}

		if (launcher) {
			launcher.textContent = text;
			launcher.className = connected ? 'platform-chip__status platform-chip__status--connected' : 'platform-chip__status';
		}
	}

	function renderGitHubProjectState(config) {
		var summary = document.getElementById('github-project-summary');
		var title = document.getElementById('github-project-title');
		var subtitle = document.getElementById('github-project-subtitle');
		var link = document.getElementById('github-project-link');
		var project = config && config.project ? config.project : null;

		if (!summary || !title || !subtitle || !link) return;

		if (!project || !project.title) {
			summary.hidden = true;
			link.hidden = true;
			link.removeAttribute('href');
			return;
		}

		summary.hidden = false;
		title.textContent = project.title;
		subtitle.textContent = (config.owner || '') + '/' + (config.repo || '') + ' is linked and ready to sync with BMAD.';

		if (project.url) {
			link.hidden = false;
			link.href = project.url;
		} else {
			link.hidden = true;
			link.removeAttribute('href');
		}
	}

	function setGitHubIntegrationStatus(message, kind) {
		var status = document.getElementById('github-integration-status');
		if (!status) return;

		status.textContent = message || '';
		status.className = 'integration-panel__status' + (kind ? ' integration-panel__status--' + kind : '');
	}

	function setGitHubBusy(busy) {
		['github-connect-btn', 'github-project-btn', 'github-preview-btn', 'github-sync-btn'].forEach(function (id) {
			var button = document.getElementById(id);
			if (button) {
				button.disabled = busy;
			}
		});
	}

	function renderGitHubPreview(plan) {
		var preview = document.getElementById('github-sync-preview');
		if (!preview) return;

		var html = '<div class="integration-panel__preview-summary">' +
			'<span>Create: <strong>' + plan.summary.create + '</strong></span>' +
			'<span>Update: <strong>' + plan.summary.update + '</strong></span>' +
			'<span>Close: <strong>' + plan.summary.close + '</strong></span>' +
			'</div>';

		html += renderGitHubPreviewGroup('Create', plan.create, function (item) {
			return item.title;
		});
		html += renderGitHubPreviewGroup('Update', plan.update, function (item) {
			return '#' + item.issueNumber + ' ' + item.title;
		});
		html += renderGitHubPreviewGroup('Close', plan.close, function (item) {
			return '#' + item.issueNumber + ' ' + item.title;
		});

		preview.innerHTML = html;
		preview.hidden = false;
	}

	function renderGitHubAppliedSummary(applied, plan) {
		var preview = document.getElementById('github-sync-preview');
		if (!preview) return;

		preview.innerHTML = '<div class="integration-panel__preview-summary">' +
			'<span>Create: <strong>' + applied.created.length + '</strong></span>' +
			'<span>Update: <strong>' + applied.updated.length + '</strong></span>' +
			'<span>Close: <strong>' + applied.closed.length + '</strong></span>' +
			'</div>' +
			'<p class="integration-panel__preview-note">Last applied plan: ' + plan.summary.create + ' create, ' + plan.summary.update + ' update, ' + plan.summary.close + ' close.</p>';
		preview.hidden = false;
	}

	function renderGitHubProjectSummary(projectResult, issueResult) {
		var preview = document.getElementById('github-sync-preview');
		if (!preview) return;

		var project = projectResult && projectResult.project ? projectResult.project : null;
		var applied = projectResult ? projectResult.applied : null;
		var issueApplied = issueResult ? issueResult.applied : null;
		var projectLink = project && project.url
			? '<a class="integration-panel__link" href="' + escapeText(project.url) + '" target="_blank" rel="noreferrer">Open project</a>'
			: '';

		preview.innerHTML = '<div class="integration-panel__preview-summary">' +
			'<span>Issues created: <strong>' + (issueApplied ? issueApplied.created.length : 0) + '</strong></span>' +
			'<span>Issues updated: <strong>' + (issueApplied ? issueApplied.updated.length : 0) + '</strong></span>' +
			'<span>Board items added: <strong>' + (applied ? applied.added.length : 0) + '</strong></span>' +
			'<span>Status updates: <strong>' + (applied ? applied.updatedStatus.length : 0) + '</strong></span>' +
			'</div>' +
			'<p class="integration-panel__preview-note">' +
			(project ? escapeText(project.title) + '. ' : '') +
			projectLink +
			'</p>';
		preview.hidden = false;
	}

	function renderGitHubPreviewGroup(title, items, formatter) {
		if (!items || items.length === 0) {
			return '<div class="integration-panel__preview-group">' +
				'<h4>' + escapeText(title) + '</h4>' +
				'<p class="integration-panel__preview-empty">No items</p>' +
				'</div>';
		}

		return '<div class="integration-panel__preview-group">' +
			'<h4>' + escapeText(title) + '</h4>' +
			'<ul class="integration-panel__preview-list">' +
			items.slice(0, 8).map(function (item) {
				return '<li>' + escapeText(formatter(item)) + '</li>';
			}).join('') +
			(items.length > 8 ? '<li>...and ' + escapeText(String(items.length - 8)) + ' more</li>' : '') +
			'</ul>' +
			'</div>';
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
			if (e.key === 'Escape') closeIntegrationModal();
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

		// Path config panel
		initPathConfig();

		// GitHub integration
		initGitHubIntegration();

		// Kanban board
		initKanbanBoard();

		// WebSocket
		initWebSocket();
	});

	/* ── Path Config Panel ── */
	function initPathConfig() {
		var panel = document.getElementById('path-config-panel');
		if (!panel) return;

		// Toggle collapsed/expanded
		var toggle = document.getElementById('path-config-toggle');
		if (toggle) {
			toggle.addEventListener('click', function () {
				panel.classList.toggle('path-config-panel--collapsed');
			});
		}

		// Load current overrides into inputs
		fetch('/api/get-paths').then(function (r) { return r.json(); }).then(function (data) {
			if (data.customOutputPath) { var el = document.getElementById('custom-output-path'); if (el) el.value = data.customOutputPath; }
			if (data.customEpicsPath) { var el = document.getElementById('custom-epics-path'); if (el) el.value = data.customEpicsPath; }
			if (data.customSprintStatusPath) { var el = document.getElementById('custom-sprint-status-path'); if (el) el.value = data.customSprintStatusPath; }
		}).catch(function () {});

		var btn = document.getElementById('apply-paths-btn');
		if (!btn) return;

		btn.addEventListener('click', function () {
			var epicsInput = document.getElementById('custom-epics-path');
			var outputInput = document.getElementById('custom-output-path');
			var sprintInput = document.getElementById('custom-sprint-status-path');
			var status = document.getElementById('path-config-status');
			var payload = {};

			if (outputInput && outputInput.value.trim()) payload.outputPath = outputInput.value.trim();
			if (epicsInput && epicsInput.value.trim()) payload.epicsPath = epicsInput.value.trim();
			if (sprintInput && sprintInput.value.trim()) payload.sprintStatusPath = sprintInput.value.trim();

			if (!payload.outputPath && !payload.epicsPath && !payload.sprintStatusPath) {
				if (status) { status.textContent = 'Enter at least one path'; status.className = 'path-config-panel__status path-config-panel__status--err'; }
				return;
			}

			btn.disabled = true;
			if (status) { status.textContent = 'Applying...'; status.className = 'path-config-panel__status'; }

			fetch('/api/set-paths', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})
				.then(function (r) { return r.json(); })
				.then(function (data) {
					btn.disabled = false;
					if (data.ok) {
						if (status) {
							status.textContent = 'Found ' + data.epics + ' epics, ' + data.stories + ' stories. Reloading...';
							status.className = 'path-config-panel__status path-config-panel__status--ok';
						}
						setTimeout(function () { location.reload(); }, 800);
					} else {
						if (status) { status.textContent = data.error || 'Error applying paths'; status.className = 'path-config-panel__status path-config-panel__status--err'; }
					}
				})
				.catch(function () {
					btn.disabled = false;
					if (status) { status.textContent = 'Network error'; status.className = 'path-config-panel__status path-config-panel__status--err'; }
				});
		});
	}
})();
