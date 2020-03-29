/**
 * Kleio translation services for Timelink provides access to translation services of Kleio files.
 */

import * as jayson from 'jayson';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export module KleioServiceModule {

    export class KleioService {
        private static instance: KleioService;
        
        private token?:string;
        private mhkHome:string = "";

        private client = jayson.Client.http({
            host: 'localhost',
            path: '/json/',
            port: 8088
        });

        constructor() {
            this.loadAdminToken();
        }

        static getInstance(): KleioService {
            if (!KleioService.instance) {
                KleioService.instance = new KleioService();
            }
            return KleioService.instance;
        }

        /**
         * Recursively finds mhk-home folder, if available.
         */
        findMHKHome(currentPath: any): any {
            if (currentPath === path.sep) { // root folder, no mhk home found
                return null;
            } else if (fs.existsSync(path.join(currentPath, path.sep, ".mhk-home"))) {
                return currentPath;
            } else {
                return this.findMHKHome(path.dirname(currentPath));
            }
        }
        
        /**
         * Loads Kleio Server admin token from mhk-home
         */
        loadAdminToken(): Promise<string> {
            console.log('Loading admin token');
            return new Promise<string>((resolve) => {
				if (vscode.workspace.workspaceFolders) {
                    this.mhkHome = this.findMHKHome(vscode.workspace.workspaceFolders[0].uri.fsPath);
                    if (this.mhkHome) {
                        let propPath = path.join(this.mhkHome, "/system/conf/mhk_system.properties");
                        vscode.workspace.openTextDocument(propPath).then((document) => {
                            document.getText().split(/\r?\n/).forEach(element => {
                                if (element.startsWith("mhk.kleio.service.token.admin=")) {
                                    this.token = element.replace("mhk.kleio.service.token.admin=", "");
                                    resolve(this.token);
                                }
                            });
                        });
                    }
				}
			});
        }

        /**
         * Get a file. Obtains a link to download a file specified in the Path parameter
         */
        translationsGet(path: string, status: string) {
            return new Promise<any>((resolve, reject) => {
                let params = <any>{
                    "path": this.relativePath(path),
                    "recurse": true,
                    "token": this.token
                };
                if (status !== "") {
                    params.status = status;
                }
                return this.client.request('translations_get', params, function (err: any, response: any) {
                    if (err) { 
                        reject(err);
                    }
                    resolve(response);
                });
            });
        }

        /**
         * Make sure path is in unix format with / as separator
         */
        pathToUnix(stringPath: string): string {
            return stringPath.replace(/\\/g, "/");
        }

        /**
         * Returns relative path to MHK HOME
         */
        relativePath(stringPath: string): string {
            return stringPath.replace(this.mhkHome, "");
        }

        /**
         * Start a translation.
         * If path points to a directory translates files in the directory
         */
        translationsTranslate(filePath: string): Promise<any> {
            let filePathNormalized = path.normalize(filePath);
            if (!this.mhkHome || !filePathNormalized.includes(this.mhkHome)) {
                throw new Error("File Path not in MHK Home");
            }
            return new Promise<any>((resolve) => {
                let params = {
                    "path": this.pathToUnix(this.relativePath(filePathNormalized)),
                    "spawn": "no",
                    "token": this.token
                };
                return this.client.request('translations_translate', params, function (err: any, response: any) {
                    if (err) { throw err; }
                    resolve(response);
                });
            });
        }
    }
}