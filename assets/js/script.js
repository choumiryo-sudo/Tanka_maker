// --- グローバル変数 ---
let lists = JSON.parse(localStorage.getItem("utayomi_data")) || [];
let activeSeriesId = null; // 現在表示中の連作ID
let tokenizer = null; // 形態素解析器

// 初期選択（データがあれば最新のものを選択）
if (lists.length > 0) {
  activeSeriesId = lists[0].id;
}

// --- 初期化処理 (Kuromojiのロード) --- 【変更】ローカルの辞書ファイルを参照するようにパスを修正
const DIC_URL = "../assets/dict/";

kuromoji.builder({ dicPath: DIC_URL }).build(function (err, _tokenizer) {
  if (err) {
    console.error(err);
    alert(
      "辞書の読み込みに失敗しました。インターネット接続を確認してください。",
    );
    document.getElementById("loading-overlay").style.display = "none"; // エラー時も隠す
    return;
  }
  tokenizer = _tokenizer;
  document.getElementById("loading-overlay").style.display = "none";
  document.getElementById("createBtn").disabled = false;
  renderApp();
});

// --- メイン描画処理 ---
function renderApp() {
  renderSidebar();
  renderActiveSeries();
}

// サイドバーの描画
function renderSidebar() {
  const listEl = document.getElementById("sidebarList");
  while (listEl.firstChild) {
    listEl.removeChild(listEl.firstChild);
  }

  if (lists.length === 0) {
    const li = document.createElement("li");
    li.className = "sidebar-empty";
    li.textContent = "作品がありません";
    listEl.appendChild(li);
    return;
  }

  lists.forEach((series) => {
    const li = document.createElement("li");
    li.className = `sidebar-item ${series.id === activeSeriesId ? "active" : ""}`;

    // 日付フォーマット
    const date = new Date(series.id);
    const dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;

    // タイトルを表示するdiv
    const titleDiv = document.createElement("div");
    titleDiv.textContent = series.title;
    li.appendChild(titleDiv);

    // 日付とボタンを表示するspan
    const dateSpan = document.createElement("span");
    dateSpan.className = "item-date";
    dateSpan.textContent = dateStr;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-list-btn-side";
    deleteBtn.textContent = "削除";
    deleteBtn.onclick = deleteCurrentSeries;

    dateSpan.appendChild(deleteBtn);
    li.appendChild(dateSpan);

    li.onclick = () => {
      activeSeriesId = series.id;
      renderApp();
    };

    listEl.appendChild(li);
  });
}

