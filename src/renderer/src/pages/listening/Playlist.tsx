import { useEffect, useRef, useState } from 'react'
import { Furigana } from '@/components/jp'
import { IconChevronLeft, IconPause, IconPlay, IconSkip } from '@/components/icons'
import { Button, Card, Empty, Segmented, Spinner, Toggle } from '@/components/ui'
import { type ApiResult, call } from '@/lib/api'
import { playText, stopAudio } from '@/lib/audio'
import { useStudyTimer } from '@/lib/hooks'

type Word = ApiResult<'vocab.todayWords'>[number]

/**
 * Nghe lại từ đã học (rảnh tay): từ → (dừng để tự nhớ nghĩa) → hiện nghĩa → câu ví dụ.
 * Biến thời gian chết thành ôn tập nghe chủ động.
 */
export function Playlist() {
  const [range, setRange] = useState<'today' | '3' | '7'>('today')
  const [words, setWords] = useState<Word[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [showMeaning, setShowMeaning] = useState(false)
  const [withExample, setWithExample] = useState(true)
  const [shuffle, setShuffle] = useState(true)
  const run = useRef(0)
  useStudyTimer('listening', playing)

  useEffect(() => {
    setWords(null)
    stop()
    const p = range === 'today' ? call('vocab.todayWords') : call('vocab.recentWords', Number(range))
    void p.then((w) => {
      const list = shuffle ? [...w].sort(() => Math.random() - 0.5) : w
      setWords(list)
      setIdx(0)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, shuffle])

  useEffect(() => () => stop(), [])

  function stop() {
    run.current++
    stopAudio()
    setPlaying(false)
  }

  const loop = async (start: number) => {
    if (!words?.length) return
    const my = ++run.current
    setPlaying(true)
    for (let i = start; i < words.length; i++) {
      if (my !== run.current) return
      const w = words[i]
      setIdx(i)
      setShowMeaning(false)
      await playText(w.reading, { accent: w.pitch?.[0] ?? null })
      if (my !== run.current) return
      await wait(2200) // khoảng lặng để tự nhớ nghĩa (active recall)
      if (my !== run.current) return
      setShowMeaning(true)
      if (withExample && w.ex) {
        await wait(400)
        await playText(w.ex)
      }
      if (my !== run.current) return
      await wait(1200)
    }
    setPlaying(false)
  }

  if (!words) return <Spinner />
  const w = words[idx]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Segmented value={range} onChange={setRange} items={[{ value: 'today', label: 'Hôm nay' }, { value: '3', label: '3 ngày' }, { value: '7', label: '7 ngày' }]} />
        <Toggle checked={withExample} onChange={setWithExample} label="Kèm câu ví dụ" />
        <Toggle checked={shuffle} onChange={setShuffle} label="Xáo trộn" />
        <span className="text-sm text-muted">{words.length} từ</span>
      </div>
      {!words.length ? (
        <Empty title="Chưa có từ nào">Học vài từ ở phần Từ vựng, rồi quay lại đây để nghe lại.</Empty>
      ) : (
        <Card className="p-10 text-center">
          <div className="text-xs text-muted tabular-nums">{idx + 1}/{words.length}</div>
          <Furigana segs={w.furi} className="mt-2 text-5xl leading-[1.7]" />
          <div className={`mt-3 text-xl font-semibold transition ${showMeaning ? 'opacity-100' : 'opacity-0'}`}>{w.vi}</div>
          {w.ex && (
            <div className={`mt-4 transition ${showMeaning ? 'opacity-100' : 'opacity-0'}`}>
              <Furigana segs={w.exFuri} className="text-lg" />
              <div className="text-sm text-muted">{w.exVi}</div>
            </div>
          )}
          <div className="mt-8 flex justify-center gap-3">
            <Button onClick={() => { stop(); setIdx(Math.max(0, idx - 1)); setShowMeaning(true) }}><IconChevronLeft size={16} /></Button>
            <Button variant="primary" size="lg" onClick={() => (playing ? stop() : loop(idx))}>
              {playing ? <IconPause size={18} /> : <IconPlay size={18} />} {playing ? 'Tạm dừng' : 'Phát'}
            </Button>
            <Button onClick={() => { stop(); void loop(Math.min(words.length - 1, idx + 1)) }}><IconSkip size={16} /></Button>
          </div>
          <div className="mt-4 text-xs text-muted">Mỗi từ: nghe → 2 giây tự nhớ nghĩa → hiện nghĩa → nghe câu ví dụ.</div>
        </Card>
      )}
    </div>
  )
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
