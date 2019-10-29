// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { HoverProvider } from "./hover";
import { FormattingProvider } from "./formatting";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const hoverProvider: HoverProvider.HoverContent = new HoverProvider.HoverContent(context);
	const formattingProvider: FormattingProvider.Formatting = new FormattingProvider.Formatting();
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "kleio" is now active!');

	// Registering to provide Hover Content
	// Hover content is managed by hover.ts classes
	vscode.languages.registerHoverProvider('kleio', {
		provideHover(document, position, token) {
			return hoverProvider.getHoverContent(document, position, token);
		}
	});

	// 👍 formatter implemented using API
    vscode.languages.registerDocumentFormattingEditProvider('kleio', {
        provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
			return formattingProvider.getChanges(document);
        }
    });
}

// this method is called when your extension is deactivated
export function deactivate() {}
