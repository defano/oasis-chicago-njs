(function (queryTablemaps, $, undefined) {

    // Matt's Fusion tables and API key; don't mess with this
    var CENSUS_TRACTS_TABLE = '1E45OeyKEC8TBt_Jtau0HkiLycxjPcLS_SAgejFdt';
    var COMMUNITY_AREAS_TABLE = '19403tp7_IakdCX0soN031hMap7jPZV3uPbNhI9ME';
    var API_KEY = 'AIzaSyB_Idpo8GuOvdaIU7VtOsk7pTargR6rEFw';

    var METERS_PER_MILE = 1609.34;

    var communityPolys; // community area polygons
    var censusPolys; // census tract polygons
    var map = null; // Google map object

    // Predicates to indicate whether community area / census polys are ready
    // for rendering
    var communitiesReady = false;
    var censusReady = false;

    var circle = null;  // handle to circle drawn on map
    var markers = [];   // handle to markers drawn on map

    function queryFusionTable(tableId, successCallback) {

        // Construct the Fusion Table query
        var query = 'SELECT id, name, geometry FROM ' + tableId;
        var url = ['https://www.googleapis.com/fusiontables/v1/query'];
        url.push('?sql=' + encodeURIComponent(query));
        url.push('&key=' + API_KEY);
        url.push('&callback=?');

        // Fire it off; build polys when complete
        $.ajax({
            url: url.join(''),
            dataType: 'jsonp',
            success: function (data) {
                buildPolygons(data, successCallback);
            }
        });
    }

    function initialize() {
        var options = {
            center: new google.maps.LatLng(41.8369, -87.6847),
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            zoom: 11
        };

        map = new google.maps.Map(document.getElementById('map-canvas'),
            options);

        queryFusionTable(CENSUS_TRACTS_TABLE, function (polys) {
            censusPolys = polys;
            censusReady = true;
        });

        queryFusionTable(COMMUNITY_AREAS_TABLE, function (polys) {
            communityPolys = polys;
            communitiesReady = true;
            showPolys(communityPolys);
        });
    }

    maps.getMap = function () {
        return map;
    };

    function showPolys(polys) {
        polys.forEach(function (poly) {
            poly.setMap(maps.getMap());
        });
    }

    function hidePolys(polys) {
        polys.forEach(function (poly) {
            poly.setMap(null);
        });
    }

    function buildPolygons(data, successCallback) {

        var rows = data['rows'];
        var polys = [];

        for (var i in rows) {
            var newCoordinates = [];
            var areaId = rows[i][0];
            var areaName = rows[i][1].toLowerCase();
            var geometries = rows[i][2]['geometries'];

            if (geometries) {
                for (var j in geometries) {
                    newCoordinates.push(getPolygonCoordinates(geometries[j]));
                }
            } else {
                newCoordinates = getPolygonCoordinates(rows[i][1]['geometry']);
            }

            var poly = new google.maps.Polygon({
                paths: newCoordinates,
                strokeColor: '#ffffff',
                strokeOpacity: 1,
                strokeWeight: 2,
                fillColor: '#DB944D',
                areaId: areaId,
                areaName: areaName,
            });

            google.maps.event.addListener(poly, 'mouseover', function () {
                $(".area-name").html(this.areaName + " (" + this.fillOpacity + ")");
                this.setOptions({
                    strokeOpacity: 1,
                    strokeWeight: 6,
                });
            });
            google.maps.event.addListener(poly, 'mouseout', function () {
                this.setOptions({
                    strokeOpacity: 1,
                    strokeWeight: 1,
                });
            });

            google.maps.event.addListener(poly, 'click', function (event) {
                drawCircle(event.latLng, METERS_PER_MILE * 1);
            });

            polys.push(poly);
        }

        successCallback(polys);
    }

    function getPolygonCoordinates(polygon) {
        var newCoordinates = [];
        var coordinates = polygon['coordinates'][0];
        for (var i in coordinates) {
            newCoordinates.push(new google.maps.LatLng(coordinates[i][1],
                coordinates[i][0]));
        }
        return newCoordinates;
    }

    function drawCircle(centerLatLng, radius) {
        if (circle) circle.setMap(null);

        var circleOptions = {
            strokeColor: '#ffffff',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#4491BB',
            fillOpacity: 0.35,
            map: map,
            center: centerLatLng,
            radius: radius,
            zIndex: google.maps.Marker.MAX_ZINDEX + 1
        };

        circle = new google.maps.Circle(circleOptions);
    }

    function renderData(polys, data) {
        polys.forEach(function (thisPoly) {
            thisPoly.setOptions({
                fillOpacity: data[thisPoly.areaId] && data[thisPoly.areaId]['ACCESS_INDEX'] * 5
            });
        });
    }

    maps.init = function () {
        initialize();
    };

    maps.areCensusTractsReady = function () {
        return censusReady;
    };

    maps.areCommunitiesReady = function () {
        return communitiesReady;
    };

    maps.showCommunities = function (withDataset) {
        if (maps.areCommunitiesReady()) {
            showPolys(communityPolys);
            hidePolys(censusPolys);
        }
    };

    maps.showCensusTracts = function () {
        if (maps.areCensusTractsReady()) {
            showPolys(censusPolys);
            hidePolys(communityPolys);
        }
    };

    function renderMarkers(places) {
        places.forEach(function (place) {
            var marker = new google.maps.Marker({
                position: new google.maps.LatLng(place.lat, place.lng),
                title: place.name,
                map: map
            });

            markers.push(marker);
        });
    };

    maps.showMarkers = function (datafile) {
        maps.hideMarkers();
        json.fetch(datafile, function (places) {
            renderMarkers(places);
        });
    };

    maps.hideMarkers = function () {
        if (markers != null) {
            markers.forEach(function (thisMarker) {
                thisMarker.setMap(null);
            });
        }

        markers = [];
    };

    maps.setCommunityData = function (datafile) {
        json.fetch(datafile, function (data) {
            renderData(communityPolys, data);
        });
    };

    maps.setCensusData = function (datafile) {
        json.fetch(datafile, function (data) {
            renderData(censusPolys, data);
        });
    };

}(window.maps = window.maps || {}, jQuery));