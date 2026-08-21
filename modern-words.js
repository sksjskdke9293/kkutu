const words = require('./modern-words.json');

function validateWords(source = words) {
  const unique = [...new Set(source.map(word => String(word).trim()))];
  const invalid = unique.filter(word => !/^[가-힣]{2,}$/.test(word));
  if (invalid.length) throw new Error(`Invalid modern Korean words: ${invalid.join(', ')}`);
  return unique;
}

async function upsertModernWords(db) {
  const entries = validateWords();
  const batchSize = 100;
  for (let offset = 0; offset < entries.length; offset += batchSize) {
    const batch = entries.slice(offset, offset + batchSize);
    const values = [];
    const tuples = batch.map(word => {
      values.push(word, '1', '현대 생활과 사회에서 널리 쓰이는 말.', 0, 0, '현대');
      const start = values.length - 5;
      return `($${start}, $${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5})`;
    });
    await db.query(`INSERT INTO kkutu_ko (_id, type, mean, hit, flag, theme) VALUES ${tuples.join(',')}
      ON CONFLICT (_id) DO NOTHING`, values);
  }
  console.log(`Modern Korean supplement is ready: ${entries.length} words.`);
  return entries.length;
}

module.exports = { validateWords, upsertModernWords };
