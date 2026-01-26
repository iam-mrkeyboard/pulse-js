
import * as acorn from 'acorn';
import { walk } from 'estree-walker';

// Mock state variables
const stateNames = new Set(['name', 'count', 'user']);

function processExpression(expression: string): string {
  try {
    const ast = acorn.parseExpressionAt(expression, 0, { ecmaVersion: 2020 });
    let magicString = expression;
    let offset = 0; // Track insertions

    const replacements: { start: number, end: number, value: string }[] = [];

    walk(ast, {
      enter(node, parent, prop, index) {
        if (node.type === 'Identifier') {
          // check if it is a state variable
          if (stateNames.has(node.name)) {
            // Check if it's a property of another object (e.g. obj.name) - we don't transform that
            // In MemberExpression, property is the Identifier.
            // if parent.type === 'MemberExpression'
            //   if parent.property === node && !parent.computed -> It's the property part (obj.prop), don't touch
            //   if parent.object === node -> It's the object part (prop.sub), MATCH (if prop is state)

            let isSafeToReplace = true;

            if (parent && parent.type === 'MemberExpression') {
              if (parent.property === node && !parent.computed) {
                isSafeToReplace = false;
              }
            }

            // Also check for object keys in ObjectExpression
            if (parent && parent.type === 'Property') {
              if (parent.shorthand) {
                // Only handle the key to avoid double replacement (key and value share same range in source)
                if (parent.key === node) {
                  replacements.push({
                    start: node.start,
                    end: node.end,
                    value: `${node.name}: state.${node.name}`
                  });
                }
                // Skip default processing for shorthand identifiers
                return;
              }

              // Standard Property (not shorthand) - if key, don't touch
              if (parent.key === node && !parent.computed) {
                isSafeToReplace = false;
              }
            }

            if (isSafeToReplace) {
              replacements.push({
                start: node.start,
                end: node.end,
                value: `state.${node.name}`
              });
            }
          }
        }
      }
    });

    // Apply replacements in reverse order to preserve indices
    replacements.sort((a, b) => b.start - a.start);

    for (const rep of replacements) {
      magicString = magicString.slice(0, rep.start) + rep.value + magicString.slice(rep.end);
    }

    return magicString;
  } catch (e) {
    console.error('Parse error:', e);
    return expression;
  }
}

// Test cases
console.log('1. name ->', processExpression('name'));
console.log('2. count + 1 ->', processExpression('count + 1'));
console.log('3. user.name ->', processExpression('user.name'));
console.log('4. obj.name (should not change) ->', processExpression('obj.name'));
console.log('5. name() ->', processExpression('name()'));
console.log('6. { name } (shorthand) ->', processExpression('{ name }')); // Edge case
