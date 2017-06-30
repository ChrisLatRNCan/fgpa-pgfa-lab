(function () {
    'use strict';
    var reduce = Function.bind.call(Function.call, Array.prototype.reduce);
    var isEnumerable = Function.bind.call(Function.call, Object.prototype.propertyIsEnumerable);
    var concat = Function.bind.call(Function.call, Array.prototype.concat);
    var keys = Object.keys;
    // apparently using Object.keys is not spec compliant, but it's in a very odd case
    // and using Object.keys makes IE happy https://bugzilla.mozilla.org/show_bug.cgi?id=1208464#c13

    if (!Object.values) {
        Object.values = function values(O) {
            return reduce(keys(O), function (v, k) {
                return concat(v, typeof k === 'string' && isEnumerable(O, k) ? [O[k]] : []);
            }, []);
        };
        /*
    Object.values = (object) => Object.keys(object).map(
            (key) => object[key]
        );
        */
    }

    if (!Object.entries) {
        /*
        Object.entries = function entries(O) {
            return reduce(keys(O), function (e, k) {
                return concat(e, typeof k === 'string' && isEnumerable(O, k) ? [[k, O[k]]] : []);
            }, []);
        };
        */
        Object.entries = function (object) {
            return Object.keys(object)
                .map(function (key) {
                    return [key, object[key]];
                });
        };
    }
}());

'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

