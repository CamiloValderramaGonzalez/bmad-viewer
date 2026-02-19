import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join, extname, basename, relative } from 'node:path';
import { parseYaml } from '../parsers/parse-yaml.js';
import { parseMarkdownContent } from '../parsers/parse-markdown.js';
import { ErrorAggregator } from '../utils/error-aggregator.js';

/**
 * Build the complete in-memory data model from a BMAD project.
 *
 * @param {string} bmadDir - Project root containing _bmad/
 * @returns {{wiki: object, project: object, config: object, aggregator: ErrorAggregator}}
 */
export function buildDataModel(bmadDir) {
	const aggregator = new ErrorAggregator();
	const bmadPath = join(bmadDir, '_bmad');
	const outputPath = join(bmadDir, '_bmad-output');

	const wiki = buildWikiData(bmadPath, aggregator);
	const project = buildProjectData(outputPath, aggregator);
	const config = loadConfig(bmadPath, aggregator);

	return { wiki, project, config, aggregator };
}

/**
 * Build wiki catalog data by scanning _bmad directory structure.
 * Scans each module (core, bmm, bmb, cis) for agents and workflows.
 */
function buildWikiData(bmadPath, aggregator) {
	const modules = [];
	const allItems = [];

	const moduleNames = ['core', 'bmm', 'bmb', 'cis'];

	for (const modName of moduleNames) {
		const modPath = join(bmadPath, modName);
		if (!existsSync(modPath) || !statSync(modPath).isDirectory()) continue;

		const moduleData = { id: modName, name: modName.toUpperCase(), groups: [] };

		// Scan agents
		const agentsPath = join(modPath, 'agents');
		if (existsSync(agentsPath) && statSync(agentsPath).isDirectory()) {
			const agentFiles = scanDirectMarkdownFiles(agentsPath);
			if (agentFiles.length > 0) {
				const items = agentFiles.map((filePath) => {
					const name = basename(filePath, '.md');
					const id = `${modName}/agents/${name}`;
					const content = readMarkdownSafe(filePath, aggregator);
					return { id, name: formatName(name), type: 'agent', path: filePath, ...content };
				});
				moduleData.groups.push({ name: 'Agents', type: 'agents', items });
				allItems.push(...items);
			}
		}

		// Scan workflows
		const workflowsPath = join(modPath, 'workflows');
		if (existsSync(workflowsPath) && statSync(workflowsPath).isDirectory()) {
			const workflowItems = scanWorkflows(workflowsPath, modName, aggregator);
			if (workflowItems.length > 0) {
				moduleData.groups.push({ name: 'Workflows', type: 'workflows', items: workflowItems });
				allItems.push(...workflowItems);
			}
		}

		// Scan other resource directories
		const otherDirs = ['tasks', 'resources', 'data', 'teams', 'testarch'];
		for (const dirName of otherDirs) {
			const dirPath = join(modPath, dirName);
			if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
				const files = scanDirectMarkdownFiles(dirPath);
				if (files.length > 0) {
					const items = files.map((filePath) => {
						const name = basename(filePath, '.md');
						const id = `${modName}/${dirName}/${name}`;
						const content = readMarkdownSafe(filePath, aggregator);
						return { id, name: formatName(name), type: dirName, path: filePath, ...content };
					});
					moduleData.groups.push({ name: formatName(dirName), type: dirName, items });
					allItems.push(...items);
				}
			}
		}

		if (moduleData.groups.length > 0) {
			modules.push(moduleData);
		}
	}

	return { modules, allItems };
}

/**
 * Scan workflows directory. Workflows can be:
 * - Direct .md files
 * - Directories containing a workflow.md
 * - Category directories with sub-workflow directories
 */
function scanWorkflows(workflowsPath, modName, aggregator) {
	const items = [];

	try {
		const entries = readdirSync(workflowsPath, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(workflowsPath, entry.name);

			if (entry.isFile() && extname(entry.name) === '.md' && entry.name !== 'README.md') {
				const name = basename(entry.name, '.md');
				const id = `${modName}/workflows/${name}`;
				const content = readMarkdownSafe(fullPath, aggregator);
				items.push({ id, name: formatName(name), type: 'workflow', path: fullPath, ...content });
			} else if (entry.isDirectory()) {
				const workflowMd = join(fullPath, 'workflow.md');

				if (existsSync(workflowMd)) {
					const name = entry.name;
					const id = `${modName}/workflows/${name}`;
					const content = readMarkdownSafe(workflowMd, aggregator);
					items.push({ id, name: formatName(name), type: 'workflow', path: workflowMd, ...content });
				} else {
					// Check for sub-workflow directories
					const subItems = scanWorkflowSubdir(fullPath, modName, entry.name, aggregator);
					items.push(...subItems);
				}
			}
		}
	} catch {
		// Ignore access errors
	}

	return items;
}

