import * as vscode from 'vscode';

import docJsonFile from './gacto2.str.json';

export module HoverProvider {
  const docJsonKey = "DocJsonKey";
  const docJsonUrl = "https://docs.google.com/uc?export=download&id=1QW1-G34sxTwv4-mROCudJJRgt2N6JQ0B";
  var docJson: object;

  export class HoverContent {

    constructor(context: vscode.ExtensionContext) {
      if (context.workspaceState.get(docJsonKey) !== undefined) {
        console.log("Cached documentation exists.");
        docJson = context.workspaceState.get(docJsonKey) as object;
        // console.log(typeof docJson);
        // console.log(docJson);
      } else {
        // use predefined documentation values
        docJson = docJsonFile;
      }

      // check for notation updates from Kleio server
      this.checkNotationUpdates(context);
    }

    // TODO: fetch from google docs is blocked by CORS
    // json file must be returned by kleio server (or other)
    checkNotationUpdates(context: vscode.ExtensionContext) {
      fetch(docJsonUrl, {
        method: 'GET',
        headers: {
          "content-type": "application/json",
        },
      }).then((response) => {
        context.workspaceState.update(docJsonKey, response);
        docJson = context.workspaceState.get(docJsonKey) as object;
      }).catch(function (err: any) {
        console.log("Couldn't update json");
      });;
    }

    // get key value from json data
    getValue(key: string, data: object) {
      if (data.hasOwnProperty(key)) {
        var idx = Object.keys(data).indexOf(key);
        if (idx >= 0) {
          return Object.values(data)[idx];
        }
      }
    }

    getHoverContent(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
      var hoveredWord = document.getText(document.getWordRangeAtPosition(position));
      var tokenText = null;
      var values = [];

      var tmp = this.getValue("groups", docJson) as object;
      if (tmp !== undefined && tmp.hasOwnProperty(hoveredWord)) {

        var idx = Object.keys(tmp).indexOf(hoveredWord);
        if (idx >= 0) {
          var hovertext = "**" + hoveredWord + "**";
          values.push(hovertext);

          hovertext = "";
          hovertext += "\r\n\r\n**Minimal:** " + Object.values(tmp)[idx].minimal;
          hovertext += "\r\n\r\n**Complete:** " + Object.values(tmp)[idx].complete;
          hovertext += "\r\n\r\n**Typical:** " + Object.values(tmp)[idx].typical;
          hovertext += "\r\n\r\n**Includes:** " + Object.values(tmp)[idx].includes;
          values.push(hovertext);

          tokenText = "[link to Documentation!](http://google.com) ";

          values.push(tokenText);
        }
      }

      return {
        contents: (tokenText) ? values : []
      };
    }
  }
}