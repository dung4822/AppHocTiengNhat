import { Card, PageHeader, Spinner, Stat, cx } from '@/components/ui'
import { call } from '@/lib/api'
import { useAsync } from '@/lib/hooks'

const MOD_COLORS: Record<string, string> = {
  vocab: 'var(--color-accent)',
  listening: 'var(--color-indigo)',
  reading: 'var(--color-good)',
  grammar: 'var(--color-warn)',
  jlpt: 'var(--color-muted)'
}
const MOD_LABEL: Record<string, string> = { vocab: 'Từ vựng', listening: 'Nghe', reading: 'Đọc', grammar: 'Ngữ pháp', jlpt: 'Luyện đề' }

/** Biểu đồ cột (SVG) đơn giản, có thể xếp chồng. */
function Bars({ data, keys, colors, height = 140, labels }: { data: Record<string, number>[]; keys: string[]; colors: string[]; height?: number; labels?: string[] }) {
  const max = Math.max(1, ...data.map((d) => keys.reduce((a, k) => a + (d[k] ?? 0), 0)))
  const w = 100 / data.length
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {data.map((d, i) => {
          let y = height
          return keys.map((k, ki) => {
            const h = ((d[k] ?? 0) / max) * (height - 4)
            y -= h
            return <rect key={k + i} x={i * w + w * 0.15} y={y} width={w * 0.7} height={h} fill={colors[ki]} rx={0.6} />
          })
        })}
      </svg>
      {labels && (
        <div className="mt-1 flex justify-between text-[10px] text-muted">
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
        </div>
      )}
      <div className="mt-1 text-right text-[10px] text-muted">tối đa {Math.round(max)}</div>
    </div>
  )
}

export default function StatsPage() {
  const { data } = useAsync(async () => {
    const [o, h, f] = await Promise.all([call('stats.overview'), call('stats.history', 30), call('stats.forecast', 30)])
    return { o, h, f }
  }, [])
  if (!data) return <div className="flex justify-center py-24"><Spinner /></div>
  const { o, h, f } = data
  const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`)
  const avgMin = h.reduce((a, d) => a + Object.values(d.minutes).reduce((x, y) => x + y, 0), 0) / Math.max(1, h.filter((d) => Object.keys(d.minutes).length).length)

  return (
    <div className="fade-in">
      <PageHeader title="Thống kê" jp="統計" subtitle="Theo dõi tiến độ, độ nhớ thực tế và khối lượng ôn sắp tới" />

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-5"><Stat label="Độ nhớ thực tế (30 ngày)" value={pct(o.retention)} sub={`${o.retentionSample} lượt ôn · mục tiêu 90%`} /></Card>
        <Card className="p-5"><Stat label="Chuỗi ngày" value={o.streak} sub={`Tổng ${o.totalHours.toFixed(1)} giờ học`} /></Card>
        <Card className="p-5"><Stat label="Từ mới / ngày" value={o.newPerDay.toFixed(1)} sub="trung bình 7 ngày" /></Card>
        <Card className="p-5">
          <Stat label="Học hết từ N3" value={o.etaDate ? new Date(o.etaDate).toLocaleDateString('vi-VN') : '—'} sub={o.etaDays != null ? `còn ${o.remaining} từ · ~${o.etaDays} ngày` : 'cần dữ liệu 7 ngày'} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <div className="mb-4 font-medium">Từ vựng theo cấp</div>
          <div className="space-y-4">
            {o.levels.map((l) => (
              <div key={l.level}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-semibold">N{l.level}</span>
                  <span className="text-muted tabular-nums">
                    đã gặp {l.seen} · thuộc {l.known} · lâu {l.mature} / {l.total}
                  </span>
                </div>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-line">
                  <div className="absolute h-full bg-indigo/25" style={{ width: `${(l.seen / l.total) * 100}%` }} />
                  <div className="absolute h-full bg-indigo/60" style={{ width: `${(l.known / l.total) * 100}%` }} />
                  <div className="absolute h-full bg-indigo" style={{ width: `${(l.mature / l.total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4">
            <Stat label="Thẻ nghe đã thuộc" value={o.listen.known ?? 0} />
            <Stat label="Kanji đã gặp" value={`${o.kanji.known}/${o.kanji.total}`} />
            <Stat label="Tổng lượt ôn" value={o.totalReviews} />
          </div>
        </Card>
        <Card className="p-6">
          <div className="mb-4 font-medium">Ngữ pháp</div>
          <div className="space-y-4">
            {o.grammar.map((g) => (
              <div key={g.level}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-semibold">N{g.level}</span>
                  <span className="text-muted tabular-nums">đã học {g.seen} · đang ôn {g.known} / {g.total}</span>
                </div>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-line">
                  <div className="absolute h-full bg-warn/40" style={{ width: `${(g.seen / g.total) * 100}%` }} />
                  <div className="absolute h-full bg-warn" style={{ width: `${(g.known / g.total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-line pt-4 text-sm text-muted">
            Độ nhớ thẻ đã thuộc lâu: <b className="text-ink">{pct(o.retentionMature)}</b>. Nếu độ nhớ thực tế thấp hơn 85%, hãy vào Cài đặt → “Tối ưu FSRS”.
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-6">
        <div className="mb-1 flex items-baseline justify-between">
          <div className="font-medium">Thời gian học 30 ngày</div>
          <div className="text-sm text-muted">trung bình {Math.round(avgMin)} phút/ngày học</div>
        </div>
        <div className="mb-3 flex gap-4 text-xs text-muted">
          {Object.keys(MOD_LABEL).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: MOD_COLORS[k] }} /> {MOD_LABEL[k]}
            </span>
          ))}
        </div>
        <Bars
          data={h.map((d) => d.minutes)}
          keys={Object.keys(MOD_LABEL)}
          colors={Object.keys(MOD_LABEL).map((k) => MOD_COLORS[k])}
          labels={['30 ngày trước', 'hôm nay']}
        />
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <div className="mb-3 font-medium">Lượt ôn mỗi ngày</div>
          <div className="mb-2 flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo" /> thẻ mới</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-good" /> ôn tập</span>
          </div>
          <Bars data={h.map((d) => ({ n: d.newCards, r: d.reviews }))} keys={['n', 'r']} colors={['var(--color-indigo)', 'var(--color-good)']} labels={['30 ngày trước', 'hôm nay']} />
        </Card>
        <Card className="p-6">
          <div className="mb-3 font-medium">Dự báo thẻ ôn 30 ngày tới</div>
          <div className="mb-2 flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" /> từ vựng</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warn" /> ngữ pháp</span>
          </div>
          <Bars data={f.map((d) => ({ v: d.vocab, g: d.grammar }))} keys={['v', 'g']} colors={['var(--color-accent)', 'var(--color-warn)']} labels={['hôm nay', '+30 ngày']} />
        </Card>
      </div>
      <div className={cx('mt-4 text-xs text-muted')}>“Thuộc” = thẻ đã qua giai đoạn learning; “lâu” = độ ổn định trí nhớ ≥ 21 ngày (theo FSRS).</div>
    </div>
  )
}
