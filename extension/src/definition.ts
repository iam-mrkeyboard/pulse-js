
import { PulseParser, SymbolDef } from './parser';
import * as path from 'path';

export interface Location {
  uri: string;
  range: { start: { line: number, character: number }, end: { line: number, character: number } };
}

export interface FileSystem {
  exists(path: string): Promise<boolean>;
}

export class PulseDefinitionEngine {
  private parser: PulseParser;
  private fs: FileSystem;

  constructor(fs: FileSystem) {
    this.parser = new PulseParser();
    this.fs = fs;
  }

  public async getDefinition(text: string, offset: number, filePath: string, word: string): Promise<Location | null> {
    const root = this.parser.parse(text);
    const node = this.parser.findNodeAt(offset, root);

    if (!node) return null;

    // 1. Component Navigation (in AST Element)
    if (node.type === 'element') {
      if (node.tag === word && /^[A-Z]/.test(word)) {
        return this.getComponentDefinition(word, text, filePath);
      }
    }

    // 2. State Navigation
    if (node.type === 'expression' || (node.type === 'element' && this.isAttributeValue(offset, node))) {
      return this.getStateVariableDefinition(word, text, filePath);
    }

    // Fallback
    if (/^[A-Z]/.test(word)) return this.getComponentDefinition(word, text, filePath);
    return this.getStateVariableDefinition(word, text, filePath);
  }

  private isAttributeValue(offset: number, node: any): boolean {
    if (!node.attributes) return false;
    for (const [, attr] of node.attributes) {
      if (offset >= attr.valueRange.start && offset <= attr.valueRange.end) return true;
    }
    return false;
  }

  private async getComponentDefinition(componentName: string, text: string, currentFile: string): Promise<Location | null> {
    const imports = this.parser.extractImports(text);
    const imp = imports.find(i => i.name === componentName);

    if (imp && imp.source) {
      return this.resolveImportPath(currentFile, imp.source);
    }
    return null;
  }

  private getStateVariableDefinition(varName: string, text: string, currentFile: string): Location | null {
    const variables = this.parser.extractStateVariables(text);
    const variable = variables.find(v => v.name === varName);

    if (variable) {
      return {
        uri: currentFile,
        range: {
          start: this.offsetToPosition(text, variable.range.start),
          end: this.offsetToPosition(text, variable.range.end)
        }
      };
    }
    return null;
  }

  private async resolveImportPath(currentFile: string, importSource: string): Promise<Location | null> {
    const baseDir = path.dirname(currentFile);

    const candidatePaths: string[] = [];
    if (importSource.startsWith('.')) {
      const resolved = path.resolve(baseDir, importSource);
      candidatePaths.push(resolved);
      if (!resolved.endsWith('.pulse')) candidatePaths.push(resolved + '.pulse');
      if (!resolved.endsWith('.js')) candidatePaths.push(resolved + '.js');
      if (!resolved.endsWith('.ts')) candidatePaths.push(resolved + '.ts');
      candidatePaths.push(path.join(resolved, 'index.pulse'));
      candidatePaths.push(path.join(resolved, 'index.js'));
    } else {
      const nodeModules = path.join(baseDir, 'node_modules', importSource);
      candidatePaths.push(nodeModules);
      candidatePaths.push(nodeModules + '.js');
      candidatePaths.push(path.join(nodeModules, 'index.js'));
    }

    for (const p of candidatePaths) {
      if (await this.fs.exists(p)) {
        return {
          uri: p,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
        };
      }
    }

    return null;
  }

  private offsetToPosition(text: string, offset: number): { line: number, character: number } {
    const lines = text.slice(0, offset).split('\n');
    const line = lines.length - 1;
    const character = lines[lines.length - 1].length;
    return { line, character };
  }
}
