"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PulseCompletionEngine = void 0;
const node_1 = require("vscode-languageserver/node");
class PulseCompletionEngine {
    constructor(parser) {
        this.parser = parser;
    }
    getCompletions(document, offset) {
        const text = document.getText();
        const context = this.getContext(text, offset);
        switch (context.type) {
            case 'style-property':
                return this.getCSSPropertyCompletions();
            case 'style-value':
                return this.getCSSValueCompletions(context.property);
            case 'jsx-expression':
                return this.getJSCompletions(context);
            case 'tag':
                return this.getTagCompletions();
            case 'attribute':
                return this.getAttributeCompletions(context.tagName);
            case 'attribute-value':
                return this.getAttributeValueCompletions(context);
            default:
                return [];
        }
    }
    getContext(text, offset) {
        const before = text.substring(0, offset);
        // Check if we're in style={{ ... }}
        const styleMatch = before.match(/style\s*=\s*\{\{[^}]*$/);
        if (styleMatch) {
            const styleContent = styleMatch[0].substring(styleMatch[0].indexOf('{{') + 2);
            const lastColon = styleContent.lastIndexOf(':');
            const lastComma = styleContent.lastIndexOf(',');
            if (lastColon > lastComma) {
                // After colon - suggest values
                const propertyMatch = styleContent
                    .substring(lastComma + 1, lastColon)
                    .match(/['"]?(\w+)['"]?\s*$/);
                return {
                    type: 'style-value',
                    property: propertyMatch ? propertyMatch[1] : undefined,
                };
            }
            else {
                // Before colon - suggest properties
                return { type: 'style-property' };
            }
        }
        // Check if we're in JSX expression {}
        const jsxMatch = before.match(/\{[^}]*$/);
        if (jsxMatch) {
            return { type: 'jsx-expression' };
        }
        // Check if we're in a tag
        const tagMatch = before.match(/<(\w+)[^>]*$/);
        if (tagMatch) {
            const tagContent = tagMatch[0];
            const attrMatch = tagContent.match(/(\w+)\s*=\s*["']?$/);
            if (attrMatch) {
                return {
                    type: 'attribute-value',
                    tagName: tagMatch[1],
                    attributeName: attrMatch[1],
                };
            }
            const hasSpace = tagContent.includes(' ');
            return {
                type: hasSpace ? 'attribute' : 'tag',
                tagName: tagMatch[1],
            };
        }
        // Check if we're starting a tag
        if (before.endsWith('<')) {
            return { type: 'tag' };
        }
        return { type: 'unknown' };
    }
    getCSSPropertyCompletions() {
        const cssProperties = [
            // Layout
            {
                name: 'display',
                values: ['block', 'flex', 'grid', 'inline', 'inline-block', 'none'],
            },
            {
                name: 'position',
                values: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
            },
            { name: 'top', values: ['auto', '0', '10px', '1rem'] },
            { name: 'right', values: ['auto', '0', '10px', '1rem'] },
            { name: 'bottom', values: ['auto', '0', '10px', '1rem'] },
            { name: 'left', values: ['auto', '0', '10px', '1rem'] },
            { name: 'zIndex', values: ['0', '1', '10', '100', '1000'] },
            // Flexbox
            {
                name: 'flexDirection',
                values: ['row', 'column', 'row-reverse', 'column-reverse'],
            },
            {
                name: 'justifyContent',
                values: [
                    'flex-start',
                    'center',
                    'flex-end',
                    'space-between',
                    'space-around',
                ],
            },
            {
                name: 'alignItems',
                values: ['flex-start', 'center', 'flex-end', 'stretch', 'baseline'],
            },
            { name: 'flex', values: ['1', '0', 'auto', 'none'] },
            { name: 'gap', values: ['10px', '1rem', '20px'] },
            // Sizing
            { name: 'width', values: ['auto', '100%', '100px', '10rem'] },
            { name: 'height', values: ['auto', '100%', '100px', '10rem'] },
            { name: 'maxWidth', values: ['none', '100%', '1200px'] },
            { name: 'maxHeight', values: ['none', '100%', '100vh'] },
            { name: 'minWidth', values: ['0', '100px', '10rem'] },
            { name: 'minHeight', values: ['0', '100px', '10rem'] },
            // Spacing
            { name: 'margin', values: ['0', '10px', '1rem', 'auto'] },
            { name: 'marginTop', values: ['0', '10px', '1rem'] },
            { name: 'marginRight', values: ['0', '10px', '1rem'] },
            { name: 'marginBottom', values: ['0', '10px', '1rem'] },
            { name: 'marginLeft', values: ['0', '10px', '1rem'] },
            { name: 'padding', values: ['0', '10px', '1rem'] },
            { name: 'paddingTop', values: ['0', '10px', '1rem'] },
            { name: 'paddingRight', values: ['0', '10px', '1rem'] },
            { name: 'paddingBottom', values: ['0', '10px', '1rem'] },
            { name: 'paddingLeft', values: ['0', '10px', '1rem'] },
            // Typography
            { name: 'color', values: ['#000', '#fff', 'red', 'blue'] },
            { name: 'fontSize', values: ['12px', '14px', '16px', '1rem', '1.5rem'] },
            { name: 'fontWeight', values: ['normal', 'bold', '400', '700'] },
            { name: 'fontFamily', values: ['system-ui', 'sans-serif', 'monospace'] },
            { name: 'lineHeight', values: ['1', '1.5', '2', 'normal'] },
            { name: 'textAlign', values: ['left', 'center', 'right', 'justify'] },
            { name: 'textDecoration', values: ['none', 'underline', 'line-through'] },
            {
                name: 'textTransform',
                values: ['none', 'uppercase', 'lowercase', 'capitalize'],
            },
            // Background
            {
                name: 'background',
                values: ['transparent', '#fff', 'linear-gradient()'],
            },
            { name: 'backgroundColor', values: ['transparent', '#fff', '#000'] },
            {
                name: 'backgroundImage',
                values: ['none', 'url()', 'linear-gradient()'],
            },
            // Border
            { name: 'border', values: ['none', '1px solid #000'] },
            { name: 'borderRadius', values: ['0', '4px', '8px', '50%'] },
            { name: 'borderColor', values: ['#000', '#ccc'] },
            { name: 'borderWidth', values: ['1px', '2px', '0'] },
            // Effects
            { name: 'boxShadow', values: ['none', '0 2px 4px rgba(0,0,0,0.1)'] },
            { name: 'opacity', values: ['1', '0.5', '0'] },
            { name: 'transform', values: ['none', 'scale(1.1)', 'rotate(45deg)'] },
            { name: 'transition', values: ['all 0.3s', 'none'] },
            // Other
            { name: 'cursor', values: ['pointer', 'default', 'not-allowed'] },
            { name: 'overflow', values: ['visible', 'hidden', 'scroll', 'auto'] },
        ];
        return cssProperties.map((prop) => ({
            label: prop.name,
            kind: node_1.CompletionItemKind.Property,
            detail: `CSS Property: ${prop.values.join(', ')}`,
            insertText: `${prop.name}: '\${1:${prop.values[0]}}'`,
            insertTextFormat: node_1.InsertTextFormat.Snippet,
            documentation: `Common values: ${prop.values.join(', ')}`,
        }));
    }
    getCSSValueCompletions(property) {
        const propertyValues = {
            display: [
                'block',
                'inline',
                'flex',
                'grid',
                'inline-block',
                'inline-flex',
                'none',
            ],
            position: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
            flexDirection: ['row', 'column', 'row-reverse', 'column-reverse'],
            justifyContent: [
                'flex-start',
                'center',
                'flex-end',
                'space-between',
                'space-around',
                'space-evenly',
            ],
            alignItems: ['flex-start', 'center', 'flex-end', 'stretch', 'baseline'],
            textAlign: ['left', 'center', 'right', 'justify'],
            fontWeight: [
                'normal',
                'bold',
                '100',
                '200',
                '300',
                '400',
                '500',
                '600',
                '700',
                '800',
                '900',
            ],
            cursor: ['pointer', 'default', 'not-allowed', 'grab', 'move', 'text'],
            overflow: ['visible', 'hidden', 'scroll', 'auto'],
        };
        const values = property ? propertyValues[property] || [] : [];
        return values.map((value) => ({
            label: value,
            kind: node_1.CompletionItemKind.Value,
            insertText: `'${value}'`,
            detail: `CSS Value for ${property}`,
        }));
    }
    getJSCompletions(context) {
        return [
            // Pulse APIs
            {
                label: 'createSignal',
                kind: node_1.CompletionItemKind.Function,
                detail: 'Create a reactive signal',
                insertText: 'createSignal($1)',
                insertTextFormat: node_1.InsertTextFormat.Snippet,
                documentation: 'const [value, setValue] = createSignal(initialValue)',
            },
            {
                label: 'createMemo',
                kind: node_1.CompletionItemKind.Function,
                detail: 'Create a memoized computed value',
                insertText: 'createMemo(() => $1)',
                insertTextFormat: node_1.InsertTextFormat.Snippet,
            },
            {
                label: 'createEffect',
                kind: node_1.CompletionItemKind.Function,
                detail: 'Create a side effect',
                insertText: 'createEffect(() => {\n\t$1\n})',
                insertTextFormat: node_1.InsertTextFormat.Snippet,
            },
            // Common JS patterns
            {
                label: 'console.log',
                kind: node_1.CompletionItemKind.Method,
                insertText: 'console.log($1)',
                insertTextFormat: node_1.InsertTextFormat.Snippet,
            },
        ];
    }
    getTagCompletions() {
        const htmlTags = [
            'div',
            'span',
            'p',
            'a',
            'button',
            'input',
            'textarea',
            'select',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'ul',
            'ol',
            'li',
            'table',
            'thead',
            'tbody',
            'tr',
            'td',
            'th',
            'form',
            'label',
            'nav',
            'header',
            'footer',
            'section',
            'article',
            'main',
        ];
        const pulseTags = ['Show', 'List', 'Portal', 'Suspense', 'ErrorBoundary'];
        return [
            ...htmlTags.map((tag) => ({
                label: tag,
                kind: node_1.CompletionItemKind.Keyword,
                detail: 'HTML Element',
                insertText: `${tag}>$1</${tag}>`,
                insertTextFormat: node_1.InsertTextFormat.Snippet,
            })),
            ...pulseTags.map((tag) => ({
                label: tag,
                kind: node_1.CompletionItemKind.Class,
                detail: 'Pulse Primitive',
                insertText: `${tag} $1>$2</${tag}>`,
                insertTextFormat: node_1.InsertTextFormat.Snippet,
            })),
        ];
    }
    getAttributeCompletions(tagName) {
        const commonAttrs = [
            { name: 'class', snippet: 'class="$1"' },
            { name: 'id', snippet: 'id="$1"' },
            { name: 'style', snippet: 'style={{ $1 }}' },
            { name: 'onClick', snippet: 'onClick={$1}' },
            { name: 'onChange', snippet: 'onChange={$1}' },
            { name: 'onInput', snippet: 'onInput={$1}' },
            { name: 'onSubmit', snippet: 'onSubmit={$1}' },
            { name: 'onFocus', snippet: 'onFocus={$1}' },
            { name: 'onBlur', snippet: 'onBlur={$1}' },
            { name: 'onMouseEnter', snippet: 'onMouseEnter={$1}' },
            { name: 'onMouseLeave', snippet: 'onMouseLeave={$1}' },
        ];
        const tagSpecificAttrs = {
            input: [
                { name: 'type', snippet: 'type="$1"' },
                { name: 'value', snippet: 'value={$1}' },
                { name: 'placeholder', snippet: 'placeholder="$1"' },
                { name: 'checked', snippet: 'checked={$1}' },
            ],
            button: [{ name: 'type', snippet: 'type="$1"' }],
            a: [
                { name: 'href', snippet: 'href="$1"' },
                { name: 'target', snippet: 'target="_blank"' },
            ],
            img: [
                { name: 'src', snippet: 'src="$1"' },
                { name: 'alt', snippet: 'alt="$1"' },
            ],
            Show: [{ name: 'when', snippet: 'when={$1}' }],
            List: [
                { name: 'each', snippet: 'each={$1}' },
                { name: 'as', snippet: 'as="$1"' },
            ],
        };
        const attrs = [
            ...commonAttrs,
            ...(tagName && tagSpecificAttrs[tagName]
                ? tagSpecificAttrs[tagName]
                : []),
        ];
        return attrs.map((attr) => ({
            label: attr.name,
            kind: node_1.CompletionItemKind.Property,
            insertText: attr.snippet,
            insertTextFormat: node_1.InsertTextFormat.Snippet,
            detail: `Attribute`,
        }));
    }
    getAttributeValueCompletions(context) {
        const { tagName, attributeName } = context;
        if (attributeName === 'type' && tagName === 'input') {
            const inputTypes = [
                'text',
                'password',
                'email',
                'number',
                'tel',
                'url',
                'search',
                'checkbox',
                'radio',
                'submit',
                'button',
                'reset',
                'file',
                'hidden',
            ];
            return inputTypes.map((type) => ({
                label: type,
                kind: node_1.CompletionItemKind.Value,
                insertText: type,
            }));
        }
        if (attributeName === 'type' && tagName === 'button') {
            return ['button', 'submit', 'reset'].map((type) => ({
                label: type,
                kind: node_1.CompletionItemKind.Value,
                insertText: type,
            }));
        }
        return [];
    }
}
exports.PulseCompletionEngine = PulseCompletionEngine;
//# sourceMappingURL=completion.js.map