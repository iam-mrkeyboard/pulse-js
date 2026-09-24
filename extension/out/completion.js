"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PulseCompletionEngine = void 0;
const parser_1 = require("./parser");
const node_1 = require("vscode-languageserver/node");
class PulseCompletionEngine {
    constructor() {
        this.parser = new parser_1.PulseParser();
    }
    getCompletions(text, offset) {
        const tree = this.parser.getTree(text);
        const node = this.parser.findNodeAtOffset(tree, offset);
        if (!node)
            return [];
        if (node.type === 'element') {
            if (offset <= node.range.start + (node.tag?.length || 0) + 1) {
                return this.getHtmlTagCompletions();
            }
            return this.getHtmlAttributeCompletions();
        }
        if (node.type === 'expression') {
            return this.getStateCompletions(text);
        }
        // Fallback for new tags
        if (node.type === 'root' || node.type === 'text') {
            const before = text.slice(0, offset);
            if (before.trim().endsWith('<'))
                return this.getHtmlTagCompletions();
            if (before.trim().endsWith('{'))
                return this.getStateCompletions(text);
        }
        return [];
    }
    getHtmlTagCompletions() {
        return [
            { label: 'div', kind: node_1.CompletionItemKind.Class },
            { label: 'span', kind: node_1.CompletionItemKind.Class },
            {
                label: 'List',
                kind: node_1.CompletionItemKind.Class,
                detail: 'Pulse Primitive',
            },
            {
                label: 'Show',
                kind: node_1.CompletionItemKind.Class,
                detail: 'Pulse Primitive',
            },
            {
                label: 'slot',
                kind: node_1.CompletionItemKind.Class,
                detail: 'Pulse Primitive',
            },
        ];
    }
    getHtmlAttributeCompletions() {
        return [
            { label: 'class', kind: node_1.CompletionItemKind.Property },
            { label: 'onclick', kind: node_1.CompletionItemKind.Event },
            { label: 'when', kind: node_1.CompletionItemKind.Property },
            { label: 'each', kind: node_1.CompletionItemKind.Property },
        ];
    }
    getStateCompletions(text) {
        const vars = this.parser.extractStateVariables(text);
        return vars.map((v) => ({
            label: v.name,
            kind: node_1.CompletionItemKind.Variable,
        }));
    }
}
exports.PulseCompletionEngine = PulseCompletionEngine;
//# sourceMappingURL=completion.js.map