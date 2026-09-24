"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PulseSemanticTokenProvider = exports.SEMANTIC_TOKENS_LEGEND = exports.TOKEN_MODIFIERS = exports.TOKEN_TYPES = void 0;
const node_1 = require("vscode-languageserver/node");
exports.TOKEN_TYPES = ['class', 'variable', 'property', 'event'];
exports.TOKEN_MODIFIERS = ['declaration', 'readonly'];
exports.SEMANTIC_TOKENS_LEGEND = {
    tokenTypes: exports.TOKEN_TYPES,
    tokenModifiers: exports.TOKEN_MODIFIERS,
};
class PulseSemanticTokenProvider {
    constructor(parser) {
        this.parser = parser;
    }
    async provideSemanticTokensFull(document) {
        const builder = new node_1.SemanticTokensBuilder();
        const tree = this.parser.parse(document.getText());
        if (!tree)
            return builder.build();
        this.traverse(tree.rootNode, builder, document);
        return builder.build();
    }
    traverse(node, builder, document) {
        // 1. Highlight Component Tags <Nav>
        // tree-sitter-html uses 'tag_name' for the name of the tag
        if (node.type === 'tag_name') {
            const tagName = node.text;
            if (/^[A-Z]/.test(tagName)) {
                const pos = document.positionAt(node.startIndex);
                builder.push(pos.line, pos.character, tagName.length, 0, 0); // 0 = class
            }
        }
        // 2. Highlight Attributes
        if (node.type === 'attribute_name') {
            const pos = document.positionAt(node.startIndex);
            // If it starts with 'on', treat as event
            const typeIndex = node.text.startsWith('on') ? 3 : 2; // event or property
            builder.push(pos.line, pos.character, node.text.length, typeIndex, 0);
        }
        // Recurse children
        if (node.children) {
            for (const child of node.children) {
                this.traverse(child, builder, document);
            }
        }
    }
}
exports.PulseSemanticTokenProvider = PulseSemanticTokenProvider;
//# sourceMappingURL=semanticTokens.js.map