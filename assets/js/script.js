// --- グローバル変数 ---
let lists = JSON.parse(localStorage.getItem("utayomi_data")) || [];
let activeSeriesId = null; // 現在表示中の連作ID
let tokenizer = null; // 形態素解析器

// 初期選択（データがあれば最新のものを選択）
if (lists.length > 0) {
  activeSeriesId = lists[0].id;
}

// --- 初期化処理 (Kuromojiのロード) ---
const DIC_URL = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/../dict/";

kuromoji.builder({ dicPath: DIC_URL }).build(function (err, _tokenizer) {
  if (err) {
    console.error(err);
    alert(
      "辞書の読み込みに失敗しました。インターネット接続を確認してください。",
    );
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
  listEl.innerHTML = "";

  if (lists.length === 0) {
    listEl.innerHTML = '<li class="sidebar-empty">作品がありません</li>';
    return;
  }

  lists.forEach((series) => {
    const li = document.createElement("li");
    li.className = `sidebar-item ${series.id === activeSeriesId ? "active" : ""}`;

    // 日付フォーマット
    const date = new Date(series.id);
    const dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;

    li.innerHTML = `
                <div>${escapeHtml(series.title)}</div>
                <span class="item-date">${dateStr}
                <button class="delete-list-btn-side" onclick="deleteCurrentSeries()">削除</button>
                </span>
            `;

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
  container.innerHTML = "";

  if (!activeSeriesId) {
    container.innerHTML = `<div class="empty-state">作品がありません。<br>新しい連作を作成してください。</div>`;
    return;
  }

  const series = lists.find((l) => l.id === activeSeriesId);
  if (!series) {
    // IDが見つからない場合（削除後など）
    container.innerHTML = `<div class="empty-state">選択された作品が見つかりません。</div>`;
    return;
  }

  // 連作カードの生成
  const seriesEl = document.createElement("div");
  seriesEl.className = "series-card";

  seriesEl.innerHTML = `
            <div class="series-header">
                <input type="text" class="series-title-input" 
                       value="${escapeHtml(series.title)}" 
                       onchange="updateSeriesTitle(this.value)"
                       placeholder="タイトルを入力">

                       <button class="preview-btn" onclick="openPreview()">プレビュー</button>
                <button class="delete-list-btn" onclick="deleteCurrentSeries()">リスト削除</button>
            </div>
            <ul class="tanka-list" id="current-tanka-list"></ul>
            <button class="add-item-btn" onclick="addEmptyItem()">＋ 新しい短歌を追加</button>
        `;

  container.appendChild(seriesEl);

  const ulElement = seriesEl.querySelector("#current-tanka-list");

  // 短歌アイテムの生成
  series.items.forEach((item, itemIndex) => {
    const li = document.createElement("li");
    li.className = "tanka-item";
    li.dataset.id = item.id;

    li.innerHTML = `
                <div class="drag-handle-icon">⋮⋮</div>
                <button class="delete-item-btn" onclick="deleteItem(${itemIndex})" title="この一首を削除">×</button>
                
                <input type="text" class="tanka-content" 
                       value="${escapeHtml(item.text)}" 
                       onchange="updateItemText(${itemIndex}, this.value)"
                       placeholder="短歌を入力">
                
                <div class="meta-info">
                    <span class="reading-label">よみ:</span>
                    <input type="text" class="reading-input"
                           value="${escapeHtml(item.reading)}"
                           onchange="updateItemReading(${itemIndex}, this.value)"
                           placeholder="読み仮名（ひらがな）">
                    <span class="count-badge" id="count-${item.id}">${item.count}</span>
                </div>

                <div class="history-section">
                    <span class="history-btn" onclick="toggleHistory(this)">変更履歴 (${item.history.length})</span>
                    <div class="history-panel">
                        ${
                          item.history.length === 0
                            ? "履歴はありません"
                            : item.history
                                .map(
                                  (h, i) =>
                                    `<div class="history-row"><small>${i + 1}:</small> ${escapeHtml(h)}</div>`,
                                )
                                .join("")
                        }
                    </div>
                </div>
            `;
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

// --- ユーティリティ ---

function getReadingFromText(text) {
  if (!tokenizer) return text;
  const tokens = tokenizer.tokenize(text);
  let reading = "";
  tokens.forEach((token) => {
    if (token.reading) {
      reading += token.reading;
    } else {
      reading += token.surface_form;
    }
  });
  return kataToHira(reading);
}

function kataToHira(str) {
  return str.replace(/[\u30a1-\u30f6]/g, function (match) {
    var chr = match.charCodeAt(0) - 0x60;
    return String.fromCharCode(chr);
  });
}

function countMora(text) {
  let clean = text.replace(/[^ぁ-んァ-ンー]/g, "");
  clean = kataToHira(clean);
  if (!clean) return 0;
  let processed = clean.replace(/[ぁ-ん][ゃゅょ]/g, "*");
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
  window.open(`pases/preview.html?id=${activeSeriesId}`, "_blank");
}
