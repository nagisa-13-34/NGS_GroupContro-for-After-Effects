# NGS Group Control for After Effects

After Effectsのタイムライン上で、指定した数のレイヤーをGroup Nullからまとめて扱うScriptUI PanelとネイティブEffectです。AviUtlの「グループ制御」に近い操作を目指しています。

対応環境はAfter Effects 2024以降のWindows / macOSです。機能の図解や注意点は[HTML版README](README.html)にまとめています。

## できること

- Group Nullの下にあるレイヤーを、`Layer Count`で指定した数だけ対象にする
- 対象レイヤーの既存のParent関係を保ちながら、Group NullからTransformを操作する
- Group Nullへ追加した通常Effectを対象レイヤーへ順次同期する
- `Apply`で対象を更新し、`Ungroup`で管理したParentとEffectを元に戻す

## 導入と使い方

動作にはPanelとネイティブEffectが必要です。After Effectsを終了してからPanelとEffectを配置し、再起動します。Windows版では、`NGS_GroupControl.jsxbin`を`Support Files\Scripts\ScriptUI Panels\`へ、`GroupControl.aex`を`Support Files\Plug-ins\NGS Group Control\`へ配置します。macOS版の導入手順とPanelが空になる場合の確認事項は[HTML版READMEの導入](README.html#install)を参照してください。

1. 対象にしたいレイヤーを選び、Panelの`Create Group`を押す。
2. Group Nullの`Layer Count`で対象数を調整し、必要に応じて`Apply`する。
3. Group NullのTransformやEffectで対象レイヤーを操作する。解除するときは`Ungroup`を押す。

開発用JSXやWindows配布物の作り方は[配布手順](docs/installation.md)を参照してください。

## 開発

- `panel/`: ScriptUI PanelとExtendScriptのロジック
- `plugin/`: C++のネイティブEffectとWindows / macOS用プロジェクト
- `tools/`: Panel用BundleとJSXBINの生成
- `tests/`: Nodeの回帰テストとAfter Effects内で実行する確認用スクリプト
- `docs/`: 配布、ビルド、検証の資料

Nodeの回帰テストはリポジトリのルートで次のように実行できます。

```powershell
node --test (Get-ChildItem -LiteralPath tests -Filter '*.test.js' -File | Select-Object -ExpandProperty FullName)
```

ネイティブEffectのビルドにはAfter Effects SDKが必要です。SDKにはAdobeの条件が適用されるため、このリポジトリや配布物にSDKを含めないでください。ビルド手順は[検証資料](docs/group-effect-validation.md)と[macOSビルド手順](docs/github-macos-build.md)を参照してください。

## ライセンス

このプロジェクトは[独自の利用許諾条件](LICENCE)で公開しています。

| 行為 | 条件 |
| --- | --- |
| 個人利用・商用利用・改変 | 許可 |
| 自分がコードを改変した版の無償での配布・譲渡・再配布 | `LICENCE`を同梱し、同じ条件を引き継ぐ場合に許可 |
| 受け取ったコードをそのまま配布・譲渡・再配布 | 無償でも禁止 |
| 販売・転売・有料での配布や譲渡 | 禁止 |
| `LICENCE`を同梱しない配布や譲渡 | 無償でも禁止 |

商用利用には、本ソフトウェアを使った制作物や受託制作の成果物の販売を含みます。本ソフトウェアそのものを有料で渡すことはできません。ファイル名や文書だけの変更、元のコードの再ビルドは、配布を許す「改変」には当たりません。正確な条件は[LICENCE](LICENCE)を確認してください。
