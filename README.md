# kleio README

MHK Time Link is a web application that manages databases for micro-historical and genealogical research. It allows source-oriented data input, using Manfred Thaller Kleio notation, record linking and network analysis. The development of MHK is coordinated by Joaquim Carvalho, of the University of Coimbra, Portugal.

This extension adds support for the Kleio notation in Visual Studio Code editor, including Syntax Highlighting, Snippet completion and Kleio Files management (error/warning displaying, translation status filtering, etc).

## Install the extension manually in Visual Studio Code (VS Code)

We recommend installing the extension from the Visual Studio Marketplace. Extensions that you download from the Visual Studio Marketplace are automatically updated by default.

1. Download the latest version of the extension from [repository](https://github.com/time-link/timelink-vscode/raw/master/builds/)
2. Select extensions on VS Code left toolbar
3. Click "More actions" (three dots) and select install from VSIX

## Features

* Syntax Highlighting
* Snippet completion for baptism acts (actos de baptismo).

## Requirements

This bundle requires Visual Studio Code with extensions support.

## Development Notes

### [NEW] Use a dev container for development

This repository includes a `.devcontainer` specification
that allows the development to be done inside a virtual machine. 

To run the dev container the VS Code `Dev Containers` extensions is necessary.

When the repository is opened VS Code detects
the `.devcontainer` folder and sugests to
reopen the repository inside de container.

_The first time this is done the docker
container is created and the dependencies
are installed, which takes a long time. 
Subsequent runs are very fast._

 See https://code.visualstudio.com/docs/devcontainers/containers



### Adding New Features

The grammar was converted from TextMate using the yo code extension generator. The included Time Link bundle (Time Link.tmbundle) can be used to easily make changes to the TextMate grammar, and then convert the bundle to a VSCode extension.

Install yo Yeoman command line utility [more info](https://code.visualstudio.com/api/get-started/your-first-extension):

```console
npm install -g yo generator-code
```

### Create a package:
#### Create a package using vsce (The Visual Studio Code Extension Manager)

Install typescript and extension dependencies
(_if runing in a `dev container`,as explained
above the dependencies are already installed_):
```console
foo@bar:~$ npm install -g typescript
foo@bar:~$ npm install -g vsce
foo@bar:~$ cd timelink-vscode
user@timelink-vscode:~$ npm install
```

Generate the package:

```console
foo@bar:~$ cd timelink-vscode
user@timelink-vscode:~$ vsce package
user@timelink-vscode:~$ code --install-extension kleio-x.x.vsix
```

Publish to Visual Studio Marketplace:

```console
foo@bar:~$ cd timelink-vscode
foo@bar:~$ vsce publish
```

If token expired run:
```console
foo@bar:~$ vsce login time-link
```

More info at https://code.visualstudio.com/api/working-with-extensions/publishing-extension


#### Convert TextMate bundle features using [Yeoman](https://yeoman.io/learning/) code extension generator:

```console
foo@bar:~$ yo code
```

**Select "New Language Support"**
Input the "URL or file to import" (e.g. 'TimeLink.tmbundle/Syntaxes/Kleio.tmLanguage')
Accept the defaults

**Select "New Code Snippets"**
Input the "URL or file to import" (e.g. 'TimeLink.tmbundle/Snippets')
Accept the defaults

#### Assign keybindings to snippets
Keymaps from TextMate Bundles (Key Equivalent) don't migrate to VS Code.
Keybindings must be added manually to package.json file to 'keybindings' section where 'name' is the snippet name:

```
"key": "ctrl+alt+k",
"mac": "shift+cmd+k",
"command": "editor.action.insertSnippet",
"when": "editorTextFocus",
"args": {
    "langId": "kleio",
    "name": "kleio"
}
```

## Testing with a reference version of MHK

A reference version of MHH can be installed
inside the extension host container (created with F5) to provide a 
reproductible environment. 

The reference version contains the
a full mhk-home directory capable of
launching MHK and the Kleio server.

1. Run the extension host from VS Code
with F5.
2. In the new "Extension Development Host" 
window select "Clone Git Repository"
3. Clone http://github.com/joaquimrcarvalho/timelink-project
4. When asked, open the cloned repository in
a new window.
5. Set up MHK with 

```console
$ cd mhk-home; . ./app/scripts/host/manager-init.sh
>Initializing mhk-home ...
Init already called in this directory:  Tue Jan 24 07:57:53 UTC 2023
Updating
mhk-home init finished.
```
Open a new terminal in VS Code and do

```console 
$ mhk up
>  mhk up
Using images tagged '2133'
MHk serving localhost
[+] Running 5/5
 ⠿ Container mhk-portainer-1  Started                        0.5s
 ⠿ Container mhk-mysql-1      Sta...                         0.5s
 ⠿ Container mhk-kleio-1      Sta...                         0.6s
 ⠿ Container mhk-mhk-1        Start...                       0.9s
 ⠿ Container mhk-caddy-1      Sta...   
```
The extension can now be tested with 
a running MHK reference version.

A good way to check if the kleio server is running 
is to use `curl` in the Extension Development Host window:

```console
$ curl http://localhost:8088
> 
```

Different versions of MHK can also be tested
by:
1. `mhk use-tag <BUILD_NUMBER>`
2. `mhk update`
3. `mhk up`

For an update list of build number and 
MHK versions see: https://hub.docker.com/r/joaquimrcarvalho/mhk-manager/tags

The cloned MHK version can be updated this way, with no need use git 
for an updated version of the reference MHK version.


## Known Issues

### Error with _digital envelope routines_ when using vsce to create a package

Currently there is an incompatibility between node and some modules used in the extension
which produces the following error on `vsce package`

        opensslErrorStack: [ 'error:03000086:digital envelope routines::initialization error' ],
        library: 'digital envelope routines',
        reason: 'unsupported',
        code: 'ERR_OSSL_EVP_UNSUPPORTED'

See https://stackoverflow.com/questions/69665222/node-js-17-0-1-gatsby-error-digital-envelope-routinesunsupported-err-os

This is fixed by doing `export NODE_OPTIONS=--openssl-legacy-provider` 

The export command was added to the scripts in `package.json`, e.g.

    "vscode:prepublish": "export NODE_OPTIONS=--openssl-legacy-provider; webpack --mode production",

   
In the future is dependencies are updated
this can be removed from `package.json`.


### "error: invalid path" during git clone to Windows client 

When cloning this repository of a windows machine
some file names in the snippets defined here
may conflict with a restrictive enforcement of
Windows name conventions, generating an error
that prevent the checkout of the branches.

To prevent this do:

    git config --global core.protectNTFS false

For more information see https://confluence.atlassian.com/bitbucketserverkb/error-invalid-path-during-git-clone-to-windows-client-1085186345.html

## Release Notes

### 1.0.16
Adds option to delete generated files only
New VSCode setting for Kleio Server Host, Port and Token
### 1.0.1
Several optimisations in kleio status updates

### 1.0.0
Feature complete release.
Only presents .cli files in explorer (with an option to enable listing of all files)

### 0.9.8 (RC)
Filter by status now loads status recursively for each folder at root.
File diagnostics (error/warning) loaded all at once when folder is expanded.
Show feedback when getting status from kleio server.

### 0.9.5
Fixes the update of files when a file with error finishes translating

### 0.9.4
Changes on filter by kleio status views.

### 0.9.3
Fixes files update when translation status changes or user requests a refresh
Other bug fixes

### 0.9.2
Fixes Translation Service call when running the extension in Windows.

### 0.9.1
Adds reload button to extension views (translation needed, with error, etc).
Fixes Kleio Translation Service calls.
Fixes in syntax highlight.

### 0.9.0
Load and display file status from Kleio Server (when running locally).
Start file translation by right click on .cli files (and with CMD/CTRL + SHIFT + T).
Custom icon for .cli files.
Add views showing files grouped by status (Translation Needed, With Errors, With Warnings, Ready for Import).
Syntax highlighting now highlights the first token after the $ separator.
Bug fixes and code cleanup.

### 0.4.2
### 0.4.1

Calls Translation service on file save. Loads cli diagnostic errors when an .err file is created (when translation finishes).

### 0.4.0

Loads errors and warnings from .rpt files and displays in Problems pane. Includes Completion Provider (work in progress).

### 0.3.0

Adds Time Link extension to VSCode View Container. Includes 'Time Link File Explorer' tree view and 'Kleio Files Status' view (work in progress).

### 0.2.0

Includes hover information support, including update from documentation server (no real information yet).

### 0.1.0

This version completes support for snippet completion (baptismf, casamentof, obitof, escrituras).
Includes basic hover information (static for now).

### 0.0.2

This version adds support for basic snippet completion (baptism acts only).

### 0.0.1

Very initial release of Time Link extension for VSCode. Includes syntax highlighting.
