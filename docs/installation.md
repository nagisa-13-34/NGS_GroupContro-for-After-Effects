# Group Controlの配布

## 更新通知

Panelを開くと約2秒後に[更新情報のGist](https://gist.github.com/nagisa-13-34/0e72cd46bf8d9b1e546d9d016e3326ee)を確認し、開いている間は5分ごとに確認する。Gistの`latestVersion`が`panel/GroupControl.jsx`の`GROUP_CONTROL_PANEL_VERSION`より新しい場合、Panel上部に通知と更新ページを開くボタンを表示する。`releaseNotes`は通知のツールチップに表示する。OSの`curl`を使用し、取得できない場合は5分後に再試行する。

新しい版を配布するときはPanelの版番号とGistの`latestVersion`を合わせ、`downloadUrl`を実際の配布先へ更新する。`downloadUrl`には、引用符やクエリを含まないHTTPS URLを設定する。

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

権利者の公式配布物、またはライセンス条件を満たす改変版は、Panel、ネイティブEffect、`LICENCE`をまとめる。

```text
NGS_GroupControl_Windows/
├─ NGS_GroupControl.jsxbin
├─ GroupControl.aex
└─ LICENCE
```

`GroupControl.aex`は`build/win/Release/GroupControl.aex`から取得する。
`LICENCE`はリポジトリのルートからコピーする。第三者が配布・譲渡・再配布できるのは、自分が受け取った版のプログラムコードを改変した版だけである。その場合も無償とし、ライセンス全文の同梱と同じ条件の継承が必要になる。

利用者側では、After Effectsを終了してから次へ配置する。

```text
Support Files\Scripts\ScriptUI Panels\NGS_GroupControl.jsxbin
Support Files\Plug-ins\NGS Group Control\GroupControl.aex
```

After Effectsを再起動すると、`Window`メニューからPanelを開ける。
ネイティブEffectが未配置の場合、Panelが開いてもGroup Control Effectの作成は失敗する。

## 開発用のJSXを渡す場合

JSXBINに変換しない場合は、次の4ファイルを同じフォルダへ置く。第三者が渡す場合は、上記のコード改変と配布条件を守る。

```text
GroupControl.jsx
GroupControlCore.jsxinc
GroupControlEffectSync.jsxinc
LICENCE
```
