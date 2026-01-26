
import { PulseParser, ParsedNode, NodeRange, Attribute } from './parser';
import * as path from 'path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

export const GLOBALS = new Set([
  'console', 'window', 'document', 'setTimeout', 'setInterval',
  'track', 'signal', 'createSignal', 'createEffect', 'createMemo', 'createStore',
  'Math', 'JSON', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean',
  'Map', 'Set', 'Promise', 'Error', 'undefined', 'null', 'NaN', 'Infinity',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI', 'decodeURI',
  'module', 'require', 'exports', 'process'
]);

export interface FileSystem {
  exists(path: string): Promise<boolean>;
}

export enum ValidationSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3
}

export interface ValidationError {
  range: NodeRange;
  message: string;
  code: string;
  severity: ValidationSeverity;
}

export class PulseValidator {
  private parser: PulseParser;
  private fs?: FileSystem;

  constructor(fs?: FileSystem) {
    this.parser = new PulseParser();
    this.fs = fs;
  }

  async validate(text: string, filePath?: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];
    const root = this.parser.parse(text);

    this.validateNode(root, errors);
    this.checkStateUsage(text, root, errors);
    this.checkImports(text, errors);
    this.checkScriptSyntax(text, root, errors);
    this.checkScriptScope(text, root, errors);

    if (this.fs && filePath) {
      await this.checkImportExistence(text, filePath, errors);
    }

