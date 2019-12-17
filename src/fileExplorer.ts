import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
//import * as mkdirp from 'mkdirp';
//import * as rimraf from 'rimraf';
import { DiagnosticsProvider } from './diagnostics';
import { KleioServiceModule } from './kleioService';

//#region Utilities

namespace _ {

	function handleResult<T>(resolve: (result: T) => void, reject: (error: Error) => void, error: Error | null | undefined, result: T): void {
		if (error) {
			reject(massageError(error));
		} else {
			resolve(result);
		}
	}

	function massageError(error: Error & { code?: string }): Error {
		if (error.code === 'ENOENT') {
			return vscode.FileSystemError.FileNotFound();
		}

		if (error.code === 'EISDIR') {
			return vscode.FileSystemError.FileIsADirectory();
		}

		if (error.code === 'EEXIST') {
			return vscode.FileSystemError.FileExists();
		}

		if (error.code === 'EPERM' || error.code === 'EACCESS') {
			return vscode.FileSystemError.NoPermissions();
		}

		return error;
	}

	export function checkCancellation(token: vscode.CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new Error('Operation cancelled');
		}
	}

	export function normalizeNFC(items: string): string;
	export function normalizeNFC(items: string[]): string[];
	export function normalizeNFC(items: string | string[]): string | string[] {
		if (process.platform !== 'darwin') {
			return items;
		}

		if (Array.isArray(items)) {
			return items.map(item => item.normalize('NFC'));
		}

		return items.normalize('NFC');
	}

	export function readdir(path: string): Promise<string[]> {
		return new Promise<string[]>((resolve, reject) => {
			fs.readdir(path, (error, children) => handleResult(resolve, reject, error, normalizeNFC(children)));
		});
	}

	export function stat(path: string): Promise<fs.Stats> {
		return new Promise<fs.Stats>((resolve, reject) => {
			fs.stat(path, (error, stat) => handleResult(resolve, reject, error, stat));
		});
	}

	export function readfile(path: string): Promise<Buffer> {
		return new Promise<Buffer>((resolve, reject) => {
			fs.readFile(path, (error, buffer) => handleResult(resolve, reject, error, buffer));
		});
	}

	export function writefile(path: string, content: Buffer): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.writeFile(path, content, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function exists(path: string): Promise<boolean> {
		return new Promise<boolean>((resolve, reject) => {
			fs.exists(path, exists => handleResult(resolve, reject, null, exists));
		});
	}

	export function rmrf(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			//rimraf(path, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function mkdir(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			//mkdirp(path, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function rename(oldPath: string, newPath: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.rename(oldPath, newPath, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function unlink(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.unlink(path, error => handleResult(resolve, reject, error, void 0));
		});
	}
}

export class FileStat implements vscode.FileStat {

	constructor(private fsStat: fs.Stats) { }

	get type(): vscode.FileType {
		return this.fsStat.isFile() ? vscode.FileType.File : this.fsStat.isDirectory() ? vscode.FileType.Directory : this.fsStat.isSymbolicLink() ? vscode.FileType.SymbolicLink : vscode.FileType.Unknown;
	}

	get isFile(): boolean | undefined {
		return this.fsStat.isFile();
	}

	get isDirectory(): boolean | undefined {
		return this.fsStat.isDirectory();
	}

	get isSymbolicLink(): boolean | undefined {
		return this.fsStat.isSymbolicLink();
	}

	get size(): number {
		return this.fsStat.size;
	}

	get ctime(): number {
		return this.fsStat.ctime.getTime();
	}

	get mtime(): number {
		return this.fsStat.mtime.getTime();
	}
}

export interface Entry {
	uri: vscode.Uri;
	type: vscode.FileType;
}

//#endregion

export class FileSystemProvider implements vscode.TreeDataProvider<Entry>, vscode.FileSystemProvider {
	private diagnosticsProvider: DiagnosticsProvider.Diagnostics = new DiagnosticsProvider.Diagnostics();
	//private kleioService: KleioServiceModule.KleioService = new KleioServiceModule.KleioService();
	private kleioService = KleioServiceModule.KleioService.getInstance();

