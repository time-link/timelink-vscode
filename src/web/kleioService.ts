/**
 * Kleio translation services for Timelink provides access to translation services of Kleio files.
 */

// import * as jayson from 'jayson';
import { JSONRPCClient } from "json-rpc-2.0";

import * as vscode from 'vscode';
import * as path from 'path';
// import * as url from 'url';

export module KleioServiceModule {

    export class KleioService {
        private static instance: KleioService;

        private kleioUrl: string = "http://localhost:8088";
        private localServer: string = "http://localhost:3000";
        private token?: string;
        private urlPath: string = "/json/";
        private mhkHome: string = "";
        private kleioHome: string = "";
        private propertiesPath: string = "/system/conf/mhk_system.properties";
        private propertiesFile: string = "mhk_system.properties";

        private client!: JSONRPCClient;

        // Docker client that retrieves status during runtime
        private kleioVersion: string = "latest";
        private stopDuplicates: boolean = false;
        private workspaceDirectory?: string;

        constructor() {
            this.init();
        }

        static getInstance(): KleioService {
            if (!KleioService.instance) {
                KleioService.instance = new KleioService();
            }
            return KleioService.instance;
        }

        async init() {
            if (vscode.workspace.getConfiguration("timelink.kleio").kleioServerToken) {
                console.log("Init Kleio Server with custom extension properties");
                this.initJsonClient();
            } else {
                console.log("Init Kleio Server with configuration properties");
                console.log("Retrieving Kleio Home from active server...");
                
                // Retrieve Kleio Home
                this.findLocalKleioHome()

                // Get token and URL info from Docker
                console.log("Retrieving Kleio Server information from Docker...");
                await this.loadSettingsFromDocker()
                this.initJsonClient();
            }
        }

        /**
         *  Find kleio home directory.
         */
        findLocalKleioHome() {
            
            const timelinkHomeNames = ["kleio-home", "timelink-home", "mhk-home"];
            
            if(vscode.workspace.workspaceFolders){

                //1 - Determine base workspace directory and save it as the current directory.
                this.workspaceDirectory = vscode.workspace.workspaceFolders[0].uri.fsPath
                const baseName = path.basename(this.workspaceDirectory)

                if (timelinkHomeNames.includes(baseName)) {
                    //2. If basename matches expected Timelink Home Names set it as the Kleio Home.
                    this.mhkHome = this.workspaceDirectory
                }
                else{
                    //3. If not, recursively check directories above/below current directory for Kleio Home.
                    this.fetchKleioHome(this.workspaceDirectory)
                    if(!this.mhkHome){
                        this.mhkHome = this.workspaceDirectory
                    }
                }

            }
            console.log("Kleio Home set to:", this.mhkHome)
        }

        fetchKleioHome = async (workspaceDirectory: string) => {
            try {
                const response = await fetch(`${this.localServer}/find-kleio-home?workspacePath=${workspaceDirectory}`);
                const data = await response.json();
                if(data.kleioHome !== null){
                    this.mhkHome = data.kleioHome
                }
            } catch (error) {
                console.error('Error:', error);
            }
        };

        /**
         * Attempts to retrieve Kleio server information from running docker instances
         */
        loadSettingsFromDocker = async () => {
            
            const updateOnCheckbox = vscode.workspace.getConfiguration().get<boolean>('timelink.explorer.updateKleioImage', false);
            console.log("IS UPDATE ON:", updateOnCheckbox)
            
            try {
                console.log("Connecting to Node backend...")

                const response = await fetch(
                                    `${this.localServer}/is-server-running?` +
                                    `kleiohome=${encodeURIComponent(this.mhkHome)}&` +
                                    `stopduplicates=${this.stopDuplicates}&` +
                                    `update=${updateOnCheckbox}&` +
                                    `updateversion=${encodeURIComponent(this.kleioVersion)}`
                                );
                const data = await response.json();
                
                if (data.isDockerRunning && data.token) {
                    console.log("TOKEN AND URL FOUND!")
                    console.log("Kleio Token:", data.token)
                    console.log("Kleio URL:", data.kleiourl)
                    this.kleioUrl = data.kleiourl as string;
                    this.token = data.token as string;

                } else {
                    console.log("Could not retrieve Token and URL from Docker.");
                }
            } catch (error) {
                console.log('Error connecting to Node server endpoint:', error);
            }
        };

        initJsonClient() {
            var section: string = "timelink.kleio";
            if (vscode.workspace.getConfiguration(section).kleioServerUrl) {
                this.kleioUrl = vscode.workspace.getConfiguration(section).kleioServerUrl;
            }
            if (vscode.workspace.getConfiguration(section).kleioServerToken) {
                this.token = vscode.workspace.getConfiguration(section).kleioServerToken;
            }
            if (vscode.workspace.getConfiguration(section).kleioServerHome) {
                this.mhkHome = vscode.workspace.getConfiguration(section).kleioServerHome;
            }
            // ???
            this.kleioHome = "";

            this.client = new JSONRPCClient((jsonRPCRequest) =>
                fetch(this.kleioUrl.concat(this.urlPath), {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                    },
                    body: JSON.stringify(jsonRPCRequest),
                }).then((response) => {
                    console.log("JSONRPCClient");
                    console.log(response);
                    if (response.status === 200) {
                        // Use client.receive when you received a JSON-RPC response.
                        return response
                            .json()
                            .then((jsonRPCResponse) => this.client.receive(jsonRPCResponse));
                    } else if (jsonRPCRequest.id !== undefined) {
                        return Promise.reject(new Error(response.statusText));
                    }
                })
            );
        }

