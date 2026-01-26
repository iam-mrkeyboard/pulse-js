
import { PulseParser, SymbolDef } from './parser';
import { PulseDocumentationEngine } from './documentation';

export interface HoverResult {
  contents: string[];
  range?: { start: number, end: number };
}

export class PulseHoverEngine {
  private parser: PulseParser;
  private docEngine: PulseDocumentationEngine;

  constructor() {
    this.parser = new PulseParser();
    this.docEngine = new PulseDocumentationEngine();
  }

  public getHover(text: string, offset: number, word: string): HoverResult | null {
    const root = this.parser.parse(text);
    const node = this.parser.findNodeAt(offset, root);

    // 1. Primitive Documentation (e.g. <List>, <Show>)
    if (node && node.type === 'element' && node.tag === word) {
      const doc = this.docEngine.getDocumentation(word);
      if (doc) return this.formatPrimitiveHover(doc);
    }

    // 2. Component Usage & HTML Tags
    if (node && node.type === 'element' && node.tag === word) {
      if (/^[A-Z]/.test(word)) {
        const imports = this.parser.extractImports(text);
        const imp = imports.find(i => i.name === word);
        if (imp) {
          return this.formatComponentHover(imp);
        }
      }
      if (/^[a-z]/.test(word)) {
        return this.formatHtmlTagHover(word);
      }
    }

    // 3. State Variables
    const variables = this.parser.extractStateVariables(text);
    const stateVar = variables.find(v => v.name === word);
    if (stateVar) {
      if (node && (node.type === 'expression' || ((node as any).type === 'memberExpression' && (node as any).property === word) || text.slice(offset - 6, offset + word.length).includes('state.' + word))) {
        return this.formatStateVariableHover(stateVar, text);
      }
    }

    // 4. Attributes
    if (node && node.type === 'element') {
      if (node.attributes) {
        for (const [name, attr] of node.attributes) {
          if (offset >= attr.nameRange.start && offset <= attr.nameRange.end) {
            if (attr.name === word) return this.formatAttributeHover(word);
          }
        }
      }
    }

    // 5. Explicit "state." usage (Fallback)
    // Check line context manually if AST failed
    const lines = text.substring(0, offset).split('\n');
    const currentLine = text.split('\n')[lines.length - 1]; // Approximate
    // Actually better to check text around offset
    const context = text.substring(Math.max(0, offset - 10), Math.min(text.length, offset + 10));
    if (context.includes('state.' + word) && stateVar) {
      return this.formatStateVariableHover(stateVar, text);
    }

    // 6. Imports (Definition)
    const imports = this.parser.extractImports(text);
    const impDef = imports.find(i => offset >= i.range.start && offset <= i.range.end);
    if (impDef) {
      return this.formatComponentHover(impDef);
    }

    return null; // No hover found
  }

  private formatPrimitiveHover(doc: any): HoverResult {
    return {
      contents: [
        `**Pulse: ${doc.name}**`,
        doc.description,
        '```html\n' + doc.example + '\n```'
      ]
    };
  }

  private formatComponentHover(imp: SymbolDef): HoverResult {
    return {
      contents: [
        `**Component**`,
        `Imported from \`${imp.source || '?'}\``
      ]
    };
  }

  private formatStateVariableHover(variable: SymbolDef, text: string): HoverResult {
    const lines = text.split('\n');
    let lineNum = 0;
    let charCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (charCount + lines[i].length >= variable.range.start) {
        lineNum = i;
        break;
      }
      charCount += lines[i].length + 1;
    }
    const declLine = lines[lineNum].trim();

    return {
      contents: [
        '```javascript\n' + declLine + '\n```',
        '**Reactive State Variable**',
        'This variable is reactive. Changes will automatically update the UI.',
        'Access with `state.' + variable.name + '` in JSX.'
      ]
    };
  }

  private formatHtmlTagHover(tagName: string): HoverResult {
    const tagDocs: Record<string, string> = {
      div: 'Generic container element for flow content',
      span: 'Generic inline container',
      button: 'Clickable button element',
      input: 'Input control for user data',
      form: 'Interactive form for user input',
      a: 'Hyperlink element',
      img: 'Image element',
      header: 'Header section of a document or section',
      footer: 'Footer section of a document or section',
      nav: 'Navigation section',
      section: 'Thematic grouping of content',
      article: 'Self-contained composition',
      main: 'Main content of the document',
      slot: 'Placeholder for content injection (Pulse-specific)',
      title: 'Document title (appears in browser tab)',
      meta: 'Metadata element for SEO',
    };

    const desc = tagDocs[tagName] || `HTML ${tagName} element`;
    const contents = [
      '```html\n' + `<${tagName}>` + '\n```',
      desc
    ];

    if (tagName === 'slot') {
      contents.push('---');
      contents.push('**Pulse Framework**: Use `<slot />` in layouts to inject page content.');
    }

    return { contents };
  }

  private formatAttributeHover(attrName: string): HoverResult | null {
    if (attrName.startsWith('on')) {
      return this.formatEventHandlerHover(attrName);
    }

    const attrDocs: Record<string, string> = {
      class: 'Space-separated CSS class names',
      id: 'Unique identifier for the element',
      style: 'Inline CSS styles',
      href: 'URL for hyperlinks',
      src: 'URL of embedded resource',
      alt: 'Alternative text for images',
      type: 'Type of the element (button, input, etc.)',
      name: 'Name of the form element',
      value: 'Initial value of the element',
      placeholder: 'Hint text shown when input is empty',
      disabled: 'Disable the element',
      required: 'Mark field as required',
      key: 'Unique identifier for list items (required for .map())',
      each: 'Expression to iterate over (Pulse <List>)',
      as: 'Loop variable name (Pulse <List>)',
      when: 'Conditional expression (Pulse <Show>)'
    };

    if (attrDocs[attrName]) {
      return {
        contents: [
          '```html\n' + attrName + '\n```',
          attrDocs[attrName]
        ]
      };
    }
    return null;
  }

  private formatEventHandlerHover(eventName: string): HoverResult {
    const eventDocs: Record<string, { description: string; example: string }> = {
      onClick: { description: 'Fired when the element is clicked', example: 'onClick={() => { state.count++ }}' },
      onChange: { description: 'Fired when the value changes', example: 'onChange={(e) => { state.value = e.target.value }}' },
      onInput: { description: 'Fired on every input change', example: 'onInput={(e) => { state.text = e.target.value }}' },
      onSubmit: { description: 'Fired when form is submitted', example: 'onSubmit={(e) => { e.preventDefault(); handleSubmit() }}' },
      onFocus: { description: 'Fired when element gains focus', example: 'onFocus={() => { state.focused = true }}' },
      onBlur: { description: 'Fired when element loses focus', example: 'onBlur={() => { state.focused = false }}' },
      onKeyDown: { description: 'Fired when a key is pressed down', example: 'onKeyDown={(e) => { if (e.key === "Enter") submit() }}' },
      onMouseEnter: { description: 'Fired when mouse enters element', example: 'onMouseEnter={() => { state.hover = true }}' },
      onMouseLeave: { description: 'Fired when mouse leaves element', example: 'onMouseLeave={() => { state.hover = false }}' },
    };

    const info = eventDocs[eventName] || {
      description: `Event handler for ${eventName.substring(2).toLowerCase()}`,
      example: `${eventName}={() => { /* handler */ }}`
    };

    return {
      contents: [
        `**${eventName}**`,
        info.description,
        '```javascript\n' + info.example + '\n```'
      ]
    };
  }
}
