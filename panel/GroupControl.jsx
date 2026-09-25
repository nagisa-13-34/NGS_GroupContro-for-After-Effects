#include "GroupControlCore.jsxinc"
#include "GroupControlEffectSync.jsxinc"

/*
 * Group Control ScriptUI panel and After Effects adapter.
 *
 * This file intentionally stays in ExtendScript-compatible ES3 syntax. The
 * panel owns the AE object model, while GroupControlCore owns pure logic and
 * persistent Group state stored in the Group Null's comment.
 */

var GROUP_CONTROL_EFFECT_MATCH_NAME = "NGS_GroupControl";
var GROUP_CONTROL_LAYER_COUNT_MATCH_NAME = "NGS_GroupControl-LayerCount";
var GROUP_CONTROL_LAYER_COUNT_REQUESTED_MATCH_NAME = "NGS_GroupControl-LayerCount";
var GROUP_CONTROL_LAYER_COUNT_HOST_MATCH_NAME = "NGS_GroupControl-0001";
var GROUP_CONTROL_LAYER_COUNT_DISPLAY_NAME = "Layer Count";
var GROUP_CONTROL_GROUP_NAME = "[G] Group";
var GROUP_CONTROL_COMMENT_STATE_BEGIN = "<<<NGS_GROUP_CONTROL_STATE_BEGIN>>>";
var GROUP_CONTROL_COMMENT_STATE_END = "<<<NGS_GROUP_CONTROL_STATE_END>>>";

var STATUS_NO_COMP = "コンポジションを開いてください。";
var STATUS_NO_GROUP = "Group Nullを選択してください。";
var STATUS_MULTIPLE_GROUPS = "Group Nullを1つだけ選択してください。";
var STATUS_MULTIPLE_MARKERS = "Group情報が重複しているため処理を中断しました。";
var STATUS_MARKER_SYNTAX = "Group情報の形式が不正です。";
var STATUS_MARKER_ID = "Group情報のIDが不正です。";
var STATUS_MARKER_GROUP_MISMATCH = "Group情報のIDがGroup Nullと一致しません。";
var STATUS_MARKER_DUPLICATE = "Group情報のLayer IDが重複しています。";
var STATUS_MARKER_SELF_ID = "Group情報にGroup Null自身のIDがあります。";
var STATUS_GROUP_KEYS = "Group NullのTransformにキーがあるためApplyを中断しました。";
var STATUS_APPLY_ROLLBACK = "Applyを中断しました。変更を復元しました。";
var STATUS_APPLY_ROLLBACK_FAILED = "Applyを中断しました。変更を完全には復元できませんでした。";
var STATUS_GROUP_STATE_CREATED = "Group情報を保存しました。";
var STATUS_NESTED_MARKER = "外側Groupの記録にNested GroupがないためUngroupを中断しました。";
var STATUS_DIRECT_CHILD_MARKER = "Group Nullの直接子Layerに記録がないためUngroupを中断しました。";
var STATUS_UNGROUP_ROLLBACK = "Ungroupを中断しました。変更を復元しました。";
var STATUS_UNGROUP_ROLLBACK_FAILED = "Ungroupを中断しました。変更を完全には復元できませんでした。";
var STATUS_UNGROUP_COMPLETE = "Ungroup完了。";

var groupControlUI = null;
var GROUP_CONTROL_EFFECT_SYNC_INTERVAL_MS = 200;
var GROUP_CONTROL_EFFECT_SYNC_PENDING_INTERVAL_MS = 10;
var GROUP_CONTROL_LAYER_COUNT_AUTO_APPLY_DEBOUNCE_MS = 350;
var GROUP_CONTROL_EFFECT_WATCHER_STATE_KEY = "__NGS_GroupControlEffectWatcherState";
var groupControlEffectWatcherRuntimeToken = {};
var groupControlEffectWatcherStateGlobal = this;
var groupControlEffectWatcherState = null;

try {
    if (typeof $ !== "undefined" && $ !== null &&
            $.global !== null && typeof $.global !== "undefined") {
        groupControlEffectWatcherStateGlobal = $.global;
    }
} catch (globalError) {
    groupControlEffectWatcherStateGlobal = this;
}

if (groupControlEffectWatcherStateGlobal === null ||
        typeof groupControlEffectWatcherStateGlobal !== "object") {
    groupControlEffectWatcherStateGlobal = this;
}

if (typeof groupControlEffectWatcherStateGlobal[GROUP_CONTROL_EFFECT_WATCHER_STATE_KEY] === "undefined" ||
        groupControlEffectWatcherStateGlobal[GROUP_CONTROL_EFFECT_WATCHER_STATE_KEY] === null) {
    groupControlEffectWatcherStateGlobal[GROUP_CONTROL_EFFECT_WATCHER_STATE_KEY] = {
        active: false,
        taskId: null,
        ticking: false,
        session: null,
        project: null,
        comp: null,
        owner: null,
        generation: 0,
        runtimeToken: null,
        app: null,
        layerCountWatch: null
    };
}

