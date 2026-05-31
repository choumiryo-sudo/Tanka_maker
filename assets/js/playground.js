// --- 初期化と状態管理 ---
let tokenizer = null;
const editor = document.getElementById("editor");
const backdrop = document.getElementById("backdrop");
const gutter = document.getElementById("gutter");
const gutterContent = document.getElementById("gutter-content");
const lineCountEl = document.getElementById("line-count");
const loadingEl = document.getElementById("loading");

/// 【変更】定数(const)から変数(let)に変更し、ローカルストレージから読み仮名データを復元
let manualReadings = new Map();
const savedReadings = localStorage.getItem("utayomi_manual_readings");
if (savedReadings) {
  try {
    manualReadings = new Map(JSON.parse(savedReadings));
  } catch (e) {
    console.error("読み仮名データの復元に失敗しました", e);
  }
}
let editingLineIndex = -1;

// 【追加】ローカルストレージからエディタのテキストを復元
const savedText = localStorage.getItem("utayomi_text");
if (savedText !== null) {
  // 【変更】改行コードを \n に正規化してからエディタにセットする
  editor.value = savedText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

// --- DOM操作ヘルパー (innerHTMLを避けるため) ---
function createElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// --- kuromoji.jsの初期化 ---
kuromoji
  .builder({
    dicPath: "../assets/dict/", // 【変更】ローカルの辞書ファイルを参照するようにパスを修正
  })
  .build(function (err, _tokenizer) {
    if (err) {
      alert("辞書の読み込みに失敗しました。再読み込みしてください。");
      console.error(err);
      return;
    }
    tokenizer = _tokenizer;
    loadingEl.style.display = "none";
    render(); // 初回レンダリング
  });

// --- カタカナをひらがなに変換 ---
function katakanaToHiragana(src) {
  return src
    .replace(/[\u30a1-\u30f6]/g, function (match) {
      return String.fromCharCode(match.charCodeAt(0) - 0x60);
    })
    .replace(/ヴ/g, "ぶ"); // ヴの特殊処理
}

// --- 音数カウントロジック ---
function countMora(text) {
  // 日本語文字（ひらがな・カタカナ）のみを抽出
  let clean = text.replace(/[^ぁ-んァ-ンー]/g, "");
  // カタカナをひらがなに統一
  clean = katakanaToHiragana(clean);
  if (!clean) return 0;
  // 「ひらがな+小さい字」を1モーラとして扱う
  let processed = clean.replace(/[ぁ-ん][ゃゅょぁぃぅぇぉ]/g, "*");
  return processed.length;
}

// --- 1行の解析 ---
function analyzeLine(text) {
  if (text.trim() === "") return { reading: "", count: 0 };

  // ユーザーの手動修正があればそれを優先
  if (manualReadings.has(text)) {
    const manualKana = manualReadings.get(text);
    return { reading: manualKana, count: countMora(manualKana) };
  }

  // なければkuromojiで解析
  const tokens = tokenizer.tokenize(text);
  let fullReadingKatakana = "";

  tokens.forEach((token) => {
    // readingが存在しない（記号や未知語）場合はsurface_formをそのまま使う
    fullReadingKatakana += token.reading || token.surface_form;
  });

  const hiragana = katakanaToHiragana(fullReadingKatakana);
  return { reading: hiragana, count: countMora(hiragana) };
}

// --- エディタの描画処理（メインロジック） ---
function render() {
  if (!tokenizer) return;

  // 【変更】計算のズレを防ぐため、処理直前に改行コードを \n に統一する
  const text = editor.value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const cursorStart = editor.selectionStart;

  // カーソルのある行番号を特定
  const textBeforeCursor = text.substring(0, cursorStart);
  const activeLineIndex = textBeforeCursor.split("\n").length - 1;

  const lines = text.split("\n");
  lineCountEl.textContent = lines.length;

  // backdropとgutterを初期化
  backdrop.textContent = "";
  gutterContent.textContent = "";

  // 行の高さや幅（縦書き用）の計算基準を取得
  const computedStyle = window.getComputedStyle(editor);
  const lineHeight = parseFloat(computedStyle.lineHeight);

  lines.forEach((lineText, index) => {
    // --- 1. バックドロップ（装飾テキスト）の生成 ---
    const lineRow = createElement("div", "line-row");
    if (index === activeLineIndex) {
      lineRow.classList.add("active-line");
    }

    // %% コメントアウト %% のパース処理
    // 正規表現で分割。マッチした部分は '%%...%%' の形式になる
    const parts = lineText.split(/(%%.*?%%)/g);
    parts.forEach((part) => {
      if (part.startsWith("%%") && part.endsWith("%%") && part.length >= 4) {
        lineRow.appendChild(createElement("span", "comment", part));
      } else if (part.length > 0) {
        lineRow.appendChild(document.createTextNode(part));
      }
    });

    // 空行の場合は高さを維持するため改行を挿入
    if (lineText === "") {
      lineRow.appendChild(createElement("br"));
    }
    backdrop.appendChild(lineRow);

    // --- 2. ガター（音数バッジ）の生成 ---
    const analysis = analyzeLine(lineText);

    const badgeContainer = createElement("div");
    // エディタの行高とバッジの領域を完全に一致させる
    const isHorizontal = document
      .getElementById("app")
      .classList.contains("mode-horizontal");

    // 【変更】フレックスボックスの設定を外に出して共通化
    badgeContainer.style.display = "flex";
    badgeContainer.style.alignItems = "center";
    badgeContainer.style.justifyContent = "center";

    if (isHorizontal) {
      badgeContainer.style.height = `${lineHeight}px`;
      badgeContainer.style.width = "100%"; // 【追加】横書き時は横幅いっぱいにする
    } else {
      badgeContainer.style.width = `${lineHeight}px`;
      badgeContainer.style.height = "100%"; // 【追加】縦書き時は縦幅いっぱいにする
    }

    // 音数が0（空行など）の場合はバッジを非表示っぽくする
    if (lineText.trim() !== "") {
      const badge = createElement(
        "div",
        "gutter-badge",
        analysis.count.toString(),
      );
      if (isHorizontal) {
        badge.style.width = "24px";
        badge.style.height = "24px";
      } else {
        badge.style.width = "24px";
        badge.style.height = "24px";
      }

      // バッジクリックで読み仮名修正モーダルを開く
      badge.addEventListener("click", () => {
        openKanaModal(index, lineText, analysis.reading);
      });
      badgeContainer.appendChild(badge);
    }

    gutterContent.appendChild(badgeContainer);
  });

  syncScrollPositions();
}

function syncScrollPositions() {
  backdrop.scrollTop = editor.scrollTop;
  backdrop.scrollLeft = editor.scrollLeft;

  const app = document.getElementById("app");
  if (app.classList.contains("mode-horizontal")) {
    gutterContent.style.transform = `translate3d(0, ${-editor.scrollTop}px, 0)`;
  } else {
    gutterContent.style.transform = `translate3d(${-editor.scrollLeft}px, 0, 0)`;
  }
}

// --- イベントリスナー（エディタ） ---
// 【変更】入力イベント発生時に、ローカルストレージへテキストを保存する処理を追加
editor.addEventListener("input", () => {
  // 【変更】保存時にも改行コードを \n に統一する
  const normalizedText = editor.value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  localStorage.setItem("utayomi_text", normalizedText);
  render();
});
editor.addEventListener("selectionchange", render);
editor.addEventListener("click", render);
editor.addEventListener("keyup", render);

// スクロール同期 (textareaとbackdrop, gutterの動きを合わせる)
editor.addEventListener("scroll", () => {
  syncScrollPositions();
});

// --- 縦書き/横書き 切替 ---
document.getElementById("btn-toggle-mode").addEventListener("click", () => {
  const app = document.getElementById("app");
  if (app.classList.contains("mode-horizontal")) {
    app.classList.remove("mode-horizontal");
    app.classList.add("mode-vertical");
  } else {
    app.classList.remove("mode-vertical");
    app.classList.add("mode-horizontal");
  }
  render(); // モード切替後に行高や幅が変わるため再描画
});

function getFormattedTimestamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");

  return `${y}${m}${d}_${h}${min}${s}`;
}

