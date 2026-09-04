# Effect同期の確認方法

## ローカルの回帰テスト

リポジトリのルートで、PowerShellから全テストを実行する。

```powershell
node --test (Get-ChildItem -LiteralPath tests -Filter '*.test.js' -File | Select-Object -ExpandProperty FullName)
git diff --check
```

NodeのテストはJSXの同期ロジックを実行し、AEとの境界をテスト用オブジェクトで置き換える。
これにより処理回数や不要な書き込みを確認できるが、AE内のExpression評価や個々のEffectの実行時間は確認できない。

## Windows版のビルド

Visual StudioのC++ビルドツールとAfter Effects SDKを用意し、`SDK_ROOT`にSDKのルートを指定する。
`SDK_ROOT`の直下に`Examples/Headers/AE_Effect.h`が必要になる。

```powershell
MSBuild.exe plugin/win/GroupControl.vcxproj /t:Build /p:Configuration=Release /p:Platform=x64 /p:SDK_ROOT="C:\path\to\AfterEffectsSDK"
```

出力先は`build/win/Release/GroupControl.aex`である。
ビルドの成功だけでは、AEへの読み込みやPanelの同期動作を確認したことにはならない。

## AE内のEffectアダプターの確認

AEのファイルメニューからスクリプトファイルを実行し、`tests/ae/group_control_effect_sync_probe.jsx`を選ぶ。
結果は`build/validation/group-control-effect-sync.txt`に保存される。
ファイルへの書き込みには、AEのスクリプトによるファイル書き込み許可が必要になる。

プローブは一時コンポにShape Layerだけを作り、次の挙動を確認する。

- 同じLayerに2つのEffectを複製しても、先に追加したコピーが失われない。
- 対象内の子Layerへ反映し、対象外Layerにはコピーを付けない。
- ExpressionがAE内で評価され、元Effectの値とキーに追従する。
- 元Effectの削除を反映し、手動で削除されたコピーを再作成する。
- 管理用コピーの掃除で、子Layer固有のEffectと親子関係が残る。

一時コンポは終了時に削除し、既存プロジェクトは保存しない。
プロジェクトの変更済み表示やUndo履歴には影響する場合がある。
プローブは同期アダプターを直接呼ぶため、Panelの自動監視を開始しない。
Group ControlのネイティブEffectも不要である。

## Panelの監視確認

修正版の`GroupControl.jsx`と2つの`jsxinc`を同じフォルダに置き、Group ControlのPanelを開き直す。
既に開いている古いPanelのコードは、ファイルを差し替えただけでは更新されない。
古いPanelが監視を続けていると、手動修正したExpressionを古い形式へ書き戻すことがある。
Deep Glow 2で`Color Inner`が見つからないエラーが出た場合も、修正版を開き直して同期を待つ。
管理用コピーを再作成せず、番号で参照する式へ更新される。

確認用コンポでGroupを作成し、Layer Countを指定してApplyする。
Group Nullに通常Effectを追加した後、対象への反映が順次進むことを確認する。
対象Layerが多い場合は複数回の監視に分かれるため、200ms以内に全Layerへ反映されるとは限らない。

標準設定では1回あたりのLayer発見を16件、対象への反映と不要コピーの掃除を合わせて2件まで進める。
Property処理は8件、Effect追加の試行は1件までとする。
処理の区切りごとに12msの時間予算も確認する。
上限は全Groupの合計に適用し、次の監視で続きから処理する。
Layer内のProperty処理とEffect追加も分割するため、複製されたEffectのパラメータは順次リンクされる。

反映途中にLayer Countを減らす、Groupや子Layerを移動する、別のコンポへ切り替える操作も確認する。
現在の対象外へ新しいコピーが追加されず、古い管理用コピーだけが順次整理されることを見る。
Panelを閉じた後は新しい同期が発生せず、再度開くと現在状態へ追いつくことを確認する。

監視の分割で、AEの単一のEffect追加やExpression評価を実行途中で止めることはできない。
Effect追加は管理用の名前を付けるまでを1つの操作として扱い、その後に時間予算を確認する。
追加自体が予算を超えても、命名前のコピーを次回へ持ち越さず、後続のProperty設定を次回へ回す。
特定のEffectだけで固まる場合は、Effect名、対象Layer数、追加時と値変更時のどちらで発生したかを記録する。

## 2026-09-04の確認状況

