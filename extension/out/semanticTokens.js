"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PulseSemanticTokenProvider = exports.SEMANTIC_TOKENS_LEGEND = exports.TOKEN_MODIFIERS = exports.TOKEN_TYPES = void 0;
const node_1 = require("vscode-languageserver/node");
const parser_1 = require("./parser");
exports.TOKEN_TYPES = ['class', 'variable', 'property', 'event'];
exports.TOKEN_MODIFIERS = ['declaration', 'readonly'];
exports.SEMANTIC_TOKENS_LEGEND = {
    tokenTypes: exports.TOKEN_TYPES,
    tokenModifiers: exports.TOKEN_MODIFIERS,
};
class PulseSemanticTokenProvider {
    constructor() {
        this.parser = new parser_1.PulseParser();
    }
    async provideSemanticTokensFull(document) {
        const builder = new node_1.SemanticTokensBuilder();
        const tree = this.parser.parse(document.getText());
        this.traverse(tree, builder, document);
        return builder.build();
    }
    traverse(node, builder, document) {
        if (node.type === 'element' && node.tag && /^[A-Z]/.test(node.tag)) {
            const pos = document.positionAt(node.range.start + 1);
            builder.push(pos.line, pos.character, node.tag.length, 0, 0); // 0 = class
        }
        if (node.children)
            node.children.forEach((c) => this.traverse(c, builder, document));
    }
}
exports.PulseSemanticTokenProvider = PulseSemanticTokenProvider;
//# sourceMappingURL=semanticTokens.js.map