groupControlEffectWatcherState =
    groupControlEffectWatcherStateGlobal[GROUP_CONTROL_EFFECT_WATCHER_STATE_KEY];

if (typeof groupControlEffectWatcherState.active !== "boolean") {
    groupControlEffectWatcherState.active = false;
}
if (typeof groupControlEffectWatcherState.taskId === "undefined") {
    groupControlEffectWatcherState.taskId = null;
}
if (typeof groupControlEffectWatcherState.ticking !== "boolean") {
    groupControlEffectWatcherState.ticking = false;
}
if (typeof groupControlEffectWatcherState.session === "undefined") {
    groupControlEffectWatcherState.session = null;
}
if (typeof groupControlEffectWatcherState.project === "undefined") {
    groupControlEffectWatcherState.project = null;
}
if (typeof groupControlEffectWatcherState.comp === "undefined") {
    groupControlEffectWatcherState.comp = null;
}
if (typeof groupControlEffectWatcherState.owner === "undefined") {
    groupControlEffectWatcherState.owner = null;
}
if (typeof groupControlEffectWatcherState.generation !== "number") {
    groupControlEffectWatcherState.generation = 0;
}
if (typeof groupControlEffectWatcherState.runtimeToken === "undefined") {
    groupControlEffectWatcherState.runtimeToken = null;
}
if (typeof groupControlEffectWatcherState.app === "undefined") {
    groupControlEffectWatcherState.app = null;
}
if (groupControlEffectWatcherState.layerCountWatch === null ||
        typeof groupControlEffectWatcherState.layerCountWatch === "undefined") {
    groupControlEffectWatcherState.layerCountWatch = {
        comp: null,
        groupId: 0,
        count: null,
        pending: []
    };
}
if (Object.prototype.toString.call(
        groupControlEffectWatcherState.layerCountWatch.pending) !== "[object Array]") {
    groupControlEffectWatcherState.layerCountWatch.pending = [];
}

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

    if (typeof app === "undefined" || app === null ||
            app.project === null || typeof app.project === "undefined") {
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

function makeEmptyGroupEffectWatcherTickStats() {
    return {
        discoveryLayers: 0,
        targetLayers: 0,
        terminalVisits: 0,
        terminalCount: 0,
        propertyOperations: 0,
        effectAddAttempts: 0,
        createdCount: 0,
        removedCount: 0,
        skippedTargets: 0,
        errors: 0,
        pending: false,
        elapsedMs: 0
    };
}

function makeEmptyGroupEffectWatcherStats() {
    var stats = makeEmptyGroupEffectWatcherTickStats();

    return {
        lastTick: stats,
        totals: {
            discoveryLayers: 0,
            targetLayers: 0,
            terminalVisits: 0,
            terminalCount: 0,
            propertyOperations: 0,
            effectAddAttempts: 0,
            createdCount: 0,
            removedCount: 0,
            skippedTargets: 0,
            errors: 0,
            pending: false,
            elapsedMs: 0,
            ticks: 0
        },
        pending: false
    };
}

function getGroupEffectWatcherStats() {
    var session = groupControlEffectWatcherState.session;

    if (session !== null && typeof session !== "undefined" &&
            typeof session.getStats === "function") {
        try {
            return session.getStats();
        } catch (statsError) {
            /* Return an empty snapshot if the host invalidated the session. */
        }
    }

    return makeEmptyGroupEffectWatcherStats();
}

function getGroupEffectWatcherApp() {
    if (typeof app !== "undefined" && app !== null) {
        return app;
    }

    return groupControlEffectWatcherState.app;
}

function getGroupEffectWatcherProject() {
    var hostApp = getGroupEffectWatcherApp();

    if (hostApp === null || typeof hostApp === "undefined" ||
            hostApp.project === null || typeof hostApp.project === "undefined") {
        return null;
    }

    return hostApp.project;
}

function resetGroupLayerCountWatcher() {
    var watch = groupControlEffectWatcherState.layerCountWatch;

    watch.comp = null;
    watch.groupId = 0;
    watch.count = null;
    watch.pending = [];
}

function resetGroupEffectWatcherSession(discardSession) {
    var session = groupControlEffectWatcherState.session;

    if (session !== null && typeof session !== "undefined" &&
            typeof session.reset === "function") {
        try {
            session.reset();
        } catch (resetError) {
            /* A stale host object must not stop the watcher lifecycle. */
        }
    }

    groupControlEffectWatcherState.comp = null;
    groupControlEffectWatcherState.project = null;
    resetGroupLayerCountWatcher();
    if (discardSession === true) {
        groupControlEffectWatcherState.session = null;
    }
}

function cancelGroupEffectWatcherTask() {
    var taskId = groupControlEffectWatcherState.taskId;
    var hostApp = groupControlEffectWatcherState.app;

    groupControlEffectWatcherState.taskId = null;
    if (taskId === null || typeof taskId === "undefined") {
        return;
    }

    if (hostApp === null || typeof hostApp === "undefined") {
        hostApp = getGroupEffectWatcherApp();
    }

    if (hostApp === null || typeof hostApp === "undefined" ||
            typeof hostApp.cancelTask !== "function") {
        return;
    }

    try {
        if (typeof app !== "undefined" && app !== null &&
                typeof app.cancelTask === "function" && hostApp === app) {
            app.cancelTask(taskId);
        } else {
            hostApp.cancelTask(taskId);
        }
    } catch (cancelError) {
        /* A missing or already-completed task is safe to ignore. */
    }
}

function scheduleGroupEffectWatcher() {
    var hostApp;
    var taskId;
    var delay = GROUP_CONTROL_EFFECT_SYNC_INTERVAL_MS;
    var stats;

    if (!groupControlEffectWatcherState.active ||
            groupControlEffectWatcherState.runtimeToken !== groupControlEffectWatcherRuntimeToken ||
            groupControlEffectWatcherState.taskId !== null) {
        return;
    }

    hostApp = getGroupEffectWatcherApp();
    if (hostApp === null || typeof hostApp === "undefined" ||
            typeof hostApp.scheduleTask !== "function") {
        return;
    }

    groupControlEffectWatcherState.app = hostApp;
    stats = getGroupEffectWatcherStats();
    if (stats !== null && typeof stats !== "undefined" && stats.pending === true) {
        delay = GROUP_CONTROL_EFFECT_SYNC_PENDING_INTERVAL_MS;
    }
    try {
        if (typeof app !== "undefined" && app !== null &&
                typeof app.scheduleTask === "function" && hostApp === app) {
            taskId = app.scheduleTask("GroupControlEffectWatcherTick(" +
                groupControlEffectWatcherState.generation + ")",
                delay, false);
        } else {
            taskId = hostApp.scheduleTask("GroupControlEffectWatcherTick(" +
                groupControlEffectWatcherState.generation + ")",
                delay, false);
        }
        if (taskId !== null && typeof taskId !== "undefined") {
            groupControlEffectWatcherState.taskId = taskId;
        }
    } catch (scheduleError) {
        groupControlEffectWatcherState.taskId = null;
    }
}

function getGroupEffectWatcherTargetRange(group, comp) {
    var count = getLayerCount(group, comp);

    return GroupControlCore.getTargetIndexRange(group.index, count, comp.numLayers);
}

function rememberGroupLayerCount(group, comp, count) {
    var watch = groupControlEffectWatcherState.layerCountWatch;
    var groupId = getLayerId(group);
    var index;

    watch.comp = comp;
    watch.groupId = groupId;
    watch.count = GroupControlCore.clampLayerCount(count, comp.numLayers);
    for (index = watch.pending.length - 1; index >= 0; index -= 1) {
        if (watch.pending[index].groupId === groupId) {
            watch.pending.splice(index, 1);
        }
    }
}

function applyPendingGroupLayerCountChange(comp, nowValue) {
    var watch = groupControlEffectWatcherState.layerCountWatch;
    var index;
    var pending;
    var group;
    var count;
    var result;

    if (watch.pending.length === 0) {
        return false;
    }

    if (watch.comp !== comp) {
        resetGroupLayerCountWatcher();
        watch.comp = comp;
        return false;
    }

    for (index = 0; index < watch.pending.length; index += 1) {
        pending = watch.pending[index];
        group = findLayerById(comp, pending.groupId);
        if (group === null || !isGroupLayer(group)) {
            watch.pending.splice(index, 1);
            return false;
        }

        try {
            count = getLayerCount(group, comp);
        } catch (countError) {
            watch.pending.splice(index, 1);
            return false;
        }

        if (count === pending.originalCount) {
            if (watch.groupId === pending.groupId) {
                watch.count = count;
            }
            watch.pending.splice(index, 1);
            return false;
        }

        if (count !== pending.count) {
            pending.count = count;
            pending.changedAt = nowValue;
            if (watch.groupId === pending.groupId) {
                watch.count = count;
            }
            continue;
        }

        if (watch.groupId === pending.groupId) {
            watch.count = count;
        }

        if (nowValue - pending.changedAt < GROUP_CONTROL_LAYER_COUNT_AUTO_APPLY_DEBOUNCE_MS) {
            continue;
        }

        watch.pending.splice(index, 1);
        watch.groupId = pending.groupId;
        watch.count = count;
        result = beginUndoAction("Undo Auto Apply Group", function () {
            return applyGroupCore(group, comp);
        });
        setStatusText(result.status);
        refreshPanel();
        return true;
    }

    return false;
}

function watchSelectedGroupLayerCount(comp) {
    var watch = groupControlEffectWatcherState.layerCountWatch;
    var nowValue = new Date().getTime();
    var selection;
    var group;
    var groupId;
    var count;
    var index;
    var pending;

    if (watch.comp !== comp) {
        resetGroupLayerCountWatcher();
        watch.comp = comp;
    }

    applyPendingGroupLayerCountChange(comp, nowValue);

    selection = getSelectedGroup(comp);
    if (selection.error !== null) {
        watch.groupId = 0;
        watch.count = null;
        return;
    }

    group = selection.group;
    groupId = getLayerId(group);
    try {
        count = getLayerCount(group, comp);
    } catch (readError) {
        watch.groupId = 0;
        watch.count = null;
        return;
    }

    if (watch.groupId !== groupId || watch.count === null) {
        watch.groupId = groupId;
        watch.count = count;
        return;
    }

    if (watch.count === count) {
        return;
    }

    pending = null;
    for (index = 0; index < watch.pending.length; index += 1) {
        if (watch.pending[index].groupId === groupId) {
            pending = watch.pending[index];
            break;
        }
    }
    if (pending !== null) {
        if (count === pending.originalCount) {
            watch.pending.splice(index, 1);
        } else {
            pending.count = count;
            pending.changedAt = nowValue;
        }
    } else {
        watch.pending.push({
            groupId: groupId,
            originalCount: watch.count,
            count: count,
            changedAt: nowValue
        });
    }

    watch.count = count;
    refreshPanel();
}

function createGroupEffectWatcherSession() {
    if (typeof GroupControlEffectSync === "undefined" ||
            GroupControlEffectSync === null ||
            typeof GroupControlEffectSync.createIncrementalSession !== "function") {
        return null;
    }

    try {
        return GroupControlEffectSync.createIncrementalSession({
            isGroupLayer: isGroupLayer,
            getTargetRange: getGroupEffectWatcherTargetRange,
            maxDiscoveryLayers: 16,
            maxTargetLayers: 16,
            timeBudgetMs: 12,
            maxPropertyOperations: 64,
            maxEffectAdds: 16,
            now: function () {
                return new Date().getTime();
            }
        });
    } catch (sessionError) {
        return null;
    }
}

function ensureGroupEffectWatcherSession() {
    if (groupControlEffectWatcherState.session === null ||
            typeof groupControlEffectWatcherState.session === "undefined") {
        groupControlEffectWatcherState.session = createGroupEffectWatcherSession();
    }

    return groupControlEffectWatcherState.session;
}

function isCurrentGroupEffectWatcherOwner(owner, allowInactive) {
    if (groupControlEffectWatcherState.runtimeToken !== groupControlEffectWatcherRuntimeToken) {
        return false;
    }

    if (owner !== null && typeof owner !== "undefined" &&
            groupControlEffectWatcherState.owner !== owner) {
        return false;
    }

    return allowInactive === true || groupControlEffectWatcherState.active;
}

function runGroupEffectWatcherOnce(owner, reschedule) {
    var comp;
    var project;
    var session;
    var tickStats;

    if (!isCurrentGroupEffectWatcherOwner(owner, true) ||
            groupControlEffectWatcherState.ticking) {
        return getGroupEffectWatcherStats();
    }

    groupControlEffectWatcherState.ticking = true;
    try {
        comp = getActiveComp();
        project = getGroupEffectWatcherProject();
        if (comp === null || project === null) {
            resetGroupEffectWatcherSession(false);
            return getGroupEffectWatcherStats();
        }

        if (groupControlEffectWatcherState.comp !== comp ||
                groupControlEffectWatcherState.project !== project) {
            resetGroupEffectWatcherSession(false);
            groupControlEffectWatcherState.comp = comp;
            groupControlEffectWatcherState.project = project;
        }

        watchSelectedGroupLayerCount(comp);

        session = ensureGroupEffectWatcherSession();
        if (session !== null && typeof session !== "undefined" &&
                typeof session.step === "function") {
            tickStats = session.step(comp, {projectId: project});
        }
    } catch (watcherError) {
        /* Keep the one-shot watcher alive when the host changes mid-tick. */
    } finally {
        groupControlEffectWatcherState.ticking = false;
        if (reschedule === true &&
                isCurrentGroupEffectWatcherOwner(owner, false)) {
            scheduleGroupEffectWatcher();
        }
    }

    return tickStats || getGroupEffectWatcherStats();
}

function GroupControlEffectWatcherTick(generation) {
    var owner = groupControlEffectWatcherState.owner;

    if (generation !== null && typeof generation !== "undefined" &&
            Number(generation) !== groupControlEffectWatcherState.generation) {
        return getGroupEffectWatcherStats();
    }

    if (!isCurrentGroupEffectWatcherOwner(owner, false) ||
            groupControlEffectWatcherState.ticking) {
        return getGroupEffectWatcherStats();
    }

    /* The current scheduleTask invocation is one-shot and has now fired. */
    groupControlEffectWatcherState.taskId = null;
    return runGroupEffectWatcherOnce(owner, true);
}

/*
 * scheduleTask evaluates its string in the ExtendScript global scope. Some
 * JSXBIN encoders wrap the source in a private function, so a top-level
 * declaration alone is not visible to that later evaluation. Publish the
 * callback explicitly while retaining the simple callback string for older
 * hosts and the test adapter.
 */
try {
    if (typeof $ !== "undefined" && $.global !== null &&
            typeof $.global !== "undefined") {
        $.global.GroupControlEffectWatcherTick = GroupControlEffectWatcherTick;
    }
} catch (watcherExportError) {
    /* Older hosts may not expose $.global; the local declaration still works. */
}

function startGroupEffectWatcher() {
    var hostApp;
    var owner;

    if (groupControlEffectWatcherState.active &&
            groupControlEffectWatcherState.runtimeToken !== groupControlEffectWatcherRuntimeToken) {
        cancelGroupEffectWatcherTask();
        resetGroupEffectWatcherSession(true);
        groupControlEffectWatcherState.active = false;
        groupControlEffectWatcherState.ticking = false;
        groupControlEffectWatcherState.owner = null;
    } else if (!groupControlEffectWatcherState.active &&
            groupControlEffectWatcherState.runtimeToken !== groupControlEffectWatcherRuntimeToken) {
        resetGroupEffectWatcherSession(true);
    }

    if (groupControlEffectWatcherState.active) {
        return groupControlEffectWatcherState.owner;
    }

    hostApp = getGroupEffectWatcherApp();
    groupControlEffectWatcherState.active = true;
    groupControlEffectWatcherState.runtimeToken = groupControlEffectWatcherRuntimeToken;
    groupControlEffectWatcherState.app = hostApp;
    groupControlEffectWatcherState.generation += 1;
    owner = {
        generation: groupControlEffectWatcherState.generation,
        runtimeToken: groupControlEffectWatcherRuntimeToken
    };
    groupControlEffectWatcherState.owner = owner;
    groupControlEffectWatcherState.ticking = false;

    /* Startup performs exactly one bounded, unscheduled tick. */
    runGroupEffectWatcherOnce(owner, false);
    scheduleGroupEffectWatcher();
    return owner;
}

function stopGroupEffectWatcher(owner) {
    if (owner !== null && typeof owner !== "undefined" &&
            groupControlEffectWatcherState.owner !== owner) {
        return;
    }

    if (owner !== null && typeof owner !== "undefined" &&
            groupControlEffectWatcherState.runtimeToken !== groupControlEffectWatcherRuntimeToken) {
        return;
    }

    cancelGroupEffectWatcherTask();
    groupControlEffectWatcherState.active = false;
    groupControlEffectWatcherState.ticking = false;
    resetGroupEffectWatcherSession(true);
    groupControlEffectWatcherState.owner = null;
    groupControlEffectWatcherState.runtimeToken = groupControlEffectWatcherRuntimeToken;
}

function GroupControlEffectWatcherStart() {
    return startGroupEffectWatcher();
}

function GroupControlEffectWatcherStop(owner) {
    stopGroupEffectWatcher(owner);
}

function GroupControlEffectWatcherRunOnce() {
    if (!groupControlEffectWatcherState.active &&
            groupControlEffectWatcherState.runtimeToken !== groupControlEffectWatcherRuntimeToken) {
        cancelGroupEffectWatcherTask();
        resetGroupEffectWatcherSession(true);
        groupControlEffectWatcherState.runtimeToken = groupControlEffectWatcherRuntimeToken;
        groupControlEffectWatcherState.owner = null;
        groupControlEffectWatcherState.ticking = false;
    }

    return runGroupEffectWatcherOnce(null, false);
}

function GroupControlEffectWatcherGetStats() {
    return getGroupEffectWatcherStats();
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

function getGroupCommentStateBlock(comment) {
    var source = String(comment || "");
    var beginIndex = source.indexOf(GROUP_CONTROL_COMMENT_STATE_BEGIN);
    var secondBeginIndex;
    var endIndex;
    var secondEndIndex;
    var contentStart;
    var content;

    if (beginIndex < 0) {
        return {
            exists: false,
            valid: true,
            source: source
        };
    }

    secondBeginIndex = source.indexOf(GROUP_CONTROL_COMMENT_STATE_BEGIN,
        beginIndex + GROUP_CONTROL_COMMENT_STATE_BEGIN.length);
    endIndex = source.indexOf(GROUP_CONTROL_COMMENT_STATE_END,
        beginIndex + GROUP_CONTROL_COMMENT_STATE_BEGIN.length);
    secondEndIndex = endIndex < 0 ? -1 : source.indexOf(
        GROUP_CONTROL_COMMENT_STATE_END,
        endIndex + GROUP_CONTROL_COMMENT_STATE_END.length);

    if (secondBeginIndex >= 0 || endIndex < 0 || secondEndIndex >= 0) {
        return {
            exists: true,
            valid: false,
            source: source
        };
    }

    contentStart = beginIndex + GROUP_CONTROL_COMMENT_STATE_BEGIN.length;
    if (source.substring(contentStart, contentStart + 2) === "\r\n") {
        contentStart += 2;
    } else if (source.charAt(contentStart) === "\n" ||
            source.charAt(contentStart) === "\r") {
        contentStart += 1;
    } else {
        return {
            exists: true,
            valid: false,
            source: source
        };
    }

    content = source.substring(contentStart, endIndex);
    content = content.replace(/[\r\n]+$/, "");

    return {
        exists: true,
        valid: true,
        source: source,
        startIndex: beginIndex,
        endIndex: endIndex + GROUP_CONTROL_COMMENT_STATE_END.length,
        content: content
    };
}

function getGroupStateFromComment(group) {
    var block = getGroupCommentStateBlock(group === null || typeof group === "undefined" ?
        "" : group.comment);
    var state = null;
    var error = null;

    if (!block.exists) {
        return {
            exists: false,
            valid: true,
            state: null,
            block: block,
            error: null
        };
    }

    if (!block.valid) {
        return {
            exists: true,
            valid: false,
            state: null,
            block: block,
            error: new Error("Groupコメント内の管理情報が不正です。")
        };
    }

    try {
        state = GroupControlCore.decodeGroupState(block.content);
    } catch (decodeError) {
        error = decodeError;
    }

    return {
        exists: true,
        valid: error === null,
        state: state,
        block: block,
        error: error
    };
}

function writeGroupStateToComment(group, state) {
    var currentComment = String(group.comment || "");
    var block = getGroupCommentStateBlock(currentComment);
    var groupStateData = GroupControlCore.encodeGroupState({
        version: 1,
        groupId: state.groupId,
        records: state.records
    });
    var replacement = GROUP_CONTROL_COMMENT_STATE_BEGIN + "\n" + groupStateData + "\n" +
        GROUP_CONTROL_COMMENT_STATE_END;

    if (block.exists && !block.valid) {
        throw new Error("Groupコメント内の管理情報を読み取れません。");
    }

    if (block.exists) {
        group.comment = currentComment.substring(0, block.startIndex) + replacement +
            currentComment.substring(block.endIndex);
        return false;
    }

    if (currentComment.length > 0 && !/[\r\n]$/.test(currentComment)) {
        currentComment += "\n";
    }
    if (currentComment.length > 0 && !/[\r\n]{2}$/.test(currentComment)) {
        currentComment += "\n";
    }
    group.comment = currentComment + replacement;
    return true;
}

function removeLegacyGroupMarkers(group) {
    var marker;
    var candidates;
    var index;

    try {
        marker = getMarkerProperty(group);
        candidates = getLegacyGroupMarkerCandidates(group);
    } catch (readError) {
        return false;
    }

    if (marker === null || typeof marker === "undefined" ||
            typeof marker.removeKey !== "function") {
        return false;
    }

    for (index = candidates.length - 1; index >= 0; index -= 1) {
        try {
            marker.removeKey(candidates[index].index);
        } catch (removeError) {
            /* Legacy markers are cleanup-only after comment migration. */
        }
    }

    return true;
}

function getLegacyGroupMarkerCandidates(group) {
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

function groupStateErrorStatus(error) {
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

function validateGroupState(group, comp) {
    var candidates = getLegacyGroupMarkerCandidates(group);
    var commentState = getGroupStateFromComment(group);
    var markerComment;
    var state;
    var index;
    var record;

    if (commentState.exists) {
        if (!commentState.valid) {
            return {
                valid: false,
                status: groupStateErrorStatus(commentState.error),
                candidate: {
                    source: "comment",
                    block: commentState.block
                },
                state: null
            };
        }

        state = commentState.state;
        candidates = [];
    } else if (candidates.length > 1) {
        return {
            valid: false,
            status: STATUS_MULTIPLE_MARKERS,
            candidate: null,
            state: null
        };
    }

    if (!commentState.exists && candidates.length === 0) {
        return {
            valid: true,
            status: null,
            candidate: null,
            state: null
        };
    }

    if (!commentState.exists) {
        markerComment = candidates[0].comment;
        try {
            state = GroupControlCore.decodeGroupState(markerComment);
        } catch (error) {
            return {
                valid: false,
                status: groupStateErrorStatus(error),
                candidate: candidates[0],
                state: null
            };
        }
    }

    if (state.groupId !== getLayerId(group)) {
        return {
            valid: false,
            status: STATUS_MARKER_GROUP_MISMATCH,
            candidate: commentState.exists ? {
                source: "comment",
                block: commentState.block
            } : candidates[0],
            state: null
        };
    }

    for (index = 0; index < state.records.length; index += 1) {
        record = state.records[index];
        if (findLayerById(comp, record.layerId) === null) {
            return {
                valid: false,
                status: STATUS_MARKER_ID,
                candidate: commentState.exists ? {
                    source: "comment",
                    block: commentState.block
                } : candidates[0],
                state: null
            };
        }
    }

    return {
        valid: true,
        status: null,
        candidate: commentState.exists ? {
            source: "comment",
            block: commentState.block
        } : candidates[0],
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

function updateGroupState(group, state) {
    var created = writeGroupStateToComment(group, state);

    return {
        created: created,
        source: "comment"
    };
}

function restoreGroupCommentSnapshot(group, snapshot) {
    try {
        group.comment = snapshot === null || typeof snapshot === "undefined" ?
            "" : String(snapshot);
        return true;
    } catch (error) {
        return false;
    }
}

function buildApplyStatus(candidateCount, attachedCount, releasedCount,
        externalParentSkipped, expressionSkipped, cycleSkipped, groupStateCreated) {
    var summary = "Apply完了: 候補数=" + candidateCount + "件 / 接続=" + attachedCount +
        "件 / 解除=" + releasedCount + "件 / 外部Parentスキップ=" +
        externalParentSkipped + "件 / Expression付きRootスキップ=" +
        expressionSkipped + "件 / 循環Parentスキップ=" + cycleSkipped + "件";

    return groupStateCreated ? STATUS_GROUP_STATE_CREATED + "\n" + summary : summary;
}

function applyGroupCore(group, comp) {
    var groupStateValidation;
    var targetLayers;
    var rootLayers;
    var backups;
    var oldState;
    var commentSnapshot;
    var released;
    var releasedById;
    var oldRecordsById;
    var parentMap;
    var attachedRecords = [];
    var externalParentSkipped = 0;
    var expressionSkipped = 0;
    var cycleSkipped = 0;
    var attachedCount = 0;
    var groupStateInfo = null;
    var index;
    var layer;
    var parentId;
    var oldRecord;
    var originalParentId;
    var status;
    var rollbackParents;
    var rollbackComment;

    if (comp === null || typeof comp === "undefined") {
        return makeFailure(STATUS_NO_COMP);
    }

    if (!isGroupLayer(group)) {
        return makeFailure(STATUS_NO_GROUP);
    }

    groupStateValidation = validateGroupState(group, comp);
    if (!groupStateValidation.valid) {
        return makeFailure(groupStateValidation.status);
    }

    if (groupHasTransformKeys(group)) {
        return makeFailure(STATUS_GROUP_KEYS);
    }

    try {
        oldState = groupStateValidation.state;
        commentSnapshot = String(group.comment || "");

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

        groupStateInfo = updateGroupState(group, {
            version: 1,
            groupId: getLayerId(group),
            records: attachedRecords
        });

        status = buildApplyStatus(targetLayers.length, attachedCount, released.length,
            externalParentSkipped, expressionSkipped, cycleSkipped, groupStateInfo.created);
        removeLegacyGroupMarkers(group);
        return {
            ok: true,
            status: status,
            candidateCount: targetLayers.length,
            attachedCount: attachedCount,
            releasedCount: released.length,
            externalParentSkipped: externalParentSkipped,
            expressionSkipped: expressionSkipped,
            cycleSkipped: cycleSkipped,
            groupStateCreated: groupStateInfo.created
        };
    } catch (error) {
        rollbackParents = backups === null || typeof backups === "undefined" ? true :
            restoreParentBackups(backups);
        rollbackComment = restoreGroupCommentSnapshot(group, commentSnapshot);

        if (rollbackParents && rollbackComment) {
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
    var selectedLayerCount = 0;
    var group = null;
    var effects;
    var effect;
    var layerCountProperty;

    if (comp === null || typeof comp === "undefined") {
        return makeFailure(STATUS_NO_COMP);
    }

    /* Capture the selection before addNull() changes the active selection.
     * The selected layers become the initial Group Control range. */
    try {
        selectedLayerCount = (comp.selectedLayers || []).length;
    } catch (selectionError) {
        selectedLayerCount = 0;
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

        layerCountProperty.setValue(selectedLayerCount);
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

function removeNestedRecordFromOuterState(outerGroup, outerValidation, nestedGroupId) {
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

    writeGroupStateToComment(outerGroup, {
        version: 1,
        groupId: getLayerId(outerGroup),
        records: records
    });
}

function removeGroupOwnedEffectsFromComp(group, comp) {
    var groupId = getLayerId(group);

    if (groupId <= 0) {
        return;
    }

    GroupControlEffectSync.removeOwnedEffects(getAllCompLayers(comp), groupId);
}

function ungroupCore(group, comp) {
    var groupStateValidation;
    var state;
    var directChildren = [];
    var index;
    var layer;
    var record;
    var outerGroup;
    var outerValidation = null;
    var outerCommentSnapshot = null;
    var backups = [];
    var parentMap;
    var groupRemoved = false;
    var restoreParentsOk;
    var restoreStateOk;

    if (comp === null || typeof comp === "undefined") {
        return makeFailure(STATUS_NO_COMP);
    }

    if (!isGroupLayer(group)) {
        return makeFailure(STATUS_NO_GROUP);
    }

    groupStateValidation = validateGroupState(group, comp);
    if (!groupStateValidation.valid) {
        return makeFailure(groupStateValidation.status);
    }

    state = groupStateValidation.state;
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
        outerValidation = validateGroupState(outerGroup, comp);
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

    if (outerValidation !== null) {
        outerCommentSnapshot = String(outerGroup.comment || "");
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

        if (outerValidation !== null) {
            removeNestedRecordFromOuterState(outerGroup, outerValidation, getLayerId(group));
        }

        removeGroupOwnedEffectsFromComp(group, comp);
        group.remove();
        groupRemoved = true;
        if (outerValidation !== null) {
            removeLegacyGroupMarkers(outerGroup);
        }
        return {
            ok: true,
            status: STATUS_UNGROUP_COMPLETE,
            removedGroup: true,
            restoredCount: state === null ? 0 : state.records.length
        };
    } catch (error) {
        restoreParentsOk = groupRemoved ? false : restoreParentBackups(backups);
        restoreStateOk = true;

        if (!groupRemoved) {
            if (outerValidation !== null) {
                restoreStateOk = restoreGroupCommentSnapshot(outerGroup,
                    outerCommentSnapshot) && restoreStateOk;
            }
        }

        if (restoreParentsOk && restoreStateOk) {
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

function changeLayerCount(value) {
    var comp = getActiveComp();
    var result = beginUndoAction("Undo Change Group Count", function () {
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
        nextValue = GroupControlCore.clampLayerCount(value, comp.numLayers);
        setLayerCount(group, comp, nextValue);
        rememberGroupLayerCount(group, comp, nextValue);
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
        groupControlUI.countSlider.minvalue = 0;
        groupControlUI.countSlider.maxvalue = 1;
        groupControlUI.countSlider.value = 0;
        groupControlUI.countSlider.enabled = false;
        groupControlUI.applyButton.enabled = false;
        groupControlUI.ungroupButton.enabled = false;
        return;
    }

    selection = getSelectedGroup(comp);
    if (selection.error !== null) {
        groupControlUI.selectedGroupText.text = "None";
        groupControlUI.countText.text = "0";
        groupControlUI.countSlider.minvalue = 0;
        groupControlUI.countSlider.maxvalue = Math.max(1, comp.numLayers);
        groupControlUI.countSlider.value = 0;
        groupControlUI.countSlider.enabled = false;
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
    groupControlUI.countSlider.minvalue = 0;
    groupControlUI.countSlider.maxvalue = Math.max(1, comp.numLayers);
    groupControlUI.countSlider.value = count;
    groupControlUI.countSlider.enabled = comp.numLayers > 0;
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
    var countSlider;
    var countText;
    var statusLabel;
    var statusText;
    var createButton;
    var applyButton;
    var ungroupButton;
    var watcherOwner;

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
    countSlider = layersRow.add("slider", undefined, 0, 0, 1);
    countSlider.alignment = ["fill", "center"];
    countSlider.preferredSize = [140, 20];
    countSlider.stepdelta = 1;
    countText = layersRow.add("statictext", undefined, "0");
    countText.characters = 4;
    countText.justify = "center";
    statusLabel = panel.add("statictext", undefined, "Status Text");
    statusText = panel.add("statictext", undefined, "");
    statusText.alignment = ["fill", "top"];
    applyButton = panel.add("button", undefined, "Apply");
    ungroupButton = panel.add("button", undefined, "Ungroup");

    groupControlUI = {
        root: panel,
        selectedGroupText: selectedGroupText,
        countText: countText,
        countSlider: countSlider,
        statusText: statusText,
        applyButton: applyButton,
        ungroupButton: ungroupButton,
        createButton: createButton
    };

    createButton.onClick = function () {
        createGroup();
        refreshPanel();
    };

    countSlider.onChanging = function () {
        countText.text = String(Math.round(Number(countSlider.value)));
    };

    countSlider.onChange = function () {
        changeLayerCount(countSlider.value);
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
        /* A scheduleTask callback can be discarded by AE when a modal dialog
         * was open. Re-arm the one-shot reservation when the panel receives
         * focus again, then perform one immediate bounded tick so an Effect
         * added while the panel was inactive is picked up right away. */
        if (groupControlEffectWatcherState.active === true) {
            cancelGroupEffectWatcherTask();
            runGroupEffectWatcherOnce(null, false);
            scheduleGroupEffectWatcher();
        } else {
            watcherOwner = GroupControlEffectWatcherStart();
        }
    };

    panel.onClose = function () {
        GroupControlEffectWatcherStop(watcherOwner);
    };

    panel.onResizing = panel.onResize = function () {
        this.layout.resize();
    };

    // Docked ScriptUI panels may not perform their first automatic layout
    // after JSXBIN evaluation. Force one so the controls are not left at
    // zero-sized bounds beneath the panel header.
    if (panel.layout !== null && typeof panel.layout !== "undefined") {
        if (typeof panel.layout.layout === "function") {
            panel.layout.layout(true);
        }
        if (typeof panel.layout.resize === "function") {
            panel.layout.resize();
        }
    }

    refreshPanel();
    watcherOwner = GroupControlEffectWatcherStart();

    if (panel instanceof Window) {
        panel.center();
        panel.show();
    }

    return panel;
}

var GroupControlPanel = buildUI(this);
