import { PulseParser } from './parser';
import { Hover, MarkupKind, Position } from 'vscode-languageserver/node';

export class PulseHoverProvider {
  private parser: PulseParser;

  constructor(parser: PulseParser) {
    this.parser = parser;
  }

  public getHover(
    text: string,
    offset: number,
    tree: any,
    position: Position,
  ): Hover | null {
    if (!tree) return null;

    const wordRange = this.getWordRangeAtPosition(text, offset);
    if (!wordRange) return null;

    const word = text.substring(wordRange.start, wordRange.end);
    const beforeCursor = text.substring(Math.max(0, offset - 500), offset);
    const afterCursor = text.substring(
      offset,
      Math.min(text.length, offset + 100),
    );

    // Determine context
    const inScriptBlock = this.isInScriptBlock(text, offset);
    const inStyleBlock = this.isInStyleBlock(text, offset);
    const inStyleAttr = /style\s*=\s*\{\{[^}]*$/.test(beforeCursor);
    const inJSXExpression = /\{[^}]*$/.test(beforeCursor) && !inStyleAttr;

    // Try different hover types based on context
    return (
      this.getPulseAPIHover(word) ||
      this.getJavaScriptBuiltInHover(word, inScriptBlock || inJSXExpression) ||
      this.getVariableHover(word, text, inScriptBlock) ||
      this.getCSSPropertyHover(word, inStyleBlock || inStyleAttr) ||
      this.getCSSSelectorHover(word, beforeCursor, inStyleBlock) ||
      this.getCSSValueHover(word, beforeCursor, inStyleBlock || inStyleAttr) ||
      this.getComponentHover(word, tree) ||
      this.getHTMLElementHover(word) ||
      this.getAttributeHover(word) ||
      this.getEventHandlerHover(word) ||
      null
    );
  }

  private isInScriptBlock(text: string, offset: number): boolean {
    const before = text.substring(0, offset);
    const lastScriptOpen = before.lastIndexOf('<script>');
    const lastScriptClose = before.lastIndexOf('</script>');
    return lastScriptOpen > lastScriptClose;
  }

  private isInStyleBlock(text: string, offset: number): boolean {
    const before = text.substring(0, offset);
    const lastStyleOpen = before.lastIndexOf('<style>');
    const lastStyleClose = before.lastIndexOf('</style>');
    return lastStyleOpen > lastStyleClose;
  }

  private getWordRangeAtPosition(
    text: string,
    offset: number,
  ): { start: number; end: number } | null {
    let start = offset;
    let end = offset;

    while (start > 0 && /[a-zA-Z0-9_$-]/.test(text[start - 1])) {
      start--;
    }

    while (end < text.length && /[a-zA-Z0-9_$-]/.test(text[end])) {
      end++;
    }

    if (start === end) return null;
    return { start, end };
  }

  private getPulseAPIHover(word: string): Hover | null {
    const pulseAPIs: Record<string, string> = {
      createSignal: `### ⚡ createSignal(initialValue)
Creates a reactive signal - the core primitive for state management.

**Signature:**
\`\`\`typescript
function createSignal<T>(value: T): [get: () => T, set: (v: T) => void]
\`\`\`

**Returns:** \`[getter, setter]\` tuple

**Usage:**
\`\`\`javascript
const [count, setCount] = createSignal(0);

// Read: count or count()
console.log(count);

// Write: 
setCount(5);
setCount(prev => prev + 1);
\`\`\`

**Key Features:**
- Fine-grained reactivity
- Automatic dependency tracking
- No re-renders, only updates dependent computations`,

      createMemo: `### 🧠 createMemo(fn)
Creates a memoized derived value that only recomputes when dependencies change.

**Signature:**
\`\`\`typescript
function createMemo<T>(fn: () => T): () => T
\`\`\`

**Usage:**
\`\`\`javascript
const doubled = createMemo(() => count * 2);
const fullName = createMemo(() => \`\${firstName} \${lastName}\`);

// Access value
console.log(doubled);
\`\`\`

**Performance:** Caches result until dependencies change

**When to use:** Expensive computations, derived state`,

      createEffect: `### 🎯 createEffect(fn)
Runs side effects when reactive dependencies change.

**Signature:**
\`\`\`typescript
function createEffect(fn: () => void): void
\`\`\`

**Usage:**
\`\`\`javascript
createEffect(() => {
  console.log('Count is now:', count);
  document.title = \`Count: \${count}\`;
});
\`\`\`

**Common use cases:**
- Logging and debugging
- DOM manipulation
- localStorage sync
- API calls
- Analytics tracking

**Note:** Runs immediately and on every dependency change`,

      createResource: `### 📡 createResource(fetcher, options?)
Manages async data fetching with loading and error states.

**Signature:**
\`\`\`typescript
function createResource<T>(
  fetcher: () => Promise<T>
): [data: T | undefined, { loading: boolean, error: any, refetch: () => void }]
\`\`\`

**Usage:**
\`\`\`javascript
const [user, { loading, error, refetch }] = createResource(async () => {
  const res = await fetch('/api/user');
  return res.json();
});

// In template
<Show when={!loading}>
  <div>{user.name}</div>
</Show>
\`\`\``,

      onMount: `### 🚀 onMount(fn)
Runs callback once when component mounts.

**Usage:**
\`\`\`javascript
onMount(() => {
  console.log('Component mounted!');
  fetchData();
});
\`\`\`

**Timing:** Runs after initial render, before browser paint`,

      onCleanup: `### 🧹 onCleanup(fn)
Registers cleanup function for component unmount or effect re-run.

**Usage:**
\`\`\`javascript
createEffect(() => {
  const timer = setInterval(() => tick(), 1000);
  
  onCleanup(() => {
    clearInterval(timer);
  });
});
\`\`\`

**Auto cleanup for:**
- Timers/intervals
- Event listeners
- Subscriptions
- WebSocket connections`,

      batch: `### 📦 batch(fn)
Batches multiple reactive updates into a single render cycle.

**Usage:**
\`\`\`javascript
batch(() => {
  setFirstName('John');
  setLastName('Doe');
  setAge(30);
}); // Only triggers one update
\`\`\`

**Performance:** Prevents multiple re-renders`,

      untrack: `### 🔇 untrack(fn)
Reads reactive value without creating a dependency.

**Usage:**
\`\`\`javascript
createEffect(() => {
  console.log(count); // Creates dependency
  console.log(untrack(() => otherCount)); // No dependency
});
\`\`\``,
    };

    if (pulseAPIs[word]) {
      return {
        contents: { kind: MarkupKind.Markdown, value: pulseAPIs[word] },
      };
    }
    return null;
  }

  private getJavaScriptBuiltInHover(
    word: string,
    inJSContext: boolean,
  ): Hover | null {
    if (!inJSContext) return null;

    const jsBuiltIns: Record<string, string> = {
      // Array methods
      map: `### 📋 Array.prototype.map()
Creates a new array with results of calling a function on every element.

**Syntax:** \`array.map(callback)\`

**Example:**
\`\`\`javascript
const numbers = [1, 2, 3];
const doubled = numbers.map(n => n * 2);
// [2, 4, 6]
\`\`\``,

      filter: `### 🔍 Array.prototype.filter()
Creates a new array with elements that pass the test.

**Syntax:** \`array.filter(callback)\`

**Example:**
\`\`\`javascript
const numbers = [1, 2, 3, 4, 5];
const even = numbers.filter(n => n % 2 === 0);
// [2, 4]
\`\`\``,

      reduce: `### 🔄 Array.prototype.reduce()
Reduces array to a single value by applying a function.

**Syntax:** \`array.reduce(callback, initialValue)\`

**Example:**
\`\`\`javascript
const numbers = [1, 2, 3, 4];
const sum = numbers.reduce((acc, n) => acc + n, 0);
// 10
\`\`\``,

      forEach: `### 🔁 Array.prototype.forEach()
Executes a function for each array element.

**Syntax:** \`array.forEach(callback)\`

**Example:**
\`\`\`javascript
[1, 2, 3].forEach(n => console.log(n));
\`\`\`

**Note:** Cannot break/return early. Use \`for...of\` if needed.`,

      find: `### 🎯 Array.prototype.find()
Returns first element that satisfies the test.

**Syntax:** \`array.find(callback)\`

**Example:**
\`\`\`javascript
const users = [{id: 1}, {id: 2}];
const user = users.find(u => u.id === 2);
\`\`\``,

      some: `### ❓ Array.prototype.some()
Tests if at least one element passes the test.

**Syntax:** \`array.some(callback)\`

**Example:**
\`\`\`javascript
const numbers = [1, 2, 3];
const hasEven = numbers.some(n => n % 2 === 0); // true
\`\`\``,

      every: `### ✅ Array.prototype.every()
Tests if all elements pass the test.

**Syntax:** \`array.every(callback)\`

**Example:**
\`\`\`javascript
const numbers = [2, 4, 6];
const allEven = numbers.every(n => n % 2 === 0); // true
\`\`\``,

      slice: `### ✂️ Array.prototype.slice()
Returns a shallow copy of a portion of an array.

**Syntax:** \`array.slice(start, end)\`

**Example:**
\`\`\`javascript
const arr = [1, 2, 3, 4, 5];
arr.slice(1, 3); // [2, 3]
\`\`\``,

      splice: `### ✂️ Array.prototype.splice()
Changes array by removing/replacing/adding elements.

**Syntax:** \`array.splice(start, deleteCount, ...items)\`

**Example:**
\`\`\`javascript
const arr = [1, 2, 3, 4];
arr.splice(1, 2, 'a', 'b'); // [1, 'a', 'b', 4]
\`\`\`

**⚠️ Mutates original array**`,

      push: `### ➕ Array.prototype.push()
Adds elements to end of array.

**Syntax:** \`array.push(...items)\`

**Example:**
\`\`\`javascript
const arr = [1, 2];
arr.push(3, 4); // [1, 2, 3, 4]
\`\`\`

**⚠️ Mutates original array**`,

      pop: `### ➖ Array.prototype.pop()
Removes and returns last element.

**Example:**
\`\`\`javascript
const arr = [1, 2, 3];
const last = arr.pop(); // 3
// arr is now [1, 2]
\`\`\`

**⚠️ Mutates original array**`,

      shift: `### ⬅️ Array.prototype.shift()
Removes and returns first element.

**Example:**
\`\`\`javascript
const arr = [1, 2, 3];
const first = arr.shift(); // 1
// arr is now [2, 3]
\`\`\`

**⚠️ Mutates original array**`,

      unshift: `### ➡️ Array.prototype.unshift()
Adds elements to beginning of array.

**Example:**
\`\`\`javascript
const arr = [2, 3];
arr.unshift(0, 1); // [0, 1, 2, 3]
\`\`\`

**⚠️ Mutates original array**`,

      join: `### 🔗 Array.prototype.join()
Joins all elements into a string.

**Syntax:** \`array.join(separator)\`

**Example:**
\`\`\`javascript
['a', 'b', 'c'].join('-'); // "a-b-c"
\`\`\``,

      concat: `### ➕ Array.prototype.concat()
Merges arrays into a new array.

**Example:**
\`\`\`javascript
const a = [1, 2];
const b = [3, 4];
const merged = a.concat(b); // [1, 2, 3, 4]
\`\`\``,

      includes: `### ✅ Array.prototype.includes()
Checks if array contains a value.

**Syntax:** \`array.includes(value)\`

**Example:**
\`\`\`javascript
[1, 2, 3].includes(2); // true
\`\`\``,

      indexOf: `### 🔍 Array.prototype.indexOf()
Returns first index of element, or -1 if not found.

**Syntax:** \`array.indexOf(value)\`

**Example:**
\`\`\`javascript
[1, 2, 3].indexOf(2); // 1
\`\`\``,

      sort: `### 🔢 Array.prototype.sort()
Sorts array elements in place.

**Syntax:** \`array.sort(compareFunction?)\`

**Example:**
\`\`\`javascript
[3, 1, 2].sort(); // [1, 2, 3]
[3, 1, 2].sort((a, b) => b - a); // [3, 2, 1]
\`\`\`

**⚠️ Mutates original array**`,

      reverse: `### 🔄 Array.prototype.reverse()
Reverses array in place.

**Example:**
\`\`\`javascript
[1, 2, 3].reverse(); // [3, 2, 1]
\`\`\`

**⚠️ Mutates original array**`,

      flat: `### 📦 Array.prototype.flat()
Flattens nested arrays.

**Syntax:** \`array.flat(depth)\`

**Example:**
\`\`\`javascript
[1, [2, [3]]].flat(2); // [1, 2, 3]
\`\`\``,

      flatMap: `### 📋 Array.prototype.flatMap()
Maps then flattens result by one level.

**Example:**
\`\`\`javascript
[1, 2].flatMap(x => [x, x * 2]); // [1, 2, 2, 4]
\`\`\``,

      // String methods
      split: `### ✂️ String.prototype.split()
Splits string into array.

**Syntax:** \`string.split(separator)\`

**Example:**
\`\`\`javascript
"a-b-c".split("-"); // ["a", "b", "c"]
\`\`\``,

      trim: `### ✨ String.prototype.trim()
Removes whitespace from both ends.

**Example:**
\`\`\`javascript
"  hello  ".trim(); // "hello"
\`\`\``,

      toLowerCase: `### 🔡 String.prototype.toLowerCase()
Converts string to lowercase.

**Example:**
\`\`\`javascript
"HELLO".toLowerCase(); // "hello"
\`\`\``,

      toUpperCase: `### 🔠 String.prototype.toUpperCase()
Converts string to uppercase.

**Example:**
\`\`\`javascript
"hello".toUpperCase(); // "HELLO"
\`\`\``,

      replace: `### 🔄 String.prototype.replace()
Replaces first match with new value.

**Syntax:** \`string.replace(pattern, replacement)\`

**Example:**
\`\`\`javascript
"hello world".replace("world", "there");
// "hello there"
\`\`\``,

      substring: `### ✂️ String.prototype.substring()
Extracts characters between two indices.

**Syntax:** \`string.substring(start, end)\`

**Example:**
\`\`\`javascript
"hello".substring(1, 4); // "ell"
\`\`\``,

      startsWith: `### 🎯 String.prototype.startsWith()
Checks if string starts with another string.

**Example:**
\`\`\`javascript
"hello".startsWith("hel"); // true
\`\`\``,

      endsWith: `### 🎯 String.prototype.endsWith()
Checks if string ends with another string.

**Example:**
\`\`\`javascript
"hello".endsWith("lo"); // true
\`\`\``,

      padStart: `### ⬅️ String.prototype.padStart()
Pads string from the start.

**Syntax:** \`string.padStart(length, padString)\`

**Example:**
\`\`\`javascript
"5".padStart(3, "0"); // "005"
\`\`\``,

      padEnd: `### ➡️ String.prototype.padEnd()
Pads string from the end.

**Syntax:** \`string.padEnd(length, padString)\`

**Example:**
\`\`\`javascript
"5".padEnd(3, "0"); // "500"
\`\`\``,

      repeat: `### 🔁 String.prototype.repeat()
Repeats string n times.

**Example:**
\`\`\`javascript
"ha".repeat(3); // "hahaha"
\`\`\``,

      // Object methods
      keys: `### 🔑 Object.keys()
Returns array of object's keys.

**Example:**
\`\`\`javascript
Object.keys({a: 1, b: 2}); // ["a", "b"]
\`\`\``,

      values: `### 💎 Object.values()
Returns array of object's values.

**Example:**
\`\`\`javascript
Object.values({a: 1, b: 2}); // [1, 2]
\`\`\``,

      entries: `### 📊 Object.entries()
Returns array of [key, value] pairs.

**Example:**
\`\`\`javascript
Object.entries({a: 1, b: 2}); 
// [["a", 1], ["b", 2]]
\`\`\``,

      assign: `### 🔀 Object.assign()
Copies properties from source to target.

**Syntax:** \`Object.assign(target, ...sources)\`

**Example:**
\`\`\`javascript
Object.assign({a: 1}, {b: 2}); // {a: 1, b: 2}
\`\`\``,

      // Common functions
      setTimeout: `### ⏰ setTimeout()
Executes function after delay.

**Syntax:** \`setTimeout(callback, delay)\`

**Example:**
\`\`\`javascript
setTimeout(() => {
  console.log('Delayed!');
}, 1000); // After 1 second
\`\`\`

**Returns:** Timer ID (use with clearTimeout)`,

      setInterval: `### 🔄 setInterval()
Executes function repeatedly at intervals.

**Syntax:** \`setInterval(callback, interval)\`

**Example:**
\`\`\`javascript
const timer = setInterval(() => {
  console.log('Tick');
}, 1000); // Every second

// Stop with clearInterval(timer)
\`\`\``,

      fetch: `### 🌐 fetch()
Makes HTTP requests (returns Promise).

**Syntax:** \`fetch(url, options?)\`

**Example:**
\`\`\`javascript
const response = await fetch('/api/data');
const data = await response.json();
\`\`\`

**Methods:** GET (default), POST, PUT, DELETE, etc.`,

      Promise: `### 🤝 Promise
Represents eventual completion or failure of async operation.

**Methods:**
- \`Promise.resolve(value)\`
- \`Promise.reject(error)\`
- \`Promise.all([...])\`
- \`Promise.race([...])\`

**Example:**
\`\`\`javascript
new Promise((resolve, reject) => {
  if (success) resolve(data);
  else reject(error);
});
\`\`\``,

      async: `### ⚡ async/await
Syntactic sugar for Promises.

**Example:**
\`\`\`javascript
async function getData() {
  const res = await fetch('/api');
  const data = await res.json();
  return data;
}
\`\`\``,

      console: `### 🖥️ console
Provides access to browser's debugging console.

**Common methods:**
- \`console.log(...)\` - Log messages
- \`console.error(...)\` - Log errors
- \`console.warn(...)\` - Log warnings
- \`console.table(...)\` - Display as table
- \`console.time(label)\` - Start timer
- \`console.timeEnd(label)\` - End timer`,

      JSON: `### 📋 JSON
Parse and stringify JSON data.

**Methods:**
\`\`\`javascript
JSON.parse(string);    // String → Object
JSON.stringify(object); // Object → String
\`\`\`

**Example:**
\`\`\`javascript
const obj = JSON.parse('{"a": 1}');
const str = JSON.stringify({a: 1});
\`\`\``,

      Math: `### 🔢 Math
Mathematical functions and constants.

**Common:**
- \`Math.round(x)\` - Round to nearest integer
- \`Math.floor(x)\` - Round down
- \`Math.ceil(x)\` - Round up
- \`Math.random()\` - Random 0-1
- \`Math.max(...)\` - Maximum value
- \`Math.min(...)\` - Minimum value
- \`Math.abs(x)\` - Absolute value`,

      parseInt: `### 🔢 parseInt()
Parses string to integer.

**Syntax:** \`parseInt(string, radix)\`

**Example:**
\`\`\`javascript
parseInt("10"); // 10
parseInt("10", 2); // 2 (binary)
parseInt("FF", 16); // 255 (hex)
\`\`\``,

      parseFloat: `### 🔢 parseFloat()
Parses string to floating-point number.

**Example:**
\`\`\`javascript
parseFloat("3.14"); // 3.14
parseFloat("3.14abc"); // 3.14
\`\`\``,

      isNaN: `### ❓ isNaN()
Checks if value is NaN (Not a Number).

**Example:**
\`\`\`javascript
isNaN(123); // false
isNaN("hello"); // true
\`\`\``,

      Array: `### 📋 Array
Creates arrays.

**Static methods:**
- \`Array.isArray(value)\` - Check if array
- \`Array.from(iterable)\` - Create from iterable
- \`Array.of(...items)\` - Create from items

**Example:**
\`\`\`javascript
Array.from("hello"); // ['h','e','l','l','o']
Array.of(1, 2, 3); // [1, 2, 3]
\`\`\``,

      Set: `### 🎯 Set
Collection of unique values.

**Example:**
\`\`\`javascript
const set = new Set([1, 2, 2, 3]);
// Set(3) {1, 2, 3}

set.add(4);
set.has(2); // true
set.delete(1);
set.size; // 3
\`\`\``,

      Map: `### 🗺️ Map
Collection of key-value pairs.

**Example:**
\`\`\`javascript
const map = new Map();
map.set('key', 'value');
map.get('key'); // 'value'
map.has('key'); // true
map.delete('key');
map.size; // 0
\`\`\``,

      Date: `### 📅 Date
Work with dates and times.

**Example:**
\`\`\`javascript
const now = new Date();
now.getFullYear(); // 2026
now.getMonth(); // 0-11
now.getDate(); // 1-31
now.getTime(); // Timestamp
\`\`\``,
    };

    if (jsBuiltIns[word]) {
      return {
        contents: { kind: MarkupKind.Markdown, value: jsBuiltIns[word] },
      };
    }

    return null;
  }

  private getVariableHover(
    word: string,
    text: string,
    inScriptBlock: boolean,
  ): Hover | null {
    if (
      !inScriptBlock &&
      !/\{[^}]*$/.test(text.substring(0, text.indexOf(word)))
    ) {
      return null;
    }

    // Extract script content
    const scriptMatch = text.match(/<script>([\s\S]*?)<\/script>/);
    if (!scriptMatch) return null;

    const scriptContent = scriptMatch[1];

    // Check for signal declaration
    const signalPattern = new RegExp(
      `const\\s*\\[\\s*(${word})\\s*,\\s*set([A-Z][a-zA-Z0-9]*)\\s*\\]\\s*=\\s*createSignal\\(([^)]*)\\)`,
    );
    const signalMatch = scriptContent.match(signalPattern);

    if (signalMatch) {
      const [, varName, setterName, initialValue] = signalMatch;
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `### 📊 Signal: \`${varName}\`

**Type:** Reactive Signal  
**Initial Value:** \`${initialValue.trim() || 'undefined'}\`  
**Setter:** \`set${setterName}\`

**Usage:**
\`\`\`javascript
// Read
console.log(${varName});

// Update
set${setterName}(newValue);
set${setterName}(prev => prev + 1);
\`\`\`

⚡ Automatically tracked in templates and effects`,
        },
      };
    }

