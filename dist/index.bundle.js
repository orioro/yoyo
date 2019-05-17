(function () {
  'use strict';

  var domain;

  // This constructor is used to store event handlers. Instantiating this is
  // faster than explicitly calling `Object.create(null)` to get a "clean" empty
  // object (tested with v8 v4.9).
  function EventHandlers() {}
  EventHandlers.prototype = Object.create(null);

  function EventEmitter() {
    EventEmitter.init.call(this);
  }

  // nodejs oddity
  // require('events') === require('events').EventEmitter
  EventEmitter.EventEmitter = EventEmitter;

  EventEmitter.usingDomains = false;

  EventEmitter.prototype.domain = undefined;
  EventEmitter.prototype._events = undefined;
  EventEmitter.prototype._maxListeners = undefined;

  // By default EventEmitters will print a warning if more than 10 listeners are
  // added to it. This is a useful default which helps finding memory leaks.
  EventEmitter.defaultMaxListeners = 10;

  EventEmitter.init = function() {
    this.domain = null;
    if (EventEmitter.usingDomains) {
      // if there is an active domain, then attach to it.
      if (domain.active && !(this instanceof domain.Domain)) ;
    }

    if (!this._events || this._events === Object.getPrototypeOf(this)._events) {
      this._events = new EventHandlers();
      this._eventsCount = 0;
    }

    this._maxListeners = this._maxListeners || undefined;
  };

  // Obviously not all Emitters should be limited to 10. This function allows
  // that to be increased. Set to zero for unlimited.
  EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
    if (typeof n !== 'number' || n < 0 || isNaN(n))
      throw new TypeError('"n" argument must be a positive number');
    this._maxListeners = n;
    return this;
  };

  function $getMaxListeners(that) {
    if (that._maxListeners === undefined)
      return EventEmitter.defaultMaxListeners;
    return that._maxListeners;
  }

  EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
    return $getMaxListeners(this);
  };

  // These standalone emit* functions are used to optimize calling of event
  // handlers for fast cases because emit() itself often has a variable number of
  // arguments and can be deoptimized because of that. These functions always have
  // the same number of arguments and thus do not get deoptimized, so the code
  // inside them can execute faster.
  function emitNone(handler, isFn, self) {
    if (isFn)
      handler.call(self);
    else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].call(self);
    }
  }
  function emitOne(handler, isFn, self, arg1) {
    if (isFn)
      handler.call(self, arg1);
    else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].call(self, arg1);
    }
  }
  function emitTwo(handler, isFn, self, arg1, arg2) {
    if (isFn)
      handler.call(self, arg1, arg2);
    else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].call(self, arg1, arg2);
    }
  }
  function emitThree(handler, isFn, self, arg1, arg2, arg3) {
    if (isFn)
      handler.call(self, arg1, arg2, arg3);
    else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].call(self, arg1, arg2, arg3);
    }
  }

  function emitMany(handler, isFn, self, args) {
    if (isFn)
      handler.apply(self, args);
    else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].apply(self, args);
    }
  }

  EventEmitter.prototype.emit = function emit(type) {
    var er, handler, len, args, i, events, domain;
    var doError = (type === 'error');

    events = this._events;
    if (events)
      doError = (doError && events.error == null);
    else if (!doError)
      return false;

    domain = this.domain;

    // If there is no 'error' event listener then throw.
    if (doError) {
      er = arguments[1];
      if (domain) {
        if (!er)
          er = new Error('Uncaught, unspecified "error" event');
        er.domainEmitter = this;
        er.domain = domain;
        er.domainThrown = false;
        domain.emit('error', er);
      } else if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        // At least give some kind of context to the user
        var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
        err.context = er;
        throw err;
      }
      return false;
    }

    handler = events[type];

    if (!handler)
      return false;

    var isFn = typeof handler === 'function';
    len = arguments.length;
    switch (len) {
      // fast cases
      case 1:
        emitNone(handler, isFn, this);
        break;
      case 2:
        emitOne(handler, isFn, this, arguments[1]);
        break;
      case 3:
        emitTwo(handler, isFn, this, arguments[1], arguments[2]);
        break;
      case 4:
        emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
        break;
      // slower
      default:
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        emitMany(handler, isFn, this, args);
    }

    return true;
  };

  function _addListener(target, type, listener, prepend) {
    var m;
    var events;
    var existing;

    if (typeof listener !== 'function')
      throw new TypeError('"listener" argument must be a function');

    events = target._events;
    if (!events) {
      events = target._events = new EventHandlers();
      target._eventsCount = 0;
    } else {
      // To avoid recursion in the case that type === "newListener"! Before
      // adding it to the listeners, first emit "newListener".
      if (events.newListener) {
        target.emit('newListener', type,
                    listener.listener ? listener.listener : listener);

        // Re-assign `events` because a newListener handler could have caused the
        // this._events to be assigned to a new object
        events = target._events;
      }
      existing = events[type];
    }

    if (!existing) {
      // Optimize the case of one listener. Don't need the extra array object.
      existing = events[type] = listener;
      ++target._eventsCount;
    } else {
      if (typeof existing === 'function') {
        // Adding the second element, need to change to array.
        existing = events[type] = prepend ? [listener, existing] :
                                            [existing, listener];
      } else {
        // If we've already got an array, just append.
        if (prepend) {
          existing.unshift(listener);
        } else {
          existing.push(listener);
        }
      }

      // Check for listener leak
      if (!existing.warned) {
        m = $getMaxListeners(target);
        if (m && m > 0 && existing.length > m) {
          existing.warned = true;
          var w = new Error('Possible EventEmitter memory leak detected. ' +
                              existing.length + ' ' + type + ' listeners added. ' +
                              'Use emitter.setMaxListeners() to increase limit');
          w.name = 'MaxListenersExceededWarning';
          w.emitter = target;
          w.type = type;
          w.count = existing.length;
          emitWarning(w);
        }
      }
    }

    return target;
  }
  function emitWarning(e) {
    typeof console.warn === 'function' ? console.warn(e) : console.log(e);
  }
  EventEmitter.prototype.addListener = function addListener(type, listener) {
    return _addListener(this, type, listener, false);
  };

  EventEmitter.prototype.on = EventEmitter.prototype.addListener;

  EventEmitter.prototype.prependListener =
      function prependListener(type, listener) {
        return _addListener(this, type, listener, true);
      };

  function _onceWrap(target, type, listener) {
    var fired = false;
    function g() {
      target.removeListener(type, g);
      if (!fired) {
        fired = true;
        listener.apply(target, arguments);
      }
    }
    g.listener = listener;
    return g;
  }

  EventEmitter.prototype.once = function once(type, listener) {
    if (typeof listener !== 'function')
      throw new TypeError('"listener" argument must be a function');
    this.on(type, _onceWrap(this, type, listener));
    return this;
  };

  EventEmitter.prototype.prependOnceListener =
      function prependOnceListener(type, listener) {
        if (typeof listener !== 'function')
          throw new TypeError('"listener" argument must be a function');
        this.prependListener(type, _onceWrap(this, type, listener));
        return this;
      };

  // emits a 'removeListener' event iff the listener was removed
  EventEmitter.prototype.removeListener =
      function removeListener(type, listener) {
        var list, events, position, i, originalListener;

        if (typeof listener !== 'function')
          throw new TypeError('"listener" argument must be a function');

        events = this._events;
        if (!events)
          return this;

        list = events[type];
        if (!list)
          return this;

        if (list === listener || (list.listener && list.listener === listener)) {
          if (--this._eventsCount === 0)
            this._events = new EventHandlers();
          else {
            delete events[type];
            if (events.removeListener)
              this.emit('removeListener', type, list.listener || listener);
          }
        } else if (typeof list !== 'function') {
          position = -1;

          for (i = list.length; i-- > 0;) {
            if (list[i] === listener ||
                (list[i].listener && list[i].listener === listener)) {
              originalListener = list[i].listener;
              position = i;
              break;
            }
          }

          if (position < 0)
            return this;

          if (list.length === 1) {
            list[0] = undefined;
            if (--this._eventsCount === 0) {
              this._events = new EventHandlers();
              return this;
            } else {
              delete events[type];
            }
          } else {
            spliceOne(list, position);
          }

          if (events.removeListener)
            this.emit('removeListener', type, originalListener || listener);
        }

        return this;
      };

  EventEmitter.prototype.removeAllListeners =
      function removeAllListeners(type) {
        var listeners, events;

        events = this._events;
        if (!events)
          return this;

        // not listening for removeListener, no need to emit
        if (!events.removeListener) {
          if (arguments.length === 0) {
            this._events = new EventHandlers();
            this._eventsCount = 0;
          } else if (events[type]) {
            if (--this._eventsCount === 0)
              this._events = new EventHandlers();
            else
              delete events[type];
          }
          return this;
        }

        // emit removeListener for all listeners on all events
        if (arguments.length === 0) {
          var keys = Object.keys(events);
          for (var i = 0, key; i < keys.length; ++i) {
            key = keys[i];
            if (key === 'removeListener') continue;
            this.removeAllListeners(key);
          }
          this.removeAllListeners('removeListener');
          this._events = new EventHandlers();
          this._eventsCount = 0;
          return this;
        }

        listeners = events[type];

        if (typeof listeners === 'function') {
          this.removeListener(type, listeners);
        } else if (listeners) {
          // LIFO order
          do {
            this.removeListener(type, listeners[listeners.length - 1]);
          } while (listeners[0]);
        }

        return this;
      };

  EventEmitter.prototype.listeners = function listeners(type) {
    var evlistener;
    var ret;
    var events = this._events;

    if (!events)
      ret = [];
    else {
      evlistener = events[type];
      if (!evlistener)
        ret = [];
      else if (typeof evlistener === 'function')
        ret = [evlistener.listener || evlistener];
      else
        ret = unwrapListeners(evlistener);
    }

    return ret;
  };

  EventEmitter.listenerCount = function(emitter, type) {
    if (typeof emitter.listenerCount === 'function') {
      return emitter.listenerCount(type);
    } else {
      return listenerCount.call(emitter, type);
    }
  };

  EventEmitter.prototype.listenerCount = listenerCount;
  function listenerCount(type) {
    var events = this._events;

    if (events) {
      var evlistener = events[type];

      if (typeof evlistener === 'function') {
        return 1;
      } else if (evlistener) {
        return evlistener.length;
      }
    }

    return 0;
  }

  EventEmitter.prototype.eventNames = function eventNames() {
    return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
  };

  // About 1.5x faster than the two-arg version of Array#splice().
  function spliceOne(list, index) {
    for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
      list[i] = list[k];
    list.pop();
  }

  function arrayClone(arr, i) {
    var copy = new Array(i);
    while (i--)
      copy[i] = arr[i];
    return copy;
  }

  function unwrapListeners(arr) {
    var ret = new Array(arr.length);
    for (var i = 0; i < ret.length; ++i) {
      ret[i] = arr[i].listener || arr[i];
    }
    return ret;
  }

  function polyfill(window) {
    const ElementPrototype = window.Element.prototype;

    if (typeof ElementPrototype.matches !== 'function') {
      ElementPrototype.matches = ElementPrototype.msMatchesSelector || ElementPrototype.mozMatchesSelector || ElementPrototype.webkitMatchesSelector || function matches(selector) {
        let element = this;
        const elements = (element.document || element.ownerDocument).querySelectorAll(selector);
        let index = 0;

        while (elements[index] && elements[index] !== element) {
          ++index;
        }

        return Boolean(elements[index]);
      };
    }

    if (typeof ElementPrototype.closest !== 'function') {
      ElementPrototype.closest = function closest(selector) {
        let element = this;

        while (element && element.nodeType === 1) {
          if (element.matches(selector)) {
            return element;
          }

          element = element.parentNode;
        }

        return null;
      };
    }
  }
  //# sourceMappingURL=index.mjs.map

  var DOCUMENT_NODE_TYPE = 9;

  /**
   * A polyfill for Element.matches()
   */
  if (typeof Element !== 'undefined' && !Element.prototype.matches) {
      var proto = Element.prototype;

      proto.matches = proto.matchesSelector ||
                      proto.mozMatchesSelector ||
                      proto.msMatchesSelector ||
                      proto.oMatchesSelector ||
                      proto.webkitMatchesSelector;
  }

  /**
   * Finds the closest parent that matches a selector.
   *
   * @param {Element} element
   * @param {String} selector
   * @return {Function}
   */
  function closest (element, selector) {
      while (element && element.nodeType !== DOCUMENT_NODE_TYPE) {
          if (typeof element.matches === 'function' &&
              element.matches(selector)) {
            return element;
          }
          element = element.parentNode;
      }
  }

  var closest_1 = closest;

  /**
   * Delegates event to a selector.
   *
   * @param {Element} element
   * @param {String} selector
   * @param {String} type
   * @param {Function} callback
   * @param {Boolean} useCapture
   * @return {Object}
   */
  function _delegate(element, selector, type, callback, useCapture) {
      var listenerFn = listener.apply(this, arguments);

      element.addEventListener(type, listenerFn, useCapture);

      return {
          destroy: function() {
              element.removeEventListener(type, listenerFn, useCapture);
          }
      }
  }

  /**
   * Delegates event to a selector.
   *
   * @param {Element|String|Array} [elements]
   * @param {String} selector
   * @param {String} type
   * @param {Function} callback
   * @param {Boolean} useCapture
   * @return {Object}
   */
  function delegate(elements, selector, type, callback, useCapture) {
      // Handle the regular Element usage
      if (typeof elements.addEventListener === 'function') {
          return _delegate.apply(null, arguments);
      }

      // Handle Element-less usage, it defaults to global delegation
      if (typeof type === 'function') {
          // Use `document` as the first parameter, then apply arguments
          // This is a short way to .unshift `arguments` without running into deoptimizations
          return _delegate.bind(null, document).apply(null, arguments);
      }

      // Handle Selector-based usage
      if (typeof elements === 'string') {
          elements = document.querySelectorAll(elements);
      }

      // Handle Array-like based usage
      return Array.prototype.map.call(elements, function (element) {
          return _delegate(element, selector, type, callback, useCapture);
      });
  }

  /**
   * Finds closest match and invokes callback.
   *
   * @param {Element} element
   * @param {String} selector
   * @param {String} type
   * @param {Function} callback
   * @return {Function}
   */
  function listener(element, selector, type, callback) {
      return function(e) {
          e.delegateTarget = closest_1(e.target, selector);

          if (e.delegateTarget) {
              callback.call(element, e);
          }
      }
  }

  var delegate_1 = delegate;

  const preserveCamelCase = string => {
  	let isLastCharLower = false;
  	let isLastCharUpper = false;
  	let isLastLastCharUpper = false;

  	for (let i = 0; i < string.length; i++) {
  		const character = string[i];

  		if (isLastCharLower && /[a-zA-Z]/.test(character) && character.toUpperCase() === character) {
  			string = string.slice(0, i) + '-' + string.slice(i);
  			isLastCharLower = false;
  			isLastLastCharUpper = isLastCharUpper;
  			isLastCharUpper = true;
  			i++;
  		} else if (isLastCharUpper && isLastLastCharUpper && /[a-zA-Z]/.test(character) && character.toLowerCase() === character) {
  			string = string.slice(0, i - 1) + '-' + string.slice(i - 1);
  			isLastLastCharUpper = isLastCharUpper;
  			isLastCharUpper = false;
  			isLastCharLower = true;
  		} else {
  			isLastCharLower = character.toLowerCase() === character && character.toUpperCase() !== character;
  			isLastLastCharUpper = isLastCharUpper;
  			isLastCharUpper = character.toUpperCase() === character && character.toLowerCase() !== character;
  		}
  	}

  	return string;
  };

  const camelCase = (input, options) => {
  	if (!(typeof input === 'string' || Array.isArray(input))) {
  		throw new TypeError('Expected the input to be `string | string[]`');
  	}

  	options = Object.assign({
  		pascalCase: false
  	}, options);

  	const postProcess = x => options.pascalCase ? x.charAt(0).toUpperCase() + x.slice(1) : x;

  	if (Array.isArray(input)) {
  		input = input.map(x => x.trim())
  			.filter(x => x.length)
  			.join('-');
  	} else {
  		input = input.trim();
  	}

  	if (input.length === 0) {
  		return '';
  	}

  	if (input.length === 1) {
  		return options.pascalCase ? input.toUpperCase() : input.toLowerCase();
  	}

  	const hasUpperCase = input !== input.toLowerCase();

  	if (hasUpperCase) {
  		input = preserveCamelCase(input);
  	}

  	input = input
  		.replace(/^[_.\- ]+/, '')
  		.toLowerCase()
  		.replace(/[_.\- ]+(\w|$)/g, (_, p1) => p1.toUpperCase())
  		.replace(/\d+(\w|$)/g, m => m.toUpperCase());

  	return postProcess(input);
  };

  var camelcase = camelCase;
  // TODO: Remove this for the next major release
  var default_1 = camelCase;
  camelcase.default = default_1;

  /*!
   * dashify <https://github.com/jonschlinkert/dashify>
   *
   * Copyright (c) 2015-2017, Jon Schlinkert.
   * Released under the MIT License.
   */

  var dashify = (str, options) => {
    if (typeof str !== 'string') throw new TypeError('expected a string');
    return str.trim()
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/\W/g, m => /[À-ž]/.test(m) ? m : '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, m => options && options.condense ? '-' : m)
      .toLowerCase();
  };

  var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

  function createCommonjsModule(fn, module) {
  	return module = { exports: {} }, fn(module, module.exports), module.exports;
  }

  var animatedScrollTo = createCommonjsModule(function (module, exports) {
  (function() {

    // desiredOffset - page offset to scroll to
    // speed - duration of the scroll per 1000px
    function __ANIMATE_SCROLL_TO(desiredOffset) {
      var userOptions = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

      var options = {
        speed: 500,
        minDuration: 250,
        maxDuration: 1500,
        cancelOnUserAction: true,
        element: window,
        horizontal: false,
        onComplete: undefined,
        passive: true,
        offset: 0
      };

      var optionsKeys = Object.keys(options);

      // Override default options
      for (var i = 0; i < optionsKeys.length; i++) {
        var key = optionsKeys[i];

        if (typeof userOptions[key] !== 'undefined') {
          options[key] = userOptions[key];
        }
      }

      if (!options.cancelOnUserAction && options.passive) {
        options.passive = false;
        if (userOptions.passive) {
          console && console.warn(
            'animated-scroll-to:\n "passive" was set to "false" to prevent errors, ' +
            'as using "cancelOnUserAction: false" doesn\'t work with passive events.');
        }
      }

      if (desiredOffset instanceof HTMLElement) {
        if (userOptions.element && userOptions.element instanceof HTMLElement) {
          if (options.horizontal) {
            desiredOffset = (desiredOffset.getBoundingClientRect().left + userOptions.element.scrollLeft)
              - userOptions.element.getBoundingClientRect().left;
          } else {
            desiredOffset = (desiredOffset.getBoundingClientRect().top + userOptions.element.scrollTop)
              - userOptions.element.getBoundingClientRect().top;
          }
        } else if (options.horizontal) {
          var scrollLeft = window.scrollX || document.documentElement.scrollLeft;
          desiredOffset = scrollLeft + desiredOffset.getBoundingClientRect().left;
        } else {
          var scrollTop = window.scrollY || document.documentElement.scrollTop;
          desiredOffset = scrollTop + desiredOffset.getBoundingClientRect().top;
        }
      }

      // Add additonal user offset
      desiredOffset += options.offset;

      options.isWindow = options.element === window;

      var initialScrollPosition = null;
      var initialAxisScollPosition = 0;
      var maxScroll = null;

      if (options.isWindow) {
        if (options.horizontal) {
          // get cross browser scroll positions
          initialScrollPosition = window.scrollX || document.documentElement.scrollLeft;
          initialAxisScollPosition = window.scrollY || document.documentElement.scrollTop;
          // cross browser document height minus window height
          maxScroll = Math.max(
            document.body.scrollWidth, document.documentElement.scrollWidth,
            document.body.offsetWidth, document.documentElement.offsetWidth,
            document.body.clientWidth, document.documentElement.clientWidth
          ) - window.innerWidth;
        } else {
          // get cross browser scroll positions
          initialScrollPosition = window.scrollY || document.documentElement.scrollTop;
          initialAxisScollPosition = window.scrollX || document.documentElement.scrollLeft;
          // cross browser document width minus window width
          maxScroll = Math.max(
            document.body.scrollHeight, document.documentElement.scrollHeight,
            document.body.offsetHeight, document.documentElement.offsetHeight,
            document.body.clientHeight, document.documentElement.clientHeight
          ) - window.innerHeight;
        }
      } else {
        // DOM element
        if (options.horizontal) {
          initialScrollPosition = options.element.scrollLeft;
          maxScroll = options.element.scrollWidth - options.element.clientWidth;
        } else {
          initialScrollPosition = options.element.scrollTop;
          maxScroll = options.element.scrollHeight - options.element.clientHeight;
        }
      }

      // If the scroll position is greater than maximum available scroll
      if (desiredOffset > maxScroll) {
        desiredOffset = maxScroll;
      }

      // Calculate diff to scroll
      var diff = desiredOffset - initialScrollPosition;

      // Do nothing if the page is already there
      if (diff === 0) {
        // Execute callback if there is any
        if (options.onComplete && typeof options.onComplete === 'function') {
          options.onComplete();
        }

        return;
      }

      // Calculate duration of the scroll
      var duration = Math.abs(Math.round((diff / 1000) * options.speed));

      // Set minimum and maximum duration
      if (duration < options.minDuration) {
        duration = options.minDuration;
      } else if (duration > options.maxDuration) {
        duration = options.maxDuration;
      }

      var startingTime = Date.now();

      // Request animation frame ID
      var requestID = null;

      // Method handler
      var handleUserEvent = null;
      var userEventOptions = { passive: options.passive };

      if (options.cancelOnUserAction) {
        // Set handler to cancel scroll on user action
        handleUserEvent = function() {
          removeListeners();
          cancelAnimationFrame(requestID);
        };
        window.addEventListener('keydown', handleUserEvent, userEventOptions);
        window.addEventListener('mousedown', handleUserEvent, userEventOptions);
      } else {
        // Set handler to prevent user actions while scroll is active
        handleUserEvent = function(e) { e.preventDefault(); };
        window.addEventListener('scroll', handleUserEvent, userEventOptions);
      }

      window.addEventListener('wheel', handleUserEvent, userEventOptions);
      window.addEventListener('touchstart', handleUserEvent, userEventOptions);

      var removeListeners = function () {
        window.removeEventListener('wheel', handleUserEvent, userEventOptions);
        window.removeEventListener('touchstart', handleUserEvent, userEventOptions);

        if (options.cancelOnUserAction) {
          window.removeEventListener('keydown', handleUserEvent, userEventOptions);
          window.removeEventListener('mousedown', handleUserEvent, userEventOptions);
        } else {
          window.removeEventListener('scroll', handleUserEvent, userEventOptions);
        }
      };

      var step = function () {
        var timeDiff = Date.now() - startingTime;
        var t = (timeDiff / duration) - 1;
        var easing = t * t * t + 1;
        var scrollPosition = Math.round(initialScrollPosition + (diff * easing));

        var doScroll = function(position) {
          if (options.isWindow) {
            if (options.horizontal) {
              options.element.scrollTo(position, initialAxisScollPosition);
            } else {
              options.element.scrollTo(initialAxisScollPosition, position);
            }
          } else if (options.horizontal) {
            options.element.scrollLeft = position;
          } else {
            options.element.scrollTop = position;
          }
        };

        if (timeDiff < duration && scrollPosition !== desiredOffset) {
          // If scroll didn't reach desired offset or time is not elapsed
          // Scroll to a new position
          // And request a new step
          doScroll(scrollPosition);

          requestID = requestAnimationFrame(step);
        } else {
          // If the time elapsed or we reached the desired offset
          // Set scroll to the desired offset (when rounding made it to be off a pixel or two)
          // Clear animation frame to be sure
          doScroll(desiredOffset);

          cancelAnimationFrame(requestID);

          // Remove listeners
          removeListeners();

          // Animation is complete, execute callback if there is any
          if (options.onComplete && typeof options.onComplete === 'function') {
            options.onComplete();
          }
        }
      };

      // Start animating scroll
      requestID = requestAnimationFrame(step);
    }

    {
      if (module.exports) {
        module.exports = __ANIMATE_SCROLL_TO;
        exports = module.exports;
      }
      exports.default = __ANIMATE_SCROLL_TO;
    }
  }).call(commonjsGlobal);
  });

  /**
   * https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollY#Notes
   */
  // const SUPPORT_PAGE_OFFSET = window.pageXOffset !== undefined

  var IS_CSS1_COMPAT = (document.compatMode || '') === 'CSS1Compat';

  var PURE_HASH_URL_RE = /^#/;
  var HASH_CAPTURE_RE = /#([^#]+)$/;
  var TRAILING_SLASH_RE = /\/$/;
  var getBaseUrl = function getBaseUrl() {
    return window.location.origin + window.location.pathname + window.location.search;
  };
  var getUrlHash = function getUrlHash(url) {
    var match = url.match(HASH_CAPTURE_RE);
    return match ? match[1] : null;
  };
  var isPureHashUrl = function isPureHashUrl(url) {
    return PURE_HASH_URL_RE.test(url);
  };
  var getTargetElementGivenUrl = function getTargetElementGivenUrl(targetUrl) {
    var baseUrl = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : getBaseUrl();

    if (!targetUrl) {
      throw new Error('targetUrl is required');
    }

    if (!isPureHashUrl(targetUrl) && !targetUrl.startsWith(baseUrl.replace(TRAILING_SLASH_RE, ''))) {
      return null;
    }

    var targetId = getUrlHash(targetUrl);
    return targetId ? document.getElementById(targetId) : null;
  };

  var attributeSelector = function attributeSelector(attributeName, attributeValue) {
    return attributeName && attributeValue ? "[".concat(attributeName, "=\"").concat(attributeValue, "\"]") : "[".concat(attributeName, "]");
  };

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  function _defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }

  function _createClass(Constructor, protoProps, staticProps) {
    if (protoProps) _defineProperties(Constructor.prototype, protoProps);
    if (staticProps) _defineProperties(Constructor, staticProps);
    return Constructor;
  }

  function _defineProperty(obj, key, value) {
    if (key in obj) {
      Object.defineProperty(obj, key, {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    } else {
      obj[key] = value;
    }

    return obj;
  }

  function _objectSpread(target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i] != null ? arguments[i] : {};
      var ownKeys = Object.keys(source);

      if (typeof Object.getOwnPropertySymbols === 'function') {
        ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) {
          return Object.getOwnPropertyDescriptor(source, sym).enumerable;
        }));
      }

      ownKeys.forEach(function (key) {
        _defineProperty(target, key, source[key]);
      });
    }

    return target;
  }

  function _inherits(subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
      throw new TypeError("Super expression must either be null or a function");
    }

    subClass.prototype = Object.create(superClass && superClass.prototype, {
      constructor: {
        value: subClass,
        writable: true,
        configurable: true
      }
    });
    if (superClass) _setPrototypeOf(subClass, superClass);
  }

  function _getPrototypeOf(o) {
    _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) {
      return o.__proto__ || Object.getPrototypeOf(o);
    };
    return _getPrototypeOf(o);
  }

  function _setPrototypeOf(o, p) {
    _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) {
      o.__proto__ = p;
      return o;
    };

    return _setPrototypeOf(o, p);
  }

  function _assertThisInitialized(self) {
    if (self === void 0) {
      throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
    }

    return self;
  }

  function _possibleConstructorReturn(self, call) {
    if (call && (typeof call === "object" || typeof call === "function")) {
      return call;
    }

    return _assertThisInitialized(self);
  }

  function _toConsumableArray(arr) {
    return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _nonIterableSpread();
  }

  function _arrayWithoutHoles(arr) {
    if (Array.isArray(arr)) {
      for (var i = 0, arr2 = new Array(arr.length); i < arr.length; i++) arr2[i] = arr[i];

      return arr2;
    }
  }

  function _iterableToArray(iter) {
    if (Symbol.iterator in Object(iter) || Object.prototype.toString.call(iter) === "[object Arguments]") return Array.from(iter);
  }

  function _nonIterableSpread() {
    throw new TypeError("Invalid attempt to spread non-iterable instance");
  }

  /**
   * Element#closest
   */

  polyfill(window);
  /**
   * Element.prototype.matches
   */

  if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.matchesSelector || Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
  }
  /**
   * ChildNode#remove()
   * https://developer.mozilla.org/en-US/docs/Web/API/ChildNode/remove#Polyfill
   */
  // from:https://github.com/jserz/js_piece/blob/master/DOM/ChildNode/remove()/remove().md


  (function (arr) {
    arr.forEach(function (item) {
      if (item.hasOwnProperty('remove')) {
        return;
      }

      Object.defineProperty(item, 'remove', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: function remove() {
          if (this.parentNode !== null) this.parentNode.removeChild(this);
        }
      });
    });
  })([Element.prototype, CharacterData.prototype, DocumentType.prototype]);

  var domain$1;

  // This constructor is used to store event handlers. Instantiating this is
  // faster than explicitly calling `Object.create(null)` to get a "clean" empty
  // object (tested with v8 v4.9).
  function EventHandlers$1() {}
  EventHandlers$1.prototype = Object.create(null);

  function EventEmitter$1() {
    EventEmitter$1.init.call(this);
  }

  // nodejs oddity
  // require('events') === require('events').EventEmitter
  EventEmitter$1.EventEmitter = EventEmitter$1;

  EventEmitter$1.usingDomains = false;

  EventEmitter$1.prototype.domain = undefined;
  EventEmitter$1.prototype._events = undefined;
  EventEmitter$1.prototype._maxListeners = undefined;

  // By default EventEmitters will print a warning if more than 10 listeners are
  // added to it. This is a useful default which helps finding memory leaks.
  EventEmitter$1.defaultMaxListeners = 10;

  EventEmitter$1.init = function() {
    this.domain = null;
    if (EventEmitter$1.usingDomains) {
      // if there is an active domain, then attach to it.
      if (domain$1.active && !(this instanceof domain$1.Domain)) ;
    }

    if (!this._events || this._events === Object.getPrototypeOf(this)._events) {
      this._events = new EventHandlers$1();
      this._eventsCount = 0;
    }

    this._maxListeners = this._maxListeners || undefined;
  };

  // Obviously not all Emitters should be limited to 10. This function allows
  // that to be increased. Set to zero for unlimited.
  EventEmitter$1.prototype.setMaxListeners = function setMaxListeners(n) {
    if (typeof n !== 'number' || n < 0 || isNaN(n))
      throw new TypeError('"n" argument must be a positive number');
    this._maxListeners = n;
    return this;
  };

  function $getMaxListeners$1(that) {
    if (that._maxListeners === undefined)
      return EventEmitter$1.defaultMaxListeners;
    return that._maxListeners;
  }

  EventEmitter$1.prototype.getMaxListeners = function getMaxListeners() {
    return $getMaxListeners$1(this);
  };

  // These standalone emit* functions are used to optimize calling of event
  // handlers for fast cases because emit() itself often has a variable number of
  // arguments and can be deoptimized because of that. These functions always have
  // the same number of arguments and thus do not get deoptimized, so the code
  // inside them can execute faster.
  function emitNone$1(handler, isFn, self) {
    if (isFn)
      handler.call(self);
    else {
      var len = handler.length;
      var listeners = arrayClone$1(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].call(self);
    }
  }
  function emitOne$1(handler, isFn, self, arg1) {
    if (isFn)
      handler.call(self, arg1);
    else {
      var len = handler.length;
      var listeners = arrayClone$1(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].call(self, arg1);
    }
  }
  function emitTwo$1(handler, isFn, self, arg1, arg2) {
    if (isFn)
      handler.call(self, arg1, arg2);
    else {
      var len = handler.length;
      var listeners = arrayClone$1(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].call(self, arg1, arg2);
    }
  }
  function emitThree$1(handler, isFn, self, arg1, arg2, arg3) {
    if (isFn)
      handler.call(self, arg1, arg2, arg3);
    else {
      var len = handler.length;
      var listeners = arrayClone$1(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].call(self, arg1, arg2, arg3);
    }
  }

  function emitMany$1(handler, isFn, self, args) {
    if (isFn)
      handler.apply(self, args);
    else {
      var len = handler.length;
      var listeners = arrayClone$1(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].apply(self, args);
    }
  }

  EventEmitter$1.prototype.emit = function emit(type) {
    var er, handler, len, args, i, events, domain;
    var doError = (type === 'error');

    events = this._events;
    if (events)
      doError = (doError && events.error == null);
    else if (!doError)
      return false;

    domain = this.domain;

    // If there is no 'error' event listener then throw.
    if (doError) {
      er = arguments[1];
      if (domain) {
        if (!er)
          er = new Error('Uncaught, unspecified "error" event');
        er.domainEmitter = this;
        er.domain = domain;
        er.domainThrown = false;
        domain.emit('error', er);
      } else if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        // At least give some kind of context to the user
        var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
        err.context = er;
        throw err;
      }
      return false;
    }

    handler = events[type];

    if (!handler)
      return false;

    var isFn = typeof handler === 'function';
    len = arguments.length;
    switch (len) {
      // fast cases
      case 1:
        emitNone$1(handler, isFn, this);
        break;
      case 2:
        emitOne$1(handler, isFn, this, arguments[1]);
        break;
      case 3:
        emitTwo$1(handler, isFn, this, arguments[1], arguments[2]);
        break;
      case 4:
        emitThree$1(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
        break;
      // slower
      default:
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        emitMany$1(handler, isFn, this, args);
    }

    return true;
  };

  function _addListener$1(target, type, listener, prepend) {
    var m;
    var events;
    var existing;

    if (typeof listener !== 'function')
      throw new TypeError('"listener" argument must be a function');

    events = target._events;
    if (!events) {
      events = target._events = new EventHandlers$1();
      target._eventsCount = 0;
    } else {
      // To avoid recursion in the case that type === "newListener"! Before
      // adding it to the listeners, first emit "newListener".
      if (events.newListener) {
        target.emit('newListener', type,
                    listener.listener ? listener.listener : listener);

        // Re-assign `events` because a newListener handler could have caused the
        // this._events to be assigned to a new object
        events = target._events;
      }
      existing = events[type];
    }

    if (!existing) {
      // Optimize the case of one listener. Don't need the extra array object.
      existing = events[type] = listener;
      ++target._eventsCount;
    } else {
      if (typeof existing === 'function') {
        // Adding the second element, need to change to array.
        existing = events[type] = prepend ? [listener, existing] :
                                            [existing, listener];
      } else {
        // If we've already got an array, just append.
        if (prepend) {
          existing.unshift(listener);
        } else {
          existing.push(listener);
        }
      }

      // Check for listener leak
      if (!existing.warned) {
        m = $getMaxListeners$1(target);
        if (m && m > 0 && existing.length > m) {
          existing.warned = true;
          var w = new Error('Possible EventEmitter memory leak detected. ' +
                              existing.length + ' ' + type + ' listeners added. ' +
                              'Use emitter.setMaxListeners() to increase limit');
          w.name = 'MaxListenersExceededWarning';
          w.emitter = target;
          w.type = type;
          w.count = existing.length;
          emitWarning$1(w);
        }
      }
    }

    return target;
  }
  function emitWarning$1(e) {
    typeof console.warn === 'function' ? console.warn(e) : console.log(e);
  }
  EventEmitter$1.prototype.addListener = function addListener(type, listener) {
    return _addListener$1(this, type, listener, false);
  };

  EventEmitter$1.prototype.on = EventEmitter$1.prototype.addListener;

  EventEmitter$1.prototype.prependListener =
      function prependListener(type, listener) {
        return _addListener$1(this, type, listener, true);
      };

  function _onceWrap$1(target, type, listener) {
    var fired = false;
    function g() {
      target.removeListener(type, g);
      if (!fired) {
        fired = true;
        listener.apply(target, arguments);
      }
    }
    g.listener = listener;
    return g;
  }

  EventEmitter$1.prototype.once = function once(type, listener) {
    if (typeof listener !== 'function')
      throw new TypeError('"listener" argument must be a function');
    this.on(type, _onceWrap$1(this, type, listener));
    return this;
  };

  EventEmitter$1.prototype.prependOnceListener =
      function prependOnceListener(type, listener) {
        if (typeof listener !== 'function')
          throw new TypeError('"listener" argument must be a function');
        this.prependListener(type, _onceWrap$1(this, type, listener));
        return this;
      };

  // emits a 'removeListener' event iff the listener was removed
  EventEmitter$1.prototype.removeListener =
      function removeListener(type, listener) {
        var list, events, position, i, originalListener;

        if (typeof listener !== 'function')
          throw new TypeError('"listener" argument must be a function');

        events = this._events;
        if (!events)
          return this;

        list = events[type];
        if (!list)
          return this;

        if (list === listener || (list.listener && list.listener === listener)) {
          if (--this._eventsCount === 0)
            this._events = new EventHandlers$1();
          else {
            delete events[type];
            if (events.removeListener)
              this.emit('removeListener', type, list.listener || listener);
          }
        } else if (typeof list !== 'function') {
          position = -1;

          for (i = list.length; i-- > 0;) {
            if (list[i] === listener ||
                (list[i].listener && list[i].listener === listener)) {
              originalListener = list[i].listener;
              position = i;
              break;
            }
          }

          if (position < 0)
            return this;

          if (list.length === 1) {
            list[0] = undefined;
            if (--this._eventsCount === 0) {
              this._events = new EventHandlers$1();
              return this;
            } else {
              delete events[type];
            }
          } else {
            spliceOne$1(list, position);
          }

          if (events.removeListener)
            this.emit('removeListener', type, originalListener || listener);
        }

        return this;
      };

  EventEmitter$1.prototype.removeAllListeners =
      function removeAllListeners(type) {
        var listeners, events;

        events = this._events;
        if (!events)
          return this;

        // not listening for removeListener, no need to emit
        if (!events.removeListener) {
          if (arguments.length === 0) {
            this._events = new EventHandlers$1();
            this._eventsCount = 0;
          } else if (events[type]) {
            if (--this._eventsCount === 0)
              this._events = new EventHandlers$1();
            else
              delete events[type];
          }
          return this;
        }

        // emit removeListener for all listeners on all events
        if (arguments.length === 0) {
          var keys = Object.keys(events);
          for (var i = 0, key; i < keys.length; ++i) {
            key = keys[i];
            if (key === 'removeListener') continue;
            this.removeAllListeners(key);
          }
          this.removeAllListeners('removeListener');
          this._events = new EventHandlers$1();
          this._eventsCount = 0;
          return this;
        }

        listeners = events[type];

        if (typeof listeners === 'function') {
          this.removeListener(type, listeners);
        } else if (listeners) {
          // LIFO order
          do {
            this.removeListener(type, listeners[listeners.length - 1]);
          } while (listeners[0]);
        }

        return this;
      };

  EventEmitter$1.prototype.listeners = function listeners(type) {
    var evlistener;
    var ret;
    var events = this._events;

    if (!events)
      ret = [];
    else {
      evlistener = events[type];
      if (!evlistener)
        ret = [];
      else if (typeof evlistener === 'function')
        ret = [evlistener.listener || evlistener];
      else
        ret = unwrapListeners$1(evlistener);
    }

    return ret;
  };

  EventEmitter$1.listenerCount = function(emitter, type) {
    if (typeof emitter.listenerCount === 'function') {
      return emitter.listenerCount(type);
    } else {
      return listenerCount$1.call(emitter, type);
    }
  };

  EventEmitter$1.prototype.listenerCount = listenerCount$1;
  function listenerCount$1(type) {
    var events = this._events;

    if (events) {
      var evlistener = events[type];

      if (typeof evlistener === 'function') {
        return 1;
      } else if (evlistener) {
        return evlistener.length;
      }
    }

    return 0;
  }

  EventEmitter$1.prototype.eventNames = function eventNames() {
    return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
  };

  // About 1.5x faster than the two-arg version of Array#splice().
  function spliceOne$1(list, index) {
    for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
      list[i] = list[k];
    list.pop();
  }

  function arrayClone$1(arr, i) {
    var copy = new Array(i);
    while (i--)
      copy[i] = arr[i];
    return copy;
  }

  function unwrapListeners$1(arr) {
    var ret = new Array(arr.length);
    for (var i = 0; i < ret.length; ++i) {
      ret[i] = arr[i].listener || arr[i];
    }
    return ret;
  }

  /**
   * Initializes hash navigation tracking
   */

  var initializeHashNavigationTracking = function initializeHashNavigationTracking(system, rootElement) {
    delegate_1(rootElement, 'a', 'click', function (e) {
      var targetUrl = e.delegateTarget.getAttribute('href');
      var handled = system.navHandleNavigation(targetUrl);

      if (handled) {
        e.preventDefault();
        system.navHistoryPushState(targetUrl);
      }
    });
    window.addEventListener('popstate', function () {
      system.navHandleNavigation(window.location.href);
    });
    system.navHandleNavigation(window.location.href);
  };

  var global$1 = (typeof global !== "undefined" ? global :
              typeof self !== "undefined" ? self :
              typeof window !== "undefined" ? window : {});
  if (typeof global$1.setTimeout === 'function') ;
  if (typeof global$1.clearTimeout === 'function') ;

  // from https://github.com/kumavis/browser-process-hrtime/blob/master/index.js
  var performance = global$1.performance || {};
  var performanceNow =
    performance.now        ||
    performance.mozNow     ||
    performance.msNow      ||
    performance.oNow       ||
    performance.webkitNow  ||
    function(){ return (new Date()).getTime() };

  function unwrapExports (x) {
  	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
  }

  function createCommonjsModule$1(fn, module) {
  	return module = { exports: {} }, fn(module, module.exports), module.exports;
  }

  var reactIs_production_min = createCommonjsModule$1(function (module, exports) {
  Object.defineProperty(exports,"__esModule",{value:!0});
  var b="function"===typeof Symbol&&Symbol.for,c=b?Symbol.for("react.element"):60103,d=b?Symbol.for("react.portal"):60106,e=b?Symbol.for("react.fragment"):60107,f=b?Symbol.for("react.strict_mode"):60108,g=b?Symbol.for("react.profiler"):60114,h=b?Symbol.for("react.provider"):60109,k=b?Symbol.for("react.context"):60110,l=b?Symbol.for("react.async_mode"):60111,m=b?Symbol.for("react.concurrent_mode"):60111,n=b?Symbol.for("react.forward_ref"):60112,p=b?Symbol.for("react.suspense"):60113,q=b?Symbol.for("react.memo"):
  60115,r=b?Symbol.for("react.lazy"):60116;function t(a){if("object"===typeof a&&null!==a){var u=a.$$typeof;switch(u){case c:switch(a=a.type,a){case l:case m:case e:case g:case f:case p:return a;default:switch(a=a&&a.$$typeof,a){case k:case n:case h:return a;default:return u}}case r:case q:case d:return u}}}function v(a){return t(a)===m}exports.typeOf=t;exports.AsyncMode=l;exports.ConcurrentMode=m;exports.ContextConsumer=k;exports.ContextProvider=h;exports.Element=c;exports.ForwardRef=n;
  exports.Fragment=e;exports.Lazy=r;exports.Memo=q;exports.Portal=d;exports.Profiler=g;exports.StrictMode=f;exports.Suspense=p;exports.isValidElementType=function(a){return "string"===typeof a||"function"===typeof a||a===e||a===m||a===g||a===f||a===p||"object"===typeof a&&null!==a&&(a.$$typeof===r||a.$$typeof===q||a.$$typeof===h||a.$$typeof===k||a.$$typeof===n)};exports.isAsyncMode=function(a){return v(a)||t(a)===l};exports.isConcurrentMode=v;exports.isContextConsumer=function(a){return t(a)===k};
  exports.isContextProvider=function(a){return t(a)===h};exports.isElement=function(a){return "object"===typeof a&&null!==a&&a.$$typeof===c};exports.isForwardRef=function(a){return t(a)===n};exports.isFragment=function(a){return t(a)===e};exports.isLazy=function(a){return t(a)===r};exports.isMemo=function(a){return t(a)===q};exports.isPortal=function(a){return t(a)===d};exports.isProfiler=function(a){return t(a)===g};exports.isStrictMode=function(a){return t(a)===f};
  exports.isSuspense=function(a){return t(a)===p};
  });

  unwrapExports(reactIs_production_min);
  var reactIs_production_min_1 = reactIs_production_min.typeOf;
  var reactIs_production_min_2 = reactIs_production_min.AsyncMode;
  var reactIs_production_min_3 = reactIs_production_min.ConcurrentMode;
  var reactIs_production_min_4 = reactIs_production_min.ContextConsumer;
  var reactIs_production_min_5 = reactIs_production_min.ContextProvider;
  var reactIs_production_min_6 = reactIs_production_min.Element;
  var reactIs_production_min_7 = reactIs_production_min.ForwardRef;
  var reactIs_production_min_8 = reactIs_production_min.Fragment;
  var reactIs_production_min_9 = reactIs_production_min.Lazy;
  var reactIs_production_min_10 = reactIs_production_min.Memo;
  var reactIs_production_min_11 = reactIs_production_min.Portal;
  var reactIs_production_min_12 = reactIs_production_min.Profiler;
  var reactIs_production_min_13 = reactIs_production_min.StrictMode;
  var reactIs_production_min_14 = reactIs_production_min.Suspense;
  var reactIs_production_min_15 = reactIs_production_min.isValidElementType;
  var reactIs_production_min_16 = reactIs_production_min.isAsyncMode;
  var reactIs_production_min_17 = reactIs_production_min.isConcurrentMode;
  var reactIs_production_min_18 = reactIs_production_min.isContextConsumer;
  var reactIs_production_min_19 = reactIs_production_min.isContextProvider;
  var reactIs_production_min_20 = reactIs_production_min.isElement;
  var reactIs_production_min_21 = reactIs_production_min.isForwardRef;
  var reactIs_production_min_22 = reactIs_production_min.isFragment;
  var reactIs_production_min_23 = reactIs_production_min.isLazy;
  var reactIs_production_min_24 = reactIs_production_min.isMemo;
  var reactIs_production_min_25 = reactIs_production_min.isPortal;
  var reactIs_production_min_26 = reactIs_production_min.isProfiler;
  var reactIs_production_min_27 = reactIs_production_min.isStrictMode;
  var reactIs_production_min_28 = reactIs_production_min.isSuspense;

  var reactIs_development = createCommonjsModule$1(function (module, exports) {



  {
    (function() {

  Object.defineProperty(exports, '__esModule', { value: true });

  // The Symbol used to tag the ReactElement-like types. If there is no native Symbol
  // nor polyfill, then a plain number is used for performance.
  var hasSymbol = typeof Symbol === 'function' && Symbol.for;

  var REACT_ELEMENT_TYPE = hasSymbol ? Symbol.for('react.element') : 0xeac7;
  var REACT_PORTAL_TYPE = hasSymbol ? Symbol.for('react.portal') : 0xeaca;
  var REACT_FRAGMENT_TYPE = hasSymbol ? Symbol.for('react.fragment') : 0xeacb;
  var REACT_STRICT_MODE_TYPE = hasSymbol ? Symbol.for('react.strict_mode') : 0xeacc;
  var REACT_PROFILER_TYPE = hasSymbol ? Symbol.for('react.profiler') : 0xead2;
  var REACT_PROVIDER_TYPE = hasSymbol ? Symbol.for('react.provider') : 0xeacd;
  var REACT_CONTEXT_TYPE = hasSymbol ? Symbol.for('react.context') : 0xeace;
  var REACT_ASYNC_MODE_TYPE = hasSymbol ? Symbol.for('react.async_mode') : 0xeacf;
  var REACT_CONCURRENT_MODE_TYPE = hasSymbol ? Symbol.for('react.concurrent_mode') : 0xeacf;
  var REACT_FORWARD_REF_TYPE = hasSymbol ? Symbol.for('react.forward_ref') : 0xead0;
  var REACT_SUSPENSE_TYPE = hasSymbol ? Symbol.for('react.suspense') : 0xead1;
  var REACT_MEMO_TYPE = hasSymbol ? Symbol.for('react.memo') : 0xead3;
  var REACT_LAZY_TYPE = hasSymbol ? Symbol.for('react.lazy') : 0xead4;

  function isValidElementType(type) {
    return typeof type === 'string' || typeof type === 'function' ||
    // Note: its typeof might be other than 'symbol' or 'number' if it's a polyfill.
    type === REACT_FRAGMENT_TYPE || type === REACT_CONCURRENT_MODE_TYPE || type === REACT_PROFILER_TYPE || type === REACT_STRICT_MODE_TYPE || type === REACT_SUSPENSE_TYPE || typeof type === 'object' && type !== null && (type.$$typeof === REACT_LAZY_TYPE || type.$$typeof === REACT_MEMO_TYPE || type.$$typeof === REACT_PROVIDER_TYPE || type.$$typeof === REACT_CONTEXT_TYPE || type.$$typeof === REACT_FORWARD_REF_TYPE);
  }

  /**
   * Forked from fbjs/warning:
   * https://github.com/facebook/fbjs/blob/e66ba20ad5be433eb54423f2b097d829324d9de6/packages/fbjs/src/__forks__/warning.js
   *
   * Only change is we use console.warn instead of console.error,
   * and do nothing when 'console' is not supported.
   * This really simplifies the code.
   * ---
   * Similar to invariant but only logs a warning if the condition is not met.
   * This can be used to log issues in development environments in critical
   * paths. Removing the logging code for production environments will keep the
   * same logic and follow the same code paths.
   */

  var lowPriorityWarning = function () {};

  {
    var printWarning = function (format) {
      for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        args[_key - 1] = arguments[_key];
      }

      var argIndex = 0;
      var message = 'Warning: ' + format.replace(/%s/g, function () {
        return args[argIndex++];
      });
      if (typeof console !== 'undefined') {
        console.warn(message);
      }
      try {
        // --- Welcome to debugging React ---
        // This error was thrown as a convenience so that you can use this stack
        // to find the callsite that caused this warning to fire.
        throw new Error(message);
      } catch (x) {}
    };

    lowPriorityWarning = function (condition, format) {
      if (format === undefined) {
        throw new Error('`lowPriorityWarning(condition, format, ...args)` requires a warning ' + 'message argument');
      }
      if (!condition) {
        for (var _len2 = arguments.length, args = Array(_len2 > 2 ? _len2 - 2 : 0), _key2 = 2; _key2 < _len2; _key2++) {
          args[_key2 - 2] = arguments[_key2];
        }

        printWarning.apply(undefined, [format].concat(args));
      }
    };
  }

  var lowPriorityWarning$1 = lowPriorityWarning;

  function typeOf(object) {
    if (typeof object === 'object' && object !== null) {
      var $$typeof = object.$$typeof;
      switch ($$typeof) {
        case REACT_ELEMENT_TYPE:
          var type = object.type;

          switch (type) {
            case REACT_ASYNC_MODE_TYPE:
            case REACT_CONCURRENT_MODE_TYPE:
            case REACT_FRAGMENT_TYPE:
            case REACT_PROFILER_TYPE:
            case REACT_STRICT_MODE_TYPE:
            case REACT_SUSPENSE_TYPE:
              return type;
            default:
              var $$typeofType = type && type.$$typeof;

              switch ($$typeofType) {
                case REACT_CONTEXT_TYPE:
                case REACT_FORWARD_REF_TYPE:
                case REACT_PROVIDER_TYPE:
                  return $$typeofType;
                default:
                  return $$typeof;
              }
          }
        case REACT_LAZY_TYPE:
        case REACT_MEMO_TYPE:
        case REACT_PORTAL_TYPE:
          return $$typeof;
      }
    }

    return undefined;
  }

  // AsyncMode is deprecated along with isAsyncMode
  var AsyncMode = REACT_ASYNC_MODE_TYPE;
  var ConcurrentMode = REACT_CONCURRENT_MODE_TYPE;
  var ContextConsumer = REACT_CONTEXT_TYPE;
  var ContextProvider = REACT_PROVIDER_TYPE;
  var Element = REACT_ELEMENT_TYPE;
  var ForwardRef = REACT_FORWARD_REF_TYPE;
  var Fragment = REACT_FRAGMENT_TYPE;
  var Lazy = REACT_LAZY_TYPE;
  var Memo = REACT_MEMO_TYPE;
  var Portal = REACT_PORTAL_TYPE;
  var Profiler = REACT_PROFILER_TYPE;
  var StrictMode = REACT_STRICT_MODE_TYPE;
  var Suspense = REACT_SUSPENSE_TYPE;

  var hasWarnedAboutDeprecatedIsAsyncMode = false;

  // AsyncMode should be deprecated
  function isAsyncMode(object) {
    {
      if (!hasWarnedAboutDeprecatedIsAsyncMode) {
        hasWarnedAboutDeprecatedIsAsyncMode = true;
        lowPriorityWarning$1(false, 'The ReactIs.isAsyncMode() alias has been deprecated, ' + 'and will be removed in React 17+. Update your code to use ' + 'ReactIs.isConcurrentMode() instead. It has the exact same API.');
      }
    }
    return isConcurrentMode(object) || typeOf(object) === REACT_ASYNC_MODE_TYPE;
  }
  function isConcurrentMode(object) {
    return typeOf(object) === REACT_CONCURRENT_MODE_TYPE;
  }
  function isContextConsumer(object) {
    return typeOf(object) === REACT_CONTEXT_TYPE;
  }
  function isContextProvider(object) {
    return typeOf(object) === REACT_PROVIDER_TYPE;
  }
  function isElement(object) {
    return typeof object === 'object' && object !== null && object.$$typeof === REACT_ELEMENT_TYPE;
  }
  function isForwardRef(object) {
    return typeOf(object) === REACT_FORWARD_REF_TYPE;
  }
  function isFragment(object) {
    return typeOf(object) === REACT_FRAGMENT_TYPE;
  }
  function isLazy(object) {
    return typeOf(object) === REACT_LAZY_TYPE;
  }
  function isMemo(object) {
    return typeOf(object) === REACT_MEMO_TYPE;
  }
  function isPortal(object) {
    return typeOf(object) === REACT_PORTAL_TYPE;
  }
  function isProfiler(object) {
    return typeOf(object) === REACT_PROFILER_TYPE;
  }
  function isStrictMode(object) {
    return typeOf(object) === REACT_STRICT_MODE_TYPE;
  }
  function isSuspense(object) {
    return typeOf(object) === REACT_SUSPENSE_TYPE;
  }

  exports.typeOf = typeOf;
  exports.AsyncMode = AsyncMode;
  exports.ConcurrentMode = ConcurrentMode;
  exports.ContextConsumer = ContextConsumer;
  exports.ContextProvider = ContextProvider;
  exports.Element = Element;
  exports.ForwardRef = ForwardRef;
  exports.Fragment = Fragment;
  exports.Lazy = Lazy;
  exports.Memo = Memo;
  exports.Portal = Portal;
  exports.Profiler = Profiler;
  exports.StrictMode = StrictMode;
  exports.Suspense = Suspense;
  exports.isValidElementType = isValidElementType;
  exports.isAsyncMode = isAsyncMode;
  exports.isConcurrentMode = isConcurrentMode;
  exports.isContextConsumer = isContextConsumer;
  exports.isContextProvider = isContextProvider;
  exports.isElement = isElement;
  exports.isForwardRef = isForwardRef;
  exports.isFragment = isFragment;
  exports.isLazy = isLazy;
  exports.isMemo = isMemo;
  exports.isPortal = isPortal;
  exports.isProfiler = isProfiler;
  exports.isStrictMode = isStrictMode;
  exports.isSuspense = isSuspense;
    })();
  }
  });

  unwrapExports(reactIs_development);
  var reactIs_development_1 = reactIs_development.typeOf;
  var reactIs_development_2 = reactIs_development.AsyncMode;
  var reactIs_development_3 = reactIs_development.ConcurrentMode;
  var reactIs_development_4 = reactIs_development.ContextConsumer;
  var reactIs_development_5 = reactIs_development.ContextProvider;
  var reactIs_development_6 = reactIs_development.Element;
  var reactIs_development_7 = reactIs_development.ForwardRef;
  var reactIs_development_8 = reactIs_development.Fragment;
  var reactIs_development_9 = reactIs_development.Lazy;
  var reactIs_development_10 = reactIs_development.Memo;
  var reactIs_development_11 = reactIs_development.Portal;
  var reactIs_development_12 = reactIs_development.Profiler;
  var reactIs_development_13 = reactIs_development.StrictMode;
  var reactIs_development_14 = reactIs_development.Suspense;
  var reactIs_development_15 = reactIs_development.isValidElementType;
  var reactIs_development_16 = reactIs_development.isAsyncMode;
  var reactIs_development_17 = reactIs_development.isConcurrentMode;
  var reactIs_development_18 = reactIs_development.isContextConsumer;
  var reactIs_development_19 = reactIs_development.isContextProvider;
  var reactIs_development_20 = reactIs_development.isElement;
  var reactIs_development_21 = reactIs_development.isForwardRef;
  var reactIs_development_22 = reactIs_development.isFragment;
  var reactIs_development_23 = reactIs_development.isLazy;
  var reactIs_development_24 = reactIs_development.isMemo;
  var reactIs_development_25 = reactIs_development.isPortal;
  var reactIs_development_26 = reactIs_development.isProfiler;
  var reactIs_development_27 = reactIs_development.isStrictMode;
  var reactIs_development_28 = reactIs_development.isSuspense;

  var reactIs = createCommonjsModule$1(function (module) {

  {
    module.exports = reactIs_development;
  }
  });

  /*
  object-assign
  (c) Sindre Sorhus
  @license MIT
  */
  /* eslint-disable no-unused-vars */
  var getOwnPropertySymbols = Object.getOwnPropertySymbols;
  var hasOwnProperty = Object.prototype.hasOwnProperty;
  var propIsEnumerable = Object.prototype.propertyIsEnumerable;

  function toObject(val) {
  	if (val === null || val === undefined) {
  		throw new TypeError('Object.assign cannot be called with null or undefined');
  	}

  	return Object(val);
  }

  function shouldUseNative() {
  	try {
  		if (!Object.assign) {
  			return false;
  		}

  		// Detect buggy property enumeration order in older V8 versions.

  		// https://bugs.chromium.org/p/v8/issues/detail?id=4118
  		var test1 = new String('abc');  // eslint-disable-line no-new-wrappers
  		test1[5] = 'de';
  		if (Object.getOwnPropertyNames(test1)[0] === '5') {
  			return false;
  		}

  		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
  		var test2 = {};
  		for (var i = 0; i < 10; i++) {
  			test2['_' + String.fromCharCode(i)] = i;
  		}
  		var order2 = Object.getOwnPropertyNames(test2).map(function (n) {
  			return test2[n];
  		});
  		if (order2.join('') !== '0123456789') {
  			return false;
  		}

  		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
  		var test3 = {};
  		'abcdefghijklmnopqrst'.split('').forEach(function (letter) {
  			test3[letter] = letter;
  		});
  		if (Object.keys(Object.assign({}, test3)).join('') !==
  				'abcdefghijklmnopqrst') {
  			return false;
  		}

  		return true;
  	} catch (err) {
  		// We don't expect any of the above to throw, but better to be safe.
  		return false;
  	}
  }

  var objectAssign = shouldUseNative() ? Object.assign : function (target, source) {
  	var from;
  	var to = toObject(target);
  	var symbols;

  	for (var s = 1; s < arguments.length; s++) {
  		from = Object(arguments[s]);

  		for (var key in from) {
  			if (hasOwnProperty.call(from, key)) {
  				to[key] = from[key];
  			}
  		}

  		if (getOwnPropertySymbols) {
  			symbols = getOwnPropertySymbols(from);
  			for (var i = 0; i < symbols.length; i++) {
  				if (propIsEnumerable.call(from, symbols[i])) {
  					to[symbols[i]] = from[symbols[i]];
  				}
  			}
  		}
  	}

  	return to;
  };

  /**
   * Copyright (c) 2013-present, Facebook, Inc.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   */

  var ReactPropTypesSecret = 'SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED';

  var ReactPropTypesSecret_1 = ReactPropTypesSecret;

  var printWarning = function() {};

  {
    var ReactPropTypesSecret$1 = ReactPropTypesSecret_1;
    var loggedTypeFailures = {};
    var has = Function.call.bind(Object.prototype.hasOwnProperty);

    printWarning = function(text) {
      var message = 'Warning: ' + text;
      if (typeof console !== 'undefined') {
        console.error(message);
      }
      try {
        // --- Welcome to debugging React ---
        // This error was thrown as a convenience so that you can use this stack
        // to find the callsite that caused this warning to fire.
        throw new Error(message);
      } catch (x) {}
    };
  }

  /**
   * Assert that the values match with the type specs.
   * Error messages are memorized and will only be shown once.
   *
   * @param {object} typeSpecs Map of name to a ReactPropType
   * @param {object} values Runtime values that need to be type-checked
   * @param {string} location e.g. "prop", "context", "child context"
   * @param {string} componentName Name of the component for error messages.
   * @param {?Function} getStack Returns the component stack.
   * @private
   */
  function checkPropTypes(typeSpecs, values, location, componentName, getStack) {
    {
      for (var typeSpecName in typeSpecs) {
        if (has(typeSpecs, typeSpecName)) {
          var error;
          // Prop type validation may throw. In case they do, we don't want to
          // fail the render phase where it didn't fail before. So we log it.
          // After these have been cleaned up, we'll let them throw.
          try {
            // This is intentionally an invariant that gets caught. It's the same
            // behavior as without this statement except with a better message.
            if (typeof typeSpecs[typeSpecName] !== 'function') {
              var err = Error(
                (componentName || 'React class') + ': ' + location + ' type `' + typeSpecName + '` is invalid; ' +
                'it must be a function, usually from the `prop-types` package, but received `' + typeof typeSpecs[typeSpecName] + '`.'
              );
              err.name = 'Invariant Violation';
              throw err;
            }
            error = typeSpecs[typeSpecName](values, typeSpecName, componentName, location, null, ReactPropTypesSecret$1);
          } catch (ex) {
            error = ex;
          }
          if (error && !(error instanceof Error)) {
            printWarning(
              (componentName || 'React class') + ': type specification of ' +
              location + ' `' + typeSpecName + '` is invalid; the type checker ' +
              'function must return `null` or an `Error` but returned a ' + typeof error + '. ' +
              'You may have forgotten to pass an argument to the type checker ' +
              'creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and ' +
              'shape all require an argument).'
            );
          }
          if (error instanceof Error && !(error.message in loggedTypeFailures)) {
            // Only monitor this failure once because there tends to be a lot of the
            // same error.
            loggedTypeFailures[error.message] = true;

            var stack = getStack ? getStack() : '';

            printWarning(
              'Failed ' + location + ' type: ' + error.message + (stack != null ? stack : '')
            );
          }
        }
      }
    }
  }

  /**
   * Resets warning cache when testing.
   *
   * @private
   */
  checkPropTypes.resetWarningCache = function() {
    {
      loggedTypeFailures = {};
    }
  };

  var checkPropTypes_1 = checkPropTypes;

  var has$1 = Function.call.bind(Object.prototype.hasOwnProperty);
  var printWarning$1 = function() {};

  {
    printWarning$1 = function(text) {
      var message = 'Warning: ' + text;
      if (typeof console !== 'undefined') {
        console.error(message);
      }
      try {
        // --- Welcome to debugging React ---
        // This error was thrown as a convenience so that you can use this stack
        // to find the callsite that caused this warning to fire.
        throw new Error(message);
      } catch (x) {}
    };
  }

  function emptyFunctionThatReturnsNull() {
    return null;
  }

  var factoryWithTypeCheckers = function(isValidElement, throwOnDirectAccess) {
    /* global Symbol */
    var ITERATOR_SYMBOL = typeof Symbol === 'function' && Symbol.iterator;
    var FAUX_ITERATOR_SYMBOL = '@@iterator'; // Before Symbol spec.

    /**
     * Returns the iterator method function contained on the iterable object.
     *
     * Be sure to invoke the function with the iterable as context:
     *
     *     var iteratorFn = getIteratorFn(myIterable);
     *     if (iteratorFn) {
     *       var iterator = iteratorFn.call(myIterable);
     *       ...
     *     }
     *
     * @param {?object} maybeIterable
     * @return {?function}
     */
    function getIteratorFn(maybeIterable) {
      var iteratorFn = maybeIterable && (ITERATOR_SYMBOL && maybeIterable[ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL]);
      if (typeof iteratorFn === 'function') {
        return iteratorFn;
      }
    }

    /**
     * Collection of methods that allow declaration and validation of props that are
     * supplied to React components. Example usage:
     *
     *   var Props = require('ReactPropTypes');
     *   var MyArticle = React.createClass({
     *     propTypes: {
     *       // An optional string prop named "description".
     *       description: Props.string,
     *
     *       // A required enum prop named "category".
     *       category: Props.oneOf(['News','Photos']).isRequired,
     *
     *       // A prop named "dialog" that requires an instance of Dialog.
     *       dialog: Props.instanceOf(Dialog).isRequired
     *     },
     *     render: function() { ... }
     *   });
     *
     * A more formal specification of how these methods are used:
     *
     *   type := array|bool|func|object|number|string|oneOf([...])|instanceOf(...)
     *   decl := ReactPropTypes.{type}(.isRequired)?
     *
     * Each and every declaration produces a function with the same signature. This
     * allows the creation of custom validation functions. For example:
     *
     *  var MyLink = React.createClass({
     *    propTypes: {
     *      // An optional string or URI prop named "href".
     *      href: function(props, propName, componentName) {
     *        var propValue = props[propName];
     *        if (propValue != null && typeof propValue !== 'string' &&
     *            !(propValue instanceof URI)) {
     *          return new Error(
     *            'Expected a string or an URI for ' + propName + ' in ' +
     *            componentName
     *          );
     *        }
     *      }
     *    },
     *    render: function() {...}
     *  });
     *
     * @internal
     */

    var ANONYMOUS = '<<anonymous>>';

    // Important!
    // Keep this list in sync with production version in `./factoryWithThrowingShims.js`.
    var ReactPropTypes = {
      array: createPrimitiveTypeChecker('array'),
      bool: createPrimitiveTypeChecker('boolean'),
      func: createPrimitiveTypeChecker('function'),
      number: createPrimitiveTypeChecker('number'),
      object: createPrimitiveTypeChecker('object'),
      string: createPrimitiveTypeChecker('string'),
      symbol: createPrimitiveTypeChecker('symbol'),

      any: createAnyTypeChecker(),
      arrayOf: createArrayOfTypeChecker,
      element: createElementTypeChecker(),
      elementType: createElementTypeTypeChecker(),
      instanceOf: createInstanceTypeChecker,
      node: createNodeChecker(),
      objectOf: createObjectOfTypeChecker,
      oneOf: createEnumTypeChecker,
      oneOfType: createUnionTypeChecker,
      shape: createShapeTypeChecker,
      exact: createStrictShapeTypeChecker,
    };

    /**
     * inlined Object.is polyfill to avoid requiring consumers ship their own
     * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is
     */
    /*eslint-disable no-self-compare*/
    function is(x, y) {
      // SameValue algorithm
      if (x === y) {
        // Steps 1-5, 7-10
        // Steps 6.b-6.e: +0 != -0
        return x !== 0 || 1 / x === 1 / y;
      } else {
        // Step 6.a: NaN == NaN
        return x !== x && y !== y;
      }
    }
    /*eslint-enable no-self-compare*/

    /**
     * We use an Error-like object for backward compatibility as people may call
     * PropTypes directly and inspect their output. However, we don't use real
     * Errors anymore. We don't inspect their stack anyway, and creating them
     * is prohibitively expensive if they are created too often, such as what
     * happens in oneOfType() for any type before the one that matched.
     */
    function PropTypeError(message) {
      this.message = message;
      this.stack = '';
    }
    // Make `instanceof Error` still work for returned errors.
    PropTypeError.prototype = Error.prototype;

    function createChainableTypeChecker(validate) {
      {
        var manualPropTypeCallCache = {};
        var manualPropTypeWarningCount = 0;
      }
      function checkType(isRequired, props, propName, componentName, location, propFullName, secret) {
        componentName = componentName || ANONYMOUS;
        propFullName = propFullName || propName;

        if (secret !== ReactPropTypesSecret_1) {
          if (throwOnDirectAccess) {
            // New behavior only for users of `prop-types` package
            var err = new Error(
              'Calling PropTypes validators directly is not supported by the `prop-types` package. ' +
              'Use `PropTypes.checkPropTypes()` to call them. ' +
              'Read more at http://fb.me/use-check-prop-types'
            );
            err.name = 'Invariant Violation';
            throw err;
          } else if (typeof console !== 'undefined') {
            // Old behavior for people using React.PropTypes
            var cacheKey = componentName + ':' + propName;
            if (
              !manualPropTypeCallCache[cacheKey] &&
              // Avoid spamming the console because they are often not actionable except for lib authors
              manualPropTypeWarningCount < 3
            ) {
              printWarning$1(
                'You are manually calling a React.PropTypes validation ' +
                'function for the `' + propFullName + '` prop on `' + componentName  + '`. This is deprecated ' +
                'and will throw in the standalone `prop-types` package. ' +
                'You may be seeing this warning due to a third-party PropTypes ' +
                'library. See https://fb.me/react-warning-dont-call-proptypes ' + 'for details.'
              );
              manualPropTypeCallCache[cacheKey] = true;
              manualPropTypeWarningCount++;
            }
          }
        }
        if (props[propName] == null) {
          if (isRequired) {
            if (props[propName] === null) {
              return new PropTypeError('The ' + location + ' `' + propFullName + '` is marked as required ' + ('in `' + componentName + '`, but its value is `null`.'));
            }
            return new PropTypeError('The ' + location + ' `' + propFullName + '` is marked as required in ' + ('`' + componentName + '`, but its value is `undefined`.'));
          }
          return null;
        } else {
          return validate(props, propName, componentName, location, propFullName);
        }
      }

      var chainedCheckType = checkType.bind(null, false);
      chainedCheckType.isRequired = checkType.bind(null, true);

      return chainedCheckType;
    }

    function createPrimitiveTypeChecker(expectedType) {
      function validate(props, propName, componentName, location, propFullName, secret) {
        var propValue = props[propName];
        var propType = getPropType(propValue);
        if (propType !== expectedType) {
          // `propValue` being instance of, say, date/regexp, pass the 'object'
          // check, but we can offer a more precise error message here rather than
          // 'of type `object`'.
          var preciseType = getPreciseType(propValue);

          return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` of type ' + ('`' + preciseType + '` supplied to `' + componentName + '`, expected ') + ('`' + expectedType + '`.'));
        }
        return null;
      }
      return createChainableTypeChecker(validate);
    }

    function createAnyTypeChecker() {
      return createChainableTypeChecker(emptyFunctionThatReturnsNull);
    }

    function createArrayOfTypeChecker(typeChecker) {
      function validate(props, propName, componentName, location, propFullName) {
        if (typeof typeChecker !== 'function') {
          return new PropTypeError('Property `' + propFullName + '` of component `' + componentName + '` has invalid PropType notation inside arrayOf.');
        }
        var propValue = props[propName];
        if (!Array.isArray(propValue)) {
          var propType = getPropType(propValue);
          return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` of type ' + ('`' + propType + '` supplied to `' + componentName + '`, expected an array.'));
        }
        for (var i = 0; i < propValue.length; i++) {
          var error = typeChecker(propValue, i, componentName, location, propFullName + '[' + i + ']', ReactPropTypesSecret_1);
          if (error instanceof Error) {
            return error;
          }
        }
        return null;
      }
      return createChainableTypeChecker(validate);
    }

    function createElementTypeChecker() {
      function validate(props, propName, componentName, location, propFullName) {
        var propValue = props[propName];
        if (!isValidElement(propValue)) {
          var propType = getPropType(propValue);
          return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` of type ' + ('`' + propType + '` supplied to `' + componentName + '`, expected a single ReactElement.'));
        }
        return null;
      }
      return createChainableTypeChecker(validate);
    }

    function createElementTypeTypeChecker() {
      function validate(props, propName, componentName, location, propFullName) {
        var propValue = props[propName];
        if (!reactIs.isValidElementType(propValue)) {
          var propType = getPropType(propValue);
          return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` of type ' + ('`' + propType + '` supplied to `' + componentName + '`, expected a single ReactElement type.'));
        }
        return null;
      }
      return createChainableTypeChecker(validate);
    }

    function createInstanceTypeChecker(expectedClass) {
      function validate(props, propName, componentName, location, propFullName) {
        if (!(props[propName] instanceof expectedClass)) {
          var expectedClassName = expectedClass.name || ANONYMOUS;
          var actualClassName = getClassName(props[propName]);
          return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` of type ' + ('`' + actualClassName + '` supplied to `' + componentName + '`, expected ') + ('instance of `' + expectedClassName + '`.'));
        }
        return null;
      }
      return createChainableTypeChecker(validate);
    }

    function createEnumTypeChecker(expectedValues) {
      if (!Array.isArray(expectedValues)) {
        {
          if (arguments.length > 1) {
            printWarning$1(
              'Invalid arguments supplied to oneOf, expected an array, got ' + arguments.length + ' arguments. ' +
              'A common mistake is to write oneOf(x, y, z) instead of oneOf([x, y, z]).'
            );
          } else {
            printWarning$1('Invalid argument supplied to oneOf, expected an array.');
          }
        }
        return emptyFunctionThatReturnsNull;
      }

      function validate(props, propName, componentName, location, propFullName) {
        var propValue = props[propName];
        for (var i = 0; i < expectedValues.length; i++) {
          if (is(propValue, expectedValues[i])) {
            return null;
          }
        }

        var valuesString = JSON.stringify(expectedValues, function replacer(key, value) {
          var type = getPreciseType(value);
          if (type === 'symbol') {
            return String(value);
          }
          return value;
        });
        return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` of value `' + String(propValue) + '` ' + ('supplied to `' + componentName + '`, expected one of ' + valuesString + '.'));
      }
      return createChainableTypeChecker(validate);
    }

    function createObjectOfTypeChecker(typeChecker) {
      function validate(props, propName, componentName, location, propFullName) {
        if (typeof typeChecker !== 'function') {
          return new PropTypeError('Property `' + propFullName + '` of component `' + componentName + '` has invalid PropType notation inside objectOf.');
        }
        var propValue = props[propName];
        var propType = getPropType(propValue);
        if (propType !== 'object') {
          return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` of type ' + ('`' + propType + '` supplied to `' + componentName + '`, expected an object.'));
        }
        for (var key in propValue) {
          if (has$1(propValue, key)) {
            var error = typeChecker(propValue, key, componentName, location, propFullName + '.' + key, ReactPropTypesSecret_1);
            if (error instanceof Error) {
              return error;
            }
          }
        }
        return null;
      }
      return createChainableTypeChecker(validate);
    }

    function createUnionTypeChecker(arrayOfTypeCheckers) {
      if (!Array.isArray(arrayOfTypeCheckers)) {
        printWarning$1('Invalid argument supplied to oneOfType, expected an instance of array.');
        return emptyFunctionThatReturnsNull;
      }

      for (var i = 0; i < arrayOfTypeCheckers.length; i++) {
        var checker = arrayOfTypeCheckers[i];
        if (typeof checker !== 'function') {
          printWarning$1(
            'Invalid argument supplied to oneOfType. Expected an array of check functions, but ' +
            'received ' + getPostfixForTypeWarning(checker) + ' at index ' + i + '.'
          );
          return emptyFunctionThatReturnsNull;
        }
      }

      function validate(props, propName, componentName, location, propFullName) {
        for (var i = 0; i < arrayOfTypeCheckers.length; i++) {
          var checker = arrayOfTypeCheckers[i];
          if (checker(props, propName, componentName, location, propFullName, ReactPropTypesSecret_1) == null) {
            return null;
          }
        }

        return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` supplied to ' + ('`' + componentName + '`.'));
      }
      return createChainableTypeChecker(validate);
    }

    function createNodeChecker() {
      function validate(props, propName, componentName, location, propFullName) {
        if (!isNode(props[propName])) {
          return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` supplied to ' + ('`' + componentName + '`, expected a ReactNode.'));
        }
        return null;
      }
      return createChainableTypeChecker(validate);
    }

    function createShapeTypeChecker(shapeTypes) {
      function validate(props, propName, componentName, location, propFullName) {
        var propValue = props[propName];
        var propType = getPropType(propValue);
        if (propType !== 'object') {
          return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` of type `' + propType + '` ' + ('supplied to `' + componentName + '`, expected `object`.'));
        }
        for (var key in shapeTypes) {
          var checker = shapeTypes[key];
          if (!checker) {
            continue;
          }
          var error = checker(propValue, key, componentName, location, propFullName + '.' + key, ReactPropTypesSecret_1);
          if (error) {
            return error;
          }
        }
        return null;
      }
      return createChainableTypeChecker(validate);
    }

    function createStrictShapeTypeChecker(shapeTypes) {
      function validate(props, propName, componentName, location, propFullName) {
        var propValue = props[propName];
        var propType = getPropType(propValue);
        if (propType !== 'object') {
          return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` of type `' + propType + '` ' + ('supplied to `' + componentName + '`, expected `object`.'));
        }
        // We need to check all keys in case some are required but missing from
        // props.
        var allKeys = objectAssign({}, props[propName], shapeTypes);
        for (var key in allKeys) {
          var checker = shapeTypes[key];
          if (!checker) {
            return new PropTypeError(
              'Invalid ' + location + ' `' + propFullName + '` key `' + key + '` supplied to `' + componentName + '`.' +
              '\nBad object: ' + JSON.stringify(props[propName], null, '  ') +
              '\nValid keys: ' +  JSON.stringify(Object.keys(shapeTypes), null, '  ')
            );
          }
          var error = checker(propValue, key, componentName, location, propFullName + '.' + key, ReactPropTypesSecret_1);
          if (error) {
            return error;
          }
        }
        return null;
      }

      return createChainableTypeChecker(validate);
    }

    function isNode(propValue) {
      switch (typeof propValue) {
        case 'number':
        case 'string':
        case 'undefined':
          return true;
        case 'boolean':
          return !propValue;
        case 'object':
          if (Array.isArray(propValue)) {
            return propValue.every(isNode);
          }
          if (propValue === null || isValidElement(propValue)) {
            return true;
          }

          var iteratorFn = getIteratorFn(propValue);
          if (iteratorFn) {
            var iterator = iteratorFn.call(propValue);
            var step;
            if (iteratorFn !== propValue.entries) {
              while (!(step = iterator.next()).done) {
                if (!isNode(step.value)) {
                  return false;
                }
              }
            } else {
              // Iterator will provide entry [k,v] tuples rather than values.
              while (!(step = iterator.next()).done) {
                var entry = step.value;
                if (entry) {
                  if (!isNode(entry[1])) {
                    return false;
                  }
                }
              }
            }
          } else {
            return false;
          }

          return true;
        default:
          return false;
      }
    }

    function isSymbol(propType, propValue) {
      // Native Symbol.
      if (propType === 'symbol') {
        return true;
      }

      // falsy value can't be a Symbol
      if (!propValue) {
        return false;
      }

      // 19.4.3.5 Symbol.prototype[@@toStringTag] === 'Symbol'
      if (propValue['@@toStringTag'] === 'Symbol') {
        return true;
      }

      // Fallback for non-spec compliant Symbols which are polyfilled.
      if (typeof Symbol === 'function' && propValue instanceof Symbol) {
        return true;
      }

      return false;
    }

    // Equivalent of `typeof` but with special handling for array and regexp.
    function getPropType(propValue) {
      var propType = typeof propValue;
      if (Array.isArray(propValue)) {
        return 'array';
      }
      if (propValue instanceof RegExp) {
        // Old webkits (at least until Android 4.0) return 'function' rather than
        // 'object' for typeof a RegExp. We'll normalize this here so that /bla/
        // passes PropTypes.object.
        return 'object';
      }
      if (isSymbol(propType, propValue)) {
        return 'symbol';
      }
      return propType;
    }

    // This handles more types than `getPropType`. Only used for error messages.
    // See `createPrimitiveTypeChecker`.
    function getPreciseType(propValue) {
      if (typeof propValue === 'undefined' || propValue === null) {
        return '' + propValue;
      }
      var propType = getPropType(propValue);
      if (propType === 'object') {
        if (propValue instanceof Date) {
          return 'date';
        } else if (propValue instanceof RegExp) {
          return 'regexp';
        }
      }
      return propType;
    }

    // Returns a string that is postfixed to a warning about an invalid type.
    // For example, "undefined" or "of type array"
    function getPostfixForTypeWarning(value) {
      var type = getPreciseType(value);
      switch (type) {
        case 'array':
        case 'object':
          return 'an ' + type;
        case 'boolean':
        case 'date':
        case 'regexp':
          return 'a ' + type;
        default:
          return type;
      }
    }

    // Returns class name of the object, if any.
    function getClassName(propValue) {
      if (!propValue.constructor || !propValue.constructor.name) {
        return ANONYMOUS;
      }
      return propValue.constructor.name;
    }

    ReactPropTypes.checkPropTypes = checkPropTypes_1;
    ReactPropTypes.resetWarningCache = checkPropTypes_1.resetWarningCache;
    ReactPropTypes.PropTypes = ReactPropTypes;

    return ReactPropTypes;
  };

  var propTypes = createCommonjsModule$1(function (module) {
  /**
   * Copyright (c) 2013-present, Facebook, Inc.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   */

  {
    var ReactIs = reactIs;

    // By explicitly using `prop-types` you are opting into new development behavior.
    // http://fb.me/prop-types-in-prod
    var throwOnDirectAccess = true;
    module.exports = factoryWithTypeCheckers(ReactIs.isElement, throwOnDirectAccess);
  }
  });

  var coerceValue = function coerceValue(targetPropType, value) {
    switch (targetPropType) {
      case propTypes.array:
      case propTypes.array.isRequired:
        return value ? JSON.parse(value) : undefined;

      case propTypes.bool:
      case propTypes.bool.isRequired:
        return Boolean(value);

      case propTypes.func:
      case propTypes.func.isRequired:
        throw new Error('Invalid PropType: func is not supported');
        break;

      case propTypes.number:
      case propTypes.number.isRequired:
        return value ? Number(value) : value;

      case propTypes.object:
      case propTypes.object.isRequired:
        return value ? JSON.parse(value) : undefined;

      case propTypes.symbol:
      case propTypes.symbol.isRequired:
        throw new Error('Invalid PropType: symbol is not supported');
        break;

      case propTypes.string:
      case propTypes.string.isRequired:
      default:
        return value;
    }
  };
  var getElementProps = function getElementProps(element, elementPropTypes, namespace) {
    var validate = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : true;
    var props = Object.keys(elementPropTypes).reduce(function (acc, property) {
      var targetPropType = elementPropTypes[property];
      return _objectSpread({}, acc, _defineProperty({}, property, coerceValue(targetPropType, getElementDataProperty(element, targetPropType, property, namespace))));
    }, {});

    if (validate) {
      propTypes.checkPropTypes(elementPropTypes, props, 'prop', namespace);
    }

    return props;
  };

  var convertToDataAttributeName = function convertToDataAttributeName(property) {
    var namespace = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
    return namespace ? "data-".concat(dashify(namespace), "-").concat(dashify(property)) : "data-".concat(dashify(property));
  };

  var getElementDataProperty = function getElementDataProperty(element, targetPropType, property) {
    var namespace = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;

    if (targetPropType === propTypes.bool || targetPropType === propTypes.bool.isRequired) {
      // Boolean
      return element.hasAttribute(convertToDataAttributeName(property, namespace));
    } else {
      return element.dataset ? element.dataset[namespace ? camelcase("".concat(namespace, "-").concat(property)) : property] : element.getAttribute(convertToDataAttributeName(property, namespace));
    }
  };

  var validateComponentSpec = function validateComponentSpec(spec) {
    if (!spec.componentName) {
      throw new Error('spec.componentName name must be defined.');
    }

    if (typeof spec.createInstance !== 'function') {
      throw new Error('spec.createInstance must be either a function or have a `instantiate` function');
    }
  };
  var validateComponentInstance = function validateComponentInstance(instance) {
    if (typeof instance.defaultAction !== 'function') {
      throw new Error("".concat(instance.spec.componentName, " instance has no defaultAction name"));
    }
  };
  var createComponentInstance = function createComponentInstance(system, spec, element) {
    var instance = _objectSpread({}, spec.createInstance(system, element, spec.instancePropTypes ? getElementProps(element, spec.instancePropTypes, spec.componentName) : {}), {
      spec: spec,
      element: element
    });

    validateComponentInstance(instance);
    return instance;
  };
  var instantiateComponents = function instantiateComponents(system, rootElement, componentDataAttribute) {
    return Array.from(rootElement.querySelectorAll(attributeSelector(componentDataAttribute))).map(function (element) {
      var componentName = element.getAttribute(componentDataAttribute);
      var spec = system.getComponentSpec(componentName);

      if (!spec) {
        console.warn("Component spec not defined: ".concat(componentName));
        return null;
      }

      try {
        return createComponentInstance(system, spec, element);
      } catch (err) {
        console.warn("Error instantiating component ".concat(componentName), element, err);
        return null;
      }
    }).filter(Boolean);
  };

  var DOM_ATTRIBUTE_ALLOWED_CHARS_RE = /^[a-z\-]+$/;

  var isValidAttributeName = function isValidAttributeName(str) {
    return DOM_ATTRIBUTE_ALLOWED_CHARS_RE.test(str);
  };

  var validateNamespace = function validateNamespace(namespace) {
    if (!isValidAttributeName(namespace)) {
      throw new Error("Invalid namespace ".concat(namespace));
    }
  };

  var ComponentSystem =
  /*#__PURE__*/
  function (_EventEmitter) {
    _inherits(ComponentSystem, _EventEmitter);

    function ComponentSystem(namespace) {
      var _this;

      var specs = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

      _classCallCheck(this, ComponentSystem);

      _this = _possibleConstructorReturn(this, _getPrototypeOf(ComponentSystem).call(this));
      validateNamespace(namespace);
      specs.forEach(validateComponentSpec);
      _this.rootElement = null;
      _this.namespace = namespace;
      _this.componentDataAttribute = "data-".concat(namespace);
      _this.triggerDataAttribute = "data-".concat(namespace, "-trigger");
      _this.specs = specs;
      _this.instances = null;
      _this.ready = false; // Bind methods

      _this.navHandleNavigation = _this.navHandleNavigation.bind(_assertThisInitialized(_assertThisInitialized(_this)));
      return _this;
    }
    /**
     * Initializes the component system within the
     * given rootNode
     * @param  {DOMElement} rootElement
     */


    _createClass(ComponentSystem, [{
      key: "initialize",
      value: function initialize() {
        var _this2 = this;

        var rootElement = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : document;

        var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
            _ref$enableHashNaviga = _ref.enableHashNavigationTracking,
            enableHashNavigationTracking = _ref$enableHashNaviga === void 0 ? true : _ref$enableHashNaviga;

        /**
         * Loop through specs, initialize them
         */
        this.specs = this.specs.map(function (spec) {
          if (typeof spec.initialize === 'function') {
            spec.initialize(_this2);
          }

          return _objectSpread({
            initialized: true
          }, spec);
        });
        this.rootElement = rootElement;
        this.instances = instantiateComponents(this, rootElement, this.componentDataAttribute);

        if (enableHashNavigationTracking) {
          initializeHashNavigationTracking(this, rootElement);
        }

        this.ready = true;
        this.emit('ready');
      }
      /**
       * Handles navigations
       */

    }, {
      key: "navHandleNavigation",
      value: function navHandleNavigation(targetUrl) {
        var targetElement = getTargetElementGivenUrl(targetUrl);
        return targetElement ? this.invoke(targetElement, null, 'defaultAction') : false;
      }
      /**
       * Official way of pushing to window.history through the component system
       * @param  {String} url      [description]
       * @param  {String} title    [description]
       * @param  {Object} stateObj [description]
       */

    }, {
      key: "navHistoryPushState",
      value: function navHistoryPushState(url) {
        var stateObj = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
        var title = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : '';
        stateObj = _objectSpread({}, stateObj, {
          isSynthetic: true,
          historyLength: window.history.length
        });
        return window.history.pushState(stateObj, title, url);
      }
      /**
       * Official way of replacing current history state through the component system
       * @param  {String} url      [description]
       * @param  {String} title    [description]
       * @param  {Object} stateObj [description]
       */

    }, {
      key: "navHistoryReplaceState",
      value: function navHistoryReplaceState(url) {
        var stateObj = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
        var title = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : '';
        stateObj = _objectSpread({}, stateObj, {
          isSynthetic: true,
          historyLength: window.history.length
        });
        return window.history.replaceState(stateObj, title, url);
      }
      /**
       * Retrieves current hash of the url
       * @return {String}
       */

    }, {
      key: "navHistoryGetCurrentHash",
      value: function navHistoryGetCurrentHash() {
        return getUrlHash(window.location.href);
      }
      /**
       * Retrieves a registered component spec
       * @param  {String} componentName
       * @return {Object}
       */

    }, {
      key: "getComponentSpec",
      value: function getComponentSpec(componentName) {
        return this.specs.find(function (spec) {
          return spec.componentName === componentName;
        }) || null;
      }
      /**
       * Retrieves an array of instances of a given component
       * @param  {String} componentName
       * @return {Array}
       */

    }, {
      key: "getComponentInstances",
      value: function getComponentInstances(componentName) {
        return this.instances.filter(function (instance) {
          return instance.spec.componentName === componentName;
        });
      }
      /**
       * Retrieves the component instance that corresponds to the
       * given element
       */

    }, {
      key: "getComponentInstanceByElement",
      value: function getComponentInstanceByElement(element) {
        return this.instances.find(function (instance) {
          return instance.element === element;
        }) || null;
      }
      /**
       * Retrieves the closest ancestor component instance
       * relative to the given element
       */

    }, {
      key: "getClosestComponentInstance",
      value: function getClosestComponentInstance(element) {
        var componentName = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
        var selector = attributeSelector(this.componentDataAttribute, componentName);
        var closestComponentRoot = element.closest(selector);
        return closestComponentRoot ? this.getComponentInstanceByElement(closestComponentRoot) : null;
      }
      /**
       * Invokes a method for the given target's closest component.
       * 
       * @param  {[type]} targetElement [description]
       * @param  {[type]} componentName [description]
       * @param  {String} actionName    [description]
       * @param  {Array}  actionArgs    [description]
       * @return {[type]}               [description]
       */

    }, {
      key: "invoke",
      value: function invoke(targetElement, componentName) {
        var actionName = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 'defaultAction';
        var actionArgs = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : [];
        var instance = this.getClosestComponentInstance(targetElement, componentName);
        var handled = false;

        if (instance) {
          var actionFn = instance[actionName];

          if (typeof actionFn === 'function') {
            /**
             * Default action receives the targetElement as the first argument
             */
            actionArgs = actionName === 'defaultAction' ? [targetElement].concat(_toConsumableArray(actionArgs)) : actionArgs;
            actionFn.apply(null, actionArgs);
            handled = true;
          } else {
            console.warn("Invalid action: '".concat(instance.spec.componentName, "' '").concat(actionName, "'"));
          }
        }

        return handled;
      }
    }]);

    return ComponentSystem;
  }(EventEmitter$1);

  var index = (function () {
    var namespace = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'component';
    var specs = arguments.length > 1 ? arguments[1] : undefined;
    return new ComponentSystem(namespace, specs);
  });

  var TRIGGER_COMPONENT_NAME = 'trigger';

  var createInstance = function createInstance(system, componentRoot, _ref) {
    var _ref$target = _ref.target,
        target = _ref$target === void 0 ? null : _ref$target,
        component = _ref.component,
        action = _ref.action,
        _ref$actionArgs = _ref.actionArgs,
        actionArgs = _ref$actionArgs === void 0 ? [] : _ref$actionArgs;

    var activateTarget = function activateTarget() {
      /**
       * If no specific target is defined, assume the trigger is within a component.
       * Use the parent element as the target, so that the closest component
       * to the trigger will be activated
       */
      var targetElement = target ? system.rootElement.querySelector(target) : componentRoot.parentElement;

      if (targetElement) {
        system.invoke(targetElement, component, action, actionArgs);
      } else {
        console.warn("Missing target ".concat(target));
      }
    };

    componentRoot.addEventListener('click', activateTarget);
    return {
      defaultAction: activateTarget
    };
  };

  var trigger = (function () {
    return {
      componentName: TRIGGER_COMPONENT_NAME,
      instancePropTypes: {
        target: propTypes.string,
        component: propTypes.string,
        action: propTypes.string,
        actionArgs: propTypes.array
      },
      createInstance: createInstance
    };
  });

  const COMPONENT_NAME = 'game-activity';
  const ACTIVITY_CARD_SELECTOR = '.activity__card';

  const createInstance$1 = (system, componentRoot, {
    points
  }) => {
    const activityId = componentRoot.getAttribute('id');
    const card = componentRoot.querySelector(ACTIVITY_CARD_SELECTOR);

    const unlock = () => {
      window.game.unlockActivity(activityId); // componentRoot.classList.add('activity--details-open')
      // componentRoot.classList.add('activity--details-unlocked')
    };

    const open = () => {
      componentRoot.classList.add('activity--details-open');
    };

    const close = () => {
      componentRoot.classList.remove('activity--details-open');
    };

    const updateActivityStatus = () => {
      if (window.game.isActivityUnlocked(activityId)) {
        componentRoot.classList.add('activity--details-unlocked');
      } else {
        componentRoot.classList.remove('activity--details-unlocked');
      }

      if (window.game.activeActivity === activityId) {
        open();
      } else {
        window.game.activeActivity = null;
        close();
      }
    };

    updateActivityStatus();
    window.game.on('game-updated', updateActivityStatus);
    return {
      defaultAction: () => {
        unlock();
      },
      unlock,
      open,
      close
    };
  };

  var gameActivity = (() => {
    return {
      componentName: COMPONENT_NAME,
      createInstance: createInstance$1,
      instancePropTypes: {
        points: propTypes.number.isRequired
      }
    };
  });

  const COMPONENT_NAME$1 = 'game-score';

  const createInstance$2 = (system, componentRoot) => {
    const renderScore = () => {
      componentRoot.innerHTML = window.game.computeScore();
    };

    window.game.on('game-updated', () => {
      renderScore();
    });
    renderScore();
    return {
      defaultAction: renderScore
    };
  };

  var gameScore = (() => {
    return {
      componentName: COMPONENT_NAME$1,
      createInstance: createInstance$2
    };
  });

  const arrayAddUnique = (arr, item) => {
    return arr.indexOf(item) === -1 ? [...arr, item] : arr;
  };

  class Game extends EventEmitter {
    constructor() {
      super();
      this.loadFromLocalStorage();
      this.emit('game-updated');
    }

    resetGame() {
      this.unlockedActivities = [];
      this.saveToLocalStorage();
      this.emit('game-updated');
    }

    unlockActivity(activityId) {
      this.unlockedActivities = arrayAddUnique(this.unlockedActivities, activityId);
      this.activeActivity = activityId;
      this.saveToLocalStorage();
      this.emit('game-updated');
    }

    saveToLocalStorage() {
      window.localStorage.setItem('gameData', JSON.stringify({
        unlockedActivities: this.unlockedActivities
      }));
    }

    computeScore() {
      var score = 0;
      this.unlockedActivities.forEach(activityId => {
        const activityElement = document.getElementById(activityId);
        const activityScore = parseInt(activityElement.getAttribute('data-game-activity-points'));
        score = score + activityScore;
      });
      return score;
    }

    isActivityUnlocked(activityId) {
      return this.unlockedActivities.indexOf(activityId) !== -1;
    }

    loadFromLocalStorage() {
      const gameDataStr = window.localStorage.getItem('gameData');
      const storedData = gameDataStr ? JSON.parse(gameDataStr) : null;
      this.unlockedActivities = storedData ? storedData.unlockedActivities : [];
    }

  }

  window.game = new Game();
  document.addEventListener('DOMContentLoaded', () => {
    const system = index('component', [trigger(), gameActivity(), gameScore(), {
      componentName: 'game',
      createInstance: () => {
        return {
          defaultAction: () => {},
          resetGame: () => {
            window.game.resetGame();
          }
        };
      }
    }]);
    system.initialize();
  });

}());