	private _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]>;
	
	private _onDidChangeTreeData: vscode.EventEmitter<any> = new vscode.EventEmitter<any>();
	readonly onDidChangeTreeData: vscode.Event<any> = this._onDidChangeTreeData.event;

	private status?: string;
	
	private files: any = [];
	//private entries: [Entry] = [];
	private entries: { [id: string] : vscode.TreeItem; } = {};
	private status_codes: { [id: string] : string } = { 
		"E": "With errors", 
		"V": "Ready for import", 
		"W": "With warnings",
		"T": "Needs translation",
		"P": "Translating",
		"I": "Needs import",
		"Q": "Queued"
	};

	constructor(status?: string) {
		this.status = status;
		this._onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

		this.kleioService.loadAdminToken().then(() => {
			this.kleioService.translationsGet().then((response) => {
				if (response.result) {
					this.files = response.result;
					console.log("refresh file explorer");
					this.refresh();
				}
			});
		});
	}

	public refresh(): any {
		// refreh only current node?
		// https://github.com/Microsoft/vscode/issues/62798
		this._onDidChangeTreeData.fire();
	}

	get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
		return this._onDidChangeFile.event;
	}

	watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
		const watcher = fs.watch(uri.fsPath, { recursive: options.recursive }, async (event: string, filename: string | Buffer) => {
			const filepath = path.join(uri.fsPath, _.normalizeNFC(filename.toString()));

			// TODO support excludes (using minimatch library?)

			this._onDidChangeFile.fire([{
				type: event === 'change' ? vscode.FileChangeType.Changed : await _.exists(filepath) ? vscode.FileChangeType.Created : vscode.FileChangeType.Deleted,
				uri: uri.with({ path: filepath })
			} as vscode.FileChangeEvent]);
		});

		return { dispose: () => watcher.close() };
	}

	stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
		return this._stat(uri.fsPath);
	}

	async _stat(path: string): Promise<vscode.FileStat> {
		return new FileStat(await _.stat(path));
	}

	readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
		return this._readDirectory(uri);
	}

	async _readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const children = await _.readdir(uri.fsPath);

		const result: [string, vscode.FileType][] = [];
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const stat = await this._stat(path.join(uri.fsPath, child));
			result.push([child, stat.type]);
		}

		return Promise.resolve(result);
	}

	createDirectory(uri: vscode.Uri): void | Thenable<void> {
		return _.mkdir(uri.fsPath);
	}

	readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
		return _.readfile(uri.fsPath);
	}

	writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
		return this._writeFile(uri, content, options);
	}

	async _writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Promise<void> {
		const exists = await _.exists(uri.fsPath);
		if (!exists) {
			if (!options.create) {
				throw vscode.FileSystemError.FileNotFound();
			}

			await _.mkdir(path.dirname(uri.fsPath));
		} else {
			if (!options.overwrite) {
				throw vscode.FileSystemError.FileExists();
			}
		}

		return _.writefile(uri.fsPath, content as Buffer);
	}

	delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
		if (options.recursive) {
			return _.rmrf(uri.fsPath);
		}

		return _.unlink(uri.fsPath);
	}

	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
		return this._rename(oldUri, newUri, options);
	}

	async _rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): Promise<void> {
		const exists = await _.exists(newUri.fsPath);
		if (exists) {
			if (!options.overwrite) {
				throw vscode.FileSystemError.FileExists();
			} else {
				await _.rmrf(newUri.fsPath);
			}
		}

		const parentExists = await _.exists(path.dirname(newUri.fsPath));
		if (!parentExists) {
			await _.mkdir(path.dirname(newUri.fsPath));
		}

		return _.rename(oldUri.fsPath, newUri.fsPath);
	}

	// tree data provider

	async getChildren(element?: Entry): Promise<Entry[]> {
		
		// element children
		if (element) {
			var children2 = (await this.readDirectory(element.uri))
					.filter(([name, type]) => !name.startsWith("."));

			// testing filters....
			children2 = children2.filter(([name, type]) => {
				let uri = vscode.Uri.file(path.join(element.uri.fsPath, name));
				let file = this.files.filter((el: { path: string; }) => uri.path.endsWith(el.path));
				console.log(">" + name);
				if (type === vscode.FileType.Directory) {
					return this;
				} else if (file.length > 0 && file[0].status === this.status) {
					// console.log("FOUND status " + file[0].status);
					return this;
				} else if (!this.status) {
					return this;
				}
			});
			

			children2.sort((a, b) => {
				if (a[1] === b[1]) {
					return a[0].localeCompare(b[0]);
				}
				return a[1] === vscode.FileType.Directory ? -1 : 1;
			});

			return children2.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(element.uri.fsPath, name)), type }));
		}

		// workspace root folders
		if (vscode.workspace.workspaceFolders !== undefined) {



			const workspaceFolder = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];
			var children = (await this.readDirectory(workspaceFolder.uri))
					.filter(([name, type]) => !name.startsWith("."));

			children = children.sort((a, b) => {
				if (a[1] === b[1]) {
					return a[0].localeCompare(b[0]);
				}
				return a[1] === vscode.FileType.Directory ? -1 : 1;
			});

			return children.map(([name, type]) => ({
				 	uri: vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, name)), type }));
		}

		return [];
	}

	getTreeItem(element: Entry): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(element.uri, element.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
		
		///?????
		/*if (this.entries[element.uri.path]) {
			console.log("Tree item exists!");
		} else {
			this.entries[element.uri.path] = treeItem;
		}*/

		if (element.type === vscode.FileType.File) {
			treeItem.command = { command: 'fileExplorer.openFile', title: "Open File", arguments: [element.uri], };
			treeItem.contextValue = 'file';

			if (element.uri.path.endsWith(".cli")) {
				treeItem.contextValue = "fileCli";
				// get errors from rpt file
				this.diagnosticsProvider.loadErrorsForCli(element.uri.path);

				// get file status from kleio server
				let file = this.files.filter((el: { path: string; }) => element.uri.path.endsWith(el.path));
				if (file.length > 0) {
					treeItem.description = this.status_codes[file[0].status];

					//treeItem.id = "";
					//console.log(">>" + treeItem.id);
					treeItem.iconPath = {
						light: path.join(__filename, '..', '..', 'resources', 'light', 'file.png'),
						dark: path.join(__filename, '..', '..', 'resources', 'dark', 'file.png')
					};
				}
			}
		}

		return treeItem;
	}
}

