# Group Controlの配布

## Panel用JSXを作る

`GroupControl.jsx`をそのままバイナリ化すると、変換ツールによっては`#include`が展開されず、Panelが空になる。
先にプロジェクトのルートで次を実行する。

```powershell
node tools/build_group_control_panel_bundle.js
```

生成される`build/distribution/NGS_GroupControl.jsx`は、次の2つを内部へ展開した1本のJSXである。

```text
panel/GroupControlCore.jsxinc
panel/GroupControlEffectSync.jsxinc
```

この生成ファイルを使用してJSXBINへ変換する。
変換後のファイルに`#include`が残っていないことと、`var GroupControlPanel = buildUI(this);`が含まれることを確認する。

## Windowsの配布物

Panel、ネイティブEffect、`LICENCE`をまとめて配布する。

```text
NGS_GroupControl_Windows/
├─ NGS_GroupControl.jsxbin
├─ GroupControl.aex
└─ LICENCE
```

`GroupControl.aex`は`build/win/Release/GroupControl.aex`から取得する。
`LICENCE`はリポジトリのルートからコピーする。無償の配布・譲渡・再配布でも、ライセンス全文の同梱と同じ条件の継承が必要になる。

利用者側では、After Effectsを終了してから次へ配置する。

```text
Support Files\Scripts\ScriptUI Panels\NGS_GroupControl.jsxbin
Support Files\Plug-ins\NGS Group Control\GroupControl.aex
```

After Effectsを再起動すると、`Window`メニューからPanelを開ける。
ネイティブEffectが未配置の場合、Panelが開いてもGroup Control Effectの作成は失敗する。

## 開発用のJSXを渡す場合

JSXBINに変換しない場合は、次の4ファイルを同じフォルダへ置く。

```text
GroupControl.jsx
GroupControlCore.jsxinc
GroupControlEffectSync.jsxinc
LICENCE
```
