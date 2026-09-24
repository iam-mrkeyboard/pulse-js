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
exports.PulseDefinitionEngine = void 0;
const parser_1 = require("./parser");
const node_1 = require("vscode-languageserver/node");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const vscode_uri_1 = require("vscode-uri");
class PulseDefinitionEngine {
    constructor() {
        this.parser = new parser_1.PulseParser();
    }
    getDefinition(document, offset) {
        const text = document.getText();
        const imports = this.parser.extractImports(text);
        for (const imp of imports) {
            if (offset >= imp.range.start && offset <= imp.range.end) {
                const currentPath = vscode_uri_1.URI.parse(document.uri).fsPath;
                const targetPath = path.resolve(path.dirname(currentPath), imp.source);
                if (fs.existsSync(targetPath + '.pulse')) {
                    return node_1.Location.create(vscode_uri_1.URI.file(targetPath + '.pulse').toString(), node_1.Range.create(0, 0, 0, 0));
                }
            }
        }
        return null;
    }
}
exports.PulseDefinitionEngine = PulseDefinitionEngine;
//# sourceMappingURL=definition.js.map