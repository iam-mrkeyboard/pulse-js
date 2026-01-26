"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const validator_1 = require("./validator");
const completion_1 = require("./completion");
const hover_1 = require("./hover");
const definition_1 = require("./definition");
const semanticTokens_1 = require("./semanticTokens");
// Create a connection for the server, using Node's IPC as a transport.
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
// Create a simple text document manager.
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
// Create validator
const validator = new validator_1.PulseValidator();
// Create completion engine
const completionEngine = new completion_1.PulseCompletionEngine();
// Create semantic tokens provider
const semanticTokenProvider = new semanticTokens_1.PulseSemanticTokenProvider();
connection.onInitialize((params) => {
    const result = {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['<', ' ', '.', ':', '@', "(", "{"]
            },
            hoverProvider: true,
            definitionProvider: true,
            semanticTokensProvider: {
                legend: semanticTokens_1.SEMANTIC_TOKENS_LEGEND,
                full: true,
                range: false
            }
        }
    }; // End result
    return result;
});
connection.onInitialized(() => {
    // Register for configuration changes
    connection.client.register(node_1.DidChangeConfigurationNotification.type, undefined);
    connection.console.log('Pulse Language Server initialized and ready to validate!');
});
const defaultSettings = { diagnostics: { enabled: true } };
let globalSettings = defaultSettings;
// Cache settings per document if we supported multi-root workspace folders
// For simpler implementation, we'll use global settings for now or fetch.
connection.onDidChangeConfiguration(change => {
    if (change.settings && change.settings.pulse) {
        globalSettings = change.settings.pulse;
    }
    else {
        globalSettings = defaultSettings;
    }
    // Revalidate all
    documents.all().forEach(validateTextDocument);
});
connection.onCompletion((textDocumentPosition) => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document)
        return [];
    const offset = document.offsetAt(textDocumentPosition.position);
    return completionEngine.getCompletions(document.getText(), offset);
});
// Create hover provider
const hoverProvider = new hover_1.PulseHoverProvider();
// Create definition engine
const definitionEngine = new definition_1.PulseDefinitionEngine();
connection.onHover((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document)
        return null;
    const offset = document.offsetAt(params.position);
    return hoverProvider.getHover(document.getText(), offset);
});
connection.onDefinition((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document)
        return null;
    const offset = document.offsetAt(params.position);
    return definitionEngine.getDefinition(document, offset);
});
connection.languages.semanticTokens.on((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document)
        return Promise.resolve({ data: [] });
    return semanticTokenProvider.provideSemanticTokensFull(document);
});
documents.onDidChangeContent(change => {
    validateTextDocument(change.document);
});
async function validateTextDocument(textDocument) {
    if (!globalSettings.diagnostics.enabled) {
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
        return;
    }
    const text = textDocument.getText();
    const errors = await validator.validate(text, textDocument.uri);
    const diagnostics = errors.map(err => {
        return {
            severity: mapSeverity(err.severity),
            range: {
                start: textDocument.positionAt(err.range.start),
                end: textDocument.positionAt(err.range.end)
            },
            message: err.message,
            source: 'Pulse Server',
            code: err.code
        };
    });
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}
function mapSeverity(severity) {
    switch (severity) {
        case validator_1.ValidationSeverity.Error: return node_1.DiagnosticSeverity.Error;
        case validator_1.ValidationSeverity.Warning: return node_1.DiagnosticSeverity.Warning;
        case validator_1.ValidationSeverity.Information: return node_1.DiagnosticSeverity.Information;
        case validator_1.ValidationSeverity.Hint: return node_1.DiagnosticSeverity.Hint;
        default: return node_1.DiagnosticSeverity.Error;
    }
}
// Sync text documents
documents.listen(connection);
// Listen on the connection
connection.listen();
//# sourceMappingURL=server.js.map