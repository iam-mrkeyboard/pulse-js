"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PulseParser = void 0;
class PulseParser {
    parse(text) {
        const root = {
            type: 'root',
            range: { start: 0, end: text.length },
            children: [],
        };
        const tagRegex = /<([a-zA-Z0-9:-]+)([^>]*)(\/?)>/g;
        let lastIndex = 0;
        let match;
        while ((match = tagRegex.exec(text)) !== null) {
            const [fullMatch, tagName, attrsString, selfClosing] = match;
            const startIndex = match.index;
            const endIndex = startIndex + fullMatch.length;
            // Capture text before tag
            if (startIndex > lastIndex) {
                const content = text.slice(lastIndex, startIndex);
                if (content)
                    this.parseExpressions(content, lastIndex, root);
            }
            const attributes = new Map();
            const attrRegex = /([a-zA-Z0-9:-]+)(?:=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}))?/g;
            let attrMatch;
            while ((attrMatch = attrRegex.exec(attrsString)) !== null) {
                const attrName = attrMatch[1];
                const attrVal = attrMatch[2] || attrMatch[3] || attrMatch[4] || '';
                const attrStart = startIndex + 1 + tagName.length + attrMatch.index;
                attributes.set(attrName, {
                    name: attrName,
                    value: attrVal,
                    nameRange: { start: attrStart, end: attrStart + attrName.length },
                    valueRange: { start: attrStart, end: attrStart + fullMatch.length },
                });
            }
            const node = {
                type: 'element',
                tag: tagName,
                attributes: attributes,
                children: [],
                range: { start: startIndex, end: endIndex },
                closed: Boolean(selfClosing) ||
                    ['input', 'br', 'hr', 'img'].includes(tagName),
            };
            root.children?.push(node);
            lastIndex = endIndex;
        }
        if (lastIndex < text.length) {
            this.parseExpressions(text.slice(lastIndex), lastIndex, root);
        }
        return root;
    }
    parseExpressions(text, offset, parent) {
        const exprRegex = /\{([^}]+)\}/g;
        let lastIdx = 0;
        let match;
        while ((match = exprRegex.exec(text)) !== null) {
            if (match.index > lastIdx) {
                parent.children?.push({
                    type: 'text',
                    content: text.slice(lastIdx, match.index),
                    range: { start: offset + lastIdx, end: offset + match.index },
                });
            }
            parent.children?.push({
                type: 'expression',
                content: match[1],
                range: {
                    start: offset + match.index,
                    end: offset + match.index + match[0].length,
                },
            });
            lastIdx = match.index + match[0].length;
        }
    }
    extractStateVariables(text) {
        const vars = [];
        const scriptMatch = /<script>([\s\S]*?)<\/script>/.exec(text);
        if (!scriptMatch)
            return vars;
        const scriptStart = scriptMatch.index + 8;
        const content = scriptMatch[1];
        const varRegex = /(?:let|const|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
        const funcRegex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
        const importRegex = /import\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
        let m;
        while ((m = varRegex.exec(content)) !== null)
            vars.push({
                name: m[1],
                range: {
                    start: scriptStart + m.index,
                    end: scriptStart + m.index + m[0].length,
                },
                type: 'variable',
            });
        while ((m = funcRegex.exec(content)) !== null)
            vars.push({
                name: m[1],
                range: {
                    start: scriptStart + m.index,
                    end: scriptStart + m.index + m[0].length,
                },
                type: 'function',
            });
        while ((m = importRegex.exec(content)) !== null)
            vars.push({
                name: m[1],
                range: {
                    start: scriptStart + m.index,
                    end: scriptStart + m.index + m[0].length,
                },
                type: 'import',
            });
        return vars;
    }
    extractImports(text) {
        const imports = [];
        const scriptMatch = /<script>([\s\S]*?)<\/script>/.exec(text);
        if (!scriptMatch)
            return imports;
        const scriptStart = scriptMatch.index + 8;
        const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
        let m;
        while ((m = importRegex.exec(scriptMatch[1])) !== null) {
            imports.push({
                source: m[1],
                range: {
                    start: scriptStart + m.index,
                    end: scriptStart + m.index + m[0].length,
                },
            });
        }
        return imports;
    }
    extractSignals(text) {
        const signals = [];
        const scriptMatch = /<script>([\s\S]*?)<\/script>/.exec(text);
        if (!scriptMatch)
            return signals;
        const signalRegex = /const\s+\[\s*(\w+)\s*,\s*\w+\s*\]\s*=\s*createSignal/g;
        let m;
        while ((m = signalRegex.exec(scriptMatch[1])) !== null) {
            signals.push(m[1]);
        }
        return signals;
    }
    findNodeAtOffset(root, offset) {
        if (offset >= root.range.start && offset <= root.range.end) {
            if (root.children) {
                for (const child of root.children) {
                    const found = this.findNodeAtOffset(child, offset);
                    if (found)
                        return found;
                }
            }
            return root;
        }
        return null;
    }
    getTree(text) {
        return this.parse(text);
    }
}
exports.PulseParser = PulseParser;
//# sourceMappingURL=parser.js.map