const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SALT = "tights-wiki-race-secret-salt";

const SENSITIVE_KEYWORDS = [
  "性的",
  "成人向け",
  "アダルト",
  "ポルノ",
  "性風俗",
  "エロ",
  "18禁",
  "性科学",
  "性行為",
  "性器",
  "濡れ場",
];

function encryptArticle(text, dateStr) {
  const key = crypto
    .createHash("sha256")
    .update(dateStr + SALT)
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString("hex");
}

function decryptArticle(hexStr, dateStr) {
  try {
    const key = crypto
      .createHash("sha256")
      .update(dateStr + SALT)
      .digest();
    const raw = Buffer.from(hexStr, "hex");
    const iv = raw.subarray(0, 12);
    const enc = raw.subarray(12, raw.length - 16);
    const tag = raw.subarray(raw.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc, null, "utf8") + decipher.final("utf8");
  } catch (e) {
    return "(解読失敗)";
  }
}

async function isSafeArticle(title) {
  if (title.endsWith("(曖昧さ回避)")) return false;
  try {
    const url = `https://ja.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=categories|templates|pageprops|info|linkshere&ppprop=disambiguation&lhnamespace=0&lhlimit=10&cllimit=50&tllimit=50&format=json`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "WikiRaceApp/1.0 (https://cure88200.github.io/tights-wiki-race/)",
      },
    });
    const data = await res.json();
    const pages = data.query?.pages || {};
    for (const pid in pages) {
      const page = pages[pid];

      if (page.pageprops && "disambiguation" in page.pageprops) {
        return false;
      }

      if (page.length !== undefined && page.length < 800) {
        return false;
      }

      if (!page.linkshere || page.linkshere.length < 10) {
        return false;
      }

      const categories = (page.categories || []).map((c) => c.title);
      const templates = (page.templates || []).map((t) => t.title);
      const allMeta = [...categories, ...templates].join(" ");
      for (const kw of SENSITIVE_KEYWORDS) {
        if (allMeta.includes(kw) || title.includes(kw)) {
          return false;
        }
      }
    }
    return true;
  } catch (e) {
    return true;
  }
}

async function getSafeRandomArticle() {
  while (true) {
    const res = await fetch(
      "https://ja.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=3&format=json",
      {
        headers: {
          "User-Agent":
            "WikiRaceApp/1.0 (https://cure88200.github.io/tights-wiki-race/)",
        },
      },
    );
    const data = await res.json();
    const titles = (data.query?.random || []).map((r) => r.title);
    for (const title of titles) {
      if (await isSafeArticle(title)) {
        return title;
      }
    }
  }
}

function getJstDateString(offsetDays = 0) {
  const date = new Date(
    Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000,
  );
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function updateDaily() {
  const historyPath = path.join(__dirname, "..", "daily_history.json");
  let history = [];
  if (fs.existsSync(historyPath)) {
    history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
  }

  history.sort((a, b) => b.date.localeCompare(a.date));
  const beforeTop3 = history.slice(0, 3);

  const todayStr = getJstDateString(0);
  const tomorrowStr = getJstDateString(1);

  const results = [];
  let updated = false;

  const getTitle = (item) => {
    if (!item) return "(なし)";
    if (item.article) return item.article;
    if (item.encrypted) return decryptArticle(item.encrypted, item.date);
    return "(不明)";
  };

  const todayItem = history.find((h) => h.date === todayStr);
  if (!todayItem) {
    const title = await getSafeRandomArticle();
    history.push({
      date: todayStr,
      encrypted: encryptArticle(title, todayStr),
    });
    results.push(`・${todayStr} (本日): 【新規追加】「${title}」`);
    updated = true;
  } else {
    results.push(
      `・${todayStr} (本日): 【スキップ】既存あり「${getTitle(todayItem)}」`,
    );
  }

  const tomorrowItem = history.find((h) => h.date === tomorrowStr);
  if (!tomorrowItem) {
    const title = await getSafeRandomArticle();
    history.push({
      date: tomorrowStr,
      encrypted: encryptArticle(title, tomorrowStr),
    });
    results.push(`・${tomorrowStr} (明日): 【新規追加】「${title}」`);
    updated = true;
  } else {
    results.push(
      `・${tomorrowStr} (明日): 【スキップ】既存あり「${getTitle(tomorrowItem)}」`,
    );
  }

  if (updated) {
    history.sort((a, b) => b.date.localeCompare(a.date));
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf8");
  }

  const afterTop3 = history.slice(0, 3);

  const formatList = (list) =>
    list
      .map((item, idx) => `  ${idx + 1}. ${item.date} : 「${getTitle(item)}」`)
      .join("\n");

  const message =
    `📋 **【tights-wiki-race】デイリー更新レポート**\n\n` +
    `**▼ 判定結果**\n${results.join("\n")}\n\n` +
    `**▼ 実行前 (最新3件)**\n${formatList(beforeTop3) || "  (なし)"}\n\n` +
    `**▼ 実行後 (最新3件)**\n${formatList(afterTop3)}`;

  const payloadPath = path.join(__dirname, "..", "discord_payload.json");
  fs.writeFileSync(payloadPath, JSON.stringify({ content: message }), "utf8");
}

updateDaily();
