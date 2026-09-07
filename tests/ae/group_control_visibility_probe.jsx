/* Read-only snapshot of the active composition. Does not load or stop the panel,
 * run synchronization, modify layers, or save the project. */
(function () {
    var root = new File($.fileName).parent.parent.parent;
    var output = new File(root.fsName + "/build/validation/group-control-visibility.txt");
    var lines = [];
    function clean(value) { return String(value).replace(/[\r\n]/g, " "); }
    function read(object, key) {
        try { return clean(object[key]); } catch (error) { return "<error: " + clean(error) + ">"; }
    }
    function record(label, value) { lines.push(label + "=" + clean(value)); }
    function walk(group, path, depth) {
        if (!group || depth > 12) { return; }
        for (var propertyIndex = 1; propertyIndex <= group.numProperties; propertyIndex += 1) {
            var property = group.property(propertyIndex);
            var key = path + "(" + propertyIndex + ")";
            record(key, read(property, "name") + " | " + read(property, "matchName"));
            if (property.numProperties > 0) {
                walk(property, key, depth + 1);
            } else {
                var valueType = property.propertyValueType;
                if (valueType !== PropertyValueType.NO_VALUE && valueType !== PropertyValueType.CUSTOM_VALUE) {
                    record(key + ".value", read(property, "value"));
                }
                if (property.canSetExpression) {
                    record(key + ".expressionEnabled", read(property, "expressionEnabled"));
                    record(key + ".expression", read(property, "expression"));
                    record(key + ".expressionError", read(property, "expressionError"));
                }
            }
        }
    }
    record("capturedAt", new Date().toString());
    record("aeVersion", app.version);
    try {
        var comp = app.project ? app.project.activeItem : null;
        if (!(comp instanceof CompItem)) { throw new Error("Open the affected composition first."); }
        record("comp", comp.name);
        record("time", comp.time);
        record("numLayers", comp.numLayers);
        for (var layerIndex = 1; layerIndex <= comp.numLayers; layerIndex += 1) {
            var layer = comp.layer(layerIndex);
            var prefix = "layer[" + layerIndex + "]";
            record(prefix, layer.name);
            var fields = ["id", "enabled", "solo", "nullLayer", "inPoint", "outPoint", "startTime", "hasVideo", "trackMatteType"];
            for (var fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
                record(prefix + "." + fields[fieldIndex], read(layer, fields[fieldIndex]));
            }
            record(prefix + ".parent", layer.parent ? layer.parent.index : "none");
            walk(layer.property("ADBE Transform Group"), prefix + ".transform", 0);
            walk(layer.property("ADBE Text Properties"), prefix + ".text", 0);
            var effects = layer.property("ADBE Effect Parade");
            for (var effectIndex = 1; effects && effectIndex <= effects.numProperties; effectIndex += 1) {
                var effect = effects.property(effectIndex);
                record(prefix + ".effect[" + effectIndex + "]", effect.name + " | " + effect.matchName + " | enabled=" + effect.enabled);
                walk(effect, prefix + ".effect[" + effectIndex + "]", 0);
            }
        }
        record("status", "complete");
    } catch (error) { record("status", "error: " + error.toString()); }
    output.parent.create();
    output.encoding = "UTF-8";
    if (!output.open("w")) { throw new Error("Cannot write diagnostic: " + output.error); }
    output.write(lines.join("\n"));
    output.close();
})();
