import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join, extname, basename, relative, dirname } from 'node:path';
import { parseYaml } from '../parsers/parse-yaml.js';
import { parseMarkdownContent } from '../parsers/parse-markdown.js';
import { ErrorAggregator } from '../utils/error-aggregator.js';

/**
 * Build the complete in-memory data model from a BMAD project.
 *
 * @param {string} bmadDir - Project root containing _bmad/
 * @param {{customEpicsPath?: string, customOutputPath?: string, customSprintStatusPath?: string}} [options] - Optional overrides
 * @returns {{wiki: object, project: object, config: object, aggregator: ErrorAggregator}}
 */
export function buildDataModel(bmadDir, options) {
	const aggregator = new ErrorAggregator();
	const bmadPath = join(bmadDir, '_bmad');
	const outputPath = options?.customOutputPath || join(bmadDir, '_bmad-output');

	const wiki = buildWikiData(bmadPath, aggregator);
	const project = buildProjectData(outputPath, aggregator, options);
	const config = loadConfig(bmadPath, aggregator);

	return { wiki, project, config, aggregator };
}

/**
 * Build wiki catalog data by scanning _bmad directory structure.
 * Dynamically discovers modules and supports both:
 *   - New structure: SKILL.md as entry point in skill directories
 *   - Old structure: agents/ and workflows/ subdirectories with direct .md files
 */
