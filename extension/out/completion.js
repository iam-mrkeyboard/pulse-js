"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PulseCompletionEngine = void 0;
const parser_1 = require("./parser");
const acorn = __importStar(require("acorn"));
const walk = __importStar(require("acorn-walk"));
const validator_1 = require("./validator");
const node_1 = require("vscode-languageserver/node");
class PulseCompletionEngine {
    constructor() {
        this.parser = new parser_1.PulseParser();
    }
    getCompletions(text, offset) {
        const tree = this.parser.getTree(text);
        if (!tree)
            return [];
        // Fallback or async check
        const node = this.parser.findNodeAtOffset(tree, offset);
        if (!node)
            return [];
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
            if (beforeCursor.endsWith('<'))
                return this.getHtmlTagCompletions();
            if (beforeCursor.endsWith('{'))
                return this.getStateCompletions(text);
        }
        return [];
    }
    getHtmlTagCompletions() {
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
                kind: node_1.CompletionItemKind.Class,
                detail: tag.detail || 'HTML Element',
                documentation: tag.desc,
                insertText: isSelfClosing ? `${tag.name} $1/>` : `${tag.name}>$1</${tag.name}>`
            };
        });
    }
    getHtmlAttributeCompletions() {
        const attrs = [
            'class', 'id', 'style', 'src', 'href', 'type', 'placeholder', 'value', 'name',
            'disabled', 'checked', 'selected', 'readonly', 'required', 'multiple',
            'width', 'height', 'alt', 'title', 'role', 'aria-label', 'aria-hidden'
        ];
        const events = [
            'onClick', 'onChange', 'onInput', 'onSubmit', 'onMouseEnter', 'onMouseLeave',
            'onFocus', 'onBlur', 'onKeyDown', 'onKeyUp'
        ];
        const items = attrs.map(a => ({
            label: a,
            kind: node_1.CompletionItemKind.Property,
            insertText: `${a}="$1"`
        }));
        const eventItems = events.map(e => ({
            label: e,
            kind: node_1.CompletionItemKind.Event,
            insertText: `${e}={() => $1}`,
            documentation: 'Pulse Event Handler'
        }));
        return [...items, ...eventItems];
    }
    getAttributeValueCompletions(attrName) {
        if (attrName === 'type') {
            return ['text', 'password', 'email', 'number', 'submit'].map(t => ({
                label: t,
                kind: node_1.CompletionItemKind.Variable,
                insertText: t
            }));
        }
        return [];
    }
    getStateCompletions(text) {
        const variables = this.parser.extractStateVariables(text);
        return variables.map(v => ({
            label: v.name,
            kind: node_1.CompletionItemKind.Variable,
            detail: 'Pulse State',
            insertText: `state.${v.name}`
        }));
    }
    getScriptCompletions(scriptNode, offset) {
        const textChild = scriptNode.children?.find(c => c.type === 'text');
        if (!textChild || !textChild.content)
            return [];
        try {
            const ast = acorn.parse(textChild.content, {
                ecmaVersion: 'latest',
                sourceType: 'module'
            });
            const declared = new Set();
            const addPattern = (node) => {
                if (!node)
                    return;
                if (node.type === 'Identifier')
                    declared.add(node.name);
                else if (node.type === 'ArrayPattern')
                    node.elements.forEach((e) => addPattern(e));
                else if (node.type === 'ObjectPattern')
                    node.properties.forEach((p) => addPattern(p.value));
                else if (node.type === 'RestElement')
                    addPattern(node.argument);
                else if (node.type === 'AssignmentPattern')
                    addPattern(node.left);
            };
            walk.simple(ast, {
                VariableDeclarator(node) { addPattern(node.id); },
                FunctionDeclaration(node) {
                    if (node.id)
                        declared.add(node.id.name);
                    node.params.forEach(addPattern);
                },
                ImportDefaultSpecifier(node) { declared.add(node.local.name); },
                ImportSpecifier(node) { declared.add(node.local.name); }
            });
            const items = [];
            // Add Declarations
            declared.forEach(name => {
                items.push({
                    label: name,
                    kind: node_1.CompletionItemKind.Variable,
                    insertText: name,
                    detail: 'Local Variable'
                });
            });
            // Add Globals
            validator_1.GLOBALS.forEach(name => {
                items.push({
                    label: name,
                    kind: node_1.CompletionItemKind.Value,
                    insertText: name,
                    detail: 'Global'
                });
            });
            return items;
        }
        catch (e) {
            // Fallback or partial?
            return Array.from(validator_1.GLOBALS).map(name => ({
                label: name, kind: node_1.CompletionItemKind.Value, insertText: name, detail: 'Global'
            }));
        }
    }
}
exports.PulseCompletionEngine = PulseCompletionEngine;
//# sourceMappingURL=completion.js.map