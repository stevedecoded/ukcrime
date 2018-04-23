var map, marker;
var year = (new Date()).getFullYear() - 1;
var crimeCategories = [];

var homeController = {
    search: function(postcode, callback) {
        // remove whitespace
        postcode = postcode.trim();

        crimeApi.getLatLngsForPostcode(postcode, function(data) {
            if (data === null) {
                callback({
                    'error': 'Invalid postcode',
                    'response': []
                });
                return;
            }

            if (data.status != 200) {
                callback({
                    'error': data.error,
                    'response': []
                });
                return;
            }

            crimeApi.getYearlyCrimeOccurrencesAtLocation(year, data.result.latitude, data.result.longitude, function(occurrences) {
                var commonIncident = '';
                var incidentAverage = 0;

                if (Object.keys(occurrences).length > 0) {
                    for (key in occurrences) {
                        if (occurrences[key] / 12 > incidentAverage) {
                            commonIncident = crimeCategories[key];
                            incidentAverage = occurrences[key] / 12;
                        }
                    }
                }

                callback({
                    'error': '',
                    'response': {
                        'postcode': data.result.postcode,
                        'latitude': data.result.latitude,
                        'longitude': data.result.longitude,
                        'commonIncident': commonIncident,
                        'incidentAverage': incidentAverage
                    }
                });
            });
        });
    }
};

var crimeApi = {
    /**
     * A wrapper around crimeApi.makeJsonGetRequest for fetching
     * information about a list of postcodes from the postcodes.io API.
     *
     * @param array postcode Postcode of crime locations
     * @param callback callback Callback returning postcode info on success, null on fail
     * @return object
     */
    getLatLngsForPostcode: function(postcode, callback) {
        this.makeJsonGetRequest('http://api.postcodes.io/postcodes/' + postcode, callback);
    },

    /**
     * A wrapper around crimeApi.makeJsonGetRequest for fetching
     * all possible crime categories for the set year and month
     * from the data.police.uk API.
     *
     * @param integer year The year
     * @param integer monthNumber The month (1 through 12)
     * @param callback callback Callback returning set month's crime categories on success, null on fail
     */
    getCrimeCategories: function(year, monthNumber, callback) {
        this.makeJsonGetRequest('https://data.police.uk/api/crime-categories?date=' + year + '-' + this.padMonth(monthNumber), callback);
    },

    /**
     * A wrapper around crimeApi.getCrimeCategories for fetching
     * all possible crime categories for the set year from the
     * data.police.uk API.
     *
     * Returns a callback with category url and name.
     *
     * @param integer year The year
     * @param callback callback Callback returning set year's crime categories on success
     */
    getCrimeCategoriesForYear: function(year, callback) {
        var monthCallsLeft = 12;
        var categories = [];

        for (var month = 1; month <= 12; month ++) {
            // fetch from crime data API, one month at a time
            this.getCrimeCategories(year, month, function(monthCategories) {
                $.each(monthCategories, function(index, category) {
                    categories[category.url] = category.name;
                });

                monthCallsLeft --;

                if (monthCallsLeft == 0) {
                    callback(categories);
                }
            });
        }
    },

    /**
     * A wrapper around crimeApi.getCrimeAtLatLng for fetching
     * all crime occurrences for the set year and lat/long from
     * the data.police.uk API.
     *
     * Returns an array of occurrences in format
     * [occurrence url => number of occurrences]
     *
     * @param integer year The year
     * @param float latitude Crime location latitude
     * @param float longitude Crime location latitude
     * @param callback callback Callback returning crime totals by incident for set year on success
     */
    getYearlyCrimeOccurrencesAtLocation: function(year, latitude, longitude, callback) {
        var monthCallsLeft = 12;
        var occurrences = [];

        for (var month = 1; month <= 12; month ++) {
            // fetch from crime data API, one month at a time
            this.getCrimeAtLatLng(year, month, latitude, longitude, function(monthIncidents) {
                $.each(monthIncidents, function(index, incident) {
                    if (incident.category in occurrences) {
                        occurrences[incident.category] ++;
                    } else {
                        occurrences[incident.category] = 1;
                    }
                });

                monthCallsLeft --;

                if (monthCallsLeft == 0) {
                    callback(occurrences);
                }
            });
        }
    },

    /**
     * A wrapper around crimeApi.makeJsonGetRequest for fetching
     * all crime occurrences for the set year, month and lat/long
     * from the data.police.uk API.
     *
     * Returns data from API including crime category, street name,
     * outcome status, location type, etc.
     *
     * @param integer year The year
     * @param integer monthNumber The month number (1 through 12)
     * @param float latitude Crime location latitude
     * @param float longitude Crime location latitude
     * @param callback callback Callback returning crime totals by incident for set month on success
     */
    getCrimeAtLatLng: function(year, monthNumber, latitude, longitude, callback) {
        return this.makeJsonGetRequest('https://data.police.uk/api/crimes-at-location?date=' + year + '-' + this.padMonth(monthNumber) + '&lat=' + latitude + '&lng=' + longitude, callback);
    },

    /**
     * Pads the month number to start with a leading zero if
     * below 10, i.e. 08, 09, 10. For use with data.police.uk API.
     *
     * @param integer monthNumber The month number (1 through 12)
     * @return string
     */
    padMonth: function(monthNumber) {
        return monthNumber.toString().padStart(2, '0');
    },

    /**
     * Making a GET request to the provided URL and return the response.
     * As a JSON-decoded object.
     *
     * @param string url The URL to make the request to
     * @param callback callback Callback returning JSON response data on success
     */
    makeJsonGetRequest: function(url, callback) {
        $.ajax({
            type: 'GET',
            url: url,
            success: function(data, status, xhr) {
                if (xhr.status != 200) {
                    callback(xhr.responseJSON);
                    return;
                }

                callback(data);
            },
            error: function(xhr, status, error) {
                callback(xhr.responseJSON);
            },
            dataType: 'json'
        });
    }
};

