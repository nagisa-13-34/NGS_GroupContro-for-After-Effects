# Group Control for After Effects — SPEC.md

## 1. 概要

After Effects上で、AviUtlの「グループ制御」に近い操作感を実現するC++ EffectとJSX Panel。

専用のGroup Nullを作成し、Group Nullの直下にある指定数のレイヤーをグループ対象として扱う。

グループ対象レイヤーは、Group NullのPosition / Scale / Rotationによってまとめて操作できる。

C++ EffectはGroup Nullの識別とLayer Countの保持だけを担当し、レイヤー検索、Parent変更、Marker管理、Undo、UIはJSX Panelが担当する。

v1では「レイヤー数指定」を最重要機能とする。

---

# 2. 基本コンセプト

タイムラインが以下の場合、

```text
[G] Character
Head
Body
Arm
Shadow
Background
```

Group NullのLayer Countが `4` の場合、

```text
[G] Character
├ Head
├ Body
├ Arm
└ Shadow

Background
```

として扱う。

つまり、

* Group Null自身はカウントしない
* Group Nullより下方向のレイヤーを対象にする
* Layer Countで対象数を決める
* 対象レイヤーをGroup NullでまとめてTransformする

---

# 3. 対応環境

* Adobe After Effects 2024+
* Windows・macOS
* C++ Effect（Group Control）
* ExtendScript / JSX + ScriptUI Panel
* ScriptUI PanelはAfter EffectsのWindowメニューから開けるDockable Panelとして動作すること
* Windows成果物は`.aex`、macOS成果物は`.plugin`とする
* C++ Effect採用は、Prompt.mdにある「ExtendScript / JSX + ScriptUIのみ」という制約を置き換える本仕様の明示的な変更である
* CEP、UXP、外部ランタイムライブラリは使用しない

---

# 4. Group Null

## 4.1 作成

スクリプトの `Create Group` を実行すると、現在のコンポジションにNull Layerを作成する。

作成位置は次のとおり固定する。

* レイヤーが選択されている場合は、最上位選択Layerの直上に作成する
* レイヤーが選択されていない場合は、Comp最上段に作成する

Null名の初期値：

```text
[G] Group
```

同名レイヤーが存在する場合は、

```text
[G] Group 2
[G] Group 3
```

のように重複しない名前を付ける。

---

## 4.2 Group識別方法

Group NullにはC++製の専用Effectを追加する。

Effect名：

```text
Group Control
```

Effect matchName：

```text
NGS_GroupControl
```

Effect内部にはLayer Countという整数Sliderパラメータを1つだけ持たせる。

パラメータ名：

```text
Layer Count
```

パラメータ matchName：

```text
NGS_GroupControl-LayerCount
```

パラメータ範囲は`0..9999`、初期値は`0`とする。

C++ EffectはパススルーEffectとし、画像処理やParent変更を行わない。

Group Nullかどうかの判定は、

* Null Layerである
* matchNameが`NGS_GroupControl`のEffectを持っている
* そのEffectにmatchNameが`NGS_GroupControl-LayerCount`のパラメータを持っている

のすべてを満たした場合とする。

レイヤー名 `[G]` のみで判定しない。

---

# 5. Layer Count

## 5.1 基本仕様

Group Nullの下にあるレイヤーから、Layer Countで指定された数だけをグループ対象にする。

例：

```text
Layer Count = 3

1 [G] Group
2 Text
3 Image
4 Shape
5 Background
```

対象：

```text
Text
Image
Shape
```

Backgroundは対象外。

---

## 5.2 最小値

Layer Countの最小値：

```text
0
```

0の場合は対象レイヤーなし。

Create Group直後のLayer Count初期値も`0`とする。

---

## 5.3 Panel上限とEffect安全上限

Panel上のLayer Countの有効範囲は、

```text
0..Comp全体のLayer数
```

とする。ExtendScript / JSX側で`comp.numLayers`へ正規化する。

C++ Effect内部の安全上限は`9999`とする。Panelから設定できる上限はComp全体のLayer数とし、Panel上限を超える値は`comp.numLayers`へ正規化する。

---

