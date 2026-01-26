import * as vscode from 'vscode';

export class PulseDocumentSemanticTokensProvider
  implements vscode.DocumentSemanticTokensProvider
{
  provideDocumentSemanticTokens(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.SemanticTokens> {
    const tokensBuilder = new vscode.SemanticTokensBuilder();
    const text = document.getText();
    const lines = text.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      // Highlight state variables
      const stateRegex = /\bstate\.(\w+)/g;
      let match;
      while ((match = stateRegex.exec(line)) !== null) {
        tokensBuilder.push(
          lineIndex,
          match.index + 6, // Start after "state."
          match[1].length,
          0, // variable type
          1, // readonly modifier
        );
      }

      // Highlight function declarations
      const funcRegex = /\bfunction\s+(\w+)/g;
      while ((match = funcRegex.exec(line)) !== null) {
        tokensBuilder.push(
          lineIndex,
          match.index + 9, // Start after "function "
          match[1].length,
          1, // function type
          0, // declaration modifier
        );
      }

      // Highlight component names in JSX
      const componentRegex = /<([A-Z]\w+)/g;
      while ((match = componentRegex.exec(line)) !== null) {
        tokensBuilder.push(
          lineIndex,
          match.index + 1,
          match[1].length,
          4, // class type
          0,
        );
      }
    }

    return tokensBuilder.build();
  }
}
