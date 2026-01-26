// ============================================================================
// FILE: src/bundler/compiler/slots-compiler.ts - NEW FILE
// Handles children and named slots compilation
// ============================================================================

export interface SlotContent {
  name: string;
  content: string;
  isDefault: boolean;
}

export class SlotsCompiler {
  compileSlots(
    template: string,
    componentName: string,
  ): {
    slotsCode: string;
    transformedTemplate: string;
  } {
    const slots = this.extractSlots(template);
    const slotsCode = this.generateSlotsCode(slots, componentName);
    const transformedTemplate = this.replaceSlots(template, componentName);

    return { slotsCode, transformedTemplate };
  }

  private extractSlots(template: string): SlotContent[] {
    const slots: SlotContent[] = [];
    const slotRegex =
      /<slot(?:\s+name=["'](\w+)["'])?(?:\s+[^>]*)?>([^<]*)<\/slot>/g;
    let match;

    while ((match = slotRegex.exec(template)) !== null) {
      const name = match[1] || 'default';
      const fallback = match[2]?.trim();

      slots.push({
        name,
        content: fallback || '',
        isDefault: !match[1],
      });
    }

    return slots;
  }

  private generateSlotsCode(
    slots: SlotContent[],
    componentName: string,
  ): string {
    if (slots.length === 0) return '';

    let code = '// Slots rendering\n';
    code += 'const slots = props.__slots || {};\n';

    for (const slot of slots) {
      code += `const slot_${slot.name} = slots.${slot.name} || \`${slot.content}\`;\n`;
    }

    return code;
  }

  private replaceSlots(template: string, componentName: string): string {
    return template.replace(
      /<slot(?:\s+name=["'](\w+)["'])?(?:\s+[^>]*)?>([^<]*)<\/slot>/g,
      (match, name) => {
        const slotName = name || 'default';
        return `<span data-slot="${slotName}">\${slot_${slotName}}</span>`;
      },
    );
  }

  wrapChildrenInSlot(children: string | null): string {
    if (!children) return '';

    return `__slots: { default: ${children} }`;
  }
}
