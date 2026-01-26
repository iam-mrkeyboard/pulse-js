import * as vscode from 'vscode';
import * as fs from 'fs';
import { PulseValidator, ValidationError, ValidationSeverity, FileSystem } from '../validator';

class VSCodeFileSystem implements FileSystem {
  async exists(path: string): Promise<boolean> {
    try {
      await fs.promises.access(path);
      return true;
    } catch {
      return false;
    }
  }
}

export class PulseDiagnosticsProvider {
  private validator: PulseValidator;
  private collection: vscode.DiagnosticCollection;

  constructor(collection: vscode.DiagnosticCollection) {
    this.validator = new PulseValidator(new VSCodeFileSystem());
    this.collection = collection;
  }

  async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
    const text = document.getText();
    const filePath = document.uri.fsPath;
    const validationErrors = await this.validator.validate(text, filePath);

    const diagnostics = validationErrors.map(error => {
      const range = new vscode.Range(
        document.positionAt(error.range.start),
        document.positionAt(error.range.end)
      );

      const diagnostic = new vscode.Diagnostic(
        range,
        error.message,
        this.mapSeverity(error.severity)
      );
      diagnostic.code = error.code;
      diagnostic.source = 'Pulse';
      return diagnostic;
    });

    this.collection.set(document.uri, diagnostics);
  }

  private mapSeverity(severity: ValidationSeverity): vscode.DiagnosticSeverity {
    switch (severity) {
      case ValidationSeverity.Error: return vscode.DiagnosticSeverity.Error;
      case ValidationSeverity.Warning: return vscode.DiagnosticSeverity.Warning;
      case ValidationSeverity.Information: return vscode.DiagnosticSeverity.Information;
      case ValidationSeverity.Hint: return vscode.DiagnosticSeverity.Hint;
      default: return vscode.DiagnosticSeverity.Error;
    }
  }
}
