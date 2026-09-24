import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  CompletionItem,
  TextDocumentPositionParams,
  Hover,
  Definition,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { PulseParser } from './parser';
import { PulseHoverProvider } from './hover';
import { PulseValidator } from './validator';
import { PulseCompletionEngine } from './completion';
import { PulseDefinitionEngine } from './definition';
import {
  PulseSemanticTokenProvider,
  SEMANTIC_TOKENS_LEGEND,
} from './semanticTokens';
import { PulseFormattingProvider } from './formatting'; // <--- Import

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// 1. Initialize Parser
const parser = new PulseParser();

// 2. Initialize Engines
const hoverProvider = new PulseHoverProvider(parser);
const validator = new PulseValidator(parser);
const completionEngine = new PulseCompletionEngine(parser);
const definitionEngine = new PulseDefinitionEngine(parser);
const semanticTokenProvider = new PulseSemanticTokenProvider(parser);
const formattingProvider = new PulseFormattingProvider(parser); // <--- FIXED: Initialize here

let isServerReady = false;

// 3. Init Tree-sitter
parser
  .init()
  .then(() => {
    connection.console.log('✅ Tree-sitter Parser Initialized!');
    isServerReady = true;
  })
  .catch((err) => {
    connection.console.error(
      '❌ Failed to initialize Tree-sitter: ' + err.message,
    );
  });

connection.onInitialize((params: InitializeParams) => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['<', ' ', '.', '{'],
      },
      hoverProvider: true,
      definitionProvider: true,
      semanticTokensProvider: {
        legend: SEMANTIC_TOKENS_LEGEND,
        full: true,
        range: false,
      },
      documentFormattingProvider: true, // <--- Enable Formatting
    },
  };
});

// Event Handlers
connection.onCompletion((params) => {
  if (!isServerReady) return [];
  const doc = documents.get(params.textDocument.uri);
  return doc
    ? completionEngine.getCompletions(doc, doc.offsetAt(params.position))
    : [];
});
connection.onCompletionResolve((item) => item);

connection.onHover((params) => {
  if (!isServerReady) return null;
  const doc = documents.get(params.textDocument.uri);
  return doc
    ? hoverProvider.getHover(
        doc.getText(),
        doc.offsetAt(params.position),
        parser.parse(doc.getText()),
        params.position,
      )
    : null;
});

connection.onDefinition((params) => {
  if (!isServerReady) return null;
  const doc = documents.get(params.textDocument.uri);
  return doc
    ? definitionEngine.getDefinition(doc, doc.offsetAt(params.position))
    : null;
});

connection.languages.semanticTokens.on((params) => {
  if (!isServerReady) return { data: [] };
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