// 選択された連作（メインエリア）の描画
function renderActiveSeries() {
  const container = document.getElementById("activeListContainer");
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  if (!activeSeriesId) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "empty-state";
    const text = document.createTextNode("作品がありません。");
    const br = document.createElement("br");
    const text2 = document.createTextNode("新しい連作を作成してください。");
    emptyDiv.appendChild(text);
    emptyDiv.appendChild(br);
    emptyDiv.appendChild(text2);
    container.appendChild(emptyDiv);
    return;
  }

  const series = lists.find((l) => l.id === activeSeriesId);
  if (!series) {
    // IDが見つからない場合（削除後など）
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "empty-state";
    emptyDiv.textContent = "選択された作品が見つかりません。";
    container.appendChild(emptyDiv);
    return;
  }

  // 連作カードの生成
  const seriesEl = document.createElement("div");
  seriesEl.className = "series-card";

  // series-header div
  const headerDiv = document.createElement("div");
  headerDiv.className = "series-header";

  // title input
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.className = "series-title-input";
  titleInput.value = series.title;
  titleInput.placeholder = "タイトルを入力";
  titleInput.onchange = function () {
    updateSeriesTitle(this.value);
  };
  headerDiv.appendChild(titleInput);

  // preview button
  const previewBtn = document.createElement("button");
  previewBtn.className = "preview-btn";
  previewBtn.textContent = "プレビュー";
  previewBtn.onclick = openPreview;
  headerDiv.appendChild(previewBtn);

  // delete button
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-list-btn";
  deleteBtn.textContent = "リスト削除";
  deleteBtn.onclick = deleteCurrentSeries;
  headerDiv.appendChild(deleteBtn);

  seriesEl.appendChild(headerDiv);

  // tanka list ul
  const ulElement = document.createElement("ul");
  ulElement.className = "tanka-list";
  ulElement.id = "current-tanka-list";
  seriesEl.appendChild(ulElement);

  // add item button
  const addBtn = document.createElement("button");
  addBtn.className = "add-item-btn";
  addBtn.textContent = "＋ 新しい短歌を追加";
  addBtn.onclick = addEmptyItem;
  seriesEl.appendChild(addBtn);

  container.appendChild(seriesEl);

  // 短歌アイテムの生成
  series.items.forEach((item, itemIndex) => {
    const li = document.createElement("li");
    li.className = "tanka-item";
    li.dataset.id = item.id;

    // drag handle icon
    const dragHandle = document.createElement("div");
    dragHandle.className = "drag-handle-icon";
    dragHandle.textContent = "⋮⋮";
    li.appendChild(dragHandle);

    // delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-item-btn";
    deleteBtn.textContent = "×";
    deleteBtn.title = "この一首を削除";
    deleteBtn.onclick = function () {
      deleteItem(itemIndex);
    };
    li.appendChild(deleteBtn);

    // tanka content input
    const contentInput = document.createElement("input");
    contentInput.type = "text";
    contentInput.className = "tanka-content";
    contentInput.value = item.text;
    contentInput.placeholder = "短歌を入力";
    contentInput.onchange = function () {
      updateItemText(itemIndex, this.value);
    };
    li.appendChild(contentInput);

    // meta-info div
    const metaDiv = document.createElement("div");
    metaDiv.className = "meta-info";

    const readingLabel = document.createElement("span");
    readingLabel.className = "reading-label";
    readingLabel.textContent = "よみ:";
    metaDiv.appendChild(readingLabel);

    const readingInput = document.createElement("input");
    readingInput.type = "text";
    readingInput.className = "reading-input";
    readingInput.value = item.reading;
    readingInput.placeholder = "読み仮名（ひらがな）";
    readingInput.onchange = function () {
      updateItemReading(itemIndex, this.value);
    };
    metaDiv.appendChild(readingInput);

    const countBadge = document.createElement("span");
    countBadge.className = "count-badge";
    countBadge.id = `count-${item.id}`;
    countBadge.textContent = item.count;
    metaDiv.appendChild(countBadge);

    li.appendChild(metaDiv);

    // history-section div
    const historySection = document.createElement("div");
    historySection.className = "history-section";

    const historyBtn = document.createElement("span");
    historyBtn.className = "history-btn";
    historyBtn.textContent = `変更履歴 (${item.history.length})`;
    historyBtn.onclick = function () {
      toggleHistory(this);
    };
    historySection.appendChild(historyBtn);

    const historyPanel = document.createElement("div");
    historyPanel.className = "history-panel";

    if (item.history.length === 0) {
      historyPanel.textContent = "履歴はありません";
    } else {
      item.history.forEach((h, i) => {
        const historyRow = document.createElement("div");
        historyRow.className = "history-row";

        const smallNum = document.createElement("small");
        smallNum.textContent = `${i + 1}:`;
        historyRow.appendChild(smallNum);

        const historyText = document.createTextNode(` ${h}`);
        historyRow.appendChild(historyText);

        historyPanel.appendChild(historyRow);
      });
    }

    historySection.appendChild(historyPanel);
    li.appendChild(historySection);

    ulElement.appendChild(li);
  });

  // SortableJSの適用
  new Sortable(ulElement, {
    animation: 150,
    handle: ".drag-handle-icon",
    onEnd: function (evt) {
      const movedItem = series.items.splice(evt.oldIndex, 1)[0];
      series.items.splice(evt.newIndex, 0, movedItem);
      saveData();
      renderActiveSeries();
    },
  });
}

// --- データ操作ロジック ---

