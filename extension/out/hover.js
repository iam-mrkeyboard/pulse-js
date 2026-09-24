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
        const node = this.parser.findNodeAtOffset(tree, offset);
        if (!node)
            return null;
        if (node.type === 'element' && node.tag) {
            // Check if cursor is on Tag Name
            if (offset <= node.range.start + node.tag.length + 1) {
                if (node.tag === 'List')
                    return {
                        contents: {
                            kind: node_1.MarkupKind.Markdown,
                            value: '**Pulse List**\n\nRenders arrays efficiently.',
                        },
                    };
                if (node.tag === 'Show')
                    return {
                        contents: {
                            kind: node_1.MarkupKind.Markdown,
                            value: '**Pulse Show**\n\nConditional rendering.',
                        },
                    };
                return { contents: `HTML Element: <${node.tag}>` };
            }
        }
        return null;
    }
}
exports.PulseHoverProvider = PulseHoverProvider;
//# sourceMappingURL=hover.js.map