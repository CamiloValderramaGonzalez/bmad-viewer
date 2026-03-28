import { readFileSync, writeFileSync } from 'node:fs';
import { parseYamlContent } from '../parsers/parse-yaml.js';

const PENDING_STATUSES = new Set(['backlog', 'ready-for-dev']);
const ACTIVE_STATUSES = new Set(['in-progress', 'review']);
const DONE_STATUSES = new Set(['done']);
const ALLOWED_STATUSES = new Set(['backlog', 'ready-for-dev', 'in-progress', 'review', 'done']);

/**
 * Update a story status in a sprint-status file and persist it to disk.
 * Supports YAML files with development_status and markdown status tables.
 *
 * @param {{filePath: string, storyId: string, nextStatus: string}} params
 * @returns {{content: string, format: 'yaml'|'markdown', storyId: string, storyStatus: string, epicKey: string|null, epicStatus: string|null}}
 */
export function updateSprintStatusFile({ filePath, storyId, nextStatus }) {
	const raw = readFileSync(filePath, 'utf8');
	const result = applyStoryStatusUpdate(raw, filePath, storyId, nextStatus);
	writeFileSync(filePath, result.content, 'utf8');
	return result;
}

/**
 * Apply a story status update to sprint-status content without writing to disk.
 *
 * @param {string} raw
 * @param {string} source
 * @param {string} storyId
 * @param {string} nextStatus
 * @returns {{content: string, format: 'yaml'|'markdown', storyId: string, storyStatus: string, epicKey: string|null, epicStatus: string|null}}
 */
export function applyStoryStatusUpdate(raw, source, storyId, nextStatus) {
	validateInputs(storyId, nextStatus);

	const yamlResult = parseYamlContent(raw, source);
	if (yamlResult.data?.development_status && typeof yamlResult.data.development_status === 'object') {
		return updateYamlSprintStatus(raw, storyId, nextStatus, yamlResult.data.development_status);
	}

	return updateMarkdownSprintStatus(raw, storyId, nextStatus);
}

function validateInputs(storyId, nextStatus) {
	if (!storyId || typeof storyId !== 'string') {
		throw new Error('A valid story id is required');
	}

	if (!ALLOWED_STATUSES.has(nextStatus)) {
		throw new Error(`Unsupported status "${nextStatus}"`);
	}
}

function updateYamlSprintStatus(raw, storyId, nextStatus, developmentStatus) {
	const nextMap = { ...developmentStatus };
	if (!(storyId in nextMap)) {
		throw new Error(`Story "${storyId}" was not found in development_status`);
	}

	nextMap[storyId] = nextStatus;

	const epicNum = storyId.split('-')[0];
	const epicKey = `epic-${epicNum}`;
	const epicStatus = epicKey in nextMap ? deriveEpicStatus(nextMap, epicNum) : null;
	if (epicStatus) {
		nextMap[epicKey] = epicStatus;
	}

	let content = raw;
	content = replaceYamlValue(content, storyId, nextStatus);
	if (epicStatus) {
		content = replaceYamlValue(content, epicKey, epicStatus);
	}

	return {
		content,
		format: 'yaml',
		storyId,
		storyStatus: nextStatus,
		epicKey: epicStatus ? epicKey : null,
		epicStatus,
	};
}

function updateMarkdownSprintStatus(raw, storyId, nextStatus) {
	const parts = storyId.split('-');
	if (parts.length < 2) {
		throw new Error(`Story id "${storyId}" is not compatible with markdown sprint tables`);
	}

	const storyKey = `${parts[0]}.${parts[1]}`;
	const newline = raw.includes('\r\n') ? '\r\n' : '\n';
	const lines = raw.split(/\r?\n/);
	let found = false;

	const nextLines = lines.map((line) => {
		if (found) return line;
		const trimmed = line.trim();
		if (!trimmed.startsWith('|')) return line;

		const cells = trimmed.split('|').slice(1, -1).map((cell) => cell.trim());
		if (cells.length < 3) return line;
		if (cells[0] !== storyKey) return line;

		cells[cells.length - 1] = markdownStatusLabel(nextStatus);
		found = true;
		return `| ${cells.join(' | ')} |`;
	});

	if (!found) {
		throw new Error(`Story "${storyId}" was not found in markdown sprint status`);
	}

	return {
		content: nextLines.join(newline),
		format: 'markdown',
		storyId,
		storyStatus: nextStatus,
		epicKey: null,
		epicStatus: null,
	};
}

function replaceYamlValue(raw, key, value) {
	const pattern = new RegExp(`^(\\s*${escapeRegExp(key)}\\s*:\\s*)([^#\\r\\n]+?)(\\s*(?:#.*)?)$`, 'm');
	if (!pattern.test(raw)) {
		throw new Error(`Could not update YAML entry "${key}"`);
	}

	return raw.replace(pattern, `$1${value}$3`);
}

function deriveEpicStatus(developmentStatus, epicNum) {
	const storyPattern = new RegExp(`^${escapeRegExp(epicNum)}-\\d+-`);
	const storyStatuses = Object.entries(developmentStatus)
		.filter(([key]) => storyPattern.test(key))
		.map(([, status]) => status);

	if (storyStatuses.length === 0) {
		return 'backlog';
	}

	if (storyStatuses.every((status) => PENDING_STATUSES.has(status))) {
		return 'backlog';
	}

	if (storyStatuses.every((status) => DONE_STATUSES.has(status))) {
		return 'done';
	}

	if (storyStatuses.some((status) => ACTIVE_STATUSES.has(status))) {
		return 'in-progress';
	}

	return 'in-progress';
}

function markdownStatusLabel(status) {
	if (status === 'in-progress') return 'In Progress';
	if (status === 'ready-for-dev') return 'Ready for Dev';
	return status.charAt(0).toUpperCase() + status.slice(1);
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
