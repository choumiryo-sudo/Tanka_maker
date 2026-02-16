// --- グローバル変数 ---
let lists = JSON.parse(localStorage.getItem("utayomi_data")) || [];
let tokenizer = null; // 形態素解析器

// --- 初期化処理 (Kuromojiのロード) ---
const DIC_URL = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/";

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
  renderAllLists();
});

// --- メイン機能 ---

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

  const newSeries = {
    id: Date.now(),
    title: title,
    items: items,
  };

  lists.unshift(newSeries);
  saveData();
  renderAllLists();

  titleInput.value = "";
  textInput.value = "";
}

// 全リスト描画
function renderAllLists() {
  const container = document.getElementById("listsContainer");
  container.innerHTML = "";

  lists.forEach((series, seriesIndex) => {
    const seriesEl = document.createElement("div");
    seriesEl.className = "series-card";

    seriesEl.innerHTML = `
                <div class="series-header">
                    <h2 class="series-title">${escapeHtml(series.title)}</h2>
                    <button class="delete-list-btn" onclick="deleteSeries(${seriesIndex})">リスト削除</button>
                </div>
                <ul class="tanka-list" id="list-${series.id}"></ul>
            `;

    container.appendChild(seriesEl);

    const ulElement = seriesEl.querySelector(`#list-${series.id}`);

    series.items.forEach((item, itemIndex) => {
      const li = document.createElement("li");
      li.className = "tanka-item";
      li.dataset.id = item.id;

      li.innerHTML = `
                    <div class="drag-handle-icon">⋮⋮</div>
                    
                    <input type="text" class="tanka-content" 
                           value="${escapeHtml(item.text)}" 
                           onchange="updateItemText(${seriesIndex}, ${itemIndex}, this.value)"
                           placeholder="短歌を入力">
                    
                    <div class="meta-info">
                        <input type="text" class="reading-input"
                               value="${escapeHtml(item.reading)}"
                               onchange="updateItemReading(${seriesIndex}, ${itemIndex}, this.value)"
                               placeholder="読み仮名（ひらがな）">
                        <span class="count-badge" id="count-${item.id}">${
                          item.count
                        }</span>
                    </div>

                    <div class="history-section">
                        <span class="history-btn" onclick="toggleHistory(this)">変更履歴 (${
                          item.history.length
                        })</span>
                        <div class="history-panel">
                            ${
                              item.history.length === 0
                                ? "履歴はありません"
                                : item.history
                                    .map(
                                      (h, i) =>
                                        `<div class="history-row"><small>${
                                          i + 1
                                        }:</small> ${escapeHtml(h)}</div>`,
                                    )
                                    .join("")
                            }
                        </div>
                    </div>
                `;
      ulElement.appendChild(li);
    });

    // ★修正ポイント: handleオプションを指定
    new Sortable(ulElement, {
      animation: 150,
      handle: ".drag-handle-icon", // ここを指定することで、アイコン以外ではドラッグしなくなります
      onEnd: function (evt) {
        const movedItem = series.items.splice(evt.oldIndex, 1)[0];
        series.items.splice(evt.newIndex, 0, movedItem);
        saveData();
      },
    });
  });
}

// --- ロジック関数群 ---

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

// --- 更新処理 ---

function updateItemText(seriesIndex, itemIndex, newText) {
  const series = lists[seriesIndex];
  const item = series.items[itemIndex];
  if (item.text === newText) return;

  item.history.push(item.text);
  item.text = newText;

  saveData();
  renderAllLists();
}

function updateItemReading(seriesIndex, itemIndex, newReading) {
  const series = lists[seriesIndex];
  const item = series.items[itemIndex];

  item.reading = newReading;
  item.count = countMora(newReading);

  const badge = document.getElementById(`count-${item.id}`);
  if (badge) badge.textContent = item.count;

  saveData();
}

function toggleHistory(btn) {
  const panel = btn.nextElementSibling;
  panel.classList.toggle("active");
}

function deleteSeries(index) {
  if (confirm("本当に削除しますか？")) {
    lists.splice(index, 1);
    saveData();
    renderAllLists();
  }
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
