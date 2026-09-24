"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const parser_1 = require("./parser");
const hover_1 = require("./hover");
const validator_1 = require("./validator");
const completion_1 = require("./completion");
const definition_1 = require("./definition");
const semanticTokens_1 = require("./semanticTokens");
const formatting_1 = require("./formatting"); // <--- Import
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
// 1. Initialize Parser
const parser = new parser_1.PulseParser();
// 2. Initialize Engines
const hoverProvider = new hover_1.PulseHoverProvider(parser);
const validator = new validator_1.PulseValidator(parser);
const completionEngine = new completion_1.PulseCompletionEngine(parser);
const definitionEngine = new definition_1.PulseDefinitionEngine(parser);
const semanticTokenProvider = new semanticTokens_1.PulseSemanticTokenProvider(parser);
const formattingProvider = new formatting_1.PulseFormattingProvider(parser); // <--- FIXED: Initialize here
let isServerReady = false;
// 3. Init Tree-sitter
parser
    .init()
    .then(() => {
    connection.console.log('✅ Tree-sitter Parser Initialized!');
    isServerReady = true;
})
    .catch((err) => {
    connection.console.error('❌ Failed to initialize Tree-sitter: ' + err.message);
});
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
            documentFormattingProvider: true, // <--- Enable Formatting
        },
    };
});
// Event Handlers
connection.onCompletion((params) => {
    if (!isServerReady)
        return [];
    const doc = documents.get(params.textDocument.uri);
    return doc
        ? completionEngine.getCompletions(doc, doc.offsetAt(params.position))
        : [];
});
connection.onCompletionResolve((item) => item);
connection.onHover((params) => {
    if (!isServerReady)
        return null;
    const doc = documents.get(params.textDocument.uri);
    return doc
        ? hoverProvider.getHover(doc.getText(), doc.offsetAt(params.position), parser.parse(doc.getText()), params.position)
        : null;
});
connection.onDefinition((params) => {
    if (!isServerReady)
        return null;
    const doc = documents.get(params.textDocument.uri);
    return doc
        ? definitionEngine.getDefinition(doc, doc.offsetAt(params.position))
        : null;
});
connection.languages.semanticTokens.on((params) => {
    if (!isServerReady)
        return { data: [] };
    const doc = documents.get(params.textDocument.uri);
    return doc
        ? semanticTokenProvider.provideSemanticTokensFull(doc)
        : { data: [] };
});
// FIXED: Document Formatting Handler
connection.onDocumentFormatting((params) => {
    const doc = documents.get(params.textDocument.uri);
    return doc ? formattingProvider.format(doc) : [];
});
documents.onDidChangeContent((change) => {
    if (isServerReady) {
        validator.validateTextDocument(change.document).then((diagnostics) => {
            connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
        });
    }
});
documents.listen(connection);
connection.listen();
//# sourceMappingURL=server.js.map