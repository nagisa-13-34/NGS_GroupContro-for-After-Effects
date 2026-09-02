#include "GroupControlCore.jsxinc"
#include "GroupControlEffectSync.jsxinc"

/*
 * Group Control ScriptUI panel and After Effects adapter.
 *
 * This file intentionally stays in ExtendScript-compatible ES3 syntax. The
 * panel owns the AE object model, while GroupControlCore owns pure logic and
 * the persistent Group Marker format.
 */

var GROUP_CONTROL_EFFECT_MATCH_NAME = "NGS_GroupControl";
var GROUP_CONTROL_LAYER_COUNT_MATCH_NAME = "NGS_GroupControl-LayerCount";
var GROUP_CONTROL_LAYER_COUNT_REQUESTED_MATCH_NAME = "NGS_GroupControl-LayerCount";
var GROUP_CONTROL_LAYER_COUNT_HOST_MATCH_NAME = "NGS_GroupControl-0001";
var GROUP_CONTROL_LAYER_COUNT_DISPLAY_NAME = "Layer Count";
var GROUP_CONTROL_GROUP_NAME = "[G] Group";

var STATUS_NO_COMP = "コンポジションを開いてください。";
var STATUS_NO_GROUP = "Group Nullを選択してください。";
var STATUS_MULTIPLE_GROUPS = "Group Nullを1つだけ選択してください。";
var STATUS_MULTIPLE_MARKERS = "Group Markerが複数あるため処理を中断しました。";
var STATUS_MARKER_SYNTAX = "Group Markerの構文が不正です。";
var STATUS_MARKER_ID = "Group MarkerのIDが不正です。";
var STATUS_MARKER_GROUP_MISMATCH = "Group MarkerのgroupIdが一致しません。";
var STATUS_MARKER_DUPLICATE = "Group MarkerのLayer IDが重複しています。";
var STATUS_MARKER_SELF_ID = "Group MarkerにGroup Null自身のIDがあります。";
var STATUS_GROUP_KEYS = "Group NullのTransformにキーがあるためApplyを中断しました。";
var STATUS_APPLY_ROLLBACK = "Applyを中断しました。変更を復元しました。";
var STATUS_APPLY_ROLLBACK_FAILED = "Applyを中断しました。変更を完全には復元できませんでした。";
var STATUS_MARKER_CREATED = "Group Markerを新規作成しました。";
var STATUS_NESTED_MARKER = "外側GroupのGroup MarkerがNested Groupを管理していないためUngroupを中断しました。";
var STATUS_DIRECT_CHILD_MARKER = "Group Nullの直接子LayerがGroup MarkerにないためUngroupを中断しました。";
var STATUS_UNGROUP_ROLLBACK = "Ungroupを中断しました。変更を復元しました。";
var STATUS_UNGROUP_ROLLBACK_FAILED = "Ungroupを中断しました。変更を完全には復元できませんでした。";
var STATUS_UNGROUP_COMPLETE = "Ungroup完了。";

var groupControlUI = null;
var GROUP_CONTROL_EFFECT_SYNC_INTERVAL_MS = 200;
var groupControlEffectWatcherActive = false;
var groupControlEffectWatcherTaskId = null;
var groupControlEffectWatcherTicking = false;

function makeFailure(status) {
    return {
        ok: false,
        status: status
    };
}

function makeSuccess(status) {
    return {
        ok: true,
        status: status
    };
}

function getErrorText(error) {
    if (error !== null && typeof error !== "undefined" && error.message) {
        return String(error.message);
    }

    return String(error);
}

function setStatusText(status) {
    if (groupControlUI !== null && groupControlUI.statusText !== null) {
        groupControlUI.statusText.text = String(status);
    }
}

function getActiveComp() {
    var item;

    if (typeof app === "undefined" || app === null || app.project === null) {
        return null;
    }

    item = app.project.activeItem;
    if (item === null || typeof item === "undefined") {
        return null;
    }

    if (typeof CompItem !== "undefined" && item instanceof CompItem) {
        return item;
    }

    return null;
}

function getEffectsProperty(layer) {
    if (layer === null || typeof layer === "undefined" ||
            typeof layer.property !== "function") {
        return null;
    }

    return layer.property("ADBE Effect Parade");
}

function getGroupControlEffect(layer) {
    var effects = getEffectsProperty(layer);
    var index;
    var effect;

    if (effects === null || typeof effects === "undefined") {
        return null;
    }

    for (index = 1; index <= effects.numProperties; index += 1) {
        effect = effects.property(index);
        if (effect !== null && typeof effect !== "undefined" &&
                effect.matchName === GROUP_CONTROL_EFFECT_MATCH_NAME) {
            return effect;
        }
    }

    return null;
}

function isLayerCountProperty(property) {
    var matchName;
    var propertyName;

    if (property === null || typeof property === "undefined") {
        return false;
    }

    matchName = String(property.matchName || "");
    propertyName = String(property.name || "");

    /*
     * PF SDK effects expose numeric disk IDs as host-generated matchNames.
     * The requested logical alias is also accepted for compatibility with a
     * future API that may expose a literal parameter matchName.
     */
    if (matchName !== GROUP_CONTROL_LAYER_COUNT_HOST_MATCH_NAME &&
            matchName !== GROUP_CONTROL_LAYER_COUNT_REQUESTED_MATCH_NAME) {
        return false;
    }

    return propertyName === "" || propertyName === GROUP_CONTROL_LAYER_COUNT_DISPLAY_NAME;
}

function getLayerCountProperty(effect) {
    var index;
    var property;

    if (effect === null || typeof effect === "undefined") {
        return null;
    }

    for (index = 1; index <= effect.numProperties; index += 1) {
        property = effect.property(index);
        if (isLayerCountProperty(property)) {
            return property;
        }
    }

    return null;
}

