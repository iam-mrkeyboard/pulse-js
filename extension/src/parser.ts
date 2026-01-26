
export interface NodeRange {
  start: number;
  end: number;
}

export interface Attribute {
  name: string;
  value: string;
  nameRange: NodeRange;
  valueRange: NodeRange;
}

export interface ParsedNode {
  type: 'element' | 'text' | 'comment' | 'expression' | 'root';
  tag?: string;
  attributes?: Map<string, Attribute>;
  children?: ParsedNode[];
  content?: string;
  range: NodeRange;
  parent?: ParsedNode;
  closed?: boolean;
}

export interface SymbolDef {
  name: string;
  range: NodeRange;
  type: 'variable' | 'import';
  source?: string; // for imports
}

export class PulseParser {
  private pos = 0;
  private input = '';

  parse(html: string): ParsedNode {
    this.input = html;
    this.pos = 0;

    const root: ParsedNode = {
      type: 'root',
      children: [],
      range: { start: 0, end: html.length }
    };

    while (this.pos < this.input.length) {
      const child = this.parseNode(root);
      if (child) {
        root.children!.push(child);
      } else {
        // If we can't parse a node, force advance to prevent infinite loop
        if (this.pos < this.input.length) {
          this.pos++;
        }
      }
    }

    return root;
  }

  private parseNode(parent: ParsedNode): ParsedNode | null {
    // 1. Text (anything not < or {)
    if (this.pos >= this.input.length) return null;

    if (this.peek(4) === '<!--') return this.parseComment(parent);
    if (this.peek(1) === '{') return this.parseExpression(parent);
    if (this.peek(1) === '<' && this.peek(2) !== '</') return this.parseElement(parent);

    // Fallback to text
    return this.parseText(parent);
  }

  private parseElement(parent: ParsedNode): ParsedNode | null {
    const start = this.pos;
    this.consume(1); // <

    const tagName = this.parseTagName();
    if (!tagName) return null; // Invalid tag

    const attributes = this.parseAttributes();

    this.skipWhitespace();

    const node: ParsedNode = {
      type: 'element',
      tag: tagName,
      attributes,
      children: [],
      parent,
      range: { start, end: this.pos }, // Temporary end
      closed: false
    };

    if (this.peek(2) === '/>') {
      this.consume(2);
      node.range.end = this.pos;
      node.closed = true;
      return node;
    }

    if (this.peek(1) === '>') {
      this.consume(1);
    }

    // Void elements
    const voidElements = new Set(['img', 'input', 'br', 'hr', 'meta', 'link']);
    if (voidElements.has(tagName.toLowerCase())) {
      node.range.end = this.pos;
      node.closed = true;
      return node;
    }

    // Raw Text Elements (script, style, etc.)
    const rawTextElements = new Set(['script', 'style', 'pre', 'code', 'title']);
    if (rawTextElements.has(tagName.toLowerCase())) {
      const closeTag = `</${tagName}>`;
      const closeIndex = this.input.indexOf(closeTag, this.pos);

      if (closeIndex !== -1) {
        const content = this.input.slice(this.pos, closeIndex);
        node.children!.push({
          type: 'text',
          content: content,
          range: { start: this.pos, end: closeIndex },
          parent: node
        });
        this.pos = closeIndex + closeTag.length;
        node.closed = true;
        node.range.end = this.pos;
        return node;
      } else {
        // Unclosed raw tag
        // Consume until end
        const content = this.input.slice(this.pos);
        node.children!.push({
          type: 'text',
          content: content,
          range: { start: this.pos, end: this.input.length },
          parent: node
        });
        this.pos = this.input.length;
        node.closed = false; // Mark unclosed
        node.range.end = this.pos;
        return node;
      }
    }

    // Parse Children
    while (this.pos < this.input.length) {
      if (this.peek(2 + tagName.length) === `</${tagName}`) {
        // Find closing tag
        // Simple check: </tag>
        const closeTag = `</${tagName}`;
        if (this.peek(closeTag.length) === closeTag) {
          // Verify it ends with >
          const potentialEnd = this.input.indexOf('>', this.pos);
          if (potentialEnd !== -1) {
            this.pos = potentialEnd + 1;
            node.closed = true;
          } else {
            // Malformed closing tag
            this.pos = this.input.length;
          }
          break;
        }
      }

      // Stop if specific closing tag logic fails?
      if (this.peek(2) === '</') {
        // We hit A closing tag, but is it OURS?
        // If we are <div> and we see </div>, good.
        // If we are <div> and we see </span>, we have a nesting error.
        // For the parser's sake, we assume </span> belongs to a parent or is an error,
        // but we can't consume it here. We break and let the parent handle it.
        // BUT: if we break here, we leave this node unclosed.

        // Simple stack recovery:
        // If we see `</${tagName}>`, match.
        // If we see `</other>`, stop if 'other' is a parent's tag.
        // For now, simple greedy parsing: stop at Any closing tag? No, that breaks partial nesting.
        // Stop only if it matches THIS tag.

        // If we hit mismatched closing tag:
        // Case: <div> <span> </div>
        // Span sees </div>. It is not </span>.
        // Should span consume/close? No.
        // Span should return unclosed.

        if (this.input.startsWith(`</${tagName}>`, this.pos)) {
          this.consume(`</${tagName}>`.length);
          node.closed = true;
          break;
        } else {
          // It's a different closing tag.
          // If this exists in parent chain, we should mostly abort.
          if (this.isTagInParentChain(parent, this.getMessageTag(this.pos))) {
            break;
          }
          // Otherwise treating as child text or sibling?
          // Actually if it's </foo>, it's likely a closing tag. 
          // We treat it as end of children for this level to avoid consuming parent's close tag.
          break;
        }
      }

      const child = this.parseNode(node);
      if (child) node.children?.push(child);
      else this.pos++;
    }

    node.range.end = this.pos;
    return node;
  }

