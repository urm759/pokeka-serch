# Pokémon PSA10 ROI Board

GitHub Pages でそのまま公開しやすい静的サイトです。

## 仕組み

- `index.html` が本体
- `app.js` でフィルタと利益率計算
- `data/pokemon-cards.json` に `toreca-souba.com` のポケモンカード全件を集約
- 画面上で `鑑定費`、`直近30日下限`、`利益率下限`、`PSA10上限`、`検索` を変更可能
- URL パラメータ `?fee=13000&tx=30&roi=40&psaMax=200000&sort=roi-desc&q=` にも対応

## 変更しやすい箇所

- 鑑定費を変えたい: 画面上部の入力欄
- 取引数の条件を変えたい: `直近30日 下限`
- PSA10 20万円以下に絞りたい: `PSA10 上限`
- 画像やカードを増やしたい: `data/pokemon-cards.json`
- 並び順を変えたい: `並び順` セレクト

## GitHub Pages に置く方法

1. この `github-site` フォルダの中身を GitHub リポジトリに入れる
2. GitHub Pages の公開元をリポジトリ root または `docs/` に設定する
3. `index.html` をルートに置けばそのまま表示される

## 現在の抽出条件

- ポケモンカードのみ
- 直近30日の取引数が 30 件以上
- 利益率が 40%以上
- 鑑定費は初期値 13,000円