function isGroupLayer(layer) {
    var effect;

    if (layer === null || typeof layer === "undefined" ||
            layer.nullLayer !== true) {
        return false;
    }

    effect = getGroupControlEffect(layer);
    return effect !== null && getLayerCountProperty(effect) !== null;
}

function getSelectedGroup(comp) {
    var selected;
    var groups = [];
    var index;
    var layer;

    if (comp === null || typeof comp === "undefined") {
        return {
            group: null,
            error: STATUS_NO_COMP
        };
    }

    selected = comp.selectedLayers || [];
    for (index = 0; index < selected.length; index += 1) {
        layer = selected[index];
        if (isGroupLayer(layer)) {
            groups.push(layer);
        }
    }

    if (groups.length === 0) {
        return {
            group: null,
            error: STATUS_NO_GROUP
        };
    }

    if (groups.length > 1) {
        return {
            group: null,
            error: STATUS_MULTIPLE_GROUPS
        };
    }

    return {
        group: groups[0],
        error: null
    };
}

function getLayerCount(group, comp) {
    var effect;
    var property;

    if (!isGroupLayer(group)) {
        throw new Error("Group Control Effectが見つかりません。");
    }

    effect = getGroupControlEffect(group);
    property = getLayerCountProperty(effect);
    if (property === null) {
        throw new Error("Layer Countパラメータが見つかりません。");
    }

    return GroupControlCore.clampLayerCount(property.value, comp.numLayers);
}

function setLayerCount(group, comp, value) {
    var effect;
    var property;
    var normalized;

    if (!isGroupLayer(group)) {
        throw new Error("Group Control Effectが見つかりません。");
    }

    effect = getGroupControlEffect(group);
    property = getLayerCountProperty(effect);
    if (property === null) {
        throw new Error("Layer Countパラメータが見つかりません。");
    }

    normalized = GroupControlCore.clampLayerCount(value, comp.numLayers);
    property.setValue(normalized);
    return normalized;
}

function getTargetLayers(group, comp) {
    var count = getLayerCount(group, comp);
    var range = GroupControlCore.getTargetIndexRange(group.index, count, comp.numLayers);
    var layers = [];
    var index;

    for (index = range.startIndex; index <= range.endIndex; index += 1) {
        if (index >= 1 && index <= comp.numLayers) {
            layers.push(comp.layer(index));
        }
    }

    return layers;
}

function getAllCompLayers(comp) {
    var layers = [];
    var layerCount;
    var index;
    var layer;

    if (comp === null || typeof comp === "undefined") {
        return layers;
    }

    try {
        layerCount = Number(comp.numLayers);
    } catch (countError) {
        layerCount = 0;
    }

    if (!isFinite(layerCount) || layerCount <= 0) {
        return layers;
    }

    for (index = 1; index <= Math.floor(layerCount); index += 1) {
        try {
            layer = comp.layer(index);
        } catch (layerError) {
            layer = null;
        }

        if (layer !== null && typeof layer !== "undefined") {
            layers.push(layer);
        }
    }

    return layers;
}

function cleanupOrphanedGroupEffects(compLayers, liveGroupIds) {
    var orphanGroupIds = {};
    var index;
    var effectIndex;
    var layer;
    var effects;
    var effect;
    var effectCount;
    var reservedInfo;
    var groupKey;

    for (index = 0; index < compLayers.length; index += 1) {
        layer = compLayers[index];
        effects = getEffectsProperty(layer);
        if (effects === null || typeof effects === "undefined") {
            continue;
        }

        try {
            effectCount = Number(effects.numProperties);
        } catch (countError) {
            effectCount = 0;
        }

        if (!isFinite(effectCount) || effectCount <= 0) {
            continue;
        }

        for (effectIndex = 1; effectIndex <= Math.floor(effectCount); effectIndex += 1) {
            try {
                effect = effects.property(effectIndex);
            } catch (effectError) {
                effect = null;
            }

            if (effect === null || typeof effect === "undefined") {
                continue;
            }

            try {
                reservedInfo = GroupControlEffectSync.parseReservedEffectName(
                    String(effect.name || ""));
            } catch (parseError) {
                reservedInfo = null;
            }

            if (reservedInfo === null ||
                    liveGroupIds["id:" + reservedInfo.groupId]) {
                continue;
            }

            groupKey = "id:" + reservedInfo.groupId;
            orphanGroupIds[groupKey] = reservedInfo.groupId;
        }
    }

    for (groupKey in orphanGroupIds) {
        if (!Object.prototype.hasOwnProperty.call(orphanGroupIds, groupKey)) {
            continue;
        }

        try {
            GroupControlEffectSync.removeOwnedEffects(
                compLayers, orphanGroupIds[groupKey]);
        } catch (removeError) {
            /* A single stale Layer must not stop the active-comp watcher. */
        }
    }
}

function syncAllGroupEffects(comp) {
    var compLayers;
    var groups = [];
    var liveGroupIds = {};
    var index;
    var layer;
    var groupId;
    var targetLayers;

    if (comp === null || typeof comp === "undefined") {
        return;
    }

    compLayers = getAllCompLayers(comp);
    for (index = 0; index < compLayers.length; index += 1) {
        layer = compLayers[index];
        if (!isGroupLayer(layer)) {
            continue;
        }

        groupId = getLayerId(layer);
        if (groupId <= 0) {
            continue;
        }

        groups.push(layer);
        liveGroupIds["id:" + groupId] = true;
    }

    for (index = 0; index < groups.length; index += 1) {
        try {
            targetLayers = getTargetLayers(groups[index], comp);
            GroupControlEffectSync.syncGroupEffects(groups[index], targetLayers);
        } catch (syncError) {
            /* A single Group must not stop synchronization of other Groups. */
        }
    }

    cleanupOrphanedGroupEffects(compLayers, liveGroupIds);
}

