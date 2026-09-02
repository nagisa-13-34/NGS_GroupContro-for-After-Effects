あなたはAdobe After Effects用ExtendScript / JSX開発に詳しいエンジニアです。

以下の仕様に従って、After Effects用ScriptUI Panelを実装してください。

プロジェクト名は仮に「Group Control」とします。

目的は、AviUtlの「グループ制御」に近い考え方をAfter Effectsへ導入することです。

ただし完全再現ではなく、v1では「Group Nullより下にある指定数のレイヤーをまとめてTransformする」ことに集中してください。

---

# 最重要仕様

Group Nullという専用Null Layerを作成します。

タイムラインが、

```text
1 [G] Group
2 Text
3 Image
4 Shape
5 Shadow
6 Background
```

となっていて、

```text
Layer Count = 4
```

の場合、

```text
Text
Image
Shape
Shadow
```

の4レイヤーをGroup対象にしてください。

Backgroundは対象外です。

Group Null自身はLayer Countに含めません。

対象は必ずGroup Nullより下方向です。

---

# UI

ScriptUI Panelとして作ってください。

最低限、以下のUIを用意してください。

```text
GROUP CONTROL

[ Create Group ]

Layers
[ - ]   5   [ + ]

[ Apply ]

[ Ungroup ]
```

After EffectsのWindowメニューから開けるDockable Panelとして動作する構成にしてください。

---

# Create Group

Create Groupを押すと、Active CompへNull Layerを作成してください。

Null名：

```text
[G] Group
```

同名がある場合は、

```text
[G] Group 2
[G] Group 3
```

のようにしてください。

Group Nullには専用Effectとして、

```text
Group Control
```

を追加してください。

その中にLayer Countを保存できるSlider Controlを追加してください。

Slider名：

```text
Layer Count
```

整数として扱ってください。

最小値は0です。

Group Null判定は名前ではなく、

* Null Layer
* Group Control用Effectを持っている

ことを基本にしてください。

---

# Layer Count UI

選択中のGroup NullのLayer CountをUIへ表示してください。

```text
[ - ] 5 [ + ]
```

+を押した場合：

1. Layer Countを+1
2. Groupを再Apply

-を押した場合：

1. Layer Countを-1
2. 0未満にはしない
3. Groupを再Apply

してください。

Layer Countより下のレイヤー数が少ない場合は、存在するレイヤーまでを対象にしてください。

エラーにはしないでください。

---

# Apply

Apply時にGroup Nullの現在位置とLayer Countから対象レイヤーを毎回再計算してください。

例えば、

```text
[G] Group
A
B
C
D
```

Layer Countが2なら、

```text
A
B
```

が対象です。

Group Nullを移動して、

```text
A
[G] Group
B
C
D
```

になったあとApplyした場合、

```text
B
C
```

を新しい対象にしてください。

つまりGroup Nullの位置とLayer Countが常に正です。

以前の対象を固定保存して、それを基準にしないでください。

---

# Parenting

Transform制御はAE標準のParent機能を利用してください。

Group Nullによってまとめて操作したいのは、

* Position
* Scale
* Rotation

です。

Opacityはv1では不要です。

ExpressionでTransformを再実装する必要はありません。

---

# 既存Parentを壊さない

これが非常に重要です。

対象レイヤーすべてを単純に、

```javascript
layer.parent = groupNull;
```

としてはいけません。

例えば元々、

```text
Body
└ Arm
```

となっており、

BodyとArmが両方Group対象の場合、

Arm → Body

のParentは維持してください。

この場合、Group NullへParentするのはBodyだけです。

結果：

```text
Group
└ Body
   └ Arm
```

にしてください。

---

# Root Layer判定

対象レイヤーについて、

```text
Parentが存在しない
```

または

```text
ParentがGroup対象内に存在しない
```

場合、そのレイヤーをRoot候補とします。

ただし、ParentがGroup対象外に存在する場合は、v1では既存Parentを壊さないことを優先してください。

無理にGroup Nullへ付け替えないでください。

