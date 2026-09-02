# Task 1 実施レポート

## 変更内容

`.agents/Spec.md`を、Group Control実装の仕様契約として整理した。

* Prompt.mdのExtendScript / JSXのみという制約を明示的に変更し、C++ EffectとJSX Panelの構成を採用した。
* 対応環境をAdobe After Effects 2024+、Windows・macOSとし、Windowsの`.aex`とmacOSの`.plugin`成果物を定義した。
* C++ EffectのmatchNameを`NGS_GroupControl`、Layer CountパラメータのmatchNameを`NGS_GroupControl-LayerCount`に固定した。
* C++ EffectをパススルーEffectとし、Group Nullの識別とLayer Countの保持だけを担当する契約にした。
* Create Group直後のLayer Count初期値を`0`に固定した。
* Panel上のLayer Count有効範囲を`0..Comp全体のLayer数`、JSX側の正規化対象を`comp.numLayers`、C++ Effect内部の安全上限を`9999`と定義した。
* Group Nullの挿入位置を、選択時は最上位選択Layerの直上、未選択時はComp最上段に固定した。
* 外部Parent付きLayerを候補数に含め、後続Layerで補充しない仕様にした。
* 複数Group Null選択時は必ず処理を中断し、`Group Nullを1つだけ選択してください。`を表示する仕様にした。
* Group Null上のGroup Markerを導入し、`NGS_GROUP_CONTROL_V1`、`groupId=<id>`、`record=<layerId>,<originalParentId>`の行形式を固定した。
* Group Controlが実際に設定したParentだけをMarkerへ記録し、Layer CommentとユーザーMarkerを変更しない所有権ルールを定義した。
* Parent設定・解除をAE標準Parent動作に合わせ、ワールドTransform補正、キーフレーム補正、キーフレームのベイク、Expressionの書き換えを行わない仕様にした。
* C++ Effect、Dockable JSX Panel、Windows・macOS成果物、Windows・macOS双方の結合テストをv1完成条件へ追加した。

Prompt.mdは参照のみで、変更していない。

## 検証コマンドと出力

仕様チェックリストとして、`Spec.md`の契約項目と`Prompt.md`の中核要件をPowerShellで確認した。

```powershell
$specPath = (Resolve-Path '.agents\Spec.md').Path
$promptPath = (Resolve-Path '.agents\Prompt.md').Path
$specText = Get-Content -Raw $specPath
$promptText = Get-Content -Raw $promptPath
# 必須項目23件をContainsで確認し、失敗時はexit 1
```

出力：

```text
PASS: 対応環境 After Effects 2024+
PASS: 対応環境 Windows・macOS
PASS: C++ Effect採用の明示的変更
PASS: Dockable JSX Panel
PASS: Windows/macOS成果物
PASS: Effect matchName
PASS: Layer Count matchName
PASS: Layer Count 初期値0
PASS: Panel上限 comp.numLayers
PASS: Effect安全上限9999
PASS: Create Group 挿入位置
PASS: 外部Parent 候補数維持
PASS: 複数Group Nullで必ず中断
PASS: Group Marker形式
PASS: Parent所有権
PASS: AE標準Parent動作
PASS: 補正/キー補正/ベイクなし
PASS: 完成条件 結合テスト
PASS: Prompt中核 Group Count
PASS: Prompt中核 下方向候補
PASS: Prompt中核 AE標準Parent
PASS: Prompt中核 Parent保護
PASS: Prompt中核 複数選択メッセージ
Summary: 23/23 passed
```

差分と未変更ファイルを確認した。

```powershell
git diff --check
git diff --exit-code -- '.agents/Prompt.md'
Write-Output 'Prompt.md unchanged: PASS'
```

出力：

```text
warning: in the working copy of '.agents/Spec.md', LF will be replaced by CRLF the next time Git touches it
Prompt.md unchanged: PASS
```

`git diff --check`は終了コード0で、空白エラーはなかった。Gitの改行変換に関するwarningだけが出力された。

変更ファイル確認時の出力：

```text
 M .agents/Spec.md
.agents/Spec.md
```

## TDD対象外の理由

今回は仕様書と作業レポートだけを変更する文書作業であり、実装コード、実行時挙動、テストコードを変更していない。そのため、失敗するテストを先に作成して実装で通すTDDサイクルは対象外とした。代わりに、仕様項目の文字列チェック、Prompt.mdの中核要件確認、Git差分、Markdown差分の検証を実施した。

