
import { parse, walkSync, ELEMENT_NODE, TEXT_NODE } from 'ultrahtml';

const code = `<div>Hello {name}</div>`;
const ast = parse(code);

console.log('ELEMENT_NODE constant:', ELEMENT_NODE); // Usually 1
console.log('TEXT_NODE constant:', TEXT_NODE);       // Usually 3

walkSync(ast, (node) => {
  console.log(`Node Type: ${node.type}, Name: ${node.name}, Value: "${node.value}"`);
});