  private isTagInParentChain(node: ParsedNode | undefined, tagName: string): boolean {
    let p = node;
    while (p) {
      if (p.tag === tagName) return true;
      p = p.parent;
    }
    return false;
  }

  private getMessageTag(pos: number): string {
    // Extract tag name from </tag>
    const match = this.input.slice(pos).match(/^<\/([a-zA-Z0-9\-]+)/);
    return match ? match[1] : '';
  }

  private parseText(parent: ParsedNode): ParsedNode {
    const start = this.pos;
    while (this.pos < this.input.length) {
      if (this.peek(1) === '<' || this.peek(1) === '{') break;
      this.pos++;
    }
    return {
      type: 'text',
      content: this.input.slice(start, this.pos),
      range: { start, end: this.pos },
      parent
    };
  }

  private parseTagName(): string {
    const match = this.input.slice(this.pos).match(/^[a-zA-Z0-9\-:]+/);
    if (match) {
      this.consume(match[0].length);
      return match[0];
    }
    return '';
  }

  private parseAttributes(): Map<string, Attribute> {
    const attrs = new Map<string, Attribute>();
    while (this.pos < this.input.length) {
      this.skipWhitespace();
      if (this.peek(1) === '>' || this.peek(2) === '/>') break;

      const startName = this.pos;
      const name = this.parseAttributeName();
      if (!name) break;
      const endName = this.pos;

      this.skipWhitespace();
      let value = '';
      let startValue = this.pos;
      let endValue = this.pos;

      if (this.peek(1) === '=') {
        this.consume(1); // =
        this.skipWhitespace();
        startValue = this.pos;
        value = this.parseAttributeValue();
        endValue = this.pos;
      }

      attrs.set(name, {
        name,
        value,
        nameRange: { start: startName, end: endName },
        valueRange: { start: startValue, end: endValue }
      });
    }
    return attrs;
  }

  private parseAttributeName(): string {
    const match = this.input.slice(this.pos).match(/^[a-zA-Z0-9\-:@]+/);
    if (match) {
      this.consume(match[0].length);
      return match[0];
    }
    return '';
  }

  private parseAttributeValue(): string {
    // Handles "..." '...' or {...} or naked
    const char = this.peek(1);
    if (char === '"' || char === "'") {
      this.consume(1);
      const start = this.pos;
      // find closing quote
      while (this.pos < this.input.length && this.peek(1) !== char) {
        this.pos++;
      }
      const val = this.input.slice(start, this.pos);
      if (this.peek(1) === char) this.consume(1);
      return val;
    }
    if (char === '{') {
      // Consume balanced braces
      const start = this.pos;
      let depth = 0;
      do {
        if (this.peek(1) === '{') depth++;
        else if (this.peek(1) === '}') depth--;
        this.consume(1);
      } while (depth > 0 && this.pos < this.input.length);
      return this.input.slice(start, this.pos);
    }

    // Naked value
    const match = this.input.slice(this.pos).match(/^[^\s>]+/);
    if (match) {
      this.consume(match[0].length);
      return match[0];
    }
    return '';
  }

  private parseComment(parent: ParsedNode): ParsedNode {
    const start = this.pos;
    this.consume(4);
    const endComment = this.input.indexOf('-->', this.pos);
    if (endComment !== -1) this.pos = endComment + 3;
    else this.pos = this.input.length;

    return {
      type: 'comment',
      content: this.input.slice(start, this.pos),
      range: { start, end: this.pos },
      parent
    };
  }

  private parseExpression(parent: ParsedNode): ParsedNode {
    const start = this.pos;
    let depth = 0;
    // Assume starts with {
    do {
      if (this.peek(1) === '{') depth++;
      else if (this.peek(1) === '}') depth--;
      this.consume(1);
    } while (depth > 0 && this.pos < this.input.length);

    return {
      type: 'expression',
      content: this.input.slice(start, this.pos),
      range: { start, end: this.pos },
      parent
    };
  }

  private peek(n: number): string {
    return this.input.slice(this.pos, this.pos + n);
  }

  private consume(n: number) {
    this.pos += n;
  }

