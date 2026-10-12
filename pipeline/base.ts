/**
 * Bước 1: dựng dữ liệu nền (không tốn tiền API).
 * - Danh sách từ JLPT N5/N4/N3 (open-anki-jlpt-decks, dựa trên danh sách tanos)
 * - Đối chiếu JMdict để lấy nghĩa tiếng Anh, từ loại
 * - Pitch accent từ Kanjium
 * - Kanji: KANJIDIC2 + âm Hán Việt từ Unihan (kVietnamese, có xét biến thể chữ)
 * Kết quả: data/content/base-vocab.json, base-kanji.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { CONTENT_DIR, RAW_DIR, ensureDir } from '../src/main/services/paths'
import { hasKanji, kataToHira } from '../src/main/services/furigana'

export interface BaseVocab {
  key: string
  word: string
  reading: string
  level: number // 5,4,3
  rank: number // thứ tự học trong cấp độ
  en: string[]
  pos: string[]
  pitch: number[] | null
  kanji: string[]
}

export interface BaseKanji {
  char: string
  hvCandidates: string[]
  en: string[]
  on: string[]
  kun: string[]
  strokes: number
  freq: number | null
  jlptOld: number | null
  level: number // cấp JLPT mới mà kanji xuất hiện sớm nhất trong từ vựng
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = '' }
    else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}

function kanjiOf(s: string): string[] {
  return [...new Set([...s].filter((c) => hasKanji(c) && c !== '々'))]
}

function main() {
  ensureDir(CONTENT_DIR)

  // ---------- JMdict ----------
  console.log('Đọc JMdict...')
  const jm = JSON.parse(fs.readFileSync(path.join(RAW_DIR, 'jmdict-eng-3.6.2.json'), 'utf8'))
  const byText = new Map<string, any[]>()
  for (const w of jm.words) {
    for (const k of w.kanji) (byText.get(k.text) ?? byText.set(k.text, []).get(k.text)!).push(w)
    for (const k of w.kana) (byText.get(k.text) ?? byText.set(k.text, []).get(k.text)!).push(w)
  }
  const isCommon = (w: any) => w.kanji.some((k: any) => k.common) || w.kana.some((k: any) => k.common)
  function findEntry(word: string, reading: string) {
    const cands = byText.get(word) ?? []
    const hira = kataToHira(reading)
    let best = cands.filter((w) => w.kana.some((k: any) => kataToHira(k.text) === hira))
    if (!best.length) best = cands
    best.sort((a, b) => Number(isCommon(b)) - Number(isCommon(a)))
    return best[0]
  }

  // ---------- Pitch accent (Kanjium) ----------
  const accents = new Map<string, number[]>()
  for (const line of fs.readFileSync(path.join(RAW_DIR, 'accents.txt'), 'utf8').split('\n')) {
    const [w, r, a] = line.trim().split('\t')
    if (!w || !a) continue
    const nums = a.split(',').map((x) => parseInt(x.replace(/\D/g, ''), 10)).filter((n) => !isNaN(n))
    accents.set(`${w}|${kataToHira(r || w)}`, nums)
  }

  // ---------- Danh sách JLPT ----------
  const seen = new Map<string, BaseVocab>()
  for (const level of [5, 4, 3]) {
    const rows = parseCSV(fs.readFileSync(path.join(RAW_DIR, `jlpt-n${level}.csv`), 'utf8')).slice(1)
    for (const r of rows) {
      let [expr, reading] = r
      if (!expr) continue
      expr = expr.split(/[;；、]/)[0].trim().replace(/^[～〜~]/, '')
      reading = (reading || expr).split(/[;；、]/)[0].trim().replace(/^[～〜~]/, '')
      const key = `${expr}|${kataToHira(reading)}`
      if (seen.has(key)) continue
      const e = findEntry(expr, reading)
      const en: string[] = []
      const pos: string[] = []
      if (e) {
        for (const s of e.sense.slice(0, 3)) {
          en.push(s.gloss.slice(0, 3).map((g: any) => g.text).join(', '))
          for (const p of s.partOfSpeech) if (!pos.includes(p)) pos.push(p)
        }
      } else en.push(r[2])
      seen.set(key, {
        key,
        word: expr,
        reading: kataToHira(reading) === reading ? reading : reading,
        level,
        rank: 0,
        en,
        pos,
        pitch: accents.get(`${expr}|${kataToHira(reading)}`) ?? accents.get(`${reading}|${kataToHira(reading)}`) ?? null,
        kanji: kanjiOf(expr)
      })
    }
  }
  const vocab = [...seen.values()]

  // ---------- KANJIDIC2 + Unihan ----------
  console.log('Đọc KANJIDIC2 & Unihan...')
  const kd = JSON.parse(fs.readFileSync(path.join(RAW_DIR, 'kanjidic2-en-3.6.2.json'), 'utf8'))
  const kdMap = new Map<string, any>(kd.characters.map((c: any) => [c.literal, c]))

  const viet = new Map<string, string[]>()
  for (const line of fs.readFileSync(path.join(RAW_DIR, 'unihan', 'Unihan_Readings.txt'), 'utf8').split('\n')) {
    const m = line.match(/^U\+([0-9A-F]+)\tkVietnamese\t(.+)$/)
    if (m) viet.set(String.fromCodePoint(parseInt(m[1], 16)), m[2].trim().split(/\s+/))
  }
  const variants = new Map<string, string[]>()
  for (const line of fs.readFileSync(path.join(RAW_DIR, 'unihan', 'Unihan_Variants.txt'), 'utf8').split('\n')) {
    const m = line.match(/^U\+([0-9A-F]+)\tk(Traditional|Semantic|Z|Simplified|SpecializedSemantic)Variant\t(.+)$/)
    if (!m) continue
    const ch = String.fromCodePoint(parseInt(m[1], 16))
    const vs = [...m[3].matchAll(/U\+([0-9A-F]+)/g)].map((x) => String.fromCodePoint(parseInt(x[1], 16)))
    variants.set(ch, [...(variants.get(ch) ?? []), ...vs])
  }
  // Một số chữ Nhật (新字体) không có liên kết biến thể trong Unihan
  // Cặp 新字体→旧字体 (chữ Nhật giản lược → chữ phồn thể có âm Hán Việt)
  const shinjitai: Record<string, string> = Object.fromEntries(
    '経經 済濟 気氣 広廣 売賣 読讀 続續 図圖 楽樂 薬藥 発發 駅驛 験驗 険險 歩步 戦戰 単單 変變 辺邊 写寫 様樣 黒黑 円圓 区區 国國 学學 会會 来來 帰歸 転轉 伝傳 両兩 満滿 処處 検檢 権權 歳歲 鉄鐵 浅淺 残殘 銭錢 践踐 桜櫻 雑雜 数數 声聲 実實 県縣 関關 覚覺 営營 栄榮 労勞 応應 恋戀 湾灣 拡擴 囲圍 医醫 芸藝 頼賴 沢澤 択擇 訳譯 駆驅 譲讓 壊壞 懐懷 寝寢 巣巢 隠隱 穏穩 弾彈 静靜 争爭 浄淨 縦縱 従從 将將 奨獎 蔵藏 臓臟 対對 体體 台臺 担擔 胆膽 断斷 点點 当當 党黨 灯燈 闘鬭 徳德 独獨 届屆 悩惱 脳腦 廃廢 拝拜 麦麥 髪髮 抜拔 浜濱 払拂 並竝 宝寶 豊豐 翻飜 予豫 余餘 与與 揺搖 謡謠 乱亂 覧覽 竜龍 涙淚 塁壘 励勵 礼禮 霊靈 齢齡 炉爐 湿濕 児兒 辞辭 舎舍 釈釋 寿壽 収收 渋澁 獣獸 粛肅 焼燒 証證 乗乘 剰剩 畳疊 条條 状狀 嬢孃 触觸 真眞 粋粹 酔醉 随隨 髄髓 枢樞 摂攝 窃竊 専專 潜潛 繊纖 禅禪 双雙 壮壯 捜搜 挿插 総總 騒騷 増增 属屬 堕墮 滞滯 遅遲 昼晝 鋳鑄 聴聽 鎮鎭 逓遞 稲稻 弐貳 悪惡 圧壓 為爲 衛衞 塩鹽 奥奧 欧歐 殴毆 価價 仮假 画畫 絵繪 殻殼 岳嶽 勧勸 巻卷 陥陷 歓歡 観觀 戯戲 犠犧 旧舊 拠據 挙擧 峡峽 狭狹 暁曉 勲勳 径徑 茎莖 恵惠 掲揭 渓溪 継繼 軽輕 鶏鷄 欠缺 剣劍 献獻 顕顯 効效 恒恆 黄黃 号號 斎齋 剤劑 参參 蚕蠶 惨慘 糸絲 歯齒 亜亞'.split(' ').map((p) => [...p])
  )
  function hvOf(ch: string): string[] {
    if (viet.has(ch)) return viet.get(ch)!
    const alts = [shinjitai[ch], ...(variants.get(ch) ?? [])].filter(Boolean)
    for (const a of alts) if (viet.has(a)) return viet.get(a)!
    return []
  }

  const kanjiLevel = new Map<string, number>()
  for (const v of vocab) for (const k of v.kanji) if (!kanjiLevel.has(k) || kanjiLevel.get(k)! < v.level) kanjiLevel.set(k, v.level)
  const kanji: BaseKanji[] = []
  for (const [ch, level] of kanjiLevel) {
    const c = kdMap.get(ch)
    const groups = c?.readingMeaning?.groups ?? []
    const readings = groups.flatMap((g: any) => g.readings)
    const meanings = groups.flatMap((g: any) => g.meanings).filter((m: any) => m.lang === 'en').map((m: any) => m.value)
    kanji.push({
      char: ch,
      hvCandidates: hvOf(ch),
      en: meanings.slice(0, 5),
      on: readings.filter((r: any) => r.type === 'ja_on').map((r: any) => r.value),
      kun: readings.filter((r: any) => r.type === 'ja_kun').map((r: any) => r.value),
      strokes: c?.misc?.strokeCounts?.[0] ?? 0,
      freq: c?.misc?.frequency ?? null,
      jlptOld: c?.misc?.jlptLevel ?? null,
      level
    })
  }

  // ---------- Thứ tự học trong mỗi cấp ----------
  // Ưu tiên: từ "common" trong JMdict, kanji phổ biến (tần suất báo chí KANJIDIC2), từ ngắn.
  const kFreq = new Map(kanji.map((k) => [k.char, k.freq ?? 2500]))
  const score = (v: BaseVocab) => {
    const e = findEntry(v.word, v.reading)
    const common = e && isCommon(e) ? 0 : 1500
    const kf = v.kanji.length ? Math.max(...v.kanji.map((k) => kFreq.get(k) ?? 2500)) : 400
    return common + kf + v.word.length * 20
  }
  for (const level of [5, 4, 3]) {
    const lv = vocab.filter((v) => v.level === level).sort((a, b) => score(a) - score(b))
    lv.forEach((v, i) => (v.rank = i + 1))
  }
  vocab.sort((a, b) => b.level - a.level || a.rank - b.rank)

  fs.writeFileSync(path.join(CONTENT_DIR, 'base-vocab.json'), JSON.stringify(vocab, null, 1))
  fs.writeFileSync(path.join(CONTENT_DIR, 'base-kanji.json'), JSON.stringify(kanji, null, 1))
  const noHv = kanji.filter((k) => !k.hvCandidates.length).map((k) => k.char)
  console.log(`Từ vựng: ${vocab.length} (N5 ${vocab.filter((v) => v.level === 5).length}, N4 ${vocab.filter((v) => v.level === 4).length}, N3 ${vocab.filter((v) => v.level === 3).length})`)
  console.log(`Kanji: ${kanji.length}, thiếu Hán Việt: ${noHv.length} ${noHv.join('')}`)
  console.log(`Có pitch accent: ${vocab.filter((v) => v.pitch).length}`)
}

main()
