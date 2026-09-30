# NGS Group Control for After Effects

After Effectsのタイムライン上のレイヤーを、Group Nullからまとめて操作するPanelとEffectです。
この配布物は無償です。

## 対応環境

- Adobe After Effects 2024以降
- Windows / macOS

## ファイル

- `NGS_GroupControl.jsxbin` — After EffectsのPanel
- `AEX/GroupControl.aex` — Windows用Effect
- `Plugin/GroupControl.plugin` — macOS用Universal Effect
- `LICENCE` — 利用許諾条件

## インストール

After Effectsを終了してから、Panelとお使いのOS用Effectを配置します。配置後、After Effectsを再起動してください。

### Windows

- `NGS_GroupControl.jsxbin`をAfter Effectsの`Support Files\Scripts\ScriptUI Panels\`へコピー
- `AEX\GroupControl.aex`を`Support Files\Plug-ins\NGS Group Control\`へコピー

### macOS

- `NGS_GroupControl.jsxbin`をAfter Effectsの`Scripts/ScriptUI Panels/`へコピー
- `Plugin/GroupControl.plugin`を`Plug-ins/NGS Group Control/`へコピー
- After Effects 2024以外では、インストール先のバージョン名を読み替えてください

起動後、`Window`メニューからPanelを開きます。PanelとネイティブEffectの両方が必要です。

## 基本の使い方

1. コンポジションで対象レイヤーを選び、`Create Group`を押します。
2. Group Nullの`Layer Count`で対象数を調整します。
3. Group NullのTransformやEffectで、対象レイヤーをまとめて操作します。
4. 解除するときはGroup Nullを選び、`Ungroup`を押します。

Group Nullに追加した通常Effectの同期には、Panelを開いておく必要があります。Group NullのTransformにキーフレームがある場合は`Apply`できません。v1.0ではグループ全体の不透明度調整に対応していません。

## ライセンス

本ソフトを使った作品の商用利用は可能です。本ソフト自体の有料販売は禁止されています。再配布などの条件は、同梱の`LICENCE`をご確認ください。

より詳しい説明は、[プロジェクトのREADME](../README.md)をご覧ください。
