# Group Effect Inheritance 仕様

## 承認済みの追加仕様

この文書は、既存の Group Control v1 仕様へ追加する「Group Null の通常 Effect を子Layerへ自動反映する」仕様である。旧仕様にある `Group Effect` 非対応、常時監視なしという記述は、この追加仕様の範囲では最新のユーザー決定によって上書きされる。

凪咲の決定事項は次のとおり。

- Transform は AE 標準の Parent を使う。
- Transform プロパティへ Expression は設定しない。
- Pre-compose は使わない。
- Group Effect 専用のカスタムEffectは作らない。
- Group Nullへ追加するEffectは、After Effectsの通常のEffectをそのまま使う。
- Group Nullの通常Effectを、現在のグループ対象Layerへ自動で複製する。
- 複製側のEffectパラメータだけをExpressionでGroup NullのEffectへリンクする。
- 子Layerへ直接追加した通常Effectは、Group Controlの管理対象にせず、そのまま独立して使えるようにする。
- Group NullのEffect追加・削除を検出するため、Panel起動中は自動監視する。Effect値は監視でコピーせず、Expressionで毎フレーム追従させる。

## 反映対象

Group NullのEffect ParadeにあるEffectのうち、`NGS_GroupControl`だけを除外し、それ以外をGroup Effectのソースとする。ネイティブEffectだけに限定した特別なmatchName一覧は持たず、`addProperty(sourceEffect.matchName)`で複製できる通常Effectを対象にする。

Layer Countで決まる候補のうち、次のLayerへEffect複製を付ける。

- ParentがないLayer
- ParentがGroup Null自身のLayer
- Parentが同じ候補集合内にあるLayer

候補外の外部Parentを持つLayerは、既存Parentを壊さない安全方針に合わせてEffect複製の対象外とする。候補LayerへはRootだけでなく、候補内の内部Childにも複製を付ける。これにより、Group NullのEffectが各Group Childへ適用され、Child固有のEffectも併存できる。

## 複製Effectの識別

通常EffectのインスタンスにはGroup Control専用の永続メタデータを追加しない。その代わり、Group Controlが作成した複製Effectの表示名に次の予約接頭辞を付ける。

```text
[GFX:<Group NullのLayer.id>:<Group Null側Effectのindex>] <元のEffect名>
```

これは通常Effectの名前であり、専用Effectではない。予約接頭辞を持たないEffectは、同じmatchNameや同じ表示名であってもChild固有Effectとして保護する。

Group Null側Effectのindexが同じ場合は既存複製を再利用し、元のEffect名やパラメータ構造が変わった場合は名前・Expressionを更新する。Effectのindexが不要になった場合、または対象LayerがGroup対象から外れた場合は、その予約接頭辞の複製だけを削除する。

## 値の追従

複製Effectのパラメータツリーを再帰的に走査し、Expressionを設定できる末端Propertyへ次の形式のExpressionを設定する。

```javascript
thisComp.layer("<Group Null名>").effect("<元Effect名>")("<Property名>")...
```

Group NullのEffectパラメータにキーまたはExpressionがあれば、複製側は現在時刻の値を毎フレーム取得する。Panelの監視周期で数値をsetValueし続ける方式にはしない。

Expressionを設定できないPropertyは、その時点の値を一度だけコピーし、同期不能として扱う。Propertyツリーの走査範囲はEffect Parade内だけであり、Layerの `ADBE Transform Group` は走査しない。したがってPosition、Scale、RotationなどのLayer TransformへExpressionは追加しない。

## 自動監視

ScriptUI Panelの起動時に `app.scheduleTask` を使った1回実行型の監視を開始する。
処理後に約200msの間隔を指定して次回を予約する。
この間隔は予約値であり、200ms以内に全対象への反映を終える保証ではない。

監視は処理位置を保持し、次の処理を複数回に分けて進める。

- Active CompのLayerを少数ずつ読み、Group Nullと管理用コピーを探す。
- 現在のLayer Countと親子関係を確認し、少数の対象LayerへEffectを反映する。
- Effectの構造や名前に変化がなければ、末端Propertyツリーの再走査を省く。
- 分割した定期再確認により、構造の変化を伴わないExpressionの無効化なども検出する。
- Groupの削除や対象範囲の変更で不要になった管理用コピーを順次整理する。

処理量の上限は監視1回の全グループ合計に適用する。
標準設定ではLayerの発見を16件、対象への反映と不要コピーの掃除を合わせて2件までとし、処理の区切りで12msの時間予算を確認する。
Groupごとにコンポ全体を再列挙する処理を監視経路に入れない。
コンポ切替、Panelの終了や再読み込みでは進行中の監視状態を破棄する。
途中でLayerの順序やLayer Countが変わった場合も、現在の対象範囲を確認してから書き込む。

値の追従はExpressionに任せるため、監視で数値を毎回コピーしない。
Panelを閉じている間は監視せず、次に開いたときから分割処理で現在状態へ追いつく。
LayerやEffectが多い場合は、反映と掃除が完了するまで複数回の監視を要する。
AEの単一のEffect追加やExpression評価は実行途中で中断できないため、個別の重いEffect処理が時間予算を超える可能性は残る。

## Ungroupと安全性

Ungroup時はGroup NullのLayer.idに一致する予約接頭辞の複製Effectだけを全対象Layerから削除する。Childが元々持っていたEffectや、接頭辞を手動で外したEffectは削除しない。

Effectの追加、削除、Expression設定のいずれかが失敗しても、他のLayerやChild固有Effectの処理を可能な範囲で継続する。TransformのParent処理、Group Marker、Undoの既存仕様は変更しない。

## 完成条件

- Group Nullへ通常Effectを追加すると、Panel起動中にボタン操作なしで対象Childへ通常Effectの複製が追加される。
- Group Null側のEffect値、キー、Expressionの変更が、複製側のEffectパラメータへ毎フレーム反映される。
- Child側だけに通常Effectを追加しても、Group Controlの同期で削除・上書きされない。
- Effectの削除、Layer Count変更、Group移動、UngroupでGroup Control所有の複製だけが整理される。
- Layer TransformへExpression、Pre-compose、専用Group Effectを追加しない。