function scheduleGroupEffectWatcher() {
    var taskId;

    if (!groupControlEffectWatcherActive ||
            groupControlEffectWatcherTaskId !== null) {
        return;
    }

    if (typeof app === "undefined" || app === null ||
            typeof app.scheduleTask !== "function") {
        return;
    }

    try {
        taskId = app.scheduleTask("GroupControlEffectWatcherTick()",
            GROUP_CONTROL_EFFECT_SYNC_INTERVAL_MS, false);
        if (taskId !== null && typeof taskId !== "undefined") {
            groupControlEffectWatcherTaskId = taskId;
        }
    } catch (scheduleError) {
        groupControlEffectWatcherTaskId = null;
    }
}

function GroupControlEffectWatcherTick() {
    var comp;

    if (!groupControlEffectWatcherActive || groupControlEffectWatcherTicking) {
        return;
    }

    /* The current scheduleTask invocation is one-shot and has now fired. */
    groupControlEffectWatcherTaskId = null;
    groupControlEffectWatcherTicking = true;

    try {
        comp = getActiveComp();
        if (comp !== null) {
            syncAllGroupEffects(comp);
        }
    } catch (watcherError) {
        /* Keep the watcher alive when the active composition changes mid-tick. */
    } finally {
        groupControlEffectWatcherTicking = false;
        scheduleGroupEffectWatcher();
    }
}

function startGroupEffectWatcher() {
    if (groupControlEffectWatcherActive) {
        return;
    }

    groupControlEffectWatcherActive = true;
    GroupControlEffectWatcherTick();
}

function stopGroupEffectWatcher() {
    var taskId = groupControlEffectWatcherTaskId;

    groupControlEffectWatcherActive = false;
    groupControlEffectWatcherTaskId = null;

    if (taskId === null || typeof taskId === "undefined" ||
            typeof app === "undefined" || app === null ||
            typeof app.cancelTask !== "function") {
        return;
    }

    try {
        app.cancelTask(taskId);
    } catch (cancelError) {
        /* A missing or already-completed task is safe to ignore. */
    }
}

function GroupControlEffectWatcherStart() {
    startGroupEffectWatcher();
}

function GroupControlEffectWatcherStop() {
    stopGroupEffectWatcher();
}

function getLayerId(layer) {
    if (layer === null || typeof layer === "undefined") {
        return 0;
    }

    return Number(layer.id) || 0;
}

function getParentId(layer) {
    if (layer === null || typeof layer === "undefined" ||
            layer.parent === null || typeof layer.parent === "undefined") {
        return 0;
    }

    return getLayerId(layer.parent);
}

function getRootLayers(targetLayers) {
    var targetIds = {};
    var roots = [];
    var index;
    var layer;
    var layerId;
    var parentId;

    for (index = 0; index < targetLayers.length; index += 1) {
        layer = targetLayers[index];
        layerId = getLayerId(layer);
        if (layerId > 0) {
            targetIds["id:" + layerId] = true;
        }
    }

    for (index = 0; index < targetLayers.length; index += 1) {
        layer = targetLayers[index];
        layerId = getLayerId(layer);
        parentId = getParentId(layer);
        if (layerId > 0 && !targetIds["id:" + parentId]) {
            roots.push(layer);
        }
    }

    return roots;
}

function findLayerById(comp, layerId) {
    var wanted = Number(layerId);
    var index;
    var layer;

    if (!isFinite(wanted) || wanted <= 0) {
        return null;
    }

    for (index = 1; index <= comp.numLayers; index += 1) {
        layer = comp.layer(index);
        if (getLayerId(layer) === wanted) {
            return layer;
        }
    }

    return null;
}

function buildParentMap(comp) {
    var parentMap = {};
    var index;
    var layer;

    for (index = 1; index <= comp.numLayers; index += 1) {
        layer = comp.layer(index);
        parentMap[getLayerId(layer)] = getParentId(layer);
    }

    return parentMap;
}

function setParentAndMap(layer, parent, parentMap) {
    layer.parent = parent;
    parentMap[getLayerId(layer)] = parent === null ? 0 : getLayerId(parent);
}

function getMarkerProperty(group) {
    if (group === null || typeof group === "undefined") {
        return null;
    }

    if (group.marker !== null && typeof group.marker !== "undefined") {
        return group.marker;
    }

    if (typeof group.property === "function") {
        return group.property("ADBE Marker");
    }

    return null;
}

function getMarkerFirstLine(comment) {
    var lines = String(comment).split(/\r\n|\n|\r/);
    return lines.length > 0 ? lines[0] : "";
}

function getManagedMarkerCandidates(group) {
    var marker = getMarkerProperty(group);
    var candidates = [];
    var index;
    var value;
    var comment;

    if (marker === null || typeof marker === "undefined") {
        return candidates;
    }

    for (index = 1; index <= marker.numKeys; index += 1) {
        value = marker.keyValue(index);
        comment = value === null || typeof value === "undefined" ? "" : String(value.comment || "");
        if (getMarkerFirstLine(comment).indexOf("NGS_GROUP_CONTROL") === 0) {
            candidates.push({
                index: index,
                time: marker.keyTime(index),
                comment: comment
            });
        }
    }

    return candidates;
}

function markerErrorStatus(error) {
    var code = error === null || typeof error === "undefined" ? "" : error.code;
    var codes = GroupControlCore.markerErrorCodes;

    if (code === codes.duplicateLayerId) {
        return STATUS_MARKER_DUPLICATE;
    }

    if (code === codes.selfId) {
        return STATUS_MARKER_SELF_ID;
    }

    if (code === codes.id) {
        return STATUS_MARKER_ID;
    }

    return STATUS_MARKER_SYNTAX;
}