function buildWikiData(bmadPath, aggregator) {
	const modules = [];
	const allItems = [];

	// Dynamically discover module directories (skip underscore-prefixed like _config)
	let moduleDirs = [];
	try {
		const entries = readdirSync(bmadPath, { withFileTypes: true });
		moduleDirs = entries
			.filter(e => e.isDirectory() && !e.name.startsWith('_'))
			.map(e => e.name)
			.sort();
	} catch {
		return { modules, allItems };
	}

	for (const modName of moduleDirs) {
		const modPath = join(bmadPath, modName);
		const moduleData = { id: modName, name: modName.toUpperCase(), groups: [] };
		const groupMap = {};

		// --- New structure: find SKILL.md files recursively ---
		const skillFiles = findNamedFilesRecursive(modPath, 'SKILL.md');
		const skillDirs = new Set(skillFiles.map(f => dirname(f)));

		for (const filePath of skillFiles) {
			const rel = relative(modPath, filePath).replace(/\\/g, '/');
			const parts = rel.split('/'); // e.g. ["skill-name","SKILL.md"] or ["category","skill-name","SKILL.md"]
			const skillDirName = parts[parts.length - 2];
			const groupName = parts.length > 2 ? parts[0] : null;
			const groupKey = groupName ?? '__root__';
			const displayGroup = groupName ? formatName(groupName) : 'Skills';

			const id = `${modName}/${rel.replace('/SKILL.md', '')}`;
			const content = readMarkdownSafe(filePath, aggregator);
			const type = inferSkillType(groupName, skillDirName);
			const item = { id, name: formatName(skillDirName), type, path: filePath, ...content };

			if (!groupMap[groupKey]) {
				groupMap[groupKey] = { name: displayGroup, type: groupKey === '__root__' ? 'skill' : groupKey, items: [], _sortKey: groupName ?? '' };
			}
			groupMap[groupKey].items.push(item);
			allItems.push(item);
		}

		// --- New structure: workflow.md files in dirs without SKILL.md ---
		const workflowFiles = findNamedFilesRecursive(modPath, 'workflow.md')
			.filter(f => !skillDirs.has(dirname(f)));

		for (const filePath of workflowFiles) {
			const rel = relative(modPath, filePath).replace(/\\/g, '/');
			const parts = rel.split('/');
			const skillDirName = parts[parts.length - 2];
			const groupName = parts.length > 2 ? parts[0] : null;
			// Use same groupKey as SKILL.md items so they merge into the same group
			const groupKey = groupName ?? '__root__';
			const displayGroup = groupName ? formatName(groupName) : 'Workflows';

			const id = `${modName}/${rel.replace('/workflow.md', '')}`;
			const content = readMarkdownSafe(filePath, aggregator);
			const item = { id, name: formatName(skillDirName), type: 'workflow', path: filePath, ...content };

			if (!groupMap[groupKey]) {
				groupMap[groupKey] = { name: displayGroup, type: 'workflows', items: [], _sortKey: groupName ?? '' };
			}
			groupMap[groupKey].items.push(item);
			allItems.push(item);
		}

		// --- Old structure (backward compat): only used if new-style SKILL.md scan found nothing ---
		const newStyleFound = skillFiles.length > 0 || workflowFiles.length > 0;
		if (!newStyleFound) {
			// agents/ with direct .md files
			const agentsPath = join(modPath, 'agents');
			if (existsSync(agentsPath) && statSync(agentsPath).isDirectory()) {
				const agentFiles = scanDirectMarkdownFiles(agentsPath);
				if (agentFiles.length > 0) {
					const groupKey = '__legacy_agents__';
					if (!groupMap[groupKey]) {
						groupMap[groupKey] = { name: 'Agents', type: 'agents', items: [], _sortKey: 'agents' };
					}
					for (const filePath of agentFiles) {
						const name = basename(filePath, '.md');
						const id = `${modName}/agents/${name}`;
						const content = readMarkdownSafe(filePath, aggregator);
						const item = { id, name: formatName(name), type: 'agent', path: filePath, ...content };
						groupMap[groupKey].items.push(item);
						allItems.push(item);
					}
				}
			}

			// workflows/ directory
			const workflowsPath = join(modPath, 'workflows');
			if (existsSync(workflowsPath) && statSync(workflowsPath).isDirectory()) {
				const workflowItems = scanWorkflows(workflowsPath, modName, aggregator);
				if (workflowItems.length > 0) {
					const groupKey = '__legacy_workflows__';
					if (!groupMap[groupKey]) {
						groupMap[groupKey] = { name: 'Workflows', type: 'workflows', items: [], _sortKey: 'workflows' };
					}
					groupMap[groupKey].items.push(...workflowItems);
					allItems.push(...workflowItems);
				}
			}

			// other resource dirs
			const otherDirs = ['tasks', 'resources', 'data', 'teams', 'testarch'];
			for (const dirName of otherDirs) {
				const dirPath = join(modPath, dirName);
				if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
					const files = scanDirectMarkdownFiles(dirPath);
					if (files.length > 0) {
						const groupKey = `__legacy_${dirName}__`;
						if (!groupMap[groupKey]) {
							groupMap[groupKey] = { name: formatName(dirName), type: dirName, items: [], _sortKey: dirName };
						}
						for (const filePath of files) {
							const name = basename(filePath, '.md');
							const id = `${modName}/${dirName}/${name}`;
							const content = readMarkdownSafe(filePath, aggregator);
							const item = { id, name: formatName(name), type: dirName, path: filePath, ...content };
							groupMap[groupKey].items.push(item);
							allItems.push(item);
						}
					}
				}
			}
		}

		// Sort groups alphabetically and attach to module
		moduleData.groups = Object.values(groupMap)
			.filter(g => g.items.length > 0)
			.sort((a, b) => a._sortKey.localeCompare(b._sortKey))
			.map(({ _sortKey, ...g }) => g);

		if (moduleData.groups.length > 0) {
			modules.push(moduleData);
		}
	}

	return { modules, allItems };
}

/**
 * Infer the type of a skill based on its group/category name and skill name.
 */