/* global Logdown */
// eslint-disable-next-line max-statements
(function () {
    // jshint ignore:line
    // disabled checks on above line due to 'too many statements in this function' (jshint W071)

    /**
     * Dynamically injects the main viewer script and styles references.
     * TODO: need to check how viewer works if there is already a version of jQuery on the page; maybe load a jQuery-less version of the viewer then.
     * Reference on script loading: http://www.html5rocks.com/en/tutorials/speed/script-loading/
     */

    // check if the global RV registry object already exists and store a reference
    var RV = window.RV = typeof window.RV === 'undefined' ? {} : window.RV;

    // fixes logger issue where it can be called before it is loaded, this reverts it to console
    // TODO: load logger lib before app starts
    RV.logger = console;

    // test user browser, true if IE false otherwise
    RV.isIE = /Edge\/|Trident\/|MSIE /.test(window.navigator.userAgent);

    // Safari problem with file saver: https://github.com/eligrey/FileSaver.js/#supported-browsers
    // test if it is Safari browser on desktop and it if is, show a message to let user know we can't automatically save the file
    // they have to save it manually the same way as when the canvas is tainted.
    RV.isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent) && !/(iPhone|iPod|iPad)/i.test(navigator.platform);

    // set these outside of the initial creation in case the page defines RV for setting
    // properties like dojoURL
    Object.assign(RV, {
        getMap: getMap,
        ready: ready,
        allScriptsLoaded: false,
        debug: {},
        _nodes: null,
        _deferredPolyfills: RV._deferredPolyfills || [] // holds callback for any polyfills or patching that needs to be done after the core.js is loaded
    });

    var customAttrs = ['config', 'langs', 'service-endpoint', 'restore-bookmark', 'wait', 'keys', 'fullpage-app'];

    // versions of scripts to inject
    var dependencies = {
        angular: {
            get ourVersion() {
                return '1.4.12';
            },
            get theirVersion() {
                return angular.version.full;
            },
            get url() {
                return '//ajax.googleapis.com/ajax/libs/angularjs/' + this.ourVersion + '/angular.min.js';
            }
        },
        jQuery: {
            get ourVersion() {
                return '2.2.1';
            },
            get theirVersion() {
                return $.fn.jquery;
            },
            get url() {
                return '//ajax.aspnetcdn.com/ajax/jQuery/jquery-' + this.ourVersion + '.min.js';
            }
        },
        dataTables: {
            get ourVersion() {
                return '1.10.15';
            },
            get theirVersion() {
                return $.fn.dataTable.version;
            },
            get url() {
                return '//cdn.datatables.net/' + this.ourVersion + '/js/jquery.dataTables.min.js';
            }
        }
    };
    var dependenciesOrder = ['jQuery', 'dataTables', 'angular'];

    var d = document;
    var scripts = d.getElementsByTagName('script'); // get scripts

    // TODO: make more robust; this way of getting script's url might break if the `asyn` attribute is added on the script tag
    var seedUrl = scripts[scripts.length - 1].src; // get the last loaded script, which is this
    var repo = seedUrl.substring(0, seedUrl.lastIndexOf('/'));

    var headNode = d.getElementsByTagName('head')[0];
    var bodyNode = d.getElementsByTagName('body')[0];

    // inject styles
    var stylesLink = d.createElement('link');
    stylesLink.href = repo + '/main.css';
    stylesLink.type = 'text/css';
    stylesLink.rel = 'stylesheet';
    stylesLink.media = 'screen,print';

    headNode.appendChild(stylesLink);

    // inject fonts
    var fontsLink = d.createElement('link');
    fontsLink.href = '//fonts.googleapis.com/css?family=Roboto:300,400,500,700,400italic';
    fontsLink.rel = 'stylesheet';

    headNode.appendChild(fontsLink);

    var scriptsArr = [];

    // append proper srcs to scriptsArray
    dependenciesOrder.forEach(function (dependencyName) {
        var dependency = dependencies[dependencyName];

        if (window[dependencyName]) {
            versionCheck(dependency.ourVersion, dependency.theirVersion, dependencyName);
        } else {
            scriptsArr.push(dependency.url);
        }
    });

    // in cases when Angular is loaded by the host page before jQuery (or jQuery is not loaded at all), the viewer will not work as Angular will not bind jQuery correctly even if bootstrap loads a correct version of jQuery
    // more info, third paragraph from the top: https://code.angularjs.org/1.4.12/docs/api/ng/function/angular.element
    if (window.angular && !window.jQuery) {
        console.error('The viewer requires jQuery to work correctly.' + 'Ensure a compatible version of jQuery is loaded before Angular by the host page.');

        // stopping initialization
        return;
    }

    // registry of map proxies
    var mapRegistry = [];

    var readyQueue = []; // array of callbacks waiting on script loading to complete

    // appeasing this rule makes the code fail disallowSpaceAfterObjectKeys
    /* jscs:disable requireSpacesInAnonymousFunctionExpression */
    var mapProxy = {
        _appPromise: null,
        _initAppPromise: null,
        appID: null,

        _proxy: function _proxy(action) {
            for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
                args[_key - 1] = arguments[_key];
            }

            return this._appPromise.then(function (appInstance) {
                return appInstance[action].apply(appInstance, args);
            });
        },
        _initProxy: function _initProxy(action) {
            for (var _len2 = arguments.length, args = Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                args[_key2 - 1] = arguments[_key2];
            }

            return this._initAppPromise.then(function (appInstance) {
                return appInstance[action].apply(appInstance, args);
            });
        },


        /**
         * RCS layers to be loaded once the map has been instantiated.
         *
         * @function    loadRcsLayers
         * @param {Array}  keys  array of strings containing RCS keys to be added
         */
        loadRcsLayers: function loadRcsLayers(keys) {
            this._proxy('loadRcsLayers', keys);
        },


        /**
         * Sets the translation language and reloads the map.
         *
         * @function    setLanguage
         * @param   {String}    lang    the new language to use
         */
        setLanguage: function setLanguage(lang) {
            this._proxy('setLanguage', lang);
        },


        /**
         * Returns a bookmark for the current viewers state.
         *
         * @function    getBookmark
         * @returns     {Promise}    a promise that resolves to the bookmark containing the state of the viewer
         */
        getBookmark: function getBookmark() {
            return this._proxy('getBookmark');
        },


        /**
         * useBookmark loads the provided bookmark into the map application. Unlike initialBookmark, it does not need to be the first bookmark loaded nor does it require `rv-wait` on the map DOM node. This method is typically triggered by user actions, taking priority over existing bookmarks.
         *
         * @function    useBookmark
         * @param   {String}    bookmark    bookmark containing the desired state of the viewer
         */
        useBookmark: function useBookmark(bookmark) {
            this._proxy('useBookmark', bookmark);
        },


        /**
         * initialBookmark is intended to be the first bookmark loaded by the map application (for example, when a bookmark comes in the URL bar) and should only be used if the `rv-wait` attribute is set on the map DOM node.  `rv-wait` will inform the viewer to wait until an unblocking call like initialBookmark is called.
         *
         * If a useBookmark call happens to be triggered before initialBookmark it will take priority (useBookmark is typically triggered by user actions which should take priority over automated actions).
         *
         * @function    initialBookmark
         * @param   {String}    bookmark    bookmark containing the desired state of the viewer
         */
        initialBookmark: function initialBookmark(bookmark) {
            this._initProxy('initialBookmark', bookmark);
        },


        /**
         *  Updates the extent of the map by centering and zooming the map.
         *
         * @function    centerAndZoom
         * @param {Number} x                    The x coord to center on
         * @param {Number} y                    The y coord to center on
         * @param {Object} spatialRef           The spatial reference for the coordinates
         * @param {Number} zoom                 The level to zoom to
         */
        centerAndZoom: function centerAndZoom(x, y, spatialRef, zoom) {
            this._proxy('centerAndZoom', x, y, spatialRef, zoom);
        },


        /**
         * Loads using a bookmark from sessionStorage (if found) and a keyList.
         *
         * @function    restoreSession
         * @param   {Array}     keys      array of strings containing RCS keys to load
         */
        restoreSession: function restoreSession(keys) {
            this._initProxy('restoreSession', keys);
        },


        /**
         * Returns an array of ids for rcs added layers.
         *
         * @function    getRcsLayerIDs
         * @returns     {Promise}     a promise which resolves to a list of rcs layer ids
         */
        getRcsLayerIDs: function getRcsLayerIDs() {
            return this._proxy('getRcsLayerIDs');
        },


        /**
         * Registers a plugin with a viewer instance.
         * This function expects a minimum of two parameters such that:
         *   - the first parameter is a plugin class reference
         *   - the second parameter is a unique plugin id string
         * Any additional parameters will be passed to the plugins init method
         *
         * @function    registerPlugin
         */
        registerPlugin: function registerPlugin() {
            var _arguments = arguments;

            this._loadPromise.then(function (app) {
                return app.registerPlugin.apply(app, _arguments);
            });
        },


        /**
        * Provides data needed for the display of a north arrow on the map for lambert and mercator projections. All other projections
        * are not supported, however mapPntCntr and mapScrnCntr are still returned so that if needed, external API's can be created for
        * any projection type.
        *
        * The returned object has the following properties:
        *    projectionSupported    {boolean}   true iff current projection is lambert or mercator
        *    screenX                {Number}    left offset for arrow to intersect line between map center and north point
        *    angleDegrees           {Number}    angle derived from intersection of horizontal axis line with line between map center and north point
        *    rotationAngle          {Number}    number of degrees to rotate north arrow, 0 being none with heading due north
        *    mapPntCntr             {Object}    lat/lng of center in current extent
        *    mapScrnCntr            {Object}    pixel x,y of center in current extent
        *
        * @function  northArrow
        * @returns  {Object}    an object containing data needed for either static or moving north arrows
        */
        getNorthArrowData: function getNorthArrowData() {
            return this._proxy('northArrow');
        },


        /**
        * Provides data needed for the display of a map coordinates on the map in latitude/longitude (degree, minute, second and decimal degree).
        *
        * The returned array can contain 2 items:
        *   if spatial reference ouput = 4326 (lat/long)
        *    [0]           {String}    lat/long in degree, minute, second (N/S) | lat/long in degree, minute, second (E/W)
        *    [1]           {String}    lat/long in decimal degree (N/S)| lat/long in decimal degree (E/W)
        *   otherwise
        *    [0]           {String}    number (N/S)
        *    [1]           {String}    number (E/W)
        *
        * @function  mapCoordinates
        * @returns  {Array}    an array containing data needed for map coordinates
        */
        getMapCoordinates: function getMapCoordinates() {
            return this._proxy('mapCoordinates');
        },
        _init: function _init(appID) {
            var _this = this;

            this.appID = appID;

            this._appPromise = new Promise(function (resolve) {
                return (
                    // store a callback function in the proxy object itself for map instances to call upon readiness
                    _this._registerMap = function (appInstance) {
                        return (
                            // resolve with the actual instance of the map;
                            // after this point, all queued calls to `loadRcsLayers`, `setLanguage`, etc. will trigger
                            resolve(appInstance)
                        );
                    }
                );
            });

            // this promise waits to be resolved by the rvReady event on the angular side
            // unlike the other promises this is only resolved once during the page load cycle
            if (typeof this._loadPromise === 'undefined') {
                this._loadPromise = new Promise(function (resolve) {
                    return (
                        // store a callback function in the proxy object itself for map instances to call upon readiness
                        _this._applicationLoaded = function (appInstance) {
                            return resolve(appInstance);
                        }
                    );
                });
            }

            this._initAppPromise = new Promise(function (resolve) {
                return (
                    // store a callback function in the proxy object itself for map instances to call upon readiness
                    _this._registerPreLoadApi = function (appInstance) {
                        return (
                            // resolve with the actual instance of the map;
                            // after this point, all queued calls to `loadRcsLayers`, `setLanguage`, etc. will trigger
                            resolve(appInstance)
                        );
                    }
                );
            });

            return this;
        },
        _deregisterMap: function _deregisterMap() {
            this._init();
        }
    };
    /* jshint:enable requireSpacesInAnonymousFunctionExpression */

    // convert html collection to array:
    // https://babeljs.io/docs/learn-es2015/#math-number-string-object-apis
    var nodes = [].slice.call(document.getElementsByClassName('fgpv'));
    var isAttrNodes = [].slice.call(document.querySelectorAll('[is=rv-map]'));
    isAttrNodes.filter(function (node) {
        return nodes.indexOf(node) === -1;
    }).forEach(function (node) {
        return nodes.push(node);
    });

    // store nodes to use in app-seed; avoids a second DOM traversal
    RV._nodes = nodes;

    var counter = 0;

    nodes.forEach(function (node) {

        var appId = node.getAttribute('id');

        // TODO v2.0: Remove the following deprecation warning
        // deprecating class fgpv on node for 2.0 release - use is="fgpv" instead
        if (node.classList.contains('fgpv')) {
            console.warn('Using class fgpv on the map DOM node is deprecated' + 'and will be removed on v2.0 release. Use is="fgpv" instead.');
        }

        customAttrs.filter(function (attrName) {
            return node.getAttribute('data-rv-' + attrName);
        }).forEach(function (attrName) {
            node.setAttribute('rv-' + attrName, node.getAttribute('data-rv-' + attrName)); // getAttribute returns a string so data-rv-fullscreen-app="false" will copy correctly
            node.removeAttribute('data-rv-' + attrName);
        });

        if (!appId) {
            appId = 'rv-app-' + counter++;
            node.setAttribute('id', appId);
        }

        node.setAttribute('rv-trap-focus', appId);

        // basic touch device detection; if detected set rv-touch class so that touch mode is on by default
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
            node.className += ' rv-touch';
        }

        // create debug object for each app instance
        RV.debug[appId] = {};

        mapRegistry[appId] = Object.create(mapProxy)._init(appId);
    });

    scriptsArr.forEach(function (src) {
        return loadScript(src);
    });

    // load core.js last and execute any deferred polyfills/patches
    loadScript(repo + '/core.js', function () {
        RV._deferredPolyfills.forEach(function (dp) {
            return dp();
        });
        RV.allScriptsLoaded = true;
        // init here since logging library is in core.js
        RV.logger = enhanceLogger(RV.PROD_MODE ? ['error'] : ['debug', 'log', 'info', 'warn', 'error']);
        RV.logger.log('bootstrapLogdown        ', 'has been started'); // pad prefix so they line up better
        fireRvReady();
    });

    /**
     * The following enhancements are applied to make Logdown better for our use cases:
     *      1) Allows log prefixes to be added as the first argument to a logging function
     *         For example, RV.logger.warn('focusManager', 'is the best');
     *         Normally, prefixes cannot be defined after a Logdown instance is created. We correct this
     *         by wrapping console functions such that Logdown instances are created after the console message is executed.
     *
     *      2) We correct an issue where Logdown does not retrieve a pre-existing instance by prefix name, which causes prefix
     *         instances with the same name to have multiple colors.
     *
     * @function    enhanceLogger
     * @param       {Array}  enabledMethods    an array of console function string names like log, debug, warn that should be displayed
     * @return {Object} the logger object
     */
    function enhanceLogger() {
        var enabledMethods = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];

        var methods = ['debug', 'log', 'info', 'warn', 'error'];
        var logger = {};

        methods.forEach(function (type) {
            logger[type] = function () {
                var args = [].slice.call(arguments);
                if (enabledMethods.indexOf(type) !== -1) {
                    var _getLogdownInstance;

                    (_getLogdownInstance = getLogdownInstance(args.splice(0, 1)[0]))[type].apply(_getLogdownInstance, _toConsumableArray(args));
                }
            };
        });
        return logger;
    }

    /**
     * Logdown should return an existing instance of a logger if it finds one with matching prefixes. However, there seems to be a bug
     * where logdown does not trim() its prefix search when alignOutput is true - the extra spaces cause the error. So we manually try
     * to find instances and only create a new one if one if not found.
     *
     * @function    getLogdownInstance
     * @param       {String}  prefix    the name/prefix of the logger instance
     */
    function getLogdownInstance(prefix) {
        var logger = Logdown._instances.find(function (ld) {
            return ld.opts.prefix.trim() === prefix;
        });
        // logger for prefix was not found, create a new one
        if (!logger) {
            logger = new Logdown({ prefix: prefix, alignOutput: true });
        }

        return logger;
    }

    /**
     * Called to buffer code until the library code has been fully loaded.  Behaves similar to jQuery style DOM ready events.
     * @function
     * @param {Function} callBack a function to be called once the library is loaded
     */
    function ready(callBack) {
        if (RV.allScriptsLoaded) {
            callBack();
        } else {
            readyQueue.push(callBack);
        }
    }

    /**
     * Fires all callbacks waiting on the ready event and empties the callback queue.
     * @private
     */
    function fireRvReady() {
        readyQueue.forEach(function (cb) {
            return cb();
        });
        readyQueue = [];
    }

    // external "sync" function to retrieve a map instance
    // in reality it returns a map proxy queueing calls to the map until it's ready
    function getMap(id) {
        return mapRegistry[id];
    }

    /**
     * Load a script and execute an optional callback
     * @function
     * @private
     * @param {String} src url of the script to load
     * @param {Function} loadCallback [optional] a callback to execute on script load
     * @return {Object} script tag
     */
    function loadScript(src, loadCallback) {
        var currScript = d.createElement('script');
        currScript.src = src;
        currScript.async = false;
        currScript.type = 'text/javascript';

        if (typeof loadCallback === 'function') {
            currScript.addEventListener('load', loadCallback);
        }

        bodyNode.appendChild(currScript);

        return currScript;
    }

    /**
     * Compares two versions of a script, prints warnings to the console if the versions are not the same
     *
     * @private
     * @function versionCheck
     * @param  {String} ourVersion      our version of the script
     * @param  {String} theirVersion    their version of the script
     * @param  {String} scriptName      the name of the script
     */
    function versionCheck(ourVersion, theirVersion, scriptName) {
        var ourVersionSplit = ourVersion.split('.');
        var versionDiff = theirVersion.split('.')
        // compare the two versions
        .map(function (x, index) {
            return parseInt(x) - ourVersionSplit[index];
        })
        // find first non-equal part
        .find(function (x) {
            return x !== 0;
        });

        if (typeof versionDiff === 'undefined') {
            // the versions were equal
            return;
        }

        var warningMessgage = scriptName + ' ' + theirVersion + ' is detected ' + ('(' + (versionDiff > 0 ? 'more recent' : 'older') + ' that expected ' + ourVersion + ' version). ') + 'No tests were done with this version. The viewer might be unstable or not work correctly.';

        console.warn(warningMessgage);
    }
})();

