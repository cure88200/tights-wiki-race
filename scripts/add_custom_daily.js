const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SALT = "tights-wiki-race-secret-salt";

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

const [, , targetDate, title] = process.argv;
if (!targetDate || !title) {
  console.log('使い方: node scripts/add_custom_daily.js YYYY-MM-DD "記事名"');
  process.exit(1);
}

const historyPath = path.join(__dirname, "..", "daily_history.json");
let history = fs.existsSync(historyPath)
  ? JSON.parse(fs.readFileSync(historyPath, "utf8"))
  : [];

const encrypted = encryptArticle(title, targetDate);
const existingIdx = history.findIndex((item) => item.date === targetDate);

if (existingIdx !== -1) {
  history[existingIdx] = { date: targetDate, encrypted };
} else {
  history.push({ date: targetDate, encrypted });
}

history.sort((a, b) => b.date.localeCompare(a.date));
fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf8");
console.log(`✨ ${targetDate} に「${title}」を暗号化して登録したよ！`);
