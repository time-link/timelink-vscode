/**
 * Kleio translation services for Timelink provides access to translation services of Kleio files.
 */

import * as jayson from 'jayson';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import { rejects } from 'assert';

export module KleioServiceModule {

    export class KleioService {
        private static instance: KleioService;
        
        private token?:string;
        private mhkHome:string = "";
        private urlPath:string = "/json/";

        // client with default properties... 
        // will try to get url property from .mhk at user's home at runtime
        private client = jayson.Client.http({
            host: 'localhost',
            path: this.urlPath,
            port: 8088
        });

        constructor() {
            this.loadAdminToken();
            this.loadKleioUrl();
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
         * Loads given property from given file
         */
        loadProperty(filePath: string, property: string): Promise<string> {
            return new Promise<string>((resolve, reject) => {
                vscode.workspace.openTextDocument(filePath).then((document) => {
                    document.getText().split(/\r?\n/).forEach(element => {
                        if (element.startsWith(property + "=")) {
                            resolve(element.replace(property + "=", ""));
                        }
                    });
                    reject("Property not found");
                });
            });
        }

        /**
         * Loads Kleio Server url from .mhk
         */
        loadKleioUrl(): Promise<string> {
            console.log('Loading Kleio Url');            
            return new Promise<string>((resolve) => {
				if (vscode.workspace.workspaceFolders) {
                    if (!this.mhkHome) {
                        this.mhkHome = this.findMHKHome(vscode.workspace.workspaceFolders[0].uri.fsPath);
                    }
                    if (this.mhkHome) {
                        let filePath = path.join(path.dirname(this.mhkHome), ".mhk");
                        this.loadProperty(filePath, "kleio_url").then((response: any) => {
                            if (!response.error) {
                                let parsedUrl = url.parse(response);
                                this.client = jayson.Client.http({
                                    host: parsedUrl.hostname,
                                    path: this.urlPath,
                                    port: parsedUrl.port
                                });
                                console.log("Loaded Kleio Server Url: " + response);
                            }
                        }).catch(error => {
                            vscode.window.showErrorMessage("Error loading Kleio Server url: translation services will not be available.");
                            console.log(error);
                        });
                    }
				}
            });
            
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
                        this.loadProperty(propPath, "mhk.kleio.service.token.admin").then((response: any) => {
                            if (!response.error) {
                                this.token = response.replace("mhk.kleio.service.token.admin=", "");
                                resolve(this.token);
                            }
                        }).catch(error => {
                            vscode.window.showErrorMessage("Error loading Kleio admin token: translation services will not be available.");
                            console.log(error);
                        });
                    }
				}
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
         * Get a file. Obtains a link to download a file specified in the Path parameter
         */
        translationsGet(filePath: string, status: string = "") {
            let filePathNormalized = path.normalize(filePath);
            return new Promise<any>((resolve, reject) => {
                let params = <any> {
                    "path": this.pathToUnix(this.relativePath(filePathNormalized)),
                    "recurse": "yes",
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