import express from 'express';
import os from 'os';
import fs from 'fs';
import path from 'path';
import Docker from 'dockerode';
import * as net from 'net';

const crypto = require('crypto');
const cors = require('cors');
const app = express();
const port = 3000;
const docker = new Docker();
app.use(cors());


/**
 * Iteratively check directories above/below home directory for the Kleio Home name.
 */

const findKleioHomeDirectory = (currentPath: string): string | null => {
    
    let dirPath = currentPath;
    let kleioHome = ""
    const timelinkHomeNames = ["kleio-home", "timelink-home", "mhk-home"];

    const userHome = os.homedir();
    while (dirPath !== userHome) {

        for (const homeDir of timelinkHomeNames) {
            if (fs.existsSync(path.join(dirPath, homeDir)) && fs.lstatSync(path.join(dirPath, homeDir)).isDirectory()) {
                kleioHome = path.join(dirPath, homeDir);
                break;
            }
        }

        if(kleioHome) break;

        const parentDir = path.dirname(dirPath);

        if (parentDir === dirPath) break; // Reached root
        
        dirPath = parentDir;
    }

    // If not, check directories under current working directory.~
    if (!kleioHome) {
        const stack = [currentPath];

        while (stack.length > 0) {
            const dir = stack.pop()!;
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) { // Don't search hidden folders.
                    
                    const subDirName = entry.name;

                    if (timelinkHomeNames.includes(subDirName)) {
                        kleioHome = path.join(dir, subDirName);
                        break;
                    }

                    stack.push(path.join(dir, subDirName));
                }
            }
            if (kleioHome) {
                break;
            }
        }
    }

    return kleioHome
}

/**
 * Check if Docker is running.
 */
async function isDockerRunning(): Promise<boolean> {
    try {
        await docker.ping();
        return true;
    } catch (error) {
        console.error("Could not connect to Docker. Is it running?", error);
        return false;
    }
}

/**
 * Normalize docker path according to OS so we can find kleio home.
 */