## 5.4 候補数超過時

Group Nullより下に存在するレイヤー数を超えて指定された場合は、存在するレイヤーまでを対象にする。

エラーにはしない。

例：

```text
Layer Count = 10

[G] Group
Text
Image
Shape
```

この場合、3レイヤーすべてを対象とする。

---

# 6. UI

ScriptUI Panelとして実装する。

基本UI：

```text
GROUP CONTROL

[ Create Group ]

Selected Group

Layers
[ - ]   0   [ + ]

Status Text

[ Apply ]

[ Ungroup ]
```

Panelは常時監視を行わず、ボタン操作の前後とPanelアクティブ化時だけ表示を更新する。通常操作のメッセージはStatus Textへ表示し、alertを乱用しない。

---

# 7. Create Group

`Create Group` を押すとGroup Nullを作成する。

## 動作

1. Active Compを取得
2. 選択状態から作成位置を決める
3. 作成位置へGroup Nullを作成
4. C++製Group Control Effectを追加
5. Layer Countを`0`に設定
6. Group Nullを選択状態にする

C++ Effectの追加に失敗した場合は、作成したNullを残さず、Status Textへ失敗理由を表示する。

---

# 8. Layer Count変更

UI上の

```text
[ - ] 0 [ + ]
```

でLayer Countを変更できる。

## + ボタン

Layer Countを1増やす。ただしPanel上限の`comp.numLayers`を超えないようにする。

変更後、自動的にGroupを再構築する。

## - ボタン

Layer Countを1減らす。

0未満にはしない。

変更後、自動的にGroupを再構築する。

---

# 9. Apply

`Apply` を押すと、選択中のGroup Nullについてグループ構造を再構築する。

対象は、

```text
Group Nullのindex + 1
```

から下方向にLayer Count分。

候補LayerはParent変更前に、現在のGroup NullのindexとLayer Countから毎回取得する。以前の対象を固定保存して、それを基準にしない。

外部Parent付きLayerや循環ParentになるLayerをスキップする場合でも、候補数には含める。後続Layerを繰り上げて候補数を補充しない。

Applyの処理順序は次のとおり固定する。

* Apply前検証：Active Comp、選択Group Null、C++ Effect、Layer Count、管理Markerを検証する。管理Markerの検証に失敗した場合はParent変更を開始しない
* 安全判定 / 候補：最初にGroup NullのTransformキーを確認する。Group Nullに対象Transformのキーが1つでもある場合はApply全体を開始せず、それ以外の場合だけ現在のGroup NullのindexとLayer Countから候補範囲を取得する
* 状態退避：候補Layerと管理Markerに記録されたLayerについて、現在のParentと更新前の管理Markerの有無、時刻、コメントを退避する
* 旧所有Parent解除：退避した管理Markerのうち、現在のParentが対象Group NullであるGroup Control所有Parentだけを解除する。ユーザーが変更したParentは触らない
* 再計算 / スキップ：旧所有Parent解除後にRoot Layerを再計算し、外部Parent付きLayer、循環ParentになるLayer、影響Transform配下に有効ExpressionがあるRootをスキップする。候補数は維持し、後続Layerで補充しない
* 成功記録Marker更新：Group NullへParentできた成功記録だけを管理Markerへ反映する。既存の有効な管理Markerは更新し、0件なら空き時刻へ新規作成する

予期せぬエラーが発生した場合は、退避したParentを変更前の状態へ戻し、管理Markerを更新前の有無、時刻、コメントへ戻す。Apply中に新規作成した管理Markerは削除する。ユーザーMarker、Layer Comment、ユーザー所有Parentは復元処理の対象にせず、変更しない。復元にも失敗した場合は、`Applyを中断しました。変更を完全には復元できませんでした。`をStatus Textへ表示する。

Apply成功時のStatus Textは次のとおり固定する。集計行のプレースホルダー名は`candidateCount`、`attachedCount`、`releasedCount`、`externalParentSkipped`、`expressionSkipped`、`cycleSkipped`から変更しない。

集計行：