        /**
         * Recursively finds file name in parent folder hierarchy
         */
        async findFile(currentPath: any, fileName: string): Promise<any> {
            if (currentPath === path.sep) { // root folder, no mhk home found
                return null;
            } else {
                try {
                    // stat will throw an exception if file doesn't exist
                    await vscode.workspace.fs.stat(vscode.Uri.parse(path.join(currentPath, path.sep, fileName)));
                    return currentPath;
                } catch {
                    // ignored
                }

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

        async findMHKHome(fsPath: any) {
            console.log("MHK Home find in: " + fsPath);
            if (!this.mhkHome) {
                // find .mhk file in hierarchy
                // this doesn't work with the web extensions as we don't have full file access
                this.mhkHome = await this.findFile(fsPath, ".mhk-home");
                this.propertiesPath = "/system/conf/mhk_system.properties";
            }

            // couldn't file mhk-home, try with .mhk file
            if (!this.mhkHome) {
                this.mhkHome = await this.findFile(fsPath, ".mhk");
                this.propertiesPath = "/.mhk";
                this.propertiesFile = ".mhk";
            }

            // new version, find a .kleio file
            if (!this.mhkHome) {
                this.mhkHome = fsPath; // using project root path as mhk home
                this.propertiesPath = "/.kleio";
                this.propertiesFile = ".kleio";
            }

            console.log("MHK Home is: " + this.mhkHome);
        }

        /**
         * Loads Kleio Server params from .mhk or .kleio
         */
        loadKleioParams(): Promise<string> {
            console.log('Loading Kleio Url from ' + this.mhkHome);
            return new Promise<string>(async (resolve) => {
                if (vscode.workspace.workspaceFolders) {
                    //await this.findMHKHome(vscode.workspace.workspaceFolders[0].uri.fsPath);
                    if (this.mhkHome) {
                        let propPath = path.join(this.mhkHome, this.propertiesPath);

                        // check kleio_home
                        let kleioHomePropKey = (this.propertiesFile === ".kleio") ? "kleio_home" : "mhk.home.dir";
                        this.loadProperty(propPath, kleioHomePropKey).then((response: any) => {
                            if (!response.error) {
                                this.kleioHome = response;
                                console.log("Loaded Kleio Home: " + response);
                            }
                        }).catch(error => {
                            vscode.window.showErrorMessage("Error loading Kleio Home: translation services will not be available.");
                            console.log(error);
                        });

                        // check kleio_url
                        let propKey = (this.propertiesFile === ".kleio") ? "kleio_url" : "mhk.kleio.service";
                        this.loadProperty(propPath, propKey).then((response: any) => {
                            if (!response.error) {
                                this.kleioUrl = response;
                                this.initJsonClient();
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
            // TODO: change this to load from repo
            return new Promise<string>(async (resolve) => {
                if (vscode.workspace.workspaceFolders) {
                    await this.findMHKHome(vscode.workspace.workspaceFolders[0].uri.fsPath);
                    if (this.mhkHome) {
                        let propPath = path.join(this.mhkHome, this.propertiesPath);
                        console.log(propPath);
                        let propKey = (this.propertiesFile === ".kleio") ? "kleio_token" : "mhk.kleio.service.token.admin";
                        this.loadProperty(propPath, propKey).then((response: any) => {
                            if (!response.error) {
                                this.token = response.replace(propKey.concat("="), "");
                                console.log('Loaded admin token: ' + this.token);
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

            return path.normalize(this.pathToUnix(this.kleioHome.concat(stringPath.replace(this.mhkHome, ""))));
        }


        /**
         * Get a file. Obtains a link to download a file specified in the Path parameter
         */
        translationsGet(filePath: string, status: string = "") {
            let filePathNormalized = this.relativeUnixPath(path.normalize(filePath));

            console.log("translationsGet " + filePathNormalized);

            return new Promise<any>((resolve, reject) => {
                let params = <any>{
                    "path": filePathNormalized,
                    "recurse": "yes",
                    "token": this.token
                };

                if (status !== "") {
                    params.status = status;
                }

                console.log(params);

                return this.client
                    .request("translations_get", params)
                    .then((result: any) => {
                        console.log('>>>> translations_get');
                        resolve(result);
                    });

            });
        }

        /**
         * Start a translation.
         * If path points to a directory translates files in the directory
         */
        translationsTranslate(filePath: string): Promise<any> {
            let filePathNormalized = path.normalize(filePath);
            // if (!this.mhkHome || !filePathNormalized.includes(this.mhkHome)) {
            //     console.log("MHK Home and File Path:");
            //     console.log(this.mhkHome);
            //     console.log(filePath);
            //     throw new Error("File Path not in MHK Home");
            // }

            return new Promise<any>((resolve) => {
                let params = {
                    "path": this.relativeUnixPath(filePathNormalized),
                    "spawn": "no",
                    "token": this.token
                };
                console.log('>>>> ');
                console.log(params);
                return this.client
                    .request("translations_translate", params)
                    .then((result: any) => {
                        console.log('>>>>');
                        console.log(result);
                        console.log('>>>>');
                        resolve(result);
                    });
                // return this.client.request('translations_translate', params, function (err: any, response: any) {
                //     if (err) { throw err; }
                //     resolve(response);
                // });
            });
        }
    }
}