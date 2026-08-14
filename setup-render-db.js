const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Client } = require('./Server/lib/node_modules/pg');

const decode = value => value === '\\N' ? null : value.replace(/\\([btnrfv\\])/g, (_, c) => ({
  b: '\b', t: '\t', n: '\n', r: '\r', f: '\f', v: '\v', '\\': '\\'
})[c]);

async function importDump(db) {
  const input = readline.createInterface({
    input: fs.createReadStream(path.join(__dirname, 'db.sql'), { encoding: 'utf8' }),
    crlfDelay: Infinity
  });
  let sql = [];
  let copy = null;
  let rows = [];

  async function flushSql() {
    const statement = sql.join('\n').trim();
    sql = [];
    if (statement) await db.query(statement);
  }
  async function flushRows() {
    if (!rows.length) return;
    const values = [];
    const tuples = rows.map(row => '(' + row.map(value => {
      values.push(value);
      return '$' + values.length;
    }).join(',') + ')');
    await db.query(`INSERT INTO ${copy.table} (${copy.columns}) VALUES ${tuples.join(',')}`, values);
    rows = [];
  }

  for await (const line of input) {
    if (copy) {
      if (line === '\\.') {
        await flushRows();
        copy = null;
      } else {
        rows.push(line.split('\t').map(decode));
        if (rows.length >= 500) await flushRows();
      }
      continue;
    }
    const match = line.match(/^COPY\s+([^ ]+)\s+\((.+)\)\s+FROM stdin;$/);
    if (match) {
      await flushSql();
      copy = { table: match[1], columns: match[2] };
    } else {
      sql.push(line);
    }
  }
  await flushSql();
}

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
  });
  await db.connect();
  const existing = await db.query("SELECT to_regclass('public.users') AS users");
  if (!existing.rows[0].users) {
    console.log('Importing bundled KKuTu database (first deploy only)...');
    await importDump(db);
  } else {
    console.log('Database schema already exists; skipping seed import.');
  }
  await db.end();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