```text
Apply完了: 候補数=<candidateCount>件 / 接続=<attachedCount>件 / 解除=<releasedCount>件 / 外部Parentスキップ=<externalParentSkipped>件 / Expression付きRootスキップ=<expressionSkipped>件 / 循環Parentスキップ=<cycleSkipped>件
```

管理Markerを新規作成した成功時は、上記の集計行に先行して次の行を出し、必ず2行にする。

```text
Group Markerを新規作成しました。
Apply完了: 候補数=<candidateCount>件 / 接続=<attachedCount>件 / 解除=<releasedCount>件 / 外部Parentスキップ=<externalParentSkipped>件 / Expression付きRootスキップ=<expressionSkipped>件 / 循環Parentスキップ=<cycleSkipped>件
```

既存の有効な管理Markerを更新した成功時は、新規作成の行を出さず、集計行だけの1行にする。候補がすべてスキップされ接続数が0件の場合もApply成功として集計行を出し、管理Markerが0件なら新規作成の2行を出す。

Apply前検証、安全判定、Marker検証、Group NullのTransformキー検出によりApplyを未適用とした場合は、該当する固定理由行だけを出し、`Apply完了`の集計行を出さない。予期せぬエラー後に変更を復元できた場合は`Applyを中断しました。変更を復元しました。`の1行、復元にも失敗した場合は`Applyを中断しました。変更を完全には復元できませんでした。`の1行を出す。

Apply未適用時の固定理由行は次のとおりとする。

* Active Compがない場合：`コンポジションを開いてください。`
* Group Nullが選択されていない場合：`Group Nullを選択してください。`
* 複数Group Nullが選択されている場合：`Group Nullを1つだけ選択してください。`
* 管理Marker候補が2件以上、または管理Markerの構文、ID、重複、Group自身IDが不正な場合：Section 20で定義した該当するGroup Markerエラー文言
* Group NullのTransformにキーがある場合：`Group NullのTransformにキーがあるためApplyを中断しました。`

上記の未適用時は、固定理由行以外の成功文言や集計行を出さない。既存の有効な管理Markerを更新してApplyに成功した場合は、Marker更新専用の成功文言を追加せず、集計行だけを出す。

外部Parent、Expression付きRoot、循環Parentのスキップ件数は候補数から差し引かず、後続Layerで補充しない。

---

# 10. Parenting仕様

Group NullによるTransform制御にはAE標準のParent機能を使用する。

ただし既存Parent構造を壊さないこと。

Parentの設定と解除はAE標準のParent動作に従う。

---

# 11. 既存Parentへの対応

対象レイヤーすべてを単純にGroup NullへParentしてはいけない。

例：

```text
Body
└ Arm
```

この2つがグループ対象だった場合、

ArmはBodyへのParentを維持する。

Group Nullに接続するのはBodyのみ。

結果：

```text
Group
└ Body
   └ Arm
```

---

# 12. Root Layer判定

グループ対象の中で、

「Parentがグループ対象内に存在しないレイヤー」

をRoot Layerとする。

ただし、Parentがグループ対象外に存在するLayerはRoot候補に含めるが、既存Parentを維持してGroup Nullへ接続しない。ParentがないRoot LayerだけをGroup NullへParentする。

---

## 例1

元：

```text
Body
└ Arm
Head
```

対象：

```text
Body
Arm
Head
```

Root：

```text
Body
Head
```

結果：

```text
Group
├ Body
│  └ Arm
└ Head
```

---

## 例2

元：

```text
Main Null
└ Body
```

Group対象：

```text
Body
```

この場合、Bodyには既存ParentとしてMain Nullが存在する。

v1では既存Parentを破壊しない。

そのため、直接Group NullへParentしない。

このケースは「外部Parentあり」として扱う。

---

# 13. 外部Parent

対象レイヤーのParentがグループ対象外にある場合、v1では既存Parentを優先する。

そのレイヤーはGroup Nullへ接続せず、Group NullのTransform対象から除外する。

ただし、そのレイヤーはLayer Countで決まる候補数には含める。後続Layerで候補数を補充しない。

該当レイヤーについては内部的に警告対象として扱う。

将来的にはProxy Null方式などで対応可能。

v1では複雑なParent構造を自動改変しない。

