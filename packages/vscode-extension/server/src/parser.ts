import Parser from 'web-tree-sitter'; // Standard ES Import
import * as path from 'path';

export class PulseParser {
  private parser: Parser | undefined;
  private isReady: boolean = false;

  public async init() {
    if (this.isReady) return;

    await Parser.init();
    this.parser = new Parser();

    const wasmPath = path.join(__dirname, 'tree-sitter-html.wasm');
    const lang = await Parser.Language.load(wasmPath);

    this.parser.setLanguage(lang);
    this.isReady = true;
  }

  public parse(text: string): Parser.Tree | undefined {
    if (!this.isReady || !this.parser) return undefined;
    return this.parser.parse(text);
  }

  public getNodeAt(
    tree: Parser.Tree,
    line: number,
    character: number,
  ): Parser.SyntaxNode | null {
    if (!tree) return null;
    return tree.rootNode.descendantForPosition({
      row: line,
      column: character,
    });
  }

  public getScriptContent(tree: Parser.Tree): string {
    const scriptNode = tree.rootNode.children.find(
      (n) => n.type === 'script_element',
    );
    return scriptNode ? scriptNode.text : '';
  }

  public getImports(
    tree: Parser.Tree,
  ): { source: string; start: number; end: number }[] {
    const text = this.getScriptContent(tree);
    const imports: { source: string; start: number; end: number }[] = [];

    const scriptNode = tree.rootNode.children.find(
      (n) => n.type === 'script_element',
    );
    if (!scriptNode) return [];

    const startOffset = scriptNode.startIndex;
    const scriptText = scriptNode.text;

    const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = importRegex.exec(scriptText)) !== null) {
      imports.push({
        source: m[1],
        start: startOffset + m.index,
        end: startOffset + m.index + m[0].length,
      });
    }
    return imports;
  }

  public getScriptVariables(tree: Parser.Tree): string[] {
    const scriptText = this.getScriptContent(tree);
    const variables: string[] = [];

    const varRegex = /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    const funcRegex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    const signalRegex = /const\s+\[\s*(\w+)/g;

    let m;
    while ((m = varRegex.exec(scriptText)) !== null) variables.push(m[1]);
    while ((m = funcRegex.exec(scriptText)) !== null) variables.push(m[1]);
    while ((m = signalRegex.exec(scriptText)) !== null) variables.push(m[1]);

    return variables;
  }
}
