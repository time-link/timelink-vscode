import * as vscode from 'vscode';
import * as fs from 'fs';
import { languages, Diagnostic, DiagnosticSeverity } from 'vscode';
import * as path from 'path';
import { KleioServiceModule } from './kleioService';

/*
* Loads and displays errors from kleio rpt files
* Initiates translations by calling Kleio RPC server
* More about on [Diagnostic](https://code.visualstudio.com/api/references/vscode-api#DiagnosticCollection)
*/
export module DiagnosticsProvider {
	
	let kleioService = KleioServiceModule.KleioService.getInstance();
	//let kleioService: KleioServiceModule.KleioService = new KleioServiceModule.KleioService();
	let diagnosticCollection = languages.createDiagnosticCollection("kleio");
	let diagnostics: Diagnostic[] = [];

	export class Diagnostics {

		constructor() { }

		translateFile(file: string) {
			kleioService.translationsTranslate(file).then((response: any) => {
				if (!response.error) {
					let message = "Kleio translation started: " + path.basename(file);
					vscode.window.showInformationMessage(message);
				} else {
					let message = "Error calling Kleio translation service: " + response.error.message;
					vscode.window.showErrorMessage(message);
					console.log(response.error);
				}
			}).catch(error => {
				console.log(error);
			});
		}

		loadErrorsForCli(filePath: string) {
			const cliFile = filePath;
			const errFile = filePath.replace(path.extname(filePath), ".rpt");
			if (fs.existsSync(errFile)) {
				var errorDocument = fs.readFileSync(errFile, 'utf8');
				vscode.workspace.openTextDocument(cliFile).then((cliDocument) => {
					this.getDiagnosticsContent(cliDocument.uri, errorDocument, cliDocument.getText());
				});
			}
		}

		onDidCreateOrChange(filePath: string) {
			let errFilePath = filePath;
			let cliFilePath = filePath.replace(path.extname(filePath), ".cli");
			var cliFileStats = fs.statSync(cliFilePath);
			var errFileStats = fs.statSync(errFilePath);
			if (errFileStats.mtimeMs >= cliFileStats.mtimeMs) {
				let message = "Kleio translation completed: " + path.basename(cliFilePath);
				vscode.window.showInformationMessage(message);
				this.loadErrorsForCli(cliFilePath);
			}
		}

		// NOTE: using fs readFileSync because of this issue
		// with openTextDocument partial error file is returned sometimes... 
		//vscode.workspace.openTextDocument(errFile).then((errorDocument) => {
		//	this.getDiagnosticsContent(document.uri, errorDocument.getText(), document.getText());
		//});
		onDidOpenTextDocument(document: vscode.TextDocument) {
			// open error .rpt file
			const errFile = document.fileName.replace(path.extname(document.fileName), ".rpt");
			if (fs.existsSync(errFile)) {
				var errorDocument = fs.readFileSync(errFile, 'utf8');
				this.getDiagnosticsContent(document.uri, errorDocument, document.getText());
			}
		}

		onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
			if (event.document.isClosed || !event.document.isDirty) {
				// doing nothing now...
			}
		}

		extractLineNumber(text: string) {
			var rx = / line ([0-9]+) /g;
			var arr = rx.exec(text);
			if (arr !== null) {
				const length = (arr as RegExpExecArray).length;
				return arr[length - 1];
			}
		}

		getDiagnosticsContent(cliDocumentUri: vscode.Uri, errorText: string, cliText: string) {
			diagnostics = [];
			const docLines = cliText.split(/\r?\n/);
			errorText.split(/\r?\n/).forEach(element => {
				if (element.startsWith("ERROR:") || element.startsWith("WARNING:")) {
					const severity = (element.startsWith("ERROR:")) ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;
					const tmp = this.extractLineNumber(element);
					if (tmp !== undefined) {
						var line = Number(tmp);
						var lineText = docLines[line - 1];
						// Avoiding lines with empty spaces and putting the error on first line before.
						while (line > 1 && lineText.trim().length === 0) {
							line = line - 1;
							lineText = docLines[line - 1];
						}
						const start = lineText.length - lineText.trimLeft().length;
						this.setDiagnosticsContent(cliDocumentUri, element, severity, line, start, docLines[line - 1].length); // docLines starts at zero! 
					}
				}
				
				if (diagnostics.length === 0) {
					this.clearDiagnosticsContent(cliDocumentUri);
				}
			});
		}

		setDiagnosticsContent(documentUri: vscode.Uri, text: string, severity: vscode.DiagnosticSeverity, line: number, start: number, end: number) {
			const range = new vscode.Range(new vscode.Position(line - 1, start), new vscode.Position(line - 1, end));
			diagnostics.push(new Diagnostic(range, text, severity));
			diagnosticCollection.set(documentUri, diagnostics);
		}

		clearDiagnosticsContent(documentUri: vscode.Uri) {
			diagnosticCollection.set(documentUri, diagnostics);
		}
	}
}