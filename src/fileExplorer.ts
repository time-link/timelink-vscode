import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DiagnosticsProvider } from './diagnostics';
import { KleioServiceModule } from './kleioService';

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

export class KleioStatus {
	private static instance: KleioStatus;
	protected kleioService = KleioServiceModule.KleioService.getInstance();
	protected files: any = [];
	protected fetched: string[] = [];
	protected cachedDirs: { [status: string]: [string]; } = {};
	protected placeHolderMessage: string = "";

	static getInstance(): KleioStatus {
		if (!KleioStatus.instance) {
			KleioStatus.instance = new KleioStatus();
		}
		return KleioStatus.instance;
	}

	getFiles() {
		return this.files;
	}

	getFetched() {
		return this.fetched;
	}

	getCachedDirs() {
		return this.cachedDirs;
	}

	getPlaceHolderMessage() {
		return this.placeHolderMessage;
	}

	clear() {
		this.files = [];
		this.fetched = [];
		this.cachedDirs = {};
	}

	/*
	 * Loads Translation Status from Kleio Server
	 * and caches directories that contains files in each status (E,T,etc)
	 */
	async _loadTranslationInfoStatus(fpath: string, status: string, caller: () => void) {
		await this.kleioService.translationsGet(fpath, status).then((response) => {
			console.log("Got Kleio Status: " + fpath + " for: " + status);
			if (!response.result) {
				return;
			}
			this.files = this.files.concat(response.result.filter((item: any) => this.files.indexOf(item) < 0));
			if (status !== "") {
				response.result.forEach((element: any) => {
					// add folder to dirs list
					if (this.cachedDirs[status].indexOf("/".concat(element.directory)) < 0) {
						this.cachedDirs[status].push("/".concat(element.directory));
					}
					// add all parent folders to dirs list
					let comps = path.dirname(element.directory).split(path.sep);
					while (comps.length > 0) {
						let subPath = "/".concat(comps.join(path.sep));
						if (this.cachedDirs[status].indexOf(subPath) < 0) {
							this.cachedDirs[status].push(subPath);
						}
						comps.pop();
					}
				});
			}
			this.fetched.push(fpath);
			caller();
			this.placeHolderMessage = "0 files";
			console.log("LOADED status for " + status);
		});
	}
	
	loadTranslationInfoStatus(fpath: string, status: string, caller: () => void) {
		if (this.fetched.indexOf(fpath) < 0) {
			console.log("Load Kleio Status: " + fpath + " for: " + status);
			if (!this.cachedDirs[status]) {
				this.cachedDirs[status] = [""];
			}
			this.placeHolderMessage = "Loading Status from Kleio Server…";
			vscode.window.withProgress({
					location: vscode.ProgressLocation.Window,
					title: this.placeHolderMessage
				},
				async () => {	
					await this._loadTranslationInfoStatus(fpath, status, caller).then(undefined, err => {
						this.handleServerError(err);
					});
				});
		} else {
			caller();
		}
	}

	handleServerError(err: { code: string; }) {
		if (err.code === 'ECONNREFUSED') {
			this.placeHolderMessage = "Connection refused by Kleio Server.";
		} else {
			this.placeHolderMessage = "Kleio Server error.";
		}
	}

	/*
	 * Loads Translation Info from Kleio Server
	 */
	loadTranslationInfo(fpath: string, caller: () => void) {
		if (fpath === "") {
			this.clear();
		}
		if (this.fetched.indexOf(fpath) < 0) {
			this.kleioService.translationsGet(fpath, "").then((response) => {
				if (response && response.result) {
					this.files = this.files.concat(response.result.filter((item: any) => this.files.indexOf(item) < 0));
					//this.files = this.files.concat(response.result);
					this.fetched.push(fpath);
					caller();
				}
			}).then(undefined, err => {
				this.handleServerError(err);
			});
		} else {
			caller();
		}
	}
}

export class KleioEntry extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public uri: vscode.Uri,
		public type: vscode.FileType,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command,
		public count: Number = -1
	) {
		super(label, collapsibleState);
		if (type === vscode.FileType.File) { // file
			this.collapsibleState = vscode.TreeItemCollapsibleState.None;
			this.contextValue = 'fileCli';
			this.iconPath = {
				light: path.join(__filename, '..', '..', 'resources', 'light', 'file.png'),
				dark: path.join(__filename, '..', '..', 'resources', 'dark', 'file.png')
			};
			this.command = { command: 'fileExplorer.openKleioFile', title: "Open File", arguments: [uri], };
		}
	}
}

