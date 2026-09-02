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
