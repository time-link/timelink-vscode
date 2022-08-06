// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { HoverProvider } from "./hover";
import { CompletionProvider } from "./completion";
import { DiagnosticsProvider } from './diagnostics';
import { FileExplorer, KleioStatusExplorer } from './fileExplorer';
import { KleioServiceModule } from './kleioService';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const hoverProvider: HoverProvider.HoverContent = new HoverProvider.HoverContent(context);
	const completionProvider: CompletionProvider.Completion = new CompletionProvider.Completion();
	const diagnosticsProvider: DiagnosticsProvider.Diagnostics = new DiagnosticsProvider.Diagnostics();

	// main time link explorer with all the files
	var fileExplorer: FileExplorer;

	// organizes files by status: translation needed, ready to import, etc
	var kleioExplorer: KleioStatusExplorer;

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "kleio" is now active!');

	vscode.workspace.onWillSaveTextDocument(event => {
		if (event.document.fileName.toLowerCase().endsWith(".cli")) {
			diagnosticsProvider.translateFile(event.document.fileName);
		}
	});

	vscode.workspace.onDidOpenTextDocument(document => {
		if (document.fileName.toLowerCase().endsWith(".cli")) {
			diagnosticsProvider.onDidOpenTextDocument(document);
		}
	});

	// watch file system events to detect translation changes:
	// translation ends with a newly created .err file
	var watcher = vscode.workspace.createFileSystemWatcher("**/*.err"); // err file is written at the end only
	var eventUpdate = (event: vscode.Uri) => {
		var filePath = event.fsPath.replace(".err", ".rpt");
		diagnosticsProvider.onDidCreateOrChange(filePath);
		fileExplorer.refresh();
		kleioExplorer.refresh(filePath);
	};
	watcher.onDidCreate(eventUpdate);
	watcher.onDidChange(eventUpdate);

	// watch cli creation/deletion from file system
	var watcherCli = vscode.workspace.createFileSystemWatcher("**/*.cli");
	var eventUpdateCli = (event: vscode.Uri) => {
		// fileExplorer.refresh();
		// kleioExplorer.refresh(event.fsPath);
	};
	watcherCli.onDidCreate(eventUpdateCli);
	watcherCli.onDidDelete(eventUpdateCli);

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

	// delete Cli and generated files
	disposable = vscode.commands.registerCommand('extension.deleteCliFile', (event) => {
		if (event) {
			// command called via right click
			fileExplorer.deleteCliAndRelated(event.uri, true);
		}
	});
	context.subscriptions.push(disposable);


	// delete generated files
	disposable = vscode.commands.registerCommand('extension.deleteGeneratedFiles', (event) => {
		if (event) {
			// command called via right click
			fileExplorer.deleteCliAndRelated(event.uri, false);
		}
	});
	context.subscriptions.push(disposable);


	// translate all files in directory
	disposable = vscode.commands.registerCommand('extension.translateAllFiles', (event) => {
		if (event) {
			// command called via right click
			diagnosticsProvider.translateAllFiles(event.uri.path);
		}
	});
	context.subscriptions.push(disposable);


	disposable = vscode.commands.registerCommand('extension.reloadTranslationInfo', (event) => {
		fileExplorer.refresh();
		kleioExplorer.refresh();
	});
	context.subscriptions.push(disposable);

	// `window.createView`
	fileExplorer = new FileExplorer(context);
	kleioExplorer = new KleioStatusExplorer(context);

	vscode.workspace.onDidChangeConfiguration(event => {
		let affectedKleioServer = event.affectsConfiguration("timelink.kleio.kleioServerUrl")
			|| event.affectsConfiguration("timelink.kleio.kleioServerToken")
			|| event.affectsConfiguration("timelink.kleio.kleioServerHome");
		if (affectedKleioServer) {
			KleioServiceModule.KleioService.getInstance().init();
		}
	});
}

// this method is called when your extension is deactivated
export function deactivate() { }

