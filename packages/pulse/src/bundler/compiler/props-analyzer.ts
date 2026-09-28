// ============================================================================
// FILE: src/bundler/compiler/props-analyzer.ts - NEW FILE
// Analyzes component props and slots
// ============================================================================

import * as acorn from 'acorn';
import { walk } from 'estree-walker';
import type { ComponentProps, ComponentSlot } from '../types';

export class PropsAnalyzer {
  analyzeProps(code: string): Map<string, ComponentProps> {
    const props = new Map<string, ComponentProps>();

    try {
      // Look for props declaration patterns:
      // const props = defineProps({ ... })
      // export const props = { ... }

      const propsRegex =
        /(?:const|export\s+const)\s+props\s*=\s*(?:defineProps\s*)?\{([^}]+)\}/;
      const match = code.match(propsRegex);

      if (!match || !match[1]) {
        return props;
      }

      const propsContent = match[1];

      // Parse individual prop definitions
      const propLines = propsContent
        .split(',')
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of propLines) {
        const prop = this.parsePropLine(line);
        if (prop) {
          props.set(prop.name, prop);
        }
      }
    } catch (error) {
      console.warn('Error analyzing props:', error);
    }

    return props;
  }

  private parsePropLine(line: string): ComponentProps | null {
    // Handle different prop definition formats:
    // name: String
    // name: { type: String, required: true }
    // name: { type: String, default: 'value' }

    const simpleMatch = line.match(/(\w+)\s*:\s*(\w+)/);
    if (simpleMatch) {
      const [, name, type] = simpleMatch;
      return {
        name: name!,
        type: this.normalizeType(type!),
        required: false,
      };
    }

    const objectMatch = line.match(/(\w+)\s*:\s*\{([^}]+)\}/);
    if (objectMatch) {
      const [, name, content] = objectMatch;
      const typeMatch = content!.match(/type\s*:\s*(\w+)/);
      const requiredMatch = content!.match(/required\s*:\s*(true|false)/);
      const defaultMatch = content!.match(/default\s*:\s*([^,}]+)/);

      return {
        name: name!,
        type: typeMatch ? this.normalizeType(typeMatch[1]!) : 'any',
        required: requiredMatch ? requiredMatch[1] === 'true' : false,
        defaultValue: defaultMatch ? defaultMatch[1]!.trim() : undefined,
      };
    }

    return null;
  }

  private normalizeType(type: string): ComponentProps['type'] {
    const normalized = type.toLowerCase();
    if (normalized === 'string') return 'string';
    if (normalized === 'number') return 'number';
    if (normalized === 'boolean') return 'boolean';
    if (normalized === 'object') return 'object';
    if (normalized === 'function') return 'function';
    return 'any';
  }

  analyzeSlots(template: string): Map<string, ComponentSlot> {
    const slots = new Map<string, ComponentSlot>();

    // Look for <slot> tags
    const slotRegex =
      /<slot(?:\s+name=["'](\w+)["'])?(?:\s+[^>]*)?>([^<]*)<\/slot>/g;
    let match;

    while ((match = slotRegex.exec(template)) !== null) {
      const name = match[1] || 'default';
      const fallback = match[2]?.trim();

      slots.set(name, {
        name,
        fallback: fallback || undefined,
      });
    }

    return slots;
  }
}