---

# 14. Transform

Group Nullによって制御するTransform：

* Position
* Scale
* Rotation
* 3D Orientation
* 3D X Rotation / Y Rotation / Z Rotation

AE標準Parent機能を使うため、追加Expressionは使用しない。

次の補正や変換は行わない。

* ワールドTransform補正
* キーフレーム補正
* キーフレームのベイク
* Expressionの書き換え

Root Layerの影響Transform配下に有効なExpressionが1つでもある場合、そのRootだけをスキップする。ここでいう影響Transform配下は、Position、Scale、Rotation、3D Orientation、3D X Rotation / Y Rotation / Z Rotationを指す。Expressionが無効、またはExpression文字列が空の場合は有効Expressionとみなさない。

Group NullのPosition、Scale、Rotation、3D Orientation、3D X Rotation / Y Rotation / Z Rotationのいずれかにキーが1つでもある場合、Apply全体を開始しない。候補取得、状態退避、旧所有Parent解除、Marker更新も行わず、`Group NullのTransformにキーがあるためApplyを中断しました。`をStatus Textへ表示する。

キーフレーム付きだがExpressionのない対象Layerは、キーを補正せずAE標準Parent動作で処理する。Expression付きRootのスキップ件数は候補数から差し引かず、後続Layerで補充せず、Apply完了Statusの`Expression付きRootスキップ`へ表示する。

---

# 15. Opacity

v1ではGroup Opacityを実装しない。

理由：

AEのParent機能ではParentのOpacityがChildへ継承されないため。

将来的にExpressionまたは別方式で追加する。

---

# 16. Anchor Point

v1ではGroup NullのAnchor Point自動計算は行わない。

Group Null生成時はAE標準NullのAnchor Pointを使用する。

将来的に、

* Group Bounds Center
* Comp Center
* Selected Point

などを追加可能。

---

# 17. Group Null同士

Group Nullの下に別のGroup Nullが存在する場合も、通常レイヤーと同様にLayer Countへ含める。

v1では「次のGroup Nullで自動停止」は行わない。

Layer Countを絶対的なルールとする。

例：

```text
[G] Parent
Text
[G] Child
Image
```

ParentのLayer Countが3なら、

```text
Text
[G] Child
Image
```

の3つが対象候補になる。

ただしParent構造の循環が発生しないようチェックする。

---

# 18. Groupの移動

Group Nullをタイムライン上で上下に移動した後、Applyを押すことで対象レイヤーを再計算する。

例：

変更前：

```text
[G] Group
A
B
C
D
```

Layer Count：

```text
2
```

対象：

```text
A
B
```

Group Nullを移動：

```text
A
[G] Group
B
C
D
```

Apply後：

```text
B
C
```

が対象になる。

---

# 19. 対象変更時の解除処理

Apply時には、Group Markerに記録された以前のParent関係を確認し、以前Group NullへParentされていたレイヤーのうち、現在の対象外になったレイヤーを解除する。

ただし、現在のParentが対象Group Nullであり、Group Markerに記録されたこのGroup Control所有のParentだけを解除すること。

ユーザーが手動で変更したParentは上書きも解除もしない。

以前のGroup Control所有Parentを解除した後、現在の候補範囲からRoot Layerを再計算する。成功したParent変更だけをGroup Markerへ記録する。

この解除処理は、Apply前検証、安全判定 / 候補、状態退避が完了した後にだけ開始する。予期せぬエラー時は、状態退避で保存したParentと管理Markerを復元する。

ユーザー自身が設定したParentを勝手に解除してはいけない。

---

# 20. Group Markerの発見・検証・更新とParent所有権

Group Controlがどのレイヤーを操作したかは、Group Null上の専用Group Markerで追跡する。管理Markerの発見、検証、更新方法は次のとおり固定する。

## 発見

* Group Null上の全Markerを調べ、コメントの先頭行が`NGS_GROUP_CONTROL`で始まるMarkerを管理Marker候補とする。これ以外のMarkerはユーザーMarkerとして扱う
* 管理Marker候補が0件の場合、Applyでは新規作成を許可する。Ungroupでは管理対象なしとして扱い、他の削除条件を満たす場合だけGroup Nullを削除する
* 管理Marker候補が2件以上ある場合は、内容を個別に検証せずApplyとUngroupを必ず中断する

