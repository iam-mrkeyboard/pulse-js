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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PulseParser = void 0;
const web_tree_sitter_1 = __importDefault(require("web-tree-sitter")); // Standard ES Import
const path = __importStar(require("path"));
class PulseParser {
    constructor() {
        this.isReady = false;
    }
    async init() {
        if (this.isReady)
            return;
        await web_tree_sitter_1.default.init();
        this.parser = new web_tree_sitter_1.default();
        const wasmPath = path.join(__dirname, 'tree-sitter-html.wasm');
        const lang = await web_tree_sitter_1.default.Language.load(wasmPath);
        this.parser.setLanguage(lang);
        this.isReady = true;
    }
    parse(text) {
        if (!this.isReady || !this.parser)
            return undefined;
        return this.parser.parse(text);
    }
    getNodeAt(tree, line, character) {
        if (!tree)
            return null;
        return tree.rootNode.descendantForPosition({
            row: line,
            column: character,
        });
    }
    getScriptContent(tree) {
        const scriptNode = tree.rootNode.children.find((n) => n.type === 'script_element');
        return scriptNode ? scriptNode.text : '';
    }
    getImports(tree) {
        const text = this.getScriptContent(tree);
        const imports = [];
        const scriptNode = tree.rootNode.children.find((n) => n.type === 'script_element');
        if (!scriptNode)
            return [];
        const startOffset = scriptNode.startIndex;
        const scriptText = scriptNode.text;
        const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
        let m;
        while ((m = importRegex.exec(scriptText)) !== null) {
            imports.push({
                source: m[1],
                start: startOffset + m.index,
                end: startOffset + m.index + m[0].length,
            });
        }
        return imports;
    }
    getScriptVariables(tree) {
        const scriptText = this.getScriptContent(tree);
        const variables = [];
        const varRegex = /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
        const funcRegex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
        const signalRegex = /const\s+\[\s*(\w+)/g;
        let m;
        while ((m = varRegex.exec(scriptText)) !== null)
            variables.push(m[1]);
        while ((m = funcRegex.exec(scriptText)) !== null)
            variables.push(m[1]);
        while ((m = signalRegex.exec(scriptText)) !== null)
            variables.push(m[1]);
        return variables;
    }
}
exports.PulseParser = PulseParser;
//# sourceMappingURL=parser.js.map