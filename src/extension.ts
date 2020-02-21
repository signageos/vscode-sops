import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	vscode.workspace.onDidOpenTextDocument((doc) => {
		console.log('TMP', doc);
	});

	let disposable = vscode.commands.registerCommand('extension.sops', () => {
		vscode.window.showInformationMessage('SOPS!');
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
