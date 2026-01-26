// Pulse Runtime DOM Helpers
// v0.10.0 - Secure Runtime (No Direct Eval)

// Cache for compiled expressions to improve performance
const expressionCache = new Map<string, Function>();

const safeEvaluate = (code: string, keys: string[], values: any[]) => {
  try {
    const cacheKey = code + '||' + keys.join(',');
    let fn = expressionCache.get(cacheKey);
    if (!fn) {
      const body = code.trim().startsWith('return') ? code : `return (${code})`;
      fn = new Function(...keys, body);
      expressionCache.set(cacheKey, fn);
    }
    return fn(...values);
  } catch (e) {
    console.error(`Pulse Binding Error: "${code}"`, e);
    return undefined;
  }
};



// ===========================================
// Registry-based Event Delegation
// ===========================================
const handlerRegistry = new Map<string, Function>();
let eventDelegatorInitialized = false;

const initEventDelegator = () => {
  if (eventDelegatorInitialized || typeof window === 'undefined') return;
  eventDelegatorInitialized = true;

  const events = ['click', 'input', 'change', 'submit', 'keydown', 'keyup', 'mouseenter', 'mouseleave'];
  events.forEach(type => {
    document.addEventListener(type, (e) => {
      let target = e.target as HTMLElement;
      if (target && target.nodeType === Node.TEXT_NODE) {
        target = target.parentElement as HTMLElement;
      }
      if (!target || typeof target.closest !== 'function') return;

      const handlerAttr = `data-handler-${type}`;
      const closest = target.closest(`[${handlerAttr}]`);
      if (closest) {
        const id = closest.getAttribute(handlerAttr);
        if (id) {
          const handler = handlerRegistry.get(id);
          if (handler) {
            handler(e);
          }
        }
      }
    }, true);
  });
};

// Initialize on load
if (typeof window !== 'undefined') {
  initEventDelegator();
}

const registerHandler = (fn: Function) => {
  // Generate simple ID
  const id = Math.random().toString(36).slice(2, 10);
  handlerRegistry.set(id, fn);
  return id;
};

export const unregisterHandler = (id: string) => {
  handlerRegistry.delete(id);
};

const interpolate = (str: string, scope: any, item?: any, as?: string) => {
  if (!str.includes('{')) return str;
  let result = '';
  let lastIndex = 0;
  let depth = 0;
  let exprStart = -1;

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '{') {
      if (depth === 0) {
        result += str.slice(lastIndex, i);
        exprStart = i + 1;
      }
      depth++;
    } else if (str[i] === '}') {
      depth--;
      if (depth === 0 && exprStart !== -1) {
        const code = str.slice(exprStart, i);
        const keys = Object.keys(scope);
        const values = Object.values(scope);
        if (item !== undefined && as) {
          keys.push(as);
          values.push(item);
        }
        const val = safeEvaluate(code, keys, values);
        result += (val !== undefined ? val : '');
        lastIndex = i + 1;
        exprStart = -1;
      }
    }
  }
  result += str.slice(lastIndex);
  return result;
};


const processEventHandler = (el: Element, attrName: string, attrValue: string, scope: any, item?: any, as?: string) => {
  if (!attrValue.startsWith('{') || !attrValue.endsWith('}')) return;
  const code = attrValue.slice(1, -1);

  // Evaluate to get the function
  const keys = Object.keys(scope);
  const values = Object.values(scope);
  if (item !== undefined && as) {
    keys.push(as);
    values.push(item);
  }

  // We want the function itself
  const handler = safeEvaluate(code, keys, values);
  if (typeof handler === 'function') {
    const id = registerHandler(handler);
    const eventName = attrName.replace('data-on-', '');
    el.setAttribute(`data-handler-${eventName}`, id);
    el.removeAttribute(attrName);
  }
};