function inferSkillType(groupName, skillName) {
	const g = (groupName ?? '').toLowerCase();
	const s = skillName.toLowerCase();
	if (g.includes('agent') || s.includes('agent')) return 'agent';
	if (g.includes('workflow') || g.includes('workflows')) return 'workflow';
	if (g.includes('skill') || g.includes('skills')) return 'skill';
	return 'skill';
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
 * @param {string} outputPath
 * @param {ErrorAggregator} aggregator
 * @param {{customEpicsPath?: string, customSprintStatusPath?: string}} [options]
 */
function buildProjectData(outputPath, aggregator, options) {
	const customEpicsPath = options?.customEpicsPath;
	const project = {
		sprintStatus: null,
		stories: { total: 0, pending: 0, inProgress: 0, done: 0 },
		storyList: [],
		epics: [],
		artifacts: [],
		bugs: [],
		pendingItems: [],
	};

	if (!existsSync(outputPath)) {
		loadCustomEpicsFile(customEpicsPath, project, aggregator);
		return project;
	}

	// Parse sprint-status (yaml or md)
	const sprintStatusPaths = [
		join(outputPath, 'implementation-artifacts', 'sprint-status.yaml'),
		join(outputPath, 'implementation-artifacts', 'sprint-status.md'),
		join(outputPath, 'sprint-status.yaml'),
		join(outputPath, 'sprint-status.md'),
		join(outputPath, 'planning-artifacts', 'sprint-status.yaml'),
		join(outputPath, 'planning-artifacts', 'sprint-status.md'),
	];
	if (options?.customSprintStatusPath) {
		sprintStatusPaths.unshift(options.customSprintStatusPath);
	}

	for (const statusPath of sprintStatusPaths) {
		if (existsSync(statusPath)) {
			let raw = '';
			try { raw = readFileSync(statusPath, 'utf8'); } catch { /* ignore */ }

			// Try YAML format first (only report errors for .yaml files)
			const result = parseYaml(statusPath);
			const ext = extname(statusPath).toLowerCase();
			if (ext === '.yaml' || ext === '.yml') {
				aggregator.addResult(statusPath, result);
			}

			if (result.data?.development_status) {
				const epicNames = parseEpicNamesFromComments(raw);
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
				break;
			}

			// Fallback: try markdown table format (### Epic N: Name + | N.M | desc | status |)
			if (raw && parseSprintStatusMarkdown(raw, project)) {
				break;
			}
		}
	}

	// Scan planning artifacts (recursive to catch research/ subdir, and include .html files)
	const planningDir = join(outputPath, 'planning-artifacts');
	if (existsSync(planningDir)) {
		const files = scanFilesRecursive(planningDir, ['.md', '.html']);
		for (const file of files) {
			const ext = extname(file).toLowerCase();
			const name = basename(file, ext);

			// Skip sprint-status files (already parsed above)
			if (name === 'sprint-status') continue;

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

			// Parse stories and epics from epics.md or epics-and-stories.md
			if (name.startsWith('epics') && ext === '.md' && content.raw) {
				const storyContents = parseStoriesFromEpics(content.raw, aggregator);
				project.storyContents = storyContents;

				if (project.epics.length === 0) {
					// No sprint-status found — build epics entirely from markdown
					project.epics = parseEpicsFromMarkdown(content.raw, storyContents);
					for (const epic of project.epics) {
						project.stories.total += epic.stories.length;
						project.stories.pending += epic.stories.length;
						project.storyList.push(...epic.stories);
					}
				} else {
					// Merge: add stories from epics.md that are missing in sprint-status
					const mdEpics = parseEpicsFromMarkdown(content.raw, storyContents);
					const existingIds = new Set(project.storyList.map(s => `${s.epic}-${s.id.split('-')[1]}`));
					for (const mdEpic of mdEpics) {
						let sprintEpic = project.epics.find(e => e.num === mdEpic.num);
						if (!sprintEpic) {
							// Entire epic missing from sprint-status — add with all stories as backlog
							sprintEpic = { ...mdEpic, stories: [], status: 'backlog' };
							for (const story of mdEpic.stories) {
								story.status = 'backlog';
								sprintEpic.stories.push(story);
								project.storyList.push(story);
								project.stories.total++;
								project.stories.pending++;
							}
							project.epics.push(sprintEpic);
							project.epics.sort((a, b) => Number(a.num) - Number(b.num));
						} else {
							if (!sprintEpic.name || sprintEpic.name === `Epic ${sprintEpic.num}`) {
								sprintEpic.name = mdEpic.name;
							}
							// Add only stories missing from sprint-status
							for (const story of mdEpic.stories) {
								const storyKey = `${mdEpic.num}-${story.id.split('-')[1]}`;
								if (!existingIds.has(storyKey)) {
									story.status = 'backlog';
									sprintEpic.stories.push(story);
									project.storyList.push(story);
									project.stories.total++;
									project.stories.pending++;
								}
							}
						}
					}
				}
			}
		}
	}

	// Load custom epics file if provided and no epics were found from normal scan
	if (project.epics.length === 0) {
		loadCustomEpicsFile(customEpicsPath, project, aggregator);
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
 * Load a custom epics file and populate project data from it.
 */
function loadCustomEpicsFile(customEpicsPath, project, aggregator) {
	if (!customEpicsPath || !existsSync(customEpicsPath)) return;
	const content = readMarkdownSafe(customEpicsPath, aggregator);
	if (!content.raw) return;

	const name = basename(customEpicsPath, extname(customEpicsPath));
	project.artifacts.push({
		id: `artifact/${name}`,
		name: formatName(name),
		path: customEpicsPath,
		type: 'planning',
		...content,
	});
	const storyContents = parseStoriesFromEpics(content.raw, aggregator);
	project.storyContents = storyContents;
	project.epics = parseEpicsFromMarkdown(content.raw, storyContents);
	for (const epic of project.epics) {
		project.stories.total += epic.stories.length;
		project.stories.pending += epic.stories.length;
		project.storyList.push(...epic.stories);
	}
}

/**
 * Parse individual story sections from epics.md.
 * Stories follow the pattern: ### Story X.Y: Title
 * Returns a map of story key (e.g. "1-1") to {title, markdown}.
 */
function parseStoriesFromEpics(raw, aggregator) {
	const storyMap = {};
	// Split on story headers (supports ### or #### level)
	const storyRegex = /^#{3,4} Story (\d+)\.(\d+):\s*(.+)$/gm;
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
 * Parse epics and their stories from epics.md markdown.
 * Epics follow the pattern: ## Epic N: Title
 * Stories follow the pattern: ### Story N.M: Title
 */
function parseEpicsFromMarkdown(raw, storyContents) {
	const epicRegex = /^#{2,3} Epic (\d+):\s*(.+)$/gm;
	const epicMap = {};
	let match;

	while ((match = epicRegex.exec(raw)) !== null) {
		const num = match[1];
		const name = match[2].trim();
		epicMap[num] = { id: `epic-${num}`, num, name, status: 'backlog', stories: [] };
	}

	// Assign stories to their epics
	for (const [key, storyData] of Object.entries(storyContents)) {
		const epicNum = key.split('-')[0];
		const story = { id: key, title: storyData.title, status: 'backlog', epic: epicNum };
		if (epicMap[epicNum]) {
			epicMap[epicNum].stories.push(story);
		} else {
			epicMap[epicNum] = { id: `epic-${epicNum}`, num: epicNum, name: `Epic ${epicNum}`, status: 'backlog', stories: [story] };
		}
	}

	return Object.values(epicMap).sort((a, b) => Number(a.num) - Number(b.num));
}

/**
 * Parse sprint-status from markdown table format.
 * Expects ### Epic N: Name headers followed by tables with | N.M | description | status |
 * @returns {boolean} true if data was found
 */
function parseSprintStatusMarkdown(raw, project) {
	const epicHeaderRegex = /^#{2,3}\s*Epic\s+(\d+):\s*(.+)$/gm;
	const storyRowRegex = /^\|\s*(\d+)\.(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/gm;

	// First pass: find all epic headers
	const epicMap = {};
	let match;
	while ((match = epicHeaderRegex.exec(raw)) !== null) {
		const epicNum = match[1];
		epicMap[epicNum] = {
			id: `epic-${epicNum}`,
			num: epicNum,
			name: match[2].trim(),
			status: 'in-progress',
			stories: [],
		};
	}

	if (Object.keys(epicMap).length === 0) return false;

	// Second pass: find all story rows
	while ((match = storyRowRegex.exec(raw)) !== null) {
		const epicNum = match[1];
		const storyNum = match[2];
		const title = match[3].trim();
		const rawStatus = match[4].trim();

		// Normalize status from emoji/text to our standard values
		const status = normalizeMarkdownStatus(rawStatus);

		project.stories.total++;
		if (status === 'backlog' || status === 'ready-for-dev') project.stories.pending++;
		else if (status === 'in-progress') project.stories.inProgress++;
		else if (status === 'done' || status === 'review') project.stories.done++;

		const story = {
			id: `${epicNum}-${storyNum}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`,
			title,
			status,
			epic: epicNum,
		};
		project.storyList.push(story);

		if (!epicMap[epicNum]) {
			epicMap[epicNum] = { id: `epic-${epicNum}`, num: epicNum, name: `Epic ${epicNum}`, status: 'in-progress', stories: [] };
		}
		epicMap[epicNum].stories.push(story);
	}

	// Determine epic status from stories
	for (const epic of Object.values(epicMap)) {
		if (epic.stories.length === 0) continue;
		const allDone = epic.stories.every(s => s.status === 'done' || s.status === 'review');
		const anyInProgress = epic.stories.some(s => s.status === 'in-progress');
		if (allDone) epic.status = 'done';
		else if (anyInProgress) epic.status = 'in-progress';
	}

	project.epics = Object.values(epicMap).sort((a, b) => Number(a.num) - Number(b.num));

	// Parse bugs table: | BUG-XXX | desc | epic | status |
	const bugRowRegex = /^\|\s*(BUG-\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/gm;
	while ((match = bugRowRegex.exec(raw)) !== null) {
		project.bugs.push({
			id: match[1],
			description: match[2].trim(),
			epic: match[3].trim(),
			status: normalizeMarkdownStatus(match[4].trim()),
		});
	}

	// Parse pendientes globales: - [ ] text or - [✅] text or - [x] text
	const pendingRegex = /^-\s*\[([^\]]*)\]\s*\*{0,2}(.+?)(?:\*{0,2}\s*[-–—]\s*(.+))?$/gm;
	while ((match = pendingRegex.exec(raw)) !== null) {
		const check = match[1].trim();
		const done = check === '✅' || check.toLowerCase() === 'x';
		project.pendingItems.push({
			title: match[2].replace(/\*{1,2}/g, '').trim(),
			detail: match[3]?.trim() || '',
			done,
		});
	}

	return project.stories.total > 0;
}

/**
 * Normalize markdown status text/emojis to standard status values.
 */
function normalizeMarkdownStatus(raw) {
	const lower = raw.toLowerCase();
	// Strip parenthetical notes for primary status detection
	const primary = lower.replace(/\(.*?\)/g, '').trim();
	if (primary.includes('done') || primary.includes('completado') || raw.includes('✅')) return 'done';
	if (primary.includes('in-progress') || primary.includes('in progress') || primary.includes('en progreso') || raw.includes('🔄')) return 'in-progress';
	if (primary.includes('review') || primary.includes('revisión') || primary.includes('revision')) return 'review';
	if (primary.includes('parcial')) return 'in-progress';
	if (primary.includes('pendiente') || primary.includes('pending') || primary.includes('backlog')) return 'backlog';
	if (raw.includes('⏳')) return 'in-progress';
	return 'backlog';
}

/**
 * Parse epic names from YAML comments like "# Epic 1: Fundación del Proyecto"
 */
function parseEpicNamesFromComments(rawYaml) {
	const names = {};
	const regex = /#\s*Epic\s+(\d+):\s*(.+)/gi;
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
 * Recursively find all files with a specific filename within a directory.
 */
function findNamedFilesRecursive(dir, targetName) {
	const found = [];
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				found.push(...findNamedFilesRecursive(fullPath, targetName));
			} else if (entry.isFile() && entry.name === targetName) {
				found.push(fullPath);
			}
		}
	} catch {
		// Ignore access errors
	}
	return found.sort();
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
