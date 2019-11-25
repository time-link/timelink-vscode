import * as vscode from 'vscode';
import { languages, Diagnostic, DiagnosticSeverity } from 'vscode';

export module DiagnosticsProvider {
	let diagnosticCollection = languages.createDiagnosticCollection("kleio");
	let diagnostics: Diagnostic[] = [];

	export class Diagnostics {

		constructor() {
		}

		onDidOpenTextDocument(document: vscode.TextDocument) {
			const cliFile = document.fileName;
			const errFile = document.fileName.replace(".cli", ".rpt");
			// open error .rpt file
			vscode.workspace.openTextDocument(errFile).then((errorDocument) => {
				this.getDiagnosticsContent(document.uri, errorDocument.getText(), document.getText());
			});
		}

		onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
			if (event.document.isClosed || !event.document.isDirty) {
				const cliFile = event.document.fileName;
				const errFile = event.document.fileName.replace(".cli", ".rpt");
				// open error .rpt file
				vscode.workspace.openTextDocument(errFile).then((errorDocument) => {
					this.getDiagnosticsContent(event.document.uri, errorDocument.getText(), event.document.getText());
				});
			}
		}

		extractLine(text: string) {
			var rx = / line ([0-9]+) /g;
			var arr = rx.exec(text);
			if (arr !== null) {
				const length = (arr as RegExpExecArray).length;
				return arr[length - 1];
			}
		}

		getDiagnosticsContent(documentUri: vscode.Uri, text: string, docText: string) {
			// diagnosticCollection.clear();
			diagnostics = [];
			const docLines = docText.split(/\r?\n/);
			text.split(/\r?\n/).forEach(element => {
				if (element.startsWith("ERROR:") || element.startsWith("WARNING:")) {
					//console.log(">: " + element);
					const severity = (element.startsWith("ERROR:")) ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;
					const tmp = this.extractLine(element);
					if (tmp !== undefined) {
						const line = Number(tmp) - 1;
						const lineText = docLines[line - 1];
						console.log(lineText);
						const start = lineText.length - lineText.trimLeft().length;
						this.setDiagnosticsContent(documentUri, element, severity, line,  start, docLines[line - 1].length); // rpt file returns on line more...
					}
				}
			});
		}

		setDiagnosticsContent(documentUri: vscode.Uri, text: string, severity: vscode.DiagnosticSeverity, line: number, start: number, end: number) {
			//let diagnostics: Diagnostic[] = [];
			const range = new vscode.Range(new vscode.Position(line - 1, start), new vscode.Position(line - 1, end));
			diagnostics.push(new Diagnostic(range, text, severity));
			diagnosticCollection.set(documentUri, diagnostics);
		}

		// see https://code.visualstudio.com/api/references/vscode-api#DiagnosticCollection
	}
}