import { PulseParser } from './parser';
import { Definition, Location, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import * as fs from 'fs';
import { URI } from 'vscode-uri';

export class PulseDefinitionEngine {
  private parser: PulseParser;

  constructor(parser: PulseParser) {
    this.parser = parser;
  }

  public getDefinition(
    document: TextDocument,
    offset: number,
  ): Definition | null {
    const text = document.getText();
    const tree = this.parser.parse(text);
    if (!tree) return null;

    const imports = this.parser.getImports(tree);

    for (const imp of imports) {
      if (offset >= imp.start && offset <= imp.end) {
        const currentPath = URI.parse(document.uri).fsPath;
        const targetPath = path.resolve(path.dirname(currentPath), imp.source);

        // Try resolving .pulse, .ts, .js
        if (fs.existsSync(targetPath + '.pulse')) {
          return Location.create(
            URI.file(targetPath + '.pulse').toString(),
            Range.create(0, 0, 0, 0),
          );
        }
        if (fs.existsSync(targetPath + '.ts')) {
          return Location.create(
            URI.file(targetPath + '.ts').toString(),
            Range.create(0, 0, 0, 0),
          );
        }
      }
    }
    return null;
  }
}
