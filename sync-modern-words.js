const { Client } = require('./Server/lib/node_modules/pg');
const { upsertModernWords } = require('./modern-words');

(async () => {
  const remote = process.env.DATABASE_URL;
  const db = new Client(remote ? {
    connectionString: remote,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
  } : {
    host: '127.0.0.1', port: 55432, user: 'postgres', password: 'kkutu-local', database: 'main'
  });
  await db.connect();
  await upsertModernWords(db);
  await db.end();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
