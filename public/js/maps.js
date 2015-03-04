(function (queryTablemaps, $, undefined) {

    var METERS_PER_MILE = 1609.34;
    var CHICAGO = new google.maps.LatLng(41.8369, -87.6847);

    var NO_DATA_COLOR = "#666666";
    var AREA_COLOR = '#6699FF';
    var CIRCLE_COLOR = '#000066';
    var OUTLINE_COLOR = '#FFFFFF';

    var MARKER_ANIMATION = google.maps.Animation.DROP;

    var activeGeography = "communities";
    var communityData = {}; // current community desertification data
    var censusData = []; // current census desertification data
    var markerAnimationEnabled = true;

    // When true, polygons are shaded relative only to other visible polygons
    var relativeShadingEnabled = false;

    var map = null; // Google map object
    var visibleInfoWindow = undefined;

    // Predicates to indicate whether community area / census polys are ready
    // for rendering
    var communitiesReady = false;
    var censusReady = false;

    var circles = []; // handle to circle drawn on map
    var markers = []; // handle to markers drawn on map

    var polyMouseoverCallback = undefined;

    function showPolys(polys) {
        for (var i = 0; i < polys.length; i++) {
            polys[i].setMap(maps.getMap());
        }
    }

    function hidePolys(polys) {
        for (var i = 0; i < polys.length; i++) {
            polys[i].setMap(null);
        }
    }

    function renderCircles(centerLatLng, areaId) {
        removeCircles();
        closeInfowindow();

        for (var i = 3; i > 0; i--) {
            var circle = getNewCircle(centerLatLng, i);

            google.maps.event.addListener(circle, 'mouseover', function (event) {

                var areaRecord = getRecordForArea(areaId, censusData);
                var businessCount = undefined;
                if (this.radiusMiles == 3) businessCount = areaRecord["THREE_MILE"];
                else if (this.radiusMiles == 2) businessCount = areaRecord["TWO_MILE"];
                else if (this.radiusMiles == 1) businessCount = areaRecord["ONE_MILE"];

                var infowindow = new google.maps.InfoWindow({
                    position: event.latLng,
                    content: "<div class='circle-infowindow'><div class='circle-radius'>" + this.radiusMiles + " mile radius</div><div class='circle-description'>There are " + businessCount + " businesses of the selected type within a " + this.radiusMiles + " mile radius of the encircled location.</div></div>"
                });

                // Hide any visible infowindows
                closeInfowindow();

                infowindow.open(map);
                visibleInfoWindow = infowindow;
            });

            circles.push(circle);
        }
    }

    function getNewCircle(centerLatLng, radiusMiles) {

        var circleOptions = {
            strokeColor: OUTLINE_COLOR,
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: CIRCLE_COLOR,
            fillOpacity: 0.35,
            map: map,
            center: centerLatLng,
            radius: radiusMiles * METERS_PER_MILE,
            zIndex: google.maps.Marker.MAX_ZINDEX + 1,
            radiusMiles: radiusMiles
        };

        return new google.maps.Circle(circleOptions);
    }

    function removeCircles() {
        for (var i = 0; i < circles.length; i++) {
            circles[i].setMap(null);
        }
    }

    function closeInfowindow() {
        if (visibleInfoWindow) visibleInfoWindow.close();
    }

    /* Filter a given set of polygons returning an array containing only those currently visible
     * on the map.
     */
    function getVisiblePolygons(polys) {
        var visiblePolys = [];

        // Get visible map boundaries
        var neLat = map.getBounds().getNorthEast().lat();
        var neLng = map.getBounds().getNorthEast().lng();
        var swLat = map.getBounds().getSouthWest().lat();
        var swLng = map.getBounds().getSouthWest().lng();

        // Filter set of polygons based on whether their centroid appears within bounds
        for (var i = 0; i < polys.length; i++) {
            var lat = polys[i].centroid.lat();
            var lng = polys[i].centroid.lng();

            // Is the polygon centroid presently visible on the map?
            if (lat < neLat && lng < neLng && lat > swLat && lng > swLng) {
                visiblePolys.push(polys[i]);
            }
        };

        return visiblePolys;
    }

    function getMaxIndex(polys, data) {
        var max = 0;
        for (var i = 0; i < polys.length; i++) {
            var index = getIndexForArea(polys[i].areaId, data);
            if (index > max) max = index;
        };

        return max;
    }

    function getMinIndex(polys, data) {
        var min = Number.MAX_VALUE;
        for (var i = 0; i < polys.length; i++) {
            var index = getIndexForArea(polys[i].areaId, data);
            if (index < min) min = index;
        };

        return min;
    }

    function getActiveDataset() {
        return (activeGeography == "census") ? censusData : communityData;
    }

    function getActivePolygons() {
        return (activeGeography == "census") ? polygons.getCensusPolygons() : polygons.getCommunityPolygons();
    }

    /* Re-shade visible polygons (may change opacity on when relative shading is enabled).
     */
    function refreshPolygonShading() {

        var activePolygons = getActivePolygons();
        var activeDataset = getActiveDataset();

        if (relativeShadingEnabled) {

            // Blank polygons that are not visible 
            for (var i = 0; i < activePolygons.length; i++) {
                activePolygons[i].setMap(null);
            };

            activePolygons = getVisiblePolygons(activePolygons);
        }

        shadePolygons(activePolygons, activeDataset);
    }

    function getRecordForArea(areaId, data) {
        var areaProperty = (activeGeography == "census") ? "TRACT" : "COMMUNITY_AREA";
        var foundRecord = undefined;

        for (var i = 0; i < data.length; i++) {
            var record = data[i];
            if (record[areaProperty] == areaId) {
                foundRecord = record;
            }
        };

        return foundRecord;
    };

    function getIndexForArea(areaId, data) {
        var areaData = getRecordForArea(areaId, data);
        return areaData && getRecordForArea(areaId, data)["ACCESS1"];
    }

    function shadePolygons(polys, data) {

        // Get min and max access index values for polygons
        var max = getMaxIndex(polys, data);
        var min = getMinIndex(polys, data);

        for (var n = 0; n < polys.length; n++) {
            var index = getIndexForArea(polys[n].areaId, data);
            var poly = polys[n];

            // No data available--color polygon in red
            if (index == undefined) {
                poly.setOptions({
                    fillOpacity: 0.4,
                    fillColor: NO_DATA_COLOR
                });
            }

            // Shade polygon based on bucket value
            else {
                poly.setOptions({
                    fillOpacity: getOpacityBucket((index - min) / (max - min))
                });
            }

            poly.setMap(map);
        };
    }

    function getOpacityBucket(value) {
        var bucketCount = 5;
        var bucket = Math.round(value / (1 / bucketCount)) * (1 / bucketCount);

        // Don't shade anything as 0 or 1 (makes map hard to read)
        return (bucket == 0) ? 0.05 : (bucket == 1) ? .95 : bucket;
    }

    function renderMarkers(places) {

        $.each(places, function (index, place) {
            var marker = new google.maps.Marker({
                position: new google.maps.LatLng(place.LATTITUDE, place.LONGITUDE),
                title: place.name,
                map: map,
                title: place.DOING_BUSINESS_AS_NAME,
                animation: (markerAnimationEnabled) ? MARKER_ANIMATION : null
            });

            var contentString = '<div id="infowindow-pano"></div><div id="infowindow-text"><div id="infowindow-title"></div><div id="infowindow-address"></div><div id="infowindow-description"></div></div>';

            var infowindow = new google.maps.InfoWindow({
                content: contentString
            });

            $("#infowindow-title").text(place.DOING_BUSINESS_AS_NAME);

            google.maps.event.addListener(infowindow, 'domready', function () {
                var pano = new google.maps.StreetViewPanorama(document.getElementById("infowindow-pano"), {
                    position: new google.maps.LatLng(place.LATTITUDE, place.LONGITUDE),
                    navigationControl: false,
                    enableCloseButton: false,
                    addressControl: false,
                    linksControl: false,
                    panControl: false,
                    zoomControl: false
                });
                pano.setVisible(true);
            });

            google.maps.event.addListener(marker, 'click', function () {
                closeInfowindow();
                visibleInfoWindow = infowindow;
                infowindow.open(map, marker);

                var popAtRisk = place.POP_AT_RISK.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")

                $("#infowindow-title").text(place.DOING_BUSINESS_AS_NAME);
                $("#infowindow-address").text(place.ADDRESS);
                $("#infowindow-description").text("If this business were to close, a population of " + popAtRisk + " would live more than a mile away from a competing business.");
            });

            markers.push(marker);
        });
    };

    function initGoogleMap() {

        var mapOptions = {
            center: CHICAGO,
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            zoom: 11
        };

        map = new google.maps.Map(document.getElementById('map-canvas'), mapOptions);

        // Refresh polygon shading as bounds change
        google.maps.event.addListener(map, 'bounds_changed', function () {
            refreshPolygonShading();
        });
    }

    function initPolygons() {
        polygons.load(function () {
            var allPolygons = polygons.getCensusPolygons().concat(polygons.getCommunityPolygons());

            $.each(allPolygons, function (i, poly) {

                // Handle mouseover events on this poly
                google.maps.event.addListener(poly, 'mouseover', function () {
                    // Make shape outline bold
                    this.setOptions({
                        strokeOpacity: 1,
                        strokeWeight: 6,
                    });

                    if (polyMouseoverCallback) {
                        var data = (activeGeography === "census") ? censusData : communityData;
                        polyMouseoverCallback(activeGeography, this.areaName, this, getRecordForArea(this.areaId, data));
                    }
                });

                // Handle mouseout events on this poly
                google.maps.event.addListener(poly, 'mouseout', function () {
                    // Make shape outline "normal"
                    this.setOptions({
                        strokeOpacity: 1,
                        strokeWeight: 1,
                    });
                });

                // In order to draw circles, we need to capture click events. Since the poly will float
                // above the map, we can't attach this listener to the map object itself.
                google.maps.event.addListener(poly, 'click', function (event) {
                    if (activeGeography == "census") {
                        renderCircles(event.latLng, this.areaId);
                    }
                });

            });

            showPolys(polygons.getCommunityPolygons());
            shadePolygons(polygons.getCommunityPolygons(), communityData);
        });
    }

    maps.init = function () {

        initGoogleMap();
        initPolygons();
    };

    maps.showCommunities = function () {
        closeInfowindow();
        removeCircles();

        if (polygons.areReady()) {
            showPolys(polygons.getCommunityPolygons());
            hidePolys(polygons.getCensusPolygons());
        }
    };

    maps.showCensusTracts = function () {
        closeInfowindow();
        removeCircles();

        if (polygons.areReady()) {
            showPolys(polygons.getCensusPolygons());
            hidePolys(polygons.getCommunityPolygons());
        }
    };

    maps.showMarkers = function (datafile) {
        this.hideMarkers();
        json.fetch(datafile, function (places) {
            renderMarkers(places);
        });
    };

    maps.hideMarkers = function () {
        if (markers != null) {
            for (var i = 0; i < markers.length; i++) {
                markers[i].setMap(null);
            };
        }

        markers = [];
    };

    maps.setRelativePolygonShading = function (isRelativeShadingEnabled) {
        relativeShadingEnabled = isRelativeShadingEnabled;
        refreshPolygonShading();
    };

    maps.enableMarkerAnimation = function (enable) {
        markerAnimationEnabled = enable;
    }

    maps.setCommunityData = function (datafile) {
        communityData = {};

        json.fetch(datafile, function (data) {
            communityData = data;
            shadePolygons(polygons.getCommunityPolygons(), data);
        });

        activeGeography = "communities";
    };

    maps.setCensusData = function (datafile) {
        censusData = {};

        json.fetch(datafile, function (data) {
            censusData = data;
            shadePolygons(polygons.getCensusPolygons(), data);
        });

        activeGeography = "census";
    };

    maps.getMap = function () {
        return map;
    };

    maps.setPolyMouseoverCallback = function (callback) {
        polyMouseoverCallback = callback;
    }

}(window.maps = window.maps || {}, jQuery));