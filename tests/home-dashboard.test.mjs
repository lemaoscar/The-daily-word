import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const script = await readFile(new URL('../home.js', import.meta.url), 'utf8');

function createDashboard(progress = {}) {
  const nodes = new Map();
  const windowListeners = new Map();
  const storage = new Map([['dw-plan-complete', JSON.stringify(progress)]]);
  const registeredWorkers = [];
  const messages = [];
  const node = id => {
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        attributes:{},
        dataset:{},
        listeners:new Map(),
        children:[],
        hidden:false,
        disabled:false,
        textContent:'',
        href:'',
        style:{},
        appendChild(child) { this.children.push(child); return child; },
        replaceChildren(...children) { this.children = children; },
        getAttribute(name) { return this.attributes[name] ?? null; },
        querySelector(selector) {
          const target = /^\[data-calendar-focus-target\]$/.test(selector);
          const descendants = this.children.flatMap(row => (row.children || []).flatMap(cell => cell.children || []));
          return descendants.find(child => target && child?.attributes['data-calendar-focus-target'] === 'true');
        },
        focus() { this.focused = true; },
        setAttribute(name, value) { this.attributes[name] = value; if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value; },
        addEventListener(name, callback) { this.listeners.set(name, callback); }
      });
    }
    return nodes.get(id);
  };
  const documentListeners = new Map();
  const document = {
    getElementById:node,
    createElement:tag => ({
      tag,
      dataset:{},
      attributes:{},
      listeners:new Map(),
      children:[],
      textContent:'',
      href:'',
      disabled:false,
      appendChild(child) { this.children.push(child); return child; },
      getAttribute(name) { return this.attributes[name] ?? null; },
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, callback) { this.listeners.set(name, callback); },
      focus() { this.focused = true; }
    }),
    querySelector:selector => {
      const target = /^\[data-calendar-focus-target\]$/.test(selector);
      return [...nodes.values()]
        .flatMap(element => element.children)
        .flatMap(row => row.children || [])
        .flatMap(cell => cell.children || [])
        .find(button => target && button?.attributes['data-calendar-focus-target'] === 'true');
    },
    addEventListener:(name, callback) => documentListeners.set(name, callback)
  };
  const navigator = { serviceWorker:{ register:async file => { registeredWorkers.push(file); } } };
  const location = { protocol:'http:', hostname:'127.0.0.1', href:'' };
  const context = {
    document,
    localStorage:{
      getItem:key => storage.get(key) ?? null,
      setItem:(key, value) => storage.set(key, value)
    },
    navigator,
    location,
    URLSearchParams,
    window:{ DW_YEAR_PLAN:{ year:new Date().getFullYear(), days:365, entries:Array.from({ length:365 }, (_, i) => ({
      refs:['Mark ' + (i + 1)],
      theme:'A theme ' + (i + 1),
      prompt:'A reflection ' + (i + 1)
    })) }, setInterval:() => 0, addEventListener:(name, callback) => windowListeners.set(name, callback) },
    say:message => messages.push(message),
    console,
    Date,
    Math,
    Boolean,
    String,
    Object,
    Number
  };
  runInNewContext(script, context);
  return { nodes, storage, registeredWorkers, messages, windowListeners, documentListeners, location };
}

function currentPlanDay() {
  const now = new Date();
  return Math.min(365, Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(now.getFullYear(), 0, 1)) / 86400000) + 1);
}

test('shows today’s assigned plan reading and opens its study and Bible passage', async () => {
  const { nodes, registeredWorkers } = createDashboard();
  const day = currentPlanDay();
  assert.equal(nodes.get('focusTitle').textContent, 'Mark ' + day);
  assert.equal(nodes.get('focusPrompt').textContent, 'A reflection ' + day);
  assert.equal(nodes.get('focusStudyLink').href, 'study.html?day=' + day);
  assert.equal(nodes.get('todayStudyLink').href, 'study.html?day=' + day);
  assert.equal(nodes.get('focusReferences').children[0].textContent, 'Mark ' + day);
  assert.equal(nodes.get('focusReferences').children[0].href, 'bible.html?ref=Mark+' + day);
  await Promise.resolve();
  assert.deepEqual(registeredWorkers, ['./service-worker.js']);
});

test('reflects completed reading counts and updates today’s check-in', () => {
  const day = currentPlanDay();
  const progress = Object.fromEntries(
    Array.from({ length:Math.min(3, day) }, (_, index) => [day - Math.min(3, day) + index + 1, true])
  );
  const { nodes, storage } = createDashboard(progress);
  const streak = Math.min(3, day);
  const completed = Object.keys(progress).length;
  assert.equal(nodes.get('homeStreak').textContent, String(streak));
  assert.equal(nodes.get('homeDoneCount').textContent, String(completed));
  assert.equal(nodes.get('homeComplete').attributes['aria-pressed'], 'true');

  nodes.get('homeComplete').listeners.get('click')();
  assert.equal(nodes.get('homeComplete').attributes['aria-pressed'], 'false');
  assert.equal(JSON.parse(storage.get('dw-plan-complete'))[day], false);
  assert.equal(nodes.get('homeDoneCount').textContent, String(completed - 1));
});

test('shows the local time, navigates the calendar, and opens the selected reading', () => {
  const { nodes, location } = createDashboard();
  const now = new Date();
  assert.notEqual(nodes.get('localClock').textContent, '');
  assert.match(nodes.get('localClock').attributes['aria-label'], /Local time/);
  assert.ok(nodes.get('calendarMonth').textContent.includes(String(now.getFullYear())));
  assert.equal(nodes.get('readingCalendar').children[0].children.length, 7);

  const todayButton = nodes.get('readingCalendar').children
    .flatMap(row => row.children)
    .map(cell => cell.children[0])
    .find(button => button?.attributes['aria-current'] === 'date');
  assert.ok(todayButton, 'today should appear as an accessible calendar date');
  todayButton.listeners.get('click')();
  assert.match(location.href, /^study\.html\?day=\d+$/);
});

test('month controls update the calendar heading and keep dates inside the reading year', () => {
  const { nodes } = createDashboard();
  const firstHeading = nodes.get('calendarMonth').textContent;
  nodes.get('calendarNext').listeners.get('click')();
  assert.notEqual(nodes.get('calendarMonth').textContent, firstHeading);
  assert.equal(nodes.get('calendarPrevious').disabled, false);

  const shownDate = nodes.get('calendarMonth').textContent;
  while (nodes.get('calendarPrevious').disabled === false) {
    nodes.get('calendarPrevious').listeners.get('click')();
    if (nodes.get('calendarMonth').textContent === firstHeading) break;
    if (nodes.get('calendarMonth').textContent === shownDate) break;
  }
  assert.equal(nodes.get('calendarMonth').textContent, firstHeading);
});
