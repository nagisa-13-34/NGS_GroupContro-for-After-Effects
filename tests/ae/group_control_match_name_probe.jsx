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

        try {
            effect = effects.addProperty("NGS_GroupControl");
        } catch (matchNameError) {
            addEffectError = clean(matchNameError);
            try {
                effect = effects.addProperty("Group Control");
            } catch (displayNameError) {
                addEffectError += " | display name: " + clean(displayNameError);
            }
        }

        if (effect === null) {
            record("status", "effect_not_added");
            record("add_effect_error", addEffectError);
        } else {
            record("status", "ok");
            record("effect_name", effect.name);
            record("effect_match_name", effect.matchName);
            record("effect_property_count", effect.numProperties);
            for (var index = 1; index <= effect.numProperties; index += 1) {
                var property = effect.property(index);
                record("property_" + index + "_name", property.name);
                record("property_" + index + "_match_name", property.matchName);
                record("property_" + index + "_index", property.propertyIndex);
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