// --- エクスポート機能 (.txt) ---
document.getElementById("btn-export").addEventListener("click", () => {
  const text = editor.value;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${getFormattedTimestamp()}_tankanoteweb_playground.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// --- お題機能 (特別機能②) ---
const themeWords = [
  "雪",
  "自動販売機",
  "季節",
  "電車",
  "コーヒー",
  "道",
  "雨",
  "あくび",
  "爪",
  "プール",
  "学校",
  "嫌い",
  "足",
  "カーテン",
  "ボールペン",
  "ネクタイ",
  "靴",
  "時計",
  "空",
  "花",
];
const themeModal = document.getElementById("theme-modal");
const themeWordEl = document.getElementById("theme-word");

document.getElementById("btn-theme").addEventListener("click", () => {
  const randomIndex = Math.floor(Math.random() * themeWords.length);
  themeWordEl.textContent = themeWords[randomIndex];
  themeModal.classList.add("active");
});

document.getElementById("close-theme").addEventListener("click", () => {
  themeModal.classList.remove("active");
});

// --- 読み仮名修正機能 (特別機能①) ---
const kanaModal = document.getElementById("kana-modal");
const kanaInput = document.getElementById("kana-edit-input");
let currentOriginalText = "";

function openKanaModal(lineIndex, originalText, currentKana) {
  editingLineIndex = lineIndex;
  currentOriginalText = originalText;
  kanaInput.value = currentKana;
  kanaModal.classList.add("active");
  kanaInput.focus();
}

document.getElementById("close-kana").addEventListener("click", () => {
  kanaModal.classList.remove("active");
});

/* 修正後 */
document.getElementById("btn-save-kana").addEventListener("click", () => {
  const newKana = kanaInput.value;
  manualReadings.set(currentOriginalText, newKana);
  // 【追加】手動修正した読み仮名のリストをJSON形式にしてローカルストレージに保存
  localStorage.setItem(
    "utayomi_manual_readings",
    JSON.stringify(Array.from(manualReadings.entries())),
  );
  kanaModal.classList.remove("active");
  render();
});

function applyTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark");
    const toggle = document.getElementById("themeToggle");
    if (toggle) toggle.checked = true;
  } else if (theme === "light") {
    document.body.classList.remove("dark");
    const toggle = document.getElementById("themeToggle");
    if (toggle) toggle.checked = false;
  }
}