/**
 * Scan a workflow subdirectory for nested workflow directories.
 */
function scanWorkflowSubdir(dirPath, modName, categoryName, aggregator) {
	const items = [];

	try {
		const entries = readdirSync(dirPath, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dirPath, entry.name);

			if (entry.isDirectory()) {
				const workflowMd = join(fullPath, 'workflow.md');
				if (existsSync(workflowMd)) {
					const name = entry.name;
					const id = `${modName}/workflows/${categoryName}/${name}`;
					const content = readMarkdownSafe(workflowMd, aggregator);
					items.push({ id, name: formatName(name), type: 'workflow', path: workflowMd, ...content });
				}
			} else if (extname(entry.name) === '.md' && entry.name !== 'README.md') {
				const name = basename(entry.name, '.md');
				const id = `${modName}/workflows/${categoryName}/${name}`;
				const content = readMarkdownSafe(fullPath, aggregator);
				items.push({ id, name: formatName(name), type: 'workflow', path: fullPath, ...content });
			}
		}
	} catch {
		// Ignore access errors
	}

	return items;
}

/**
 * Read a markdown file safely and return html + frontmatter.
 */
function readMarkdownSafe(filePath, aggregator) {
	try {
		const raw = readFileSync(filePath, 'utf8');
		const result = parseMarkdownContent(raw, filePath);
		if (result.errors.length > 0) {
			aggregator.addResult(filePath, result);
		}
		return { html: result.data?.html || '', frontmatter: result.data?.frontmatter || null, raw };
	} catch {
		return { html: '', frontmatter: null, raw: '' };
	}
}

/**
 * Build project data from _bmad-output directory.
 */
