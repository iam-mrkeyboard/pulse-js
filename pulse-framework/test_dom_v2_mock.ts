
// Mock DOM
class MockNode {
  childNodes: MockNode[] = [];
  nodeType: number = 1;
  nodeValue: string = '';
  parentNode: MockNode | null = null;
  textContent: string = '';

  constructor(public type: string) { }

  cloneNode(deep: boolean): MockNode {
    const clone = new MockNode(this.type);
    clone.nodeType = this.nodeType;
    if (deep) {
      clone.childNodes = this.childNodes.map(c => c.cloneNode(true));
    }
    return clone;
  }

  insertBefore(newNode: MockNode, refNode: MockNode | null) {
    if (refNode) {
      const index = this.childNodes.indexOf(refNode);
      if (index > -1) this.childNodes.splice(index, 0, newNode);
    } else {
      this.childNodes.push(newNode);
    }
    newNode.parentNode = this;
  }

  replaceChild(newNode: MockNode, oldNode: MockNode) {
    const index = this.childNodes.indexOf(oldNode);
    if (index > -1) {
      this.childNodes[index] = newNode;
      newNode.parentNode = this;
    }
  }

  removeChild(node: MockNode) {
    const index = this.childNodes.indexOf(node);
    if (index > -1) this.childNodes.splice(index, 1);
  }

  addEventListener() { }
  setAttribute() { }
  removeAttribute() { }
}

class MockElement extends MockNode {
  constructor() { super('element'); }
}

class MockText extends MockNode {
  constructor(text: string) {
    super('text');
    this.nodeType = 3;
    this.nodeValue = text;
  }
}

class MockTemplate extends MockNode {
  content: MockNode;
  constructor() {
    super('template');
    this.content = new MockNode('fragment');
  }
  set innerHTML(html: string) {
    // Simple mock: HTML "<div>" creates a child
    if (html.includes('div')) {
      this.content.childNodes.push(new MockElement());
    }
  }
}

// Inject Globals
globalThis.Node = MockNode as any;
globalThis.Element = MockElement as any;
globalThis.document = {
  createElement: (tag: string) => {
    if (tag === 'template') return new MockTemplate();
    return new MockElement();
  },
  createTextNode: (text: string) => new MockText(text)
} as any;

// Run Test
import { createSignal } from './src/runtime/reactivity-v2';
import { insert, template, walk } from './src/runtime/dom-v2';

console.log('--- Testing DOM V2 (Mock) ---');

// Test 1: Template
const tmpl = template('<div></div>');
const clone = tmpl();
console.log('Template cloned:', clone.type === 'fragment' ? '✅' : '❌');

// Test 2: Walk (Mock structure)
// Root -> Div
const div = new MockElement();
(clone as any).childNodes.push(div);
// Note: template() creates empty if our mock innerHTML parsing is weak. 
// Let's manually setup clone for walk test
const root = new MockNode('root');
const child1 = new MockNode('child1');
const child2 = new MockNode('child2');
root.childNodes = [child1, child2];

const walked = walk(root, [1]);
console.log('Walk found child2:', walked === child2 ? '✅' : '❌');

// Test 3: Insert (Reactivity)
const [count, setCount] = createSignal(0);
const container = new MockElement();

console.log('Insertion Test Start');
insert(container, count);

// Initial State (Microtask/Sync?)
// Our effect runs immediately.
if (container.childNodes.length === 1 && container.childNodes[0].nodeValue === '0') {
  console.log('✅ Initial insert correct');
} else {
  console.error('❌ Initial insert failed', container.childNodes);
}

// Update
setCount(1);
if (container.childNodes.length === 1 && container.childNodes[0].nodeValue === '1') {
  console.log('✅ Update insert correct');
} else {
  console.error('❌ Update insert failed', container.childNodes);
}
