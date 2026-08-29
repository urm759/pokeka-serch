const fs = require("fs");
const path = require("path");

const ACCOUNTS = [{ shopId: "laurier-akiba", screenName: "laurier_akiba" }];
const CAPTURE_PATH = path.join(__dirname, "x_buyback_capture.json");
const OUTPUT_PATH = path.join(__dirname, "x_buyback_pending.json");

function read(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return fallback; }
}

function jstDate(value) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(value));
}

function collectTweets(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (value.id_str && value.created_at && (value.extended_entities?.media || value.entities?.media)) output.push(value);
  for (const child of Object.values(value)) collectTweets(child, output);
  return output;
}

async function fetchAccount(account) {
  const url = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${account.screenName}?lang=ja&dnt=true`;
  let response;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (response.ok) break;
    if (response.status !== 429 || attempt === 3) throw new Error(`${account.screenName}: HTTP ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
  }
  const html = await response.text();
  const source = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (!source) throw new Error(`${account.screenName}: timeline data not found`);
  const tweets = collectTweets(JSON.parse(source));
  return [...new Map(tweets.map((tweet) => [tweet.id_str, tweet])).values()].map((tweet) => {
    const media = tweet.extended_entities?.media || tweet.entities?.media || [];
    return {
      shopId: account.shopId,
      postId: tweet.id_str,
      date: jstDate(tweet.created_at),
      url: `https://x.com/${account.screenName}/status/${tweet.id_str}`,
      text: tweet.full_text || tweet.text || "",
      images: media.filter((item) => item.type === "photo").map((item) => `${item.media_url_https}?format=jpg&name=orig`),
    };
  }).filter((post) => post.images.length && (/PSA\s*10|PSA10|買取/i.test(post.text) || /^[②③④⑤]/.test(post.text)));
}

async function main() {
  const reviewed = read(CAPTURE_PATH, { posts: [] });
  const reviewedIds = new Set((reviewed.posts || []).filter((post) => post.reviewComplete !== false).map((post) => `${post.shopId}:${post.postId}`));
  const partialPosts = (reviewed.posts || []).filter((post) => post.reviewComplete === false);
  const partialIds = new Set(partialPosts.map((post) => `${post.shopId}:${post.postId}`));
  const latestReviewedDate = (reviewed.posts || []).map((post) => post.date || "").sort().at(-1) || "0000-00-00";
  const prior = read(OUTPUT_PATH, { posts: [] });
  const all = [];
  const errors = [];
  for (const account of ACCOUNTS) {
    try { all.push(...await fetchAccount(account)); } catch (error) { errors.push(String(error.message || error)); }
  }
  const posts = [...new Map([...partialPosts, ...(prior.posts || []), ...all].map((post) => [`${post.shopId}:${post.postId}`, post])).values()]
    .filter((post) => !reviewedIds.has(`${post.shopId}:${post.postId}`))
    .filter((post) => partialIds.has(`${post.shopId}:${post.postId}`) || post.date >= latestReviewedDate)
    .filter((post) => partialIds.has(`${post.shopId}:${post.postId}`) || /買取表|強化買取|PSA\s*10.*買取|^[②③④⑤]/i.test(post.text || ""))
    .sort((a, b) => b.date.localeCompare(a.date) || b.postId.localeCompare(a.postId));
  const payload = { checkedAt: new Date().toISOString(), accounts: ACCOUNTS, pendingCount: posts.length, posts, errors };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload), "utf8");
  console.log(JSON.stringify({ checkedAt: payload.checkedAt, detected: all.length, pending: posts.length, errors }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
