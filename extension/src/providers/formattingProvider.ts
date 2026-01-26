import * as vscode from 'vscode';

export class PulseFormattingProvider
  implements vscode.DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken,
  ): vscode.TextEdit[] {
    const text = document.getText();
    const formatted = this.format(text, options);

    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(text.length),
    );

    return [vscode.TextEdit.replace(fullRange, formatted)];
  }

  private format(text: string, options: vscode.FormattingOptions): string {
    const indentChar = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
    let formatted: string[] = [];
    let indentLevel = 0;

    // Split by lines but keep track of context
    const lines = text.split('\n');
    let inStyle = false;
    let inScript = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      if (!line) {
        formatted.push('');
        continue;
      }

      // 1. Style Block
      if (line.startsWith('<style')) {
        inStyle = true;
        formatted.push(line);
        indentLevel++;
        continue;
      }
      if (line.startsWith('</style>')) {
        inStyle = false;
        indentLevel = Math.max(0, indentLevel - 1);
        formatted.push(line);
        continue;
      }
      if (inStyle) {
        // Simple CSS indentation
        if (line.endsWith('}')) indentLevel = Math.max(0, indentLevel - 1);
        formatted.push(indentChar.repeat(indentLevel) + line);
        if (line.endsWith('{')) indentLevel++;
        continue;
      }

      // 2. Script/Template
      // Heuristic: Indentation based on opening/closing braces/tags

      // Calculate indentation change *before* printing check (for closing tokens)
      let preChange = 0;
      let postChange = 0;

      // Tags
      const openTags = (line.match(/<[a-zA-Z][^>]*>/g) || []).length - (line.match(/\/>/g) || []).length;
      // Don't count self-closing as open.
      // Also don't count closing tags `</tag>`
      const closeTags = (line.match(/<\/[a-zA-Z][^>]*>/g) || []).length;

      // Braces/Parens
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      const openParens = (line.match(/\(/g) || []).length;
      const closeParens = (line.match(/\)/g) || []).length;

      // Check if line STARTS with closing tokens
      if (line.match(/^<\//) || line.startsWith('}') || line.startsWith(')')) {
        preChange = -1;
      }

      // Additional logic for incomplete tags (multi-line attributes)
      // If line ends with `=`, it likely continues indent
      // This naive approach helps but isn't perfect for all JSX

      // Net change
      const netTagChange = openTags - closeTags; // Self-closing handled via subtraction? No, logic above is flawed.
      // Correct logic:
      // open: <div ... > (1)
      // self: <div ... /> (0)
      // close: </div> (-1)

      // Refined tag counting:
      // Use a simple scanner or simpler regex counts
      const tags = line.match(/<\/?[\w\d-]+[^>]*\/?>/g) || [];
      let tagBalance = 0;
      tags.forEach(t => {
        if (t.startsWith('</')) tagBalance--;
        else if (t.endsWith('/>')) tagBalance += 0;
        else if (t.startsWith('<')) tagBalance++;
      });

      const braceBalance = openBraces - closeBraces;
      const parenBalance = openParens - closeParens;

      let totalBalance = tagBalance + braceBalance + parenBalance;

      // Apply pre-change
      if ((line.startsWith('</') || line.startsWith('}') || line.startsWith(')')) && totalBalance >= 0) {
        // If line starts with closing but overall balance is positive (e.g. `} else {`), 
        // we still want to unindent the current line.
        // But simpler: just trust preChange for current line printing.
        indentLevel = Math.max(0, indentLevel - 1);
        totalBalance += 1; // Compensate so we don't double count the decrement for next line
      } else if ((line.startsWith('</') || line.startsWith('}') || line.startsWith(')')) && totalBalance < 0) {
        // Standard closing line
        indentLevel = Math.max(0, indentLevel - 1);
      }

      formatted.push(indentChar.repeat(indentLevel) + line);

      indentLevel = Math.max(0, indentLevel + totalBalance);
    }

    return formatted.join('\n');
  }

  // Remove unused helpers
  private formatCssLine(line: string, indent: string): string { return ''; }
  private formatJsxLine(line: string, level: number, indent: string): any { return {}; }

}
