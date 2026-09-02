# Group Control for After Effects — SPEC.md

## 1. 概要

After Effects上で、AviUtlの「グループ制御」に近い操作感を実現するスクリプト。

専用のGroup Nullを作成し、Group Nullの直下にある指定数のレイヤーをグループ対象として扱う。

グループ対象レイヤーは、Group NullのPosition / Scale / Rotationによってまとめて操作できる。

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

* Adobe After Effects
* ExtendScript / JSX
* ScriptUI Panel形式
* After Effectsの標準機能のみで動作すること
* 外部ライブラリ不要

---

# 4. Group Null

## 4.1 作成

スクリプトの `Create Group` を実行すると、現在のコンポジションにNull Layerを作成する。

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

Group Nullには専用Effectを追加する。

Effect名：

```text
Group Control
```

内部には最低限、

```text
Layer Count
```

を持つ。

Group Nullかどうかの判定は、

* Null Layerである
* `Group Control` Effectを持っている

の両方を満たした場合とする。

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

---

## 5.3 最大値

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
[ - ]   5   [ + ]

[ Apply ]

[ Ungroup ]
```

---

# 7. Create Group

`Create Group` を押すとGroup Nullを作成する。

## 動作

1. Active Compを取得
2. Group Nullを作成
3. Group Control Effectを追加
4. Layer Countを設定
5. Group Nullを選択状態にする

---

# 8. Layer Count変更

UI上の

```text
[ - ] 5 [ + ]
```

でLayer Countを変更できる。

## + ボタン

Layer Countを1増やす。

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

---

# 10. Parenting仕様

Group NullによるTransform制御にはAE標準のParent機能を使用する。

ただし既存Parent構造を壊さないこと。

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

Root LayerのみGroup NullへParentする。

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

つまりGroup NullのTransform対象から除外される可能性がある。

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

Apply時には、以前Group NullへParentされていたレイヤーのうち、現在の対象外になったレイヤーを解除する。

ただし、このGroup Controlが設定したParentだけを解除すること。

ユーザー自身が設定したParentを勝手に解除してはいけない。

---

# 20. 管理データ

Group Controlがどのレイヤーを操作したか追跡できる仕組みを持つこと。

候補：

* Layer Comment
* Marker
* 専用Effect
* Layer ID相当の内部管理

可能な限りレイヤー名には依存しない。

---

# 21. Ungroup

`Ungroup` を押すと、Group Controlによって作成されたParent関係を解除する。

対象レイヤーの見た目のPosition / Scale / Rotationが変わらないようにする。

Ungroup後はGroup Nullを削除する。

ユーザーが元々設定していたParent構造は可能な限り復元する。

---

# 22. Undo

すべての操作はAEのUndoに対応する。

各ボタン操作は、

```javascript
app.beginUndoGroup();
```

と

```javascript
app.endUndoGroup();
```

で囲む。

例：

```text
Undo Create Group
Undo Change Group Count
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

v1では最初のGroup Nullのみ処理するか、処理を中断する。

推奨：

```text
Group Nullを1つだけ選択してください。
```

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