function buildProjectData(outputPath, aggregator) {
	const project = {
		sprintStatus: null,
		stories: { total: 0, pending: 0, inProgress: 0, done: 0 },
		storyList: [],
		epics: [],
		artifacts: [],
	};

	if (!existsSync(outputPath)) return project;

	// Parse sprint-status.yaml
	const sprintStatusPaths = [
		join(outputPath, 'implementation-artifacts', 'sprint-status.yaml'),
		join(outputPath, 'sprint-status.yaml'),
	];

	for (const statusPath of sprintStatusPaths) {
		if (existsSync(statusPath)) {
			const result = parseYaml(statusPath);
			aggregator.addResult(statusPath, result);

			// Read raw YAML to extract epic names from comments
			let rawYaml = '';
			try { rawYaml = readFileSync(statusPath, 'utf8'); } catch { /* ignore */ }
			const epicNames = parseEpicNamesFromComments(rawYaml);

			if (result.data?.development_status) {
				project.sprintStatus = result.data;
				const status = result.data.development_status;
				const epicMap = {};

				for (const [key, value] of Object.entries(status)) {
					if (key.endsWith('-retrospective')) continue;

					// Epic entry
					if (key.match(/^epic-\d+$/)) {
						const epicNum = key.replace('epic-', '');
						if (!epicMap[epicNum]) {
							epicMap[epicNum] = { id: key, num: epicNum, name: epicNames[epicNum] || `Epic ${epicNum}`, status: value, stories: [] };
						} else {
							epicMap[epicNum].status = value;
							epicMap[epicNum].name = epicNames[epicNum] || epicMap[epicNum].name;
						}
						continue;
					}

					// Story entry
					project.stories.total++;
					if (value === 'backlog' || value === 'ready-for-dev') project.stories.pending++;
					else if (value === 'in-progress') project.stories.inProgress++;
					else if (value === 'done' || value === 'review') project.stories.done++;

					const parts = key.split('-');
					const epicNum = parts[0];
					const storyTitle = parts.slice(2).join(' ').replace(/\b\w/g, (c) => c.toUpperCase());
					const story = { id: key, title: storyTitle || key, status: value, epic: epicNum };
					project.storyList.push(story);

					if (!epicMap[epicNum]) {
						epicMap[epicNum] = { id: `epic-${epicNum}`, num: epicNum, name: epicNames[epicNum] || `Epic ${epicNum}`, status: 'in-progress', stories: [] };
					}
					epicMap[epicNum].stories.push(story);
				}

				project.epics = Object.values(epicMap).sort((a, b) => Number(a.num) - Number(b.num));
			}
			break;
		}
	}

	// Scan planning artifacts (recursive to catch research/ subdir, and include .html files)
	const planningDir = join(outputPath, 'planning-artifacts');
	if (existsSync(planningDir)) {
		const files = scanFilesRecursive(planningDir, ['.md', '.html']);
		for (const file of files) {
			const ext = extname(file).toLowerCase();
			const name = basename(file, ext);
			const content = ext === '.html'
				? readHtmlSafe(file)
				: readMarkdownSafe(file, aggregator);
			const type = categorizeArtifact(file, outputPath);
			project.artifacts.push({
				id: `artifact/${name}`,
				name: formatName(name),
				path: file,
				type,
				...content,
			});

			// Parse stories from epics.md
			if (name === 'epics' && ext === '.md' && content.raw) {
				const storyContents = parseStoriesFromEpics(content.raw, aggregator);
				project.storyContents = storyContents;
			}
		}
	}

	// Scan implementation artifact story files (direct .md files in impl dir + stories/ subdir)
	const implDir = join(outputPath, 'implementation-artifacts');
	if (existsSync(implDir)) {
		const implFiles = scanDirectMarkdownFiles(implDir);
		for (const file of implFiles) {
			const name = basename(file, '.md');
			const content = readMarkdownSafe(file, aggregator);
			project.artifacts.push({
				id: `story/${name}`,
				name: formatName(name),
				path: file,
				type: 'story',
				...content,
			});
		}

		const storyDir = join(implDir, 'stories');
		if (existsSync(storyDir)) {
			const files = scanDirectMarkdownFiles(storyDir);
			for (const file of files) {
				const name = basename(file, '.md');
				const content = readMarkdownSafe(file, aggregator);
				project.artifacts.push({
					id: `story/${name}`,
					name: formatName(name),
					path: file,
					type: 'story',
					...content,
				});
			}
		}
	}

	// Scan analysis/ directory
	const analysisDir = join(outputPath, 'analysis');
	if (existsSync(analysisDir)) {
		const files = scanDirectFiles(analysisDir, ['.md']);
		for (const file of files) {
			const name = basename(file, '.md');
			const content = readMarkdownSafe(file, aggregator);
			project.artifacts.push({
				id: `artifact/${name}`,
				name: formatName(name),
				path: file,
				type: 'analysis',
				...content,
			});
		}
	}

	// Scan excalidraw-diagrams/ directory
	const excalidrawDir = join(outputPath, 'excalidraw-diagrams');
	if (existsSync(excalidrawDir)) {
		const files = scanDirectFiles(excalidrawDir, ['.excalidraw']);
		for (const file of files) {
			const name = basename(file, '.excalidraw');
			const content = readExcalidrawSafe(file);
			project.artifacts.push({
				id: `artifact/${name}`,
				name: formatName(name),
				path: file,
				type: 'diagram',
				...content,
			});
		}
	}

	// Scan bmb-creations/ directory (recursive, .md + .yaml)
	const bmbDir = join(outputPath, 'bmb-creations');
	if (existsSync(bmbDir)) {
		const files = scanFilesRecursive(bmbDir, ['.md', '.yaml']);
		for (const file of files) {
			const ext = extname(file).toLowerCase();
			const name = basename(file, ext);
			const content = ext === '.yaml'
				? readYamlSafe(file)
				: readMarkdownSafe(file, aggregator);
			project.artifacts.push({
				id: `artifact/${name}`,
				name: formatName(name),
				path: file,
				type: 'bmb-creation',
				...content,
			});
		}
	}

	// Scan root-level files in _bmad-output/ (CIS sessions, test-arch outputs, etc.)
	const rootFiles = scanDirectFiles(outputPath, ['.md']);
	for (const file of rootFiles) {
		const name = basename(file, '.md');
		const content = readMarkdownSafe(file, aggregator);
		const type = categorizeArtifact(file, outputPath);
		project.artifacts.push({
			id: `artifact/${name}`,
			name: formatName(name),
			path: file,
			type,
			...content,
		});
	}

	// Build artifactGroups by category (excluding stories which are shown under epics)
	project.artifactGroups = {};
	for (const art of project.artifacts) {
		if (art.type === 'story') continue;
		const cat = art.type || 'other';
		if (!project.artifactGroups[cat]) project.artifactGroups[cat] = [];
		project.artifactGroups[cat].push(art);
	}

	return project;
}

