
export interface DocumentationItem {
  name: string;
  description: string;
  example: string;
  kind: 'component' | 'attribute' | 'event';
}

export class PulseDocumentationEngine {
  private primitives: Record<string, DocumentationItem> = {
    'List': {
      name: 'List',
      kind: 'component',
      description: 'Renders a list of items efficiently using a keyed loop.',
      example: `<List each={items} as="item" key="id">\n  <div>{item.name}</div>\n</List>`
    },
    'Show': {
      name: 'Show',
      kind: 'component',
      description: 'Conditionally renders content based on a "when" expression.',
      example: `<Show when={state.loggedIn} fallback={<div>Log in</div>}>\n  <UserProfile />\n</Show>`
    },
    'Portal': {
      name: 'Portal',
      kind: 'component',
      description: 'Renders content into a different part of the DOM (e.g., document.body).',
      example: `<Portal mount={document.body}>\n  <Modal />\n</Portal>`
    }
  };

  public getDocumentation(word: string): DocumentationItem | null {
    return this.primitives[word] || null;
  }
}