export class PlaceholderEntry extends KleioEntry {
	constructor(
		public readonly label: string
	) {
		super(label, vscode.Uri.file("dummy_file"), vscode.FileType.Unknown, vscode.TreeItemCollapsibleState.None);
		this.contextValue = 'PlaceholderEntry';
		if (label !== '0 files') {
			this.iconPath = {
				light: path.join(__filename, '..', '..', 'resources', 'light', 'warning.png'),
				dark: path.join(__filename, '..', '..', 'resources', 'dark', 'warning.png')
			};
		}
	}
}

export class FileSystemProvider implements vscode.TreeDataProvider<Entry>, vscode.FileSystemProvider {
	protected kleioStatus: KleioStatus = KleioStatus.getInstance();
	protected diagnosticsProvider: DiagnosticsProvider.Diagnostics = new DiagnosticsProvider.Diagnostics();
	protected kleioService = KleioServiceModule.KleioService.getInstance();

	protected _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]>;
	protected _onDidChangeTreeData: vscode.EventEmitter<any> = new vscode.EventEmitter<any>();
	readonly onDidChangeTreeData: vscode.Event<any> = this._onDidChangeTreeData.event;

	protected showAllFilesExplorer = false;

	protected status?: string; // translation status flag
	protected dirStatus: string[] = []; // store fetched control folders
	protected dirCount: { [id: string] : Number } = {};
	
	protected status_codes: { [id: string] : string } = { 
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

		this.showAllFilesExplorer = vscode.workspace.getConfiguration("timelink").showAllFilesInExplorer;
		
		this.kleioService.loadAdminToken().then(() => {
			//this.kleioStatus.loadTranslationInfo("", ()=>{
				// this._onDidChangeTreeData.fire();
			//});
		});
	}

	// refreh only current node?
	// https://github.com/Microsoft/vscode/issues/62798
	public refresh(): any {	
		// only currently expanded nodes
		for (let i = 0; i < this.dirStatus.length; i++) {
			const child = this.dirStatus[i];
			this.kleioStatus.loadTranslationInfo(child, ()=>{
				this._onDidChangeTreeData.fire();
			});
		}
	}

	public fire(): any {	
		this._onDidChangeTreeData.fire();
	}
	
	get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
		return this._onDidChangeFile.event;
	}

	watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
		const watcher = fs.watch(uri.fsPath, { recursive: options.recursive }, async (event: string, filename: string | Buffer) => {
			const filepath = path.join(uri.fsPath, _.normalizeNFC(filename.toString()));

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
			if (!child.startsWith(".")) {
				if (stat.type ===  vscode.FileType.Directory) {
					result.push([child, stat.type]);
				} else {
					// only add kleio files if show all files disabled
					if (this.showAllFilesExplorer || this.isKleioFile(child)) {
						result.push([child, stat.type]);
					}
				}
			}
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
			var elementChildren = (await this.readDirectory(element.uri));

			// filters by status
			elementChildren = elementChildren.filter(([name, type]) => {
				let uri = vscode.Uri.file(path.join(element.uri.fsPath, name));
				let file = this.kleioStatus.getFiles().filter((el: { path: string; }) => uri.path.endsWith(el.path));
				if (type === vscode.FileType.Directory) {
					return this;
				} else if (file.length > 0 && file[0].status === this.status) {
					// filtering files by Translation Status
					return this;
				} else if (!this.status) {
					// return everything
					return this;
				}
			});
			
			elementChildren = this.sortByAlphabeticalOrder(elementChildren);

			return elementChildren.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(element.uri.fsPath, name)), type }));
		}

		// workspace root folders
		if (vscode.workspace.workspaceFolders !== undefined) {
			const workspaceFolder = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];
			var children = (await this.readDirectory(workspaceFolder.uri));
			
			children = children.filter(([name, type]) => {
				if (type === vscode.FileType.Directory) {
					let uri = path.join(workspaceFolder.uri.fsPath, name);
					// get translation info from kleio server and reload folder
					if (this.dirStatus.indexOf(uri) < 0) {
						this.dirStatus.push(uri);
						this.kleioStatus.loadTranslationInfo(uri, () => {
							this._onDidChangeTreeData.fire();
						});
					}
				}
				return this;
			});

			children = this.sortByAlphabeticalOrder(children);

			return children.map(([name, type]) => ({
				 	uri: vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, name)), type }));
		}

		return [];
	}

	sortByAlphabeticalOrder(children: [string, vscode.FileType][]) {
		return children.sort((a, b) => {
			if (a[1] === b[1]) {
				return a[0].localeCompare(b[0]);
			}
			return a[1] === vscode.FileType.Directory ? -1 : 1;
		});
	}

	isKleioFile(text: string) {
		return /(\.cli|\.CLI|\.kleio|\.KLEIO)$/.test(text);
	}

	getTreeItem(element: Entry): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(element.uri, element.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
		if (element.type === vscode.FileType.File) {
			treeItem.command = { command: 'fileExplorer.openFile', title: "Open File", arguments: [element.uri], };
			treeItem.contextValue = 'file';
			if(this.isKleioFile(element.uri.path)) {
				treeItem.contextValue = "fileCli";
				// get errors from rpt file
				this.diagnosticsProvider.loadErrorsForCli(element.uri.path);

				// change icon
				treeItem.iconPath = {
					light: path.join(__filename, '..', '..', 'resources', 'light', 'file.png'),
					dark: path.join(__filename, '..', '..', 'resources', 'dark', 'file.png')
				};

				// get file status from kleio server
				let file = this.kleioStatus.getFiles().filter((el: { path: string; }) => element.uri.path.endsWith(el.path));
				if (file.length > 0) {
					treeItem.description = this.status_codes[file[0].status];
				}
			}
		}
		return treeItem;
	}
}