function validateGroupMarker(group, comp) {
    var candidates = getManagedMarkerCandidates(group);
    var markerComment;
    var state;
    var index;
    var record;

    if (candidates.length > 1) {
        return {
            valid: false,
            status: STATUS_MULTIPLE_MARKERS,
            candidate: null,
            state: null
        };
    }

    if (candidates.length === 0) {
        return {
            valid: true,
            status: null,
            candidate: null,
            state: null
        };
    }

    markerComment = candidates[0].comment;
    try {
        state = GroupControlCore.decodeGroupState(markerComment);
    } catch (error) {
        return {
            valid: false,
            status: markerErrorStatus(error),
            candidate: candidates[0],
            state: null
        };
    }

    if (state.groupId !== getLayerId(group)) {
        return {
            valid: false,
            status: STATUS_MARKER_GROUP_MISMATCH,
            candidate: candidates[0],
            state: null
        };
    }

    for (index = 0; index < state.records.length; index += 1) {
        record = state.records[index];
        if (findLayerById(comp, record.layerId) === null) {
            return {
                valid: false,
                status: STATUS_MARKER_ID,
                candidate: candidates[0],
                state: null
            };
        }
    }

    return {
        valid: true,
        status: null,
        candidate: candidates[0],
        state: state
    };
}

function getTransformProperty(layer, matchName) {
    var transform;

    if (layer === null || typeof layer === "undefined" ||
            typeof layer.property !== "function") {
        return null;
    }

    transform = layer.property("ADBE Transform Group");
    if (transform === null || typeof transform === "undefined") {
        return null;
    }

    return transform.property(matchName);
}

function getInfluenceTransformMatchNames() {
    return [
        "ADBE Position",
        "ADBE Scale",
        "ADBE Rotation",
        "ADBE Rotate Z",
        "ADBE Orientation",
        "ADBE Rotate X",
        "ADBE Rotate Y"
    ];
}

function propertyHasKeys(property) {
    return property !== null && typeof property !== "undefined" &&
        Number(property.numKeys) > 0;
}

function groupHasTransformKeys(group) {
    var names = getInfluenceTransformMatchNames();
    var index;

    for (index = 0; index < names.length; index += 1) {
        if (propertyHasKeys(getTransformProperty(group, names[index]))) {
            return true;
        }
    }

    return false;
}

function trimText(value) {
    return String(value).replace(/^\s+|\s+$/g, "");
}

function propertyHasActiveExpression(property) {
    if (property === null || typeof property === "undefined" ||
            property.expressionEnabled !== true) {
        return false;
    }

    return trimText(property.expression || "") !== "";
}

function layerHasInfluenceExpression(layer) {
    var names = getInfluenceTransformMatchNames();
    var index;

    for (index = 0; index < names.length; index += 1) {
        if (propertyHasActiveExpression(getTransformProperty(layer, names[index]))) {
            return true;
        }
    }

    return false;
}

function addUniqueLayer(layers, layer) {
    var layerId = getLayerId(layer);
    var index;

    for (index = 0; index < layers.length; index += 1) {
        if (getLayerId(layers[index]) === layerId) {
            return;
        }
    }

    layers.push(layer);
}

function collectParentBackups(comp, targetLayers, state) {
    var backups = [];
    var layers = [];
    var index;
    var record;
    var layer;

    for (index = 0; index < targetLayers.length; index += 1) {
        addUniqueLayer(layers, targetLayers[index]);
    }

    if (state !== null && typeof state !== "undefined") {
        for (index = 0; index < state.records.length; index += 1) {
            record = state.records[index];
            layer = findLayerById(comp, record.layerId);
            if (layer !== null) {
                addUniqueLayer(layers, layer);
            }
        }
    }

    for (index = 0; index < layers.length; index += 1) {
        backups.push({
            layer: layers[index],
            parent: layers[index].parent || null
        });
    }

    return backups;
}

function restoreParentBackups(backups) {
    var success = true;
    var index;

    for (index = 0; index < backups.length; index += 1) {
        try {
            backups[index].layer.parent = backups[index].parent;
        } catch (error) {
            success = false;
        }
    }

    return success;
}

function removePreviousGroupParents(group, comp, oldState) {
    var released = [];
    var parentMap = buildParentMap(comp);
    var index;
    var record;
    var layer;

    if (oldState === null || typeof oldState === "undefined") {
        return released;
    }

    for (index = 0; index < oldState.records.length; index += 1) {
        record = oldState.records[index];
        layer = findLayerById(comp, record.layerId);
        if (layer !== null && getParentId(layer) === getLayerId(group)) {
            setParentAndMap(layer, null, parentMap);
            released.push({
                layer: layer,
                record: record
            });
        }
    }

    return released;
}

function mapRecordsByLayerId(state) {
    var records = {};
    var index;

    if (state === null || typeof state === "undefined") {
        return records;
    }

    for (index = 0; index < state.records.length; index += 1) {
        records[state.records[index].layerId] = state.records[index];
    }

    return records;
}

function mapReleasedByLayerId(released) {
    var records = {};
    var index;

    for (index = 0; index < released.length; index += 1) {
        records[released[index].record.layerId] = released[index].record;
    }

    return records;
}

function hasRecordForLayer(state, layerId) {
    var index;

    if (state === null || typeof state === "undefined") {
        return false;
    }

    for (index = 0; index < state.records.length; index += 1) {
        if (Number(state.records[index].layerId) === Number(layerId)) {
            return true;
        }
    }

    return false;
}

function isMarkerTimeOccupied(marker, time) {
    var index;
    var epsilon = 0.0000001;

    for (index = 1; index <= marker.numKeys; index += 1) {
        if (Math.abs(marker.keyTime(index) - time) < epsilon) {
            return true;
        }
    }

    return false;
}

function findFirstFreeMarkerTime(marker, comp) {
    var frameDuration = Number(comp.frameDuration);
    var time = 0;
    var attempts = 0;
    var maximumAttempts;

    if (!isFinite(frameDuration) || frameDuration <= 0) {
        frameDuration = 1 / 30;
    }

    maximumAttempts = marker.numKeys + 1;
    while (attempts <= maximumAttempts) {
        if (!isMarkerTimeOccupied(marker, time)) {
            return time;
        }

        time += frameDuration;
        attempts += 1;
    }

    return time;
}

