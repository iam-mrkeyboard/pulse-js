
// @ts-nocheck
const Parser = require('web-tree-sitter');
import * as path from 'path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

export interface NodeRange {
  start: number;
  end: number;
}

export interface Attribute {
  value: string;
  nameRange: NodeRange;
  valueRange: NodeRange;
}

export interface ParsedNode {
  type: 'element' | 'text' | 'attribute' | 'expression' | 'root';
  range: NodeRange;
  tag?: string;
  attributes?: Map<string, Attribute>;
  children?: ParsedNode[];
  parent?: ParsedNode;
  content?: string;
  closed?: boolean;
}

export interface StateVariable {
  name: string;
  range: NodeRange;
}

export interface Attribute {
  value: string;
  nameRange: NodeRange;
  valueRange: NodeRange;
}

export class PulseParser {
  private parser: any | undefined;
  private lang: any | undefined;
  private isReady: boolean = false;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      await Parser.init();
      this.parser = new Parser();
      const wasmPath = path.join(__dirname, '..', 'tree-sitter-html.wasm');
      this.lang = await Parser.Language.load(wasmPath);
      this.parser.setLanguage(this.lang);
      this.isReady = true;
      console.log('Tree-sitter initialized');
    } catch (e) {
      console.error('Tree-sitter init failed:', e);
    }
  }

  public getTree(text: string): any | null {
    if (!this.isReady || !this.parser) return null;
    return this.parser.parse(text);
  }

  // --- Recursive Parse for Validator ---
  public parse(text: string): ParsedNode {
    if (!this.isReady || !this.parser) {
      return { type: 'root', range: { start: 0, end: text.length }, children: [] };
    }

    const tree = this.parser.parse(text);
    if (!tree) {
      return { type: 'root', range: { start: 0, end: text.length }, children: [] };
    }
    return this.buildNode(tree.rootNode);
  }

  private buildNode(node: any): ParsedNode {
    // Determine type
    let type: ParsedNode['type'] = 'text'; // default
    // Tree-sitter-html types: 
    // element, script_element, style_element
    // text, entity, etc.

    const nodeType = node.type;

    if (nodeType === 'element' || nodeType === 'script_element' || nodeType === 'style_element') {
      type = 'element';
    } else if (nodeType === 'document' || nodeType === 'fragment') {
      type = 'root';
    }

    let tag = '';
    let attributes: Map<string, Attribute> | undefined;
    let closed = false;

    if (type === 'element') {
      const tagNameNode = node.child(0)?.type === 'start_tag'
        ? node.child(0)?.child(1) // <, tag_name, ...
        : node.descendantsOfType('tag_name')[0]; // fallback

      // Actually tree-sitter structure:
      // element -> start_tag -> tag_name
      //         -> content...
      //         -> end_tag

      const startTag = node.children.find((c: any) => c.type === 'start_tag');
      if (startTag) {
        const nameNode = startTag.children.find((c: any) => c.type === 'tag_name');
        tag = nameNode ? nameNode.text : '';
      } else {
        // maybe self-closing script_element doesn't have child 'start_tag' structure same way?
        // script_element -> start_tag -> ...
        const nameNode = node.descendantsOfType('tag_name')[0];
        tag = nameNode ? nameNode.text : '';
      }

      // Check closed
      // If valid element, it usually implies matching tags or self-closing.
      // tree-sitter `element` usually implies structural specific matching.
      // `erroneous_end_tag` or `missing_start_tag` might exist if broken.
      // For now assume if tree-sitter parsed it as element, it's structurally okayish, 
      // unless we check if end_tag exists.
      const endTag = node.children.find((c: any) => c.type === 'end_tag');
      // Self closing?
      const isSelfClosing = startTag?.text.endsWith('/>');
      closed = !!endTag || !!isSelfClosing;

      // Attributes
      attributes = new Map<string, any>();
      const attrNodes = node.descendantsOfType('attribute');

      attrNodes.forEach((attr: any) => {
        const nameNode = attr.child(0);
        // attribute -> name, =, value
        // value matches "..." or '...'
        const valueNode = attr.child(2);

        if (nameNode) {
          let val = '';
          if (valueNode) {
            val = valueNode.text;
            // Remove quotes using slice checks
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
          }

          attributes?.set(nameNode.text, {
            value: val,
            nameRange: { start: nameNode.startIndex, end: nameNode.endIndex },
            valueRange: { start: valueNode?.startIndex || 0, end: valueNode?.endIndex || 0 }
          });
        }
      });
    }

    const children: ParsedNode[] = [];
    // To get children of element, we look at nodes between start_tag and end_tag?
    // Or just iterate all children and filter out the tags themselves.

    node.children.forEach((child: any) => {
      if (child.type === 'start_tag' || child.type === 'end_tag') return;
      // Also ignore comments if we want?

      if (child.type === 'element' || child.type === 'script_element' || child.type === 'style_element') {
        children.push(this.buildNode(child));
      } else if (child.type === 'text') {
        children.push({
          type: 'text',
          range: { start: child.startIndex, end: child.endIndex },
          content: child.text
        });
      }
    });

    const parsed: ParsedNode = {
      type: type === 'root' ? 'root' : (type as any), // cast for safety
      range: { start: node.startIndex, end: node.endIndex },
      tag,
      attributes,
      children,
      content: node.text,
      closed
    };

    children.forEach((c: ParsedNode) => c.parent = parsed);
    return parsed;
  }

  // --- Offset Lookup ---
  public findNodeAtOffset(tree: any, offset: number): ParsedNode | null {
    const node = tree.rootNode.descendantForIndex(offset);
    if (!node) return null;

    // Map Tree-sitter node to ParsedNode
    if (node.type === 'tag_name' || node.type === 'element' || node.type === 'start_tag' || node.type === 'end_tag') {
      // Normalize to element
      let element = node;
      while (element && element.type !== 'element' && element.type !== 'script_element' && element.type !== 'style_element') {
        element = element.parent!;
      }

      if (element) {
        return this.mapElement(element);
      }
    }

    if (node.type === 'attribute_name' || node.type === 'quoted_attribute_value') {
      let attr = node;
      if (attr.type !== 'attribute') attr = attr.parent!;

      // now attr should be attribute
      if (attr.type === 'attribute' && attr.parent) {
        return this.mapElement(attr.parent);
      }
    }

    // Check if inside script tag
    let parentStub: ParsedNode | undefined;
    let p = node.parent;
    while (p) {
      if (p.type === 'script_element') {
        parentStub = {
          type: 'element',
          tag: 'script',
          range: { start: p.startIndex, end: p.endIndex }
        };
        break;
      }
      p = p.parent;
    }

    return {
      type: 'text',
      range: { start: node.startIndex, end: node.endIndex },
      content: node.text,
      parent: parentStub,
      children: [] // for type safety
    };
  }

  private mapElement(element: any): ParsedNode {
    const tagNameNodes = element.descendantsOfType('tag_name');
    const tagName = tagNameNodes.length > 0 ? tagNameNodes[0].text : '';

    const attributes = new Map<string, any>();
    const attrNodes = element.descendantsOfType('attribute');

    attrNodes.forEach((attr: any) => {
      const nameNode = attr.child(0);
      const valueNode = attr.child(2); // name = "value"
      if (nameNode) {
        let val = valueNode ? valueNode.text : '';
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }

        attributes.set(nameNode.text, {
          value: val,
          nameRange: { start: nameNode.startIndex, end: nameNode.endIndex },
          valueRange: { start: valueNode?.startIndex || 0, end: valueNode?.endIndex || 0 }
        });
      }
    });

    return {
      type: 'element',
      range: { start: element.startIndex, end: element.endIndex },
      tag: tagName,
      attributes,
      children: []
    };
  }

  // --- No Regex Analysis ---
  public extractStateVariables(text: string): StateVariable[] {
    // Use acorn to parse script content
    // We need to find the <script> content manually or via tree?
    // Since we have text, we can use the parser to find script nodes!

    // But parse() is cheap enough? No, we don't want to re-parse entire tree if we just have text.
    // But we need context of where script lines are.

    // Let's use getTree() since we likely have it cached or it's fast.
    const tree = this.getTree(text);
    if (!tree) return []; // Should not happen if init

    const vars: StateVariable[] = [];
    const scriptNodes = tree.rootNode.descendantsOfType('script_element');

    for (const script of scriptNodes) {
      const textNode = script.child(1); // start_tag, text, end_tag
      if (textNode && textNode.type === 'text') {
        try {
          const ast = acorn.parse(textNode.text, { ecmaVersion: 'latest', sourceType: 'module' });

          walk.simple(ast, {
            VariableDeclarator(node: any) {
              if (node.id && node.id.type === 'Identifier') {
                // Adjust offset
                const startOffset = textNode.startIndex + node.id.start;
                const endOffset = textNode.startIndex + node.id.end;
                vars.push({
                  name: node.id.name,
                  range: { start: startOffset, end: endOffset }
                });
              }
            }
          });
        } catch (e) { /* ignore parse errors */ }
      }
    }
    return vars;
  }

  public extractImports(text: string): { source: string; range: NodeRange }[] {
    const tree = this.getTree(text);
    if (!tree) return [];

    const imports: { source: string; range: NodeRange }[] = [];
    const scriptNodes = tree.rootNode.descendantsOfType('script_element');

    for (const script of scriptNodes) {
      const textNode = script.child(1);
      if (textNode && textNode.type === 'text') {
        try {
          const ast = acorn.parse(textNode.text, { ecmaVersion: 'latest', sourceType: 'module' });

          walk.simple(ast, {
            ImportDeclaration(node: any) {
              if (node.source && typeof node.source.value === 'string') {
                // node.source.start/end are relative to textNode
                const startOffset = textNode.startIndex + node.source.start; // include quotes? usually source.value is content
                // node.source is the Literal node
                imports.push({
                  source: node.source.value,
                  range: { start: startOffset, end: textNode.startIndex + node.source.end }
                });
              }
            }
          });
        } catch (e) { }
      }
    }
    return imports;
  }

  public extractSignals(text: string): string[] {
    const tree = this.getTree(text);
    if (!tree) return [];

    const signals: string[] = [];
    const scriptNodes = tree.rootNode.descendantsOfType('script_element');

    for (const script of scriptNodes) {
      const textNode = script.child(1);
      if (textNode && textNode.type === 'text') {
        try {
          const ast = acorn.parse(textNode.text, { ecmaVersion: 'latest', sourceType: 'module' });

          walk.simple(ast, {
            VariableDeclarator(node: any) {
              // Check if init is createSignal
              if (node.init && node.init.type === 'CallExpression' && node.init.callee.name === 'createSignal') {
                // node.id should be ArrayPattern: const [signal, setSignal] = ...
                if (node.id.type === 'ArrayPattern' && node.id.elements.length > 0) {
                  const firstElem = node.id.elements[0];
                  if (firstElem && firstElem.type === 'Identifier') {
                    signals.push(firstElem.name);
                  }
                }
              }
            }
          });
        } catch (e) { }
      }
    }
    return signals;
  }
}
