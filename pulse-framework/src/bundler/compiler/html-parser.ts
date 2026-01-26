// ============================================================================
// FILE: src/bundler/compiler/html-parser.ts - NEW FILE
// Proper HTML parser using state machine
// ============================================================================

export interface ParsedNode {
  type: 'element' | 'text' | 'comment' | 'expression';
  tag?: string;
  attributes?: Map<string, string | ParsedExpression>;
  children?: ParsedNode[];
  content?: string;
  raw?: string;
}

export interface ParsedExpression {
  type: 'expression';
  code: string;
  dependencies: Set<string>;
}

export class HTMLParser {
  private pos = 0;
  private input = '';

  parse(html: string): ParsedNode {
    console.log('[HTMLParser] Start Parse');
    this.input = html.trim();
    this.pos = 0;

    const root: ParsedNode = {
      type: 'element',
      tag: 'root',
      children: [],
    };

    let loopSafety = 0;
    while (this.pos < this.input.length) {
      if (loopSafety++ > 100000) {
        console.error('[HTMLParser] Infinite Loop Detected at pos:', this.pos, this.peek(20));
        break;
      }
      const node = this.parseNode();
      if (node) {
        root.children!.push(node);
      } else {
        // Should not happen unless EOF logic in parseNode failure?
        // If parseNode returns null but not EOF, we must break or advance manually.
        if (this.pos < this.input.length) {
          console.warn('[HTMLParser] parseNode returned null but not EOF. Force advancing.');
          this.consume(1);
        }
      }
    }
    console.log('[HTMLParser] Finished Parse');

    return root;
  }

  private parseNode(): ParsedNode | null {
    this.skipWhitespace();

    if (this.pos >= this.input.length) {
      return null;
    }

    // Check for comment
    if (this.peek(4) === '<!--') {
      return this.parseComment();
    }

    // Check for expression
    if (this.peek(1) === '{') {
      return this.parseExpression();
    }

    // Check for element
    if (this.peek(1) === '<') {
      const el = this.parseElement();
      if (el) return el;

      // Fallback: Not a valid element. Treat '<' as text token.
      // We can allow parseText to start with '<' by passing a flag or manual consumption.
      return this.parseText(true);
    }

    // Must be text
    return this.parseText();
  }

  private parseElement(): ParsedNode | null {
    if (this.peek(1) !== '<') return null;

    // Check for closing tag beforehand to avoid consuming '<' for invalid elements
    if (this.peek(2) === '</') return null;

    this.consume(1); // consume '<'

    // Check for closing tag (double check, though peek(2) above handles most)
    if (this.peek(1) === '/') {
      return null;
    }

    // Parse tag name
    const tagName = this.parseTagName();
    if (!tagName) return null;

    // Parse attributes
    const attributes = this.parseAttributes();

    // Check for self-closing
    this.skipWhitespace();
    if (this.peek(2) === '/>') {
      this.consume(2);
      return {
        type: 'element',
        tag: tagName,
        attributes,
        children: [],
      };
    }

    // Consume '>'
    if (this.peek(1) === '>') {
      this.consume(1);
    }

    // --- RAW TEXT ELEMENTS HANDLING (FIX) ---
    // Handle script, style, textarea, title as raw text containers
    if (['script', 'style', 'textarea', 'title', 'pre', 'code'].includes(tagName.toLowerCase())) {
      const closeTag = `</${tagName}`;
      const contentStart = this.pos;
      let contentEnd = this.input.indexOf(closeTag, this.pos);

      // Handle case insensitive closing tag search or complex logic if needed
      // For simplicity, assuming exact match or lowercase match if input is normalized?
      // Actually input is raw. So we need to search Case Insensitive?
      // Pulse conventions are lowercase usually.
      // Let's stick to simple search first.

      if (contentEnd === -1) {
        // Try case insensitive or just end of file
        // If not found, consume until end
        contentEnd = this.input.length;
      }

      const rawContent = this.input.slice(contentStart, contentEnd);
      this.pos = contentEnd;

      // Consume closing tag if present
      // We matched `</tagName`. We need to consume `>` too.
      if (this.pos < this.input.length) {
        // Find `>` after `</tagName`
        const afterTag = this.input.indexOf('>', this.pos);
        if (afterTag !== -1) {
          this.pos = afterTag + 1;
        } else {
          this.pos = this.input.length;
        }
      }

      return {
        type: 'element',
        tag: tagName,
        attributes,
        children: [{ type: 'text', content: rawContent, raw: rawContent }]
      };
    }
    // ----------------------------------------

    // Parse children for standard elements
    const children: ParsedNode[] = [];

    // Handle void elements (no children)
    const voidElements = new Set(['img', 'br', 'hr', 'input', 'meta', 'link']);
    if (voidElements.has(tagName.toLowerCase())) {
      return {
        type: 'element',
        tag: tagName,
        attributes,
        children: [],
      };
    }

    // Parse until closing tag
    while (this.pos < this.input.length) {
      this.skipWhitespace(); // Skip whitespace before checking closing tag

      if (this.peek(2 + tagName.length) === `</${tagName}`) {
        // Found closing tag
        // Check exact match to avoid `</div>` matching `</d`?
        // Should consume `</tagName` then `>`.

        // Find end of closing tag `>`
        const closeTagStart = this.pos;
        const closeTagEnd = this.input.indexOf('>', closeTagStart);
        if (closeTagEnd !== -1) {
          this.pos = closeTagEnd + 1;
        } else {
          this.pos = this.input.length;
        }
        break;
      }

      const child = this.parseNode();
      if (child) {
        children.push(child);
      } else {
        // If we can't parse a node and didn't find closing tag, break to avoid infinite loop
        break;
      }
    }

    return {
      type: 'element',
      tag: tagName,
      attributes,
      children,
    };
  }

