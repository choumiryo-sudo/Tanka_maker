/* --- ルビマークアップ処理 --- */
/**
 * ルビマークアップ文字列をHTMLに変換する
 * 形式: |対象の文字《ルビ》
 * 出力: <ruby>対象の文字<rt>ルビ</rt></ruby>
 */
function renderRubyToHtml(text) {
  const container = document.createElement("div");
  const rubyRegex = /\|([^《]*?)《([^》]*?)》/g;
  let lastIndex = 0;
  let match;

  while ((match = rubyRegex.exec(text)) !== null) {
    // ルビ前のテキスト
    if (match.index > lastIndex) {
      container.appendChild(
        document.createTextNode(text.substring(lastIndex, match.index)),
      );
    }
    // ルビ要素を作成
    const rubyEl = document.createElement("ruby");
    rubyEl.textContent = match[1]; // base text
    const rtEl = document.createElement("rt");
    rtEl.textContent = match[2]; // ruby text
    rubyEl.appendChild(rtEl);
    container.appendChild(rubyEl);
    lastIndex = rubyRegex.lastIndex;
  }

  // 最後のテキスト
  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.substring(lastIndex)));
  }

  return container;
}

/* --- 1. データ読み込み --- */
const params = new URLSearchParams(window.location.search);
const targetId = params.get("id");
const lists = JSON.parse(localStorage.getItem("utayomi_data")) || [];
const series = lists.find((l) => l.id == targetId);
const container = document.getElementById("content-container");

if (series) {
  document.title = series.title + " - プレビュー";
  const titleEl = document.createElement("h1");
  titleEl.textContent = series.title;
  container.appendChild(titleEl);

  series.items.forEach((item) => {
    if (!item.text.trim()) return;
    const p = document.createElement("div");
    p.className = "tanka";
    // ルビマークアップをHTMLに変換してdivに追加
    const rubyHtml = renderRubyToHtml(item.text);
    // divの内容をrubyHtmlのchildrenで置き換える
    while (rubyHtml.firstChild) {
      p.appendChild(rubyHtml.firstChild);
    }
    container.appendChild(p);
  });
} else if (targetId) {
  container.innerHTML = "<p>データが見つかりませんでした。</p>";
}

/* --- 2. 設定変更 --- */
const root = document.documentElement;
document
  .getElementById("font-select")
  .addEventListener("change", (e) =>
    root.style.setProperty("--main-font", e.target.value),
  );
document
  .getElementById("bg-color")
  .addEventListener("input", (e) =>
    root.style.setProperty("--bg-color", e.target.value),
  );
document
  .getElementById("text-color")
  .addEventListener("input", (e) =>
    root.style.setProperty("--text-color", e.target.value),
  );

/* --- 3. 画像ダウンロード (html-to-image版) --- */
document.getElementById("download-btn").addEventListener("click", async () => {
  const target = document.getElementById("capture-target");
  const downloadBtn = document.getElementById("download-btn");

  downloadBtn.textContent = "生成中...";
  downloadBtn.disabled = true;

  try {
    // フォントの読み込み完了を待つ（これが原因で止まることがあるため念のため）
    await document.fonts.ready;

    // 1. 要素の「本来のサイズ」を取得
    // scrollWidth/Height を使うことで、画面外に隠れている部分も含めたサイズが取れます
    const width = target.scrollWidth;
    const height = target.scrollHeight;

    const dataUrl = await htmlToImage.toPng(target, {
      pixelRatio: 2,
      width: width, // 出力サイズを固定
      height: height, // 出力サイズを固定
      // スタイルを一時的にリセット（念のため）
      // 【重要】描画の開始位置を要素の左上に強制固定
      style: {
        transform: "none",
        // スクロールによるズレを防ぐため、位置をリセット
        position: "relative",
        overflow: "visible",
        margin: "0",
        top: "0",
        left: "0",
      },
    });

    const link = document.createElement("a");
    link.download = (series ? series.title : "utayomi_preview") + ".png";
    link.href = dataUrl;
    link.click();
  } catch (error) {
    console.error("画像生成エラー:", error);
    alert("画像の生成に失敗しました。\n" + error.message);
  } finally {
    // 成功しても失敗してもボタンを元に戻す
    downloadBtn.textContent = "画像をダウンロード";
    downloadBtn.disabled = false;
  }
});

// 1. HTML要素を取得する
const inputElement = document.getElementById("username-input");
const outputElement = document.getElementById("output");

// 2. 入力イベントを監視する
inputElement.addEventListener("input", () => {
  // 3. 入力された値を表示用の要素に代入する
  outputElement.textContent = inputElement.value;
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
