"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PulseValidator = void 0;
const node_1 = require("vscode-languageserver/node");
class PulseValidator {
    constructor(parser) {
        this.parser = parser;
    }
    async validateTextDocument(document) {
        const text = document.getText();
        const tree = this.parser.parse(text);
        if (!tree)
            return [];
        const diagnostics = [];
        // 1. Find structural errors from tree-sitter
        this.findTreeErrors(tree.rootNode, diagnostics, document);
        // 2. Validate script content
        const scriptNode = this.findScriptNode(tree.rootNode);
        if (scriptNode) {
            const declaredVars = this.extractDeclaredVariables(scriptNode);
            const objectProperties = this.extractObjectProperties(scriptNode);
            this.validateScriptContent(scriptNode, diagnostics, document, declaredVars);
            // Merge object properties into declared vars for template validation
            objectProperties.forEach((prop) => declaredVars.add(prop));
        }
        // 3. Validate template expressions (but skip style blocks)
        const declaredVars = scriptNode
            ? this.extractDeclaredVariables(scriptNode)
            : new Set();
        const objectProperties = scriptNode
            ? this.extractObjectProperties(scriptNode)
            : new Set();
        objectProperties.forEach((prop) => declaredVars.add(prop));
        const styleNode = this.findStyleNode(tree.rootNode);
        this.validateTemplateExpressions(tree.rootNode, diagnostics, document, declaredVars, scriptNode, styleNode);
        return diagnostics;
    }
    // Find the script_element node
    findScriptNode(node) {
        if (node.type === 'script_element') {
            return node;
        }
        for (const child of node.children) {
            const found = this.findScriptNode(child);
            if (found)
                return found;
        }
        return null;
    }
    // Find the style_element node
    findStyleNode(node) {
        if (node.type === 'style_element') {
            return node;
        }
        for (const child of node.children) {
            const found = this.findStyleNode(child);
            if (found)
                return found;
        }
        return null;
    }
    // Extract object properties from arrays and objects
    extractObjectProperties(scriptNode) {
        const properties = new Set();
        const text = scriptNode.text;
        // Find object literals and extract their keys
        let i = 0;
        while (i < text.length) {
            if (text[i] === '{') {
                const closeIdx = this.findMatchingBrace(text, i);
                if (closeIdx !== -1) {
                    const content = text.substring(i + 1, closeIdx);
                    // Extract property names: { id: 1, title: 'test', content: 'text' }
                    const propertyMatches = this.extractPropertiesFromObject(content);
                    propertyMatches.forEach((prop) => properties.add(prop));
                    i = closeIdx + 1;
                }
                else {
                    i++;
                }
            }
            else {
                i++;
            }
        }
        return properties;
    }
    extractPropertiesFromObject(objectContent) {
        const properties = [];
        let i = 0;
        while (i < objectContent.length) {
            // Skip whitespace
            while (i < objectContent.length && /\s/.test(objectContent[i]))
                i++;
            // Check for property name
            if (/[a-zA-Z_$]/.test(objectContent[i])) {
                let propName = '';
                while (i < objectContent.length &&
                    /[a-zA-Z0-9_$]/.test(objectContent[i])) {
                    propName += objectContent[i];
                    i++;
                }
                // Skip whitespace
                while (i < objectContent.length && /\s/.test(objectContent[i]))
                    i++;
                // Check if followed by : (object property)
                if (i < objectContent.length && objectContent[i] === ':') {
                    properties.push(propName);
                }
            }
            i++;
        }
        return properties;
    }
    // Extract all declared variables from script block
    extractDeclaredVariables(scriptNode) {
        const variables = new Set();
        // Add common globals
        const globals = [
            'console',
            'window',
            'document',
            'Array',
            'Object',
            'Math',
            'Date',
            'JSON',
            'setTimeout',
            'setInterval',
            'fetch',
            'Promise',
            'Error',
            'String',
            'Number',
            'Boolean',
            'undefined',
            'null',
            'true',
            'false',
            'createSignal',
            'createMemo',
            'createEffect',
            'Show',
            'For',
            'Switch',
            'Match',
            'onMount',
            'onCleanup',
        ];
        globals.forEach((g) => variables.add(g));
        // Walk the script tree to find variable declarations
        this.walkScriptForDeclarations(scriptNode, variables);
        return variables;
    }
    walkScriptForDeclarations(node, variables) {
        const text = node.text;
        // Look for patterns in raw_text (the script content)
        if (node.type === 'raw_text') {
            const lines = text.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                // const/let/var declarations
                if (trimmed.startsWith('const ') ||
                    trimmed.startsWith('let ') ||
                    trimmed.startsWith('var ')) {
                    const parts = trimmed.split(/\s+/);
                    if (parts.length >= 2) {
                        let varPart = parts[1];
                        // Handle destructuring: const [a, b] = ...
                        if (varPart.startsWith('[')) {
                            const endBracket = varPart.indexOf(']');
                            if (endBracket !== -1) {
                                const destructured = varPart.substring(1, endBracket);
                                const vars = destructured.split(',');
                                vars.forEach((v) => {
                                    const cleanVar = v.trim().split('=')[0].trim();
                                    if (cleanVar && this.isValidIdentifier(cleanVar)) {
                                        variables.add(cleanVar);
                                    }
                                });
                            }
                        }
                        // Handle object destructuring: const { a, b } = ...
                        else if (varPart.startsWith('{')) {
                            const endBrace = this.findMatchingBrace(trimmed, varPart.indexOf('{'));
                            if (endBrace !== -1) {
                                const destructured = trimmed.substring(varPart.indexOf('{') + 1, endBrace);
                                const vars = destructured.split(',');
                                vars.forEach((v) => {
                                    const cleanVar = v.trim().split(':')[0].trim();
                                    if (cleanVar && this.isValidIdentifier(cleanVar)) {
                                        variables.add(cleanVar);
                                    }
                                });
                            }
                        }
                        // Regular variable: const name = ...
                        else {
                            const cleanVar = varPart.split('=')[0].split(',')[0].trim();
                            if (cleanVar && this.isValidIdentifier(cleanVar)) {
                                variables.add(cleanVar);
                            }
                        }
                    }
                }
                // Function declarations: function name() {...}
                if (trimmed.startsWith('function ')) {
                    const parts = trimmed.split(/\s+/);
                    if (parts.length >= 2) {
                        const funcName = parts[1].split('(')[0].trim();
                        if (funcName && this.isValidIdentifier(funcName)) {
                            variables.add(funcName);
                        }
                    }
                }
                // Import statements: import Name from '...'
                if (trimmed.startsWith('import ')) {
                    if (trimmed.includes(' from ')) {
                        const beforeFrom = trimmed.split(' from ')[0];
                        const importName = beforeFrom.replace('import', '').trim();
                        if (importName && this.isValidIdentifier(importName)) {
                            variables.add(importName);
                        }
                    }
                }
            }
        }
        // Recurse through children
        for (const child of node.children) {
            this.walkScriptForDeclarations(child, variables);
        }
    }
    findMatchingBrace(text, startIdx) {
        let depth = 0;
        for (let i = startIdx; i < text.length; i++) {
            if (text[i] === '{')
                depth++;
            if (text[i] === '}') {
                depth--;
                if (depth === 0)
                    return i;
            }
        }
        return -1;
    }
    isValidIdentifier(str) {
        if (!str || str.length === 0)
            return false;
        if (!/^[a-zA-Z_$]/.test(str[0]))
            return false;
        for (let i = 1; i < str.length; i++) {
            if (!/[a-zA-Z0-9_$]/.test(str[i]))
                return false;
        }
        return true;
    }
    // Validate script content
    validateScriptContent(scriptNode, diagnostics, document, declaredVars) {
        const scriptText = scriptNode.text;
        const scriptStart = scriptNode.startIndex;
        // Walk through the script to find errors
        this.walkScriptForErrors(scriptNode, diagnostics, document, scriptStart, declaredVars);
    }
    walkScriptForErrors(node, diagnostics, document, scriptStart, declaredVars) {
        // Check for ERROR nodes (syntax errors)
        if (node.type === 'ERROR') {
            diagnostics.push({
                severity: node_1.DiagnosticSeverity.Error,
                range: {
                    start: document.positionAt(node.startIndex),
                    end: document.positionAt(node.endIndex),
                },
                message: `Syntax error: Unexpected token at "${node.text.substring(0, 20)}..."`,
                source: 'Pulse',
            });
        }
        // Check text content for specific patterns
        if (node.type === 'raw_text') {
            this.checkScriptTextForErrors(node.text, node.startIndex, diagnostics, document, declaredVars);
        }
        // Recurse
        for (const child of node.children) {
            this.walkScriptForErrors(child, diagnostics, document, scriptStart, declaredVars);
        }
    }
    checkScriptTextForErrors(text, startOffset, diagnostics, document, declaredVars) {
        const lines = text.split('\n');
        let currentOffset = startOffset;
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];
            const trimmed = line.trim();
            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
                currentOffset += line.length + 1;
                continue;
            }
            // Check for incomplete const/let/var declarations
            if (trimmed.startsWith('const ') ||
                trimmed.startsWith('let ') ||
                trimmed.startsWith('var ')) {
                const keyword = trimmed.split(' ')[0];
                const rest = trimmed.substring(keyword.length).trim();
                // Check various invalid patterns:
                // 1. Just "const" with nothing after (or just semicolon)
                // 2. "const varName" without =
                // 3. "const varName;" without =
                const hasEquals = rest.includes('=');
                const isEmpty = !rest || rest === ';';
                const isJustIdentifier = rest && !hasEquals && !rest.includes('{') && !rest.includes('[');
                if (isEmpty) {
                    // Case: "const" or "const;"
                    const keywordPos = currentOffset + line.indexOf(keyword);
                    diagnostics.push({
                        severity: node_1.DiagnosticSeverity.Error,
                        range: {
                            start: document.positionAt(keywordPos),
                            end: document.positionAt(keywordPos + keyword.length),
                        },
                        message: `Empty '${keyword}' declaration. Specify a variable name and value.`,
                        source: 'Pulse',
                    });
                }
                else if (isJustIdentifier) {
                    // Case: "const varName" or "const varName;"
                    const varName = rest.split(/[;\s]/)[0].trim();
                    if (varName && this.isValidIdentifier(varName)) {
                        const keywordPos = currentOffset + line.indexOf(keyword);
                        diagnostics.push({
                            severity: node_1.DiagnosticSeverity.Error,
                            range: {
                                start: document.positionAt(keywordPos),
                                end: document.positionAt(keywordPos + trimmed.length),
                            },
                            message: `Variable '${varName}' is declared with '${keyword}' but not initialized. Add '= value'.`,
                            source: 'Pulse',
                        });
                    }
                }
            }
            // Check for random semicolon-separated identifiers (like: fk;ak;fk;kfkkf)
            const isStandaloneLine = !trimmed.includes('=') &&
                !trimmed.includes(':') &&
                !trimmed.includes('(') &&
                !trimmed.includes(')') &&
                !trimmed.includes('{') &&
                !trimmed.includes('}') &&
                !trimmed.includes('[') &&
                !trimmed.includes(']') &&
                !trimmed.startsWith('//') &&
                !trimmed.startsWith('/*') &&
                !trimmed.startsWith('const') &&
                !trimmed.startsWith('let') &&
                !trimmed.startsWith('var') &&
                !trimmed.startsWith('function') &&
                !trimmed.startsWith('import') &&
                !trimmed.startsWith('export');
            if (isStandaloneLine && trimmed.includes(';')) {
                const parts = trimmed.split(';').filter((p) => p.trim());
                let allIdentifiers = true;
                let hasMultiple = parts.length > 1;
                for (const part of parts) {
                    const p = part.trim();
                    if (p && !this.isValidIdentifier(p)) {
                        allIdentifiers = false;
                        break;
                    }
                }
                if (allIdentifiers && hasMultiple && parts.length > 0) {
                    const pos = currentOffset + line.indexOf(trimmed);
                    diagnostics.push({
                        severity: node_1.DiagnosticSeverity.Error,
                        range: {
                            start: document.positionAt(pos),
                            end: document.positionAt(pos + trimmed.length),
                        },
                        message: `Invalid syntax: '${trimmed}'. This looks like random identifiers separated by semicolons.`,
                        source: 'Pulse',
                    });
                }
            }
            // Check for HTML entities
            if (trimmed.includes('&lt;') ||
                trimmed.includes('&gt;') ||
                trimmed.includes('&amp;') ||
                trimmed.includes('&quot;')) {
                let entityPos = -1;
                let entity = '';
                if ((entityPos = trimmed.indexOf('&lt;')) !== -1)
                    entity = '&lt;';
                else if ((entityPos = trimmed.indexOf('&gt;')) !== -1)
                    entity = '&gt;';
                else if ((entityPos = trimmed.indexOf('&amp;')) !== -1)
                    entity = '&amp;';
                else if ((entityPos = trimmed.indexOf('&quot;')) !== -1)
                    entity = '&quot;';
                if (entityPos !== -1) {
                    const pos = currentOffset + line.indexOf(entity);
                    diagnostics.push({
                        severity: node_1.DiagnosticSeverity.Error,
                        range: {
                            start: document.positionAt(pos),
                            end: document.positionAt(pos + entity.length),
                        },
                        message: `HTML entity '${entity}' is not allowed in JavaScript code.`,
                        source: 'Pulse',
                    });
                }
            }
            currentOffset += line.length + 1; // +1 for \n
        }
    }
    // Validate expressions in templates {...}
    validateTemplateExpressions(node, diagnostics, document, declaredVars, scriptNode, styleNode) {
        // Skip if we're inside the script block or style block
        if (scriptNode &&
            node.startIndex >= scriptNode.startIndex &&
            node.endIndex <= scriptNode.endIndex) {
            return;
        }
        if (styleNode &&
            node.startIndex >= styleNode.startIndex &&
            node.endIndex <= styleNode.endIndex) {
            return;
        }
        const text = node.text;
        // Look for {...} patterns in text nodes
        if (node.type === 'text' || node.type === 'raw_text') {
            let i = 0;
            while (i < text.length) {
                if (text[i] === '{') {
                    const closeIdx = this.findMatchingBrace(text, i);
                    if (closeIdx !== -1) {
                        const expression = text.substring(i + 1, closeIdx).trim();
                        const exprStart = node.startIndex + i + 1;
                        this.validateExpression(expression, exprStart, diagnostics, document, declaredVars);
                        i = closeIdx + 1;
                    }
                    else {
                        i++;
                    }
                }
                else {
                    i++;
                }
            }
        }
        // Recurse through children
        for (const child of node.children) {
            this.validateTemplateExpressions(child, diagnostics, document, declaredVars, scriptNode, styleNode);
        }
    }
    validateExpression(expression, startOffset, diagnostics, document, declaredVars) {
        // Check for HTML entities in expressions
        if (expression.includes('&lt;') || expression.includes('&gt;')) {
            let entity = '';
            let entityIdx = -1;
            if ((entityIdx = expression.indexOf('&lt;')) !== -1)
                entity = '&lt;';
            else if ((entityIdx = expression.indexOf('&gt;')) !== -1)
                entity = '&gt;';
            if (entityIdx !== -1) {
                const pos = startOffset + entityIdx;
                diagnostics.push({
                    severity: node_1.DiagnosticSeverity.Error,
                    range: {
                        start: document.positionAt(pos),
                        end: document.positionAt(pos + entity.length),
                    },
                    message: `HTML entity '${entity}' not allowed in expressions.`,
                    source: 'Pulse',
                });
            }
        }
        // Extract identifiers and check if they're defined
        const identifiers = this.extractIdentifiersWithContext(expression);
        const keywords = [
            'true',
            'false',
            'null',
            'undefined',
            'this',
            'return',
            'if',
            'else',
            'new',
            'typeof',
            'of',
            'in',
        ];
        for (const id of identifiers) {
            if (keywords.includes(id.name))
                continue;
            // Skip if it's a property access (something.property)
            if (id.isProperty)
                continue;
            if (!declaredVars.has(id.name)) {
                const pos = startOffset + id.offset;
                diagnostics.push({
                    severity: node_1.DiagnosticSeverity.Error,
                    range: {
                        start: document.positionAt(pos),
                        end: document.positionAt(pos + id.name.length),
                    },
                    message: `Variable '${id.name}' is not defined. Declare it in <script> block.`,
                    source: 'Pulse',
                });
            }
        }
    }
    extractIdentifiersWithContext(expression) {
        const identifiers = [];
        let i = 0;
        while (i < expression.length) {
            const char = expression[i];
            // Start of identifier
            if (/[a-zA-Z_$]/.test(char)) {
                let identifier = char;
                let startIdx = i;
                i++;
                while (i < expression.length && /[a-zA-Z0-9_$]/.test(expression[i])) {
                    identifier += expression[i];
                    i++;
                }
                // Check if this is a property access (preceded by .)
                const isPrecededByDot = startIdx > 0 && expression[startIdx - 1] === '.';
                identifiers.push({
                    name: identifier,
                    offset: startIdx,
                    isProperty: isPrecededByDot,
                });
            }
            else {
                i++;
            }
        }
        return identifiers;
    }
    // Find tree-sitter structural errors
    findTreeErrors(node, diagnostics, document) {
        const isMissing = node.isMissing === true ||
            (typeof node.isMissing === 'function' &&
                node.isMissing());
        if (isMissing) {
            if (node.type.includes('tag') || node.type === 'element') {
                diagnostics.push({
                    severity: node_1.DiagnosticSeverity.Error,
                    range: {
                        start: document.positionAt(node.startIndex),
                        end: document.positionAt(node.endIndex),
                    },
                    message: `Syntax Error: Missing ${node.type}. Check for unclosed tags.`,
                    source: 'Pulse',
                });
            }
        }
        if (node.children) {
            for (const child of node.children) {
                this.findTreeErrors(child, diagnostics, document);
            }
        }
    }
}
exports.PulseValidator = PulseValidator;
//# sourceMappingURL=validator.js.map