/*
 * Map switcher for Strava website.
 *
 * Copyright © 2016 Tomáš Janoušek.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

document.arrive(".leaflet-container", {onceOnly: false, existing: true, fireOnAttributesModification: true}, function () {
	const leafletContainer = this;

	if (leafletContainer.mapSwitcherDone) return;
	leafletContainer.mapSwitcherDone = true;

	function tileLayer(l) {
		var r = L.tileLayer(l.url, l.opts);
		if (l.overlay) {
			var o = L.tileLayer(l.overlay.url, l.overlay.opts);
			r = L.layerGroup([r, o]);
		}
		return r;
	}

	function addLayers(map) {
		Object.entries(AdditionalMapLayers).forEach(([type, l]) => map.layers[type] = tileLayer(l));
		if (typeof L.gridLayer.googleMutant !== "undefined") {
			map.layers.googlesatellite = L.gridLayer.googleMutant({type: 'satellite'});
			map.layers.googleroadmap = L.gridLayer.googleMutant({type: 'roadmap'});
			map.layers.googlehybrid = L.gridLayer.googleMutant({type: 'hybrid'});
			map.layers.googleterrain = L.gridLayer.googleMutant({type: 'terrain'});
		}
	}

	function addPegman(map) {
		if (typeof L.Control.Pegman !== "undefined") {
			const pegmanControl = new L.Control.Pegman({position: 'bottomright', theme: 'leaflet-pegman-v3-default'});
			pegmanControl.addTo(map);
		}
	}

	var layerNames =
		{standard: Strava.I18n.Locale.t("strava.maps.google.custom_control.standard")
		,satellite: Strava.I18n.Locale.t("strava.maps.google.custom_control.satellite")
		,googlesatellite: "Google Satellite"
		,googleroadmap: "Google Road Map"
		,googlehybrid: "Google Hybrid"
		,googleterrain: "Google Terrain"
		};
	Object.entries(AdditionalMapLayers).forEach(([type, l]) => layerNames[type] = l.name);

MapSwitcher.wait(function () {
    // Look for the new <select> control inside this leaflet container
    const q = jQuery('select[data-testid="mre-map-style-select"]', leafletContainer);
    return q.length ? q : null;
}).then(function (mapTypeSelect) {
    mapTypeSelect = jQuery(mapTypeSelect); // ensure it's a jQuery object

    // Map Strava's built-in option values to the original type IDs
    const valueToLayer = {
        "0": "standard",
        "5": "satellite",
        "4": "googlehybrid", // or "satellite", depending on how you want to treat Hybrid
    };

    const layerToValue = {
        "standard": "0",
        "satellite": "5",
        "googlehybrid": "4",
    };

    // Keep the old Mapbox changeMapType override so we still inject layers once
    var once = true;
    Strava.Maps.Mapbox.CustomControlView.prototype.changeMapType = function (t) {
        var map = this.map();

        if (once) {
            once = false;

            addLayers(map);
            addPegman(map.instance);

            // in case Strava still uses delegated events
            this.delegateEvents && this.delegateEvents();
        }

        localStorage.stravaMapSwitcherPreferred = t;
        return map.setLayer(t);
    };

    // OPTIONAL: extend the select with additional map layers
    Object.entries(AdditionalMapLayers).forEach(([type, l]) => {
        mapTypeSelect.append(
            jQuery('<option>')
                .val(type)          // use layer ID as value for custom options
                .text(l.name)
        );
    });

    // And explicit Google modes, if desired
    ["googlesatellite", "googleroadmap", "googlehybrid", "googleterrain"].forEach(type => {
        mapTypeSelect.append(
            jQuery('<option>')
                .val(type)
                .text(layerNames[type])
        );
    });

    function applyMapTypeFromSelectValue(val) {
        // built-in numeric values are mapped, custom ones use themselves
        const layerId = valueToLayer[val] || val;
        if (!layerId) return;

        // Call into Strava's control view, if present, or directly use the map wrapper
        // Simplest: directly let Strava map wrapper handle the type ID via setLayer(t),
        // which we wired above via changeMapType.
        // We can mimic a "changeMapType" call by finding the current control view instance.
        //
        // However, if we don't know how to access that instance, we can rely on the fact
        // that Strava's own code is already wired to this <select>. So:
        //
        // 1. Set a data attribute so Strava sees a known numeric option (for standard/satellite/hybrid).
        // 2. For custom IDs, we go directly to the map via map.setLayer(layerId).
        //
        // For a first step, we keep it simple and handle all via localStorage + map.setLayer:
        localStorage.stravaMapSwitcherPreferred = layerId;

        // If we can get at the map wrapper via global Strava state:
        if (Strava && Strava.Map && typeof Strava.Map.setLayer === "function") {
            Strava.Map.setLayer(layerId);
        }
        // Otherwise, this consistently sets the preference, and the overridden
        // changeMapType above will be invoked when Strava itself changes the map type.
    }

    // Listen to select change
    mapTypeSelect.on('change', function () {
        const val = jQuery(this).val();
        applyMapTypeFromSelectValue(val);
    });

    // Apply stored preferred map, if any
    const preferred = localStorage.stravaMapSwitcherPreferred;
    if (preferred) {
        const selectValue = layerToValue[preferred] || preferred;
        mapTypeSelect.val(selectValue).trigger('change');
    }
});

	MapSwitcher.wait(function () {
		const q = jQuery('#segment-map-filters form');
		return q.length ? q : null;
	}).then(function (explorerMapFilters) {
		var once = false;
		function explorerFound(e) {
			if (once)
				return;
			once = true;

			addLayers(e.map);
			addPegman(e.map.instance);

			function setMapType(t) {
				localStorage.stravaMapSwitcherPreferred = t;
				e.map.setLayer(t);
			}

			var nav = jQuery('#segment-map-filters');
			nav.css({height: 'auto'});
			var clr = jQuery('<div>');
			clr.css({clear: 'both', "margin-bottom": '1em'});
			nav.append(clr);
			function addButton(name, type) {
				var b = jQuery("<div class='button btn-xs'>").text(name);
				b.click(() => { setMapType(type); });
				clr.append(b);
			}
			addButton("Standard", "standard");
			addButton("Satellite", "satellite");
			Object.entries(AdditionalMapLayers).forEach(([type, l]) => addButton(l.name, type));
			addButton("Google Satellite", "googlesatellite");
			addButton("Google Road Map", "googleroadmap");
			addButton("Google Hybrid", "googlehybrid");
			addButton("Google Terrain", "googleterrain");

			if (MapSwitcherDonation)
				clr.append(jQuery("<div class='button btn-xs'>").append(MapSwitcherDonation));

			var preferredMap = localStorage.stravaMapSwitcherPreferred;
			if (preferredMap) {
				setTimeout(() => { setMapType(preferredMap); });
			}
		}

		var old_navigate = Strava.Explorer.Navigation.prototype.navigate;
		Strava.Explorer.Navigation.prototype.navigate = function(){
			old_navigate.call(this);
			explorerFound(this.explorer);
			Strava.Explorer.Navigation.prototype.navigate = old_navigate;
		};
		explorerMapFilters.trigger('submit');
	});
});
