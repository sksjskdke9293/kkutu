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
  await db.query(`INSERT INTO kkutu_ko (_id, type, mean, hit, flag, theme) VALUES
    ('인공지능', '1', '컴퓨터가 사람의 지능적인 행동을 모방하도록 만드는 기술.', 0, 0, '현대'),
    ('생성형인공지능', '1', '학습한 자료를 바탕으로 글이나 그림 같은 새로운 결과물을 만드는 인공지능.', 0, 0, '현대'),
    ('딥페이크', '1', '인공지능으로 영상이나 음성을 실제처럼 합성하는 기술 또는 그 결과물.', 0, 0, '현대'),
    ('메타버스', '1', '현실과 가상 공간이 결합된 디지털 환경.', 0, 0, '현대'),
    ('빅데이터', '1', '기존 방식으로 처리하기 어려울 만큼 규모가 크고 다양한 자료.', 0, 0, '현대'),
    ('사물인터넷', '1', '사물들이 통신망으로 정보를 주고받는 기술.', 0, 0, '현대'),
    ('블록체인', '1', '거래 정보를 여러 컴퓨터에 분산하여 기록하는 기술.', 0, 0, '현대'),
    ('자율주행', '1', '차량이 운전자의 조작 없이 주변을 인식하여 스스로 주행하는 일.', 0, 0, '현대'),
    ('탄소중립', '1', '배출한 탄소와 흡수하거나 제거한 탄소의 양을 같게 만드는 일.', 0, 0, '현대'),
    ('기후위기', '1', '기후 변화가 생태계와 사회에 심각한 영향을 주는 상태.', 0, 0, '현대'),
    ('비대면', '1', '사람이 서로 직접 마주하지 않는 방식.', 0, 0, '현대'),
    ('재택근무', '1', '직장에 출근하지 않고 집에서 하는 근무.', 0, 0, '현대'),
    ('원격수업', '1', '통신망을 이용하여 서로 떨어진 곳에서 진행하는 수업.', 0, 0, '현대'),
    ('숏폼', '1', '짧은 길이로 제작한 영상 형식의 콘텐츠.', 0, 0, '현대'),
    ('웹툰', '1', '인터넷을 통하여 연재하거나 공개하는 만화.', 0, 0, '현대'),
    ('웹소설', '1', '인터넷에서 연재하거나 공개하는 소설.', 0, 0, '현대'),
    ('이모티콘', '1', '감정이나 뜻을 나타내기 위해 사용하는 그림이나 기호.', 0, 0, '현대'),
    ('누리소통망', '1', '인터넷에서 사람들과 관계를 맺고 정보를 나누는 서비스.', 0, 0, '현대'),
    ('일인미디어', '1', '개인이 직접 콘텐츠를 만들어 전달하는 매체.', 0, 0, '현대'),
    ('스트리밍', '1', '자료를 내려받는 동시에 재생하는 전송 방식.', 0, 0, '현대'),
    ('구독경제', '1', '일정한 금액을 정기적으로 내고 상품이나 서비스를 이용하는 경제 방식.', 0, 0, '현대')
    ON CONFLICT (_id) DO UPDATE SET type = EXCLUDED.type, mean = EXCLUDED.mean, theme = EXCLUDED.theme`);
  console.log('Modern Korean supplement is ready.');
  await db.end();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
