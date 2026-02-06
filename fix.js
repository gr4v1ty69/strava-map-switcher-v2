/*
 * Map switcher for Strava website.
 *
 * Copyright © 2016 Tomáš Janoušek.
 * MIT License.
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
	/* 1) OLD UI path: #map-type-control .options (Routes / legacy)          */
	/* --------------------------------------------------------------------- */

	MapSwitcher.wait(function () {
		const q = jQuery('#map-type-control .options', leafletContainer);
		return q.length ? q : null;
	}).then(function (activityOpts) {
		console.log("MapSwitcher: legacy map-type-control options found", activityOpts);

		Strava.Maps.CustomControlView.prototype.handleMapTypeSelector = function (t) {
			const type = this.$$(t.target).data("map-type-id");
			const selected = this.$("#selected-map");
			selected.data("map-type-id", type);
			selected.text(layerNames[type]);
			return this.changeMapType(type);
		};

		var once = true;
		Strava.Maps.Mapbox.CustomControlView.prototype.changeMapType = function(t){
			var map = this.map();

			if (once) {
				once = false;

				addLayers(map);
				addPegman(map.instance);

				// needed for the right handleMapTypeSelector to be called
				this.delegateEvents && this.delegateEvents();
			}

			localStorage.stravaMapSwitcherPreferred = t;
			return map.setLayer(t);
		};

		function button(t) {
			return jQuery('<li>')
				.append(jQuery('<a class="map-type-selector">')
					.data("map-type-id", t)
					.text(layerNames[t]));
		}

		activityOpts.css({"max-height": "250px", "right": 0});
		activityOpts.prepend(button("standard"));

		if (MapSwitcherDonation)
			activityOpts.append(jQuery('<li>').append(MapSwitcherDonation));

		Object.keys(AdditionalMapLayers).forEach(t => activityOpts.append(button(t)));
		["googlesatellite", "googleroadmap", "googlehybrid", "googleterrain"].forEach(t => activityOpts.append(button(t)));

		var preferredMap = localStorage.stravaMapSwitcherPreferred;

		// make sure delegateEvents is run at least once
		activityOpts.find(':first a').click();
		activityOpts.removeClass("open-menu");
		activityOpts.parent().removeClass("active");

		// select preferred map type
		if (preferredMap) {
			var mapLinks = activityOpts.find('a.map-type-selector');
			mapLinks.filter((_, e) => jQuery(e).data("map-type-id") === preferredMap).click();
			activityOpts.removeClass("open-menu");
			activityOpts.parent().removeClass("active");
		}
	}, function () {
		// No legacy menu in this container; ignore
	});

	/* --------------------------------------------------------------------- */
	/* 2) NEW UI path: <select data-testid="mre-map-style-select">           */
	/* --------------------------------------------------------------------- */

	MapSwitcher.wait(function () {
		const scoped = jQuery('select[data-testid="mre-map-style-select"]', leafletContainer);
		if (scoped.length) return scoped;
		const global = jQuery('select[data-testid="mre-map-style-select"]');
		return global.length ? global : null;
	}).then(function (mapTypeSelect) {
		console.log("MapSwitcher: activity select found (new UI)", mapTypeSelect);
		mapTypeSelect = jQuery(mapTypeSelect);

		// Map Strava's numeric values to our layer IDs
		const valueToLayer = {
			"0": "standard",
			"5": "satellite",
			"4": "googlehybrid", // adjust if you want another mapping
		};
		const layerToValue = {
			"standard": "0",
			"satellite": "5",
			"googlehybrid": "4",
		};

		// Patch changeMapType once to inject layers & Pegman and support custom ids
		if (Strava && Strava.Maps && Strava.Maps.Mapbox && Strava.Maps.Mapbox.CustomControlView) {
			const proto = Strava.Maps.Mapbox.CustomControlView.prototype;
			if (!proto.__mapSwitcherPatchedNewUI) {
				proto.__mapSwitcherPatchedNewUI = true;
				const origChangeMapType = proto.changeMapType;

				var once = true;
				proto.changeMapType = function (selectedMapTypeId) {
					const map = this.map();

					if (once) {
						once = false;
						console.log("MapSwitcher: first changeMapType (new UI), injecting layers/Pegman");
						addLayers(map);
						if (map.instance) {
							addPegman(map.instance);
						}
					}

					// Built-in Strava values: "0", "5", "4"
					if (selectedMapTypeId === "0" || selectedMapTypeId === "5" || selectedMapTypeId === "4") {
						const result = origChangeMapType.call(this, selectedMapTypeId);
						try {
							const t = this.mapTypeIdMap(selectedMapTypeId);
							if (t) localStorage.stravaMapSwitcherPreferred = t;
						} catch (e) {}
						return result;
					}

					// Custom IDs: directly use setLayer(id)
					if (map && typeof map.setLayer === "function") {
						console.log("MapSwitcher: custom map type via setLayer", selectedMapTypeId);
						localStorage.stravaMapSwitcherPreferred = selectedMapTypeId;
						return map.setLayer(selectedMapTypeId);
					}

					return origChangeMapType.call(this, selectedMapTypeId);
				};
			}
		}

		// Append AdditionalMapLayers as <option>
		Object.entries(AdditionalMapLayers).forEach(([type, l]) => {
			mapTypeSelect.append(
				jQuery('<option>')
					.val(type)
					.text(l.name)
			);
		});

		// Append Google variants
		["googlesatellite", "googleroadmap", "googlehybrid", "googleterrain"].forEach(type => {
			mapTypeSelect.append(
				jQuery('<option>')
					.val(type)
					.text(layerNames[type])
			);
		});

		console.log("MapSwitcher: activity options after append (new UI):", mapTypeSelect.html());

		// Remember preference and (for custom ids) rely on our changeMapType wrapper
		mapTypeSelect.on('change', function () {
			const val = jQuery(this).val();
			const layerId = valueToLayer[val] || val;
			if (!layerId) return;
			localStorage.stravaMapSwitcherPreferred = layerId;
			// For custom ids we rely on our patched changeMapType using setLayer(layerId)
			// Strava's own handler should already call changeMapType(val) when the select changes.
		});

		// Apply stored preferred map
		const preferred = localStorage.stravaMapSwitcherPreferred;
		if (preferred) {
			const selectValue = layerToValue[preferred] || preferred;
			if (mapTypeSelect.find(`option[value="${selectValue}"]`).length) {
				console.log("MapSwitcher: selecting preferred map (new UI)", preferred, "as", selectValue);
				mapTypeSelect.val(selectValue).trigger('change');
			}
		}
	}, function () {
		// No new select in this container; ignore
	});

	/* --------------------------------------------------------------------- */
	/* 3) Segment Explorer (unchanged)                                       */
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
