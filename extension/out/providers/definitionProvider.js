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
exports.PulseDefinitionProvider = void 0;
const vscode = __importStar(require("vscode"));
const definition_1 = require("../definition");
const fs = __importStar(require("fs"));
class NodeFileSystem {
    async exists(path) {
        try {
            await fs.promises.access(path, fs.constants.F_OK);
            return true;
        }
        catch {
            return false;
        }
    }
}
class PulseDefinitionProvider {
    constructor() {
        this.engine = new definition_1.PulseDefinitionEngine(new NodeFileSystem());
    }
    async provideDefinition(document, position, token) {
        const text = document.getText();
        const offset = document.offsetAt(position);
        // We need word at position to pass to engine?
        // Engine finds node at offset.
        // Engine needs 'word' for fallback or specific check?
        // Actually engine expects 'word'.
        const range = document.getWordRangeAtPosition(position);
        if (!range)
            return null;
        const word = document.getText(range);
        const loc = await this.engine.getDefinition(text, offset, document.uri.fsPath, word);
        if (loc) {
            return new vscode.Location(vscode.Uri.file(loc.uri), new vscode.Range(new vscode.Position(loc.range.start.line, loc.range.start.character), new vscode.Position(loc.range.end.line, loc.range.end.character)));
        }
        return null;
    }
}
exports.PulseDefinitionProvider = PulseDefinitionProvider;
//# sourceMappingURL=definitionProvider.js.map