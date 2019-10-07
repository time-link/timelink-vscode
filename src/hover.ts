import * as vscode from 'vscode';

export module HoverProvider {

  export class HoverContent {
    hoverDetails: Map<string, string>;

    constructor() {
      this.hoverDetails = new Map<string, string>();

      this.hoverDetails.set("kleio", "kleio\
        also=structure,translator,autorels,obs,prefix,translations;\
        position=structure,translator,obs;");

      this.hoverDetails.set("fonte", "fonte\
        guaranteed=id;\
        also=tipo,loc,localizacao,ref,data,ano,obs;");

      this.hoverDetails.set("bap", "Baptismos\
        position=id,dia,mes,ano,fol,local,celebrante;\
        guaranteed=id,dia,mes,ano;\
        repeat=celebrante,n,\
        test,referido,referida");

      this.hoverDetails.set("cas", "Casamentos\
        name=cas,termo;\
        source=pt-acto;\
        guaranteed=id,dia,mes,ano,fol;\
        position=id,dia,mes,ano,fol,loc,celebrante;\
        also=celebrante,obs;\
        repeat=celebrante,test,referida,referido,");
    }

    getHoverContent(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
      const hoveredWord = document.getText(document.getWordRangeAtPosition(position));
      console.log(hoveredWord)
      const tokenText = this.hoverDetails.get(hoveredWord)
      //return (tokenText) ? tokenText : null;
      return {
        contents: (tokenText) ? ['*' + hoveredWord + "*", tokenText] : []
      };
    }
  }
}