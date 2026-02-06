/*
 * Map switcher for Strava website.
 *
 * Copyright © 2026.01 Tomáš Janoušek.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

console.log("MapSwitcher fix.js loaded", location.href);

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

	/* --------------------------------------------------------------------- */
	/* Activity pages: NEW <select data-testid="mre-map-style-select"> UI    */
	/* --------------------------------------------------------------------- */

	MapSwitcher.wait(function () {
		// The activity map select is not necessarily inside leafletContainer,
		// so try scoped and then global.
		const scoped = jQuery('select[data-testid="mre-map-style-select"]', leafletContainer);
		if (scoped.length) return scoped;
		const global = jQuery('select[data-testid="mre-map-style-select"]');
		return global.length ? global : null;
	}).then(function (mapTypeSelect) {
		console.log("MapSwitcher: activity select found", mapTypeSelect);
		mapTypeSelect = jQuery(mapTypeSelect);

		// Map Strava's built-in numeric values to our type IDs
		const valueToLayer = {
			"0": "standard",
			"5": "satellite",
			"4": "googlehybrid", // you can change this if you want Hybrid to map differently
		};
		const layerToValue = {
			"standard": "0",
			"satellite": "5",
			"googlehybrid": "4",
		};

		// Wrap CustomControlView.changeMapType once to inject layers & Pegman
		if (Strava && Strava.Maps && Strava.Maps.Mapbox && Strava.Maps.Mapbox.CustomControlView) {
			const proto = Strava.Maps.Mapbox.CustomControlView.prototype;
			if (!proto.__mapSwitcherPatched) {
				proto.__mapSwitcherPatched = true;
				const origChangeMapType = proto.changeMapType;

				var once = true;
				proto.changeMapType = function (selectedMapTypeId) {
					const map = this.map();

					if (once) {
						once = false;
						console.log("MapSwitcher: first changeMapType, injecting layers/Pegman");
						addLayers(map);
						if (map.instance) {
							addPegman(map.instance);
						}
					}

					// Built-in numeric ids -> let Strava handle via mapTypeIdMap
					if (selectedMapTypeId === "0" || selectedMapTypeId === "5" || selectedMapTypeId === "4") {
						const result = origChangeMapType.call(this, selectedMapTypeId);
						try {
							const t = this.mapTypeIdMap(selectedMapTypeId);
							if (t) localStorage.stravaMapSwitcherPreferred = t;
						} catch (e) {}
						return result;
					}

					// Custom ids (our extra layers) -> call setLayer(id) directly
					if (map && typeof map.setLayer === "function") {
						console.log("MapSwitcher: custom map type via setLayer", selectedMapTypeId);
						localStorage.stravaMapSwitcherPreferred = selectedMapTypeId;
						return map.setLayer(selectedMapTypeId);
					}

					// Fallback
					return origChangeMapType.call(this, selectedMapTypeId);
				};
			}
		}

		// Append our extra layers as options
		Object.entries(AdditionalMapLayers).forEach(([type, l]) => {
			mapTypeSelect.append(
				jQuery('<option>')
					.val(type)
					.text(l.name)
			);
		});

		["googlesatellite", "googleroadmap", "googlehybrid", "googleterrain"].forEach(type => {
			mapTypeSelect.append(
				jQuery('<option>')
					.val(type)
					.text(layerNames[type])
			);
		});

		console.log("MapSwitcher: activity options after append:", mapTypeSelect.html());

		// Remember preference on change (for all values)
		mapTypeSelect.on('change', function () {
			const val = jQuery(this).val();
			const layerId = valueToLayer[val] || val;
			if (!layerId) return;
			localStorage.stravaMapSwitcherPreferred = layerId;
		});

		// Restore preference if there is a matching option
		const preferred = localStorage.stravaMapSwitcherPreferred;
		if (preferred) {
			const selectValue = layerToValue[preferred] || preferred;
			if (mapTypeSelect.find(`option[value="${selectValue}"]`).length) {
				console.log("MapSwitcher: selecting preferred map", preferred, "as", selectValue);
				mapTypeSelect.val(selectValue).trigger('change');
			}
		}
	}, function (err) {
		console.log("MapSwitcher: activity wait() failed", err);
	});

	/* --------------------------------------------------------------------- */
	/* Segment Explorer (original working code, unchanged)                   */
	/* --------------------------------------------------------------------- */

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
