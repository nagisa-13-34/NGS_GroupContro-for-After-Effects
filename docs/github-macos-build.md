# GitHub ActionsでmacOS用`.plugin`を作る

macOS用のAfter Effectsプラグインは、Windows上ではXcodeを実行できないため、GitHub ActionsのmacOSランナーでビルドする。
After Effects SDKはAdobeのライセンス対象なので、公開リポジトリへ置かず、必ずprivateリポジトリのRelease Assetとして扱う。

## 初回の準備

1. GitHubリポジトリをprivateで作る。
2. Release tag `build-assets-25.6`を作る。
3. Adobe After Effects SDK 25.6のmacOSアーカイブを、次の名前でRelease Assetへアップロードする。

```text
AfterEffectsSDK_25.6_61_mac.zip
```

このアーカイブは、`extractzstd.sh`と`zstd`を含むAdobe SDKの配布形式をそのまま使う。
Actionsの`GITHUB_TOKEN`は同じprivateリポジトリのRelease Assetを読むためだけに使う。

## ビルド

Actionsの`Build macOS After Effects plugin`を`Run workflow`から実行する。
`sdk_release_tag`はSDKを登録したRelease tag（既定値は`build-assets-25.6`）にする。

成功すると、Artifactsに次のZIPができる。

```text
NGS_GroupControl_macos-universal.zip
├─ GroupControl.plugin
└─ LICENCE
```

この`.plugin`はarm64とx86_64を含むUniversal bundleとして検査される。
After Effectsを終了してから、`GroupControl.plugin`を次へ配置する。

```text
/Applications/Adobe After Effects 2024/Plug-ins/NGS Group Control/
```

その後After Effectsを再起動する。

## 検証の境界

Workflowで確認できるのは、macOS上でのXcodeビルド、bundle構造、Info.plist、Mach-Oのarm64/x86_64アーキテクチャ、ZIP内容である。
After Effects本体でのEffect読み込みやPanelとの連携は、macOS上のAfter Effectsで別途確認する。
