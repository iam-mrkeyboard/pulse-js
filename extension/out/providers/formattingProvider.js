"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PulseFormattingProvider = void 0;
const vscode = __importStar(require("vscode"));
class PulseFormattingProvider {
    provideDocumentFormattingEdits(document, options, token) {
        const text = document.getText();
        const formatted = this.format(text, options);
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
        return [vscode.TextEdit.replace(fullRange, formatted)];
    }
    format(text, options) {
        const indentChar = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
        let formatted = [];
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
                if (line.endsWith('}'))
                    indentLevel = Math.max(0, indentLevel - 1);
                formatted.push(indentChar.repeat(indentLevel) + line);
                if (line.endsWith('{'))
                    indentLevel++;
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
                if (t.startsWith('</'))
                    tagBalance--;
                else if (t.endsWith('/>'))
                    tagBalance += 0;
                else if (t.startsWith('<'))
                    tagBalance++;
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
            }
            else if ((line.startsWith('</') || line.startsWith('}') || line.startsWith(')')) && totalBalance < 0) {
                // Standard closing line
                indentLevel = Math.max(0, indentLevel - 1);
            }
            formatted.push(indentChar.repeat(indentLevel) + line);
            indentLevel = Math.max(0, indentLevel + totalBalance);
        }
        return formatted.join('\n');
    }
    // Remove unused helpers
    formatCssLine(line, indent) { return ''; }
    formatJsxLine(line, level, indent) { return {}; }
}
exports.PulseFormattingProvider = PulseFormattingProvider;
//# sourceMappingURL=formattingProvider.js.map