function initThemeToggle() {
  const toggle = document.getElementById("themeToggle");
  // 保存された設定を取得。なければシステム設定を優先
  const saved = localStorage.getItem("tankanote_theme");
  if (saved) {
    applyTheme(saved);
  } else if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    applyTheme("dark");
  } else {
    applyTheme("light");
  }

  if (!toggle) return;
  toggle.addEventListener("change", function () {
    const newTheme = this.checked ? "dark" : "light";
    applyTheme(newTheme);
    localStorage.setItem("tankanote_theme", newTheme);
  });
}

// 初期化呼び出し
initThemeToggle();

// --- 全文コピー機能（ヘッダーの「全文コピー」ボタン） ---
// 指定フォーマットのコメント（%% ... %%）を除去してコピーする
function stripInlineComments(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/%%.*?%%/g, "").replace(/\s+$/g, ""))
    .join("\n");
}

const copyAllBtn = document.getElementById("btn-copy-all");
if (copyAllBtn) {
  copyAllBtn.addEventListener("click", async () => {
    // 改行コードを正規化して、%%...%% コメントを除去してコピー
    const normalized = editor.value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const text = stripInlineComments(normalized);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      const old = copyAllBtn.textContent;
      copyAllBtn.textContent = "コピーしました";
      setTimeout(() => (copyAllBtn.textContent = old), 1500);
    } catch (e) {
      alert("クリップボードにコピーできませんでした。");
      console.error(e);
    }
  });
}

// --- ルビ挿入ショートカット (Ctrl/Cmd + L) ---
// テキストエリアの要素（IDはご自身のアプリに合わせて変更してください）
const rubyeditor = document.getElementById("editor");

rubyeditor.addEventListener("keydown", (e) => {
  // Ctrlキー(Windows) または Metaキー(Mac) + 'l'
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
    // ブラウザ標準の動作（アドレスバーへのフォーカスなど）を防止
    e.preventDefault();

    insertRuby(rubyeditor);
  }
});

function insertRuby(textarea) {
  const start = textarea.selectionStart; // 選択開始位置
  const end = textarea.selectionEnd; // 選択終了位置
  const value = textarea.value;

  // 1. 現在選択されているテキストを取得
  const selectedText = value.substring(start, end);
  const hasSelection = start !== end; // テキストを選択中かどうか

  // 2. 挿入する文字列を組み立て
  // 選択中： |選択文字《》
  // 未選択： |《》
  const rubyText = `|${selectedText}《》`;

  // 3. テキストエリアの内容を書き換え
  textarea.setRangeText(rubyText, start, end, "end");

  // 4. カーソル位置の条件分岐
  let newCursorPos;
  if (hasSelection) {
    // 【テキスト選択あり】例：|漢字《|》
    // 全体（|漢字《》）の長さから 1 引いた位置（》の手前）
    newCursorPos = start + rubyText.length - 1;
  } else {
    // 【テキスト選択なし】例：||《》
    // パイプ記号の直後（開始位置 + 1）
    newCursorPos = start + 1;
  }

  // 5. カーソルをセットしてフォーカス
  textarea.setSelectionRange(newCursorPos, newCursorPos);
  textarea.focus();

  // ショートカット挿入後に input を明示発火して保存・再描画を確実化
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

// --- コメント挿入ショートカット (Ctrl/Cmd + ;) ---
const commentEditor = document.getElementById("editor");

commentEditor.addEventListener("keydown", (e) => {
  // Ctrlキー(Windows) または Metaキー(Mac) + ';' (セミコロン)
  if ((e.ctrlKey || e.metaKey) && e.key === ";") {
    // ブラウザの既定の動作を防止
    e.preventDefault();
    insertComment(commentEditor);
  }
});

function insertComment(textarea) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;

  // 1. 現在選択されているテキストを取得
  const selectedText = value.substring(start, end);

  // 2. 挿入する文字列を組み立て（%% 選択文字 %%）
  const commentTemplate = `%% ${selectedText} %%`;

  // 3. テキストエリアの内容を書き換え
  textarea.setRangeText(commentTemplate, start, end, "end");

  // 4. カーソル位置の計算
  // 常に「%% 」の直後、かつ「 %%」の前にカーソルを置く
  // 選択テキストがある場合も、そのテキストの末尾（閉じ記号の直前）に来るように調整
  const newCursorPos = start + 3 + selectedText.length;

  // 5. カーソルをセットしてフォーカス
  textarea.setSelectionRange(newCursorPos, newCursorPos);
  textarea.focus();

  // 保存・再描画用のイベント発火
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}
