import * as vscode from 'vscode';
import * as fs from 'fs';
import { languages, Diagnostic, DiagnosticSeverity } from 'vscode';
import { FileExplorer, Entry } from './fileExplorer';
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

		constructor() {}

		loadAdminToken(file: string) {
			let tmp = file.split("/mhk-home/");
			if (tmp.length > 1) {
				let cliPath = tmp[1];
				let propertiesPath = tmp[0] + "/mhk-home/system/conf/mhk_system.properties";
				vscode.workspace.openTextDocument(propertiesPath).then((document) => {
					document.getText().split(/\r?\n/).forEach(element => {
						if (element.startsWith("mhk.kleio.service.token.admin=")) {
							let token = element.replace("mhk.kleio.service.token.admin=", "");
							this.callTranslationService(cliPath, token);
						}
					});
				});
			}
		}

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
					  "spawn":"no",
					  "token": token // e.g. "29434098633feb3f8869a9ec9cdeb88cf8b0072f"
				  },
				  "id": 1987 // ???
				},
				json: true
			};

			rp(options)
				.then(function (parsedBody: any) {
					let message = "Kleio translation started: " + path.basename(filePath);
					vscode.window.showInformationMessage(message);
				})
				.catch(function (err: any) {
					console.error("Couldn't connect to Kleio Server...");
				});
		}

		translateFile(file: string) {
			if (file.includes("/mhk-home/")) {
				this.loadAdminToken(file);
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
			// diagnosticCollection.clear();
			diagnostics = [];
			const docLines = cliText.split(/\r?\n/);
			errorText.split(/\r?\n/).forEach(element => {
				if (element.startsWith("ERROR:") || element.startsWith("WARNING:")) {
					const severity = (element.startsWith("ERROR:")) ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;
					const tmp = this.extractLineNumber(element);
					if (tmp !== undefined) {
						const line = Number(tmp) ;
						const lineText = docLines[line - 1];
						const start = lineText.length - lineText.trimLeft().length;
						this.setDiagnosticsContent(cliDocumentUri, element, severity, line,  start, docLines[line].length); // rpt file returns on line more...
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