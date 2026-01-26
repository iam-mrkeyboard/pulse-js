
import { PulseParser, ParsedNode, NodeRange } from './parser';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { GLOBALS } from './validator';

export type CompletionKind = 'Class' | 'Method' | 'Property' | 'Variable' | 'Event' | 'Value' | 'Module' | 'Field';

export interface CompletionItem {
  label: string;
  kind: CompletionKind;
  insertText: string;
  detail?: string;
  documentation?: string;
}

export class PulseCompletionEngine {
  private parser: PulseParser;

  constructor() {
    this.parser = new PulseParser();
  }

  public getCompletions(text: string, offset: number): CompletionItem[] {
    const root = this.parser.parse(text);
    const node = this.parser.findNodeAt(offset, root);

    if (!node) return [];

    if (node.type === 'element') {
      // Tag Name: <div|
      if (offset <= node.range.start + (node.tag?.length || 0) + 1) {
        return this.getHtmlTagCompletions();
      }

      // Attribute: <div class="|"
      if (node.attributes) {
        for (const [name, attr] of node.attributes) {
          if (offset >= attr.valueRange.start && offset <= attr.valueRange.end) {
            return this.getAttributeValueCompletions(name);
          }
        }
      }

      // Inside Tag: <div | >
      return this.getHtmlAttributeCompletions();
    }

    if (node.type === 'expression') {
      return this.getStateCompletions(text); // TODO: Merge with JS completions if expression allows it
    }

    // Script Completion (Content)
    if (node.type === 'text' && node.parent?.tag === 'script') {
      return this.getScriptCompletions(node.parent, offset);
    }

    // Text fallback logic relies on inspecting text near cursor
    // The parser returns "Text" node.
    if (node.type === 'text' || node.type === 'root') {
      // We need to look at the text *before* the offset to guess trigger
      const beforeCursor = text.slice(Math.max(0, offset - 10), offset);

      if (beforeCursor.endsWith('<')) return this.getHtmlTagCompletions();
      if (beforeCursor.endsWith('{')) return this.getStateCompletions(text);
    }

    return [];
  }

  private getHtmlTagCompletions(): CompletionItem[] {
    const tags = [
      { name: 'div', desc: 'Generic container' },
      { name: 'span', desc: 'Inline container' },
      { name: 'button', desc: 'Clickable button' },
      { name: 'input', desc: 'Input control' },
      { name: 'Show', desc: 'Pulse: Conditional rendering', detail: 'Pulse Primitives' },
      { name: 'List', desc: 'Pulse: List rendering', detail: 'Pulse Primitives' },
      { name: 'slot', desc: 'Pulse: Content placeholder', detail: 'Pulse Primitives' }
    ];

    return tags.map((tag) => {
      const isSelfClosing = ['input', 'img', 'br', 'hr', 'slot'].includes(tag.name);
      return {
        label: tag.name,
        kind: 'Class',
        detail: tag.detail || 'HTML Element',
        documentation: tag.desc,
        insertText: isSelfClosing ? `${tag.name} $1/>` : `${tag.name}>$1</${tag.name}>`
      };
    });
  }

  private getHtmlAttributeCompletions(): CompletionItem[] {
    const attrs = [
      'class', 'id', 'style', 'src', 'href', 'type', 'placeholder', 'value', 'name',
      'disabled', 'checked', 'selected', 'readonly', 'required', 'multiple',
      'width', 'height', 'alt', 'title', 'role', 'aria-label', 'aria-hidden'
    ];
    const events = [
      'onClick', 'onChange', 'onInput', 'onSubmit', 'onMouseEnter', 'onMouseLeave',
      'onFocus', 'onBlur', 'onKeyDown', 'onKeyUp'
    ];

    const items: CompletionItem[] = attrs.map(a => ({
      label: a,
      kind: 'Property',
      insertText: `${a}="$1"`
    }));

    const eventItems: CompletionItem[] = events.map(e => ({
      label: e,
      kind: 'Event',
      insertText: `${e}={() => $1}`,
      documentation: 'Pulse Event Handler'
    }));

    return [...items, ...eventItems];
  }

  private getAttributeValueCompletions(attrName: string): CompletionItem[] {
    if (attrName === 'type') {
      return ['text', 'password', 'email', 'number', 'submit'].map(t => ({
        label: t,
        kind: 'Value',
        insertText: t
      }));
    }
    return [];
  }

  private getStateCompletions(text: string): CompletionItem[] {
    const variables = this.parser.extractStateVariables(text);
    return variables.map(v => ({
      label: v.name,
      kind: 'Variable',
      detail: 'Pulse State',
      insertText: `state.${v.name}`
    }));
  }

  private getScriptCompletions(scriptNode: ParsedNode, offset: number): CompletionItem[] {
    const textChild = scriptNode.children?.find(c => c.type === 'text');
    if (!textChild || !textChild.content) return [];

    try {
      const ast = acorn.parse(textChild.content, {
        ecmaVersion: 'latest',
        sourceType: 'module'
      });

      const declared = new Set<string>();
      const addPattern = (node: any) => {
        if (!node) return;
        if (node.type === 'Identifier') declared.add(node.name);
        else if (node.type === 'ArrayPattern') node.elements.forEach((e: any) => addPattern(e));
        else if (node.type === 'ObjectPattern') node.properties.forEach((p: any) => addPattern(p.value));
        else if (node.type === 'RestElement') addPattern(node.argument);
        else if (node.type === 'AssignmentPattern') addPattern(node.left);
      };

      walk.simple(ast, {
        VariableDeclarator(node: any) { addPattern(node.id); },
        FunctionDeclaration(node: any) {
          if (node.id) declared.add(node.id.name);
          node.params.forEach(addPattern);
        },
        ImportDefaultSpecifier(node: any) { declared.add(node.local.name); },
        ImportSpecifier(node: any) { declared.add(node.local.name); }
      });

      const items: CompletionItem[] = [];

      // Add Declarations
      declared.forEach(name => {
        items.push({
          label: name,
          kind: 'Variable',
          insertText: name,
          detail: 'Local Variable'
        });
      });

      // Add Globals
      GLOBALS.forEach(name => {
        items.push({
          label: name,
          kind: 'Value',
          insertText: name,
          detail: 'Global'
        });
      });

      return items;

    } catch (e) {
      // Fallback or partial?
      return Array.from(GLOBALS).map(name => ({
        label: name, kind: 'Value', insertText: name, detail: 'Global'
      }));
    }
  }
}

