# 日本語N3 — App học tiếng Nhật từ 0 lên N3

App desktop cho người Việt học tiếng Nhật đến trình độ JLPT N3. Trọng tâm là nạp từ vựng và input nghe/đọc, ôn tập bằng thuật toán FSRS giống Anki.

**Stack:** Electron · React · Tailwind v4 · TypeScript · SQLite (better-sqlite3) · ts-fsrs · AivisSpeech (TTS local) · DeepSeek API · kuromoji

## Tính năng

- **Từ vựng:** 3.509 từ N5→N3. Mỗi từ có thẻ đọc (kanji → nghĩa) và thẻ nghe (audio → nghĩa). Mặt sau thẻ có Hán Việt từng chữ, pitch accent, câu ví dụ có audio.
- **Nghe / Đọc:** AI viết bài theo đúng vốn từ người học đã có, cộng vài từ sắp học. Bấm vào từ để tra, có shadowing ghi âm.
- **Ngữ pháp:** 299 mẫu N5→N3, ôn bằng câu điền chỗ trống.
- **Luyện đề:** câu hỏi đúng dạng JLPT (漢字読み, 表記, 文脈規定, 文法…) sinh từ những gì đã học.
- **Thống kê:** độ nhớ thực tế, dự báo lượng thẻ ôn, thời gian học theo từng phần.

## Cơ sở khoa học

| Phương pháp | Áp dụng trong app | Nguồn |
|---|---|---|
| Spaced repetition | FSRS-6, giống Anki: learning steps, fuzz, load balancer, bury, leech; tối ưu tham số bằng fsrs-rs | Cepeda et al. 2006; [srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark) |
| Retrieval practice | Thẻ bắt người học tự nhớ lại trước khi lật; trắc nghiệm theo dạng đề | Roediger & Karpicke 2006 |
| Cognate facilitation | Hiện âm Hán Việt cho từng kanji (経済 = kinh tế) | de Groot & Keijzer 2000 |
| Comprehensible input (i+1) | Bài đọc/nghe dùng chủ yếu từ đã biết (độ phủ ≥ 95–98%) | Krashen 1985; Hu & Nation 2000 |
| Dual coding | Mỗi từ đều có chữ, audio và câu ví dụ | Paivio 1971 |
| Shadowing | Nghe câu mẫu, nói đuổi theo, ghi âm để so sánh | Hamada 2016 |

Số thẻ mới mỗi ngày được tính tự động theo ngân sách thời gian, để lượng thẻ ôn không bị dồn.

## Chạy

```bash
npm install            # better-sqlite3 cần bản prebuilt cho Electron: npx prebuild-install -r electron
npm run dev            # hoặc nhấp đúp HocTiengNhat.bat
```

- **Giọng đọc:** cần [AivisSpeech Engine](https://github.com/Aivis-Project/AivisSpeech-Engine), giải nén vào `tools/aivis/`. App tự bật engine khi khởi động.
- **AI:** tạo bài đọc/nghe mới cần `DEEPSEEK_API_KEY` trong file `.env`.

## Cấu trúc

```
src/main/        Electron main: SQLite, scheduler FSRS, API cho từng module
src/renderer/    giao diện React, mỗi module một thư mục trong pages/
pipeline/        script dựng nội dung (từ điển → DeepSeek → furigana → audio)
data/content/    nội dung đã dựng sẵn (JSON)
```

## Nguồn dữ liệu

Danh sách JLPT: open-anki-jlpt-decks (tanos, CC BY) · JMdict, KANJIDIC2 (EDRDG, CC BY-SA) · Pitch accent: Kanjium (CC BY-SA) · Hán Việt: Unihan + DeepSeek · Câu ví dụ và giải thích: DeepSeek.
