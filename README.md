# 日本語N3 — App học tiếng Nhật từ 0 lên N3

App desktop (Electron + React + Tailwind + SQLite) cho người Việt, tập trung **nạp từ vựng + input nghe/đọc**, ôn tập bằng **FSRS giống Anki**.

## Mở app

Nhấp đúp **`HocTiengNhat.bat`**. App tự bật giọng đọc AivisSpeech (mất ~30–60 giây lần đầu, chấm xanh góc trái = sẵn sàng).

Chạy dạng dev: `npm run dev` · build lại: `npm run build`

## Các phần (mỗi phần tách riêng ở thanh bên trái)

| Phần | Nội dung |
|---|---|
| **Hôm nay** | Kế hoạch ngày theo ngân sách thời gian (mặc định 80′ từ vựng, 45′ nghe, 35′ đọc, 20′ ngữ pháp), tiến độ N5/N4/N3 |
| **Từ vựng** | 3.509 từ N5→N3. Thẻ **đọc** (kanji → nghĩa) + thẻ **nghe** (âm thanh → nghĩa, mở sau khi thẻ đọc đã thuộc). Mặt sau: furigana, pitch accent, **Hán Việt từng chữ** + mẹo nhớ, câu ví dụ có audio, từ đã học cùng kanji. Tab Danh sách, Kanji (1.438 chữ) |
| **Nghe** | Bài nghe AI viết bằng *đúng vốn từ của bạn* (i+1), 2 giọng nam/nữ; ẩn/hiện lời, dịch, tốc độ, **shadowing có ghi âm**; câu hỏi kiểu 聴解. Nghe nhanh (trắc nghiệm). Playlist nghe lại từ đã học |
| **Đọc** | Bài đọc i+1, furigana chỉ cho từ chưa thuộc, bấm từ để tra (kho từ / JMdict), “Học từ này” → đưa lên đầu hàng đợi, AI giải thích trong câu |
| **Ngữ pháp** | 299 mẫu N5→N3, thẻ điền chỗ trống (mỗi lần ôn một câu ví dụ khác) |
| **Luyện đề** | Đúng dạng đề JLPT: 漢字読み, 表記, 文脈規定, 文法形式 (tự sinh, miễn phí) + 言い換え/用法 (AI) |
| **Thống kê** | Độ nhớ thực tế, chuỗi ngày, thời gian theo phần, dự báo thẻ ôn, ngày dự kiến học xong |

Phím tắt khi ôn: `Space`/`Enter` lật thẻ / Nhớ · `1–4` Quên/Khó/Nhớ/Dễ · `R` nghe lại · `E` nghe câu ví dụ · `Ctrl+Z` hoàn tác.

## Thuật toán (giống Anki)

- FSRS-6 qua `ts-fsrs`; learning steps `1m 10m`, relearning `10m`, độ nhớ mong muốn 0.90.
- Ngày học đổi lúc 4h sáng; fuzz + **load balancer** như Anki 24.11+; bury siblings; leech sau 8 lần quên; learn-ahead 20 phút; undo.
- **Tối ưu tham số** bằng `fsrs-rs` (cùng lõi Rust với Anki) trong Cài đặt — chạy sau ~1 tháng.
- Số thẻ mới/ngày **tự tính theo ngân sách thời gian** để không bị dồn thẻ.

## Dữ liệu (tất cả trên ổ D)

```
data/
  nihongo.db        tiến độ học (SQLite) — sao lưu file này là đủ
  content/          nội dung đã dựng (từ vựng, kanji, ngữ pháp, từ điển)
  audio/            file âm thanh .ogg (AivisSpeech)
  aivis-engine/     model giọng đọc (~1.2 GB, trỏ junction từ %APPDATA%\AivisSpeech-Engine)
  electron/         cache trình duyệt của app
tools/aivis/        AivisSpeech Engine 1.2.0 (chạy CPU; GPU MX350 bị treo DirectML)
```

Nguồn: danh sách JLPT (open-anki-jlpt-decks / tanos, CC BY), JMdict & KANJIDIC2 (EDRDG, CC BY-SA), pitch accent Kanjium (CC BY-SA), Hán Việt Unihan + DeepSeek, câu ví dụ/giải thích do DeepSeek tạo.

## Pipeline dựng nội dung (đã chạy sẵn, chỉ cần khi muốn làm lại)

```bash
npx tsx pipeline/base.ts            # danh sách từ + JMdict + pitch + kanji (miễn phí)
npx tsx pipeline/enrich-kanji.ts    # Hán Việt, nghĩa, mẹo nhớ (DeepSeek)
npx tsx pipeline/enrich-vocab.ts    # nghĩa tiếng Việt + câu ví dụ (DeepSeek)
npx tsx pipeline/grammar.ts         # giải thích + ví dụ ngữ pháp (DeepSeek)
npx tsx pipeline/dict.ts            # từ điển tra cứu JMdict
npx tsx pipeline/build-content.ts   # gộp + furigana → data/content
npx tsx pipeline/audio.ts           # sinh audio (cần engine: tools/start-aivis.bat)
```

Kết quả DeepSeek được cache trong `data/cache/pipeline/*.jsonl` nên chạy lại không tốn thêm tiền. Toàn bộ nội dung tốn ~0,31 USD.
API key DeepSeek nằm trong `.env` (không commit).
