// --- 初期化と状態管理 ---
let tokenizer = null;
const editor = document.getElementById("editor");
const backdrop = document.getElementById("backdrop");
const gutter = document.getElementById("gutter");
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
    dicPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/",
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
function countMora(hiraganaStr) {
  let count = 0;
  // 除外文字セット（小さい字、音を持たない文字）
  const excludeChars = new Set([
    "ぁ",
    "ぃ",
    "ぅ",
    "ぇ",
    "ぉ",
    "ゃ",
    "ゅ",
    "ょ",
    "ゎ", // 小さいひらがな
    "ァ",
    "ィ",
    "ゥ",
    "ェ",
    "ォ",
    "ャ",
    "ュ",
    "ョ",
    "ヮ", // 小さいカタカナ
    " ",
    "　", // 空白
    "、",
    "。",
    "・", // 句読点
    "！",
    "？",
    "!",
    "?",
    ".",
    ",",
    "．",
    "， ", // 感嘆符等
    "(",
    ")",
    "（",
    "）",
    "「",
    "」",
    "『",
    "』", // 括弧
    "+",
    "=",
    "-",
    "*",
    "/", // 記号
  ]);

  for (let i = 0; i < hiraganaStr.length; i++) {
    const char = hiraganaStr[i];
    if (!excludeChars.has(char)) {
      count++;
    }
  }
  return count;
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
  gutter.textContent = "";

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

    gutter.appendChild(badgeContainer);
  });
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
  backdrop.scrollTop = editor.scrollTop;
  backdrop.scrollLeft = editor.scrollLeft;
  gutter.scrollTop = editor.scrollTop;
  gutter.scrollLeft = editor.scrollLeft;
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
// ※今後、ご自身で自由に単語を追加・編集できます
const themeWords = [
  "春の雪",
  "自動販売機",
  "初恋",
  "終電",
  "コーヒー",
  "金木犀",
  "雨上がり",
  "猫のあくび",
  "古本屋",
  "夕立",
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
