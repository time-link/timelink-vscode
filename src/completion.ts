import * as vscode from 'vscode';

export module CompletionProvider {

  export class Completion {
    // see https://github.com/microsoft/vscode-extension-samples/blob/master/completions-sample/src/extension.ts
    getCompletionContent(token: string) {
        var values:any[] = [];
        if (token.startsWith("ls")) {
            const snippetCompletion = new vscode.CompletionItem('ls\$');
            //snippetCompletion.insertText = new vscode.SnippetString('ls$${1|profissao,residencia,etc|}/${2|morning,afternoon,evening|}');
            snippetCompletion.insertText = new vscode.SnippetString('ls$${1|profissao,residencia,etc|}/');
            snippetCompletion.documentation = new vscode.MarkdownString("ls or attr are life stories or attributes...");

            values.push(snippetCompletion);
        } else {
            const snippetCompletion = new vscode.CompletionItem('profissao');
            //snippetCompletion.insertText = new vscode.SnippetString('ls$${1|profissao,residencia,etc|}/${2|morning,afternoon,evening|}');
            snippetCompletion.insertText = new vscode.SnippetString('${1|aaa,nbbb,ccc|}');
            snippetCompletion.documentation = new vscode.MarkdownString("???");

            values.push(snippetCompletion);
        }
        
        // return all completion items as array
        return values;
    }
  }
}