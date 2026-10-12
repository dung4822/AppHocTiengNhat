import { useState } from 'react'
import { ReviewSession } from '@/components/ReviewSession'
import { PageHeader, Tabs } from '@/components/ui'
import { useSettings } from '@/lib/settings'
import { playExample, playWord, VocabCard } from './VocabCard'
import { BrowseView } from './BrowseView'
import { KanjiView } from './KanjiView'
import type { CardView } from '@/components/ReviewSession'

type Tab = 'review' | 'browse' | 'kanji'

export default function VocabPage() {
  const [tab, setTab] = useState<Tab>('review')
  const { settings } = useSettings()
  const [current, setCurrent] = useState<CardView | null>(null)

  return (
    <div>
      <PageHeader
        title="Từ vựng"
        jp="語彙"
        subtitle="Ôn ngắt quãng bằng FSRS (giống Anki) · thẻ đọc + thẻ nghe · Hán Việt cho từng kanji"
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'review', label: 'Ôn tập' },
          { value: 'browse', label: 'Danh sách từ' },
          { value: 'kanji', label: 'Kanji' }
        ]}
      />
      {tab === 'review' && (
        <ReviewSession
          deck="vocab"
          module="vocab"
          render={(p) => <VocabCard {...p} />}
          onShow={({ view, revealed }) => {
            setCurrent(view)
            // Thẻ nghe: phát âm ngay ở mặt trước
            if (view.card.ord === 1 && !revealed) void playWord(view.vocab!)
          }}
          onReveal={async (view) => {
            setCurrent(view)
            if (view.card.ord === 0 && settings?.autoplayAudio !== false) {
              const ok = await playWord(view.vocab!)
              if (ok && settings?.autoplayExample) await playExample(view.vocab!)
            }
          }}
          extraKeys={{
            r: () => current?.vocab && void playWord(current.vocab),
            e: () => current?.vocab && void playExample(current.vocab)
          }}
        />
      )}
      {tab === 'browse' && <BrowseView />}
      {tab === 'kanji' && <KanjiView />}
    </div>
  )
}