  private parseTagName(): string {
    let name = '';
    while (this.pos < this.input.length) {
      const char = this.input[this.pos];
      if (/[a-zA-Z0-9\-:]/.test(char!)) {
        name += char;
        this.pos++;
      } else {
        break;
      }
    }
    return name;
  }

  private parseAttributes(): Map<string, string | ParsedExpression> {
    const attributes = new Map<string, string | ParsedExpression>();

    while (this.pos < this.input.length) {
      this.skipWhitespace();

      if (this.peek(1) === '>' || this.peek(2) === '/>') {
        break;
      }

      const name = this.parseAttributeName();
      if (!name) break;

      this.skipWhitespace();

      if (this.peek(1) === '=') {
        this.consume(1);
        this.skipWhitespace();

        const value = this.parseAttributeValue();
        attributes.set(name, value);
      } else {
        // Boolean attribute
        attributes.set(name, '');
      }
    }

    return attributes;
  }

  private parseAttributeName(): string {
    let name = '';
    while (this.pos < this.input.length) {
      const char = this.input[this.pos];
      if (/[a-zA-Z0-9\-:@]/.test(char!)) {
        name += char;
        this.pos++;
      } else {
        break;
      }
    }
    return name;
  }

  private parseAttributeValue(): string | ParsedExpression {
    const quote = this.peek(1);

    if (quote === '"' || quote === "'") {
      this.consume(1);
      let value = '';

      while (this.pos < this.input.length) {
        if (this.peek(1) === quote) {
          this.consume(1);
          break;
        }
        value += this.input[this.pos];
        this.pos++;
      }

      return value;
    }

    // Handle expression attributes: attr={value}
    if (this.peek(1) === '{') {
      return this.parseInlineExpression();
    }

    // Unquoted value
    let value = '';
    while (this.pos < this.input.length) {
      const char = this.peek(1);
      if (char === ' ' || char === '>' || char === '/') {
        break;
      }
      value += this.input[this.pos];
      this.pos++;
    }

    return value;
  }

  private parseText(allowStartChar = false): ParsedNode {
    let content = '';

    while (this.pos < this.input.length) {
      if (!allowStartChar && (this.peek(1) === '<' || this.peek(1) === '{')) {
        break;
      }
      allowStartChar = false; // Only apply for first char
      content += this.input[this.pos];
      this.pos++;
    }

    // NO TRIM (FIX applied previously)
    return {
      type: 'text',
      content: content,
    };
  }

  private parseExpression(): ParsedNode {
    if (this.peek(1) !== '{') {
      return { type: 'text', content: '' };
    }

    this.consume(1); // consume '{'

    let depth = 1;
    let code = '';

    while (this.pos < this.input.length && depth > 0) {
      const char = this.input[this.pos];

      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          this.pos++;
          break;
        }
      }

      code += char;
      this.pos++;
    }

    return {
      type: 'expression',
      content: code.trim(),
    };
  }

  private parseInlineExpression(): ParsedExpression {
    if (this.peek(1) !== '{') {
      return { type: 'expression', code: '', dependencies: new Set() };
    }

    const startPos = this.pos;
    this.consume(1);

    let depth = 1;
    let code = '';

    while (this.pos < this.input.length && depth > 0) {
      const char = this.input[this.pos];
      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) {
          this.pos++;
          break;
        }
      }
      code += char;
      this.pos++;
    }

    // Extract dependencies (simple regex)
    const dependencies = new Set<string>();
    const depMatch = code.matchAll(/\b(state\.\w+|get_\w+)\b/g);
    for (const match of depMatch) {
      dependencies.add(match[1]);
    }

    return {
      type: 'expression',
      code: code.trim(),
      dependencies,
    };
  }

  private parseComment(): ParsedNode {
    this.consume(4); // <!--
    let content = '';
    while (this.pos < this.input.length) {
      if (this.peek(3) === '-->') {
        this.consume(3);
        break;
      }
      content += this.input[this.pos];
      this.pos++;
    }
    return {
      type: 'comment',
      content: content.trim(),
    };
  }

  private peek(n: number): string {
    return this.input.slice(this.pos, this.pos + n);
  }

  private consume(n: number): void {
    this.pos += n;
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }
}
