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
exports.PulseDiagnosticsProvider = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const validator_1 = require("../validator");
class VSCodeFileSystem {
    async exists(path) {
        try {
            await fs.promises.access(path);
            return true;
        }
        catch {
            return false;
        }
    }
}
class PulseDiagnosticsProvider {
    constructor(collection) {
        this.validator = new validator_1.PulseValidator(new VSCodeFileSystem());
        this.collection = collection;
    }
    async updateDiagnostics(document) {
        const text = document.getText();
        const filePath = document.uri.fsPath;
        const validationErrors = await this.validator.validate(text, filePath);
        const diagnostics = validationErrors.map(error => {
            const range = new vscode.Range(document.positionAt(error.range.start), document.positionAt(error.range.end));
            const diagnostic = new vscode.Diagnostic(range, error.message, this.mapSeverity(error.severity));
            diagnostic.code = error.code;
            diagnostic.source = 'Pulse';
            return diagnostic;
        });
        this.collection.set(document.uri, diagnostics);
    }
    mapSeverity(severity) {
        switch (severity) {
            case validator_1.ValidationSeverity.Error: return vscode.DiagnosticSeverity.Error;
            case validator_1.ValidationSeverity.Warning: return vscode.DiagnosticSeverity.Warning;
            case validator_1.ValidationSeverity.Information: return vscode.DiagnosticSeverity.Information;
            case validator_1.ValidationSeverity.Hint: return vscode.DiagnosticSeverity.Hint;
            default: return vscode.DiagnosticSeverity.Error;
        }
    }
}
exports.PulseDiagnosticsProvider = PulseDiagnosticsProvider;
//# sourceMappingURL=diagnosticsProvider.js.map