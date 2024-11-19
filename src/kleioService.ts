/**
 * Kleio translation services for Timelink provides access to translation services of Kleio files.
 */

import * as jayson from 'jayson';
import Docker from 'dockerode';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import * as os from 'os';

export module KleioServiceModule {

    export class KleioService {
        private static instance: KleioService;

        private kleioHost: string = "localhost";
        private kleioPort: number = 8088;
        private token?: string;
        private mhkHome: string = "";
        private propertiesPath: string = "/system/conf/mhk_system.properties";
        private urlPath: string = "/json/";
        private kleioVersion?: string;
        private stopDuplicates: boolean = false;
        private workspaceDirectory?: string;

        // client with default properties... 
        // will try to get url property from .mhk at user's home at runtime
        private client!: jayson.Client;

        // Docker client that retrieves status during runtime
        private dockerClient!: Docker;

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
                // There's already a token within the extension preferences.
                console.log("Init Kleio Server with custom extension properties");
                this.initJsonClient();
            } else {
                // No token proprities were found.
                console.log("Init Kleio Server with configuration properties");
                // this.loadAdminToken(); // Find the variable MHKHome.
                // this.loadKleioUrl();
                this.loadKleioInfo();

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
                    //this.findMHKHome(vscode.workspace.workspaceFolders[0].uri.fsPath);
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
                    //this.findMHKHome(vscode.workspace.workspaceFolders[0].uri.fsPath);
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
         * Attempts to retrieve Kleio server information from running docker instances
         */
        async loadKleioInfo() {

            this.dockerClient = new Docker();
            console.log("Attempting to retrieve Kleio server info from Docker.");
            // Retrieve Kleio Home
            this.findLocalKleioHome()
            
            // Check if containers are running and retrieve them if the server home is the same as local
            const container = await this.isServerRunning()
            
            if (container){
                // Get token/URL
                console.log("Server with kleio home found. Getting token and url...")
                this.getKServerToken(container)
            }
            else {
                // Spin up new Docker Container with mhkHome and new token/port
                console.log("No server with current Kleio Home found. Starting a new container...")
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
                    this.findKleioHomeDirectory(this.workspaceDirectory, timelinkHomeNames)
                    if(!this.mhkHome){
                        this.mhkHome = this.workspaceDirectory
                    }
                }

            }

            console.log("Kleio Home set to:", this.mhkHome)
        }

        /**
         * Iteratively check directories above/below home directory for the Kleio Home name. If it doesn't exist, check 
         */