function findMarkerIndexAtTime(marker, time) {
    var index;
    var epsilon = 0.0000001;

    for (index = 1; index <= marker.numKeys; index += 1) {
        if (Math.abs(marker.keyTime(index) - time) < epsilon) {
            return index;
        }
    }

    return 0;
}

function setMarkerValueAtKey(marker, index, comment) {
    var markerValue = new MarkerValue(comment);

    if (typeof marker.setValueAtKey === "function") {
        marker.setValueAtKey(index, markerValue);
    } else {
        marker.setValueAtTime(marker.keyTime(index), markerValue);
    }
}

function updateGroupMarker(group, comp, state, existingCandidate) {
    var marker = getMarkerProperty(group);
    var comment = GroupControlCore.encodeGroupState(state);
    var time;
    var index;

    if (marker === null || typeof marker === "undefined") {
        throw new Error("Group Markerプロパティが見つかりません。");
    }

    if (existingCandidate !== null && typeof existingCandidate !== "undefined") {
        setMarkerValueAtKey(marker, existingCandidate.index, comment);
        return {
            created: false,
            index: existingCandidate.index,
            time: existingCandidate.time,
            comment: comment
        };
    }

    time = findFirstFreeMarkerTime(marker, comp);
    marker.setValueAtTime(time, new MarkerValue(comment));
    index = findMarkerIndexAtTime(marker, time);
    if (index <= 0) {
        throw new Error("Group Markerを作成できませんでした。");
    }

    return {
        created: true,
        index: index,
        time: time,
        comment: comment
    };
}

function restoreMarkerSnapshot(group, snapshot, newMarkerInfo) {
    var marker = getMarkerProperty(group);
    var index;
    var value;
    var comment;

    if (marker === null || typeof marker === "undefined") {
        return false;
    }

    try {
        if (snapshot !== null && typeof snapshot !== "undefined" && snapshot.exists) {
            setMarkerValueAtKey(marker, snapshot.index, snapshot.comment);
            return true;
        }

        if (newMarkerInfo !== null && typeof newMarkerInfo !== "undefined") {
            index = findMarkerIndexAtTime(marker, newMarkerInfo.time);
            if (index > 0) {
                value = marker.keyValue(index);
                comment = value === null || typeof value === "undefined" ? "" : String(value.comment || "");
                if (comment === newMarkerInfo.comment) {
                    marker.removeKey(index);
                }
            }
        }

        return true;
    } catch (error) {
        return false;
    }
}

function buildApplyStatus(candidateCount, attachedCount, releasedCount,
        externalParentSkipped, expressionSkipped, cycleSkipped, markerCreated) {
    var summary = "Apply完了: 候補数=" + candidateCount + "件 / 接続=" + attachedCount +
        "件 / 解除=" + releasedCount + "件 / 外部Parentスキップ=" +
        externalParentSkipped + "件 / Expression付きRootスキップ=" +
        expressionSkipped + "件 / 循環Parentスキップ=" + cycleSkipped + "件";

    return markerCreated ? STATUS_MARKER_CREATED + "\n" + summary : summary;
}

function applyGroupCore(group, comp) {
    var markerValidation;
    var targetLayers;
    var rootLayers;
    var backups;
    var oldState;
    var existingCandidate;
    var markerSnapshot;
    var released;
    var releasedById;
    var oldRecordsById;
    var parentMap;
    var attachedRecords = [];
    var externalParentSkipped = 0;
    var expressionSkipped = 0;
    var cycleSkipped = 0;
    var attachedCount = 0;
    var markerInfo = null;
    var index;
    var layer;
    var parentId;
    var oldRecord;
    var originalParentId;
    var status;
    var rollbackParents;
    var rollbackMarker;

    if (comp === null || typeof comp === "undefined") {
        return makeFailure(STATUS_NO_COMP);
    }

    if (!isGroupLayer(group)) {
        return makeFailure(STATUS_NO_GROUP);
    }

    markerValidation = validateGroupMarker(group, comp);
    if (!markerValidation.valid) {
        return makeFailure(markerValidation.status);
    }

    if (groupHasTransformKeys(group)) {
        return makeFailure(STATUS_GROUP_KEYS);
    }

    try {
        oldState = markerValidation.state;
        existingCandidate = markerValidation.candidate;
        markerSnapshot = existingCandidate === null ? {
            exists: false
        } : {
            exists: true,
            index: existingCandidate.index,
            time: existingCandidate.time,
            comment: existingCandidate.comment
        };

        targetLayers = getTargetLayers(group, comp);
        backups = collectParentBackups(comp, targetLayers, oldState);
        released = removePreviousGroupParents(group, comp, oldState);
        releasedById = mapReleasedByLayerId(released);
        oldRecordsById = mapRecordsByLayerId(oldState);
        parentMap = buildParentMap(comp);
        rootLayers = getRootLayers(targetLayers);

        for (index = 0; index < rootLayers.length; index += 1) {
            layer = rootLayers[index];
            parentId = getParentId(layer);

            if (parentId !== 0) {
                externalParentSkipped += 1;
                continue;
            }

            if (layerHasInfluenceExpression(layer)) {
                expressionSkipped += 1;
                continue;
            }

            if (GroupControlCore.wouldCreateParentCycle(
                    getLayerId(layer), getLayerId(group), parentMap)) {
                cycleSkipped += 1;
                continue;
            }

            oldRecord = releasedById[getLayerId(layer)];
            if (oldRecordsById[getLayerId(layer)] !== null &&
                    typeof oldRecordsById[getLayerId(layer)] !== "undefined" &&
                    typeof oldRecord === "undefined" && parentId === 0) {
                /*
                 * A layer recorded by an earlier Apply was manually
                 * unparented. A later Apply must not silently take it back.
                 * Count this conservative skip with the existing external
                 * parent bucket because the fixed Status contract has no
                 * separate manual-parent category.
                 */
                externalParentSkipped += 1;
                continue;
            }

            originalParentId = oldRecord === null || typeof oldRecord === "undefined" ?
                parentId : Number(oldRecord.originalParentId);

            setParentAndMap(layer, group, parentMap);
            if (getParentId(layer) !== getLayerId(group)) {
                throw new Error("Group NullへのParent設定を確認できませんでした。");
            }

            attachedRecords.push({
                layerId: getLayerId(layer),
                originalParentId: originalParentId
            });
            attachedCount += 1;
        }

        markerInfo = updateGroupMarker(group, comp, {
            version: 1,
            groupId: getLayerId(group),
            records: attachedRecords
        }, existingCandidate);

        status = buildApplyStatus(targetLayers.length, attachedCount, released.length,
            externalParentSkipped, expressionSkipped, cycleSkipped, markerInfo.created);
        return {
            ok: true,
            status: status,
            candidateCount: targetLayers.length,
            attachedCount: attachedCount,
            releasedCount: released.length,
            externalParentSkipped: externalParentSkipped,
            expressionSkipped: expressionSkipped,
            cycleSkipped: cycleSkipped,
            markerCreated: markerInfo.created
        };
    } catch (error) {
        rollbackParents = backups === null || typeof backups === "undefined" ? true :
            restoreParentBackups(backups);
        rollbackMarker = restoreMarkerSnapshot(group, markerSnapshot, markerInfo !== null && markerInfo.created ? markerInfo : null);

        if (rollbackParents && rollbackMarker) {
            return makeFailure(STATUS_APPLY_ROLLBACK);
        }

        return makeFailure(STATUS_APPLY_ROLLBACK_FAILED);
    }
}

