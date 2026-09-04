/* Run with File > Scripts > Run Script File in AE. No project is saved.
 * Tests the real Effect adapter in a temporary shape-only composition.
 * Does not start the Panel watcher or require the native Group Control effect.
 */
(function () {
    #include "../../panel/GroupControlEffectSync.jsxinc"

    var repository = new File($.fileName).parent.parent.parent;
    var directory = new Folder(repository.fsName + "/build/validation");
    var resultFile = new File(directory.fsName + "/group-control-effect-sync.txt");
    var comp = null;
    var undoStarted = false;
    var lines = [];

    function record(key, value) {
        lines.push(key + "=" + String(value).replace(/[\r\n]/g, " "));
    }

    function requireTrue(condition, message) {
        if (!condition) {
            throw new Error(message);
        }
        record("pass", message);
    }

    function effects(layer) {
        return layer.property("ADBE Effect Parade");
    }

    function owned(layer, groupId) {
        var found = [];
        var parade = effects(layer);
        var index;
        var item;
        var info;
        for (index = 1; index <= parade.numProperties; index += 1) {
            item = parade.property(index);
            info = GroupControlEffectSync.parseReservedEffectName(item.name);
            if (info !== null && info.groupId === groupId) {
                found.push(item.name);
            }
        }
        return found;
    }

    try {
        if (!app.project) {
            throw new Error("Open a project before running the probe.");
        }
        app.beginUndoGroup("NGS Group Control Effect sync probe");
        undoStarted = true;
        comp = app.project.items.addComp("__NGS_GFX_Probe_" + new Date().getTime(),
            320, 180, 1, 2, 30);
        var outside = comp.layers.addShape();
        var child = comp.layers.addShape();
        var root = comp.layers.addShape();
        var group = comp.layers.addShape();
        group.name = "__NGS_GFX_Source";
        root.name = "Root";
        child.name = "Child";
        outside.name = "Outside";
        child.parent = root;
        effects(root).addProperty("ADBE Slider Control").name = "Child Local";
        effects(group).addProperty("ADBE Slider Control").name = "Source Slider";
        effects(group).addProperty("ADBE Color Control").name = "Source Color";
        // Always reacquire after addProperty: AE invalidates older references.
        effects(group).property("Source Slider").property(1).setValue(37);
        var sliderName = GroupControlEffectSync.makeReservedEffectName(group.id, 1, "Source Slider");
        var targets = [root, child];

        GroupControlEffectSync.syncGroupEffects(group, targets);
        requireTrue(owned(root, group.id).length === 2, "two owned copies survive indexed-group changes");
        requireTrue(owned(child, group.id).length === 2, "internal child receives both effects");
        requireTrue(owned(outside, group.id).length === 0, "outside layer receives no copies");
        requireTrue(effects(root).property("Child Local") !== null, "child-local effect is preserved");
        var targetSlider = effects(root).property(sliderName).property(1);
        requireTrue(targetSlider.expressionEnabled && targetSlider.expressionError === "",
            "real AE expression compiles");
        requireTrue(Math.abs(targetSlider.valueAtTime(0, false) - 37) < 0.001,
            "expression evaluates the source value");
        var sourceSlider = effects(group).property("Source Slider").property(1);
        sourceSlider.setValueAtTime(0, 11);
        sourceSlider.setValueAtTime(1, 55);
        requireTrue(Math.abs(targetSlider.valueAtTime(1, false) - 55) < 0.001,
            "source keys are followed without another sync");

        effects(group).property("Source Color").remove();
        GroupControlEffectSync.syncGroupEffects(group, targets);
        requireTrue(owned(root, group.id).length === 1 && owned(child, group.id).length === 1,
            "source deletion removes only its copies");
        effects(root).property(sliderName).remove();
        GroupControlEffectSync.syncGroupEffects(group, targets);
        requireTrue(owned(root, group.id).length === 1, "manually deleted copy is restored");
        GroupControlEffectSync.removeOwnedEffects([root, child, outside], group.id);
        requireTrue(owned(root, group.id).length === 0 && owned(child, group.id).length === 0,
            "owned-copy cleanup completes");
        requireTrue(effects(root).property("Child Local") !== null && child.parent === root,
            "local effect and parent survive cleanup");
        record("ae_version", app.version);
        record("status", "ok");
    } catch (error) {
        record("status", "fail");
        record("error", error);
    } finally {
        if (comp !== null) {
            try {
                comp.remove();
            } catch (cleanupError) {
                record("status", "cleanup_failed");
                record("cleanup_error", cleanupError);
            }
        }
        if (undoStarted) {
            app.endUndoGroup();
        }
    }

    if (!directory.parent.exists) {
        directory.parent.create();
    }
    if (!directory.exists) {
        directory.create();
    }
    resultFile.encoding = "UTF-8";
    if (resultFile.open("w")) {
        resultFile.write(lines.join("\n"));
        resultFile.close();
    } else {
        $.writeln(lines.join("\n"));
        $.writeln("Could not write " + resultFile.fsName);
    }
}());
