# kleio README

MHK Time Link is a web application that manages databases for micro-historical and genealogical research. It allows source-oriented data input, using Manfred Thaller Kleio notation, record linking and network analysis. The development of MHK is coordinated by Joaquim Carvalho, of the University of Coimbra, Portugal.

This extension adds support for the Kleio notation in Visual Studio Code editor, including Syntax Highlighting and Snippet completion.

## Install Extension in Visual Studio Code (VS Code)
1. Download VS Code extension from [repository](https://github.com/time-link/timelink-vscode/raw/master/builds/kleio-0.4.3.vsix)
2. Select extensions on VS Code left toolbar
3. Click "More actions" (three dots) and select install from VSIX

## Features

* Syntax Highlighting
* Snippet completion for baptism acts (actos de baptismo).

## Requirements

This bundle requires Visual Studio Code with extensions support.

## Development Notes

### Adding New Features

The grammar was converted from TextMate using the yo code extension generator. The included Time Link bundle (Time Link.tmbundle) can be used to easily make changes to the TextMate grammar, and then convert the bundle to a VSCode extension.

### Create a package:
#### Create a package using vsce (The Visual Studio Code Extension Manager)

Install typescript and extension dependencies:

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

## Known Issues

None so far!

## Release Notes

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