// 新しい連作を作成
function createNewSeries() {
  if (!tokenizer) return;

  const titleInput = document.getElementById("inputTitle");
  const textInput = document.getElementById("inputText");
  const title = titleInput.value.trim() || "無題";
  const rawText = textInput.value;

  if (!rawText.trim()) {
    alert("短歌を入力してください");
    return;
  }

  const lines = rawText
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

  const items = lines.map((line) => {
    const reading = getReadingFromText(line);
    const count = countMora(reading);
    return {
      id: generateId(),
      text: line,
      reading: reading,
      count: count,
      history: [],
    };
  });

  const newSeriesId = Date.now();
  const newSeries = {
    id: newSeriesId,
    title: title,
    items: items,
  };

  lists.unshift(newSeries);
  activeSeriesId = newSeriesId; // 新しいリストを選択状態にする
  saveData();
  renderApp();

  // 入力フォームをクリア
  titleInput.value = "";
  textInput.value = "";
}

function updateSeriesTitle(newTitle) {
  const series = lists.find((l) => l.id === activeSeriesId);
  if (!series) return;

  series.title = newTitle || "無題";
  saveData();
  renderSidebar(); // サイドバーのタイトルも即座に更新
}

// 現在表示中の連作を削除
function deleteCurrentSeries() {
  if (!activeSeriesId) return;

  if (confirm("この作品を本当に削除しますか？\n（削除すると元に戻せません）")) {
    const index = lists.findIndex((l) => l.id === activeSeriesId);
    if (index > -1) {
      lists.splice(index, 1);

      // 削除後の選択ロジック（次があれば次、なければ前、なければnull）
      if (lists.length > 0) {
        // 同じ位置の要素（元々次だったもの）か、最後尾なら一つ前
        const nextIndex = Math.min(index, lists.length - 1);
        activeSeriesId = lists[nextIndex].id;
      } else {
        activeSeriesId = null;
      }

      saveData();
      renderApp();
    }
  }
}

function addEmptyItem() {
  const series = lists.find((l) => l.id === activeSeriesId);
  if (!series) return;

  series.items.push({
    id: generateId(),
    text: "",
    reading: "",
    count: 0,
    history: [],
  });

  saveData();
  renderActiveSeries();
}

// ★追加: 指定した短歌アイテムを削除
function deleteItem(itemIndex) {
  const series = lists.find((l) => l.id === activeSeriesId);
  if (!series) return;

  if (confirm("この一首を削除しますか？")) {
    series.items.splice(itemIndex, 1);
    saveData();
    renderActiveSeries();
  }
}

// 本文更新
function updateItemText(itemIndex, newText) {
  const series = lists.find((l) => l.id === activeSeriesId);
  if (!series) return;

  const item = series.items[itemIndex];
  if (item.text === newText) return;

  item.history.push(item.text);
  item.text = newText;

  // 読みと音数も更新
  const newReading = getReadingFromText(newText);
  item.reading = newReading;
  item.count = countMora(newReading);

  saveData();
  renderActiveSeries(); // 再描画
}

// 読み仮名更新
function updateItemReading(itemIndex, newReading) {
  const series = lists.find((l) => l.id === activeSeriesId);
  if (!series) return;

  const item = series.items[itemIndex];
  item.reading = newReading;
  item.count = countMora(newReading);

  // バッジ更新
  const badge = document.getElementById(`count-${item.id}`);
  if (badge) badge.textContent = item.count;

  saveData();
}

// --- ルビマークアップ処理 ---

/**
 * ルビマークアップ文字列を解析する
 * 形式: |対象の文字《ルビ》
 * 戻り値: [{type: 'text', value: '...'}, {type: 'ruby', base: '...', ruby: '...'}] の配列
 */
