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
        const tree = this.parser.getTree(text);
        if (!tree)
            return null;
        const node = this.parser.findNodeAtOffset(tree, offset);
        if (!node)
            return null;
        // 1. Tag Definition (Jump to Component File)
        // <MyComponent /> -> import MyComponent from './MyComponent.pulse'
        if (node.type === 'element' && node.tag && node.tag[0] === node.tag[0].toUpperCase()) {
            if (offset <= node.range.start + node.tag.length + 1) {
                return this.getComponentDefinition(text, node.tag, document.uri);
            }
        }
        // 2. Import Definition
        // import Foo from './foo.pulse'
        // Regex fallback for imports since parser might not index them deeply
        // TODO: Parser should return Import Nodes. For now scanning text lines.
        // Actually, let's use a regex scan around the offset for imports.
        const importMatch = this.getImportAtOffset(text, offset);
        if (importMatch) {
            const targetPath = this.resolvePath(document.uri, importMatch);
            if (targetPath) {
                return node_1.Location.create(targetPath, node_1.Range.create(0, 0, 0, 0));
            }
        }
        return null;
    }
    getComponentDefinition(text, tagName, currentUri) {
        const imports = this.parser.extractImports(text);
        // Need to find which import defines the variable `tagName`.
        // extractImports currently only returns source. 
        // We need to upgrade extractImports to return binding names too?
        // Or just cheat and look for import from a path that matches?
        // Actually we need the binding name.
        // Let's rely on standard convention matching for now: import Tag from './Tag.pulse'
        for (const imp of imports) {
            // Heuristic: Does the import path basename match the tag?
            const base = path.basename(imp.source, '.pulse');
            if (base === tagName) {
                const targetUri = this.resolvePath(currentUri, imp.source);
                if (targetUri) {
                    return node_1.Location.create(targetUri, node_1.Range.create(0, 0, 0, 0));
                }
            }
        }
        return null;
    }
    getImportAtOffset(text, offset) {
        // Use parser's extractImports which uses Acorn (no regex)
        const imports = this.parser.extractImports(text);
        for (const imp of imports) {
            if (offset >= imp.range.start && offset <= imp.range.end) {
                return imp.source;
            }
        }
        return null;
    }
    resolvePath(currentUri, importPath) {
        // currentUri is file:///path/to/file.pulse
        // importPath is ./foo.pulse
        const currentPath = vscode_uri_1.URI.parse(currentUri).fsPath;
        const dir = path.dirname(currentPath);
        const targetPath = path.resolve(dir, importPath);
        if (fs.existsSync(targetPath)) {
            return vscode_uri_1.URI.file(targetPath).toString();
        }
        // Try adding .pulse extension
        if (fs.existsSync(targetPath + '.pulse')) {
            return vscode_uri_1.URI.file(targetPath + '.pulse').toString();
        }
        return null;
    }
}
exports.PulseDefinitionEngine = PulseDefinitionEngine;
//# sourceMappingURL=definition.js.map