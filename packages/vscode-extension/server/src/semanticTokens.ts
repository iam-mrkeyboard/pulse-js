import {
  SemanticTokensLegend,
  SemanticTokensBuilder,
  SemanticTokens,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { PulseParser } from './parser';

export const TOKEN_TYPES = ['class', 'variable', 'property', 'event'];
export const TOKEN_MODIFIERS = ['declaration', 'readonly'];
export const SEMANTIC_TOKENS_LEGEND: SemanticTokensLegend = {
  tokenTypes: TOKEN_TYPES,
  tokenModifiers: TOKEN_MODIFIERS,
};

export class PulseSemanticTokenProvider {
  private parser: PulseParser;

  constructor(parser: PulseParser) {
    this.parser = parser;
  }

  public async provideSemanticTokensFull(
    document: TextDocument,
  ): Promise<SemanticTokens> {
    const builder = new SemanticTokensBuilder();
    const tree = this.parser.parse(document.getText());
    if (!tree) return builder.build();

    this.traverse(tree.rootNode, builder, document);
    return builder.build();
  }

  private traverse(
    node: any,
    builder: SemanticTokensBuilder,
    document: TextDocument,
  ) {
    // 1. Highlight Component Tags <Nav>
    // tree-sitter-html uses 'tag_name' for the name of the tag
    if (node.type === 'tag_name') {
      const tagName = node.text;
      if (/^[A-Z]/.test(tagName)) {
        const pos = document.positionAt(node.startIndex);
        builder.push(pos.line, pos.character, tagName.length, 0, 0); // 0 = class
      }
    }

    // 2. Highlight Attributes
    if (node.type === 'attribute_name') {
      const pos = document.positionAt(node.startIndex);
      // If it starts with 'on', treat as event
      const typeIndex = node.text.startsWith('on') ? 3 : 2; // event or property
      builder.push(pos.line, pos.character, node.text.length, typeIndex, 0);
    }

    // Recurse children
    if (node.children) {
      for (const child of node.children) {
        this.traverse(child, builder, document);
      }
    }
  }
}
