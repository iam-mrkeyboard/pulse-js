"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PulseSemanticTokenProvider = exports.SEMANTIC_TOKENS_LEGEND = exports.TOKEN_MODIFIERS = exports.TOKEN_TYPES = void 0;
const node_1 = require("vscode-languageserver/node");
const parser_1 = require("./parser");
exports.TOKEN_TYPES = [
    'comment',
    'string',
    'keyword',
    'number',
    'regexp',
    'operator',
    'namespace',
    'type',
    'struct',
    'class',
    'interface',
    'enum',
    'typeParameter',
    'function',
    'method',
    'decorator',
    'macro',
    'variable',
    'parameter',
    'property',
    'label',
    'enumMember',
    'event'
];
exports.TOKEN_MODIFIERS = [
    'declaration',
    'definition',
    'readonly',
    'static',
    'deprecated',
    'abstract',
    'async',
    'modification',
    'documentation',
    'defaultLibrary'
];
exports.SEMANTIC_TOKENS_LEGEND = {
    tokenTypes: exports.TOKEN_TYPES,
    tokenModifiers: exports.TOKEN_MODIFIERS
};
class PulseSemanticTokenProvider {
    constructor() {
        this.parser = new parser_1.PulseParser();
    }
    async provideSemanticTokens(document) {
        const text = document.getText();
        // We can use the parser to get the AST
        // Since getTree/parse is synchronous (after init), and we need to ensure init is done.
        // The parser handles init internally but lazily.
        // Ideally we should wait, but `parse` checks isReady.
        // For reliable tree, we might need a way to ensure parser is ready or wait a bit?
        // In server usage, it's likely ready by the time semantic tokens are requested.
        const tree = this.parser.parse(text);
        const builder = new node_1.SemanticTokensBuilder();
        this.traverse(tree, builder, document);
        return builder.build();
    }
    traverse(node, builder, document) {
        if (node.type === 'element') {
            this.highlightElement(node, builder, document);
        }
        if (node.children) {
            for (const child of node.children) {
                this.traverse(child, builder, document);
            }
        }
    }
    highlightElement(node, builder, document) {
        if (!node.tag || !node.range)
            return;
        // 1. Highlight Tag Name
        // Calculate position from node.range.start
        // Assuming format <TagName ...
        // Note: ParsedNode range is the whole element. We need exact tag name position.
        // We stored tag name but not its exact range in ParsedNode for the tag itself?
        // Wait, `parser.ts` buildNode logic:
        // `tag` string is extracted.
        // We don't have the explicit range of the "TagName" token in ParsedNode currently.
        // We have `node.range` which is `<TagName ... > ... </tagName>`
        // This is a limitation of current ParsedNode. 
        // To do precise semantic tokens, we might need to rely on `parser.getTree()` providing the raw Tree-sitter tree 
        // OR refine ParsedNode to include `tagRange`.
        // Let's use `parser.getTree()` approach inside here or extend ParsedNode?
        // Extending ParsedNode is cleaner for strict architecture.
        // BUT modifying ParsedNode requires touching parser.ts again.
        // Alternative: Heuristic scan from start of node.range? 
        // `<` + `Tag`
        // Safe enough for now.
        // Find absolute offset of the start tag
        // node.range.start points to `<`
        // So Tag starts at node.range.start + 1? Usually yes, unless whitespace `<  Div>` (valid HTML)
        // Better: Use `this.parser.getTree()` and walk that! using Tree-sitter is strictly better for coordinates.
        // But `traverse` is recursive using ParsedNode.
        // Let's refactor `provideSemanticTokens` to use `this.parser.getTree()` directly.
        return;
    }
    async provideSemanticTokensFull(document) {
        const text = document.getText();
        const tree = this.parser.getTree(text);
        if (!tree)
            return { data: [] };
        const builder = new node_1.SemanticTokensBuilder();
        // Recursively walk tree-sitter tree
        this.walkTreeSitter(tree.rootNode, builder, document);
        return builder.build();
    }
    walkTreeSitter(node, builder, document) {
        const type = node.type;
        if (type === 'tag_name') {
            // Check if Component (Capitalized)
            const tagName = node.text;
            if (tagName && /^[A-Z]/.test(tagName)) {
                this.addToken(node, 'class', builder, document);
            }
        }
        else if (type === 'attribute_name') {
            const attrName = node.text;
            if (attrName.startsWith('on')) {
                this.addToken(node, 'event', builder, document);
            }
            else {
                this.addToken(node, 'property', builder, document);
            }
        }
        // Recurse
        // Note during development of web-tree-sitter 0.22.6:
        // node.children is array.
        if (node.children) {
            for (const child of node.children) {
                this.walkTreeSitter(child, builder, document);
            }
        }
    }
    addToken(node, tokenType, builder, document) {
        const startPos = document.positionAt(node.startIndex);
        builder.push(startPos.line, startPos.character, node.endIndex - node.startIndex, // length
        this.getTokenTypeIndex(tokenType), 0 // modifiers bitmask
        );
    }
    getTokenTypeIndex(type) {
        return exports.TOKEN_TYPES.indexOf(type);
    }
}
exports.PulseSemanticTokenProvider = PulseSemanticTokenProvider;
//# sourceMappingURL=semanticTokens.js.map