## 検証

管理Marker候補が1件の場合だけ、次をすべて検証する。

* コメントを改行で分割した先頭行が`NGS_GROUP_CONTROL_V1`と完全一致する
* 2行目が`groupId=<id>`と完全一致し、`<id>`が現在のGroup NullのLayer IDと一致する
* 3行目以降は`record=<layerId>,<originalParentId>`だけで構成し、空行や余計な行を許可しない
* `groupId`と`layerId`は正の整数、`originalParentId`は`0`または正の整数である
* `layerId`は同一Comp内のLayer IDとして解決でき、同じ`layerId`のrecordを重複させない
* `record.layerId`と`originalParentId`の非ゼロ値に、現在のGroup Null自身のLayer IDを使用しない
* Layer indexやレイヤー名を永続識別子に使用しない

先頭行、`groupId`、構文、ID、重複、Group Null自身のIDのいずれかが不正な場合は、ApplyとUngroupをParent変更やGroup Null削除より前に中断する。

## 更新

管理Markerの各値は、次の意味で記録する。

* `groupId`はGroup Nullの`Layer.id`
* `layerId`は対象Layerの`Layer.id`
* `originalParentId`は、その対象LayerをGroup NullへParentする直前のParent Layerの`Layer.id`
* Parentがない場合の`originalParentId`は`0`

* `record`はGroup Controlが実際にGroup NullへParentした成功記録だけを持つ
* 既存の有効な管理Markerが1件ある場合は、そのMarkerの時刻を維持してコメントだけを更新する
* 管理Markerが0件で新規作成する場合は、Group Null上に既存Markerがない時刻へ作成する。時刻`0`が使用中なら、`frameDuration`単位で後ろへ進み、最初に空いている時刻を使う
* 管理Markerの更新時に、ユーザーMarker、Layer Comment、管理Marker以外のコメントや時刻を変更しない
* 予期せぬエラーでApplyを中断した場合は、更新前の管理Markerの有無、時刻、コメントを復元し、新規作成した管理Markerだけを削除する。ユーザーMarkerは復元処理の対象にせず、変更もしない

Status Textの文言は次のとおり固定する。

* 管理Marker候補が2件以上の場合：`Group Markerが複数あるため処理を中断しました。`
* 構文不正の場合：`Group Markerの構文が不正です。`
* ID不正の場合：`Group MarkerのIDが不正です。`
* `groupId`不一致の場合：`Group MarkerのgroupIdが一致しません。`
* `layerId`重複の場合：`Group MarkerのLayer IDが重複しています。`
* Group Null自身のIDがある場合：`Group MarkerにGroup Null自身のIDがあります。`
* Apply成功時に管理Markerを新規作成した場合の先頭行：`Group Markerを新規作成しました。`
* Group NullにTransformキーがある場合：`Group NullのTransformにキーがあるためApplyを中断しました。`
* Applyの変更を復元できた場合：`Applyを中断しました。変更を復元しました。`
* Applyの復元にも失敗した場合：`Applyを中断しました。変更を完全には復元できませんでした。`

---

# 21. Ungroup

`Ungroup` を押すと、Group Controlによって作成されたParent関係を解除する。

Group Markerが正しいことを確認した後、現在のParentが対象Group Nullである記録だけを解除する。Ungroupの復元先は各recordの`originalParentId`で決める。`originalParentId`が`0`ならParentなしへ戻し、0以外ならその`Layer.id`に一致するLayerが存在し循環が発生しない場合だけ、そのLayerへParentする。復元先Layerが存在しない場合はParentなしへ戻す。

ユーザーが元々設定していたParent、またはUngroup前に手動変更したParentは上書きしない。

Ungroup後はGroup Nullを削除する。ただし、Group Markerにない直接子Layerが残っている場合は削除を中断する。Nested Group Nullを削除する場合は、外側GroupのGroup MarkerがそのParent関係を管理していることを確認し、確認できない場合は削除を中断する。