function beginUndoAction(name, action) {
    var result;

    app.beginUndoGroup(name);
    try {
        result = action();
    } catch (error) {
        setStatusText(getErrorText(error));
        result = makeFailure(getErrorText(error));
    } finally {
        app.endUndoGroup();
    }

    return result;
}

function resolveSelectedGroup(group, comp) {
    var selection = getSelectedGroup(comp);

    if (selection.error !== null) {
        return {
            group: null,
            error: selection.error
        };
    }

    if (group !== null && typeof group !== "undefined" && selection.group !== group) {
        return {
            group: null,
            error: STATUS_NO_GROUP
        };
    }

    return {
        group: selection.group,
        error: null
    };
}

function applyGroup(group, comp) {
    var targetComp = comp || getActiveComp();
    var resolved;
    var result;

    result = beginUndoAction("Undo Apply Group", function () {
        if (targetComp === null) {
            setStatusText(STATUS_NO_COMP);
            return makeFailure(STATUS_NO_COMP);
        }

        resolved = resolveSelectedGroup(group, targetComp);
        if (resolved.error !== null) {
            setStatusText(resolved.error);
            return makeFailure(resolved.error);
        }

        result = applyGroupCore(resolved.group, targetComp);
        setStatusText(result.status);
        return result;
    });

    return result;
}

function findUniqueGroupName(comp) {
    var names = {};
    var index;
    var layer;
    var candidate;
    var number = 2;

    for (index = 1; index <= comp.numLayers; index += 1) {
        layer = comp.layer(index);
        names[String(layer.name)] = true;
    }

    if (!names[GROUP_CONTROL_GROUP_NAME]) {
        return GROUP_CONTROL_GROUP_NAME;
    }

    while (true) {
        candidate = GROUP_CONTROL_GROUP_NAME + " " + number;
        if (!names[candidate]) {
            return candidate;
        }
        number += 1;
    }
}

function getTopmostSelectedLayer(comp) {
    var selected = comp.selectedLayers || [];
    var topmost = null;
    var index;

    for (index = 0; index < selected.length; index += 1) {
        if (topmost === null || selected[index].index < topmost.index) {
            topmost = selected[index];
        }
    }

    return topmost;
}

function deselectAllLayers(comp) {
    var index;

    for (index = 1; index <= comp.numLayers; index += 1) {
        comp.layer(index).selected = false;
    }
}

function createGroupCore(comp) {
    var anchor = getTopmostSelectedLayer(comp);
    var group = null;
    var effects;
    var effect;
    var layerCountProperty;

    if (comp === null || typeof comp === "undefined") {
        return makeFailure(STATUS_NO_COMP);
    }

    try {
        group = comp.layers.addNull();
        group.name = findUniqueGroupName(comp);

        if (anchor !== null) {
            group.moveBefore(anchor);
        } else if (group.index !== 1) {
            group.moveBefore(comp.layer(1));
        }

        effects = getEffectsProperty(group);
        if (effects === null || typeof effects.addProperty !== "function") {
            throw new Error("Effect追加先が見つかりません。");
        }

        effect = effects.addProperty(GROUP_CONTROL_EFFECT_MATCH_NAME);
        if (effect === null || typeof effect === "undefined" ||
                effect.matchName !== GROUP_CONTROL_EFFECT_MATCH_NAME) {
            throw new Error("Group Control Effectを追加できませんでした。");
        }

        layerCountProperty = getLayerCountProperty(effect);
        if (layerCountProperty === null) {
            throw new Error("Layer Countパラメータを確認できませんでした。");
        }

        layerCountProperty.setValue(0);
        deselectAllLayers(comp);
        group.selected = true;

        return {
            ok: true,
            status: "Group Nullを作成しました。",
            group: group
        };
    } catch (error) {
        if (group !== null) {
            try {
                group.remove();
            } catch (removeError) {
                setStatusText("Group Nullを作成できませんでした。" + getErrorText(removeError));
                return makeFailure("Group Nullを作成できませんでした。" + getErrorText(removeError));
            }
        }

        return makeFailure("Group Nullを作成できませんでした。" + getErrorText(error));
    }
}