## 変更ファイル

* `.agents/Spec.md`: Group Control実装仕様の変更
* `.superpowers/sdd/2026-09-02-group-control/task-1-report.md`: 本レポート
* `.agents/Prompt.md`: 変更なし

## 自己レビュー

* C++ EffectとJSX Panelの責務を分離し、Prompt.mdのJSXのみという旧制約を明示的に置き換えた。
* `After Effects 2024+`、`Windows・macOS`、`0`、`comp.numLayers`、`9999`、`.aex`、`.plugin`を仕様書へ反映した。
* Group Nullの挿入位置を選択あり・なしの両方で定義した。
* 候補範囲をParent変更前に再計算し、外部Parentを理由に後続Layerを繰り上げないことを明記した。
* Group Markerの形式、Layer ID利用、元Parent ID、成功したParentだけの記録、ユーザーMarker保護を明記した。
* 複数Group Null選択時の「必ず中断」と指定メッセージを明記した。
* AE標準Parent動作、見た目補正なし、キー補正なし、ベイクなし、Expression書き換えなしをApplyとUngroupの両方に反映した。
* v1完成条件にC++ Effect、JSX Panel、両OS成果物、結合テストを追加した。
* `Prompt.md`へ書き込みが発生していないことをGit差分で確認した。

## 懸念

* 今回は仕様書のみの変更であり、C++ Effectのビルド、JSX Panelの実装、After Effects 2024+上のWindows・macOS結合テストは未実施である。これらは後続タスクで検証する。
* Gitが`Spec.md`のLFを次回操作時にCRLFへ変換するwarningを出している。`git diff --check`の終了コードは0で、内容上の空白エラーはない。
* Group Marker、Layer ID、Effect matchNameの実ホスト上の保存・再起動後復元は、After Effects実環境での結合テストが必要である。

## レビュー指摘への追記

レビュー結果がNEEDS_FIXとなったため、`Spec.md`へ次の契約を追加した。

* 管理Marker候補はGroup Null上の全Markerから、コメント先頭行が`NGS_GROUP_CONTROL`で始まるMarkerとして発見する。0件はApply時の新規作成を許可し、2件以上はApplyとUngroupを中断する。
* 1件の管理Markerは、先頭行`NGS_GROUP_CONTROL_V1`、Group Null自身のLayer IDと一致する`groupId`、record行の構文、正の整数ID、重複Layer IDなし、Group自身IDなしを検証する。構文不正、ID不正、`groupId`不一致、重複、Group自身IDはParent変更またはGroup Null削除前に中断する。
* 新規管理Markerは既存Markerのない時刻へ作成し、既存のユーザーMarker、Layer Comment、管理Marker以外のコメントと時刻を変更しない。固定Status文言を仕様書へ定義した。
* Applyの順序を、Apply前検証、安全判定 / 候補、状態退避、旧所有Parent解除、再計算 / スキップ、成功記録Marker更新の順に固定した。
* 予期せぬエラー時は、退避したParentと管理Markerを変更前へ戻し、Apply中に新規作成した管理Markerだけを削除する。復元失敗時のStatus文言も固定した。
* Undo Groupは各操作で1つだけ作成し、`try/finally`の`finally`内で`app.endUndoGroup()`を一度だけ実行する契約にした。
* Rootは影響Transform配下の有効Expressionが1つでもあればそのRootだけをスキップする。Group NullはPosition、Scale、Rotation、3D Orientation、3D X/Y/Z Rotationのいずれかにキーが1つでもあればApply全体を開始しない。
* 非Expressionの通常キーフレームはキー補正なしでAE標準Parent動作を使う。外部Parent、Expression付きRoot、循環Parentのスキップは候補数を維持し、後続Layerで補充せず、固定形式のStatus Textへ件数を表示する。

## レビュー指摘対応後の検証

レビュー3点に対する17項目の仕様チェックを再実行した。

```text
PASS: 管理Marker候補の発見
PASS: 0件の新規作成許可
PASS: 2件以上のApply/Ungroup中断
PASS: 先頭行とgroupId一致検証
PASS: 構文/ID/重複/自己ID検証
PASS: 不正時の変更前中断
PASS: 空き時刻への新規Marker
PASS: ユーザーMarker非破壊
PASS: Marker固定Status文言
PASS: Apply順序固定
PASS: 予期せぬエラー時の復元
PASS: Undo try/finally一度だけ
PASS: Root有効Expressionスキップ
PASS: Group Null 3Dキー全体中断
PASS: キー中断の前処理禁止
PASS: 非Expression keyframe標準Parent
PASS: スキップ候補数維持/Status件数
Summary: 17/17 passed
```