    return errors;
  }

  private checkScriptSyntax(text: string, root: ParsedNode, errors: ValidationError[]) {
    const scriptNode = this.findScriptNode(root);
    if (!scriptNode || !scriptNode.children || scriptNode.children.length === 0) return;

    const textChild = scriptNode.children.find(c => c.type === 'text');
    if (!textChild || !textChild.content) return;

    try {
      acorn.parse(textChild.content, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true
      });
    } catch (err: any) {
      if (err.loc) {
        const lines = textChild.content.split('\n');
        let errorOffset = 0;
        for (let i = 0; i < err.loc.line - 1; i++) {
          errorOffset += lines[i].length + 1;
        }
        errorOffset += err.loc.column;
        const absoluteOffset = textChild.range.start + errorOffset;

        errors.push({
          range: { start: absoluteOffset, end: absoluteOffset + 1 },
          message: `Syntax Error: ${err.message.replace(/\s\(\d+:\d+\)/, '')}`,
          code: 'PULSE020',
          severity: ValidationSeverity.Error
        });
      }
    }
  }

  private checkScriptScope(text: string, root: ParsedNode, errors: ValidationError[]) {
    const scriptNode = this.findScriptNode(root);
    if (!scriptNode || !scriptNode.children || scriptNode.children.length === 0) return;

    const textChild = scriptNode.children.find(c => c.type === 'text');
    if (!textChild || !textChild.content) return;

    try {
      const ast = acorn.parse(textChild.content, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true
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

      // Pass 1: Collect declarations
      walk.simple(ast, {
        VariableDeclarator(node: any) { addPattern(node.id); },
        FunctionDeclaration(node: any) {
          if (node.id) declared.add(node.id.name);
          node.params.forEach(addPattern);
        },
        ArrowFunctionExpression(node: any) {
          node.params.forEach(addPattern);
        },
        ImportDefaultSpecifier(node: any) { declared.add(node.local.name); },
        ImportSpecifier(node: any) { declared.add(node.local.name); }
      });

      // Pass 2: Check usage
      walk.ancestor(ast, {
        Identifier(node: any, ancestors: any[]) {
          const parent = ancestors[ancestors.length - 2];
          const name = node.name;

          if (parent) {
            if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return;
            if (parent.type === 'Property' && parent.key === node && !parent.computed) return;
          }

          if (!declared.has(name) && !GLOBALS.has(name)) {
            if (node.loc) {
              const lines = textChild.content!.split('\n');
              let errorOffset = 0;
              for (let i = 0; i < node.loc.start.line - 1; i++) lines[i] && (errorOffset += lines[i].length + 1);
              errorOffset += node.loc.start.column;
              const absStart = textChild.range.start + errorOffset;

              if (!errors.some(e => e.range.start === absStart)) {
                errors.push({
                  range: { start: absStart, end: absStart + name.length },
                  message: `Undefined variable '${name}'`,
                  code: 'PULSE021',
                  severity: ValidationSeverity.Error
                });
              }
            }
          }
        }
      });

    } catch (e) { }
  }

  private findScriptNode(node: ParsedNode): ParsedNode | null {
    if (node.tag === 'script') return node;
    if (node.children) {
      for (const child of node.children) {
        const found = this.findScriptNode(child);
        if (found) return found;
      }
    }
    return null;
  }

  // ... (validateNode logic unchanged)
  private validateNode(node: ParsedNode, errors: ValidationError[]) {
    // Unclosed Tags
    if (node.type === 'element' && !node.closed) {
      errors.push({
        range: node.range,
        message: `Unclosed tag <${node.tag}>. Expected closing tag </${node.tag}>.`,
        code: 'PULSE004',
        severity: ValidationSeverity.Error
      });
    }

    // Attributes
    if (node.attributes) {
      node.attributes.forEach((attr, name) => this.validateAttribute(attr, name, errors));
    }

    // Duplicate Slots
    if (node.tag === 'slot' && node.parent) {
      this.checkDuplicateSlot(node, errors);
    }

    // Children
    if (node.children) {
      node.children.forEach(child => this.validateNode(child, errors));
    }
  }

  // ... (validateAttribute logic unchanged)
  private validateAttribute(attr: Attribute, name: string, errors: ValidationError[]) {
    // Event Format (camelCase)
    if (name.startsWith('on')) {
      if (!/^on[A-Z]/.test(name)) {
        const correct = 'on' + name.slice(2).charAt(0).toUpperCase() + name.slice(3);
        errors.push({
          range: attr.nameRange,
          message: `Event handlers should be camelCase: ${correct}`,
          code: 'PULSE014',
          severity: ValidationSeverity.Warning
        });
      }

      // Explicit Braces for Handlers
      if (!attr.value.startsWith('{') && !attr.value.startsWith('"{')) {
        errors.push({
          range: attr.valueRange,
          message: `Event handler must use curly braces: ${name}={handler}`,
          code: 'PULSE010',
          severity: ValidationSeverity.Error
        });
      }
    }

    // React-ism check
    if (name === 'className') {
      errors.push({
        range: attr.nameRange,
        message: 'Use "class" instead of "className" in Pulse.',
        code: 'PULSE014',
        severity: ValidationSeverity.Warning
      });
    }
  }

  // ... (checkDuplicateSlot logic unchanged)
  private checkDuplicateSlot(node: ParsedNode, errors: ValidationError[]) {
    const siblings = node.parent?.children || [];
    const slots = siblings.filter(c => c.tag === 'slot');
    if (slots.length > 1 && slots.indexOf(node) > 0) {
      errors.push({
        range: node.range,
        message: 'Only one <slot /> is allowed per layout component.',
        code: 'PULSE009',
        severity: ValidationSeverity.Error
      });
    }
  }

  // ... (checkStateUsage logic unchanged)
  private checkStateUsage(text: string, root: ParsedNode, errors: ValidationError[]) {
    const variables = this.parser.extractStateVariables(text);
    const stateVars = new Set(variables.map(v => v.name));
    this.validateExpressions(root, stateVars, errors);
  }

  // ... (validateExpressions logic unchanged)
  private validateExpressions(node: ParsedNode, stateVars: Set<string>, errors: ValidationError[]) {
    if (node.type === 'expression') {
      this.checkExpressionContent(node.content || '', node.range, stateVars, errors);
    }

    if (node.attributes) {
      node.attributes.forEach(attr => {
        if (attr.value.startsWith('{')) {
          this.checkExpressionContent(attr.value, attr.valueRange, stateVars, errors);
        }
      });
    }

    if (node.children) {
      node.children.forEach(child => this.validateExpressions(child, stateVars, errors));
    }
  }

  // ... (checkExpressionContent logic unchanged)
  private checkExpressionContent(expr: string, range: NodeRange, stateVars: Set<string>, errors: ValidationError[]) {
    let i = 0;
    while (i < expr.length) {
      const tag = 'state.';
      const idx = expr.indexOf(tag, i);
      if (idx === -1) break;

      const startVar = idx + tag.length;
      let endVar = startVar;
      while (endVar < expr.length && /[a-zA-Z0-9_$]/.test(expr[endVar])) {
        endVar++;
      }

      const varName = expr.slice(startVar, endVar);
      if (varName && !stateVars.has(varName)) {
        errors.push({
          range: { start: range.start + idx, end: range.start + endVar },
          message: `State variable '${varName}' is not declared.`,
          code: 'PULSE005',
          severity: ValidationSeverity.Error
        });
      }

      i = endVar;
    }
  }

  private checkImports(text: string, errors: ValidationError[]) {
    const imports = this.parser.extractImports(text);
    imports.forEach(imp => {
      if (imp.source && imp.source.startsWith('.') && !imp.source.endsWith('.pulse')) {
        errors.push({
          range: imp.range,
          message: `Pulse component imports should end with '.pulse'.`,
          code: 'PULSE007',
          severity: ValidationSeverity.Warning
        });
      }
    });
  }

  private async checkImportExistence(text: string, currentFile: string, errors: ValidationError[]) {
    if (!this.fs) return;

    const imports = this.parser.extractImports(text);
    const baseDir = path.dirname(currentFile);

    for (const imp of imports) {
      if (!imp.source || !imp.source.startsWith('.')) continue;

      const resolvedPath = path.resolve(baseDir, imp.source);
      // Try exact match or extensions? 
      // Pulse imports imply exact match or standard extensions if omitted (but we warn if .pulse omitted)
      // If extension omitted, we still check file existence.

      let exists = await this.fs.exists(resolvedPath);
      if (!exists && !path.extname(resolvedPath)) {
        // Try implicit extensions if not found
        exists = await this.fs.exists(resolvedPath + '.pulse') ||
          await this.fs.exists(resolvedPath + '.ts') ||
          await this.fs.exists(resolvedPath + '.js');
      }

      if (!exists) {
        errors.push({
          range: imp.range,
          message: `Module not found: '${imp.source}'`,
          code: 'PULSE001',
          severity: ValidationSeverity.Error
        });
      }
    }
  }
}