    // Check for memo
    const memoPattern = new RegExp(`const\\s+${word}\\s*=\\s*createMemo\\(`);
    if (memoPattern.test(scriptContent)) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `### 🧠 Memo: \`${word}\`

**Type:** Computed Value (Memoized)

Automatically recomputes when dependencies change.

**Access:** \`${word}\` or \`${word}()\``,
        },
      };
    }

    // Check for const/let/var
    const constPattern = new RegExp(
      `(?:const|let|var)\\s+${word}\\s*=\\s*([^;]+)`,
    );
    const constMatch = scriptContent.match(constPattern);

    if (constMatch) {
      const [, value] = constMatch;
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `### 📦 Variable: \`${word}\`

**Declaration:** \`${constMatch[0].trim()}\`

**Value:** \`${value.trim()}\``,
        },
      };
    }

    // Check for function
    const funcPattern = new RegExp(`function\\s+${word}\\s*\\(`);
    if (funcPattern.test(scriptContent)) {
      const funcMatch = scriptContent.match(
        new RegExp(`function\\s+${word}\\s*\\(([^)]*)\\)`),
      );
      const params = funcMatch ? funcMatch[1] : '';

      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `### 🎯 Function: \`${word}\`

**Parameters:** \`${params || 'none'}\`

**Usage:** \`${word}(${params})\``,
        },
      };
    }

    // Check for arrow function
    const arrowPattern = new RegExp(
      `const\\s+${word}\\s*=\\s*\\(([^)]*)\\)\\s*=>`,
    );
    const arrowMatch = scriptContent.match(arrowPattern);

    if (arrowMatch) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `### 🎯 Function: \`${word}\`

**Type:** Arrow Function  
**Parameters:** \`${arrowMatch[1] || 'none'}\`

**Usage:** \`${word}()\``,
        },
      };
    }

    return null;
  }

  private getCSSPropertyHover(
    word: string,
    inCSSContext: boolean,
  ): Hover | null {
    if (!inCSSContext) return null;

    const cssProperties: Record<string, string> = {
      // Display & Layout
      display: `**display** - How element is displayed

**Values:**
- \`block\` - Takes full width, starts new line
- \`inline\` - Flows with text, no width/height
- \`inline-block\` - Inline but accepts width/height
- \`flex\` - Flexbox container
- \`inline-flex\` - Inline flexbox
- \`grid\` - Grid container
- \`inline-grid\` - Inline grid
- \`none\` - Hidden (removed from layout)
- \`contents\` - Only children are rendered

**Example:**
\`\`\`css
display: flex;
display: grid;
display: none;
\`\`\``,

      position: `**position** - Positioning method

**Values:**
- \`static\` - Normal flow (default)
- \`relative\` - Positioned relative to normal position
- \`absolute\` - Positioned relative to nearest positioned ancestor
- \`fixed\` - Positioned relative to viewport (scrolls with page)
- \`sticky\` - Toggles between relative and fixed

**Example:**
\`\`\`css
position: absolute;
top: 10px;
left: 20px;
\`\`\``,

      top: `**top** - Vertical position offset (for positioned elements)

**Values:** Length, percentage, \`auto\`

**Example:**
\`\`\`css
position: absolute;
top: 0;
top: 10px;
top: 50%;
\`\`\``,

      right: `**right** - Horizontal position offset from right

**Values:** Length, percentage, \`auto\``,

      bottom: `**bottom** - Vertical position offset from bottom

**Values:** Length, percentage, \`auto\``,

      left: `**left** - Horizontal position offset from left

**Values:** Length, percentage, \`auto\``,

      zIndex: `**z-index** - Stack order (higher = front)

**Values:** Integer, \`auto\`

**Example:**
\`\`\`css
z-index: 1;
z-index: 10;
z-index: 9999;
\`\`\`

**Note:** Only works on positioned elements`,

      // Flexbox
      flex: `**flex** - Shorthand for flex-grow, flex-shrink, flex-basis

**Values:**
- \`1\` - Grows to fill space
- \`0\` - Doesn't grow
- \`auto\` - Based on content
- \`none\` - Inflexible

**Example:**
\`\`\`css
flex: 1;
flex: 0 0 auto;
flex: 1 1 200px;
\`\`\``,

      flexDirection: `**flex-direction** - Main axis direction

**Values:**
- \`row\` - Horizontal left-to-right (default)
- \`row-reverse\` - Horizontal right-to-left
- \`column\` - Vertical top-to-bottom
- \`column-reverse\` - Vertical bottom-to-top

**Example:**
\`\`\`css
flex-direction: column;
\`\`\``,

      flexWrap: `**flex-wrap** - Whether items wrap to new lines

**Values:**
- \`nowrap\` - Single line (default)
- \`wrap\` - Multi-line
- \`wrap-reverse\` - Multi-line, reverse

**Example:**
\`\`\`css
flex-wrap: wrap;
\`\`\``,

      justifyContent: `**justify-content** - Align items along main axis

**Values:**
- \`flex-start\` - Start of container (default)
- \`flex-end\` - End of container
- \`center\` - Center
- \`space-between\` - Space between items
- \`space-around\` - Space around items
- \`space-evenly\` - Equal space

**Example:**
\`\`\`css
justify-content: center;
justify-content: space-between;
\`\`\``,

      alignItems: `**align-items** - Align items along cross axis

**Values:**
- \`stretch\` - Stretch to fill (default)
- \`flex-start\` - Start of cross axis
- \`flex-end\` - End of cross axis
- \`center\` - Center
- \`baseline\` - Align baselines

**Example:**
\`\`\`css
align-items: center;
\`\`\``,

      alignContent: `**align-content** - Align lines (multi-line flex/grid)

**Values:** Same as justify-content

**Example:**
\`\`\`css
align-content: space-between;
\`\`\``,

      alignSelf: `**align-self** - Override align-items for specific item

**Values:** Same as align-items

**Example:**
\`\`\`css
align-self: flex-end;
\`\`\``,

      gap: `**gap** - Space between flex/grid items

**Values:** Length

**Example:**
\`\`\`css
gap: 10px;
gap: 1rem;
gap: 10px 20px; /* row-gap column-gap */
\`\`\``,

      rowGap: `**row-gap** - Vertical gap between rows

**Example:**
\`\`\`css
row-gap: 20px;
\`\`\``,

      columnGap: `**column-gap** - Horizontal gap between columns

**Example:**
\`\`\`css
column-gap: 10px;
\`\`\``,

      // Grid
      gridTemplateColumns: `**grid-template-columns** - Define grid columns

**Example:**
\`\`\`css
grid-template-columns: 200px 1fr 1fr;
grid-template-columns: repeat(3, 1fr);
grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
\`\`\``,

      gridTemplateRows: `**grid-template-rows** - Define grid rows

**Example:**
\`\`\`css
grid-template-rows: 100px auto 50px;
grid-template-rows: repeat(3, 1fr);
\`\`\``,

      gridColumn: `**grid-column** - Item column span

**Example:**
\`\`\`css
grid-column: 1 / 3; /* span 2 columns */
grid-column: span 2;
\`\`\``,

      gridRow: `**grid-row** - Item row span

**Example:**
\`\`\`css
grid-row: 1 / 4; /* span 3 rows */
grid-row: span 2;
\`\`\``,

      // Sizing
      width: `**width** - Element width

**Values:** Length, percentage, \`auto\`, \`min-content\`, \`max-content\`, \`fit-content\`

**Example:**
\`\`\`css
width: 100%;
width: 300px;
width: 50vw;
width: auto;
\`\`\``,

      height: `**height** - Element height

**Values:** Length, percentage, \`auto\`, \`min-content\`, \`max-content\`, \`fit-content\`

**Example:**
\`\`\`css
height: 100vh;
height: 500px;
height: auto;
\`\`\``,

      minWidth: `**min-width** - Minimum width

**Example:**
\`\`\`css
min-width: 200px;
min-width: 50%;
\`\`\``,

      maxWidth: `**max-width** - Maximum width

**Example:**
\`\`\`css
max-width: 1200px;
max-width: 100%;
\`\`\``,

      minHeight: `**min-height** - Minimum height

**Example:**
\`\`\`css
min-height: 100vh;
min-height: 300px;
\`\`\``,

      maxHeight: `**max-height** - Maximum height

**Example:**
\`\`\`css
max-height: 500px;
max-height: 80vh;
\`\`\``,

      // Spacing
      margin: `**margin** - Outer spacing

**Values:** Length, percentage, \`auto\`

**Syntax:**
\`\`\`css
margin: 10px;              /* all sides */
margin: 10px 20px;         /* vertical horizontal */
margin: 10px 20px 10px 20px; /* top right bottom left */
margin: 0 auto;            /* center horizontally */
\`\`\`

**Individual sides:** margin-top, margin-right, margin-bottom, margin-left`,

      marginTop: `**margin-top** - Top outer spacing`,
      marginRight: `**margin-right** - Right outer spacing`,
      marginBottom: `**margin-bottom** - Bottom outer spacing`,
      marginLeft: `**margin-left** - Left outer spacing`,

      padding: `**padding** - Inner spacing

**Values:** Length, percentage

**Syntax:**
\`\`\`css
padding: 10px;              /* all sides */
padding: 10px 20px;         /* vertical horizontal */
padding: 10px 20px 10px 20px; /* top right bottom left */
\`\`\`

**Individual sides:** padding-top, padding-right, padding-bottom, padding-left`,

      paddingTop: `**padding-top** - Top inner spacing`,
      paddingRight: `**padding-right** - Right inner spacing`,
      paddingBottom: `**padding-bottom** - Bottom inner spacing`,
      paddingLeft: `**padding-left** - Left inner spacing`,

      // Typography
      color: `**color** - Text color

**Values:**
- Named: \`red\`, \`blue\`, \`green\`, \`black\`, \`white\`
- Hex: \`#ff0000\`, \`#rgb\`, \`#rrggbb\`
- RGB: \`rgb(255, 0, 0)\`
- RGBA: \`rgba(255, 0, 0, 0.5)\`
- HSL: \`hsl(0, 100%, 50%)\`

**Example:**
\`\`\`css
color: #333;
color: rgba(0, 0, 0, 0.8);
\`\`\``,

      fontSize: `**font-size** - Text size

**Values:**
- Absolute: \`12px\`, \`16px\`, \`20px\`
- Relative: \`1rem\`, \`1.5em\`, \`120%\`
- Keywords: \`small\`, \`medium\`, \`large\`, \`larger\`, \`smaller\`

**Example:**
\`\`\`css
font-size: 16px;
font-size: 1rem;
font-size: 1.5em;
\`\`\``,

      fontWeight: `**font-weight** - Text thickness

**Values:**
- Keywords: \`normal\` (400), \`bold\` (700), \`lighter\`, \`bolder\`
- Numeric: \`100\` to \`900\` (multiples of 100)

**Common values:**
- 100: Thin
- 300: Light
- 400: Normal/Regular
- 500: Medium
- 600: Semi-bold
- 700: Bold
- 900: Black

**Example:**
\`\`\`css
font-weight: 400;
font-weight: bold;
\`\`\``,

      fontFamily: `**font-family** - Font typeface

**Values:** Font names, generic families

**Example:**
\`\`\`css
font-family: 'Arial', sans-serif;
font-family: 'Georgia', serif;
font-family: 'Courier New', monospace;
font-family: system-ui, -apple-system, sans-serif;
\`\`\`

**Generic families:** serif, sans-serif, monospace, cursive, fantasy`,

      fontStyle: `**font-style** - Font style

**Values:**
- \`normal\` - Normal (default)
- \`italic\` - Italic
- \`oblique\` - Oblique (slanted)

**Example:**
\`\`\`css
font-style: italic;
\`\`\``,

      lineHeight: `**line-height** - Space between lines

**Values:** Number (multiplier), length, percentage

**Example:**
\`\`\`css
line-height: 1.5;      /* 1.5x font size */
line-height: 24px;
line-height: 150%;
\`\`\`

**Tip:** Use unitless numbers (1.5) for better scalability`,

      textAlign: `**text-align** - Horizontal text alignment

**Values:**
- \`left\` - Left align (default)
- \`right\` - Right align
- \`center\` - Center
- \`justify\` - Justify (stretch)

**Example:**
\`\`\`css
text-align: center;
\`\`\``,

      textDecoration: `**text-decoration** - Text decoration line

**Values:**
- \`none\` - No decoration
- \`underline\` - Underline
- \`overline\` - Line above
- \`line-through\` - Strikethrough

**Example:**
\`\`\`css
text-decoration: underline;
text-decoration: none; /* remove link underline */
\`\`\``,

      textTransform: `**text-transform** - Text case transformation

**Values:**
- \`none\` - No transformation (default)
- \`uppercase\` - ALL CAPS
- \`lowercase\` - all lowercase
- \`capitalize\` - Capitalize First Letter

**Example:**
\`\`\`css
text-transform: uppercase;
\`\`\``,

      letterSpacing: `**letter-spacing** - Space between characters

**Values:** Length (can be negative)

**Example:**
\`\`\`css
letter-spacing: 0.05em;
letter-spacing: 2px;
letter-spacing: -1px;
\`\`\``,

      wordSpacing: `**word-spacing** - Space between words

**Values:** Length

**Example:**
\`\`\`css
word-spacing: 0.2em;
\`\`\``,

      textShadow: `**text-shadow** - Text shadow effect

**Syntax:** \`x-offset y-offset blur-radius color\`

**Example:**
\`\`\`css
text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
text-shadow: 0 0 10px #fff;
\`\`\``,

      // Background
      background: `**background** - Shorthand for all background properties

**Example:**
\`\`\`css
background: #fff;
background: url('bg.jpg') center/cover no-repeat;
background: linear-gradient(to right, #ff0, #f0f);
\`\`\``,

      backgroundColor: `**background-color** - Background color

**Values:** Same as \`color\`

**Example:**
\`\`\`css
background-color: #f5f5f5;
background-color: rgba(255, 255, 255, 0.9);
background-color: transparent;
\`\`\``,

      backgroundImage: `**background-image** - Background image or gradient

**Values:**
- \`url('path/to/image.jpg')\`
- \`linear-gradient(...)\`
- \`radial-gradient(...)\`
- \`none\`

**Example:**
\`\`\`css
background-image: url('bg.jpg');
background-image: linear-gradient(to right, #667eea, #764ba2);
\`\`\``,

      backgroundSize: `**background-size** - Background image size

**Values:**
- \`cover\` - Cover entire element
- \`contain\` - Fit inside element
- Length/percentage: \`100px\`, \`50%\`
- \`auto\` - Natural size

**Example:**
\`\`\`css
background-size: cover;
background-size: 100% auto;
\`\`\``,

      backgroundPosition: `**background-position** - Background image position

**Values:**
- Keywords: \`center\`, \`top\`, \`bottom\`, \`left\`, \`right\`
- Length/percentage: \`50% 50%\`, \`10px 20px\`

**Example:**
\`\`\`css
background-position: center;
background-position: top right;
background-position: 50% 0;
\`\`\``,

      backgroundRepeat: `**background-repeat** - How background repeats

**Values:**
- \`repeat\` - Repeat both directions (default)
- \`repeat-x\` - Repeat horizontally
- \`repeat-y\` - Repeat vertically
- \`no-repeat\` - Don't repeat

**Example:**
\`\`\`css
background-repeat: no-repeat;
\`\`\``,

      // Border
      border: `**border** - Shorthand for border width, style, and color

**Syntax:** \`width style color\`

**Example:**
\`\`\`css
border: 1px solid #ccc;
border: 2px dashed red;
border: none;
\`\`\``,

      borderWidth: `**border-width** - Border thickness

**Example:**
\`\`\`css
border-width: 1px;
border-width: 1px 2px 3px 4px; /* top right bottom left */
\`\`\``,

      borderStyle: `**border-style** - Border line style

**Values:**
- \`none\` - No border
- \`solid\` - Solid line
- \`dashed\` - Dashed line
- \`dotted\` - Dotted line
- \`double\` - Double line

**Example:**
\`\`\`css
border-style: solid;
\`\`\``,

      borderColor: `**border-color** - Border color

**Example:**
\`\`\`css
border-color: #ccc;
border-color: red blue green yellow; /* top right bottom left */
\`\`\``,

      borderRadius: `**border-radius** - Rounded corners

**Values:** Length, percentage

**Example:**
\`\`\`css
border-radius: 4px;       /* all corners */
border-radius: 10px 20px; /* top-left/bottom-right top-right/bottom-left */
border-radius: 50%;       /* circle */
\`\`\``,

      borderTop: `**border-top** - Top border shorthand`,
      borderRight: `**border-right** - Right border shorthand`,
      borderBottom: `**border-bottom** - Bottom border shorthand`,
      borderLeft: `**border-left** - Left border shorthand`,

      outline: `**outline** - Outline (outside border)

**Syntax:** Same as border

**Example:**
\`\`\`css
outline: 2px solid blue;
outline: none; /* remove focus outline */
\`\`\`

**Note:** Doesn't affect layout (unlike border)`,

      // Box Model
      boxSizing: `**box-sizing** - How width/height are calculated

**Values:**
- \`content-box\` - Width/height = content only (default)
- \`border-box\` - Width/height = content + padding + border

**Example:**
\`\`\`css
box-sizing: border-box; /* recommended */
\`\`\`

**Tip:** Use border-box for easier sizing`,

      boxShadow: `**box-shadow** - Drop shadow effect

**Syntax:** \`x-offset y-offset blur spread color\`

**Example:**
\`\`\`css
box-shadow: 0 2px 4px rgba(0,0,0,0.1);
box-shadow: 0 10px 30px rgba(0,0,0,0.2);
box-shadow: inset 0 0 10px #ccc; /* inner shadow */
box-shadow: none;
\`\`\``,

      // Effects
      opacity: `**opacity** - Element transparency

**Values:** 0 (transparent) to 1 (opaque)

**Example:**
\`\`\`css
opacity: 0.5;  /* 50% transparent */
opacity: 0;    /* fully transparent */
opacity: 1;    /* fully opaque */
\`\`\``,

      visibility: `**visibility** - Element visibility

**Values:**
- \`visible\` - Visible (default)
- \`hidden\` - Hidden but takes space
- \`collapse\` - For table rows/columns

**Example:**
\`\`\`css
visibility: hidden;
\`\`\`

**vs display:none:** visibility keeps space, display:none removes element`,

      overflow: `**overflow** - How content overflow is handled

**Values:**
- \`visible\` - Show overflow (default)
- \`hidden\` - Hide overflow
- \`scroll\` - Always show scrollbars
- \`auto\` - Scrollbars when needed

**Example:**
\`\`\`css
overflow: hidden;
overflow: auto;
\`\`\``,

      overflowX: `**overflow-x** - Horizontal overflow`,
      overflowY: `**overflow-y** - Vertical overflow`,

      transform: `**transform** - 2D/3D transformations

**Functions:**
- \`translate(x, y)\` - Move
- \`translateX(x)\`, \`translateY(y)\` - Move axis
- \`scale(x, y)\` - Scale
- \`rotate(angle)\` - Rotate
- \`skew(x, y)\` - Skew

**Example:**
\`\`\`css
transform: translateY(-10px);
transform: scale(1.1);
transform: rotate(45deg);
transform: translate(50px, 100px) rotate(30deg);
\`\`\``,

      transformOrigin: `**transform-origin** - Transform origin point

**Values:** Position (x y)

**Example:**
\`\`\`css
transform-origin: center;
transform-origin: top left;
transform-origin: 50% 50%;
\`\`\``,

      transition: `**transition** - Animate property changes

**Syntax:** \`property duration timing-function delay\`

**Example:**
\`\`\`css
transition: all 0.3s ease;
transition: opacity 0.5s ease-in-out;
transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
\`\`\`

**Properties:** all, opacity, transform, background-color, etc.`,

      transitionProperty: `**transition-property** - Which properties to animate

**Example:**
\`\`\`css
transition-property: opacity, transform;
transition-property: all;
\`\`\``,

      transitionDuration: `**transition-duration** - Animation duration

**Example:**
\`\`\`css
transition-duration: 0.3s;
transition-duration: 300ms;
\`\`\``,

      transitionTimingFunction: `**transition-timing-function** - Animation easing

**Values:**
- \`ease\` - Slow start/end (default)
- \`linear\` - Constant speed
- \`ease-in\` - Slow start
- \`ease-out\` - Slow end
- \`ease-in-out\` - Slow start and end
- \`cubic-bezier(n,n,n,n)\` - Custom curve

**Example:**
\`\`\`css
transition-timing-function: ease-in-out;
\`\`\``,

      transitionDelay: `**transition-delay** - Delay before animation starts

**Example:**
\`\`\`css
transition-delay: 0.2s;
\`\`\``,

      animation: `**animation** - Keyframe animations

**Syntax:** \`name duration timing-function delay iteration-count direction fill-mode\`

**Example:**
\`\`\`css
animation: fadeIn 1s ease-in-out;
animation: spin 2s linear infinite;

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
\`\`\``,

      // Cursor & Interaction
      cursor: `**cursor** - Mouse cursor style

**Values:**
- \`auto\` - Default
- \`default\` - Arrow
- \`pointer\` - Hand (link)
- \`text\` - I-beam (text)
- \`move\` - Four arrows
- \`grab\`, \`grabbing\` - Open/closed hand
- \`not-allowed\` - Prohibited
- \`wait\` - Spinner
- \`help\` - Question mark

**Example:**
\`\`\`css
cursor: pointer;
cursor: not-allowed;
\`\`\``,

      pointerEvents: `**pointer-events** - Whether element receives mouse events

**Values:**
- \`auto\` - Normal (default)
- \`none\` - Ignore mouse events

**Example:**
\`\`\`css
pointer-events: none; /* click through element */
\`\`\``,

      userSelect: `**user-select** - Whether text can be selected

**Values:**
- \`auto\` - Normal (default)
- \`none\` - Cannot select
- \`text\` - Can select text
- \`all\` - Select entire element

**Example:**
\`\`\`css
user-select: none; /* prevent selection */
\`\`\``,

      // Other
      filter: `**filter** - Visual effects

**Functions:**
- \`blur(px)\` - Blur effect
- \`brightness(%)\` - Adjust brightness
- \`contrast(%)\` - Adjust contrast
- \`grayscale(%)\` - Convert to grayscale
- \`saturate(%)\` - Adjust saturation
- \`hue-rotate(deg)\` - Rotate hue
- \`invert(%)\` - Invert colors
- \`opacity(%)\` - Opacity
- \`sepia(%)\` - Sepia tone

**Example:**
\`\`\`css
filter: blur(5px);
filter: brightness(150%);
filter: grayscale(100%);
filter: blur(2px) brightness(80%);
\`\`\``,

      backdropFilter: `**backdrop-filter** - Filters to area behind element

**Functions:** Same as \`filter\`

**Example:**
\`\`\`css
backdrop-filter: blur(10px);
\`\`\`

**Use case:** Frosted glass effect`,

      objectFit: `**object-fit** - How replaced element (img, video) fits

**Values:**
- \`fill\` - Stretch to fill (default)
- \`contain\` - Fit inside, maintain aspect ratio
- \`cover\` - Cover area, maintain aspect ratio
- \`none\` - Original size
- \`scale-down\` - Smaller of none or contain

**Example:**
\`\`\`css
object-fit: cover;
\`\`\``,

      objectPosition: `**object-position** - Position of replaced element

**Example:**
\`\`\`css
object-position: center;
object-position: top;
object-position: 50% 25%;
\`\`\``,
    };

    const prop = word.replace(/-([a-z])/g, (g) => g[1].toUpperCase()); // Support both camelCase and kebab-case

    if (cssProperties[prop] || cssProperties[word]) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `### 🎨 ${word}\n\n${cssProperties[prop] || cssProperties[word]}`,
        },
      };
    }

    return null;
  }

  private getCSSSelectorHover(
    word: string,
    beforeCursor: string,
    inStyleBlock: boolean,
  ): Hover | null {
    if (!inStyleBlock) return null;

    // Check if word is a CSS selector (class, id, element)
    const lineBeforeCursor = beforeCursor.split('\n').pop() || '';

    // Check for class selector
    if (lineBeforeCursor.match(new RegExp(`\\.${word}\\s*\\{`))) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `### 🎯 CSS Class: \`.${word}\`

**Selector Type:** Class

**Usage in HTML:**
\`\`\`html
<div class="${word}">...</div>
\`\`\`

**Specificity:** 0,1,0`,
        },
      };
    }

    // Check for ID selector
    if (lineBeforeCursor.match(new RegExp(`#${word}\\s*\\{`))) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `### 🎯 CSS ID: \`#${word}\`

**Selector Type:** ID

**Usage in HTML:**
\`\`\`html
<div id="${word}">...</div>
\`\`\`

**Specificity:** 1,0,0
**Note:** IDs should be unique`,
        },
      };
    }

    // Check for element selector
    const htmlElements = [
      'div',
      'span',
      'p',
      'a',
      'button',
      'input',
      'h1',
      'h2',
      'h3',
      'section',
      'article',
      'nav',
      'header',
      'footer',
    ];
    if (
      htmlElements.includes(word) &&
      lineBeforeCursor.match(new RegExp(`${word}\\s*\\{`))
    ) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `### 🎯 CSS Element Selector: \`${word}\`

**Selector Type:** Element

Targets all \`<${word}>\` elements

**Specificity:** 0,0,1`,
        },
      };
    }

    return null;
  }

  private getCSSValueHover(
    word: string,
    beforeCursor: string,
    inCSSContext: boolean,
  ): Hover | null {
    if (!inCSSContext) return null;

    const cssValues: Record<string, string> = {
      // Display values
      block: `**block** - Block-level element. Takes full width, starts on new line.`,
      inline: `**inline** - Inline element. Flows with text, ignores width/height.`,
      'inline-block': `**inline-block** - Inline but accepts width/height.`,
      flex: `**flex** - Flexbox container. Children become flex items.`,
      grid: `**grid** - Grid container. Children become grid items.`,
      none: `**none** - Element is hidden and removed from layout.`,

      // Position values
      static: `**static** - Default positioning. Element flows normally.`,
      relative: `**relative** - Positioned relative to normal position.`,
      absolute: `**absolute** - Positioned relative to nearest positioned ancestor.`,
      fixed: `**fixed** - Positioned relative to viewport (stays on scroll).`,
      sticky: `**sticky** - Toggles between relative and fixed based on scroll.`,

      // Flex values
      row: `**row** - Flex items arranged horizontally (default).`,
      column: `**column** - Flex items arranged vertically.`,
      'row-reverse': `**row-reverse** - Flex items arranged horizontally in reverse.`,
      'column-reverse': `**column-reverse** - Flex items arranged vertically in reverse.`,
      wrap: `**wrap** - Flex items wrap to multiple lines.`,
      nowrap: `**nowrap** - Flex items stay on single line (default).`,
      'flex-start': `**flex-start** - Items aligned to start of container.`,
      'flex-end': `**flex-end** - Items aligned to end of container.`,
      center: `**center** - Items centered in container.`,
      'space-between': `**space-between** - Items evenly distributed, first/last at edges.`,
      'space-around': `**space-around** - Items evenly distributed with equal space around.`,
      'space-evenly': `**space-evenly** - Items evenly distributed with equal space between.`,
      stretch: `**stretch** - Items stretched to fill container.`,
      baseline: `**baseline** - Items aligned along their baselines.`,

      // Common values
      auto: `**auto** - Browser automatically calculates the value.`,
      inherit: `**inherit** - Inherits value from parent element.`,
      initial: `**initial** - Sets to default/initial value.`,
      unset: `**unset** - Resets to inherited value or initial value.`,
      transparent: `**transparent** - Fully transparent (rgba(0,0,0,0)).`,

      // Font weights
      normal: `**normal** - Normal font weight (400).`,
      bold: `**bold** - Bold font weight (700).`,
      lighter: `**lighter** - One weight lighter than parent.`,
      bolder: `**bolder** - One weight heavier than parent.`,

      // Text align
      left: `**left** - Text aligned to left edge.`,
      right: `**right** - Text aligned to right edge.`,
      justify: `**justify** - Text justified (stretched to fill line).`,

      // Overflow
      visible: `**visible** - Overflow is visible (default).`,
      hidden: `**hidden** - Overflow is clipped and invisible.`,
      scroll: `**scroll** - Scrollbars always visible.`,

      // Cursor
      pointer: `**pointer** - Hand cursor (for clickable elements).`,
      default: `**default** - Default arrow cursor.`,
      text: `**text** - I-beam cursor (for text selection).`,
      move: `**move** - Four-directional arrow cursor.`,
      'not-allowed': `**not-allowed** - Prohibited cursor.`,
      grab: `**grab** - Open hand cursor (grabbable).`,
      grabbing: `**grabbing** - Closed hand cursor (grabbing).`,

      // Box-sizing
      'content-box': `**content-box** - Width/height only includes content (default).`,
      'border-box': `**border-box** - Width/height includes padding and border.`,

      // Background
      cover: `**cover** - Scale image to cover entire element (may crop).`,
      contain: `**contain** - Scale image to fit inside element (no crop).`,
      'no-repeat': `**no-repeat** - Background image doesn't repeat.`,
      repeat: `**repeat** - Background image repeats in both directions.`,
      'repeat-x': `**repeat-x** - Background image repeats horizontally.`,
      'repeat-y': `**repeat-y** - Background image repeats vertically.`,

      // Border style
      solid: `**solid** - Solid border line.`,
      dashed: `**dashed** - Dashed border line.`,
      dotted: `**dotted** - Dotted border line.`,
      double: `**double** - Double border line.`,

      // Font style
      italic: `**italic** - Italic text style.`,
      oblique: `**oblique** - Oblique/slanted text style.`,

      // Text decoration
      underline: `**underline** - Underlined text.`,
      overline: `**overline** - Line above text.`,
      'line-through': `**line-through** - Strikethrough text.`,

      // Text transform
      uppercase: `**uppercase** - ALL UPPERCASE TEXT.`,
      lowercase: `**lowercase** - all lowercase text.`,
      capitalize: `**capitalize** - Capitalize First Letter Of Each Word.`,

      // Units
      px: `**px** - Pixels (absolute unit). 1px = 1/96th of an inch.`,
      em: `**em** - Relative to font size of element.`,
      rem: `**rem** - Relative to font size of root element.`,
      '%': `**%** - Percentage of parent's value.`,
      vw: `**vw** - Viewport width (1vw = 1% of viewport width).`,
      vh: `**vh** - Viewport height (1vh = 1% of viewport height).`,
      vmin: `**vmin** - Smaller of vw or vh.`,
      vmax: `**vmax** - Larger of vw or vh.`,

      // Timing functions
      ease: `**ease** - Slow start, fast middle, slow end (default).`,
      linear: `**linear** - Constant speed throughout.`,
      'ease-in': `**ease-in** - Slow start, then fast.`,
      'ease-out': `**ease-out** - Fast start, then slow.`,
      'ease-in-out': `**ease-in-out** - Slow start and end, fast middle.`,
    };

    if (cssValues[word]) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `### 💎 ${word}\n\n${cssValues[word]}`,
        },
      };
    }

    return null;
  }

  private getComponentHover(word: string, tree: any): Hover | null {
    const pulsePrimitives: Record<string, string> = {
      Show: `### 👁️ Show Primitive
Conditionally renders content based on boolean.

**Props:**
- \`when\`: Condition (required)
- \`fallback\`: Content when false (optional)

**Usage:**
\`\`\`html
<Show when={isLoaded} fallback={<Loading />}>
  <Content />
</Show>
\`\`\`

**Performance:** Children only evaluated when true`,

      List: `### 📜 List Primitive
Efficiently renders arrays with fine-grained updates.

**Props:**
- \`each\`: Array to iterate (required)
- \`as\`: Variable name for items (required)

**Usage:**
\`\`\`html
<List each={items} as="item">
  <div>{item.name}</div>
</List>
\`\`\`

**Performance:** Only re-renders changed items, not entire list`,

      Portal: `### 🌀 Portal Primitive
Renders children into different DOM node.

**Props:**
- \`mount\`: Target element (default: document.body)

**Usage:**
\`\`\`html
<Portal mount={document.body}>
  <Modal />
</Portal>
\`\`\`

**Use Cases:** Modals, tooltips, popovers`,

      Suspense: `### ⏳ Suspense Primitive
Shows fallback while async content loads.

**Props:**
- \`fallback\`: Loading UI

**Usage:**
\`\`\`html
<Suspense fallback={<Spinner />}>
  <AsyncData />
</Suspense>
\`\`\``,

      ErrorBoundary: `### 🛡️ ErrorBoundary Primitive
Catches errors in child components.

**Props:**
- \`fallback\`: Error UI (receives error)

**Usage:**
\`\`\`html
<ErrorBoundary fallback={(err) => <Error error={err} />}>
  <App />
</ErrorBoundary>
\`\`\``,
    };

    if (pulsePrimitives[word]) {
      return {
        contents: { kind: MarkupKind.Markdown, value: pulsePrimitives[word] },
      };
    }

    if (/^[A-Z]/.test(word)) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `### 🧩 ${word} Component

Custom Pulse component

**Location:** \`components/${word}.pulse\``,
        },
      };
    }

    return null;
  }

  private getHTMLElementHover(word: string): Hover | null {
    const htmlElements: Record<string, string> = {
      div: '**Block Container** - Generic container for flow content',
      span: '**Inline Container** - Generic inline container',
      p: '**Paragraph** - Paragraph of text',
      a: '**Anchor** - Hyperlink',
      button: '**Button** - Clickable button',
      input: '**Input** - User input field',
      textarea: '**Textarea** - Multi-line text input',
      select: '**Select** - Dropdown selection',
      form: '**Form** - Form with interactive controls',
      label: '**Label** - Caption for form element',
      img: '**Image** - Embeds an image',
      ul: '**Unordered List** - List with bullets',
      ol: '**Ordered List** - Numbered list',
      li: '**List Item** - Item in a list',
      table: '**Table** - Tabular data',
      h1: '**Heading 1** - Top-level heading',
      h2: '**Heading 2** - Second-level heading',
      h3: '**Heading 3** - Third-level heading',
      h4: '**Heading 4** - Fourth-level heading',
      h5: '**Heading 5** - Fifth-level heading',
      h6: '**Heading 6** - Sixth-level heading',
      nav: '**Navigation** - Navigation links section',
      header: '**Header** - Introductory content',
      footer: '**Footer** - Footer of section/page',
      main: '**Main** - Dominant content',
      section: '**Section** - Generic section',
      article: '**Article** - Self-contained composition',
      aside: '**Aside** - Sidebar content',
      video: '**Video** - Video player',
      audio: '**Audio** - Audio player',
      canvas: '**Canvas** - Graphics via scripting',
      svg: '**SVG** - Scalable vector graphics',
      iframe: '**IFrame** - Embedded document',
      pre: '**Preformatted** - Preformatted text',
      code: '**Code** - Inline code',
      strong: '**Strong** - Strong importance (bold)',
      em: '**Emphasis** - Emphasized text (italic)',
      br: '**Break** - Line break',
      hr: '**Horizontal Rule** - Thematic break',
    };

    if (htmlElements[word.toLowerCase()]) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `### \`<${word}>\`\n\n${htmlElements[word.toLowerCase()]}`,
        },
      };
    }

    return null;
  }

  private getAttributeHover(word: string): Hover | null {
    const attributes: Record<string, string> = {
      class: `**class** - CSS class names for styling\n\nExample: \`<div class="container">\``,
      id: `**id** - Unique identifier\n\nExample: \`<div id="main">\``,
      style: `**style** - Inline styles (use object in Pulse)\n\nExample: \`<div style={{ color: 'red' }}>\``,
      href: `**href** - URL for links\n\nExample: \`<a href="/about">\``,
      src: `**src** - Source URL for images/scripts\n\nExample: \`<img src="/logo.png" />\``,
      alt: `**alt** - Alternative text for images\n\nExample: \`<img alt="Logo" />\``,
      type: `**type** - Type of element\n\nExamples:\n- \`<input type="text" />\`\n- \`<button type="submit">\``,
      value: `**value** - Input value\n\nExample: \`<input value={name} />\``,
      placeholder: `**placeholder** - Hint text in inputs\n\nExample: \`<input placeholder="Enter name" />\``,
      disabled: `**disabled** - Disables element\n\nExample: \`<button disabled={loading}>\``,
      checked: `**checked** - Checkbox/radio checked state\n\nExample: \`<input type="checkbox" checked={isChecked} />\``,
      name: `**name** - Form control name\n\nExample: \`<input name="email" />\``,
      for: `**for** - Associates label with form control\n\nExample: \`<label for="email">\``,
      role: `**role** - ARIA role for accessibility\n\nExample: \`<div role="button">\``,
      'aria-label': `**aria-label** - Accessible label\n\nExample: \`<button aria-label="Close">\``,
      tabindex: `**tabindex** - Tab navigation order\n\nExample: \`<div tabindex="0">\``,
    };

    if (attributes[word.toLowerCase()]) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: attributes[word.toLowerCase()],
        },
      };
    }

    return null;
  }

  private getEventHandlerHover(word: string): Hover | null {
    const events: Record<string, string> = {
      onClick: `### 🖱️ onClick\nFires when clicked.\n\nExample:\n\`\`\`html\n<button onClick={() => alert('Clicked!')}>Click</button>\n\`\`\``,
      onChange: `### 🔄 onChange\nFires when value changes (select, radio, checkbox).\n\nExample:\n\`\`\`html\n<select onChange={(e) => setValue(e.target.value)}>\n\`\`\``,
      onInput: `### ⌨️ onInput\nFires on every input change.\n\nExample:\n\`\`\`html\n<input onInput={(e) => setText(e.target.value)} />\n\`\`\``,
      onSubmit: `### 📤 onSubmit\nFires on form submission.\n\nExample:\n\`\`\`html\n<form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>\n\`\`\``,
      onFocus: `### 🎯 onFocus\nFires when element receives focus.\n\nExample:\n\`\`\`html\n<input onFocus={() => setFocused(true)} />\n\`\`\``,
      onBlur: `### 👁️ onBlur\nFires when element loses focus.\n\nExample:\n\`\`\`html\n<input onBlur={() => validate()} />\n\`\`\``,
      onKeyDown: `### ⌨️ onKeyDown\nFires when key is pressed down.\n\nExample:\n\`\`\`html\n<input onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />\n\`\`\``,
      onKeyUp: `### ⌨️ onKeyUp\nFires when key is released.\n\nExample:\n\`\`\`html\n<input onKeyUp={(e) => console.log(e.key)} />\n\`\`\``,
      onMouseEnter: `### 🖱️ onMouseEnter\nFires when mouse enters element.\n\nExample:\n\`\`\`html\n<div onMouseEnter={() => setHover(true)}>\n\`\`\``,
      onMouseLeave: `### 🖱️ onMouseLeave\nFires when mouse leaves element.\n\nExample:\n\`\`\`html\n<div onMouseLeave={() => setHover(false)}>\n\`\`\``,
      onMouseMove: `### 🖱️ onMouseMove\nFires when mouse moves over element.\n\nExample:\n\`\`\`html\n<div onMouseMove={(e) => console.log(e.clientX, e.clientY)}>\n\`\`\``,
      onScroll: `### 📜 onScroll\nFires when element scrolls.\n\nExample:\n\`\`\`html\n<div onScroll={(e) => console.log(e.target.scrollTop)}>\n\`\`\``,
      onLoad: `### 🚀 onLoad\nFires when resource loads (img, iframe, etc.).\n\nExample:\n\`\`\`html\n<img onLoad={() => setLoaded(true)} />\n\`\`\``,
      onError: `### ❌ onError\nFires when error occurs.\n\nExample:\n\`\`\`html\n<img onError={() => setFallback(true)} />\n\`\`\``,
    };

    if (events[word]) {
      return {
        contents: { kind: MarkupKind.Markdown, value: events[word] },
      };
    }

    return null;
  }
}
