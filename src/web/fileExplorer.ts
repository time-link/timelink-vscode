import * as vscode from 'vscode';
import * as path from 'path';
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

	export function readdir(fpath: string, uriScheme: string): Promise<string[]> {
		console.log('readdir');
		return new Promise<string[]>(async (resolve, reject) => {
			console.log('readdir path ' + fpath);
			console.log('readdir full path ' + vscode.Uri.parse(uriScheme + fpath));

			// TODO How to list files in virtual file systems?
			const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.parse(uriScheme.concat(fpath))); // vscode-test-web

			console.log('readdir entries' + entries);
			entries.map(m => console.log(m));

			handleResult(resolve, reject, null, entries.map(m => m[0]));
			//vscode.workspace.fs.readDirectory(path, (error, children) => handleResult(resolve, reject, error, normalizeNFC(children)));
		});
	}

	export function stat(path: string, uriScheme: string): Promise<vscode.FileStat/*fs.Stats*/> {
		// console.log('stat ' + vscode.Uri.parse(uriScheme + path));
		return new Promise<vscode.FileStat>(async (resolve, reject) => {
			const stat = await vscode.workspace.fs.stat(vscode.Uri.parse(uriScheme + path));
			handleResult(resolve, reject, null, stat);
			//fs.stat(path, (error, stat) => handleResult(resolve, reject, error, stat));
		});
	}

	export function readfile(path: string, uriScheme: string): Promise<Buffer> {
		console.log('readfile');

		return new Promise<Buffer>(async (resolve, reject) => {
			const entry = await vscode.workspace.fs.readFile(vscode.Uri.parse(uriScheme + path));
			handleResult(resolve, reject, undefined, Buffer.from(entry));
		});
	}

	export function writefile(path: string, content: Buffer): Promise<void> {
		console.log('writefile');
		return new Promise<void>((resolve, reject) => {
			// TODO: implement?
			//fs.writeFile(path, content, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function exists(path: string): Promise<boolean> {
		console.log('exists');
		return new Promise<boolean>(async (resolve, reject) => {
			// TODO: check if this works
			try {
				// stat will throw an exception if file doesn't exist
				await vscode.workspace.fs.stat(vscode.Uri.parse(path));
			} catch {
				handleResult(resolve, reject, null, false);
			}
		});
	}

	export function rmrf(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			// TODO: implement recursive deletion (for folders and content)
			//rimraf(path, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function mkdir(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			// TODO: implemen
			//mkdirp(path, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function rename(oldPath: string, newPath: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			// TODO: implemen
			//	fs.rename(oldPath, newPath, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function unlink(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			let uri = vscode.Uri.file(path);
			vscode.workspace.fs.delete(uri, { useTrash: true });
			//fs.unlink(path, error => handleResult(resolve, reject, error, void 0));
		});
	}
}

export class FileStat implements vscode.FileStat {

	constructor(private fsStat: vscode.FileStat) { }

	get type(): vscode.FileType {
		// return vscode.FileType.Directory;
		// SymbolicLink??  or unkown=??
		return this.fsStat.type === 1 ? vscode.FileType.File : vscode.FileType.Directory; //  ? vscode.FileType.Directory : this.fsStat.isSymbolicLink ? vscode.FileType.SymbolicLink : vscode.FileType.Unknown;
	}

	get isFile(): boolean | undefined {
		return this.fsStat.type === 1;
	}

	get isDirectory(): boolean | undefined {
		return this.fsStat.type === 2;
	}

	get isSymbolicLink(): boolean | undefined {
		return false;
		//return this.fsStat.isSymbolicLink;
	}

	get size(): number {
		return this.fsStat.size;
	}

	get ctime(): number {
		//return this.fsStat.ctime.getTime();
		return this.fsStat.ctime;
	}

	get mtime(): number {
		// return this.fsStat.mtime.getTime();
		return this.fsStat.mtime;
	}
}

export interface Entry {
	uri: vscode.Uri;
	type: vscode.FileType;
}

