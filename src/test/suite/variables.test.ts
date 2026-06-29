import * as assert from 'assert';
import * as path from 'path';

import { applyVariableSubstitution } from '../../extension';

const baseVars = {
	workspaceFolder: path.join(path.sep, 'ws'),
	namedWorkspaceFolders: {
		'frontend': path.join(path.sep, 'repos', 'frontend'),
		'backend': path.join(path.sep, 'repos', 'backend'),
	},
	userHome: path.join(path.sep, 'home', 'tester'),
	env: { MY_VAR: 'from-env' } as NodeJS.ProcessEnv,
	pathSep: path.sep,
};

suite('applyVariableSubstitution', () => {
	test('substitutes ${workspaceFolder} (the reported mise shim case)', () => {
		const result = applyVariableSubstitution('${workspaceFolder}/.vscode/mise-tools/sops', baseVars);
		assert.strictEqual(result, `${baseVars.workspaceFolder}/.vscode/mise-tools/sops`);
	});

	test('substitutes named ${workspaceFolder:Name} for multi-root', () => {
		const result = applyVariableSubstitution('${workspaceFolder:backend}/bin/sops', baseVars);
		assert.strictEqual(result, `${baseVars.namedWorkspaceFolders.backend}/bin/sops`);
	});

	test('leaves unknown named workspace folder untouched', () => {
		const result = applyVariableSubstitution('${workspaceFolder:missing}/sops', baseVars);
		assert.strictEqual(result, '${workspaceFolder:missing}/sops');
	});

	test('substitutes ${workspaceFolderBasename}', () => {
		const result = applyVariableSubstitution('${workspaceFolderBasename}/sops', baseVars);
		assert.strictEqual(result, `${path.basename(baseVars.workspaceFolder)}/sops`);
	});

	test('substitutes ${fileWorkspaceFolder} (alias of the resource workspace folder)', () => {
		const result = applyVariableSubstitution('${fileWorkspaceFolder}/bin/sops', baseVars);
		assert.strictEqual(result, `${baseVars.workspaceFolder}/bin/sops`);
	});

	test('leaves ${workspaceFolderBasename} intact when no workspace folder is available', () => {
		const result = applyVariableSubstitution('${workspaceFolderBasename}/sops', { ...baseVars, workspaceFolder: undefined });
		assert.strictEqual(result, '${workspaceFolderBasename}/sops');
	});

	test('substitutes ${userHome}', () => {
		const result = applyVariableSubstitution('${userHome}/age.txt', baseVars);
		assert.strictEqual(result, `${baseVars.userHome}/age.txt`);
	});

	test('substitutes ${env:VAR} and resolves missing vars to empty string', () => {
		assert.strictEqual(applyVariableSubstitution('${env:MY_VAR}/x', baseVars), 'from-env/x');
		assert.strictEqual(applyVariableSubstitution('${env:NOPE}/x', baseVars), '/x');
	});

	test('substitutes ${pathSeparator} and ${/}', () => {
		assert.strictEqual(applyVariableSubstitution('a${pathSeparator}b${/}c', baseVars), `a${path.sep}b${path.sep}c`);
	});

	test('expands a leading ~ to the home directory', () => {
		const result = applyVariableSubstitution('~/.local/share/mise/shims/sops', baseVars);
		assert.strictEqual(result, path.join(baseVars.userHome, '.local/share/mise/shims/sops'));
	});

	test('does not expand ~ in the middle of a path', () => {
		const result = applyVariableSubstitution('/opt/~backup/sops', baseVars);
		assert.strictEqual(result, '/opt/~backup/sops');
	});

	test('leaves ${workspaceFolder} intact when no workspace folder is available', () => {
		const result = applyVariableSubstitution('${workspaceFolder}/sops', { ...baseVars, workspaceFolder: undefined });
		assert.strictEqual(result, '${workspaceFolder}/sops');
	});

	test('returns plain paths unchanged', () => {
		assert.strictEqual(applyVariableSubstitution('sops', baseVars), 'sops');
		assert.strictEqual(applyVariableSubstitution('/usr/local/bin/sops', baseVars), '/usr/local/bin/sops');
	});
});