(function () {
    'use strict';

    var RV = window.RV; // just a reference
    RV.debug._trackFocus = trackFocusBuilder();

    /**
     * Builds a focus tracking debug option.
     * @function trackFocusBuilder
     * @private
     * @return function  enables/disabled focus/blur event tracking on the page; this function accepts a boolean - `true` enables tracking; `false`, disables it
     */
    function trackFocusBuilder() {
        var lastActiveElement = document.activeElement;

        var isActive = false;

        return function () {
            isActive = !isActive;
            if (isActive) {
                RV.logger.debug('trackFocus', 'Enabled');
                attachEvents();
            } else {
                RV.logger.debug('trackFocus', 'Disabled');
                detachEvents();
            }
        };

        /***/

        /**
         * Logs blur events.
         * @function detectBlur
         * @private
         * @param  {Object} event blur event
         */
        function detectBlur(event) {
            // Do logic related to blur using document.activeElement;
            // You can do change detection too using lastActiveElement as a history
            RV.logger.debug('trackFocus', 'blur detected', document.activeElement, event, isSameActiveElement());
        }

        /**
         * Checks if the currently active element is the same as the previosly focused one.
         * @function isSameActiveElement
         * @private
         * @return {Boolean} true if it's the same object
         */
        function isSameActiveElement() {
            var currentActiveElement = document.activeElement;
            if (lastActiveElement !== currentActiveElement) {
                lastActiveElement = currentActiveElement;
                return false;
            }

            return true;
        }

        /**
         * Logs focus events.
         * @function detectFocus
         * @private
         * @param  {Object} event focus event
         */
        function detectFocus(event) {
            // Add logic to detect focus and to see if it has changed or not from the lastActiveElement.
            RV.logger.debug('trackFocus', 'focus detected', document.activeElement, event, isSameActiveElement());
        }

        /**
         * Attaches listeners to the window to listen for focus and blue events.
         * @function attachEvents
         * @private
         */
        function attachEvents() {
            window.addEventListener('focus', detectFocus, true);
            window.addEventListener('blur', detectBlur, true);
        }

        /**
         * Detaches focus and blur listeners from the window.
         * @function detachEvents
         * @private
         */
        function detachEvents() {
            window.removeEventListener('focus', detectFocus, true);
            window.removeEventListener('blur', detectBlur, true);
        }
    }
})();