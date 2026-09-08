/*
 * Run this file from After Effects to inspect the native effect and its
 * parameter match names. The temporary comp is removed before the script
 * exits, and the result is written beside this script's repository.
 */
(function () {
    var scriptFile = new File($.fileName);
    var repositoryRoot = scriptFile.parent.parent.parent;
    var resultFile = new File(repositoryRoot.fsName + "/build/validation/group-control-match-name.txt");
    var comp = null;
    var undoStarted = false;
    var lines = [];

    function clean(value) {
        return String(value).replace(/[\r\n]/g, " ");
    }

    function record(key, value) {
        lines.push(key + "=" + clean(value));
    }

    try {
        if (!app.project) {
            app.newProject();
        }

        app.beginUndoGroup("NGS Group Control matchName probe");
        undoStarted = true;
        comp = app.project.items.addComp("__NGS_GroupControl_MatchName_Probe", 320, 180, 1, 1, 30);
        var layer = comp.layers.addSolid([1, 1, 1], "Probe", 320, 180, 1);
        var effects = layer.property("ADBE Effect Parade");
        var effect = null;
        var addEffectError = "";
        var expectedEffectMatchName = "NGS_GroupControl";
        var expectedLayerCountMatchName = "NGS_GroupControl-0001";

        try {
            effect = effects.addProperty(expectedEffectMatchName);
        } catch (matchNameError) {
            addEffectError = clean(matchNameError);
        }

        if (effect === null || effect.matchName !== expectedEffectMatchName) {
            record("status", "fail");
            record("add_effect_error", addEffectError);
        } else {
            record("effect_name", effect.name);
            record("effect_match_name", effect.matchName);
            record("effect_property_count", effect.numProperties);
            var defaultValue = null;
            var changedValue = null;
            for (var index = 1; index <= effect.numProperties; index += 1) {
                var property = effect.property(index);
                record("property_" + index + "_name", property.name);
                record("property_" + index + "_match_name", property.matchName);
                record("property_" + index + "_index", property.propertyIndex);
                if (property.name === "Layer Count") {
                    defaultValue = property.value;
                    property.setValue(7);
                    changedValue = property.value;
                    property.setValue(defaultValue);
                }
            }
            if (defaultValue === 0 && changedValue === 7 &&
                    effect.numProperties >= 1 &&
                    effect.property(1).matchName === expectedLayerCountMatchName) {
                record("status", "ok");
            } else {
                record("status", "fail");
                record("expected_layer_count_match_name", expectedLayerCountMatchName);
            }
        }
    } catch (error) {
        record("status", "script_error");
        record("error", error);
    }

    try {
        if (comp !== null) {
            comp.remove();
        }
    } catch (cleanupError) {
        record("cleanup_error", cleanupError);
    }

    if (undoStarted) {
        app.endUndoGroup();
    }

    var resultDirectory = resultFile.parent;
    if (!resultDirectory.exists) {
        resultDirectory.create();
    }
    if (resultFile.open("w")) {
        resultFile.encoding = "UTF-8";
        resultFile.write(lines.join("\n"));
        resultFile.close();
    }
}());
