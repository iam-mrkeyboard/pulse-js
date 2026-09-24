"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PulseFormattingProvider = void 0;
const node_1 = require("vscode-languageserver/node");
class PulseFormattingProvider {
    constructor(parser) {
        this.parser = parser;
    }
    format(document) {
        const text = document.getText();
        const lines = text.split(/\r?\n/);
        const edits = [];
        let indentLevel = 0;
        const TAB_SIZE = 2;
        let consecutiveBlankLines = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            // Handle empty lines - allow max 1 consecutive blank line
            if (trimmed.length === 0) {
                consecutiveBlankLines++;
                // If we have more than 1 consecutive blank line, remove this one
                if (consecutiveBlankLines > 1) {
                    edits.push({
                        range: node_1.Range.create(i, 0, i + 1, 0), // Delete entire line including newline
                        newText: '',
                    });
                }
                continue;
            }
            // Reset blank line counter
            consecutiveBlankLines = 0;
            // First: check if this line DECREASES indent (starts with closing token)
            if (trimmed.startsWith('</') ||
                trimmed.startsWith('}') ||
                trimmed.startsWith(']') ||
                trimmed.startsWith(')')) {
                indentLevel = Math.max(0, indentLevel - 1);
            }
            // Apply indentation to THIS line
            const correctIndent = ' '.repeat(indentLevel * TAB_SIZE);
            const currentIndentMatch = line.match(/^[\s\t]*/);
            const currentIndent = currentIndentMatch ? currentIndentMatch[0] : '';
            const currentIndentLength = currentIndent.length;
            if (currentIndent !== correctIndent) {
                edits.push({
                    range: node_1.Range.create(i, 0, i, currentIndentLength),
                    newText: correctIndent,
                });
            }
            // Second: calculate if NEXT line should be more indented
            // Only increase indent if this line has NET opening tokens
            // Remove strings to avoid counting brackets inside strings
            let lineWithoutStrings = trimmed
                .replace(/"[^"]*"/g, '""')
                .replace(/'[^']*'/g, "''")
                .replace(/`[^`]*`/g, '``');
            // Count HTML tags (but ignore inline ones like <div>text</div>)
            const openTagCount = (lineWithoutStrings.match(/<[a-zA-Z][a-zA-Z0-9\-]*[^/>]*>/g) || []).length;
            const closeTagCount = (lineWithoutStrings.match(/<\/[a-zA-Z][a-zA-Z0-9\-]*>/g) || []).length;
            const selfClosingCount = (lineWithoutStrings.match(/<[a-zA-Z][a-zA-Z0-9\-]*[^>]*\/>/g) || []).length;
            // Net HTML tag change
            const netTags = openTagCount - closeTagCount - selfClosingCount;
            // Count braces, brackets, parens
            const openBraceCount = (lineWithoutStrings.match(/\{/g) || []).length;
            const closeBraceCount = (lineWithoutStrings.match(/\}/g) || []).length;
            const netBraces = openBraceCount - closeBraceCount;
            const openBracketCount = (lineWithoutStrings.match(/\[/g) || []).length;
            const closeBracketCount = (lineWithoutStrings.match(/\]/g) || []).length;
            const netBrackets = openBracketCount - closeBracketCount;
            const openParenCount = (lineWithoutStrings.match(/\(/g) || []).length;
            const closeParenCount = (lineWithoutStrings.match(/\)/g) || []).length;
            const netParens = openParenCount - closeParenCount;
            // Update indent level for NEXT line
            indentLevel += netTags + netBraces + netBrackets + netParens;
            // Safety clamp
            if (indentLevel < 0) {
                indentLevel = 0;
            }
        }
        return edits;
    }
}
exports.PulseFormattingProvider = PulseFormattingProvider;
//# sourceMappingURL=formatting.js.map