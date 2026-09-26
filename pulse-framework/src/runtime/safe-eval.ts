/**
 * Restricted expression evaluator — no Function / eval / import.
 * Supports identifiers, members, optional chaining, literals, unary/binary ops, ternary.
 */
export function safeEval(code: string, scope: Record<string, any>): any {
  const src = code.trim();
  if (!src) return '';
  if (/[`]|Function\b|\beval\b|import\s*\(|require\b|process\b|globalThis\b|window\b|document\b/.test(src)) {
    return '';
  }
  let i = 0;
  const peek = () => src[i];
  const eat = () => src[i++];
  const skip = () => { while (i < src.length && /\s/.test(src[i])) i++; };

  function parsePrimary(): any {
    skip();
    const c = peek();
    if (c === "'" || c === '"') {
      const q = eat();
      let s = '';
      while (i < src.length && peek() !== q) {
        if (peek() === '\\') { eat(); s += eat(); }
        else s += eat();
      }
      eat();
      return s;
    }
    if (c === '`') return '';
    if (/[0-9]/.test(c!) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let n = '';
      while (i < src.length && /[0-9._]/.test(peek()!)) n += eat();
      return Number(n);
    }
    if (c === '(') {
      eat();
      const v = parseTernary();
      skip();
      if (peek() === ')') eat();
      return v;
    }
    if (c === '[') {
      eat();
      const arr: any[] = [];
      skip();
      if (peek() !== ']') {
        arr.push(parseTernary());
        skip();
        while (peek() === ',') { eat(); skip(); arr.push(parseTernary()); skip(); }
      }
      if (peek() === ']') eat();
      return arr;
    }
    if (/[A-Za-z_$]/.test(c!)) {
      let id = '';
      while (i < src.length && /[A-Za-z0-9_$]/.test(peek()!)) id += eat();
      if (id === 'true') return true;
      if (id === 'false') return false;
      if (id === 'null') return null;
      if (id === 'undefined') return undefined;
      let val = Object.prototype.hasOwnProperty.call(scope, id) ? scope[id] : undefined;
      while (true) {
        skip();
        if (src.startsWith('?.', i)) {
          i += 2; skip();
          if (peek() === '[') {
            eat();
            const key = parseTernary();
            skip(); if (peek() === ']') eat();
            val = val == null ? undefined : val[key as any];
          } else {
            let prop = '';
            while (i < src.length && /[A-Za-z0-9_$]/.test(peek()!)) prop += eat();
            val = val == null ? undefined : val[prop];
          }
          continue;
        }
        if (peek() === '.') {
          eat();
          let prop = '';
          while (i < src.length && /[A-Za-z0-9_$]/.test(peek()!)) prop += eat();
          val = val == null ? undefined : val[prop];
          continue;
        }
        if (peek() === '[') {
          eat();
          const key = parseTernary();
          skip(); if (peek() === ']') eat();
          val = val == null ? undefined : val[key as any];
          continue;
        }
        if (peek() === '(') return '';
        break;
      }
      return val;
    }
    return '';
  }

  function parseUnary(): any {
    skip();
    if (peek() === '!') { eat(); return !parseUnary(); }
    if (peek() === '-') { eat(); return -parseUnary(); }
    if (peek() === '+') { eat(); return +parseUnary(); }
    return parsePrimary();
  }

  function parseBinary(): any {
    let left = parseUnary();
    while (true) {
      skip();
      const ops = ['===', '!==', '==', '!=', '<=', '>=', '&&', '||', '+', '-', '*', '/', '<', '>'];
      let op: string | null = null;
      for (const candidate of ops) {
        if (src.startsWith(candidate, i)) { op = candidate; i += candidate.length; break; }
      }
      if (!op) break;
      const right = parseUnary();
      switch (op) {
        case '+': left = left + right; break;
        case '-': left = left - right; break;
        case '*': left = left * right; break;
        case '/': left = left / right; break;
        case '===': left = left === right; break;
        case '!==': left = left !== right; break;
        case '==': left = left == right; break;
        case '!=': left = left != right; break;
        case '<': left = left < right; break;
        case '>': left = left > right; break;
        case '<=': left = left <= right; break;
        case '>=': left = left >= right; break;
        case '&&': left = left && right; break;
        case '||': left = left || right; break;
      }
    }
    return left;
  }

  function parseTernary(): any {
    const cond = parseBinary();
    skip();
    if (peek() === '?') {
      eat();
      const a = parseTernary();
      skip();
      if (peek() === ':') eat();
      const b = parseTernary();
      return cond ? a : b;
    }
    return cond;
  }

  try {
    const v = parseTernary();
    skip();
    return i >= src.length ? v : '';
  } catch {
    return '';
  }
}
