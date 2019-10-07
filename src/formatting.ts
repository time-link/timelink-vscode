import * as vscode from 'vscode';

export module FormattingProvider {

  export class Formatting {

    getChanges(document: vscode.TextDocument) {
        var changes:vscode.TextEdit[] = new Array();
        var ind = "   ";
        var previousLine;
        for (let line = 0; line < document.lineCount; line++) {
            const element = document.lineAt(line);
            var text = element.text
                .replace(/^\s*kleio\$/g, "kleio$")
                .replace(/^\s*fonte\$/g, ind + "fonte$")
                .replace(/^\s*(bap|b|cas|obito|o)\$/g, ind + ind + "$1\$")
                .replace(/^\s*(n|noivo|noiva|test)\$/g, ind + ind + ind + "$1\$")
                .replace(/^\s*(pai|pn|mae|mn|pad1|pad|mad1|mad|pnoivo|pnoiva)\$/g, ind + ind + ind + ind + "$1\$")
                .replace(/^\s*(ppad|pmad)\$/g, ind + ind + ind + ind + ind + "$1\$");

            changes.push(vscode.TextEdit.replace(element.range, text));

            if (element.text.indexOf("ls$") >= 0 && previousLine != null) {
                var spaces = previousLine.match(/^(\s+)/);
                if (spaces != null) {
                    changes.push(vscode.TextEdit.replace(element.range, 
                        element.text.replace(/^\s*(ls)\$/g, spaces.slice(1) + ind + "$1\$")))
                }
            } else {
                previousLine = text;
            }
        }
        return changes
    }
  }
}