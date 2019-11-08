import * as vscode from 'vscode';
// import * as fs from 'fs';
// import * as path from 'path';

export class StatusProvider implements vscode.TreeDataProvider<Status> {

	private _onDidChangeTreeData: vscode.EventEmitter<Status | undefined> = new vscode.EventEmitter<Status | undefined>();
	readonly onDidChangeTreeData: vscode.Event<Status | undefined> = this._onDidChangeTreeData.event;

	constructor(private workspaceRoot: string) {
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: Status): vscode.TreeItem {
		return element;
	}

	getChildren(element?: Status): Thenable<Status[]> {
		if (!this.workspaceRoot) {
			vscode.window.showInformationMessage('No status in empty workspace');
			return Promise.resolve([]);
		}

		return Promise.resolve([
			new Status("Available Soon!", "Stay tuned!", vscode.TreeItemCollapsibleState.None, {
				command: 'extension.openPackageOnNpm',
				title: '',
				arguments: ["moduleName"]
			})
		]);
	}
}

export class Status extends vscode.TreeItem {

	constructor(
		public readonly label: string,
		private version: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command
	) {
		super(label, collapsibleState);
	}

	get tooltip(): string {
		return `${this.label}-${this.version}`;
	}

	get description(): string {
		return this.version;
	}

	/*iconPath = {
		light: path.join(__filename, '..', '..', 'resources', 'light', 'dependency.svg'),
		dark: path.join(__filename, '..', '..', 'resources', 'dark', 'dependency.svg')
	};*/

	contextValue = 'status';
}