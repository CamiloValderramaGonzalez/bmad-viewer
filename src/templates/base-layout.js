import { InlineThemeScript } from './inline-theme-script.js';
import { HeaderBar } from '../components/header-bar.js';
import { LensTabs } from '../components/lens-tabs.js';
import { SearchModal } from '../components/search-modal.js';

/**
 * Generate the full HTML page layout.
 * @param {{title: string, sidebar: string, content: string, activeTab: string, warnings: Array, contentMapJson: string}} props
 * @returns {string} Complete HTML document
 */
export function BaseLayout({ title, sidebar, content, activeTab, warnings, contentMapJson, projectName }) {
	const warningBanner =
		warnings && warnings.length > 0
			? `<div class="warning-banner" role="alert">
		${warnings.map((w) => `<p class="warning-banner__item">&#9888;&#65039; ${w.source}: ${w.message}</p>`).join('\n')}
	</div>`
			: '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${title || 'bmad-viewer'}</title>
	${InlineThemeScript()}
	<link rel="stylesheet" href="/styles.css">
</head>
<body>
	<div class="sticky-top">
	${HeaderBar({ projectName })}
	${LensTabs({ activeTab: activeTab || 'wiki' })}
	</div>
	${warningBanner}
	<div class="app-layout">
		<aside class="app-layout__sidebar">
			${sidebar}
		</aside>
		<div class="app-layout__main">
			${content}
		</div>
	</div>
	${SearchModal()}
	<script>window.__BMAD_CONTENT__ = ${contentMapJson || '{}'};</script>
	<script src="/client.js"></script>
</body>
</html>`;
}