/**
 * Parse individual story sections from epics.md.
 * Stories follow the pattern: ### Story X.Y: Title
 * Returns a map of story key (e.g. "1-1") to {title, markdown}.
 */
function parseStoriesFromEpics(raw, aggregator) {
	const storyMap = {};
	// Split on story headers
	const storyRegex = /^### Story (\d+)\.(\d+):\s*(.+)$/gm;
	let match;
	const positions = [];

	while ((match = storyRegex.exec(raw)) !== null) {
		positions.push({
			epicNum: match[1],
			storyNum: match[2],
			title: match[3].trim(),
			start: match.index,
			headerEnd: match.index + match[0].length,
		});
	}

	for (let i = 0; i < positions.length; i++) {
		const pos = positions[i];
		// Content goes until the next story header, next epic header (## Epic), or end of file
		let end = raw.length;
		if (i + 1 < positions.length) {
			end = positions[i + 1].start;
		}
		// Also check for epic section boundary (## Epic or ---)
		const remaining = raw.substring(pos.headerEnd, end);
		const epicBoundary = remaining.search(/^---$/m);
		if (epicBoundary !== -1) {
			end = pos.headerEnd + epicBoundary;
		}

		const storyMarkdown = raw.substring(pos.start, end).trim();
		const key = `${pos.epicNum}-${pos.storyNum}`;
		const result = parseMarkdownContent(storyMarkdown, `epics.md#story-${key}`);
		storyMap[key] = {
			title: pos.title,
			html: result.data?.html || '',
		};
	}

	return storyMap;
}

/**
 * Parse epic names from YAML comments like "# Epic 1: Fundación del Proyecto"
 */
function parseEpicNamesFromComments(rawYaml) {
	const names = {};
	const regex = /#\s*Epic\s+(\d+):\s*(.+)/g;
	let match;
	while ((match = regex.exec(rawYaml)) !== null) {
		names[match[1]] = match[2].trim();
	}
	return names;
}

/**
 * Load BMAD config and project context.
 */
function loadConfig(bmadPath, aggregator) {
	const configPaths = [
		join(bmadPath, 'bmm', 'config.yaml'),
		join(bmadPath, 'config.yaml'),
	];

	let config = {};
	for (const configPath of configPaths) {
		if (existsSync(configPath)) {
			const result = parseYaml(configPath);
			aggregator.addResult(configPath, result);
			config = result.data || {};
			break;
		}
	}

	// Look for project context or product brief for intro content
	const projectRoot = join(bmadPath, '..');
	const contextPaths = [
		join(projectRoot, 'docs', 'project-context.md'),
		join(projectRoot, 'project-context.md'),
		join(projectRoot, '_bmad-output', 'planning-artifacts', 'product-brief.md'),
	];

	// Also search for any product-brief file with date suffix
	const planningDir = join(projectRoot, '_bmad-output', 'planning-artifacts');
	if (existsSync(planningDir)) {
		try {
			const entries = readdirSync(planningDir);
			for (const entry of entries) {
				if (entry.includes('product-brief') && entry.endsWith('.md')) {
					contextPaths.push(join(planningDir, entry));
				}
			}
		} catch { /* ignore */ }
	}

	for (const ctxPath of contextPaths) {
		if (existsSync(ctxPath)) {
			const content = readMarkdownSafe(ctxPath, aggregator);
			config.projectContextHtml = content.html;
			config.projectContextName = basename(ctxPath, '.md');
			break;
		}
	}

	return config;
}

/**
 * Scan a directory for direct .md files (non-recursive).
 */
function scanDirectMarkdownFiles(dir) {
	const files = [];
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile() && extname(entry.name) === '.md') {
				files.push(join(dir, entry.name));
			}
		}
	} catch {
		// Ignore
	}
	return files.sort();
}

/**
 * Scan a directory for direct files matching given extensions (non-recursive).
 */
function scanDirectFiles(dir, extensions) {
	const files = [];
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile() && extensions.includes(extname(entry.name).toLowerCase())) {
				files.push(join(dir, entry.name));
			}
		}
	} catch {
		// Ignore
	}
	return files.sort();
}

/**
 * Recursively scan a directory for files matching given extensions.
 */
function scanFilesRecursive(dir, extensions) {
	const files = [];
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				files.push(...scanFilesRecursive(fullPath, extensions));
			} else if (entry.isFile() && extensions.includes(extname(entry.name).toLowerCase())) {
				files.push(fullPath);
			}
		}
	} catch {
		// Ignore
	}
	return files.sort();
}

