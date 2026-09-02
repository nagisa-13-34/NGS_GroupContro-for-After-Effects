# Group Control実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** After Effects 2024以降のWindows・macOSで、C++製Group Control EffectとExtendScript / ScriptUI Panelを連携させ、Group Null直下のLayer Count分を安全にParent制御する。

**Architecture:** C++ EffectはGroup Null識別用のEffectと整数Layer Countを提供する。JSX PanelがLayer順、Parent構造、Group Marker、Undo、UIを管理し、Effect自体は画像処理やParent変更を行わない。

**Tech Stack:** After Effects SDK、C++、ExtendScript / JSX、ScriptUI、Visual Studio、Xcode、Node.js標準機能によるロジックテスト。CEP、UXP、外部ランタイムライブラリは使用しない。

**Spec:** \`C:/work/NGS_GroupContro_for_AE/.agents/Spec.md\`。\`Prompt.md\`からの変更は、C++ Effectを許可することと、最新決定のAE標準Parent動作を採用すること。

## Global Constraints

- 対応環境はWindows・macOS、After Effects 2024以降。
- JSX PanelはScriptUIのDockable Panelとして実装する。
- C++ Effectは、標準JSXのみというPrompt.mdの制約を置き換える明示的な拡張仕様である。
- Effect matchNameは\`NGS_GroupControl\`、Layer Count parameter matchNameは\`NGS_GroupControl-LayerCount\`とする。
- Create Group直後のLayer Countは\`0\`。
- Panel上のLayer Count上限はComp全体のLayer数。Effect内部の安全上限は9999とし、JSX側でCompのLayer数へ正規化する。
- 選択があれば最上位選択Layerの直上、選択がなければComp最上段へGroup Nullを作成する。
- 複数Group Null選択時は処理を中断し、\`Group Nullを1つだけ選択してください。\`を表示する。
- 外部Parent付きLayerは候補数に含めるが、後続Layerで補充しない。
- Group MarkerにLayer IDと元Parent IDを保存し、Layer CommentとユーザーMarkerは変更しない。
- Parent変更はAE標準Parent動作を使う。ワールドTransform補正、キーフレームのベイク、Expression書き換えは行わない。
- Expression付きRootとアニメーション中Group Nullは安全のためスキップし、Status Textへ理由を表示する。Expressionのないキーフレーム付きLayerはAE標準Parent動作で処理する。
- 各ユーザー操作は名前付きUndo Groupを1つだけ作る。内部処理関数はUndo Groupを開始しない。
- 現在のワークスペースは実装コード未作成で、実装開始時にGit管理状態を確認する。実行役には\`C:/Users/amber/.codex/agents/luna-worker.toml\`を使用する。

### Task 1: Spec.mdを実装可能な契約へ整理する

**Files:**
- Modify: \`C:/work/NGS_GroupContro_for_AE/.agents/Spec.md\`

- [ ] C++ Effect採用をPrompt.mdからの明示的な変更として記載する。
- [ ] 対応環境、初期値0、Panel上限、挿入位置、外部Parentの候補数維持を記載する。
- [ ] 複数Group Null選択時は必ず中断する仕様へ修正する。
- [ ] Group Markerの形式とParent所有権を記載する。
- [ ] 最新決定に合わせ、見た目補正・キー補正・ベイクを行わないことを記載する。
- [ ] C++ Effect、JSX Panel、Windows/macOS成果物、結合テストを完成条件へ追加する。
- [ ] 仕様チェックリストを実行し、Prompt.mdの中核要件を確認する。
- [ ] Gitリポジトリがある場合は変更をコミットする。

### Task 2: C++ Group Control Effectを実装する

**Files:**
- Create: \`plugin/GroupControl/GroupControl.cpp\`
- Create: \`plugin/GroupControl/GroupControl.h\`
- Create: \`plugin/GroupControl/GroupControlParams.h\`
- Create: \`plugin/win/GroupControl.sln\`
- Create: \`plugin/mac/GroupControl.xcodeproj\`

**Interfaces:**

```text
Effect display name: Group Control
Effect matchName: NGS_GroupControl
Parameter display name: Layer Count
Parameter matchName: NGS_GroupControl-LayerCount
Parameter range: 0..9999
Default: 0
```

- [ ] After Effects SDKのEffectサンプルを基にWindows・macOSのビルド構成を作る。
- [ ] Layer Countを整数Sliderとして1つだけ登録する。
- [ ] Effectをパススルーとして実装し、画像処理を行わない。
- [ ] Parent、Layer検索、Marker、UI処理をC++側へ実装しない。
- [ ] Windowsの\`.aex\`とmacOSの\`.plugin\`をビルドする。
- [ ] After Effects 2024以降でEffectを追加でき、保存・再起動後も値が保持されることを確認する。

### Task 3: JSX純粋ロジックとGroup Markerを実装する

**Files:**
- Create: \`panel/GroupControlCore.jsxinc\`
- Create: \`tests/group_control_core.test.js\`

**Interfaces:**

```javascript
clampLayerCount(rawValue, compLayerCount) -> Number
getTargetIndexRange(groupIndex, layerCount, totalLayers) -> Object
getRootLayerIds(targetRecords) -> Array
wouldCreateParentCycle(layerId, proposedParentId, parentMap) -> Boolean
encodeGroupState(state) -> String
decodeGroupState(markerComment) -> GroupState
```

\`GroupState\`は次の形に固定する。

```javascript
{
    version: 1,
    groupId: 123,
    records: [
        { layerId: 456, originalParentId: 0 }
    ]
}
```

- [ ] ExtendScript互換のES3構文だけで実装する。
- [ ] Markerコメント形式を\`NGS_GROUP_CONTROL_V1\`、\`groupId=<id>\`、\`record=<layerId>,<originalParentId>\`の行形式に固定する。
- [ ] Group Null上の管理Markerだけを更新し、ユーザーMarkerは保持する。
- [ ] Layer IDを識別子に使い、Layer indexを永続識別子にしない。
- [ ] Marker不正時はParent変更を開始せずエラーを返す。
- [ ] Node.js標準の\`assert\`で、対象範囲、Root判定、循環検出、Marker往復変換をTDDで検証する。

### Task 4: JSX PanelとAfter Effectsアダプタを実装する

**Files:**
- Create: \`panel/GroupControl.jsx\`

**Interfaces:**

```javascript
buildUI(thisObj) -> Panel or Window
getActiveComp() -> CompItem or null
isGroupLayer(layer) -> Boolean
getSelectedGroup(comp) -> SelectionResult
getLayerCount(group, comp) -> Number
setLayerCount(group, comp, value) -> Number
getTargetLayers(group, comp) -> Array
getRootLayers(targetLayers) -> Array
```

- [ ] \`thisObj instanceof Panel\`ならDockable Panelとして、その他は開発用Windowとして動作させる。
- [ ] UIへCreate Group、Selected Group、Status Text、Layersの+/-、Apply、Ungroupを配置する。
- [ ] Create Groupは選択があれば最上位選択Layerの直上、なければ最上段へNullを作成する。
- [ ] Null名は\`[G] Group\`、重複時は最小の未使用番号を使う。
- [ ] C++ Effect追加に失敗した場合は作成したNullを残さず、Status Textへ表示する。
- [ ] Group判定はNull Layer、Effect matchName、Layer Count parameter matchNameを確認する。
- [ ] Layer Countを整数化し、0から\`comp.numLayers\`へ正規化する。
- [ ] ボタン操作前後とPanelアクティブ化時だけUIを更新し、常時監視は行わない。
- [ ] 指定された日本語エラー文をStatus Textへ表示し、通常操作でalertを使わない。
- [ ] 各ボタン操作を名前付きUndo Groupで囲む。

### Task 5: Apply、Parent所有権、Ungroupを実装する

**Files:**
- Modify: \`panel/GroupControl.jsx\`
- Modify: \`panel/GroupControlCore.jsxinc\`
- Modify: \`tests/group_control_core.test.js\`

**Interfaces:**

```javascript
applyGroupCore(group, comp) -> ApplyResult
removePreviousGroupParents(group, comp, oldState) -> Array
applyGroup(group, comp) -> ApplyResult
ungroupCore(group, comp) -> UngroupResult
ungroup(group, comp) -> UngroupResult
```

Applyの順序を固定する。

- [ ] 現在のGroup indexとLayer Countから候補LayerをParent変更前に取得する。
- [ ] 以前のMarkerを読み込み、現在Parentが対象Group Nullである記録だけを解除する。
- [ ] ユーザーが手動変更したParentは上書きも解除もしない。
- [ ] 解除後のParent構造からRoot Layerを再計算する。
- [ ] 外部Parent付きLayerはスキップし、後続Layerで補充しない。
- [ ] 循環ParentになるLayerは該当Layerだけスキップする。
- [ ] Rootの現在Parentがnullの場合だけGroup NullへParentする。
- [ ] 成功したParent変更だけをMarkerへ記録する。
- [ ] Status Textへ候補数、接続数、解除数、外部Parentスキップ数、循環スキップ数を表示する。
- [ ] エラー時は変更済みParentとMarkerを可能な範囲で元へ戻す。
- [ ] Expression付きRootとアニメーション中Group NullはParent変更せず、理由を表示する。
- [ ] キーフレーム付きだがExpressionのないLayerはキー補正せずAE標準Parent動作で処理する。

Ungroupの順序を固定する。

- [ ] Marker不正時は削除処理を開始しない。
- [ ] 記録Layerの現在Parentが対象Group Nullの場合だけ解除する。
- [ ] 元Parentが存在し循環しない場合は元Parentへ戻し、存在しない場合はParentなしへ戻す。
- [ ] ユーザーがParentを変更していた場合は上書きしない。
- [ ] Transform値、キーフレーム、Expressionの補正や書き換えは行わない。
- [ ] Marker外の直接子Layerがある場合はGroup Null削除を中断する。
- [ ] Nested Group Nullを削除する場合、外側GroupのMarkerが関係を管理していることを確認し、確認できなければ中断する。
- [ ] 管理Parentの解除とMarker削除後にGroup Nullを削除する。

### Task 6: 結合テスト、導入資料、成果物を整える

**Files:**
- Create: \`docs/installation.md\`
- Create: \`docs/test-matrix.md\`

- [ ] Windows・macOSへEffectを導入し、JSX Panelから追加できることを確認する。
- [ ] ScriptUI PanelsへJSXファイルを配置し、Windowメニューから開けることを確認する。
- [ ] Active Compなし、Group Null未選択、複数選択、通常Layerとの同時選択を確認する。
- [ ] Create Groupの挿入位置、連番命名、初期値0、Effect保存を確認する。
- [ ] +/−、0未満防止、Comp Layer数上限、Layer Count超過時の対象制限を確認する。
- [ ] Group Null移動後のApplyを確認する。
- [ ] 内部Parent、外部Parent、Layer Count減少、ユーザー変更Parentの保護を確認する。
- [ ] Group Null同士の循環、Nested Group NullのUngroup、Marker破損を確認する。
- [ ] キーフレーム付きLayerとExpression付きRootが仕様どおり処理されることを確認する。
- [ ] Create Group、Layer Count +、Layer Count -、Apply、Ungroupを個別にUndoできることを確認する。
- [ ] 100〜500Layer程度のCompでApplyが実用時間内に完了することを確認する。
- [ ] 保存・再起動後のMarker、Effect、Parent状態を確認する。
- [ ] Windows・macOSの成果物、導入手順、テスト結果を記録する。
- [ ] 全検証後に完成コミットを作成する。

## 完了条件

- C++ EffectをWindows・macOSのAfter Effects 2024以降へ導入できる。
- Dockable JSX PanelからGroup Nullを作成できる。
- Group Control EffectとLayer Countを保存できる。
- Group Null移動後のApplyでLayer Count分の候補を再計算できる。
- 内部Parent構造とユーザー変更Parentを壊さない。
- 外部Parent、循環、Marker破損を安全に処理できる。
- Group Controlが設定したParentだけを解除できる。
- AE標準Parent動作に従い、Transform・キーフレーム・Expressionを補正しない。
- すべてのユーザー操作をUndoできる。
- Windows・macOS双方の結合テストと導入手順が確認できる。
