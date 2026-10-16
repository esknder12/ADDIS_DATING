// In-memory stand-in for `sdk/db`: schema DSL + query builder backed by plain
// JS arrays. Faithful where it matters for the smoke test: column defaults
// (including sql`` timestamp defaults), unique-conflict handling, predicates.

const tables = new Map(); // tableName -> { descriptor, rows }
let autoId = 1;

function cloneDefault(value) {
  if (value && typeof value === 'object' && !value.__sql) {
    return JSON.parse(JSON.stringify(value));
  }
  return value;
}

// --- Schema DSL ---------------------------------------------------------------

function makeColumn() {
  const state = {
    __col: true, table: null, key: null, name: null, defaultValue: undefined,
  };
  let proxy;
  proxy = new Proxy(state, {
    get(target, prop) {
      if (prop === 'default') {
        return (value) => {
          target.defaultValue = value;
          return proxy;
        };
      }
      if (prop in target) return target[prop];
      // primaryKey / notNull / unique / constraint / ... — chainable no-ops.
      return (..._args) => proxy;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  return proxy;
}

function factory() {
  return (sqlName) => {
    const col = makeColumn();
    col.name = sqlName || null;
    return col;
  };
}

export const text = factory();
export const integer = factory();
export const real = factory();
export const float = factory();
export const numeric = factory();
export const blob = factory();
export const boolean = factory();
export const json = factory();

function dummy() {
  return new Proxy({}, { get: () => (..._args) => dummy() });
}

export const index = () => dummy();
export const unique = () => dummy();
export const uniqueIndex = () => dummy();
export const check = () => dummy();
export const primaryKey = () => dummy();

export function sql(parts, ...values) {
  return { __sql: true, parts, values };
}
sql.raw = (value) => ({ __sql: true, raw: value });

const META = Symbol('table-meta');

export function table(name, columns, callback) {
  // Metadata lives under a symbol: a column literally named `name` (users.name)
  // must not clobber the table descriptor's own identity.
  const descriptor = { __table: true, [META]: { name, columns: {}, defaults: {} } };
  const meta = descriptor[META];
  for (const [key, col] of Object.entries(columns)) {
    col.key = key;
    col.table = name;
    if (!col.name) col.name = key;
    meta.columns[key] = col;
    descriptor[key] = col; // users.tgId style access, like the real DSL
    if (col.defaultValue !== undefined) meta.defaults[key] = col.defaultValue;
  }
  if (typeof callback === 'function') {
    const refs = {};
    for (const key of Object.keys(columns)) refs[key] = meta.columns[key];
    callback(refs); // indexes / checks are inert in-memory
  }
  if (!tables.has(name)) tables.set(name, { descriptor, rows: [] });
  return descriptor;
}

// --- Predicates (row => boolean) ------------------------------------------------

const cell = (row, col) => row[col.key];
const num = (value) => (value instanceof Date ? value.getTime() : value);

export const eq = (col, value) => (row) => num(cell(row, col)) === num(value);
export const ne = (col, value) => (row) => num(cell(row, col)) !== num(value);
export const gt = (col, value) => (row) => num(cell(row, col)) > num(value);
export const gte = (col, value) => (row) => num(cell(row, col)) >= num(value);
export const lt = (col, value) => (row) => num(cell(row, col)) < num(value);
export const lte = (col, value) => (row) => num(cell(row, col)) <= num(value);
export const isNull = (col) => (row) => cell(row, col) == null;
export const isNotNull = (col) => (row) => cell(row, col) != null;
export const and = (...preds) => (row) => preds.every((p) => p(row));
export const or = (...preds) => (row) => preds.some((p) => p(row));
export const not = (pred) => (row) => !pred(row);
export const inArray = (col, values) => (row) => values.map(num).includes(num(cell(row, col)));
export const notInArray = (col, values) => (row) => !values.map(num).includes(num(cell(row, col)));

function unsupported(name) {
  return () => {
    throw new Error(`${name}() is not supported by the smoke-test shim`);
  };
}
export const like = unsupported('like');
export const notLike = unsupported('notLike');
export const between = unsupported('between');
export const notBetween = unsupported('notBetween');
export const count = unsupported('count');
export const sum = unsupported('sum');
export const avg = unsupported('avg');
export const min = unsupported('min');
export const max = unsupported('max');
export const asc = unsupported('asc');
export const desc = unsupported('desc');

// --- Query builder --------------------------------------------------------------

function rowsOf(t) {
  const entry = tables.get(t[META].name);
  if (!entry) throw new Error(`smoke shim: unknown table "${t[META].name}"`);
  return entry.rows;
}

function applyDefaults(t, values) {
  const out = { ...values };
  for (const [key, def] of Object.entries(t[META].defaults)) {
    if (out[key] === undefined) {
      out[key] = def && def.__sql ? new Date() : cloneDefault(def);
    }
  }
  if ('id' in t[META].columns && out.id === undefined) out.id = autoId++;
  return out;
}

function findConflict(t, target, values) {
  const keys = Array.isArray(target) ? target : [target];
  return rowsOf(t).find((row) => keys.every((k) => num(row[k.key]) === num(values[k.key])));
}

class SelectBuilder {
  constructor(t) {
    this.t = t;
    this.pred = null;
    this._limit = null;
    this._offset = 0;
  }

  where(...preds) {
    const next = preds.length === 1 ? preds[0] : and(...preds);
    this.pred = this.pred ? and(this.pred, next) : next;
    return this;
  }

  orderBy() { return this; }
  groupBy() { return this; }
  having() { return this; }
  distinct() { return this; }
  limit(n) { this._limit = n; return this; }
  offset(n) { this._offset = n; return this; }

  runList() {
    let rows = rowsOf(this.t).filter((row) => (this.pred ? this.pred(row) : true));
    if (this._offset) rows = rows.slice(this._offset);
    if (this._limit != null) rows = rows.slice(0, this._limit);
    return rows.map((row) => ({ ...row }));
  }

  async all() { return this.runList(); }
  async get() { return this.runList()[0] ?? null; }
  async values() { return this.runList().map((row) => Object.values(row)); }
  then(resolve, reject) { return this.all().then(resolve, reject); }
}

class InsertBuilder {
  constructor(t) {
    this.t = t;
    this._values = [];
    this._onConflict = null;
    this._returning = false;
  }

  values(v) {
    this._values = Array.isArray(v) ? v : [v];
    return this;
  }

  onConflictDoNothing(opt = {}) {
    this._onConflict = { mode: 'nothing', target: opt.target || null };
    return this;
  }

  onConflictDoUpdate({ target, set }) {
    this._onConflict = { mode: 'update', target, set };
    return this;
  }

  returning() {
    this._returning = true;
    return this;
  }

  async run() {
    const inserted = [];
    let affected = 0;
    for (const v of this._values) {
      const conflict = this._onConflict?.target
        ? findConflict(this.t, this._onConflict.target, v)
        : null;
      if (conflict && this._onConflict.mode === 'nothing') continue;
      if (conflict && this._onConflict.mode === 'update') {
        Object.assign(conflict, this._onConflict.set);
        affected += 1;
        continue;
      }
      const row = applyDefaults(this.t, v);
      rowsOf(this.t).push(row);
      inserted.push(row);
      affected += 1;
    }
    if (this._returning) return inserted.map((row) => ({ ...row }));
    return {
      rowsAffected: affected,
      lastInsertRowid: inserted.length > 0 ? (inserted[inserted.length - 1].id ?? 0) : 0,
      rows: [],
    };
  }

  then(resolve, reject) { return this.run().then(resolve, reject); }
}

class UpdateBuilder {
  constructor(t) {
    this.t = t;
    this._set = null;
    this.pred = null;
  }

  set(values) {
    this._set = values;
    return this;
  }

  where(...preds) {
    const next = preds.length === 1 ? preds[0] : and(...preds);
    this.pred = this.pred ? and(this.pred, next) : next;
    return this;
  }

  async run() {
    if (!this._set) throw new Error('smoke shim: .set() is required for update');
    let affected = 0;
    for (const row of rowsOf(this.t)) {
      if (!this.pred || this.pred(row)) {
        Object.assign(row, this._set);
        affected += 1;
      }
    }
    return { rowsAffected: affected, lastInsertRowid: 0, rows: [] };
  }

  then(resolve, reject) { return this.run().then(resolve, reject); }
}

class DeleteBuilder {
  constructor(t) {
    this.t = t;
    this.pred = null;
  }

  where(...preds) {
    const next = preds.length === 1 ? preds[0] : and(...preds);
    this.pred = this.pred ? and(this.pred, next) : next;
    return this;
  }

  async run() {
    const rows = rowsOf(this.t);
    const before = rows.length;
    const kept = rows.filter((row) => !(this.pred ? this.pred(row) : true));
    rows.length = 0;
    rows.push(...kept);
    return { rowsAffected: before - kept.length, lastInsertRowid: 0, rows: [] };
  }

  then(resolve, reject) { return this.run().then(resolve, reject); }
}

function rawUnsupported(name) {
  return async () => {
    throw new Error(`db.${name} (raw SQL) is not supported by the smoke-test shim`);
  };
}

export const db = {
  select() { return { from: (t) => new SelectBuilder(t) }; },
  insert(t) { return new InsertBuilder(t); },
  update(t) { return new UpdateBuilder(t); },
  delete(t) { return new DeleteBuilder(t); },
  async $count(t, where) {
    const rows = rowsOf(t);
    return where ? rows.filter(where).length : rows.length;
  },
  run: rawUnsupported('run'),
  all: rawUnsupported('all'),
  get: rawUnsupported('get'),
  values: rawUnsupported('values'),
  // Test-only helper: wipe all rows between scenarios.
  __reset() {
    for (const entry of tables.values()) entry.rows.length = 0;
    autoId = 1;
  },
};

export default db;