const applyBindings = (root: Element, bindings: any[], scope: any, item: any, as: string, createEffect?: Function) => {
  if (!bindings || !bindings.length) return;

  bindings.forEach(b => {
    const target = b.id ? root.querySelector(`[data-p-bind="${b.id}"]`) : root;
    let el = target;
    if (!el && root.getAttribute('data-p-bind') === b.id) el = root;
    if (!el) return;

    if (b.name && b.name.startsWith('data-on-')) {
      // Event binding
      const run = () => {
        const keys = Object.keys(scope);
        const values = Object.values(scope);
        if (item !== undefined && as) {
          keys.push(as);
          values.push(item);
        }
        return safeEvaluate(b.expr, keys, values);
      };

      let lastId: string | null = null;
      const update = () => {
        const handler = run();
        if (typeof handler === 'function') {
          if (lastId) unregisterHandler(lastId); // Cleanup old handler
          const id = registerHandler(handler);
          lastId = id;
          const eventName = b.name.replace('data-on-', '');
          el!.setAttribute(`data-handler-${eventName}`, id);
        }
      };

      if (createEffect) createEffect(update);
      else update();

      return;
    }

    const run = () => {
      const keys = Object.keys(scope);
      const values = Object.values(scope);
      if (item !== undefined && as) {
        keys.push(as);
        values.push(item);
      }
      return safeEvaluate(b.expr, keys, values);
    };

    const update = () => {
      const val = run();
      if (b.type === 'text') {
        el!.textContent = val !== undefined ? String(val) : '';
      } else if (b.type === 'attribute') {
        if (b.name === 'value' || b.name === 'checked') {
          if ((el as any)[b.name] !== val) (el as any)[b.name] = val;
        } else {
          if (val === false || val === null || val === undefined) el!.removeAttribute(b.name);
          else el!.setAttribute(b.name, val);
        }
      }
    };

    if (createEffect) {
      createEffect(update);
    } else {
      update();
    }
  });
};

export const getProp = (val: any, scope: any) => {
  if (!val) return undefined;
  if (typeof val === 'string' && val.startsWith('{') && val.endsWith('}')) {
    const code = val.slice(1, -1);
    return safeEvaluate(code, Object.keys(scope), Object.values(scope));
  }
  return val;
};

const getPath = (root: Node, target: Node): number[] => {
  const path: number[] = [];
  let node = target;
  while (node && node !== root) {
    let index = 0;
    let sibling = node.previousSibling;
    while (sibling) {
      index++;
      sibling = sibling.previousSibling;
    }
    path.unshift(index);
    node = node.parentNode!;
  }
  return path;
};