export class KleioStatus {
	private static instance: KleioStatus;
	protected kleioService = KleioServiceModule.KleioService.getInstance();
	protected files: any = []; // store all kleio files
	protected fetched: string[] = [];
	protected cachedDirs: { [status: string]: [string]; } = {};
	protected placeHolderMessage: string = "0 files";

	static getInstance(): KleioStatus {
		if (!KleioStatus.instance) {
			KleioStatus.instance = new KleioStatus();
		}
		return KleioStatus.instance;
	}

	constructor() {
		this.clear();
	}

	getFiles() {
		return this.files;
	}

	getFetched() {
		return this.fetched;
	}

	removeFromFetched(fspath: string) {
		var index = this.fetched.indexOf(fspath);
		if (index >= 0) {
			this.fetched.splice(index, 1);
		}
	}

	getCachedDirs() {
		return this.cachedDirs;
	}

	getPlaceHolderMessage() {
		return this.placeHolderMessage;
	}

	public filterByStatus(uri: vscode.Uri, type: vscode.FileType, status?: string) {
		//let uri = vscode.Uri.file(path.join(element.uri.path, name));
		let file = this.getFiles().filter((el: { path: string; }) => uri.path.endsWith(el.path));
		// console.log(">" + name);
		if (type === vscode.FileType.Directory) {
			return this;
		} else if (file.length > 0 && file[0].status === status) {
			// filters files by Translation Status
			return this;
		} else if (!status) {
			return this;
		}
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
	async _loadTranslationInfoStatus(fpath: string, caller: () => void) {
		await this.kleioService.translationsGet(fpath).then((response) => {
			console.log("Got Kleio Status: " + fpath);
			// console.log(response);
			// TODO: HANDLE errors
			// if (!response.result) {
			// 	console.log("Got Kleio ERROR");
			// 	this.placeHolderMessage = "Kleio Server error.";
			// 	caller();
			// 	// console.error(response);
			// 	return;
			// }

			// replace existing files with new status
			// this.files = this.files.concat(response.result.filter((item: any) => this.files.indexOf(item) < 0));
			// this.files = this.files.concat(response.result.filter((item: { source_url: string; }) => this.files.findIndex((p: { source_url: string; }) => p.source_url === item.source_url) < 0));
			// including all parent folders
			//response.result
			response.forEach((element: any) => {
				// remove existing values
				// usefull in case of partial request update
				var oldElementIndex = this.files.findIndex((item: { source_url: string; }) => item.source_url === element.source_url);
				if (oldElementIndex >= 0) {
					this.files.splice(oldElementIndex, 1);
				}
				this.files.push(element);
			});

			// store files status in cache
			this.cachedDirs = {};
			this.files.forEach((element: any) => {
				// store status for each dir that contains at leat one element
				var status = element.status;
				if (!this.cachedDirs[status]) {
					this.cachedDirs[status] = [""];
				}
				// add element current folder to dirs list
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
			console.log(this.files.length);
			this.placeHolderMessage = "0 files"; // set default message for when result is empty
			this.fetched.push(fpath);
			caller();
			console.log("LOADED status");
		});
	}

	loadTranslationInfoStatus(fpath: string, caller: () => void) {
		console.log("Load Kleio Status: " + fpath);
		if (this.fetched.indexOf(fpath) < 0) {
			this.placeHolderMessage = "Loading Status from Kleio Server…";
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Window,
				title: this.placeHolderMessage
			},
				async () => {
					await this._loadTranslationInfoStatus(fpath, caller).then(undefined, err => {
						this.handleServerError(err);
						caller();
					});
				});
		} else {
			caller();
		}
	}

	handleServerError(err: { code: string; }) {
		console.error(err);
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
		console.log("Load Kleio Info: " + fpath);
		if (fpath === "") {
			this.clear();
		}
		if (this.fetched.indexOf(fpath) < 0) {
			this.kleioService.translationsGet(fpath).then((response) => {
				if (response && response.result) {
					this.files = this.files.concat(response.result.filter((item: any) => this.files.indexOf(item) < 0));
					//this.files = this.files.concat(response.result);
					this.fetched.push(fpath);
					caller();
				}
			}).then(undefined, err => {
				this.handleServerError(err);
				caller();
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
			this.command = { command: 'timelink.views.fileExplorer.openKleioFile', title: "Open File", arguments: [uri], };
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

	public static urlScheme = "";

	protected lightIcon = vscode.Uri.from({
		scheme: "data",
		path: 'image/svg+xml;utf8,<svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="200.000000pt" height="200.000000pt" viewBox="0 0 200.000000 200.000000" preserveAspectRatio="xMidYMid meet"><g transform="translate(0.000000,200.000000) scale(0.100000,-0.100000)" fill="#000000" stroke="none"><path d="M742 1649 c-88 -44 -125 -155 -82 -243 40 -83 118 -120 215 -102 43 8 103 59 121 103 18 42 18 112 0 154 -40 94 -158 135 -254 88z m169 -22 c53 -35 79 -82 79 -139 0 -89 -41 -144 -125 -167 -73 -20 -165 27 -195 99 -17 41 -8 125 17 158 54 74 155 96 224 49z"/><path d="M901 1279 c-1 -3 15 -46 34 -95 19 -49 35 -93 35 -99 0 -5 -15 -19 -33 -31 -41 -27 -86 -91 -98 -141 -5 -21 -6 -65 -3 -98 5 -56 4 -61 -18 -71 -33 -15 -191 -114 -203 -126 -5 -6 10 1 35 14 25 14 80 44 123 67 l78 42 42 -44 c60 -63 99 -81 177 -81 47 0 76 6 106 21 57 30 112 95 126 149 l13 47 98 -6 c54 -3 96 -3 93 0 -2 3 -46 10 -98 16 l-93 12 -7 42 c-9 54 -28 90 -70 130 -46 45 -96 63 -175 64 l-68 0 -47 97 c-25 53 -47 94 -47 91z m237 -214 c94 -28 152 -109 152 -212 0 -96 -39 -159 -125 -199 -90 -42 -184 -25 -252 47 -85 89 -81 233 8 314 21 19 45 35 53 35 7 0 27 7 42 15 37 19 58 19 122 0z"/><path d="M1709 1000 c-65 -19 -119 -84 -133 -158 -20 -113 85 -232 205 -232 44 0 128 49 156 91 31 47 41 121 23 173 -33 102 -146 158 -251 126z m139 -24 c31 -16 74 -61 91 -93 17 -34 13 -114 -8 -153 -48 -89 -147 -123 -236 -80 -173 84 -114 340 78 340 26 0 60 -6 75 -14z"/><path d="M426 659 c-82 -23 -121 -123 -76 -196 55 -91 195 -81 234 17 20 51 20 55 -4 105 -29 60 -94 92 -154 74z m107 -40 c39 -30 53 -85 34 -131 -49 -117 -217 -84 -217 42 0 67 43 109 111 110 32 0 54 -6 72 -21z"/></g></svg>'
	});

	protected darkIcon = vscode.Uri.from({
		scheme: "data",
		path: 'image/svg+xml;utf8,<svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="200.000000pt" height="200.000000pt" viewBox="0 0 200.000000 200.000000" preserveAspectRatio="xMidYMid meet"><g transform="translate(0.000000,200.000000) scale(0.100000,-0.100000)" fill="#FFFFFF" stroke="none"><path d="M742 1649 c-88 -44 -125 -155 -82 -243 40 -83 118 -120 215 -102 43 8 103 59 121 103 18 42 18 112 0 154 -40 94 -158 135 -254 88z m169 -22 c53 -35 79 -82 79 -139 0 -89 -41 -144 -125 -167 -73 -20 -165 27 -195 99 -17 41 -8 125 17 158 54 74 155 96 224 49z"/><path d="M901 1279 c-1 -3 15 -46 34 -95 19 -49 35 -93 35 -99 0 -5 -15 -19 -33 -31 -41 -27 -86 -91 -98 -141 -5 -21 -6 -65 -3 -98 5 -56 4 -61 -18 -71 -33 -15 -191 -114 -203 -126 -5 -6 10 1 35 14 25 14 80 44 123 67 l78 42 42 -44 c60 -63 99 -81 177 -81 47 0 76 6 106 21 57 30 112 95 126 149 l13 47 98 -6 c54 -3 96 -3 93 0 -2 3 -46 10 -98 16 l-93 12 -7 42 c-9 54 -28 90 -70 130 -46 45 -96 63 -175 64 l-68 0 -47 97 c-25 53 -47 94 -47 91z m237 -214 c94 -28 152 -109 152 -212 0 -96 -39 -159 -125 -199 -90 -42 -184 -25 -252 47 -85 89 -81 233 8 314 21 19 45 35 53 35 7 0 27 7 42 15 37 19 58 19 122 0z"/><path d="M1709 1000 c-65 -19 -119 -84 -133 -158 -20 -113 85 -232 205 -232 44 0 128 49 156 91 31 47 41 121 23 173 -33 102 -146 158 -251 126z m139 -24 c31 -16 74 -61 91 -93 17 -34 13 -114 -8 -153 -48 -89 -147 -123 -236 -80 -173 84 -114 340 78 340 26 0 60 -6 75 -14z"/><path d="M426 659 c-82 -23 -121 -123 -76 -196 55 -91 195 -81 234 17 20 51 20 55 -4 105 -29 60 -94 92 -154 74z m107 -40 c39 -30 53 -85 34 -131 -49 -117 -217 -84 -217 42 0 67 43 109 111 110 32 0 54 -6 72 -21z"/></g></svg>'
	});

	protected status?: string; // translation status flag
	protected dirStatus: string[] = []; // store fetched control folders
	protected dirCount: { [id: string]: Number } = {};

	protected status_codes: { [id: string]: string } = {
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
		this.showAllFilesExplorer = vscode.workspace.getConfiguration("timelink.explorer").showAllFilesInExplorer;
	}

	// refreh only current node?
	// https://github.com/Microsoft/vscode/issues/62798
	public refresh(): any {
		this._onDidChangeTreeData.fire(undefined);
		// only currently expanded nodes
		/*for (let i = 0; i < this.dirStatus.length; i++) {
			const child = this.dirStatus[i];
			this.kleioStatus.loadTranslationInfo(child, ()=>{
				this._onDidChangeTreeData.fire();
			});
		}*/
	}

	public fire(): any {
		this._onDidChangeTreeData.fire(undefined);
	}

	get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
		return this._onDidChangeFile.event;
	}

	watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
		console.log('watch');
		/* const watcher = fs.watch(uri.fsPath, { recursive: options.recursive }, async (event: string, filename: string | Buffer) => {
			const filepath = path.join(uri.fsPath, _.normalizeNFC(filename.toString()));

			this._onDidChangeFile.fire([{
				type: event === 'change' ? vscode.FileChangeType.Changed : await _.exists(filepath) ? vscode.FileChangeType.Created : vscode.FileChangeType.Deleted,
				uri: uri.with({ path: filepath })
			} as vscode.FileChangeEvent]);
		});

		return { dispose: () => watcher.close() }; */
		// TODO:???
		return { dispose: () => { } };
	}

	stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
		return this._stat(uri.path);
	}

	async _stat(path: string): Promise<vscode.FileStat> {
		return new FileStat(await _.stat(path, FileSystemProvider.urlScheme));
	}

	readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
		return this._readDirectory(uri);
	}

	async _readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const children = await _.readdir(uri.path, FileSystemProvider.urlScheme);

		const result: [string, vscode.FileType][] = [];
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const stat = await this._stat(path.join(uri.path, child));
			if (!child.startsWith(".")) {
				// console.log("stat.type " + stat.type);
				if (stat.type === vscode.FileType.Directory) {
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
		return _.mkdir(uri.path);
	}

	readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
		return _.readfile(uri.path, FileSystemProvider.urlScheme);
	}

	writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
		return this._writeFile(uri, content, options);
	}