function parseRubyMarkup(text) {
  const result = [];
  const rubyRegex = /\|([^《]*?)《([^》]*?)》/g;
  let lastIndex = 0;
  let match;

  while ((match = rubyRegex.exec(text)) !== null) {
    // ルビ前のテキスト
    if (match.index > lastIndex) {
      result.push({
        type: "text",
        value: text.substring(lastIndex, match.index),
      });
    }
    // ルビ
    result.push({
      type: "ruby",
      base: match[1],
      ruby: match[2],
      fullMarkup: match[0], // 元のマークアップ
    });
    lastIndex = rubyRegex.lastIndex;
  }

  // 最後のテキスト
  if (lastIndex < text.length) {
    result.push({
      type: "text",
      value: text.substring(lastIndex),
    });
  }

  // マークアップがない場合は、元のテキストを返す
  if (result.length === 0) {
    return [{ type: "text", value: text }];
  }

  return result;
}

/**
 * ルビマークアップを含むテキストから読み仮名を抽出する
 * ルビは直接使用、その他は形態素解析
 */
function getReadingFromText(text) {
  const parsed = parseRubyMarkup(text);
  let reading = "";

  parsed.forEach((part) => {
    if (part.type === "ruby") {
      // ルビを直接使用（既に平仮名と仮定）
      reading += part.ruby;
    } else {
      // テキスト部分を形態素解析
      if (!tokenizer) {
        reading += part.value;
      } else {
        const tokens = tokenizer.tokenize(part.value);
        tokens.forEach((token) => {
          if (token.reading) {
            reading += token.reading;
          } else {
            reading += token.surface_form;
          }
        });
      }
    }
  });

  return kataToHira(reading);
}

// --- ユーティリティ ---

function kataToHira(str) {
  return str.replace(/[\u30a1-\u30f6]/g, function (match) {
    var chr = match.charCodeAt(0) - 0x60;
    return String.fromCharCode(chr);
  });
}

// --- 音数カウントロジック ---
// 日本語文字のみを抽出し、「ひらがな+小さい字」を1モーラとして扱う
function countMora(text) {
  // 日本語文字（ひらがな・カタカナ）のみを抽出
  let clean = text.replace(/[^ぁ-んァ-ンー]/g, "");
  // カタカナをひらがなに統一
  clean = kataToHira(clean);
  if (!clean) return 0;
  // 「ひらがな+小さい字」を1文字に置き換えてモーラを正確にカウント
  let processed = clean.replace(/[ぁ-ん][ゃゅょぁぃぅぇぉ]/g, "*");
  return processed.length;
}

function toggleHistory(btn) {
  const panel = btn.nextElementSibling;
  panel.classList.toggle("active");
}