export function mountPrimitives(container: HTMLElement, scope: any, config: { List?: any, Show?: any, components?: any, createEffect?: Function, templates?: Map<string, string>, bindings?: any[] }) {
  const { List, Show, components, createEffect, templates, bindings } = config;

  if (List) {
    container.querySelectorAll('List, [data-pulse-list], pulse-list').forEach(el => {
      const eachAttr = el.getAttribute('each');
      const eachGetter = () => getProp(eachAttr, scope);
      const as = el.getAttribute('as') || 'item';

      const bindingsAttr = el.getAttribute('data-bindings');
      const listBindings = bindingsAttr ? JSON.parse(bindingsAttr) : null;

      const templateEl = el.querySelector('template[data-pulse-template]');
      const templateId = el.getAttribute('data-template-id');
      const rawTemplate = templateEl ? templateEl.innerHTML : (templateId && templates && templates.get(templateId)) || el.innerHTML;

      // Hydration: Check for existing nodes (SSR)
      let initialNodes: Node[] = [];
      if (el.tagName.toLowerCase() === 'pulse-list') {
        initialNodes = Array.from(el.childNodes).filter(n => n.nodeName !== 'TEMPLATE');

        if (initialNodes.length > 0 && listBindings) {
          const items = eachGetter();
          if (Array.isArray(items)) {
            initialNodes.forEach((node, i) => {
              if (node.nodeType === 1 && items[i]) {
                applyBindings(node as Element, listBindings, scope, items[i], as, createEffect);
              }
            });
          }
        }
      }

      const listComp = List({
        each: eachGetter,
        initialNodes: initialNodes,
        children: (item: any, index: number) => {
          const div = document.createElement('div');
          div.style.display = 'contents';

          // Use Hoisted Template if available
          let temp: HTMLElement;
          const hoistedTemplate = templateId && config.templates && config.templates.get(templateId);
          if (hoistedTemplate) {
            const t = document.createElement('template');
            t.innerHTML = hoistedTemplate;
            temp = t.content.cloneNode(true) as HTMLElement;
          } else {
            temp = document.createElement('div');
            temp.innerHTML = rawTemplate;
          }

          const rootNode = temp.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? temp : temp;

          if (listBindings) {
            // Path Walker Optimization
            const pathBindings = listBindings.filter((b: any) => b.path);
            const selectorBindings = listBindings.filter((b: any) => !b.path);

            if (pathBindings.length > 0) {
              const paths = pathBindings.map((b: any) => b.path);
              const targets = getTargets(rootNode as Node, paths);

              pathBindings.forEach((b: any, i: number) => {
                const target = targets[i];
                if (target) {
                  // Manual bind for target
                  const run = () => {
                    const keys = Object.keys(scope);
                    const values = Object.values(scope);
                    if (item !== undefined && as) {
                      keys.push(as);
                      values.push(item);
                    }
                    return safeEvaluate(b.expr, keys, values);
                  };

                  if (b.name && b.name.startsWith('data-on-')) {
                    // Cleanup logic here too
                    let lastId: string | null = null;
                    const update = () => {
                      const handler = run();
                      if (typeof handler === 'function') {
                        if (lastId) unregisterHandler(lastId);
                        const id = registerHandler(handler);
                        lastId = id;
                        const eventName = b.name.replace('data-on-', '');
                        const el = target as Element;
                        el.setAttribute(`data-handler-${eventName}`, id);
                      }
                    };
                    if (createEffect) createEffect(update);
                    else update();
                    return;
                  }

                  const update = () => {
                    const val = run();
                    if (b.type === 'text') {
                      target.textContent = val !== undefined ? String(val) : '';
                    } else if (b.type === 'attribute') {
                      const el = target as Element;
                      if (b.name === 'value' || b.name === 'checked') {
                        if ((el as any)[b.name] !== val) (el as any)[b.name] = val;
                      } else {
                        if (val === false || val === null || val === undefined) el.removeAttribute(b.name);
                        else el.setAttribute(b.name, val);
                      }
                    }
                  };

                  if (createEffect) createEffect(update);
                  else update();
                }
              });
            }

            if (selectorBindings.length > 0) {
              applyBindings(temp as Element, selectorBindings, scope, item, as, createEffect);
            }
          } else {
            // Fallback to TreeWalker
            const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
            let currentNode;
            while (currentNode = walker.nextNode()) {
              if (currentNode.nodeType === Node.TEXT_NODE) {
                if (currentNode.textContent) {
                  currentNode.textContent = interpolate(currentNode.textContent, scope, item, as);
                }
              } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
                const currentEl = currentNode as Element;
                Array.from(currentEl.attributes).forEach(attr => {
                  if (attr.name.startsWith('data-on-')) {
                    processEventHandler(currentEl, attr.name, attr.value, scope, item, as);
                    return;
                  }
                  if (['each', 'when', 'fallback', 'as', 'data-pulse-list', 'data-pulse-show', 'data-pulse-template', 'data-bindings', 'data-template-id'].includes(attr.name)) return;
                  if (attr.value.includes('{')) {
                    attr.value = interpolate(attr.value, scope, item, as);
                  }
                });
              }
            }
          }

          if (temp.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            div.appendChild(temp);
          } else {
            while (temp.firstChild) {
              div.appendChild(temp.firstChild);
            }
          }

          const childScope = { ...scope };
          if (as && item) childScope[as] = item;
          // Pass listBindings down for children components (like Show)
          mountPrimitives(div, childScope, { ...config, bindings: listBindings });
          return div.firstElementChild || div.firstChild || document.createTextNode('');
        }
      });

      el.replaceWith(listComp);
    });
  }

  if (components) {
    Object.keys(components).forEach(name => {
      const Comp = components[name];
      container.querySelectorAll(`[data-pulse-component="${name}"]`).forEach(el => {
        const props: any = {};
        Array.from(el.attributes).forEach(attr => {
          if (attr.name.startsWith('data-pulse')) return;
          props[attr.name] = getProp(attr.value, scope);
        });

        const templateEl = el.querySelector('template[data-pulse-template]');
        if (templateEl) {
          const children = Array.from((templateEl as HTMLTemplateElement).content.childNodes).map(n => n.cloneNode(true));
          props.children = children;
        }

        const mountedEl = Comp(props);
        if (mountedEl) el.replaceWith(mountedEl);
      });
    });
  }

  if (Show) {
    container.querySelectorAll('Show, [data-pulse-show]').forEach(el => {
      const whenAttr = el.getAttribute('when');
      let when = () => getProp(whenAttr, scope);

      // Attempt to find binding for 'when'
      if (bindings) {
        const path = getPath(container, el);

        // Find binding with matching path and name 'when'
        const binding = bindings.find(b =>
          b.name === 'when' &&
          b.path &&
          b.path.length === path.length &&
          b.path.every((val: number, i: number) => val === path[i])
        );

        if (binding) {
          when = () => {
            // Replay safeEvaluate with current scope/item
            // Note: scope here already has item/as if pushed by List
            return safeEvaluate(binding.expr, Object.keys(scope), Object.values(scope));
          }
        }
      }

      const fallbackAttr = el.getAttribute('fallback');

      const templateEl = el.querySelector('template[data-pulse-template]');
      const content = templateEl ? templateEl.innerHTML : el.innerHTML;

      const showComp = Show({
        when,
        children: () => {
          const div = document.createElement('div');
          div.style.display = 'contents';
          div.innerHTML = content;
          mountPrimitives(div, scope, config);
          return div.firstElementChild || div.firstChild || document.createTextNode('');
        },
        fallback: fallbackAttr ? () => {
          const div = document.createElement('div');
          div.style.display = 'contents';

          let fbContent = fallbackAttr;
          if (fallbackAttr.startsWith('{') && fallbackAttr.endsWith('}')) {
            const inner = fallbackAttr.slice(1, -1).trim();
            // If it looks like HTML, treat as HTML string
            if (inner.startsWith('<')) {
              fbContent = inner;
            } else {
              // Otherwise try to evaluate
              const val = getProp(fallbackAttr, scope);
              fbContent = val !== undefined ? String(val) : '';
            }
          }

          div.innerHTML = fbContent;
          mountPrimitives(div, scope, config);
          return div.firstElementChild || div.firstChild || document.createTextNode('');
        } : undefined
      });

      el.replaceWith(showComp);
    });
  }
}

