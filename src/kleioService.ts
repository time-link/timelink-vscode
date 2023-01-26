/**
 * Kleio translation services for Timelink provides access to translation services of Kleio files.
 */

import * as jayson from 'jayson';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import { resolve } from 'dns';
import { threadId } from 'worker_threads';

export module KleioServiceModule {

    export class KleioService {
        private static instance: KleioService;

        private kleioHost: string = "localhost";
        public mhkHome: string = "";
        private kleioPort: number = 8088;
        private token?: string;
        private propertiesPath: string = "/system/conf/mhk_system.properties";
        private propertiesFullPath: string = "";
        // property names used in MHK_HOME/system/conf/mhk_system.properties
        private kleioUrlPropMhkHome: string = "mhk.kleio.service";
        private kleioTokenPropMhkHome = "mhk.kleio.service.token.admin";
        // property names used in HOME/.mhk 
        private kleioUrlPropUserHome: string = "kleio_url";
        private kleioTokenPropUserHome = "kleio_token";
        // property name used in HOME/.mhk to indicate path to mhk-home
        private mhkHomePropUserHome = "kleio_token";
        // values in the current instalation read from the props above
        private kleioUrlValue: string | null = null;
        private kleioTokenValue: string | null = null;
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
                // find mhk-home folder as child of current folder (dev container/codespace case)    
            } else if (fs.existsSync(path.join(currentPath, path.sep, 'mhk-home', fileName))) {
                return path.join(currentPath, 'mhk-home');
            } else {
                return this.findFile(path.dirname(currentPath), fileName);
            }
        }

        /**
         * Loads given property from given file ansync
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

        /** read a property from a properties file
         * Sync version. Courtesy of ChatGP3
         */

        getPropertyValue(filePath: string, propertyName: string): string | null {
            const properties = fs.readFileSync(filePath, 'utf8');
            const lines = properties.split('\n');
            for (const line of lines) {
                if (line.startsWith(propertyName)) {
                    const parts = line.split('=');
                    let value = parts[1].trim();
                    // remove quotes if any
                    value = value.replace(/^"(.*)"$/, '$1');
                    return value;
                }
            }
            return null;
        }

        findMHKHome(fsPath: any) {
            if (this.mhkHome && this.kleioTokenValue && this.kleioUrlValue) {
                console.log("=========== KleioService Pars =============")
                console.log("mhkHome: " + this.mhkHome);
                console.log("kleioUrlValue: " + this.kleioUrlValue);
                // set vtoken to first 5 chars of kleioTokenValue or "none" if null
                let vtoken = this.kleioTokenValue ? this.kleioTokenValue.substring(0,4) : "Not set";
                console.log("kleioTokenValue: " + vtoken + "...");
                console.log("propertiesFullPath: " + this.propertiesFullPath);

            } 
            else{
                // find .mhk file in hierarchy
                this.mhkHome = this.findFile(fsPath, ".mhk-home");
                this.propertiesPath = "/system/conf/mhk_system.properties";

                if (this.mhkHome) {
                    console.log("mhk-home found at: " + this.mhkHome)
                    this.propertiesFullPath = path.join(this.mhkHome, this.propertiesPath);
                    console.log("mhk properties set to: " + this.propertiesFullPath)
                    this.kleioUrlValue =
                        this.getPropertyValue(this.propertiesFullPath, this.kleioUrlPropMhkHome);
                    this.kleioTokenValue =
                        this.getPropertyValue(this.propertiesFullPath, this.kleioTokenPropMhkHome);
                }
            }
            // couldn't file mhk-home, try with .mhk file
            if (!this.mhkHome) {
                let mhk_settings: string = this.findFile(fsPath, ".mhk");
                if (mhk_settings) {
                    console.log(".mhk settings found in user home: " + mhk_settings)
                    let mhk_home_prop: any = this.getPropertyValue(
                        path.join(mhk_settings, '.mhk'),
                        this.mhkHomePropUserHome);
                    if (mhk_home_prop) {
                        console.log("mhk-home location fetched from .mhk files: " + mhk_home_prop)
                        this.mhkHome = mhk_home_prop;
                        this.propertiesPath = "/system/conf/mhk_system.properties";
                        this.kleioUrlValue =
                            this.getPropertyValue(this.propertiesFullPath, this.kleioTokenPropUserHome);
                        this.kleioUrlValue =
                            this.getPropertyValue(this.propertiesFullPath, this.kleioUrlPropUserHome);

                    }
                }
            }
        }

        /**
         * Loads Kleio Server url from .mhk
         */
        loadKleioUrl(): Promise<string> {
            console.log('loadKleioUrl: Loading Kleio Url');
            return new Promise<string>((resolve) => {
                if (vscode.workspace.workspaceFolders) {
                    this.findMHKHome(vscode.workspace.workspaceFolders[0].uri.fsPath);
                    console.log("loadKleioUrl: mhkHome at: ", this.mhkHome)

                    // this.loadProperty(filePath, "kleio_url").then((response: any) => {
                    //     if (!response.error) {
                    //         let parsedUrl = url.parse(response);
                    //         this.kleioHost = parsedUrl.hostname ? parsedUrl.hostname : this.kleioHost;
                    //         this.kleioPort = parsedUrl.port ? Number(parsedUrl.port) : this.kleioPort;
                    //         this.client = jayson.Client.http({
                    //             host: this.kleioHost,
                    //             path: this.urlPath,
                    //             port: this.kleioPort
                    //         });
                    //         console.log("Loaded Kleio Server Url: " + response);
                    //     }
                    // }).catch(error => {
                    //     vscode.window.showErrorMessage("Error loading Kleio Server url: translation services will not be available.");
                    //     console.log(error);
                    // });
                    if (this.kleioUrlValue) {
                        let parsedUrl = url.parse(this.kleioUrlValue);
                        this.kleioHost = parsedUrl.hostname ? parsedUrl.hostname : this.kleioHost;
                        this.kleioPort = parsedUrl.port ? Number(parsedUrl.port) : this.kleioPort;
                        try {
                            this.client = jayson.Client.http({
                                host: this.kleioHost,
                                path: this.urlPath,
                                port: this.kleioPort
                            });
                            console.log("Sucessfully connects to " + this.kleioUrlValue)
                        } catch (error) {
                            vscode.window.showErrorMessage("Error while connecting Kleio Server url at "+this.kleioUrlValue);
                            console.log(error);
                        }
                    } else {
                        vscode.window.showErrorMessage("Could not determine the Url of kleio server");
                    }


                }
            });
        }

        /**
         * Loads Kleio Server admin token from mhk-home or from VSCode settings
         */
        loadAdminToken(): Promise<string> {
            console.log('loadAdminToken: Loading admin token');

            return new Promise<string>((resolve) => {
                if (vscode.workspace.workspaceFolders) {
                    if (vscode.workspace.getConfiguration("timelink.kleio").kleioServerToken) {
                        // Ignore token from configuration files...
                        // Using custom admin token from VSC settings
                        console.log('Using custom admin token from  VS Code settings: ');
                        console.log(this.token);
                        resolve(this.token!);
                        return;
                    }

                    this.findMHKHome(vscode.workspace.workspaceFolders[0].uri.fsPath);
                    if (this.mhkHome) {
                        //let propPath = path.join(this.mhkHome, this.propertiesPath);
                        //propPath = this.propertiesFullPath
                        //this.loadProperty(propPath, "mhk.kleio.service.token.admin").then((response: any) => {
                        //     if (!response.error) {
                        //         this.token = response.replace("mhk.kleio.service.token.admin=", "");
                        //         resolve(this.token!);
                        //     }
                        if (this.kleioTokenValue) {
                            this.token = this.kleioTokenValue;
                            resolve(this.token);
                        } else {
                            vscode.window.showErrorMessage("Error loading Kleio admin token: translation services will not be available.");
                        }
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
                console.log("Requesting file status of " + 
                this.relativeUnixPath(filePathNormalized))
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
            console.log("Requesting translation of " + filePathNormalized)
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