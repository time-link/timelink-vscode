import * as vscode from 'vscode';

import docJsonFile from './StructureDocumentation.json';

export module HoverProvider {
  const DocJsonKey = "DocJsonKey";
  const DocJsonUrl = "https://docs.google.com/uc?export=download&id=1QW1-G34sxTwv4-mROCudJJRgt2N6JQ0B";
  var docJson: object;

  export class HoverContent {

    constructor(context: vscode.ExtensionContext) {
      if (context.workspaceState.get(DocJsonKey) !== undefined) {
        console.log("Cached documentation exists.");
        docJson = context.workspaceState.get(DocJsonKey) as object;
        // console.log(typeof docJson);
        // console.log(docJson);
      } else {
        // use predefined documentation values
        docJson = docJsonFile;
      }

      // check for notation updates from Kleio server
      this.checkNotationUpdates(context);
    }

    writeToFile() {
      var fs = require('fs');
      fs.readFile('readMe.txt', 'utf8', function (err: any, data: any) {
        fs.writeFile('writeMe.txt', data, function (err: any, result: any) {
          if (err) {
            console.log('error', err);
          }
        });
      });
    }

    checkNotationUpdates(context: vscode.ExtensionContext) {
      console.log('Connecting to Kleio Server');
      var rp = require('request-promise');

      var options = {
        method: 'GET',
        uri: DocJsonUrl,
        json: true
      };

      rp(options)
        .then(function (parsedBody: any) {
          context.workspaceState.update(DocJsonKey, parsedBody);
          docJson = context.workspaceState.get(DocJsonKey) as object;
        })
        .catch(function (err: any) {
          console.log("Couldn't connect to Kleio Server?");
        });
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
          console.log(Object.values(tmp)[idx].minimal);
          console.log(Object.values(tmp)[idx].complete);
          console.log(Object.values(tmp)[idx].includes);

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