# Implementation Plan: Group Effect inheritance

**Goal:** Group Nullへ追加された通常のAfter Effects Effectを、Panel起動中にボタン操作なしでGroup対象Layerへ複製し、複製側のEffectパラメータだけをExpressionでGroup Nullへ毎フレーム追従させる。既存のParentベースTransform制御、Child固有Effect、Marker、Undo仕様を壊さない。

**Architecture:** `panel/GroupControlEffectSync.jsxinc`にES3互換のEffect構造走査・予約名・Expression生成・差分計画を集約し、`panel/GroupControl.jsx`はAEオブジェクト操作とPanelの`app.scheduleTask`監視だけを担当する。Layer Transformは既存のParent処理を維持し、Effect Parade以外へExpressionを書き込まない。通常Effectの複製は予約表示名で識別し、カスタムEffectやPre-composeは追加しない。

**Tech Stack:** ExtendScript ES3 / JSX ScriptUI、After Effects Layer・Effect Property API、Node.js built-in `node:test`、既存のC++ `NGS_GroupControl` EffectはGroup識別とLayer Countだけに利用。

**Spec:** `docs/superpowers/specs/2026-09-02-group-effect-inheritance.md`

## Task 1: 失敗テストと新しい契約を先に追加する

**Files:**

- Modify: `C:/work/NGS_GroupContro_for_AE/tests/group_control_panel_contract.test.js`
- Modify: `C:/work/NGS_GroupContro_for_AE/tests/group_control_panel_logic.test.js`
- Create: `C:/work/NGS_GroupContro_for_AE/tests/group_control_effect_sync.test.js`
- Modify: `C:/work/NGS_GroupContro_for_AE/.agents/Spec.md`

**Work:**

- 最新決定が旧SpecのGroup Effect除外・常時監視なしを上書きすることを追記する。
- PanelがEffect Sync include、通常Effectの複製、Effect専用Expression、`app.scheduleTask`監視を持つ契約へ更新する。
- 純粋なEffect名解析、Expressionパス生成、Effect構造差分、通常EffectとChild固有Effectの判別をテストする。
- Fake AEオブジェクトで、Group Null側の通常Effect追加、値リンク、Effect削除、Layer Transform無変更、Ungroup時の所有複製削除をテストする。
- 実装前に新規テストを実行し、期待どおり失敗することを確認する。

**Verification:**

```text
node --test tests/group_control_effect_sync.test.js tests/group_control_panel_contract.test.js tests/group_control_panel_logic.test.js
```

## Task 2: Effect Syncの純粋ロジックとAEアダプターを実装する

**Files:**

- Create: `C:/work/NGS_GroupContro_for_AE/panel/GroupControlEffectSync.jsxinc`
- Modify: `C:/work/NGS_GroupContro_for_AE/panel/GroupControl.jsx`
- Modify: `C:/work/NGS_GroupContro_for_AE/tests/group_control_effect_sync.test.js`

**Work:**

- `NGS_GroupControl`を除外したSource Effect列挙、予約名の生成・解析、PropertyツリーのShape取得を追加する。
- `thisComp.layer(...).effect(...)(...)`形式のExpressionを安全に生成し、EffectパラメータPropertyだけへ設定する。
- Group候補内のLayerへ通常Effectを`addProperty(matchName)`で複製し、既存のChild固有Effectを予約名でない限り保護する。
- 末端PropertyはExpression、Expression非対応Propertyは初期値コピーへフォールバックする。Layer Transformは取得・変更しない。
- Group Effectの追加・削除・名称変更・対象範囲変更・手動削除を差分同期し、同期所有Effectだけを整理する。
- ES3構文を維持し、NodeのFake AEで新規テストを通す。

**Verification:**

```text
node --test tests/group_control_effect_sync.test.js tests/group_control_panel_logic.test.js
```

## Task 3: Panel監視、Apply/Ungroup連携、既存回帰を仕上げる

**Files:**

- Modify: `C:/work/NGS_GroupContro_for_AE/panel/GroupControl.jsx`
- Modify: `C:/work/NGS_GroupContro_for_AE/tests/group_control_panel_contract.test.js`
- Modify: `C:/work/NGS_GroupContro_for_AE/tests/group_control_panel_logic.test.js`

**Work:**

- Panel起動時に1回実行型`app.scheduleTask`を予約し、約200msごとにActive Compを自動同期する。監視が重複予約されないようロックし、可能ならPanel終了時にキャンセルする。
- 値は監視周期でsetValueせず、複製側ExpressionでAEの毎フレーム評価に任せる。
- UngroupでGroup NullのLayer.idに紐づく予約Effectだけを削除し、通常のChild Effectを残す。
- 既存のParent、Marker、Layer Count、Status Text、Undo境界を変更しない。
- 監視中の一部Effect失敗でパネル全体を停止させない。

**Verification:**

```text
node --test tests
git diff --check
```

## Task 4: レビューと実機導入前検証

**Files:**

- Modify: `C:/work/NGS_GroupContro_for_AE/docs/superpowers/specs/2026-09-02-group-effect-inheritance.md` (必要時のみ)
- Modify: `C:/work/NGS_GroupContro_for_AE/docs/superpowers/plans/2026-09-02-group-effect-inheritance.md` (必要時のみ)

**Work:**

- 実装差分をレビューし、通常Effectと専用Effectの境界、Transform無変更、Child固有Effect保護、監視の再入防止を確認する。
- Windows/macOSの既存C++ Group Controlビルド契約に不要な変更がないことを確認する。
- After Effects実機でEffect追加・値変更・削除・Child固有Effect・Layer Count変更・Group移動・Ungroup・Panel再起動を確認する。
- 実機SDKがこの環境にない場合は、Nodeテストと静的契約までを完了し、実機未確認を明記する。

**Verification:**

```text
node --test tests
git diff --check
```