function saveData() {
  localStorage.setItem("utayomi_data", JSON.stringify(lists));
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function escapeHtml(str) {
  if (!str && str !== 0) return "";
  return String(str).replace(/[&<>"']/g, function (match) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[match];
  });
}

// --- プレビュー機能 ---
function openPreview() {
  if (!activeSeriesId) return;
  // 変更を確実に保存してから開く
  saveData();
  // 新しいウィンドウ（preview.html）を開き、URLの後ろにIDをつける
  // 例: preview.html?id=1708055555555
  window.open(
    `pages/preview.html?id=${activeSeriesId}`,
    "_blank",
    "noopener,noreferrer",
  );
}

// 日時を「YYYYMMDD_HHMMSS」形式で取得する関数
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

// エクスポート処理
function exportData() {
  // LocalStorageからデータを取得
  const data = localStorage.getItem("utayomi_data");

  if (data === "[]" || !data) {
    alert("保存されているデータが見つかりません。");
    return;
  }

  const exportObject = {
    appName: "tankanoteweb",
    version: "1.0",
    lastUpdated: new Date().toISOString(),
    content: data, // ここに実際のデータが入ります
  };

  // JSON文字列に変換（インデントをつけて読みやすくする場合は第3引数に2を入れる）
  const jsonString = JSON.stringify(exportObject, null, 2);

  // ファイル名の生成
  const fileName = `${getFormattedTimestamp()}_tankanoteweb.json`;

  // Blobの作成とダウンロード処理
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName; // ここで動的なファイル名を指定

  document.body.appendChild(a);
  a.click();

  // 後処理
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 本文のみを抽出してエクスポート
function exportTextOnly() {
  if (!lists || lists.length === 0) {
    alert("保存されているデータが見つかりません。");
    return;
  }

  const texts = [];
  lists.forEach((series) => {
    if (series && Array.isArray(series.items)) {
      series.items.forEach((item) => {
        if (item && typeof item.text === "string") texts.push(item.text);
      });
    }
  });

  if (texts.length === 0) {
    alert("エクスポートする本文が見つかりません。");
    return;
  }

  const content = texts.join("\n");
  const fileName = `${getFormattedTimestamp()}_tankanoteweb_texts.txt`;

  const blob2 = new Blob([content], { type: "text/plain" });
  const url2 = URL.createObjectURL(blob2);

  const a2 = document.createElement("a");
  a2.href = url2;
  a2.download = fileName;

  document.body.appendChild(a2);
  a2.click();

  document.body.removeChild(a2);
  URL.revokeObjectURL(url2);
}

// ボタンにイベントを登録
document.getElementById("exportBtn").addEventListener("click", exportData);
document
  .getElementById("exportTextBtn")
  .addEventListener("click", exportTextOnly);

function importData() {
  const fileInput = document.getElementById("importFile");
  const file = fileInput.files[0];

  if (!file) {
    alert("インポートするファイルを選択してください。");
    return;
  }

  const reader = new FileReader();

  // ファイルの読み込みが完了した時の処理
  reader.onload = function (e) {
    const content = e.target.result; // ファイルの中身（テキスト）

    try {
      // 1. JSONとして解析できるかチェック
      const importedData = JSON.parse(e.target.result);

      // 2. データの形式（構造）をチェック
      if (importedData.appName !== "tankanoteweb") {
        throw new Error(
          "このファイルは短歌ノートWebのバックアップデータではありません。",
        );
      }

      if (!importedData.content) {
        throw new Error("データ本体（content）が含まれていません。");
      }

      // ★追加：contentの中身が正しい形式か検証する
      let parsedContent;
      try {
        parsedContent = JSON.parse(importedData.content);
      } catch (e) {
        throw new Error("データ本体が正しいJSON形式ではありません。");
      }

      if (!Array.isArray(parsedContent)) {
        throw new Error("データ本体の形式が不正です（配列ではありません）。");
      }

      // 簡易的なプロパティチェック（最初の要素があれば、idとtitleを持っているか確認）
      if (parsedContent.length > 0) {
        const firstItem = parsedContent[0];
        if (
          !firstItem.hasOwnProperty("id") ||
          !firstItem.hasOwnProperty("title") ||
          !Array.isArray(firstItem.items)
        ) {
          throw new Error("データ構造がアプリの仕様と一致しません。");
        }
      }

      // 3. ユーザーに確認してLocalStorageに反映
      const isConfirmed = confirm("データを上書きしますか？");
      if (isConfirmed) {
        // 検証済みの正しいデータを保存
        localStorage.setItem("utayomi_data", importedData.content);
        alert("インポートが完了しました。");
        location.reload();
      }
    } catch (error) {
      // JSONの形式が正しくない場合や、独自のチェックに引っかかった場合
      alert("エラー: " + error.message);
      console.error("Import failed:", error);
    }
  };

  // ファイルをテキストとして読み込む
  reader.readAsText(file);
}

// ボタンにイベントを登録
document.getElementById("importBtn").addEventListener("click", importData);

const fileInput = document.getElementById("importFile");
const fileName = document.getElementById("file-name");
const submitBtn = document.getElementById("importBtn");

fileInput.addEventListener("change", (e) => {
  const files = e.target.files;

  if (files.length > 0) {
    // ファイルが選択された場合
    fileName.textContent = `選択済み: ${files[0].name}`;
    submitBtn.disabled = false; // ボタンを有効化
    submitBtn.classList.add("active"); // 見た目を変える用のクラス
  } else {
    // キャンセルなどで選択されなかった場合
    fileName.textContent = "選択されていません";
    submitBtn.disabled = true;
    submitBtn.classList.remove("active");
  }
});

// --- テーマ切替（ダーク/ライト） ---
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
