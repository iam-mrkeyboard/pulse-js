"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PulseValidator = exports.ValidationSeverity = void 0;
const parser_1 = require("./parser");
const node_1 = require("vscode-languageserver/node");
var ValidationSeverity;
(function (ValidationSeverity) {
    ValidationSeverity[ValidationSeverity["Error"] = 1] = "Error";
    ValidationSeverity[ValidationSeverity["Warning"] = 2] = "Warning";
    ValidationSeverity[ValidationSeverity["Information"] = 3] = "Information";
    ValidationSeverity[ValidationSeverity["Hint"] = 4] = "Hint";
})(ValidationSeverity || (exports.ValidationSeverity = ValidationSeverity = {}));
class PulseValidator {
    constructor() {
        this.parser = new parser_1.PulseParser();
    }
    async validateTextDocument(document) {
        const text = document.getText();
        const errors = await this.validate(text);
        return errors.map((err) => ({
            severity: err.severity === ValidationSeverity.Error
                ? node_1.DiagnosticSeverity.Error
                : node_1.DiagnosticSeverity.Warning,
            range: {
                start: document.positionAt(err.range.start),
                end: document.positionAt(err.range.end),
            },
            message: err.message,
            source: 'Pulse',
            code: err.code,
        }));
    }
    async validate(text) {
        const errors = [];
        const root = this.parser.parse(text);
        this.validateNode(root, errors);
        return errors;
    }
    validateNode(node, errors) {
        if (node.type === 'element') {
            const isComponent = node.tag && /^[A-Z]/.test(node.tag);
            if (!node.closed && !isComponent) {
                errors.push({
                    range: node.range,
                    message: `Tag <${node.tag}> is unclosed.`,
                    code: 'PULSE004',
                    severity: ValidationSeverity.Error,
                });
            }
        }
        if (node.children)
            node.children.forEach((c) => this.validateNode(c, errors));
    }
}
exports.PulseValidator = PulseValidator;
//# sourceMappingURL=validator.js.map