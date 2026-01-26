"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PulseHoverProvider = void 0;
const parser_1 = require("./parser");
const node_1 = require("vscode-languageserver/node");
class PulseHoverProvider {
    constructor() {
        this.parser = new parser_1.PulseParser();
    }
    getHover(text, offset) {
        const tree = this.parser.getTree(text);
        if (!tree)
            return null;
        // Fallback: Tree-sitter init might be async/pending.
        // If not ready, we skip (or wait? no wait in synchronous return).
        const node = this.parser.findNodeAtOffset(tree, offset);
        if (!node)
            return null;
        if (node.type === 'element') {
            if (offset <= node.range.start + (node.tag?.length || 0) + 1) {
                return this.getTagHover(node.tag || '');
            }
            // Hovering Attribute
            if (node.attributes) {
                for (const [name, attr] of node.attributes) {
                    if (offset >= attr.nameRange.start && offset <= attr.nameRange.end) {
                        return this.getAttributeHover(name, node.tag || '');
                    }
                }
            }
        }
        if (node.type === 'expression') {
            // Check for state usage
            const content = text.slice(node.range.start, node.range.end);
            // Simple regex check for now, can be improved with parser's variable extraction
            const match = /\bstate\.(\w+)\b/.exec(content);
            if (match) {
                return {
                    contents: {
                        kind: node_1.MarkupKind.Markdown,
                        value: `**Pulse State**\n\n\`${match[1]}\`: Reactive variable.`
                    }
                };
            }
        }
        return null;
    }
    getTagHover(tagName) {
        const descriptions = {
            'div': 'Generic container element.',
            'span': 'Inline container element.',
            'button': 'Clickable button element.',
            'input': 'Input control.',
            'Show': '**Pulse Primitive**: Conditionally renders content based on `when` prop.',
            'List': '**Pulse Primitive**: Renders a list of items from `each` prop.',
            'slot': '**Pulse Primitive**: Placeholder for content injection.'
        };
        if (descriptions[tagName]) {
            return {
                contents: {
                    kind: node_1.MarkupKind.Markdown,
                    value: `**${tagName}**\n\n${descriptions[tagName]}`
                }
            };
        }
        return null;
    }
    getAttributeHover(attrName, tagName) {
        const common = {
            'class': 'CSS class name(s).',
            'id': 'Unique identifier.',
            'style': 'Inline CSS styles.',
            'onClick': 'Event handler for click events.',
            'when': 'Condition for `<Show>` component.',
            'each': 'Array to iterate over for `<List>` component.'
        };
        if (common[attrName]) {
            return {
                contents: {
                    kind: node_1.MarkupKind.Markdown,
                    value: `**${attrName}**\n\n${common[attrName]}`
                }
            };
        }
        return null;
    }
}
exports.PulseHoverProvider = PulseHoverProvider;
//# sourceMappingURL=hover.js.map