export function hydrateDOM(root: HTMLElement, scope: any) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === 1) {
        const tag = (node as Element).tagName.toLowerCase();
        if (['script', 'style', 'pre', 'code', 'noscript'].includes(tag)) return NodeFilter.FILTER_REJECT;
        if (tag === 'pulse-list' || (node as Element).hasAttribute('data-pulse-list')) return NodeFilter.FILTER_REJECT;
        if (tag === 'pulse-show' || (node as Element).hasAttribute('data-pulse-show')) return NodeFilter.FILTER_REJECT;
        if ((node as Element).hasAttribute('data-pulse-component')) return NodeFilter.FILTER_REJECT;
        if (tag === 'template') return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        node.textContent = interpolate(node.textContent, scope);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('data-on-')) {
          processEventHandler(el, attr.name, attr.value, scope);
          return;
        }
        if (['each', 'when', 'fallback', 'as', 'data-pulse-list', 'data-pulse-show', 'data-pulse-template'].includes(attr.name)) return;

        if (attr.value.includes('{')) {
          attr.value = interpolate(attr.value, scope);
        }
      });
    }
  };

  let currentNode = walker.currentNode; // Root
  processNode(currentNode);
  while ((currentNode = walker.nextNode() as Node)) {
    processNode(currentNode);
  }
}

export function getTargets(root: Node, paths: number[][]): Node[] {
  const targets: Node[] = [];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    let node = root;
    for (let j = 0; j < path.length; j++) {
      const childIndex = path[j];
      node = node.firstChild!;
      for (let k = 0; k < childIndex; k++) {
        node = node.nextSibling!;
      }
    }
    targets.push(node);
  }
  return targets;
}
