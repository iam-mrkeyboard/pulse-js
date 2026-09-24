/**
 * Pulse keyed entry for js-framework-benchmark.
 *
 * FALLBACK (runtime API): This file is hand-written against Pulse's public
 * runtime (createSignal / batch / createEffect / keyed List / template), NOT
 * vanilla DOM reconciliation. See ../COMPILER_NOTES.md and ../src/App.pulse
 * for why the SFC compiler output was not shipped.
 */
import { createSignal, createEffect, batch } from "../pulse-runtime/core.ts";
import { List } from "../pulse-runtime/primitives/list.ts";

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"];
const colors = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"];
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"];

const random = (max) => Math.round(Math.random() * 1000) % max;

let nextId = 1;

/** Per-row fine-grained label signal (Solid-style) so partial update stays keyed. */
const buildData = (count) => {
  const data = new Array(count);
  for (let i = 0; i < count; i++) {
    const [label, setLabel] = createSignal(
      `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`
    );
    data[i] = { id: nextId++, label, setLabel };
  }
  return data;
};

const rowTemplate = document.createElement("template");
rowTemplate.innerHTML =
  '<tr><td class="col-md-1"></td><td class="col-md-4"><a></a></td><td class="col-md-1"><a><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td><td class="col-md-6"></td></tr>';

const [data, setData] = createSignal([]);
const [selected, setSelected] = createSignal(null);

const run = () => {
  setData(buildData(1000));
  setSelected(null);
};
const runLots = () => {
  setData(buildData(10000));
  setSelected(null);
};
const add = () => setData((d) => d.concat(buildData(1000)));
const update = () =>
  batch(() => {
    const d = data();
    for (let i = 0, len = d.length; i < len; i += 10) {
      d[i].setLabel((l) => l + " !!!");
    }
  });
const clear = () => {
  setData([]);
  setSelected(null);
};
const swapRows = () => {
  const list = data().slice();
  if (list.length > 998) {
    const tmp = list[1];
    list[1] = list[998];
    list[998] = tmp;
    setData(list);
  }
};

function Button(id, text, fn) {
  const wrap = document.createElement("div");
  wrap.className = "col-sm-6 smallpad";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-primary btn-block";
  btn.id = id;
  btn.textContent = text;
  btn.addEventListener("click", fn);
  wrap.appendChild(btn);
  return wrap;
}

function App() {
  const root = document.createElement("div");
  root.className = "container";

  const jumbo = document.createElement("div");
  jumbo.className = "jumbotron";
  jumbo.innerHTML = `<div class="row"><div class="col-md-6"><h1>Pulse ("keyed")</h1></div><div class="col-md-6"><div class="row" id="pulse-btns"></div></div></div>`;
  const btnRow = jumbo.querySelector("#pulse-btns");
  btnRow.appendChild(Button("run", "Create 1,000 rows", run));
  btnRow.appendChild(Button("runlots", "Create 10,000 rows", runLots));
  btnRow.appendChild(Button("add", "Append 1,000 rows", add));
  btnRow.appendChild(Button("update", "Update every 10th row", update));
  btnRow.appendChild(Button("clear", "Clear", clear));
  btnRow.appendChild(Button("swaprows", "Swap Rows", swapRows));
  root.appendChild(jumbo);

  const table = document.createElement("table");
  table.className = "table table-hover table-striped test-data";
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);
  root.appendChild(table);

  const preload = document.createElement("span");
  preload.className = "preloadicon glyphicon glyphicon-remove";
  preload.setAttribute("aria-hidden", "true");
  root.appendChild(preload);

  // Keyed List — Pulse runtime primitive (prefix/suffix + Map)
  const listFrag = List({
    each: () => data(),
    key: (row) => row.id,
    children: (row) => {
      const tr = rowTemplate.content.firstChild.cloneNode(true);
      const idTd = tr.children[0];
      const labelA = tr.children[1].firstChild;
      const removeA = tr.children[2].firstChild;

      idTd.textContent = String(row.id);

      // Fine-grained label binding (reads row.label signal)
      createEffect(() => {
        labelA.textContent = row.label();
      });

      // Select highlighting — each row tracks selected()
      createEffect(() => {
        tr.className = selected() === row.id ? "danger" : "";
      });

      labelA.addEventListener("click", () => setSelected(row.id));
      removeA.addEventListener("click", () => {
        setData((d) => {
          const idx = d.findIndex((r) => r.id === row.id);
          if (idx === -1) return d;
          const next = d.slice();
          next.splice(idx, 1);
          return next;
        });
      });

      return tr;
    },
  });
  tbody.appendChild(listFrag);

  return root;
}

document.getElementById("main").appendChild(App());