Parent解除や元Parentへの復元に伴うワールドTransform補正、キーフレーム補正、キーフレームのベイク、Expressionの書き換えは行わない。Ungroupの見た目はAE標準のParent設定・解除の動作に従う。

---

# 22. Undo

すべての操作はAEのUndoに対応する。

各ボタン操作は名前付きのUndo Groupを1つだけ作り、内部処理関数ではUndo Groupを開始しない。

各ボタン操作は、`try/finally`で処理を囲み、`app.endUndoGroup()`を`finally`内で一度だけ実行する。予期せぬエラーを処理してもUndo Groupを二重に閉じない。

```javascript
app.beginUndoGroup("Undo Create Group");
try {
    // Create Group、Layer Count +/−、Apply、Ungroupの処理
} finally {
    app.endUndoGroup();
}
```

で囲む。

例：

```text
Undo Create Group
Undo Change Group Count +
Undo Change Group Count -
Undo Apply Group
Undo Ungroup
```

---

# 23. エラー処理

以下の場合は処理を中断し、分かりやすいメッセージを表示する。

## Active Compなし

```text
コンポジションを開いてください。
```

## Group Null未選択

```text
Group Nullを選択してください。
```

## 複数Group Null選択

処理を必ず中断する。

表示するメッセージ：

```text
Group Nullを1つだけ選択してください。
```

## C++ Effect追加失敗

作成したNullを残さず、Status Textへ失敗理由を表示する。

## Group Marker不正

Parent変更またはGroup Null削除を開始せず、Status Textへエラーを表示する。

## 不正なParent

循環Parentが発生する場合はそのレイヤーをスキップする。

---

# 24. パフォーマンス

通常の数十〜数百レイヤーのコンポジションで快適に動くこと。

Apply時のみParent構造を再計算する。

常時監視や常駐処理は行わない。

---

# 25. v1で実装しないもの

以下はv1では対象外。

* Group Opacity
* Group Effect
* Adjustment Layer連携
* Group Bounds自動計算
* 自動Anchor Point
* リアルタイムLayer Count監視
* Timeline変更の自動検知
* 外部Parentを含む完全な階層再構築
* 3Dレイヤー専用処理
* Collapse Transformations特殊対応
* Track Matte専用処理
* Expression参照の書き換え
* ワールドTransform補正
* キーフレーム補正
* キーフレームのベイク

---

# 26. v1の完成条件

以下が安定して動けばv1完成とする。

1. Group Nullを作成できる
2. Layer Countを指定できる
3. Group Null直下から指定数のレイヤーを取得できる
4. 対象内の既存Parent構造を維持できる
5. Root LayerのみGroup NullへParentできる
6. Layer Count変更後にApplyできる
7. Group Null移動後にApplyして対象を変更できる
8. Ungroupできる
9. Undoできる
10. 不正なParent構造を作らない

加えて、次を完成条件とする。

* C++ EffectをWindows・macOSのAfter Effects 2024+へ導入できる
* DockableなJSX PanelからC++ Effectを追加し、Group Nullを作成できる
* Windowsの`.aex`とmacOSの`.plugin`成果物を提供できる
* Windows・macOS双方で結合テストを実施し、結果を確認できる
* Group Marker、Effect、Parent状態を保存・再起動後も確認できる

---

# 27. 最重要方針

このツールでは、

「Groupを作ること」

より、

「Group Nullの下にある何レイヤーを対象にするか」

を最重要仕様とする。

操作の中心はLayer Count。

ユーザーがタイムラインを見ただけで、

```text
[G] Group
↓
ここからLayer Count分
```

という構造を理解できる設計にする。

---

# 28. 追加仕様：Group Nullの通常Effect継承

この章は、最新のユーザー決定によりv1へ追加された仕様である。旧章25の「Group Effect」、旧章6・24の「常時監視なし」という記載は、この章の範囲では上書きされる。

## 28.1 方針

Group NullのEffect Paradeにある`NGS_GroupControl`以外の通常Effectを、Layer Countで決まるGroup対象Layerへ自動複製する。専用のGroup Effectは作らず、複製先にもAfter Effects標準の通常Effectを追加する。

