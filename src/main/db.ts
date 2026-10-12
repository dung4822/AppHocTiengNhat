import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { CONTENT_DIR, DATA_DIR, DB_PATH, ensureDir } from './services/paths'

export type DB = Database.Database
let db: DB

export function getDb(): DB {
  return db
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS vocab (
  id INTEGER PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  word TEXT NOT NULL, reading TEXT NOT NULL,
  level INTEGER, rank INTEGER,
  vi TEXT, note TEXT, en TEXT, pos TEXT, pitch TEXT, kanji TEXT, furi TEXT,
  ex TEXT, ex_vi TEXT, ex_furi TEXT, audio TEXT, ex_audio TEXT,
  custom INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS vocab_word ON vocab(word);
CREATE INDEX IF NOT EXISTS vocab_reading ON vocab(reading);

CREATE TABLE IF NOT EXISTS kanji (
  char TEXT PRIMARY KEY, hv TEXT, vi TEXT, mn TEXT, en TEXT,
  on_r TEXT, kun_r TEXT, strokes INTEGER, level INTEGER
);

CREATE TABLE IF NOT EXISTS grammar (
  id INTEGER PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  level INTEGER, rank INTEGER, pattern TEXT, meaning TEXT, structure TEXT, explain TEXT, examples TEXT
);

CREATE TABLE IF NOT EXISTS dict (
  id INTEGER PRIMARY KEY, word TEXT, reading TEXT, en TEXT, common INTEGER
);
CREATE INDEX IF NOT EXISTS dict_word ON dict(word);
CREATE INDEX IF NOT EXISTS dict_reading ON dict(reading);

-- Thẻ ôn tập (giống bảng cards của Anki). deck: vocab | grammar; ord: 0 = nhận diện, 1 = nghe
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  deck TEXT NOT NULL, note_id INTEGER NOT NULL, ord INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  due INTEGER NOT NULL DEFAULT 0,
  stability REAL DEFAULT 0, difficulty REAL DEFAULT 0,
  elapsed_days INTEGER DEFAULT 0, scheduled_days INTEGER DEFAULT 0,
  learning_steps INTEGER DEFAULT 0, reps INTEGER DEFAULT 0, lapses INTEGER DEFAULT 0,
  state INTEGER DEFAULT 0, last_review INTEGER,
  queue INTEGER DEFAULT 0,          -- 0 bình thường, -1 tạm ngưng, -2 bị hoãn (bury)
  buried_day INTEGER DEFAULT 0,
  leech INTEGER DEFAULT 0,
  UNIQUE(deck, note_id, ord)
);
CREATE INDEX IF NOT EXISTS cards_due ON cards(deck, state, due);
CREATE INDEX IF NOT EXISTS cards_pos ON cards(deck, state, position);

CREATE TABLE IF NOT EXISTS revlog (
  id INTEGER PRIMARY KEY,           -- thời điểm ôn (ms)
  card_id INTEGER NOT NULL,
  rating INTEGER, state INTEGER, due INTEGER,
  stability REAL, difficulty REAL,
  elapsed_days INTEGER, last_elapsed_days INTEGER, scheduled_days INTEGER, learning_steps INTEGER,
  duration_ms INTEGER, day INTEGER
);
CREATE INDEX IF NOT EXISTS revlog_card ON revlog(card_id);
CREATE INDEX IF NOT EXISTS revlog_day ON revlog(day);

CREATE TABLE IF NOT EXISTS study_log (day INTEGER, module TEXT, seconds INTEGER, PRIMARY KEY(day, module));

CREATE TABLE IF NOT EXISTS passages (
  id INTEGER PRIMARY KEY, kind TEXT, title TEXT, level INTEGER, data TEXT,
  created INTEGER, done_count INTEGER DEFAULT 0, last_opened INTEGER
);

CREATE TABLE IF NOT EXISTS jlpt_results (
  id INTEGER PRIMARY KEY, ts INTEGER, day INTEGER, kind TEXT, total INTEGER, correct INTEGER, detail TEXT
);

CREATE TABLE IF NOT EXISTS ai_cache (key TEXT PRIMARY KEY, value TEXT, created INTEGER);
`

export function openDb(): DB {
  ensureDir(DATA_DIR)
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}

export function getMeta(key: string): string | undefined {
  return (db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined)?.value
}
export function setMeta(key: string, value: string) {
  db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

const readJson = (name: string) => JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, name), 'utf8'))

/**
 * Nạp nội dung từ data/content vào DB khi có phiên bản mới.
 * Chỉ cập nhật trường nội dung, KHÔNG đụng tiến độ học (bảng cards/revlog).
 */
export function importContent(): { imported: boolean; version?: string } {
  const manifestPath = path.join(CONTENT_DIR, 'manifest.json')
  if (!fs.existsSync(manifestPath)) return { imported: false }
  const manifest = readJson('manifest.json')
  const version = String(manifest.version)
  if (getMeta('content_version') === version) return { imported: false, version }

  const vocab = readJson('vocab.json') as any[]
  const kanji = readJson('kanji.json') as any[]
  const grammar = readJson('grammar.json') as any[]
  const dictFile = path.join(CONTENT_DIR, 'dict.json')
  const dict = fs.existsSync(dictFile) ? (readJson('dict.json') as any[]) : []

  const upV = db.prepare(`
    INSERT INTO vocab(key, word, reading, level, rank, vi, note, en, pos, pitch, kanji, furi, ex, ex_vi, ex_furi, audio, ex_audio)
    VALUES(@key, @word, @reading, @level, @rank, @vi, @note, @en, @pos, @pitch, @kanji, @furi, @ex, @exVi, @exFuri, @audio, @exAudio)
    ON CONFLICT(key) DO UPDATE SET word=excluded.word, reading=excluded.reading, level=excluded.level, rank=excluded.rank,
      vi=excluded.vi, note=excluded.note, en=excluded.en, pos=excluded.pos, pitch=excluded.pitch, kanji=excluded.kanji,
      furi=excluded.furi, ex=excluded.ex, ex_vi=excluded.ex_vi, ex_furi=excluded.ex_furi, audio=excluded.audio, ex_audio=excluded.ex_audio`)
  const upK = db.prepare(`
    INSERT INTO kanji(char, hv, vi, mn, en, on_r, kun_r, strokes, level)
    VALUES(@char, @hv, @vi, @mn, @en, @on, @kun, @strokes, @level)
    ON CONFLICT(char) DO UPDATE SET hv=excluded.hv, vi=excluded.vi, mn=excluded.mn, en=excluded.en,
      on_r=excluded.on_r, kun_r=excluded.kun_r, strokes=excluded.strokes, level=excluded.level`)
  const upG = db.prepare(`
    INSERT INTO grammar(key, level, rank, pattern, meaning, structure, explain, examples)
    VALUES(@key, @level, @rank, @pattern, @meaning, @structure, @explain, @examples)
    ON CONFLICT(key) DO UPDATE SET level=excluded.level, rank=excluded.rank, pattern=excluded.pattern, meaning=excluded.meaning,
      structure=excluded.structure, explain=excluded.explain, examples=excluded.examples`)

  const tx = db.transaction(() => {
    for (const v of vocab)
      upV.run({
        ...v,
        en: JSON.stringify(v.en),
        pos: JSON.stringify(v.pos),
        pitch: JSON.stringify(v.pitch),
        kanji: JSON.stringify(v.kanji),
        furi: JSON.stringify(v.furi),
        exFuri: JSON.stringify(v.exFuri)
      })
    for (const k of kanji) upK.run({ ...k, en: JSON.stringify(k.en), on: JSON.stringify(k.on), kun: JSON.stringify(k.kun) })
    for (const g of grammar) upG.run({ ...g, examples: JSON.stringify(g.examples) })
    if (dict.length) {
      db.prepare('DELETE FROM dict').run()
      const ins = db.prepare('INSERT INTO dict(word, reading, en, common) VALUES(?, ?, ?, ?)')
      for (const d of dict) ins.run(d.w, d.r, d.e, d.c ? 1 : 0)
    }
    ensureCards()
    setMeta('content_version', version)
  })
  tx()
  return { imported: true, version }
}

/**
 * Tạo thẻ cho các ghi chú chưa có thẻ.
 * Thứ tự học (position): N5 → N4 → N3, trong mỗi cấp theo rank.
 * Thẻ nghe (ord 1) có cùng position, chỉ được mở khi thẻ nhận diện đã qua giai đoạn learning.
 */
export function ensureCards() {
  db.exec(`
    INSERT OR IGNORE INTO cards(deck, note_id, ord, position)
      SELECT 'vocab', id, 0, (5 - level) * 100000 + rank * 10 FROM vocab;
    INSERT OR IGNORE INTO cards(deck, note_id, ord, position)
      SELECT 'vocab', id, 1, (5 - level) * 100000 + rank * 10 + 1 FROM vocab;
    INSERT OR IGNORE INTO cards(deck, note_id, ord, position)
      SELECT 'grammar', id, 0, (5 - level) * 100000 + rank * 10 FROM grammar;
  `)
}
