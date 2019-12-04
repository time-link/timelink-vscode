import * as vscode from 'vscode';
import * as fs from 'fs';
import { languages, Diagnostic, DiagnosticSeverity } from 'vscode';
import * as path from 'path';

/*
* Loads and displays errors from kleio rpt files
* Initiates translations by calling Kleio RPC server
* More about on [Diagnostic](https://code.visualstudio.com/api/references/vscode-api#DiagnosticCollection)
*/
export module DiagnosticsProvider {

	let diagnosticCollection = languages.createDiagnosticCollection("kleio");
	let diagnostics: Diagnostic[] = [];
	
	export class Diagnostics {

		constructor() { }

		/*
		 * Returns Kleio admin token from mhk_system.properties
		 */
		loadAdminToken(basePath: string): Promise<string> {
			return new Promise<string>((resolve) => {
				let propertiesPath = basePath + "/system/conf/mhk_system.properties";
				vscode.workspace.openTextDocument(propertiesPath).then((document) => {
					document.getText().split(/\r?\n/).forEach(element => {
						if (element.startsWith("mhk.kleio.service.token.admin=")) {
							resolve(element.replace("mhk.kleio.service.token.admin=", ""));
						}
					});
				});
			});
		}

		/*
		 * Calls Kleio Translation Service API with a POST request
		 */
		callTranslationService(filePath: string, token: string) {
			var rp = require('request-promise');
			var options = {
				method: 'POST',
				uri: 'http://localhost:8088/json/',
				body: {
					"jsonrpc": "2.0",
					"method": "translations_translate",
					"params": {
						"path": filePath, // e.g. "sources/demo_sources/soure/example3.cli", 
						"spawn": "no",
						"token": token // e.g. "29434098633feb3f8869a9ec9cdeb88cf8b0072f"
					},
					"id": 1987 // ???
				},
				json: true
			};
			rp(options)
				.then(function (parsedBody: any) {
					if (!parsedBody.error) {
						let message = "Kleio translation started: " + path.basename(filePath);
						vscode.window.showInformationMessage(message);
					} else {
						let message = "Error calling Kleio translation service: " + parsedBody.error.message;
						vscode.window.showErrorMessage(message);
						console.log(parsedBody.error);
					}
				})
				.catch(function (err: any) {
					console.error("Couldn't connect to Kleio Server...");
				});
		}

		translateFile(file: string) {
			if (file.includes("/sources/")) {
				let tmp = file.split("/sources/");
				let basePath = tmp[0];
				let cliPath = path.join("sources", tmp[1]);
				this.loadAdminToken(basePath).then((token) => {
					this.callTranslationService(cliPath, token);
				});
			}
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
						this.setDiagnosticsContent(cliDocumentUri, element, severity, line, start, docLines[line-1].length); // docLines starts at zero! 
					}
				}
			});
		}

		setDiagnosticsContent(documentUri: vscode.Uri, text: string, severity: vscode.DiagnosticSeverity, line: number, start: number, end: number) {
			const range = new vscode.Range(new vscode.Position(line - 1, start), new vscode.Position(line - 1, end));
			diagnostics.push(new Diagnostic(range, text, severity));
			diagnosticCollection.set(documentUri, diagnostics);
		}
	}
}