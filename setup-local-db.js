const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Client } = require('./Server/lib/node_modules/pg');
const { upsertModernWords } = require('./modern-words');

const connection = { host: '127.0.0.1', port: 55432, user: 'postgres', password: 'kkutu-local' };
const decode = value => value === '\\N' ? null : value.replace(/\\([btnrfv\\])/g, (_, c) => ({ b: '\b', t: '\t', n: '\n', r: '\r', f: '\f', v: '\v', '\\': '\\' })[c]);

async function importDump(db) {
  const input = readline.createInterface({ input: fs.createReadStream(path.join(__dirname, 'db.sql'), { encoding: 'utf8' }), crlfDelay: Infinity });
  let sql = [];
  let copy = null;
  let rows = [];

  const flushSql = async () => {
    const statement = sql.join('\n').trim();
    sql = [];
    if (statement) await db.query(statement);
  };
  const flushRows = async () => {
    if (!rows.length) return;
    const values = [];
    const tuples = rows.map(row => `(${row.map(value => { values.push(value); return '$' + values.length; }).join(',')})`);
    await db.query(`INSERT INTO ${copy.table} (${copy.columns}) VALUES ${tuples.join(',')}`, values);
    rows = [];
  };

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
  const marker = path.join(__dirname, 'runtime', 'db-ready');
  const initialized = fs.existsSync(marker);
  const admin = new Client({ ...connection, database: 'postgres' });
  await admin.connect();
  const found = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'main'");
  if (!found.rowCount) await admin.query('CREATE DATABASE main');
  await admin.end();

  let db = new Client({ ...connection, database: 'main' });
  await db.connect();
  if (!initialized) {
    await db.end();
    const reset = new Client({ ...connection, database: 'postgres' });
    await reset.connect();
    await reset.query('DROP DATABASE main WITH (FORCE)');
    await reset.query('CREATE DATABASE main');
    await reset.end();
    db = new Client({ ...connection, database: 'main' });
    await db.connect();
    console.log('Importing bundled word data (first launch only)...');
    await importDump(db);
    fs.writeFileSync(marker, 'ok\n');
  }
  await upsertModernWords(db);
  await db.end();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
