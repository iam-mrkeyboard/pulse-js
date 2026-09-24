
import { createSignal, createEffect } from 'pulse/runtime';
import { mountPrimitives as dom_mountPrimitives, walk } from 'pulse/runtime/dom';
import { List } from 'pulse/runtime/list';




// Static Template
const _tpl = document.createElement('template');
_tpl.innerHTML = `<div class="data-v-1eyp pulse-component-app"><div class="container"><div class="jumbotron"><div class="row"><div class="col-md-6"><h1>Pulse ("keyed")</h1></div><div class="col-md-6"><div class="row"><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="run" data-on-click="{run}">Create 1,000 rows</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="runlots" data-on-click="{runLots}">Create 10,000 rows</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="add" data-on-click="{add}">Append 1,000 rows</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="update" data-on-click="{update}">Update every 10th row</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="clear" data-on-click="{clear}">Clear</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="swaprows" data-on-click="{swapRows}">Swap Rows</button></div></div></div></div></div><table class="table table-hover table-striped test-data"><tbody><pulse-list each="{state.data}" as="row" key="{row.id}" data-bindings="[{&quot;type&quot;:&quot;attribute&quot;,&quot;path&quot;:[0],&quot;name&quot;:&quot;class&quot;,&quot;expr&quot;:&quot;state.selected === row.id ? \&quot;danger\&quot; : \&quot;\&quot;&quot;},{&quot;type&quot;:&quot;text&quot;,&quot;path&quot;:[0,0,0],&quot;expr&quot;:&quot;row.id&quot;},{&quot;type&quot;:&quot;text&quot;,&quot;path&quot;:[0,1,0,0],&quot;expr&quot;:&quot;row.label&quot;}]" data-template-id="tmpl_0" style="display:contents"></pulse-list></tbody></table><span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span></div></div>`; // Escape backticks

export default function App(props) {
  props = props || {};
  
  // Hydration Adoption
  let container;
  if (props._hydrationNode) {
    container = props._hydrationNode;
  } else {
    // Clone Node (Fast Instantiation)
    const root = _tpl.content.cloneNode(true);
    container = root.querySelector('div'); // The wrapper div
  }
  
  // We need to return 'container' but make sure we keep the style tag if it's there (it's in the Fragment)
  // Actually, 'root' is a DocumentFragment.
  // If we return 'container', we lose the style tag if it's a sibling.
  // But wait, <style> inside <template> is fine.
  // If we return 'container' (the div), and the style is *inside* it? No, style is sibling usually in my string.
  // Let's put style INSIDE the wrapper div to be safe and portable?
  // Current logic: innerHTML = style + html. 
  // If html is many nodes, container wraps them.
  // So style + html are children of container.
  // YES. My fullTemplateHTML above wraps style AND html in the div. Correct.

  const [get_data, set_data] = createSignal([]);
  const [get_selected, set_selected] = createSignal(null);
  const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"];
  const colors = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"];
  const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"];
  let nextId = 1;
  function random(max) {
  return Math.round(Math.random() * 1000) % max;
}
  function buildData(count) {
  const data = new Array(count);
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: nextId++,
      label: `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`,
    };
  }
  return data;
}
  function run() {
  state.data = buildData(1000);
  state.selected = null;
}
  function runLots() {
  state.data = buildData(10000);
  state.selected = null;
}
  function add() {
  state.data = state.data.concat(buildData(1000));
}
  function update() {
  // Plain-object label mutation does NOT notify List item bindings today —
  // the runtime entry uses per-row label signals instead.
  const d = state.data.slice();
  for (let i = 0; i < d.length; i += 10) {
    d[i] = { ...d[i], label: d[i].label + " !!!" };
  }
  state.data = d;
}
  function clear() {
  state.data = [];
  state.selected = null;
}
  function swapRows() {
  const list = state.data.slice();
  if (list.length > 998) {
    const tmp = list[1];
    list[1] = list[998];
    list[998] = tmp;
    state.data = list;
  }
}
  function remove(id) {
  state.data = state.data.filter((r) => r.id !== id);
}
  function select(id) {
  state.selected = id;
}
  const state = {
    get data() { return get_data(); },
    set data(v) { set_data(v); },
    get selected() { return get_selected(); },
    set selected(v) { set_selected(v); },
  };

  const scope = { 
    get data() { return get_data (); }, 
    get selected() { return get_selected (); }, 
    random: random, 
    buildData: buildData, 
    run: run, 
    runLots: runLots, 
    add: add, 
    update: update, 
    clear: clear, 
    swapRows: swapRows, 
    remove: remove, 
    select: select, 
    adjectives: adjectives, 
    colors: colors, 
    nouns: nouns, 
    nextId: nextId, 
    props: props, 
    state: state, 
  }; 

  const mountPrimitives = (cont) => {

    dom_mountPrimitives(cont, scope, { 
       List: List, 
       Show: undefined, 
       createEffect: createEffect, 
    }, {"tmpl_0":"<tr><td class=\"col-md-1\"> </td><td class=\"col-md-4\"><a data-on-click=\"{() => select(row.id)}\"> </a></td><td class=\"col-md-1\"><a data-on-click=\"{() => remove(row.id)}\"><span class=\"glyphicon glyphicon-remove\" aria-hidden=\"true\"></span></a></td><td class=\"col-md-6\"></td></tr>"}); 
  }; 

  const handlers = { random: random, buildData: buildData, run: run, runLots: runLots, add: add, update: update, clear: clear, swapRows: swapRows, remove: remove, select: select };
  container.__pulseHandlers = handlers;

  if (props.children && props.children.length > 0) {
    const slotEl = container.querySelector('slot');
    if (slotEl) {
      const fragment = document.createDocumentFragment();
      props.children.forEach(child => {
        if (child instanceof Node) fragment.appendChild(child.cloneNode(true));
      });
      slotEl.replaceWith(fragment);
    } else {
      props.children.forEach(child => {
        if (child instanceof Node) container.appendChild(child.cloneNode(true));
      });
    }
  }

  mountPrimitives(container);
  if (container && container.setAttribute) container.setAttribute('data-p-h', '1');
  return container;
}