番号参照への修正時点では、Nodeの回帰テスト44件と`git diff --check`が成功した。
多数Layerでの処理上限、変更のないコピーの再利用、定期的なExpression復旧、Group移動中のコピー保持、Panel再読み込み後の古い予約を確認した。

Windows x64のReleaseビルドはAfter Effects SDK 25.6を使って成功した。
この確認は作業ツリー上のネイティブEffectに対するもので、Panelの監視処理はNodeの回帰テストで別に確認する。

AE用コネクターからプロジェクト情報は取得できたが、任意スクリプトの実行は`eval.run=disabled`で許可されていない。
この接続から修正版のJSXや実機プローブは実行していない。
AE内のExpression評価、Panelの実際の反映速度、フリーズ症状の解消は実機確認が残る。

## Deep Glow 2の名前参照エラー

AE 24.6.8 / Deep Glow 2 v1.1.0で、`PEDG2-0042`の表示名が元Effectでは`Color Inner`、一部のコピーでは`Color`となる状態を確認した。
既存の`("Color Inner")`を含む式で、名前が見つからないエラーが出ていた。
現環境の元Effectを調べると、このパラメータの番号は84だった。
1つのコピーを`thisComp.layer("[G] Group").effect("Deep Glow 2")(84)`に変更したところ、コネクターは`expressionEnabled: true`を返し、値`[1, 0, 0, 1]`を取得できた。
84はこのEffectのこの版で確認した番号であり、同期コードは走査時の番号を使う。

番号によるEffectパラメータ参照は[AdobeのExpressionリファレンス](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-language-reference/expression-language-reference.html)にも記載されている。
古いPanelの監視で名前参照へ戻されることも確認したため、コード更新後はPanelの再読み込みが必要になる。
今回の実機操作は1つのExpressionの確認であり、修正版Panel全体の実機検証は含まない。
名前解決が失敗する模擬Effectに生成式を適用する回帰テストでは、番号による値の取得と、既存コピーを再作成しない旧式の更新を確認した。

## Effect追加時の実行停止

`2905efc`適用後、Effect追加時に`行804 / Execution halted`が表示されたとの報告があった。
同コミットの`GroupControlEffectSync.jsxinc`の804行は、初回コピーのために`sourceProperty.value`を取得する行である。
ただし、画像にはファイル名や処理中のProperty型がないため、行番号だけで停止原因を確定することはできない。

コード上では、値を持たない項目も値取得へ進む経路と、1Layer内の全Effect / Propertyを時間制限の確認なしに一括処理する経路が残っていた。
前回取得したDeep Glow 2の直下159項目のうち72項目は`NO_VALUE`だった。
`NO_VALUE`が値を持たないことは[After Effects Scripting GuideのProperty型](https://ae-scripting.docsforadobe.dev/property/property/#propertypropertyvaluetype)にも記載されている。

停止報告後のAE接続確認は、60秒以内に要求が受け取られずタイムアウトした。
AEのダイアログや応答停止が残る状態では追加の実機操作を行わず、値取得の保護とProperty単位の分割をNodeの模擬ホストで検証する。
模擬ホストでは、コピー不能な項目の値取得回数、1回の処理での実際の書き込み回数とEffect追加回数、時間予算を超えた後に次の処理へ進まないことを確認する。
最終的なAE内の応答速度と停止症状の解消は、修正版Panelで別途確認する必要がある。

## 分割処理の中断と再開の確認

分割処理の修正後はNodeの回帰テスト60件がすべて成功し、`git diff --check`も成功した。
Panelの模擬ホストでは、240項目のEffectを2つ追加し、全480項目のExpressionが有効になるまで確認した。
各監視回のExpression設定は8件以内、Effect追加は1件以内に収まった。
停止後やPanelの再読み込み後に古い予約を呼び出しても、同期処理が進まないことも確認した。

処理上限を1件にしても最後まで進むこと、不要なコピーだけを削除して必要なコピーを保持することを確認した。
Effect追加で模擬時計を13ms進める条件でも、12msの予算超過後に未命名コピーが増殖せず、1つの管理用コピーへ収束した。
処理途中にLayerの親を対象外へ移した場合も、追加と削除を繰り返さずにコピーを取り除いた。
これらはNodeの模擬ホストによる確認であり、AE実機での所要時間やフリーズ解消を示すものではない。