Transformは従来どおりAE標準Parentだけで制御し、LayerのPosition、Scale、Rotation、OrientationなどへExpressionを追加しない。Pre-composeも行わない。

## 28.2 対象と識別

Root Layerだけでなく、Group対象内の内部ChildにもEffectを複製する。外部Parentを持つ候補Layerは、既存Parentを壊さない安全方針に合わせて複製対象から除外する。

Group Controlが追加した複製Effectは、表示名の先頭に`[GFX:<Group NullのLayer.id>:<Effect index>]`を付けて識別する。予約接頭辞を持たないChild側のEffectは、同じmatchNameや表示名でもGroup Controlの同期対象にしない。

Group NullのEffect Paradeでは`NGS_GroupControl`だけを除外し、その他の通常Effectをすべてソース候補とする。特定のネイティブEffectだけを許可する一覧は持たず、複製時はソースの`matchName`を`addProperty`へ渡す。カスタムのGroup EffectやPre-composeを、この継承処理のために追加してはいけない。

Effectの複製対象は、Group Nullのindex直下からLayer Countで得た現在の候補集合のうち、ParentがないLayer、Group Null自身をParentに持つLayer、または候補集合内のLayerをParentに持つLayerとする。Rootだけでなく候補内の内部Childにも複製する。候補集合の外部LayerをParentに持つLayerは、候補数に含めたまま複製対象から除外する。

予約名の完全な形式は`[GFX:<Group NullのLayer.id>:<Group Null側Effectの1-based index>] <元のEffect名>`とする。同じGroup IDとEffect indexの既存複製は再利用し、元Effectの表示名やパラメータ構造が変わった場合は予約名とリンクを更新する。予約接頭辞を手動で外したEffectはGroup Control所有とはみなさず、以後の同期やUngroupで削除しない。

## 28.3 値と監視

複製Effectの末端パラメータだけに、Group Nullの元Effectを参照するExpressionを設定する。Group Null側のキーやExpressionを含む値は、AEのExpression評価により毎フレーム複製側へ反映する。Layer Transformへは設定しない。

Panel起動中は`app.scheduleTask`で約200msを指定して次回の監視を予約し、Effectの追加 / 削除、Group対象変更、複製の手動削除を差分反映する。監視1回の全グループ合計に処理量の上限を設け、Layerの発見、Effectの反映、不要コピーの掃除を複数回に分けて進める。数値の追従はExpressionに任せる。Panel起動時も分割処理で現在状態へ同期する。

PropertyツリーはEffect Parade内だけを再帰走査し、Expressionを設定できる末端Propertyに限って、`thisComp.layer("<Group Null名>").effect("<元Effect名>")("<Property名>")...`形式のExpressionを設定する。Expression非対応の末端Propertyは現在値を一度だけコピーし、同期不能として扱う。`ADBE Transform Group`やその配下へExpressionを書き込んではいけない。

監視は構造差分を扱い、変更がなければ末端Propertyの再走査を省く。Expressionの無効化などは分割した定期再確認で検出する。値の毎フレーム`setValue`は行わない。監視の各回は1回実行型の次回`app.scheduleTask`を予約し、重複予約を作らない。コンポ切替やPanelの終了 / 再読み込みでは監視状態を破棄する。反映完了までに必要な監視回数はLayer数とEffect数に依存し、200ms以内の完了は保証しない。詳細は`docs/superpowers/specs/2026-09-02-group-effect-inheritance.md`の自動監視仕様に従う。

## 28.4 Child固有EffectとUngroup

Childへ直接追加された通常Effectは予約接頭辞がないため、削除・上書きしない。Ungroup時はGroup Controlが付けた予約接頭辞の複製だけを削除し、Child固有Effectは残す。

Effectの追加、削除、複製先への`addProperty`、Expression設定のいずれかが失敗しても、失敗したEffectまたはLayer以外の同期処理は可能な範囲で継続する。Ungroupでは対象Group NullのLayer IDに一致する予約複製だけを全対象Layerから削除し、通常のChild Effectや予約接頭辞を持たないEffectは残す。
