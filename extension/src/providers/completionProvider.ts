import * as vscode from 'vscode';
import { PulseCompletionEngine, CompletionItem, CompletionKind } from '../completion';

export class PulseCompletionProvider implements vscode.CompletionItemProvider {
  private engine: PulseCompletionEngine;

  constructor() {
    this.engine = new PulseCompletionEngine();
  }

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext,
  ): vscode.CompletionItem[] {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Delegate to generic engine
    const genericItems = this.engine.getCompletions(text, offset);

    // Map to VS Code types
    return genericItems.map(item => {
      const vsItem = new vscode.CompletionItem(item.label, this.mapKind(item.kind));
      vsItem.insertText = new vscode.SnippetString(item.insertText);
      vsItem.detail = item.detail;
      if (item.documentation) {
        vsItem.documentation = new vscode.MarkdownString(item.documentation);
      }
      return vsItem;
    });
  }

  private mapKind(kind: CompletionKind): vscode.CompletionItemKind {
    switch (kind) {
      case 'Class': return vscode.CompletionItemKind.Class;
      case 'Method': return vscode.CompletionItemKind.Method;
      case 'Property': return vscode.CompletionItemKind.Property;
      case 'Variable': return vscode.CompletionItemKind.Variable;
      case 'Event': return vscode.CompletionItemKind.Event;
      case 'Value': return vscode.CompletionItemKind.Value;
      case 'Module': return vscode.CompletionItemKind.Module;
      case 'Field': return vscode.CompletionItemKind.Field;
      default: return vscode.CompletionItemKind.Text;
    }
  }
}
