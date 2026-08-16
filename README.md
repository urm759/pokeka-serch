# Pokémon PSA10 ROI Board

GitHub Pages でそのまま公開しやすい静的サイトです。

## 仕組み

- `index.html` が本体
- `app.js` でフィルタと利益率計算
- `data/pokemon-cards-meta.js` にデータ取得日を保持
- `data/pokemon-cards.json` に `toreca-souba.com` のポケモンカード全件を集約
- 画面上で `鑑定費`、`直近30日下限`、`直近7日下限`、`利益率下限`、`PSA10上下限`、`美品価格帯`、`検索` を変更可能
- URL パラメータ `?fee=13000&tx=30&tx7=0&roi=40&psaMin=0&psaMax=200000&priceMin=&priceMax=&sort=roi-desc&q=` にも対応
- 利率は `利益 ÷ (美品価格 + 鑑定費) × 100`

## 変更しやすい箇所

- 鑑定費を変えたい: 画面上部の入力欄
- 取引数の条件を変えたい: `直近30日 下限`
- 直近7日の動きも絞りたい: `直近7日 下限`
- PSA10 20万円以下に絞りたい: `PSA10 上限`
- PSA10 の最低価格も見たい: `PSA10 下限`
- 美品の値段レンジを絞りたい: `美品 価格帯`
- データ取得日を変えたい: `data/pokemon-cards-meta.js`
- 画像やカードを増やしたい: `data/pokemon-cards.json`
- 並び順を変えたい: `並び順` セレクト

## 自動更新

- `work/update_pokemon_site.js` を実行すると、toreca-souba の公開データからポケモンカード一覧とメタ情報を再生成します
- `.github/workflows/update-pokemon-site.yml` で定期実行と手動実行を両方できるようにしています
- GitHub Pages では、ワークフローが更新した `outputs/github-site/data/*` をそのまま配信できます

## GitHub Pages に置く方法

1. この `github-site` フォルダの中身を GitHub リポジトリに入れる
2. GitHub Pages の公開元をリポジトリ root または `docs/` に設定する
3. `index.html` をルートに置けばそのまま表示される

## 現在の抽出条件

- ポケモンカードのみ
- 直近30日の取引数が 30 件以上
- 利益率が 40%以上
- 鑑定費は初期値 13,000円