export class FileExplorer {
	private myTreeDataProvider: FileSystemProvider;

	private fileExplorer: vscode.TreeView<Entry>;
	private translationNeededExplorer: vscode.TreeView<Entry>;
	private importReadyExplorer: vscode.TreeView<Entry>;
	private fileWithWarningsExplorer: vscode.TreeView<Entry>;
	private fileWithErrorsExplorer: vscode.TreeView<Entry>;
	//private fileWithImportErrorsExplorer: vscode.TreeView<Entry>;

	constructor(context: vscode.ExtensionContext) {

		var treeDataProvider = new FileSystemProvider("T");		
		this.translationNeededExplorer = vscode.window.createTreeView('translationNeededExplorer', { treeDataProvider });
		
		treeDataProvider = new FileSystemProvider("V");		
		this.importReadyExplorer = vscode.window.createTreeView('importReadyExplorer', { treeDataProvider });
		
		treeDataProvider = new FileSystemProvider("W");		
		this.fileWithWarningsExplorer = vscode.window.createTreeView('fileWithWarningsExplorer', { treeDataProvider });
		
		treeDataProvider = new FileSystemProvider("E");		
		this.fileWithErrorsExplorer = vscode.window.createTreeView('fileWithErrorsExplorer', { treeDataProvider });
		
		//this.treeDataProvider = new FileSystemProvider("E");		
		//this.fileWithImportErrorsExplorer = vscode.window.createTreeView('fileWithImportErrorsExplorer', { treeDataProvider });

		// all files
		treeDataProvider = new FileSystemProvider();		
		this.fileExplorer = vscode.window.createTreeView('fileExplorer', { treeDataProvider });
		
		this.myTreeDataProvider = treeDataProvider;

		vscode.commands.registerCommand('fileExplorer.openFile', (resource) => this.openResource(resource));
	}

	private openResource(resource: vscode.Uri): void {
		vscode.window.showTextDocument(resource);
	}

	public refresh(): void {
		this.myTreeDataProvider.refresh();
	}
}