/*
 * KleioStatusProvider
 *
 * Used in VSCode views by status (needs translation, with warnings, etc)
 * Overrides some FileSystemProvider methods
 */
export class KleioStatusProvider extends FileSystemProvider implements  vscode.TreeDataProvider<KleioEntry>, vscode.FileSystemProvider {
	protected collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
	
	constructor(status?: string) {
		super();
		this.status = status;
		this._onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

		if (vscode.workspace.getConfiguration("timelink").collapsibleStateExpanded) {
			this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
		}

		this.kleioService.loadAdminToken().then(() => {
			this.refresh();
		});
	}

	public refresh(): any {	
		this.kleioStatus.loadTranslationInfoStatus("/", this.status!, ()=> {
			this._onDidChangeTreeData.fire();
		});
	}

	async _readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const children = await _.readdir(uri.fsPath);
		const result: [string, vscode.FileType][] = [];
		const dirs = this.kleioStatus.getCachedDirs()[this.status!];
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const fpath = path.join(uri.fsPath, child);
			const stat = await this._stat(fpath);
			if (!child.startsWith(".")) {
				if (stat.type ===  vscode.FileType.Directory) {
					if (dirs && dirs.indexOf(this.kleioService.relativePath(fpath)) >= 0) {
						result.push([child, stat.type]);
					}
				} else {
					if (this.isKleioFile(child)) {
						result.push([child, stat.type]);
					}
				}
			}
		}
		return Promise.resolve(result);
	}

	async getChildren(element?: KleioEntry): Promise<KleioEntry[]> {
		// get element children
		if (element) {
			var elementChildren = (await this.readDirectory(element.uri));

			// fetch translation info from kleio server for non fetched folders only
			if (this.dirStatus.indexOf(element.uri.fsPath) < 0) {
				this.dirStatus.push(element.uri.fsPath);
				/*this.kleioStatus.loadTranslationInfoStatus(element.uri.fsPath, this.status!, ()=>{
					this._onDidChangeTreeData.fire(element);
				});*/
			}
			
			// filters by status
			elementChildren = elementChildren.filter(([name, type]) => {
				let uri = vscode.Uri.file(path.join(element.uri.fsPath, name));
				let file = this.kleioStatus.getFiles().filter((el: { path: string; }) => uri.path.endsWith(el.path));
				// console.log(">" + name);

				if (type === vscode.FileType.Directory) {
					return this;
				} else if (file.length > 0 && file[0].status === this.status) {
					// filters files by Translation Status
					return this;
				} else if (!this.status) {
					return this;
				}
			});

			return elementChildren.map(([name, type]) => (new KleioEntry(name, vscode.Uri.file(path.join(element.uri.fsPath, name)), type, this.collapsibleState)));
		}

		// get workspace root folders
		if (vscode.workspace.workspaceFolders !== undefined) {			
			const workspaceFolder = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];

			var workspaceFolderChildren = (await this.readDirectory(workspaceFolder.uri));
			
			// fetch translation info from kleio server for non fetched folders only
			if (this.dirStatus.indexOf(workspaceFolder.uri.fsPath) < 0) {
				this.dirStatus.push(workspaceFolder.uri.fsPath);
				/*this.kleioStatus.loadTranslationInfoStatus(workspaceFolder.uri.fsPath, this.status!, ()=>{
					this._onDidChangeTreeData.fire();
				});*/
			}

			// filters by status
			workspaceFolderChildren = workspaceFolderChildren.filter(([name, type]) => {
				let uri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, name));
				let file = this.kleioStatus.getFiles().filter((el: { path: string; }) => uri.path.endsWith(el.path));
				if (type === vscode.FileType.Directory) {
					return this;
				} else if (file.length > 0 && file[0].status === this.status) {
					return this;
				} else if (!this.status) {
					return this;
				}
			});

			workspaceFolderChildren = this.sortByAlphabeticalOrder(workspaceFolderChildren);

			if (workspaceFolderChildren.length === 0) {
				return [ new PlaceholderEntry(this.kleioStatus.getPlaceHolderMessage()) ];
			}

			return workspaceFolderChildren.map(([name, type]) => (new KleioEntry(name, 
				vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, name)), type, this.collapsibleState)));
		}

		return [];
	}

	getTreeItem(element: KleioEntry): vscode.TreeItem {
		return element;
	}
}
export class KleioStatusExplorer {
	private translationNeededDataProvider: KleioStatusProvider;
	private fileWithWarningsDataProvider: KleioStatusProvider;
	private fileWithErrorsDataProvider: KleioStatusProvider;
	private importReadyDataProvider: KleioStatusProvider;

