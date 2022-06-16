/**
 * Kleio translation services for Timelink provides access to translation services of Kleio files.
 */

import * as jayson from 'jayson';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';

export module KleioServiceModule {

    export class KleioService {
        private static instance: KleioService;

        private kleioHost: string = "localhost";
        private kleioPort: number = 8088;
        private token?: string;
        private mhkHome: string = "";
        private propertiesPath: string = "/system/conf/mhk_system.properties";
        private urlPath: string = "/json/";

        // client with default properties... 
        // will try to get url property from .mhk at user's home at runtime
        private client!: jayson.Client;

        constructor() {
            this.init();
        }

        static getInstance(): KleioService {
            if (!KleioService.instance) {
                KleioService.instance = new KleioService();
            }
            return KleioService.instance;
        }

        init() {
            if (vscode.workspace.getConfiguration("timelink.kleio").kleioServerToken) {
                console.log("Init Kleio Server with custom extension properties");
                this.initJsonClient();
            } else {
                console.log("Init Kleio Server with configuration properties");
                this.loadAdminToken();
                this.loadKleioUrl();
            }
        }

        initJsonClient() {
            var section: string = "timelink.kleio";
            if (vscode.workspace.getConfiguration(section).kleioServerPort) {
                this.kleioPort = Number(vscode.workspace.getConfiguration(section).kleioServerPort);
            }
            if (vscode.workspace.getConfiguration(section).kleioServerHost) {
                this.kleioHost = vscode.workspace.getConfiguration(section).kleioServerHost;
            }
            if (vscode.workspace.getConfiguration(section).kleioServerToken) {
                this.token = vscode.workspace.getConfiguration(section).kleioServerToken;
            }

            this.client = jayson.Client.http({
                host: this.kleioHost,
                path: this.urlPath,
                port: this.kleioPort
            });
        }

        /**
         * Recursively finds file name in parent folder hierarchy
         */
        findFile(currentPath: any, fileName: string): any {
            if (currentPath === path.sep) { // root folder, no mhk home found
                return null;
            } else if (fs.existsSync(path.join(currentPath, path.sep, fileName))) {
                return currentPath;
            } else {
                return this.findFile(path.dirname(currentPath), fileName);
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

        findMHKHome(fsPath: any) {
            if (!this.mhkHome) {
                // find .mhk file in hierarchy
                this.mhkHome = this.findFile(fsPath, ".mhk-home");
                this.propertiesPath = "/system/conf/mhk_system.properties";
            }
            // couldn't file mhk-home, try with .mhk file
            if (!this.mhkHome) {
                this.mhkHome = this.findFile(fsPath, ".mhk");
                this.propertiesPath = "/.mhk";
            }
        }

        /**
         * Loads Kleio Server url from .mhk
         */
        loadKleioUrl(): Promise<string> {
            console.log('Loading Kleio Url');
            return new Promise<string>((resolve) => {
                if (vscode.workspace.workspaceFolders) {
                    this.findMHKHome(vscode.workspace.workspaceFolders[0].uri.fsPath);
                    if (this.mhkHome) {
                        let filePath = path.join(path.dirname(this.mhkHome), ".mhk");
                        if (fs.existsSync(filePath)) {
                            this.loadProperty(filePath, "kleio_url").then((response: any) => {
                                if (!response.error) {
                                    let parsedUrl = url.parse(response);
                                    this.kleioHost = parsedUrl.hostname ? parsedUrl.hostname : this.kleioHost;
                                    this.kleioPort = parsedUrl.port ? Number(parsedUrl.port) : this.kleioPort;
                                    this.client = jayson.Client.http({
                                        host: this.kleioHost,
                                        path: this.urlPath,
                                        port: this.kleioPort
                                    });
                                    console.log("Loaded Kleio Server Url: " + response);
                                }
                            }).catch(error => {
                                vscode.window.showErrorMessage("Error loading Kleio Server url: translation services will not be available.");
                                console.log(error);
                            });
                        }
                    }
                }
            });
        }

        /**
         * Loads Kleio Server admin token from mhk-home or from VSCode settings
         */
        loadAdminToken(): Promise<string> {
            console.log('Loading admin token');

            return new Promise<string>((resolve) => {
                if (vscode.workspace.workspaceFolders) {
                    this.findMHKHome(vscode.workspace.workspaceFolders[0].uri.fsPath);
                    if (vscode.workspace.getConfiguration("timelink.kleio").kleioServerToken) {
                        // Ignore token from configuration files...
                        // Using custom admin token from VSC settings
                        console.log('Using custom admin token');
                        resolve(this.token!);
                        return;
                    }
                    if (this.mhkHome) {
                        let propPath = path.join(this.mhkHome, this.propertiesPath);
                        this.loadProperty(propPath, "mhk.kleio.service.token.admin").then((response: any) => {
                            if (!response.error) {
                                this.token = response.replace("mhk.kleio.service.token.admin=", "");
                                resolve(this.token!);
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
        relativeUnixPath(stringPath: string): string {
            return this.pathToUnix(stringPath.replace(this.mhkHome, ""));
        }

        /**
         * Get a file. Obtains a link to download a file specified in the Path parameter
         */
        translationsGet(filePath: string, status: string = "") {
            let filePathNormalized = path.normalize(filePath);
            return new Promise<any>((resolve, reject) => {
                let params = <any>{
                    "path": this.relativeUnixPath(filePathNormalized),
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
                    "path": this.relativeUnixPath(filePathNormalized),
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