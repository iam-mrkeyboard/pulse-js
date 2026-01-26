import * as vscode from 'vscode';
import { PulseHoverEngine } from '../hover';

export class PulseHoverProvider implements vscode.HoverProvider {
  private engine: PulseHoverEngine;

  constructor() {
    this.engine = new PulseHoverEngine();
  }

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.Hover> {
    const range = document.getWordRangeAtPosition(position);
    if (!range) return null;

    const word = document.getText(range);
    const text = document.getText();
    const offset = document.offsetAt(position);

    const result = this.engine.getHover(text, offset, word);

    if (result) {
      const markdown = new vscode.MarkdownString();
      result.contents.forEach(content => {
        if (content.startsWith('```')) {
          const match = content.match(/^```(\w+)\n([\s\S]+)\n```$/);
          if (match) {
            markdown.appendCodeblock(match[2], match[1]);
          } else {
            markdown.appendMarkdown(content + '\n\n');
          }
        } else {
          markdown.appendMarkdown(content + '\n\n');
        }
      });
      return new vscode.Hover(markdown);
    }

    return null;
  }
}