	constructor(context: vscode.ExtensionContext) {
		var treeDataProvider = new KleioStatusProvider("T");
		this.translationNeededDataProvider = treeDataProvider;
		vscode.window.createTreeView('translationNeededExplorer', { treeDataProvider });

		treeDataProvider = new KleioStatusProvider("W");
		this.fileWithWarningsDataProvider = treeDataProvider;
		vscode.window.createTreeView('fileWithWarningsExplorer', { treeDataProvider });

		treeDataProvider = new KleioStatusProvider("E");
		this.fileWithErrorsDataProvider = treeDataProvider;
		vscode.window.createTreeView('fileWithErrorsExplorer', { treeDataProvider });

		treeDataProvider = new KleioStatusProvider("V");
		this.importReadyDataProvider = treeDataProvider;
		vscode.window.createTreeView('importReadyExplorer', { treeDataProvider });

		vscode.commands.registerCommand('fileExplorer.openKleioFile', (resource) => this.openResource(resource));
	}

	private openResource(resource: vscode.Uri): void {
		vscode.window.showTextDocument(resource);
	}

	public refresh(): void {
		KleioStatus.getInstance().clear();
		this.translationNeededDataProvider.refresh();
		this.fileWithWarningsDataProvider.refresh();
		this.fileWithErrorsDataProvider.refresh();
		this.importReadyDataProvider.refresh();
	}
}

export class FileExplorer {
	private fullTreeDataProvider: FileSystemProvider;

	constructor(context: vscode.ExtensionContext) {
		var treeDataProvider = new FileSystemProvider();		
		this.fullTreeDataProvider = treeDataProvider;
		vscode.window.createTreeView('fileExplorer', { treeDataProvider });

		vscode.commands.registerCommand('fileExplorer.openFile', (resource) => this.openResource(resource));
	}

	private openResource(resource: vscode.Uri): void {
		vscode.window.showTextDocument(resource);
	}

	public refresh(): void {
		this.fullTreeDataProvider.refresh();
	}
}