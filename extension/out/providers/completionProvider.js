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
exports.PulseCompletionProvider = void 0;
const vscode = __importStar(require("vscode"));
const completion_1 = require("../completion");
class PulseCompletionProvider {
    constructor() {
        this.engine = new completion_1.PulseCompletionEngine();
    }
    provideCompletionItems(document, position, token, context) {
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
    mapKind(kind) {
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
exports.PulseCompletionProvider = PulseCompletionProvider;
//# sourceMappingURL=completionProvider.js.map