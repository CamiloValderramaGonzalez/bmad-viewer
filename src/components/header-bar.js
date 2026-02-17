/**
 * Render the header bar with logo, centered search trigger, and theme toggle.
 * @returns {string} HTML string
 */
export function HeaderBar() {
	return `<header class="header-bar" role="banner">
	<div class="header-bar__logo">
		<span class="header-bar__icon">&#9635;</span>
		<span class="header-bar__title">bmad-viewer</span>
	</div>
	<button class="header-bar__search" id="search-trigger" aria-label="Search (Ctrl+K)" title="Search (Ctrl+K)">
		<svg class="header-bar__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
		<span class="header-bar__search-text">Search...</span>
		<kbd class="header-bar__shortcut">Ctrl+K</kbd>
	</button>
	<button class="header-bar__theme" id="theme-toggle" aria-label="Toggle theme" title="Toggle theme">
		<svg class="header-bar__theme-icon header-bar__theme-icon--sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
		<svg class="header-bar__theme-icon header-bar__theme-icon--moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
	</button>
</header>`;
}