/**
 * Read an Excalidraw file and produce an HTML viewer using the Excalidraw React component via CDN.
 */
function readExcalidrawSafe(filePath) {
	try {
		const raw = readFileSync(filePath, 'utf8');
		const sceneData = JSON.parse(raw);

		// Escape the JSON for safe embedding in HTML
		const escapedJson = JSON.stringify(sceneData)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');

		const html = `<div class="excalidraw-viewer" style="width:100%;height:70vh;border:1px solid var(--border-color,#ddd);border-radius:8px;overflow:hidden;">
<iframe style="width:100%;height:100%;border:none;" srcdoc="<!DOCTYPE html>
<html>
<head>
<meta charset='utf-8'>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body, #root { width:100%; height:100%; }
  .excalidraw .App-menu_top .buttonList { display:none; }
</style>
</head>
<body>
<div id='root'></div>
<script src='https://unpkg.com/react@18/umd/react.production.min.js'><\/script>
<script src='https://unpkg.com/react-dom@18/umd/react-dom.production.min.js'><\/script>
<script src='https://unpkg.com/@excalidraw/excalidraw/dist/excalidraw.production.min.js'><\/script>
<script>
  var scene = JSON.parse(decodeURIComponent(&quot;${encodeURIComponent(JSON.stringify(sceneData))}&quot;));
  var App = function() {
    return React.createElement(ExcalidrawLib.Excalidraw, {
      initialData: { elements: scene.elements || [], appState: { viewBackgroundColor: scene.appState?.viewBackgroundColor || '#ffffff', theme: 'light' }, files: scene.files || {} },
      viewModeEnabled: true,
      zenModeEnabled: true,
      gridModeEnabled: false,
      UIOptions: { canvasActions: { changeViewBackgroundColor: false, clearCanvas: false, export: false, loadScene: false, saveToActiveFile: false, toggleTheme: false, saveAsImage: false } }
    });
  };
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
<\/script>
</body>
</html>"></iframe></div>`;

		return { html, frontmatter: null, raw };
	} catch {
		return { html: '<p>Error loading Excalidraw file</p>', frontmatter: null, raw: '' };
	}
}

/**
 * Read an HTML file and embed it in an isolated iframe.
 */
function readHtmlSafe(filePath) {
	try {
		const raw = readFileSync(filePath, 'utf8');
		// Escape for srcdoc attribute
		const escaped = raw
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;');
		const html = `<div class="html-artifact-viewer" style="width:100%;height:80vh;border:1px solid var(--border-color,#ddd);border-radius:8px;overflow:hidden;">
<iframe style="width:100%;height:100%;border:none;" srcdoc="${escaped}"></iframe></div>`;
		return { html, frontmatter: null, raw };
	} catch {
		return { html: '<p>Error loading HTML file</p>', frontmatter: null, raw: '' };
	}
}

/**
 * Read a YAML file and render it as formatted code block.
 */
function readYamlSafe(filePath) {
	try {
		const raw = readFileSync(filePath, 'utf8');
		const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		const html = `<pre><code class="language-yaml">${escaped}</code></pre>`;
		return { html, frontmatter: null, raw };
	} catch {
		return { html: '<p>Error loading YAML file</p>', frontmatter: null, raw: '' };
	}
}

/**
 * Categorize an artifact based on its path relative to _bmad-output.
 */
function categorizeArtifact(filePath, outputPath) {
	const rel = relative(outputPath, filePath).replace(/\\/g, '/');

	if (rel.startsWith('planning-artifacts/research/')) return 'research';
	if (rel.startsWith('planning-artifacts/')) return 'planning';
	if (rel.startsWith('implementation-artifacts/')) return 'story';
	if (rel.startsWith('analysis/')) return 'analysis';
	if (rel.startsWith('excalidraw-diagrams/')) return 'diagram';
	if (rel.startsWith('bmb-creations/')) return 'bmb-creation';

	// Root-level files — categorize by filename prefix
	const name = basename(filePath).toLowerCase();
	if (/^(test-design|test-review|atdd-|automation-|traceability-|gate-decision-|nfr-)/.test(name)) return 'test-arch';
	if (/^(design-thinking-|innovation-strategy-|problem-solution-|story-)/.test(name)) return 'cis';
	if (/^brainstorming-/.test(name)) return 'analysis';

	return 'other';
}

/**
 * Format a kebab-case name to Title Case.
 */
function formatName(name) {
	return name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