        findKleioHomeDirectory(currentPath: any, timelinkHomeNames: string[]){
            
            let dirPath = currentPath;
            
            const userHome = os.homedir();

            while (dirPath !== userHome) {
                for (const homeDir of timelinkHomeNames) {
                    if (fs.existsSync(path.join(dirPath, homeDir)) && fs.lstatSync(path.join(dirPath, homeDir)).isDirectory()) {
                        this.mhkHome = path.join(dirPath, homeDir);
                        break;
                    }
                }
                if(this.mhkHome) break;
                
                const parentDir = path.dirname(dirPath);

                if (parentDir === dirPath) break; // Reached root
                
                dirPath = parentDir;
            }

            // If not, check directories under current working directory.
            if (!this.mhkHome) {
                const stack = [currentPath];
        
                while (stack.length > 0) {
                    const dir = stack.pop()!;
                    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                        if (entry.isDirectory() && !entry.name.startsWith('.')) { // Don't search hidden folders.
                            
                            const subDirName = entry.name;
        
                            if (timelinkHomeNames.includes(subDirName)) {
                                this.mhkHome = path.join(dir, subDirName);
                                break;
                            }
        
                            stack.push(path.join(dir, subDirName));
                        }
                    }
                    if (this.mhkHome) {
                        break;
                    }
                }
            }
        }

        /**
         * Check if a kleio server is running in docker mapped to a given kleio home directory.
         */
        async isServerRunning(): Promise<Docker.ContainerInfo | null> {

            const isRunning = await this.isDockerRunning(); // Wait for Docker check to complete
            if (isRunning) {
                console.log('Docker is running: Checking for all Kleio image instances...');
                const container = await this.getKServerContainer()
                return container;
            } else {
                console.log('Docker is not running.');
                vscode.window.showErrorMessage('ERROR: Docker is not running.');
                return null;
            }

        }

        /**
         * Check if Docker is running.
         */
        async isDockerRunning(): Promise<boolean> {
            try {
                await this.dockerClient.ping();
                return true;
            } catch (error) {
                console.error("Could not connect to Docker. Is it running?", error);
                return false;
            }
        }


        /**
         * Check if a kleio server is running in docker, possibly mapped to a given kleio home directory.
         */
        async getKServerContainer(){

            const containers = await this.getKServerContainerList();

            if(!containers || containers.length === 0) {
                console.log("No containers found running a Kleio image instance.")
                return null;
            }
            else if(this.mhkHome) {
                
                let found = false;
                let firstFound = null;

                containers.forEach(container => {
                    const kleioHomeMount = container.Mounts.filter((mount: any) => mount.Destination === '/kleio-home');
                    if ((kleioHomeMount.length > 0 && this.normalizeDockerPath(kleioHomeMount[0].Source) === path.normalize(this.mhkHome))) {
                        if(!found){
                            found = true;
                            firstFound = container;
                        }
                        else {
                            if (this.stopDuplicates){
                                console.log(`Duplicate container found (ID: ${container.Id}). Stopping and removing it..`)
                                this.dockerClient.getContainer(container.Id).stop()
                                this.dockerClient.getContainer(container.Id).remove()
                            }
                        }
                    }
                });

                if (!found){
                    return null;
                }
                else{
                    return firstFound;
                }
            }
            else {
                return containers[0];
            }
        }

        /**
         * Normalize docker path according to OS so we can find kleio home.
         */
        normalizeDockerPath(dockerPath: string): string {
            const platform = process.platform;
        
            if (platform === 'win32') {
                const driveLetterMatch = dockerPath.match(/^\/run\/desktop\/mnt\/host\/([a-zA-Z])\/(.*)/);
                if (driveLetterMatch) {
                    const driveLetter = driveLetterMatch[1].toLowerCase();
                    const relativePath = driveLetterMatch[2];
                    const windowsPath = `${driveLetter}:\\${relativePath.replace(/\//g, '\\')}`;
                    console.log(path.normalize(windowsPath))
                    return path.normalize(windowsPath);
                }
            }
        
            if (platform === 'linux' || platform === 'darwin') {
                if (dockerPath.startsWith('/run/desktop/mnt/host/')) {
                    const dockerNormalizedPath = dockerPath.replace('/run/desktop/mnt/host/', '/');
                    return path.normalize(dockerNormalizedPath); // Normalize path for Unix-based systems
                }
            }

            return path.normalize(dockerPath);
        }

         /**
         * Get the Kleio server containers currently running in docker
         */
        async getKServerContainerList() {
            const isRunning = await this.isDockerRunning(); // Wait for Docker check to complete
            if (isRunning) {
                // Retrieve all containers and iterate over their image name to find if they are runing a kleio-server
                const allContainers = await this.dockerClient.listContainers();
                
                let containers: Docker.ContainerInfo[] = [];

                if (!this.kleioVersion) {
                    containers = allContainers.filter(container => container.Image.includes('kleio-server:'));
                }
                else{
                    containers = allContainers.filter(container => container.Image.includes(`kleio-server:${this.kleioVersion}`));
                }
                return containers;
            } else {
                console.log('Docker is not running.');
                vscode.window.showErrorMessage('ERROR: Docker is not running.');
                return null;
            }          
        }

        /**
         * Get the Kleio server container admin token and url.
         */
        async getKServerToken(container: Docker.ContainerInfo) {

            if(!container) {
                const container_list = await this.getKServerContainerList();
                if(container_list){
                    container = container_list[0]
                }
            }
            
            const containerDetails = await this.dockerClient.getContainer(container.Id).inspect()

            this.token = containerDetails.Config.Env.filter((env: string) => env.startsWith("KLEIO_ADMIN_TOKEN"))[0].split("=")[1];

            const exposedPort = container.Ports.find(port => port.PublicPort);
            if (exposedPort) {
                this.kleioHost = exposedPort.IP === "0.0.0.0" ? "localhost" : exposedPort.IP;
                this.kleioPort = Number(exposedPort.PublicPort)
            } else {
                console.error("Could not retrieve hostname and port.")
            }

            console.log("Token found:", this.token)
            console.log("Kleio URL: ", `http://${this.kleioHost}:${this.kleioPort}`)
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