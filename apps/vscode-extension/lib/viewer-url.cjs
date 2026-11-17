// Pure helpers for the VS Code extension. No `vscode` import, so tests can load them.

// vscode.ColorThemeKind: Light 1, Dark 2, HighContrast 3, HighContrastLight 4.
const LIGHT_KINDS = new Set([1, 4]);

/**
 * Map a VS Code ColorThemeKind number to the dashboard theme.
 * @param {number} kind
 * @returns {'light' | 'dark'}
 */
function themeForKind(kind) {
	return LIGHT_KINDS.has(kind) ? 'light' : 'dark';
}

/**
 * Append (or replace) the `theme` query parameter on the viewer URL.
 * @param {string} serverUrl
 * @param {'light' | 'dark'} theme
 * @returns {string}
 */
function withTheme(serverUrl, theme) {
	const url = new URL(serverUrl);
	url.searchParams.set('theme', theme);
	return url.toString();
}

/**
 * Decide whether the dashboard panel opens automatically at startup.
 * @param {{ openOnStartup?: boolean, bmadDir?: string | null }} options
 * @returns {boolean}
 */
function shouldOpenOnStartup({ openOnStartup, bmadDir } = {}) {
	return openOnStartup === true && Boolean(bmadDir);
}

module.exports = {
	themeForKind,
	withTheme,
	shouldOpenOnStartup,
};
