import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  CompletionItem,
  TextDocumentPositionParams,
  DidChangeConfigurationNotification,
  Hover,
  Definition,
  SemanticTokensParams,
  SemanticTokens
} from 'vscode-languageserver/node';

import {
  TextDocument
} from 'vscode-languageserver-textdocument';

import { PulseValidator, ValidationSeverity } from './validator';
import { PulseCompletionEngine } from './completion';
import { PulseHoverProvider } from './hover';
import { PulseDefinitionEngine } from './definition';
import { PulseSemanticTokenProvider, SEMANTIC_TOKENS_LEGEND } from './semanticTokens';

// Create a connection for the server, using Node's IPC as a transport.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Create validator
const validator = new PulseValidator();
// Create completion engine
const completionEngine = new PulseCompletionEngine();
// Create semantic tokens provider
const semanticTokenProvider = new PulseSemanticTokenProvider();

connection.onInitialize((params: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['<', ' ', '.', ':', '@', "(", "{"]
      },
      hoverProvider: true,
      definitionProvider: true,
      semanticTokensProvider: {
        legend: SEMANTIC_TOKENS_LEGEND,
        full: true,
        range: false
      }
    }
  }; // End result
  return result;
});

connection.onInitialized(() => {
  // Register for configuration changes
  connection.client.register(DidChangeConfigurationNotification.type, undefined);
  connection.console.log('Pulse Language Server initialized and ready to validate!');
});

// Settings Interface
interface PulseSettings {
  diagnostics: {
    enabled: boolean;
  };
  // Add other settings here
}

const defaultSettings: PulseSettings = { diagnostics: { enabled: true } };
let globalSettings: PulseSettings = defaultSettings;

// Cache settings per document if we supported multi-root workspace folders
// For simpler implementation, we'll use global settings for now or fetch.

connection.onDidChangeConfiguration(change => {
  if (change.settings && change.settings.pulse) {
    globalSettings = change.settings.pulse;
  } else {
    globalSettings = defaultSettings;
  }
  // Revalidate all
  documents.all().forEach(validateTextDocument);
});

connection.onCompletion((textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
  const document = documents.get(textDocumentPosition.textDocument.uri);
  if (!document) return [];

  const offset = document.offsetAt(textDocumentPosition.position);
  return completionEngine.getCompletions(document.getText(), offset);
});

// Create hover provider
const hoverProvider = new PulseHoverProvider();
// Create definition engine
const definitionEngine = new PulseDefinitionEngine();

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const offset = document.offsetAt(params.position);
  return hoverProvider.getHover(document.getText(), offset);
});

connection.onDefinition((params: TextDocumentPositionParams): Definition | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const offset = document.offsetAt(params.position);
  return definitionEngine.getDefinition(document, offset);
});

connection.languages.semanticTokens.on((params: SemanticTokensParams): Promise<SemanticTokens> => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return Promise.resolve({ data: [] });
  return semanticTokenProvider.provideSemanticTokensFull(document);
});


documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  if (!globalSettings.diagnostics.enabled) {
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
    return;
  }

  const text = textDocument.getText();
  const errors = await validator.validate(text, textDocument.uri);

  const diagnostics: Diagnostic[] = errors.map(err => {
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

function mapSeverity(severity: ValidationSeverity): DiagnosticSeverity {
  switch (severity) {
    case ValidationSeverity.Error: return DiagnosticSeverity.Error;
    case ValidationSeverity.Warning: return DiagnosticSeverity.Warning;
    case ValidationSeverity.Information: return DiagnosticSeverity.Information;
    case ValidationSeverity.Hint: return DiagnosticSeverity.Hint;
    default: return DiagnosticSeverity.Error;
  }
}

// Sync text documents
documents.listen(connection);

// Listen on the connection
connection.listen();
