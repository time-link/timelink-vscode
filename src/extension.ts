// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';

import { HoverProvider } from "./hover";
import { FormattingProvider } from "./formatting";
import { CompletionProvider } from "./completion";
import { StatusProvider } from './statusProvider';
import { DiagnosticsProvider } from './diagnostics';
import { FileExplorer } from './fileExplorer';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const hoverProvider: HoverProvider.HoverContent = new HoverProvider.HoverContent(context);
	const formattingProvider: FormattingProvider.Formatting = new FormattingProvider.Formatting();
	const completionProvider: CompletionProvider.Completion = new CompletionProvider.Completion();
	const diagnosticsProvider: DiagnosticsProvider.Diagnostics = new DiagnosticsProvider.Diagnostics();

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "kleio" is now active!');
	
	vscode.workspace.onDidChangeWorkspaceFolders(event => {
		console.log("onDidChangeWorkspaceFolders" + event);
	});

	vscode.workspace.onDidChangeTextDocument(event => {
		console.log("onDidChangeTextDocument" + event);
		if (event.document.fileName.endsWith(".cli")) {
			diagnosticsProvider.onDidChangeTextDocument(event);
		}
	});

	vscode.workspace.onDidOpenTextDocument(document => {
		console.log("onDidOpenTextDocument");
		if (document.fileName.endsWith(".cli")) {
			diagnosticsProvider.onDidOpenTextDocument(document);
		}
	});

	vscode.workspace.onWillSaveTextDocument(event => {
		console.log("onWillSaveTextDocument");
		const cliFile = event.document.fileName;
		const errFile = event.document.fileName.replace(".cli", ".rpt");

		var cliFileStats = fs.statSync(cliFile);
		var errFileStats = fs.statSync(errFile);

		if (cliFileStats.mtimeMs > errFileStats.mtimeMs) {
			// cli file changed since last translation... ignore error file
			return;
		}

		// open error .rpt file
		vscode.workspace.openTextDocument(errFile).then((document) => {
			diagnosticsProvider.getDiagnosticsContent(event.document.uri, document.getText(), event.document.getText());
		});
	});

	// Samples of `window.registerTreeDataProvider`
	if (vscode.workspace.rootPath !== undefined) {
		const statusProvider = new StatusProvider(vscode.workspace.rootPath);
		vscode.window.registerTreeDataProvider('statusProvider', statusProvider);
	}

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
			console.log(tokenText);
			return completionProvider.getCompletionContent(tokenText);
		}
	});

	// 👍 formatter implemented using API
	vscode.languages.registerDocumentFormattingEditProvider('kleio', {
		provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
			return formattingProvider.getChanges(document);
		}
	});

	// `window.createView`
	new FileExplorer(context);
}

// this method is called when your extension is deactivated
export function deactivate() { }
