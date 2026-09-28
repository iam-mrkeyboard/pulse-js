// ============================================================================
// FILE: src/bundler/compiler/css-parser.ts
// Proper CSS AST-based parser for scoping and tree-shaking
// ============================================================================

export interface CSSRule {
  type: 'rule';
  selectors: string[];
  declarations: string; // Inner content of { ... }
  start: number;
  end: number;
}

export interface CSSAtRule {
  type: 'at-rule';
  name: string; // @media, @keyframes, etc.
  params: string;
  children: (CSSRule | CSSAtRule)[];
  start: number;
  end: number;
}

export type CSSNode = CSSRule | CSSAtRule;

export interface CSSParseResult {
  nodes: CSSNode[];
}

export class CSSParser {
  parse(css: string): CSSParseResult {
    const nodes: CSSNode[] = [];
    let i = 0;

    // Simplistic parser: 
    // - Skip comments
    // - Identify @rules
    // - Identify Rule Sets

    // We need to handle nesting for @media, but CSS in Pulse is flat (standard CSS) inside style blocks usually?
    // SCSS/Nesting support? Let's assume standard CSS + @media/keyframes nesting.

    while (i < css.length) {
      if (/\s/.test(css[i])) { i++; continue; }

      // Comments
      if (css.slice(i, i + 2) === '/*') {
        const end = css.indexOf('*/', i + 2);
        if (end !== -1) {
          i = end + 2;
          continue;
        } else {
          break; // Unclosed comment
        }
      }

      const start = i;

      // At-Rule
      if (css[i] === '@') {
        // Read until { or ;
        let headerEnd = i;
        let hasBlock = false;

        while (headerEnd < css.length) {
          if (css[headerEnd] === ';') {
            hasBlock = false;
            break;
          }
          if (css[headerEnd] === '{') {
            hasBlock = true;
            break;
          }
          headerEnd++;
        }

        const fullHeader = css.slice(i, headerEnd).trim();
        const nameMatch = fullHeader.match(/^(@[\w-]+)/);
        const name = nameMatch ? nameMatch[1] : fullHeader;
        const params = fullHeader.slice(name.length).trim();

        if (hasBlock) {
          const blockEnd = this.findMatchingBrace(css, headerEnd);
          if (blockEnd !== -1) {
            const blockContent = css.slice(headerEnd + 1, blockEnd);
            // Recursively parse children (for @media, etc)
            // Note: @keyframes internal structure is slightly different (selectors are percentages/from/to) 
            // but syntactically they look like rules.
            const children = this.parse(blockContent).nodes;

            nodes.push({
              type: 'at-rule',
              name,
              params,
              children,
              start,
              end: blockEnd + 1
            });
            i = blockEnd + 1;
            continue;
          }
        } else {
          // At-rule without block (e.g. @import)
          nodes.push({
            type: 'at-rule',
            name,
            params,
            children: [],
            start,
            end: headerEnd + 1
          });
          i = headerEnd + 1;
          continue;
        }
      }

      // Regular Rule
      // Read until {
      const openBrace = css.indexOf('{', i);
      if (openBrace !== -1) {
        const selectorsPart = css.slice(i, openBrace).trim();
        // Handle comments inside selectors?
        const selectors = selectorsPart.split(',').map(s => s.trim()).filter(s => s);

        const blockEnd = this.findMatchingBrace(css, openBrace);
        if (blockEnd !== -1) {
          const declarations = css.slice(openBrace + 1, blockEnd).trim();

          nodes.push({
            type: 'rule',
            selectors,
            declarations,
            start,
            end: blockEnd + 1
          });
          i = blockEnd + 1;
          continue;
        }
      }

      // If no valid start found, skip (error recovery)
      i++;
    }

    return { nodes };
  }

  private findMatchingBrace(str: string, start: number): number {
    let depth = 1;
    let i = start + 1;
    while (i < str.length) {
      if (str[i] === '{') depth++;
      else if (str[i] === '}') {
        depth--;
        if (depth === 0) return i;
      }
      i++;
    }
    return -1;
  }
}
