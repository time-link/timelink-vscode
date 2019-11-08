// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { HoverProvider } from "./hover";
import { FormattingProvider } from "./formatting";
import { CompletionProvider } from "./completion";
import { StatusProvider } from './statusProvider';
import { FileExplorer } from './fileExplorer';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const hoverProvider: HoverProvider.HoverContent = new HoverProvider.HoverContent(context);
	const formattingProvider: FormattingProvider.Formatting = new FormattingProvider.Formatting();
	const completionProvider: CompletionProvider.Completion = new CompletionProvider.Completion();
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "kleio" is now active!');

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
export function deactivate() {}
