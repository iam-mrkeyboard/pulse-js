
import { PulseParser, ParsedNode } from './parser';
import { Definition, Location, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import * as fs from 'fs';
import { URI } from 'vscode-uri';

export class PulseDefinitionEngine {
  private parser: PulseParser;

  constructor() {
    this.parser = new PulseParser();
  }

  public getDefinition(document: TextDocument, offset: number): Definition | null {
    const text = document.getText();
    const tree = this.parser.getTree(text);
    if (!tree) return null;

    const node = this.parser.findNodeAtOffset(tree, offset);

    if (!node) return null;

    // 1. Tag Definition (Jump to Component File)
    // <MyComponent /> -> import MyComponent from './MyComponent.pulse'
    if (node.type === 'element' && node.tag && node.tag[0] === node.tag[0].toUpperCase()) {
      if (offset <= node.range.start + node.tag.length + 1) {
        return this.getComponentDefinition(text, node.tag, document.uri);
      }
    }

    // 2. Import Definition
    // import Foo from './foo.pulse'
    // Regex fallback for imports since parser might not index them deeply
    // TODO: Parser should return Import Nodes. For now scanning text lines.
    // Actually, let's use a regex scan around the offset for imports.
    const importMatch = this.getImportAtOffset(text, offset);
    if (importMatch) {
      const targetPath = this.resolvePath(document.uri, importMatch);
      if (targetPath) {
        return Location.create(targetPath, Range.create(0, 0, 0, 0));
      }
    }

    return null;
  }

  private getComponentDefinition(text: string, tagName: string, currentUri: string): Location | null {
    const imports = this.parser.extractImports(text);

    // Need to find which import defines the variable `tagName`.
    // extractImports currently only returns source. 
    // We need to upgrade extractImports to return binding names too?
    // Or just cheat and look for import from a path that matches?
    // Actually we need the binding name.
    // Let's rely on standard convention matching for now: import Tag from './Tag.pulse'

    for (const imp of imports) {
      // Heuristic: Does the import path basename match the tag?
      const base = path.basename(imp.source, '.pulse');
      if (base === tagName) {
        const targetUri = this.resolvePath(currentUri, imp.source);
        if (targetUri) {
          return Location.create(targetUri, Range.create(0, 0, 0, 0));
        }
      }
    }
    return null;
  }

  private getImportAtOffset(text: string, offset: number): string | null {
    // Use parser's extractImports which uses Acorn (no regex)
    const imports = this.parser.extractImports(text);
    for (const imp of imports) {
      if (offset >= imp.range.start && offset <= imp.range.end) {
        return imp.source;
      }
    }
    return null;
  }

  private resolvePath(currentUri: string, importPath: string): string | null {
    // currentUri is file:///path/to/file.pulse
    // importPath is ./foo.pulse

    const currentPath = URI.parse(currentUri).fsPath;
    const dir = path.dirname(currentPath);
    const targetPath = path.resolve(dir, importPath);

    if (fs.existsSync(targetPath)) {
      return URI.file(targetPath).toString();
    }
    // Try adding .pulse extension
    if (fs.existsSync(targetPath + '.pulse')) {
      return URI.file(targetPath + '.pulse').toString();
    }

    return null;
  }
}
