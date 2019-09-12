// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "tmp" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World!!!');
	});

	context.subscriptions.push(disposable);

	// 👎 formatter implemented as separate command
	/*vscode.commands.registerCommand('extension.format-foo', () => {
		const {activeTextEditor} = vscode.window;

		if (activeTextEditor && activeTextEditor.document.languageId === 'kleio') {
			const {document} = activeTextEditor;
			const firstLine = document.lineAt(0);
			if (firstLine.text !== '42') {
				const edit = new vscode.WorkspaceEdit();
				edit.insert(document.uri, firstLine.range.start, '42\n');
				return vscode.workspace.applyEdit(edit)
			}
		}
	});*/

    // 👍 formatter implemented using API
    vscode.languages.registerDocumentFormattingEditProvider('kleio', {
        provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
			var changes:vscode.TextEdit[] = new Array();
			var ind = "   ";
			var previousLine;
			for (let line = 0; line < document.lineCount; line++) {
				const element = document.lineAt(line);
				var text = element.text
					.replace(/^\s*kleio\$/g, "kleio$")
					.replace(/^\s*fonte\$/g, ind + "fonte$")
					.replace(/^\s*(bap|b|cas|obito|o)\$/g, ind + ind + "$1\$")
					.replace(/^\s*(n|noivo|noiva|test)\$/g, ind + ind + ind + "$1\$")
					.replace(/^\s*(pai|pn|mae|mn|pad1|pad|mad1|mad|pnoivo|pnoiva)\$/g, ind + ind + ind + ind + "$1\$")
					.replace(/^\s*(ppad|pmad)\$/g, ind + ind + ind + ind + ind + "$1\$");

				changes.push(vscode.TextEdit.replace(element.range, text));

				if (element.text.indexOf("ls$") >= 0 && previousLine != null) {
					var spaces = previousLine.match(/^(\s+)/);
					if (spaces != null) {
						changes.push(vscode.TextEdit.replace(element.range, 
							element.text.replace(/^\s*(ls)\$/g, spaces.slice(1) + ind + "$1\$")))
					}
				} else {
					previousLine = text;
				}
			}
			return changes;
        }
    });
}

// this method is called when your extension is deactivated
export function deactivate() {}