function createGroup() {
    var comp = getActiveComp();
    var result = beginUndoAction("Undo Create Group", function () {
        if (comp === null) {
            setStatusText(STATUS_NO_COMP);
            return makeFailure(STATUS_NO_COMP);
        }

        result = createGroupCore(comp);
        setStatusText(result.status);
        return result;
    });

    return result;
}

function restoreLayerParentFromRecord(layer, record, comp, parentMap) {
    var desiredParent;
    var desiredParentId = Number(record.originalParentId);

    if (desiredParentId <= 0) {
        setParentAndMap(layer, null, parentMap);
        return true;
    }

    desiredParent = findLayerById(comp, desiredParentId);
    if (desiredParent === null || GroupControlCore.wouldCreateParentCycle(
            getLayerId(layer), desiredParentId, parentMap)) {
        setParentAndMap(layer, null, parentMap);
        return false;
    }

    setParentAndMap(layer, desiredParent, parentMap);
    return true;
}

function removeNestedRecordFromOuterMarker(outerGroup, outerValidation, nestedGroupId) {
    var records = [];
    var index;
    var record;

    for (index = 0; index < outerValidation.state.records.length; index += 1) {
        record = outerValidation.state.records[index];
        if (Number(record.layerId) !== Number(nestedGroupId)) {
            records.push({
                layerId: record.layerId,
                originalParentId: record.originalParentId
            });
        }
    }

    setMarkerValueAtKey(getMarkerProperty(outerGroup), outerValidation.candidate.index,
        GroupControlCore.encodeGroupState({
            version: 1,
            groupId: getLayerId(outerGroup),
            records: records
        }));
}

function removeGroupOwnedEffectsFromComp(group, comp) {
    var groupId = getLayerId(group);

    if (groupId <= 0) {
        return;
    }

    GroupControlEffectSync.removeOwnedEffects(getAllCompLayers(comp), groupId);
}

function ungroupCore(group, comp) {
    var markerValidation;
    var state;
    var directChildren = [];
    var index;
    var layer;
    var record;
    var outerGroup;
    var outerValidation = null;
    var targetMarkerSnapshot;
    var outerMarkerSnapshot = null;
    var backups = [];
    var parentMap;
    var marker;
    var groupRemoved = false;
    var restoreParentsOk;
    var restoreMarkersOk;

    if (comp === null || typeof comp === "undefined") {
        return makeFailure(STATUS_NO_COMP);
    }

    if (!isGroupLayer(group)) {
        return makeFailure(STATUS_NO_GROUP);
    }

    markerValidation = validateGroupMarker(group, comp);
    if (!markerValidation.valid) {
        return makeFailure(markerValidation.status);
    }

    state = markerValidation.state;
    for (index = 1; index <= comp.numLayers; index += 1) {
        layer = comp.layer(index);
        if (getParentId(layer) === getLayerId(group)) {
            directChildren.push(layer);
        }
    }

    for (index = 0; index < directChildren.length; index += 1) {
        if (!hasRecordForLayer(state, getLayerId(directChildren[index]))) {
            return makeFailure(STATUS_DIRECT_CHILD_MARKER);
        }
    }

    outerGroup = group.parent;
    if (outerGroup !== null && typeof outerGroup !== "undefined" &&
            isGroupLayer(outerGroup)) {
        outerValidation = validateGroupMarker(outerGroup, comp);
        if (!outerValidation.valid || outerValidation.state === null ||
                !hasRecordForLayer(outerValidation.state, getLayerId(group))) {
            return makeFailure(STATUS_NESTED_MARKER);
        }
    }

    if (state === null && directChildren.length === 0) {
        try {
            removeGroupOwnedEffectsFromComp(group, comp);
            group.remove();
            return {
                ok: true,
                status: STATUS_UNGROUP_COMPLETE,
                removedGroup: true,
                restoredCount: 0
            };
        } catch (error) {
            return makeFailure(STATUS_UNGROUP_ROLLBACK);
        }
    }

    targetMarkerSnapshot = markerValidation.candidate === null ? {
        exists: false
    } : {
        exists: true,
        index: markerValidation.candidate.index,
        time: markerValidation.candidate.time,
        comment: markerValidation.candidate.comment
    };

    if (outerValidation !== null) {
        outerMarkerSnapshot = {
            exists: true,
            index: outerValidation.candidate.index,
            time: outerValidation.candidate.time,
            comment: outerValidation.candidate.comment
        };
    }

    for (index = 0; state !== null && index < state.records.length; index += 1) {
        record = state.records[index];
        layer = findLayerById(comp, record.layerId);
        if (layer !== null) {
            backups.push({
                layer: layer,
                parent: layer.parent || null
            });
        }
    }

    try {
        parentMap = buildParentMap(comp);
        for (index = 0; state !== null && index < state.records.length; index += 1) {
            record = state.records[index];
            layer = findLayerById(comp, record.layerId);
            if (layer !== null && getParentId(layer) === getLayerId(group)) {
                restoreLayerParentFromRecord(layer, record, comp, parentMap);
            }
        }

        marker = getMarkerProperty(group);
        if (markerValidation.candidate !== null) {
            marker.removeKey(markerValidation.candidate.index);
        }

        if (outerValidation !== null) {
            removeNestedRecordFromOuterMarker(outerGroup, outerValidation, getLayerId(group));
        }

        removeGroupOwnedEffectsFromComp(group, comp);
        group.remove();
        groupRemoved = true;
        return {
            ok: true,
            status: STATUS_UNGROUP_COMPLETE,
            removedGroup: true,
            restoredCount: state === null ? 0 : state.records.length
        };
    } catch (error) {
        restoreParentsOk = groupRemoved ? false : restoreParentBackups(backups);
        restoreMarkersOk = true;

        if (!groupRemoved) {
            restoreMarkersOk = restoreMarkerSnapshot(group, targetMarkerSnapshot, null) && restoreMarkersOk;
            if (outerValidation !== null) {
                restoreMarkersOk = restoreMarkerSnapshot(outerGroup, outerMarkerSnapshot, null) && restoreMarkersOk;
            }
        }

        if (restoreParentsOk && restoreMarkersOk) {
            return makeFailure(STATUS_UNGROUP_ROLLBACK);
        }

        return makeFailure(STATUS_UNGROUP_ROLLBACK_FAILED);
    }
}

