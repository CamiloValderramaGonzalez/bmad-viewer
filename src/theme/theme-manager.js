/**
 * Generate client-side theme manager script.
 * @returns {string} JavaScript code for client
 */
export function getThemeScript() {
	return `
function toggleTheme() {
	var current = document.documentElement.dataset.theme;
	var next = current === 'dark' ? 'light' : 'dark';
	document.documentElement.dataset.theme = next;
	localStorage.setItem('bmad-theme', next);
	var btn = document.getElementById('theme-toggle');
	if (btn) btn.textContent = next === 'dark' ? '\\u2600' : '\\u263E';
}

document.addEventListener('DOMContentLoaded', function() {
	var btn = document.getElementById('theme-toggle');
	if (btn) {
		btn.addEventListener('click', toggleTheme);
		var theme = document.documentElement.dataset.theme;
		btn.textContent = theme === 'dark' ? '\\u2600' : '\\u263E';
	}
});
`;
}