function initMap() {
    var defaultPosition = {lat: 51.507351, lng: -0.127758}; // centre of London

    map = new google.maps.Map(document.getElementById('map'), {
        center: defaultPosition,
        scrollwheel: false,
        zoom: 17,
        mapTypeId: google.maps.MapTypeId.HYBRID
    });
}

function setMarker(latlng) {
    if (! marker) {
        marker = new google.maps.Marker({
            position: latlng,
            map: map
        });
    } else {
        marker.setPosition(latlng);
    }
}

function setPostcode(postcodeData) {
    var topText = '';

    if (postcodeData.commonIncident != '') {
        topText = 'The most common crime at postcode ' + postcodeData.postcode + ' in ' + year + ' was ' + postcodeData.commonIncident + ', averaging ' + parseFloat(postcodeData.incidentAverage).toFixed(2) + ' occurrences per month.';
    } else {
        topText = 'There were no recorded criminal instances at postcode ' + postcodeData.postcode + ' in ' + year + '.';
    }

    $('#text').fadeOut(400, function() {
        $(this).text(topText).fadeIn();
    });

    var latlng = {
        'lat': parseFloat(postcodeData.latitude),
        'lng': parseFloat(postcodeData.longitude)
    };

    setMarker(latlng);
    map.panTo(latlng);
}

$(document).ready(function() {
    for (var i = year; i >= year - 2; i --) {
        $('#searchForm select').append($('<option value="' + i + '">' + i + '</option>'));
    }

    // fetch all possible crime category names for the set year
    crimeApi.getCrimeCategoriesForYear(year, function(categories) {
        crimeCategories = categories;
    });

    var autocompleteCache = [];

    $('#postcodeSearch').autocomplete({
        minLength: 2,
        source: function(request, response) {
            var keyword = request.term;
            if (keyword in autocompleteCache) {
                response(autocompleteCache[keyword]);
                return;
            }

            $.getJSON('http://api.postcodes.io/postcodes/' + keyword + '/autocomplete', function(data, status, xhr) {
                autocompleteCache[keyword] = data.result;
                response(data.result);
            });
        }
    });

    var postcodeCache = [];

    $('#searchForm').submit(function(event) {
        $('#errorBox').html('');
        var postcode = $('#postcodeSearch').val();
        year = $('#searchForm select').val();

        if (postcode in postcodeCache && year in postcodeCache[postcode]) {
            setPostcode(postcodeCache[postcode][year]);
        } else {
            var form = $(this);
            form.find('button[type="submit"]').prop('disabled', true);

            homeController.search(postcode, function(data) {
                if (data.error == '') {
                    setPostcode(data.response);

                    if (data.response.postcode in postcodeCache) {
                        postcodeCache[data.response.postcode][year] = data.response;
                    } else {
                        postcodeCache[data.response.postcode] = {
                            year: data.response
                        };
                    }
                } else {
                    var alertBox = $('<p class="alert alert-danger">').text(data.error);
                    $('#errorBox').html(alertBox);
                }

                form.find('button[type="submit"]').prop('disabled', false);
            });
        }

        event.preventDefault();
        return false;
    });

    $('#suggestions a').click(function(e) {
        $('#postcodeSearch').val($(this).data('postcode'));
        $('#searchForm').submit();

        e.preventDefault();
        return false;
    });
});