function ungroup(group, comp) {
    var targetComp = comp || getActiveComp();
    var result = beginUndoAction("Undo Ungroup", function () {
        var resolved;

        if (targetComp === null) {
            setStatusText(STATUS_NO_COMP);
            return makeFailure(STATUS_NO_COMP);
        }

        resolved = resolveSelectedGroup(group, targetComp);
        if (resolved.error !== null) {
            setStatusText(resolved.error);
            return makeFailure(resolved.error);
        }

        result = ungroupCore(resolved.group, targetComp);
        setStatusText(result.status);
        return result;
    });

    return result;
}

function changeLayerCount(delta) {
    var comp = getActiveComp();
    var result = beginUndoAction(delta > 0 ? "Undo Change Group Count +" : "Undo Change Group Count -", function () {
        var selection;
        var group;
        var nextValue;

        if (comp === null) {
            setStatusText(STATUS_NO_COMP);
            return makeFailure(STATUS_NO_COMP);
        }

        selection = getSelectedGroup(comp);
        if (selection.error !== null) {
            setStatusText(selection.error);
            return makeFailure(selection.error);
        }

        group = selection.group;
        nextValue = GroupControlCore.clampLayerCount(
            getLayerCount(group, comp) + delta, comp.numLayers);
        setLayerCount(group, comp, nextValue);
        result = applyGroupCore(group, comp);
        setStatusText(result.status);
        return result;
    });

    return result;
}

function refreshPanel() {
    var comp = getActiveComp();
    var selection;
    var count = 0;

    if (groupControlUI === null) {
        return;
    }

    if (comp === null) {
        groupControlUI.selectedGroupText.text = "None";
        groupControlUI.countText.text = "0";
        groupControlUI.minusButton.enabled = false;
        groupControlUI.plusButton.enabled = false;
        groupControlUI.applyButton.enabled = false;
        groupControlUI.ungroupButton.enabled = false;
        return;
    }

    selection = getSelectedGroup(comp);
    if (selection.error !== null) {
        groupControlUI.selectedGroupText.text = "None";
        groupControlUI.countText.text = "0";
        groupControlUI.minusButton.enabled = false;
        groupControlUI.plusButton.enabled = false;
        groupControlUI.applyButton.enabled = false;
        groupControlUI.ungroupButton.enabled = false;
        return;
    }

    try {
        count = getLayerCount(selection.group, comp);
    } catch (error) {
        count = 0;
    }

    groupControlUI.selectedGroupText.text = String(selection.group.name);
    groupControlUI.countText.text = String(count);
    groupControlUI.minusButton.enabled = count > 0;
    groupControlUI.plusButton.enabled = count < comp.numLayers;
    groupControlUI.applyButton.enabled = true;
    groupControlUI.ungroupButton.enabled = true;
}

function buildUI(thisObj) {
    var panel;
    var title;
    var selectedLabel;
    var selectedGroupText;
    var layersLabel;
    var layersRow;
    var minusButton;
    var countText;
    var plusButton;
    var statusLabel;
    var statusText;
    var createButton;
    var applyButton;
    var ungroupButton;

    if (thisObj instanceof Panel) {
        panel = thisObj;
    } else {
        panel = new Window("palette", "Group Control", undefined, {resizeable: true});
    }

    panel.orientation = "column";
    panel.alignChildren = ["fill", "top"];

    title = panel.add("statictext", undefined, "GROUP CONTROL");
    title.alignment = ["fill", "top"];
    createButton = panel.add("button", undefined, "Create Group");
    selectedLabel = panel.add("statictext", undefined, "Selected Group");
    selectedGroupText = panel.add("statictext", undefined, "None");
    layersLabel = panel.add("statictext", undefined, "Layers");
    layersRow = panel.add("group");
    layersRow.orientation = "row";
    minusButton = layersRow.add("button", undefined, "-");
    countText = layersRow.add("statictext", undefined, "0");
    plusButton = layersRow.add("button", undefined, "+");
    statusLabel = panel.add("statictext", undefined, "Status Text");
    statusText = panel.add("statictext", undefined, "");
    statusText.alignment = ["fill", "top"];
    applyButton = panel.add("button", undefined, "Apply");
    ungroupButton = panel.add("button", undefined, "Ungroup");

    groupControlUI = {
        root: panel,
        selectedGroupText: selectedGroupText,
        countText: countText,
        statusText: statusText,
        minusButton: minusButton,
        plusButton: plusButton,
        applyButton: applyButton,
        ungroupButton: ungroupButton,
        createButton: createButton
    };

    createButton.onClick = function () {
        createGroup();
        refreshPanel();
    };

    minusButton.onClick = function () {
        changeLayerCount(-1);
        refreshPanel();
    };

    plusButton.onClick = function () {
        changeLayerCount(1);
        refreshPanel();
    };

    applyButton.onClick = function () {
        applyGroup(null, null);
        refreshPanel();
    };

    ungroupButton.onClick = function () {
        ungroup(null, null);
        refreshPanel();
    };

    panel.onActivate = function () {
        refreshPanel();
    };

    panel.onClose = function () {
        GroupControlEffectWatcherStop();
    };

    panel.onResizing = panel.onResize = function () {
        this.layout.resize();
    };

    refreshPanel();
    GroupControlEffectWatcherStart();

    if (panel instanceof Window) {
        panel.center();
        panel.show();
    }

    return panel;
}

var GroupControlPanel = buildUI(this);
