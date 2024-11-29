/**
 * Kleio translation services for Timelink provides access to translation services of Kleio files.
 */

import * as jayson from 'jayson';
import Docker from 'dockerode';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';

export module KleioServiceModule {

    export class KleioService {
        private static instance: KleioService;

        private kleioUrl: string = "http://localhost:8088";
        private token?: string;
        private mhkHome: string = "";
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
                this.loadKleioInfo();

            }
        }

        initJsonClient() {
 
            var section: string = "timelink.kleio";
            
            // If any of these configurations are empty, setup through Docker instead.
            if (vscode.workspace.getConfiguration(section).kleioServerUrl) {
                this.kleioUrl = vscode.workspace.getConfiguration(section).kleioServerUrl;
            }
            if (vscode.workspace.getConfiguration(section).kleioServerToken) {
                this.token = vscode.workspace.getConfiguration(section).kleioServerToken;
            }
            if (vscode.workspace.getConfiguration(section).kleioServerHome) {
                this.mhkHome = vscode.workspace.getConfiguration(section).kleioServerHome;
            }

            // Check if all settings exist
            if(!this.mhkHome || !this.token || !this.kleioUrl) {
                console.log("One or more configurations necessary to initiate the JSON Client are missing. Retrieving through Docker...")
                vscode.window.showInformationMessage("One or more configurations necessary to initiate the JSON Client are missing. Retrieving through Docker....");
                console.log(this.mhkHome, this.token, this.kleioUrl)
                this.loadKleioInfo()
                return;
            }

            // Parse url to extract hostname/port
            const url = new URL(this.kleioUrl);
            let kleioHost = url.hostname;
            let kleioPort = parseInt(url.port, 10);

            this.client = jayson.Client.http({
                host: kleioHost,
                path: this.urlPath,
                port: kleioPort
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
                await this.getKServerToken(container)

            }
            else {
                // Spin up new Docker Container with mhkHome and new token/port
                console.log("No server with current Kleio Home found. Starting a new container...")
                vscode.window.showInformationMessage("No server with current Kleio Home found. Starting a new container...");

                const version = "latest"
                const updateOnCheckbox = vscode.workspace.getConfiguration().get<boolean>('timelink.explorer.updateKleioImage', false);
                await this.startKleioServer(undefined, version, updateOnCheckbox)
            }

            this.initJsonClient()
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
         *  Starts a kleio server in docker.
         */
        async startKleioServer(
            image: string = "timelinkserver/kleio-server",
            version: string | null = null,
            update: boolean = false,
            kleioHome: string | null = null,
            kleioAdminToken: string | null = null,
            kleioServerPort="8088",
            kleioExternalPort: number | null = null,
            kleioServerWorkers="3",
            kleioIdleTimeout=900,
            kleioConfDir=null,
            kleioSourceDir=null,
            kleioStruDir=null,
            kleioTokenDb=null,
            kleioDefaultStru=null,
            kleioDebug=null,
            consistency: string = "cached",
            reuse: boolean = true,
        ): Promise <Docker.Container | null> {
            
            const isRunning = await this.isDockerRunning(); // Wait for Docker check to complete
            
            if (!isRunning) {
                console.error('Attempted to start a kleio server, but Docker is not running.');
                vscode.window.showErrorMessage('Error: Attempted to start a kleio server, but Docker is not running.');
                return null;
            }

            let exists = await this.getKServerContainer()

            if (update){
                console.log("Update option set to true - pulling latest image...")
                vscode.window.showInformationMessage("Update option set to true - pulling latest image...");
                let getVersion = version ? version : "latest";
                const currentImage = await this.dockerClient.getImage(`timelinkserver/kleio-server:${getVersion}`);
                
                try {

                    console.log("Retrieving latest kleio-server image...")
                    const latestImage = await this.dockerClient.pull(`${image}:${getVersion}`);

                    // Listen for updates on the pull status
                    latestImage.on('data', (data: Buffer) => {
                        const output = data.toString();
                        try {
                            const parsedData = JSON.parse(output);
                            if (parsedData.status) {
                                console.log(`Status: ${parsedData.status} \r`);
                            }

                        } catch (error) {
                        }
                    });
            
                    // Wait for the stream to end (meaning the image has been pulled)
                    await new Promise((resolve, reject) => {
                        latestImage.on('end', resolve);
                        latestImage.on('error', reject); 
                    });
            
                    console.log(`Image ${image}:${getVersion} pulled successfully.`);
                    vscode.window.showInformationMessage(`Image ${image}:${getVersion} pulled successfully.`);

                    const images = await this.dockerClient.listImages();
                    const pulledImage = images.find(img => 
                        img.RepoTags && img.RepoTags.includes(`${image}:${getVersion}`)
                    );
                    if (pulledImage){
                        if (pulledImage.Id !== currentImage.id){
                            console.log(`A newer image was downloaded.`);
                            if (exists){
                                console.log("Current container was stopped and removed.");
                                const oldContainer = this.dockerClient.getContainer(exists.Id);
                                await oldContainer.stop();
                                await oldContainer.remove();
                                exists = null;
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error occurred while pulling the image:", error);
                    
                }

            }

            if (exists){
                if (reuse){
                    console.log(`Found container running Kleio, and reuse is set to true.`)
                    return this.dockerClient.getContainer(exists.Id);
                }
                else{
                    console.log(`Found container running Kleio, but reuse is set to false. Stopping and removing container.`)
                    const container = this.dockerClient.getContainer(exists.Id);
                    await container.stop();
                    await container.remove();
                }
            }

            kleioHome = this.mhkHome
            if (!kleioHome){
                if(vscode.workspace.workspaceFolders){
                    kleioHome = this.workspaceDirectory!
                }
                else{
                    kleioHome = process.cwd()
                }
            }
            else {
                kleioHome = path.resolve(kleioHome);
                // Check if the directory exists
                if (!fs.existsSync(kleioHome)) {
                    throw new Error(`Directory ${kleioHome} does not exist`);
                }
            }
            
            if(!kleioAdminToken){
                kleioAdminToken = this.randomToken()
            }

            if(!kleioExternalPort){
                kleioExternalPort = await this.findFreePort()
            }
            
            const kleioEnv: { [key: string]: string | number | null } = {};
            
            if (kleioConfDir !== null) { kleioEnv["KLEIO_CONF_DIR"] = kleioConfDir; }
            if (kleioSourceDir !== null) { kleioEnv["KLEIO_SOURCE_DIR"] = kleioSourceDir; }
            if (kleioStruDir !== null) { kleioEnv["KLEIO_STRU_DIR"] = kleioStruDir; }
            if (kleioTokenDb !== null) { kleioEnv["KLEIO_TOKEN_DB"] = kleioTokenDb; }
            if (kleioDefaultStru !== null) { kleioEnv["KLEIO_DEFAULT_STRU"] = kleioDefaultStru; }
            if (kleioDebug !== null) { kleioEnv["KLEIO_DEBUG"] = kleioDebug; }
            if (kleioServerWorkers !== null) { kleioEnv["KLEIO_SERVER_WORKERS"] = kleioServerWorkers; }
            if (kleioIdleTimeout !== null) { kleioEnv["KLEIO_IDLE_TIMEOUT"] = kleioIdleTimeout; }
            if (kleioAdminToken !== null) { kleioEnv["KLEIO_ADMIN_TOKEN"] = kleioAdminToken; }
            if (kleioHome !== null) { kleioEnv["KLEIO_HOME"] = kleioHome; }
            if (kleioServerPort !== null) { kleioEnv["KLEIO_SERVER_PORT"] = kleioServerPort; }

            try {
                const kleioContainer = await this.dockerClient.createContainer({
                    Image: `${image}:${version}`,
                    Tty: true,
                    ExposedPorts: {
                        [`${kleioServerPort}/tcp`]: {}
                    },
                    Env: Object.entries(kleioEnv).map(([key, value]) => `${key}=${value}`),
                    HostConfig: {
                        PortBindings: {
                            [`${kleioServerPort}/tcp`]: [{ HostPort: `${kleioExternalPort}` }]
                        },
                        Binds: [`${kleioHome}:/kleio-home:${consistency}`]
                    }
                });
        
                await kleioContainer.start();
                let timeout = 15
                let stopTime = 1
                let elapsedTime = 0

                const container = this.dockerClient.getContainer(kleioContainer.id);
                while (elapsedTime < timeout) {
                    const containerInfo = await container.inspect();
                    
                    if (containerInfo.State.Status === 'running') {
                        this.token = kleioAdminToken
                        console.log("Kleio server started successfully.");
                        vscode.window.showInformationMessage("Kleio server started successfully.");
                        console.log("Kleio URL: ", this.kleioUrl)
                        console.log("Token set to:", this.token)
                        return container;
                    }
                    
                    // Wait for stopTime before checking again
                    await new Promise(resolve => setTimeout(resolve, stopTime * 1000));
                    elapsedTime += stopTime;
                }
                throw new Error("Kleio server did not start within the alloted time.");
            } catch (error) {
                console.error('Error starting Kleio container:', error);
                throw error;
            }
        }

        /**
         * Generate a random token
         */
        randomToken(length: number = 32): string{

            const alphabet: string = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
            const randomValues = new Uint8Array(length);
            crypto.getRandomValues(randomValues); // Securely generate random values~
            
            let token = "";
            for (let i = 0; i < length; i++) {
                token += alphabet[randomValues[i] % alphabet.length]; // Map random value to an alphabet index
            }

            return token;
        }

        /**
         * Find next available port to serve Kleio on.
         */
        findFreePort(fromPort: number = 8088, toPort: number = 8099): Promise<number> {
            return new Promise((resolve, reject) => {
                // Try each port in the range once
                const tryPort = (port: number) => {
                    const server = net.createServer();
                    server.once('error', () => {
                        // If the port is already in use, resolve nothing and move to the next port
                        console.log(`Port ${port} already in use.`)
                        server.close();
                        if (port < toPort) {
                            tryPort(port + 1); // Try the next port
                        } else {
                            reject(new Error(`No free ports available in the range ${fromPort}-${toPort}`));
                        }
                    });
        
                    server.once('listening', () => {
                        // Port is free, resolve with this port and close the server
                        console.log(`Port ${port} available - will be used to start server.`)
                        server.close();
                        resolve(port);
                    });
        
                    server.listen(port, 'localhost');
                };
        
                tryPort(fromPort); // Start with the first port in the range
            });
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
                vscode.window.showErrorMessage('Error: Docker is not running.');
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

                for(const container of containers) {
                    const kleioHomeMount = container.Mounts.filter((mount: any) => mount.Destination === '/kleio-home');
                    if ((kleioHomeMount.length > 0 && this.normalizeDockerPath(kleioHomeMount[0].Source) === path.normalize(this.mhkHome))) {
                        console.log("Server with matching home found at:", this.normalizeDockerPath(kleioHomeMount[0].Source))
                        if(!found){
                            found = true;
                            firstFound = container;
                        }
                        else {
                            if (this.stopDuplicates){
                                console.log(`Duplicate container found (ID: ${container.Id}). Stopping and removing it..`)
                                const container_to_remove = this.dockerClient.getContainer(container.Id)
                                await container_to_remove.stop()
                                await container_to_remove.remove()
                            }
                        }
                    }
                };

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
                vscode.window.showErrorMessage('Error: Docker is not running.');
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
                const kleioHost = exposedPort.IP === "0.0.0.0" ? "localhost" : exposedPort.IP;
                const kleioPort = Number(exposedPort.PublicPort)
                this.kleioUrl = `http://${kleioHost}:${kleioPort}`
            } else {
                console.error("Could not retrieve hostname and port.")
            }

            console.log("Token found:", this.token)
            console.log("Kleio URL: ", this.kleioUrl)
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