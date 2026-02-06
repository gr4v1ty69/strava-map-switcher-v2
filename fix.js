/*
 * Map switcher for Strava website.
 *
 * Copyright © 2026.01 Tomáš Janoušek.
 * MIT License.
 */

console.log("MapSwitcher fix.js loaded", location.href);

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
/* Hook CustomControlView to remember last instance                      */
/* --------------------------------------------------------------------- */

(function hookCustomControlView() {
	if (!Strava || !Strava.Maps || !Strava.Maps.Mapbox || !Strava.Maps.Mapbox.CustomControlView) return;

	const Orig = Strava.Maps.Mapbox.CustomControlView;
	if (Orig.__mapSwitcherWrapped) return; // only once

	let lastInstance = null;

	function WrappedCustomControlView() {
		const inst = new Orig(...arguments);
		lastInstance = inst;
		return inst;
	}
	WrappedCustomControlView.prototype = Orig.prototype;
	WrappedCustomControlView.__mapSwitcherWrapped = true;

	Strava.Maps.Mapbox.CustomControlView = WrappedCustomControlView;

	// expose helper
	Strava.Maps.Mapbox.getLastCustomControlView = function () {
		return lastInstance;
	};
})();

/* --------------------------------------------------------------------- */
/* Activity pages: tie the <select> to the map via CustomControlView     */
/* --------------------------------------------------------------------- */

(function () {
	if (!/^\/activities\/\d+/.test(location.pathname)) return;

	MapSwitcher.wait(function () {
		const sel = jQuery('select[data-testid="mre-map-style-select"]');
		return sel.length ? sel : null;
	}).then(function (mapTypeSelect) {
		console.log("MapSwitcher (activity): select found", mapTypeSelect);
		mapTypeSelect = jQuery(mapTypeSelect);

		const valueToLayer = {
			"0": "standard",
			"5": "satellite",
			"4": "googlehybrid",
		};
		const layerToValue = {
			"standard": "0",
			"satellite": "5",
			"googlehybrid": "4",
		};

		// Wait for a CustomControlView instance so we can get map()
		MapSwitcher.wait(function () {
			const getter = Strava?.Maps?.Mapbox?.getLastCustomControlView;
			const inst = typeof getter === "function" ? getter() : null;
			return inst || null;
		}).then(function (controlView) {
			console.log("MapSwitcher (activity): CustomControlView instance found", controlView);
			const map = controlView.map && controlView.map();
			if (!map || typeof map.setLayer !== "function") {
				console.log("MapSwitcher (activity): map wrapper missing or no setLayer");
				return;
			}
			console.log("MapSwitcher (activity): map wrapper", map);

			// inject our layers + Pegman once
			addLayers(map);
			if (map.instance) addPegman(map.instance);
			console.log("MapSwitcher (activity): map.layers keys", Object.keys(map.layers || {}));

			// append custom layer options
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
			console.log("MapSwitcher (activity): options after append", mapTypeSelect.html());

			// bind select → map.setLayer
			mapTypeSelect.on('change.mapswitcher', function () {
				const val = jQuery(this).val();
				const layerId = valueToLayer[val] || val;
				if (!layerId) return;

				console.log("MapSwitcher (activity): setLayer via select", layerId);
				localStorage.stravaMapSwitcherPreferred = layerId;
				map.setLayer(layerId);
			});

			// restore preference
			const preferred = localStorage.stravaMapSwitcherPreferred;
			if (preferred) {
				const selectValue = layerToValue[preferred] || preferred;
				if (mapTypeSelect.find(`option[value="${selectValue}"]`).length) {
					console.log("MapSwitcher (activity): selecting preferred", preferred, "as", selectValue);
					mapTypeSelect.val(selectValue).trigger('change');
				}
			}
		}, function (err) {
			console.log("MapSwitcher (activity): wait CustomControlView failed", err);
		});
	}, function (err) {
		console.log("MapSwitcher (activity): wait select failed", err);
	});
})();