  private skipWhitespace() {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  public findNodeAt(offset: number, node: ParsedNode | undefined = undefined): ParsedNode | undefined {
    if (!node) {
      // Re-parse or rely on existing tree? 
      // findNodeAt usually assumes we have a tree.
      // If we call it from outside, we likely pass the root.
      // If the user calls `parser.findNodeAt(offset)`, we might not have the tree if `parse` wasn't called.
      // BUT: The parser state `this.input` might be stale or relevant.
      // Better: Expect the caller to pass the root, OR re-parse.
      // Given this is a simple parser, let's assume usage: parser.findNodeAt(offset, root).
      // If root is missing, maybe we can't do much or throw.
      // BUT: adapting to the previous attempt's signature: "node: ParsedNode = this.parse(this.input)"
      // This implies re-parsing everything on every completion request. That is ok for small files.
      // Let's stick to that for safety.
      node = this.parse(this.input);
    }

    if (offset < node.range.start || offset > node.range.end) {
      return undefined;
    }

    if (node.children) {
      for (const child of node.children) {
        const found = this.findNodeAt(offset, child);
        if (found) return found;
      }
    }

    return node;
  }

  public extractStateVariables(text: string): SymbolDef[] {
    const variables: SymbolDef[] = [];
    this.scanForSymbols(text, (token, start, end) => {
      // Look for let/const/var
      if (['let', 'const', 'var'].includes(token)) {
        // Next token should be variable name
        const next = this.nextToken(text, end);
        if (next && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(next.token)) {
          variables.push({
            name: next.token,
            range: { start: next.start, end: next.end },
            type: 'variable'
          });
        }
      }
    });
    return variables;
  }

  public extractImports(text: string): SymbolDef[] {
    const imports: SymbolDef[] = [];
    this.scanForSymbols(text, (token, start, end) => {
      if (token === 'import') {
        const next = this.nextToken(text, end);
        if (next && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(next.token)) {
          // Found 'import Name'
          // Now find 'from' and string
          let pos = next.end;
          let fromToken = this.nextToken(text, pos);
          if (fromToken && fromToken.token === 'from') {
            // Parse string literal manually
            const source = this.parseStringLiteral(text, fromToken.end);
            if (source) {
              imports.push({
                name: next.token,
                range: { start: next.start, end: next.end },
                type: 'import',
                source: source.value
              });
            }
          }
        }
      }
    });
    return imports;
  }

  // --- Tokenizer Helpers ---

  private scanForSymbols(text: string, callback: (token: string, start: number, end: number) => void) {
    let i = 0;
    const len = text.length;

    while (i < len) {
      const char = text[i];

      // Skip whitespace
      if (/\s/.test(char)) {
        i++;
        continue;
      }

      // Skip Comments
      if (char === '/' && text[i + 1] === '/') {
        i += 2;
        while (i < len && text[i] !== '\n') i++;
        continue;
      }
      if (char === '/' && text[i + 1] === '*') {
        i += 2;
        while (i < len && !(text[i] === '*' && text[i + 1] === '/')) i++;
        i += 2;
        continue;
      }

      // Skip Strings
      if (char === '"' || char === "'" || char === '`') {
        const quote = char;
        i++;
        while (i < len && text[i] !== quote) {
          if (text[i] === '\\') i++; // escape
          i++;
        }
        i++; // close quote
        continue;
      }

      // Stop at JSX start
      if (char === '<' && /[a-zA-Z]/.test(text[i + 1] || '')) {
        // rough heuristic for start of template
        // But we might be in <script> so this is risky.
        // For now, simpler: identifiers.
      }

      // Identifiers
      if (/[a-zA-Z_$]/.test(char)) {
        const start = i;
        while (i < len && /[a-zA-Z0-9_$]/.test(text[i])) i++;
        const token = text.slice(start, i);
        callback(token, start, i);
        continue;
      }

      i++;
    }
  }

  private nextToken(text: string, startPos: number): { token: string, start: number, end: number } | null {
    let i = startPos;
    while (i < text.length && /\s/.test(text[i])) i++;

    if (i >= text.length) return null;

    if (/[a-zA-Z_$]/.test(text[i])) {
      const start = i;
      while (i < text.length && /[a-zA-Z0-9_$]/.test(text[i])) i++;
      return { token: text.slice(start, i), start, end: i };
    }
    return { token: text[i], start: i, end: i + 1 };
  }

  private parseStringLiteral(text: string, startPos: number): { value: string, end: number } | null {
    let i = startPos;
    while (i < text.length && /\s/.test(text[i])) i++;

    if (i >= text.length) return null;

    const quote = text[i];
    if (quote !== '"' && quote !== "'" && quote !== '`') return null;

    i++;
    const start = i;
    while (i < text.length && text[i] !== quote) {
      if (text[i] === '\\') i++;
      i++;
    }

    if (i >= text.length) return null; // Unclosed

    return { value: text.slice(start, i), end: i + 1 };
  }
}
