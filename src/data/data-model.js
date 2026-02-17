import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
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

	// Scan planning artifacts
	const planningDir = join(outputPath, 'planning-artifacts');
	if (existsSync(planningDir)) {
		const files = scanDirectMarkdownFiles(planningDir);
		for (const file of files) {
			const name = basename(file, '.md');
			const content = readMarkdownSafe(file, aggregator);
			project.artifacts.push({
				id: `artifact/${name}`,
				name: formatName(name),
				path: file,
				...content,
			});

			// Parse stories from epics.md
			if (name === 'epics' && content.raw) {
				const storyContents = parseStoriesFromEpics(content.raw, aggregator);
				project.storyContents = storyContents;
			}
		}
	}

	// Scan implementation artifact story files (direct .md files in impl dir + stories/ subdir)
	const implDir = join(outputPath, 'implementation-artifacts');
	if (existsSync(implDir)) {
		// Scan direct .md files in implementation-artifacts (story files live here)
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

		// Also check stories/ subdirectory if it exists
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
 * Load BMAD config.
 */
function loadConfig(bmadPath, aggregator) {
	const configPaths = [
		join(bmadPath, 'bmm', 'config.yaml'),
		join(bmadPath, 'config.yaml'),
	];

	for (const configPath of configPaths) {
		if (existsSync(configPath)) {
			const result = parseYaml(configPath);
			aggregator.addResult(configPath, result);
			return result.data || {};
		}
	}

	return {};
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
 * Format a kebab-case name to Title Case.
 */
function formatName(name) {
	return name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
