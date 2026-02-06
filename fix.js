/*
 * Map switcher for Strava website.
 *
 * Copyright © 2016 Tomáš Janoušek.
 * MIT License.
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

	/* --------------------------------------------------------------------- */
	/* Activity pages: new <select data-testid="mre-map-style-select"> UI    */
	/* --------------------------------------------------------------------- */

	MapSwitcher.wait(function () {
		const q = jQuery('select[data-testid="mre-map-style-select"]', leafletContainer);
		return q.length ? q : null;
	}).then(function (mapTypeSelect) {
		mapTypeSelect = jQuery(mapTypeSelect);

		// augment layerNames already done above

		// Override changeMapType once, wrapping the original
		if (Strava && Strava.Maps && Strava.Maps.Mapbox && Strava.Maps.Mapbox.CustomControlView) {
			const proto = Strava.Maps.Mapbox.CustomControlView.prototype;
			if (!proto.__mapSwitcherPatched) {
				proto.__mapSwitcherPatched = true;
				const origChangeMapType = proto.changeMapType;

				var once = true;
				proto.changeMapType = function (selectedMapTypeId) {
					var map = this.map();

					if (once) {
						once = false;
						addLayers(map);
						if (map.instance) {
							addPegman(map.instance);
						}
					}

					// Let Strava's original implementation handle mapping and setLayer
					const result = origChangeMapType.call(this, selectedMapTypeId);

					// Try to store a readable preference if possible
					try {
						const t = this.mapTypeIdMap(selectedMapTypeId);
						if (t) {
							localStorage.stravaMapSwitcherPreferred = t;
						}
					} catch (e) {
						// ignore
					}

					return result;
				};
			}
		}

		// Extend select with additional map layers as options
		Object.entries(AdditionalMapLayers).forEach(([type, l]) => {
			mapTypeSelect.append(
				jQuery('<option>')
					.val(type)          // our custom id
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

		// Map built-in numeric values to type ids for preference
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

		// Handle change: for built-in values, let Strava do everything
		// For custom values, just remember preference and rely on our extra layers
		mapTypeSelect.on('change', function () {
			const val = jQuery(this).val();
			const layerId = valueToLayer[val] || val;
			if (!layerId) return;

			localStorage.stravaMapSwitcherPreferred = layerId;
			// IMPORTANT: we do NOT call changeMapType ourselves here,
			// Strava has already called it in response to this change
			// for built-in values. For custom ones, map.setLayer(layerId)
			// will work because we added them to map.layers in addLayers().
		});

		// Apply stored preferred map if any, but only if it matches an existing <option>
		const preferred = localStorage.stravaMapSwitcherPreferred;
		if (preferred) {
			const selectValue = layerToValue[preferred] || preferred;
			if (mapTypeSelect.find(`option[value="${selectValue}"]`).length) {
				mapTypeSelect.val(selectValue).trigger('change');
			}
		}
	}, function () {
		// ignore timeout
	});

	/* --------------------------------------------------------------------- */
	/* Segment Explorer (unchanged)                                          */
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
