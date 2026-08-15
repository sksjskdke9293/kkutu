const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { once } = require('events');
const { Client } = require('./Server/lib/node_modules/pg');
const copyFrom = require('./Server/lib/node_modules/pg-copy-streams').from;

async function importDump(db) {
  const input = readline.createInterface({
    input: fs.createReadStream(path.join(__dirname, 'db.sql'), { encoding: 'utf8' }),
    crlfDelay: Infinity
  });
  let sql = [];
  let copy = null;

  function shouldSkip(line) {
    return /^ALTER (TABLE|SEQUENCE) .* OWNER TO /i.test(line) ||
      /^CREATE EXTENSION /i.test(line) ||
      /^COMMENT ON EXTENSION /i.test(line);
  }

  async function flushSql() {
    const statement = sql.join('\n').trim();
    sql = [];
    if (statement) await db.query(statement);
  }
  async function finishCopy() {
    copy.end();
    await once(copy, 'finish');
    copy = null;
  }

  for await (const line of input) {
    if (copy) {
      if (line === '\\.') {
        await finishCopy();
      } else {
        if (!copy.write(line + '\n')) await once(copy, 'drain');
      }
      continue;
    }
    const match = line.match(/^COPY\s+([^ ]+)\s+\((.+)\)\s+FROM stdin;$/);
    if (match) {
      await flushSql();
      copy = db.query(copyFrom(`COPY ${match[1]} (${match[2]}) FROM STDIN`));
    } else if (!shouldSkip(line)) {
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
    // A failed first import can leave a partial schema. This only runs before
    // the users table exists, so an initialized database is never reset.
    await db.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    await importDump(db);
  } else {
    console.log('Database schema already exists; skipping seed import.');
  }
  await db.query(`INSERT INTO kkutu_ko (_id, type, mean, hit, flag, theme)
    VALUES ('역스윕', '1', '불리한 상황을 뒤집어 연속으로 승리하는 일.', 0, 0, '게임'),
           ('윕쌀', '1', '끄투 사용자 추가 단어.', 0, 0, '기타')
    ON CONFLICT (_id) DO UPDATE SET type = EXCLUDED.type, mean = EXCLUDED.mean, theme = EXCLUDED.theme`);
  console.log('Custom words are ready: 역스윕, 윕쌀');
  await db.end();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
