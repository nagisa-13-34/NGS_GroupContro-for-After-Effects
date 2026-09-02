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

AE標準Parent機能を使うため、追加Expressionは使用しない。

次の補正や変換は行わない。

* ワールドTransform補正
* キーフレーム補正
* キーフレームのベイク
* Expressionの書き換え

キーフレーム付きだがExpressionのないLayerは、キーを補正せずAE標準Parent動作で処理する。Expression付きRootとアニメーション中のGroup Nullは安全のためParent変更を行わず、Status Textへ理由を表示する。

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

ユーザー自身が設定したParentを勝手に解除してはいけない。

---

# 20. Group MarkerとParent所有権

Group Controlがどのレイヤーを操作したかは、Group Null上の専用Group Markerで追跡する。

Group Markerのコメント形式は、次の行形式に固定する。

```text
NGS_GROUP_CONTROL_V1
groupId=<id>
record=<layerId>,<originalParentId>
```

`groupId`はGroup NullのLayer ID、`layerId`は対象LayerのLayer ID、`originalParentId`はApply前のParentのLayer IDとする。元Parentがない場合は`0`とする。Layer indexやレイヤー名を永続識別子にしない。

`record`はGroup Controlが実際にGroup NullへParentした成功記録だけを持つ。再ApplyとUngroupでは、現在のParentがGroup Nullである記録だけをこのGroup Controlの所有として扱う。

Group Null上の管理Markerだけを更新し、Layer Commentとユーザーが作成したMarkerは変更しない。

---

# 21. Ungroup

`Ungroup` を押すと、Group Controlによって作成されたParent関係を解除する。

Group Markerが正しいことを確認した後、現在のParentが対象Group Nullである記録だけを解除する。元Parentが存在し、循環が発生しない場合は元Parentへ戻し、元Parentがない場合はParentなしへ戻す。

ユーザーが元々設定していたParent、またはUngroup前に手動変更したParentは上書きしない。

Ungroup後はGroup Nullを削除する。ただし、Group Markerにない直接子Layerが残っている場合は削除を中断する。Nested Group Nullを削除する場合は、外側GroupのGroup MarkerがそのParent関係を管理していることを確認し、確認できない場合は削除を中断する。

Parent解除や元Parentへの復元に伴うワールドTransform補正、キーフレーム補正、キーフレームのベイク、Expressionの書き換えは行わない。Ungroupの見た目はAE標準のParent設定・解除の動作に従う。

---

# 22. Undo

すべての操作はAEのUndoに対応する。

各ボタン操作は名前付きのUndo Groupを1つだけ作り、内部処理関数ではUndo Groupを開始しない。

各ボタン操作は、

```javascript
app.beginUndoGroup("Undo Create Group");
```

と

```javascript
app.endUndoGroup();
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