function normalizeDockerPath(dockerPath: string): string {
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
 * Check if a kleio server is running in docker, possibly mapped to a given kleio home directory.
 */
async function getKServerContainer(kleioHome: string, stopDuplicates: boolean = false){

    const containers = await getKServerContainerList();

    if(!containers || containers.length === 0) {
        console.log("No containers found running a Kleio image instance.")
        return null;
    }
    else if(kleioHome) {
        
        let found = false;
        let firstFound = null;

        for(const container of containers) {
            const kleioHomeMount = container.Mounts.filter((mount: any) => mount.Destination === '/kleio-home');
            if ((kleioHomeMount.length > 0 && normalizeDockerPath(kleioHomeMount[0].Source) === path.normalize(kleioHome))) {
                console.log("Server with matching home found at:", normalizeDockerPath(kleioHomeMount[0].Source))
                if(!found){
                    found = true;
                    firstFound = container;
                }
                else {
                    if (stopDuplicates){
                        console.log(`Duplicate container found (ID: ${container.Id}). Stopping and removing it..`)
                        const container_to_remove = docker.getContainer(container.Id)
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
 * Get the Kleio server containers currently running in docker
 */
async function getKServerContainerList() {
    const isRunning = await isDockerRunning(); // Wait for Docker check to complete
    if (isRunning) {
        // Retrieve all containers and iterate over their image name to find if they are runing a kleio-server
        const allContainers = await docker.listContainers();
        
        let containers: Docker.ContainerInfo[] = [];

        // Select any version of kleio for now
        // TODO: Implement version controlling
        containers = allContainers.filter(container => container.Image.includes('kleio-server:'));
  
        return containers;
    } else {
        console.log('Docker is not running.');
        return null;
    }          
}

/**
 * Get the Kleio server container admin token and url.
 */
async function getKServerToken(container: Docker.ContainerInfo) {
    
    const containerDetails = await docker.getContainer(container.Id).inspect()
    const token = containerDetails.Config.Env.filter((env: string) => env.startsWith("KLEIO_ADMIN_TOKEN"))[0].split("=")[1];
    let kleioUrl = ''

    const exposedPort = container.Ports.find(port => port.PublicPort);
    if (exposedPort) {
        const kleioHost = exposedPort.IP === "0.0.0.0" ? "localhost" : exposedPort.IP;
        const kleioPort = Number(exposedPort.PublicPort)
        kleioUrl = `http://${kleioHost}:${kleioPort}`
    } else {
        console.error("Could not retrieve hostname and port: Docker image has no exposed port.")
    }

    return {token: token, kleioUrl: kleioUrl}

}

/**
 *  Starts a kleio server in docker.
 */
async function startKleioServer(
                    kleioHome: string = "",
                    version: string | null = null,
                    update: boolean = false,
                    kleioAdminToken: string | null = null,
                    image: string = "timelinkserver/kleio-server",
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
                ) {
    

    let exists = await getKServerContainer(kleioHome, reuse)

    if (update){
        console.log("Update is set to True - retrieving the latest image.")
        let getVersion = version ? version : "latest";
        const currentImage = await docker.getImage(`timelinkserver/kleio-server:${getVersion}`);
        
        try {

            console.log("Retrieving latest kleio-server image...")
            const latestImage = await docker.pull(`${image}:${getVersion}`);

            // Listen for updates on the pull status
            latestImage.on('data', (data: string) => {
                try {
                    const parsedData = JSON.parse(data);  // Assuming 'data' is already a string
                    if (parsedData.status) {
                        console.log(`Status: ${parsedData.status} \r`);
                    }
                } catch (error) {
                    console.error('Error parsing data:', error);
                }
            });
    
            // Wait for the stream to end (meaning the image has been pulled)
            await new Promise((resolve, reject) => {
                latestImage.on('end', resolve);
                latestImage.on('error', reject); 
            });
    
            console.log(`Image ${image}:${getVersion} pulled successfully.`);
            const images = await docker.listImages();
            const pulledImage = images.find(img => 
                img.RepoTags && img.RepoTags.includes(`${image}:${getVersion}`)
            );
            if (pulledImage){
                if (pulledImage.Id !== currentImage.id){
                    console.log(`A newer image was downloaded.`);
                    if (exists){
                        console.log("Current container was stopped and removed.");
                        const oldContainer = docker.getContainer(exists.Id);
                        await oldContainer.stop();
                        await oldContainer.remove();
                        exists = null;
                    }
                }
                else{
                    console.log("Pulled a new image but old image already was on the latest version.")
                }
            }
        } catch (error) {
            console.error("Error occurred while pulling the image:", error);
            
        }

    }

    if (exists){
        if (reuse){
            console.log(`Found container running Kleio, and reuse is set to true.`)
            return getKServerToken(exists);
        }
        else{
            console.log(`Found container running Kleio, but reuse is set to false. Stopping and removing container.`)
            const container = docker.getContainer(exists.Id);
            await container.stop();
            await container.remove();
        }
    }
    
    if(!kleioAdminToken){
        kleioAdminToken = randomToken()
    }

    if(!kleioExternalPort){
        kleioExternalPort = await findFreePort()
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
        const kleioContainer = await docker.createContainer({
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

        const container = docker.getContainer(kleioContainer.id);
        while (elapsedTime < timeout) {
            const containerInfo = await container.inspect();
            
            if (containerInfo.State.Status === 'running') {
                console.log("Kleio server started successfully.");
                const containers = await docker.listContainers();
                const newContainerInfo = containers.find(c => c.Id === kleioContainer.id);
                if(newContainerInfo) {return getKServerToken(newContainerInfo);}
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
function randomToken(length: number = 32): string{

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
function findFreePort(fromPort: number = 8088, toPort: number = 8099): Promise<number> {
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


//API Endpoint for finding local kleio home.
app.get('/find-kleio-home', (req, res) => {
    const workspacePath = req.query.workspacePath as string;

    if (!workspacePath) {
        return void res.status(400).send('workspacePath is required.');
    }

    const kleioHome = findKleioHomeDirectory(workspacePath);
    res.json({ kleioHome: kleioHome || null });
});


//API Endpoint for Docker.
app.get('/is-server-running', async (req, res) => {
    try {
        console.log("DOCKER SERVER REQUEST")
        const kleioHome = req.query.kleiohome as string;
        const stopDuplicates = req.query.stopduplicates === 'true';
        const updateImage = req.query.update === 'true';
        const version = req.query.updateversion as string;

        const isRunning = await isDockerRunning(); // Wait for Docker check to complete

        if (isRunning) {
            console.log('Docker is running: Checking for all Kleio image instances...');
            const container = await getKServerContainer(kleioHome, stopDuplicates);
            if (container){
                // Get token/URL
                console.log("Server with kleio home found. Getting token and url...")
                const containerInfo = await getKServerToken(container)
                console.log("Token found:", containerInfo.token)
                console.log("Kleio URL: ", containerInfo.kleioUrl)
                res.json({ isDockerRunning: true, token: containerInfo.token, kleiourl: containerInfo.kleioUrl});
            }
            else {

                // Spin up new Docker Container with mhkHome and new token/port
                console.log("No server with current Kleio Home found. Starting a new container...")
                const containerInfo = await startKleioServer(kleioHome, version, updateImage)
                console.log("Launched new Kleio server with Token:", containerInfo.token)
                console.log("Launched new Kleio server with URL: ", containerInfo.kleioUrl)
                res.json({ isDockerRunning: true, token: containerInfo.token, kleiourl: containerInfo.kleioUrl});

            }

        } else {
            console.log('Docker is not running.');
            res.json({ isDockerRunning: true, token: null, url: null});
        }

    } catch (error) {
        console.log('Error checking Docker status:', error);
        res.status(500).json({ isDockerRunning: true, token: null, url: null});
    }
});

//API Endpoint to retrieve token.
app.get('/get-token', async (req, res) => {
    try {
        console.log("GET TOKEN REQUEST")
        const kleioHome = req.query.kleiohome as string;
        const isRunning = await isDockerRunning();

        if (isRunning) {
            const container = await getKServerContainer(kleioHome);
            if (container){
                const containerInfo = await getKServerToken(container)
                res.json({ isDockerRunning: true, token: containerInfo.token});
            }

        } else {
            console.log('Attempt to retrieve token failed - Is Docker running?');
            res.json({ isDockerRunning: true, token: null});
        }

    } catch (error) {
        console.log('Error checking Docker status:', error);
        res.status(500).json({ isDockerRunning: true, token: null});
    }
});



// Server start function
app.listen(port, () => {
    console.log(`Backend Node Server for Kleio running at http://localhost:${port}`);
});