追加で次を確認した。

```powershell
git diff --check
git diff --exit-code -- '.agents/Prompt.md'
Write-Output 'Prompt.md unchanged: PASS'
git status --short --untracked-files=all
```

出力：

```text
warning: in the working copy of '.agents/Spec.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of '.superpowers/sdd/2026-09-02-group-control/task-1-report.md', LF will be replaced by CRLF the next time Git touches it
Prompt.md unchanged: PASS
 M .agents/Spec.md
 M .superpowers/sdd/2026-09-02-group-control/task-1-report.md
```

終了コードは0だった。Gitの改行変換warning以外の差分エラーはなく、Prompt.mdは未変更である。

## 再レビュー指摘への追記

再レビューで残った2点に対応し、既存のレビュー済み契約を維持した。

* Marker更新節に、`groupId`はGroup Nullの`Layer.id`、`layerId`は対象Layerの`Layer.id`、`originalParentId`はその対象LayerをGroup NullへParentする直前のParent Layerの`Layer.id`、Parentなしは`0`と明記した。Ungroupは`originalParentId`を復元先として使い、`0`はParentなし、存在して循環しないLayer IDはそのLayerへ復元、存在しない場合はParentなしとする契約へ接続した。
* Apply成功Statusの集計行とプレースホルダー名を固定した。新規Marker作成を伴う成功時は`Group Markerを新規作成しました。`と集計行の2行、既存Marker更新時は集計行だけの1行とした。
* Apply未適用時は固定理由行だけを表示し、成功集計行を表示しないことを明記した。予期せぬエラー後に復元できた場合と復元にも失敗した場合のStatusも固定した。

## 再レビュー残項目対応後の検証

Markerフィールドの意味、Ungroup復元先、Apply Statusの出力規則と、前回確認済みの契約を合わせて27項目を再検証した。

```text
PASS: groupIdはGroup NullのLayer.id
PASS: layerIdは対象LayerのLayer.id
PASS: originalParentIdはParent直前のLayer.id
PASS: Parentなしは0
PASS: Ungroup復元先がoriginalParentId
PASS: Apply集計プレースホルダー固定
PASS: 新規Marker成功は2行
PASS: 既存Marker更新成功は集計1行
PASS: 未適用は理由行のみ
PASS: 失敗復元Status固定
PASS: 管理Marker候補の発見
PASS: 0件の新規作成許可
PASS: 2件以上のApply/Ungroup中断
PASS: 先頭行とgroupId一致検証
PASS: 構文/ID/重複/自己ID検証
PASS: 不正時の変更前中断
PASS: 空き時刻への新規Marker
PASS: ユーザーMarker非破壊
PASS: Marker固定Status文言
PASS: Apply順序固定
PASS: 予期せぬエラー時の復元
PASS: Undo try/finally一度だけ
PASS: Root有効Expressionスキップ
PASS: Group Null 3Dキー全体中断
PASS: キー中断の前処理禁止
PASS: 非Expression keyframe標準Parent
PASS: スキップ候補数維持/Status件数
Summary: 27/27 passed
```

差分とPrompt.mdの未変更も再確認した。

```powershell
git diff --check
git diff --exit-code -- '.agents/Prompt.md'
Write-Output 'Prompt.md unchanged: PASS'
git diff --name-only
git status --short --untracked-files=all
```

出力：

```text
warning: in the working copy of '.agents/Spec.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of '.superpowers/sdd/2026-09-02-group-control/task-1-report.md', LF will be replaced by CRLF the next time Git touches it
Prompt.md unchanged: PASS
.agents/Spec.md
.superpowers/sdd/2026-09-02-group-control/task-1-report.md
 M .agents/Spec.md
 M .superpowers/sdd/2026-09-02-group-control/task-1-report.md
```

各コマンドの終了コードは0だった。Gitの改行変換warning以外の差分エラーはなく、変更対象はSpec.mdと本レポートだけである。

実装上の未解決点はない。今回の作業は仕様書の契約更新だけであり、After Effects実機でのMarker API、Layer.idの保存・復元、Status Textの改行表示は後続実装時に確認する。