	async _writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Promise<void> {
		const exists = await _.exists(uri.path);
		if (!exists) {
			if (!options.create) {
				throw vscode.FileSystemError.FileNotFound();
			}

			await _.mkdir(path.dirname(uri.path));
		} else {
			if (!options.overwrite) {
				throw vscode.FileSystemError.FileExists();
			}
		}

		return _.writefile(uri.path, content as Buffer);
	}

	delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
		if (options.recursive) {
			return _.rmrf(uri.path);
		}

		return _.unlink(uri.path);
	}

	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
		return this._rename(oldUri, newUri, options);
	}

	async _rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): Promise<void> {
		const exists = await _.exists(newUri.path);
		if (exists) {
			if (!options.overwrite) {
				throw vscode.FileSystemError.FileExists();
			} else {
				await _.rmrf(newUri.path);
			}
		}

		const parentExists = await _.exists(path.dirname(newUri.path));
		if (!parentExists) {
			await _.mkdir(path.dirname(newUri.path));
		}

		return _.rename(oldUri.path, newUri.path);
	}

	// tree data provider
	async getChildren(element?: Entry): Promise<Entry[]> {
		// element children
		if (element) {
			var elementChildren = (await this.readDirectory(element.uri));

			// filters by status
			elementChildren = elementChildren.filter(([name, type]) => {
				let uri = vscode.Uri.file(path.join(element.uri.path, name));
				return this.kleioStatus.filterByStatus(uri, type, this.status);
			});

			elementChildren = this.sortByAlphabeticalOrder(elementChildren);

			return elementChildren.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(element.uri.path, name)), type }));
		}

		// workspace root folders
		if (vscode.workspace.workspaceFolders !== undefined) {
			console.log(vscode.workspace.workspaceFolders);

			//const workspaceFolder = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];
			// const workspaceFolder = vscode.workspace.workspaceFolders.filter(folder => (folder.uri.scheme === 'vscode-test-web' || folder.uri.scheme === 'file'))[0];
			const workspaceFolder = vscode.workspace.workspaceFolders[0];

			console.log('uri scheme' + workspaceFolder.uri.scheme);

			if (workspaceFolder) {
				console.log('read workspaceFolder');
				const workspaceFolder = vscode.workspace.workspaceFolders[0];
				FileSystemProvider.urlScheme = workspaceFolder.uri.scheme + "://" + workspaceFolder.uri.authority;

				// vscode.window .showInformationMessage('workspaceFolder.uri.scheme', workspaceFolder.uri.scheme); 

				var children = (await this.readDirectory(workspaceFolder.uri));

				/*children = children.filter(([name, type]) => {
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
				});*/

				children = this.sortByAlphabeticalOrder(children);
				console.log(children);

				return children.map(([name, type]) => ({
					uri: vscode.Uri.file(path.join(workspaceFolder.uri.path, name)), type
				}));
			}
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
			treeItem.command = { command: 'timelink.views.fileExplorer.openFile', title: "Open File", arguments: [element.uri], };
			treeItem.contextValue = 'file';
			if (this.isKleioFile(element.uri.path)) {
				treeItem.contextValue = "fileCli";
				// get errors from rpt file
				this.diagnosticsProvider.loadErrorsForCli(element.uri.path);

				// change icon
				treeItem.iconPath = {
					light: this.lightIcon,
					dark: this.darkIcon
				};

				// get file status from kleio server
				let file = this.kleioStatus.getFiles().filter((el: { path: string; }) => element.uri.path.endsWith(el.path));
				if (file.length > 0) {
					treeItem.description = this.status_codes[file[0].status];
				}
			}
		} else if (element.type === vscode.FileType.Directory) {
			treeItem.contextValue = 'dirCli';
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
export class KleioStatusProvider extends FileSystemProvider implements vscode.TreeDataProvider<KleioEntry>, vscode.FileSystemProvider {
	protected collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

	constructor(status?: string) {
		super();

		this.status = status;
		this._onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

		if (vscode.workspace.getConfiguration("timelink.explorer").collapsibleStateExpanded) {
			this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
		}
	}

	public refresh(): any {
		this._onDidChangeTreeData.fire(null);
	}

	async _readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {

		const children = await _.readdir(uri.path, FileSystemProvider.urlScheme);
		const result: [string, vscode.FileType][] = [];
		const dirs = this.kleioStatus.getCachedDirs()[this.status!];
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const fpath = path.join(uri.path, child);
			const stat = await this._stat(fpath);
			if (!child.startsWith(".")) {
				if (stat.type === vscode.FileType.Directory) {
					// TODO: why do I need to add / before?
					if (dirs && dirs.indexOf("/" + this.kleioService.relativeUnixPath(fpath)) >= 0) {
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
			console.log('getChildren');
			// fetch translation info from kleio server for non fetched folders only
			if (this.dirStatus.indexOf(element.uri.path) < 0) {
				this.dirStatus.push(element.uri.path);
				//this.status!, 
				/*this.kleioStatus.loadTranslationInfoStatus(element.uri.fsPath, () => {
					this._onDidChangeTreeData.fire(element);
				});*/
			}

			// filters by status
			elementChildren = elementChildren.filter(([name, type]) => {
				let uri = vscode.Uri.file(path.join(element.uri.path, name));
				return this.kleioStatus.filterByStatus(uri, type, this.status);
			});

			return elementChildren.map(([name, type]) => (new KleioEntry(name, vscode.Uri.file(path.join(element.uri.path, name)), type, this.collapsibleState)));
		}

		// get workspace root folders
		if (vscode.workspace.workspaceFolders !== undefined) {
			// TODO:
			//const workspaceFolder = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];
			// const workspaceFolder = vscode.workspace.workspaceFolders.filter(folder => (folder.uri.scheme === 'vscode-test-web' || folder.uri.scheme === 'file'))[0];
			const workspaceFolder = vscode.workspace.workspaceFolders[0];

			console.log('get workspace root folders');

			FileSystemProvider.urlScheme = workspaceFolder.uri.scheme + "://" + workspaceFolder.uri.authority;
			console.log('urlScheme' + FileSystemProvider.urlScheme);

			console.log('uri' + workspaceFolder.uri.scheme);
			vscode.window.showInformationMessage('workspaceFolder.uri.scheme', workspaceFolder.uri.scheme);

			var workspaceFolderChildren = (await this.readDirectory(workspaceFolder.uri));

			// fetch translation info from kleio server for non fetched folders only
			if (this.dirStatus.indexOf(workspaceFolder.uri.path) < 0) {
				this.dirStatus.push(workspaceFolder.uri.path);
				// this.status!,
				this.kleioStatus.loadTranslationInfoStatus(workspaceFolder.uri.fsPath, () => {
					this._onDidChangeTreeData.fire(element);
				});
			}

			// filters by status
			workspaceFolderChildren = workspaceFolderChildren.filter(([name, type]) => {
				let uri = vscode.Uri.file(path.join(workspaceFolder.uri.path, name));
				return this.kleioStatus.filterByStatus(uri, type, this.status);
			});

			workspaceFolderChildren = this.sortByAlphabeticalOrder(workspaceFolderChildren);

			if (workspaceFolderChildren.length === 0) {
				return [new PlaceholderEntry(this.kleioStatus.getPlaceHolderMessage())];
			}

			return workspaceFolderChildren.map(([name, type]) => (new KleioEntry(name,
				vscode.Uri.file(path.join(workspaceFolder.uri.path, name)), type, this.collapsibleState)));
		}

		return [];
	}

	getTreeItem(element: KleioEntry): vscode.TreeItem {
		return element;
	}
}
export class KleioStatusExplorer {
	protected kleioStatus: KleioStatus = KleioStatus.getInstance();
	protected kleioService = KleioServiceModule.KleioService.getInstance();

	private translationNeededDataProvider: KleioStatusProvider;
	private fileWithWarningsDataProvider: KleioStatusProvider;
	private fileWithErrorsDataProvider: KleioStatusProvider;
	private importReadyDataProvider: KleioStatusProvider;

	constructor(context: vscode.ExtensionContext) {
		console.log('KleioStatusExplorer init');
		var treeDataProvider = new KleioStatusProvider("T");
		this.translationNeededDataProvider = treeDataProvider;
		vscode.window.createTreeView('timelink.views.translationNeededExplorer', { treeDataProvider });

		treeDataProvider = new KleioStatusProvider("W");
		this.fileWithWarningsDataProvider = treeDataProvider;
		vscode.window.createTreeView('timelink.views.fileWithWarningsExplorer', { treeDataProvider });

		treeDataProvider = new KleioStatusProvider("E");
		this.fileWithErrorsDataProvider = treeDataProvider;
		vscode.window.createTreeView('timelink.views.fileWithErrorsExplorer', { treeDataProvider });

		treeDataProvider = new KleioStatusProvider("V");
		this.importReadyDataProvider = treeDataProvider;
		vscode.window.createTreeView('timelink.views.importReadyExplorer', { treeDataProvider });

		vscode.commands.registerCommand('timelink.views.fileExplorer.openKleioFile', (resource) => this.openResource(resource));

		this.refresh();

		// this.kleioService.loadAdminToken().then(() => {
		// 	console.log("Loaded Admin Token");
		// 	this.refresh();
		// });
	}

	private openResource(resource: vscode.Uri): void {
		vscode.window.showTextDocument(resource);
	}

	public refresh(fspath?: string): void {
		if (fspath) { // fspath, will update only one kleio path
			var relativePath = path.dirname(this.kleioService.relativeUnixPath(fspath));
			console.log("relativePath " + relativePath);
			// remove passed path from list of fetched paths
			this.kleioStatus.removeFromFetched(relativePath);
			this.kleioStatus.loadTranslationInfoStatus(relativePath, () => {
				this.translationNeededDataProvider.refresh();
				this.fileWithWarningsDataProvider.refresh();
				this.fileWithErrorsDataProvider.refresh();
				this.importReadyDataProvider.refresh();
			});
		} else {
			KleioStatus.getInstance().clear();
			if (vscode.workspace.workspaceFolders !== undefined) {
				vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file').forEach(folder => {
					var relativePath = this.kleioService.relativeUnixPath(folder.uri.fsPath);
					console.log("relativePath " + relativePath);
					this.kleioStatus.loadTranslationInfoStatus(relativePath, () => {
						this.translationNeededDataProvider.refresh();
						this.fileWithWarningsDataProvider.refresh();
						this.fileWithErrorsDataProvider.refresh();
						this.importReadyDataProvider.refresh();
					});
				});
			}
		}
	}
}

export class FileExplorer {
	private fullTreeDataProvider: FileSystemProvider;

	constructor(context: vscode.ExtensionContext) {
		var treeDataProvider = new FileSystemProvider();
		this.fullTreeDataProvider = treeDataProvider;
		vscode.window.createTreeView('timelink.views.fileExplorer', { treeDataProvider });
		vscode.commands.registerCommand('timelink.views.fileExplorer.openFile', (resource) => this.openResource(resource));
	}

	private openResource(path: vscode.Uri): void {
		vscode.window.showTextDocument(vscode.Uri.parse(FileSystemProvider.urlScheme.concat(path.path)));
	}

	// delete cli and related filed
	public deleteCliAndRelated(uri: vscode.Uri, deleteCli: boolean): void {
		var filesToDelete: vscode.Uri[] = [];
		var action = 'Delete Files';
		var message = 'The following files will be deleted:';
		if (deleteCli) {
			filesToDelete.push(uri);
			message = message.concat('\n\n').concat(uri.fsPath);
		}
		// get related files
		for (let entry of ['.err', '.ids', '.org', '.rpt', '.xml']) {
			var currentUri = vscode.Uri.parse(uri.fsPath.replace(/.cli$/, entry));

			try {
				// stat will throw an exception if file doesn't exist
				vscode.workspace.fs.stat(currentUri);
				filesToDelete.push(currentUri);
				message = message.concat('\n\n').concat(currentUri.fsPath);
			} catch {
				// ignore file
			}
		}
		// show warning and wait for confirmation!
		vscode.window.showWarningMessage(message, { modal: true }, ...[action]).then((result) => {
			if (result === action) {
				for (let currentUri of filesToDelete) {
					this.fullTreeDataProvider.delete(currentUri, { recursive: false });
				}
			}
		});
	}

	public refresh(): void {
		this.fullTreeDataProvider.refresh();
	}
}