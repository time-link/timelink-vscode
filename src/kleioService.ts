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
            return new Promise<string>((resolve) => {
				if (vscode.workspace.workspaceFolders) {
                    let mhkHome = this.findMHKHome(vscode.workspace.workspaceFolders[0].uri.fsPath);
                    if (mhkHome) {
                        let propPath = path.join(mhkHome, "/system/conf/mhk_system.properties");
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
        translationsGet() {
            return new Promise<any>((resolve) => {
                let params = {
                    "path": "",
                    "recurse": "yes",
                    "token": this.token
                };
                return this.client.request('translations_get', params, function (err: any, response: any) {
                    if (err) { throw err; }
                    resolve(response);
                });
            });
        }

        /**
         * Start a translation.
         * If path points to a directory translates files in the directory
         */
        translationsTranslate(filePath: string): Promise<any> {
            return new Promise<any>((resolve) => {
                let params = {
                    "path": filePath,
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