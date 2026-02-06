/*
 * Map switcher for Strava website.
 *
 * Copyright © 2026 Tomáš Janoušek.
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
	if (!map.layers) map.layers = {};
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
/* Hook Strava.Maps.Map to remember last created map wrapper             */
/* --------------------------------------------------------------------- */

let lastStravaMapInstance = null;

MapSwitcher.wait(function () {
	return (Strava && Strava.Maps && Strava.Maps.Map) ? Strava.Maps.Map : null;
}).then(function (OrigMap) {
	if (OrigMap.__mapSwitcherWrapped) return;

	function WrappedMap(options) {
		const m = new OrigMap(options);
		lastStravaMapInstance = m;
		return m;
	}
	WrappedMap.prototype = OrigMap.prototype;
	WrappedMap.__mapSwitcherWrapped = true;

	Strava.Maps.Map = WrappedMap;

	console.log("MapSwitcher (activity): Strava.Maps.Map wrapped");
}, function (err) {
	console.log("MapSwitcher (activity): wait Strava.Maps.Map failed", err);
});

/* --------------------------------------------------------------------- */
/* Activity pages: bind <select> directly to Strava.Maps.Map instance    */
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

		// Wait for a Strava.Maps.Map instance
		MapSwitcher.wait(function () {
			return lastStravaMapInstance || null;
		}).then(function (mapWrapper) {
			console.log("MapSwitcher (activity): map wrapper instance found", mapWrapper);

			if (!mapWrapper || typeof mapWrapper.setLayer !== "function") {
				console.log("MapSwitcher (activity): map wrapper has no setLayer");
				return;
			}

			// Inject our layers + Pegman once
			addLayers(mapWrapper);
			if (mapWrapper.instance) addPegman(mapWrapper.instance);
			console.log("MapSwitcher (activity): map.layers keys", Object.keys(mapWrapper.layers || {}));

			// Append custom layers as options
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

			// Bind select → mapWrapper.setLayer
			mapTypeSelect.on('change.mapswitcher', function () {
				const val = jQuery(this).val();
				const layerId = valueToLayer[val] || val;
				if (!layerId) return;

				console.log("MapSwitcher (activity): setLayer via select", layerId);
				localStorage.stravaMapSwitcherPreferred = layerId;
				mapWrapper.setLayer(layerId);
			});

			// Restore preferred map
			const preferred = localStorage.stravaMapSwitcherPreferred;
			if (preferred) {
				const selectValue = layerToValue[preferred] || preferred;
				if (mapTypeSelect.find(`option[value="${selectValue}"]`).length) {
					console.log("MapSwitcher (activity): selecting preferred", preferred, "as", selectValue);
					mapTypeSelect.val(selectValue).trigger('change');
				}
			}
		}, function (err) {
			console.log("MapSwitcher (activity): wait map wrapper failed", err);
		});
	}, function (err) {
		console.log("MapSwitcher (activity): wait select failed", err);
	});
})();
