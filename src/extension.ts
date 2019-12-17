// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { HoverProvider } from "./hover";
import { CompletionProvider } from "./completion";
import { DiagnosticsProvider } from './diagnostics';
import { FileExplorer } from './fileExplorer';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const hoverProvider: HoverProvider.HoverContent = new HoverProvider.HoverContent(context);
	const completionProvider: CompletionProvider.Completion = new CompletionProvider.Completion();
	const diagnosticsProvider: DiagnosticsProvider.Diagnostics = new DiagnosticsProvider.Diagnostics();
	var fileExplorer:FileExplorer;

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "kleio" is now active!');

	vscode.workspace.onWillSaveTextDocument(event => {
		if (event.document.fileName.endsWith(".cli")) {
			diagnosticsProvider.translateFile(event.document.fileName);
		}
	});

	vscode.workspace.onDidOpenTextDocument(document => {
		if (document.fileName.endsWith(".cli")) {
			diagnosticsProvider.onDidOpenTextDocument(document);
		}
	});

	// watch file system events: create and change rpt files
	var watcher = vscode.workspace.createFileSystemWatcher("**/*.err"); // err file is written at the end only
	watcher.onDidCreate(event => {
		diagnosticsProvider.onDidCreateOrChange(event.path.replace(".err", ".rpt"));
		fileExplorer.refresh();
	});

	watcher.onDidChange(event => {
		diagnosticsProvider.onDidCreateOrChange(event.path.replace(".err", ".rpt"));
		fileExplorer.refresh();
	});

	// Registering to provide Hover Content
	// Hover content is managed by hover.ts classes
	vscode.languages.registerHoverProvider('kleio', {
		provideHover(document, position, token) {
			//const hoveredWord = document.getText(document.getWordRangeAtPosition(position));
			//console.log(hoveredWord);	  
			return hoverProvider.getHoverContent(document, position, token);
		}
	});

	// Registering completion item provider
	vscode.languages.registerCompletionItemProvider('kleio', {
		provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
			const tokenText = document.getText(document.getWordRangeAtPosition(position));
			//console.log(tokenText);
			return completionProvider.getCompletionContent(tokenText);
		}
	});

	// commands
	let disposable = vscode.commands.registerCommand('extension.translateFile', (event) => {
		if (event) {
			// command called via right click
			diagnosticsProvider.translateFile(event.uri.path);
		} else if (vscode.window.activeTextEditor) {
			// command called via key binding (keyboard shorcut)
			diagnosticsProvider.translateFile(vscode.window.activeTextEditor.document.uri.path);
		}
	});
	context.subscriptions.push(disposable);

	// `window.createView`
	fileExplorer = new FileExplorer(context);
}

// this method is called when your extension is deactivated
export function deactivate() { }

