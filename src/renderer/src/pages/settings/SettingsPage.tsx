import { type ReactNode, useState } from 'react'
import { Button, Card, PageHeader, Segmented, Spinner, Toggle } from '@/components/ui'
import { call } from '@/lib/api'
import { playText } from '@/lib/audio'
import { useAsync } from '@/lib/hooks'
import { useSettings } from '@/lib/settings'

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-3 last:border-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Num({ value, onChange, min, max, step = 1, suffix }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)))
        }}
        className="h-9 w-24 rounded-lg border border-line bg-paper px-2 text-right text-sm tabular-nums outline-none focus:border-ink"
      />
      {suffix && <span className="text-xs text-muted">{suffix}</span>}
    </div>
  )
}

export default function SettingsPage() {
  const { settings: s, update } = useSettings()
  const status = useAsync(() => call('system.status'), [])
  const balance = useAsync(() => call('ai.balance'), [])
  const [opt, setOpt] = useState<string | null>(null)
  const [optBusy, setOptBusy] = useState(false)
  if (!s) return <Spinner />

  return (
    <div className="fade-in">
      <PageHeader title="Cài đặt" jp="設定" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-2 font-semibold">Ngân sách thời gian mỗi ngày</div>
          {(['vocab', 'listening', 'reading', 'grammar'] as const).map((k) => (
            <Row key={k} label={{ vocab: 'Từ vựng (SRS)', listening: 'Nghe', reading: 'Đọc', grammar: 'Ngữ pháp' }[k]}>
              <Num value={s.budget[k] ?? 0} min={0} max={240} step={5} suffix="phút" onChange={(v) => update({ budget: { ...s.budget, [k]: v } })} />
            </Row>
          ))}
          <div className="mt-2 text-xs text-muted">Tổng: {Object.values(s.budget).reduce((a, b) => a + b, 0)} phút/ngày</div>
        </Card>

        <Card className="p-6">
          <div className="mb-2 font-semibold">Thẻ mới</div>
          <Row label="Tự tính số thẻ mới theo ngân sách" hint="Dựa trên số thẻ ôn hôm nay & tốc độ của bạn, tránh dồn thẻ">
            <Toggle checked={s.autoNewByBudget} onChange={(v) => update({ autoNewByBudget: v })} />
          </Row>
          {s.autoNewByBudget ? (
            <Row label="Tối đa thẻ mới/ngày (tự động)">
              <Num value={s.maxAutoNewPerDay} min={5} max={200} onChange={(v) => update({ maxAutoNewPerDay: v })} />
            </Row>
          ) : (
            <Row label="Thẻ mới/ngày" hint="Tính cả thẻ đọc và thẻ nghe">
              <Num value={s.newPerDay} min={0} max={200} onChange={(v) => update({ newPerDay: v })} />
            </Row>
          )}
          <Row label="Thẻ nghe" hint="Mở sau khi thẻ đọc của từ đó đã thuộc">
            <Toggle checked={s.listeningCards} onChange={(v) => update({ listeningCards: v })} />
          </Row>
          <Row label="Mẫu ngữ pháp mới/ngày">
            <Num value={s.grammarNewPerDay} min={0} max={20} onChange={(v) => update({ grammarNewPerDay: v })} />
          </Row>
        </Card>

        <Card className="p-6">
          <div className="mb-2 font-semibold">Thuật toán FSRS (giống Anki)</div>
          <Row label="Độ nhớ mong muốn" hint="Anki mặc định 0.90. Cao hơn = ôn nhiều hơn">
            <Num value={s.desiredRetention} min={0.7} max={0.99} step={0.01} onChange={(v) => update({ desiredRetention: v })} />
          </Row>
          <Row label="Learning steps" hint="VD: 1m 10m">
            <input
              defaultValue={s.learningSteps.join(' ')}
              onBlur={(e) => update({ learningSteps: e.target.value.split(/\s+/).filter((x) => /^\d+(\.\d+)?[mhd]$/.test(x)) })}
              className="h-9 w-32 rounded-lg border border-line bg-paper px-2 text-sm outline-none focus:border-ink"
            />
          </Row>
          <Row label="Relearning steps" hint="VD: 10m">
            <input
              defaultValue={s.relearningSteps.join(' ')}
              onBlur={(e) => update({ relearningSteps: e.target.value.split(/\s+/).filter((x) => /^\d+(\.\d+)?[mhd]$/.test(x)) })}
              className="h-9 w-32 rounded-lg border border-line bg-paper px-2 text-sm outline-none focus:border-ink"
            />
          </Row>
          <Row label="Khoảng ôn tối đa">
            <Num value={s.maximumInterval} min={30} max={36500} onChange={(v) => update({ maximumInterval: v })} suffix="ngày" />
          </Row>
          <Row label="Fuzz + Load balancer" hint="Rải đều thẻ ôn giữa các ngày (như Anki 24.11+)">
            <Toggle checked={s.enableFuzz && s.loadBalancer} onChange={(v) => update({ enableFuzz: v, loadBalancer: v })} />
          </Row>
          <Row label="Hoãn thẻ anh em (bury siblings)">
            <Toggle checked={s.burySiblings} onChange={(v) => update({ burySiblings: v })} />
          </Row>
          <Row label="Ngưỡng leech">
            <Num value={s.leechThreshold} min={3} max={20} onChange={(v) => update({ leechThreshold: v })} suffix="lần quên" />
          </Row>
          <Row label="Giờ bắt đầu ngày mới">
            <Num value={s.dayStartHour} min={0} max={12} onChange={(v) => update({ dayStartHour: v })} suffix="giờ" />
          </Row>
          <div className="mt-4 rounded-xl bg-paper p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Tối ưu tham số FSRS</div>
                <div className="text-xs text-muted">
                  {s.fsrsParams ? 'Đang dùng tham số riêng của bạn.' : 'Đang dùng tham số mặc định FSRS-6.'} Nên chạy sau ~1 tháng và mỗi tháng 1 lần.
                </div>
              </div>
              <Button
                size="sm"
                disabled={optBusy}
                onClick={async () => {
                  setOptBusy(true)
                  try {
                    const r = await call('fsrs.optimize')
                    setOpt(r.message)
                    if (r.ok) await update({})
                  } catch (e) {
                    setOpt('Lỗi: ' + (e as Error).message)
                  } finally {
                    setOptBusy(false)
                  }
                }}
              >
                {optBusy ? 'Đang tối ưu…' : 'Tối ưu'}
              </Button>
            </div>
            {opt && <div className="mt-2 text-xs">{opt}</div>}
            {s.fsrsParams && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <code className="truncate text-[10px] text-muted">{s.fsrsParams.join(', ')}</code>
                <Button size="sm" variant="ghost" onClick={() => update({ fsrsParams: null })}>Về mặc định</Button>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-2 font-semibold">Âm thanh & giao diện</div>
          <Row label="Tự phát âm khi lật thẻ">
            <Toggle checked={s.autoplayAudio} onChange={(v) => update({ autoplayAudio: v })} />
          </Row>
          <Row label="Tự phát câu ví dụ sau từ">
            <Toggle checked={s.autoplayExample} onChange={(v) => update({ autoplayExample: v })} />
          </Row>
          <Row label="Thử giọng đọc" hint="Giọng nữ: まお · giọng nam: コハク (AivisSpeech)">
            <div className="flex gap-2">
              <Button size="sm" onClick={() => playText('こんにちは。一緒に日本語を勉強しましょう。', { speaker: s.speaker })}>Nữ</Button>
              <Button size="sm" onClick={() => playText('こんにちは。一緒に日本語を勉強しましょう。', { speaker: s.speaker2 })}>Nam</Button>
            </div>
          </Row>
          <Row label="Furigana khi đọc (mặc định)">
            <Segmented value={s.readingFurigana} onChange={(v) => update({ readingFurigana: v })} items={[{ value: 'all', label: 'Tất cả' }, { value: 'unknown', label: 'Từ chưa thuộc' }, { value: 'none', label: 'Không' }]} />
          </Row>
          <Row label="Giao diện">
            <Segmented value={s.theme} onChange={(v) => update({ theme: v })} items={[{ value: 'system', label: 'Theo máy' }, { value: 'light', label: 'Sáng' }, { value: 'dark', label: 'Tối' }]} />
          </Row>
          <Row label="Tự bật AivisSpeech khi mở app">
            <Toggle checked={s.autoStartEngine} onChange={(v) => update({ autoStartEngine: v })} />
          </Row>
          <div className="mt-4 space-y-1 rounded-xl bg-paper p-4 text-xs text-muted">
            <div>
              AivisSpeech: <b className="text-ink">{status.data?.engine ?? '…'}</b>
              {status.data?.engine === 'stopped' && (
                <Button size="sm" className="ml-2" onClick={async () => { await call('engine.start'); await status.reload() }}>Khởi động</Button>
              )}
            </div>
            <div>DeepSeek API: <b className="text-ink">{status.data?.apiKey ? 'đã cấu hình' : 'chưa có key (.env)'}</b> · số dư: <b className="text-ink">{balance.data ?? '…'}</b></div>
            <div>Chi phí AI trong phiên này: ~${(status.data?.aiCost ?? 0).toFixed(4)}</div>
          </div>
        </Card>
      </div>
    </div>
  )
}
