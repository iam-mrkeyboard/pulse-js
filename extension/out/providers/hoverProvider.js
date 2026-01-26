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
exports.PulseHoverProvider = void 0;
const vscode = __importStar(require("vscode"));
const hover_1 = require("../hover");
class PulseHoverProvider {
    constructor() {
        this.engine = new hover_1.PulseHoverEngine();
    }
    provideHover(document, position, token) {
        const range = document.getWordRangeAtPosition(position);
        if (!range)
            return null;
        const word = document.getText(range);
        const text = document.getText();
        const offset = document.offsetAt(position);
        const result = this.engine.getHover(text, offset, word);
        if (result) {
            const markdown = new vscode.MarkdownString();
            result.contents.forEach(content => {
                if (content.startsWith('```')) {
                    const match = content.match(/^```(\w+)\n([\s\S]+)\n```$/);
                    if (match) {
                        markdown.appendCodeblock(match[2], match[1]);
                    }
                    else {
                        markdown.appendMarkdown(content + '\n\n');
                    }
                }
                else {
                    markdown.appendMarkdown(content + '\n\n');
                }
            });
            return new vscode.Hover(markdown);
        }
        return null;
    }
}
exports.PulseHoverProvider = PulseHoverProvider;
//# sourceMappingURL=hoverProvider.js.map