対象内のParent構造だけは必ず維持してください。

---

# 外部Parent

例えば、

```text
Main Null
└ Body
```

という構造で、BodyだけがGroup対象だった場合、

BodyのParentを勝手にGroup Nullへ変更しないでください。

v1ではそのレイヤーをGroup Transform対象から除外して構いません。

安全性を優先してください。

可能であれば内部的にスキップしたレイヤー数を管理してください。

---

# 再Apply

Layer Countを減らした場合、以前Group NullへParentされていたレイヤーが対象外になる可能性があります。

その場合、このスクリプト自身が設定したParentだけを解除してください。

ユーザーが元から設定していたParentを解除してはいけません。

必要であればLayer Commentや専用Effectなどを利用して、Group Control自身が操作したレイヤーを識別してください。

レイヤー名だけに依存する実装は避けてください。

---

# Ungroup

Ungroupを押したら、

1. Group Controlが設定したParent関係を解除
2. 可能であれば元のParent状態を復元
3. Group Nullを削除

してください。

Ungroup前後で対象レイヤーの見た目が極力変化しないようにしてください。

After Effectsのparent設定・解除によってTransform値が変化する問題に注意してください。

必要に応じてワールド座標相当の見た目を維持する処理を検討してください。

---

# Group Nullが対象に含まれる場合

Group Nullの下に別のGroup Nullが存在しても、v1ではLayer Count上は通常レイヤーとして数えて構いません。

ただしParentの循環参照が絶対に発生しないようにしてください。

循環が発生する可能性がある場合、そのParent変更はスキップしてください。

---

# Undo対応

すべてのユーザー操作をUndo可能にしてください。

各操作を、

```javascript
app.beginUndoGroup("...");
```

と

```javascript
app.endUndoGroup();
```

で囲んでください。

対象：

* Create Group
* Layer Count +
* Layer Count -
* Apply
* Ungroup

---

# エラー処理

Active Compが存在しない場合：

```text
コンポジションを開いてください。
```

Group Nullが選択されていない場合：

```text
Group Nullを選択してください。
```

複数のGroup Nullが選択されている場合：

```text
Group Nullを1つだけ選択してください。
```

としてください。

alertの乱用は避けてください。

UI内にStatus Textを置いて表示する方法でも構いません。

---

# コーディング方針

コードは機能ごとに関数分割してください。

最低限、以下のような役割を分離してください。

```javascript
createGroup()
getSelectedGroup()
isGroupLayer()
getLayerCount()
setLayerCount()
getTargetLayers()
getRootLayers()
applyGroup()
removePreviousGroupParents()
ungroup()
buildUI()
```

実際の関数名は変更して構いません。

グローバル変数の乱用を避けてください。

可能な限り処理内容が読みやすいコードにしてください。

---

# 重要

まずは機能を増やさないでください。

以下は実装不要です。

* Opacity
* Group Effect
* Glow等の一括適用
* Anchor Point自動調整
* Group Bounds計算
* 自動リアルタイム監視
* Adjustment Layer
* Track Matte専用処理
* 3D専用機能
* Expression書き換え
* CEP
* UXP
* 外部ライブラリ

ExtendScript / JSX + ScriptUIのみで作ってください。

---

# 完成条件

以下を満たすコードを完成版として出力してください。

1. Dockable ScriptUI Panelとして動作する
2. Group Nullを作成できる
3. Layer Countを保存できる
4. +/-でLayer Countを変更できる
5. Group Null直下からLayer Count分を取得できる
6. 対象内の既存Parent構造を維持できる
7. Root LayerのみGroup NullへParentできる
8. Group Null移動後のApplyで対象を再計算できる
9. Layer Count減少時に古いGroup設定を解除できる
10. Ungroupできる
11. Undoできる
12. 循環Parentを作らない
13. エラーでスクリプト全体が停止しにくい
14. コード内に日本語コメントを適度に入れる

最後に、

* 完成したJSXコード全文
* 実装上の注意点
* After Effectsでの導入方法
* テストすべきケース

を出力してください。
