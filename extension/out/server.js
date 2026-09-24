"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const validator_1 = require("./validator");
const completion_1 = require("./completion");
const hover_1 = require("./hover");
const definition_1 = require("./definition");
const semanticTokens_1 = require("./semanticTokens");
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
// Initialize Engines
const validator = new validator_1.PulseValidator();
const completionEngine = new completion_1.PulseCompletionEngine();
const hoverProvider = new hover_1.PulseHoverProvider();
const definitionEngine = new definition_1.PulseDefinitionEngine();
const semanticTokenProvider = new semanticTokens_1.PulseSemanticTokenProvider();
connection.onInitialize((params) => {
    return {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['<', ' ', '.', '{'],
            },
            hoverProvider: true,
            definitionProvider: true,
            semanticTokensProvider: {
                legend: semanticTokens_1.SEMANTIC_TOKENS_LEGEND,
                full: true,
                range: false,
            },
        },
    };
});
// 1. Completion with explicit types
connection.onCompletion((params) => {
    const doc = documents.get(params.textDocument.uri);
    return doc
        ? completionEngine.getCompletions(doc.getText(), doc.offsetAt(params.position))
        : [];
});
connection.onCompletionResolve((item) => {
    return item;
});
// 2. Hover with explicit types
connection.onHover((params) => {
    const doc = documents.get(params.textDocument.uri);
    return doc
        ? hoverProvider.getHover(doc.getText(), doc.offsetAt(params.position))
        : null;
});
// 3. Definition with explicit types
connection.onDefinition((params) => {
    const doc = documents.get(params.textDocument.uri);
    return doc
        ? definitionEngine.getDefinition(doc, doc.offsetAt(params.position))
        : null;
});
// 4. Semantic Tokens (params is inferred here usually, but we can leave it)
connection.languages.semanticTokens.on((params) => {
    const doc = documents.get(params.textDocument.uri);
    return doc
        ? semanticTokenProvider.provideSemanticTokensFull(doc)
        : { data: [] };
});
// 5. Validation
documents.onDidChangeContent((change) => {
    validator.validateTextDocument(change.document).then((diagnostics) => {
        connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
    });
});
documents.listen(connection);
connection.listen();
//# sourceMappingURL=server.js.map