
import { PulseParser } from '../client/src/parser';

const parser = new PulseParser();

const code = `
<button onClick={() => toggle(benefit.id)}>
  Click Me
</button>
<div complex={() => { return true; }}></div>
`;

const root = parser.parse(code);

// console.log(JSON.stringify(root, null, 2));

function traverse(node: any) {
  if (node.attributes) {
    node.attributes.forEach((attr: any) => {
      console.log(`Tag: ${node.tag}, Attr: ${attr.name}, Value: ${attr.value}`);
    });
  }
  if (node.children) {
    node.children.forEach(traverse);
  }
}

traverse(root);
