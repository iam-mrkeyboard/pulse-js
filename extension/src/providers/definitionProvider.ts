import * as vscode from 'vscode';
import { PulseDefinitionEngine, Location, FileSystem } from '../definition';
import * as fs from 'fs';

class NodeFileSystem implements FileSystem {
  async exists(path: string): Promise<boolean> {
    try {
      await fs.promises.access(path, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

export class PulseDefinitionProvider implements vscode.DefinitionProvider {
  private engine: PulseDefinitionEngine;

  constructor() {
    this.engine = new PulseDefinitionEngine(new NodeFileSystem());
  }

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Definition | null> {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // We need word at position to pass to engine?
    // Engine finds node at offset.
    // Engine needs 'word' for fallback or specific check?
    // Actually engine expects 'word'.
    const range = document.getWordRangeAtPosition(position);
    if (!range) return null;
    const word = document.getText(range);

    const loc = await this.engine.getDefinition(text, offset, document.uri.fsPath, word);

    if (loc) {
      return new vscode.Location(
        vscode.Uri.file(loc.uri),
        new vscode.Range(
          new vscode.Position(loc.range.start.line, loc.range.start.character),
          new vscode.Position(loc.range.end.line, loc.range.end.character)
        )
      );
    }

    return null;
  }
}
