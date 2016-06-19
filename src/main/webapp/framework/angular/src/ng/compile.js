'use strict';

var $compileMinErr = minErr('$compile');

$CompileProvider.$inject = ['$provide', '$$sanitizeUriProvider'];
function $CompileProvider($provide, $$sanitizeUriProvider) {
    var hasDirectives = {},
        Suffix = 'Directive',
        COMMENT_DIRECTIVE_REGEXP = /^\s*directive\:\s*([\w\-]+)\s+(.*)$/,
        CLASS_DIRECTIVE_REGEXP = /(([\w\-]+)(?:\:([^;]+))?;?)/,
        ALL_OR_NOTHING_ATTRS = makeMap('ngSrc,ngSrcset,src,srcset'),
        REQUIRE_PREFIX_REGEXP = /^(?:(\^\^?)?(\?)?(\^\^?)?)?/;

    // Ref: http://developers.whatwg.org/webappapis.html#event-handler-idl-attributes
    // The assumption is that future DOM event attribute names will begin with
    // 'on' and be composed of only English letters.
    var EVENT_HANDLER_ATTR_REGEXP = /^(on[a-z]+|formaction)$/;
    var bindingCache = createMap();

    function parseIsolateBindings(scope, directiveName, isController) {
        var LOCAL_REGEXP = /^\s*([@&<]|=(\*?))(\??)\s*(\w*)\s*$/;

        var bindings = {};

        forEach(scope, function (definition, scopeName) {
            if (definition in bindingCache) {
                bindings[scopeName] = bindingCache[definition];
                return;
            }
            var match = definition.match(LOCAL_REGEXP);

            if (!match) {
                throw $compileMinErr('iscp',
                    "Invalid {3} for directive '{0}'." +
                    " Definition: {... {1}: '{2}' ...}",
                    directiveName, scopeName, definition,
                    (isController ? "controller bindings definition" :
                        "isolate scope definition"));
            }

            bindings[scopeName] = {
                mode: match[1][0],
                collection: match[2] === '*',
                optional: match[3] === '?',
                attrName: match[4] || scopeName
            };
            if (match[4]) {
                bindingCache[definition] = bindings[scopeName];
            }
        });

        return bindings;
    }

    function parseDirectiveBindings(directive, directiveName) {
        var bindings = {
            isolateScope: null,
            bindToController: null
        };
        if (isObject(directive.scope)) {
            if (directive.bindToController === true) {
                bindings.bindToController = parseIsolateBindings(directive.scope,
                    directiveName, true);
                bindings.isolateScope = {};
            } else {
                bindings.isolateScope = parseIsolateBindings(directive.scope,
                    directiveName, false);
            }
        }
        if (isObject(directive.bindToController)) {
            bindings.bindToController =
                parseIsolateBindings(directive.bindToController, directiveName, true);
        }
        if (isObject(bindings.bindToController)) {
            var controller = directive.controller;
            var controllerAs = directive.controllerAs;
            if (!controller) {
                // There is no controller, there may or may not be a controllerAs property
                throw $compileMinErr('noctrl',
                    "Cannot bind to controller without directive '{0}'s controller.",
                    directiveName);
            } else if (!identifierForController(controller, controllerAs)) {
                // There is a controller, but no identifier or controllerAs property
                throw $compileMinErr('noident',
                    "Cannot bind to controller without identifier for directive '{0}'.",
                    directiveName);
            }
        }
        return bindings;
    }

    function assertValidDirectiveName(name) {
        var letter = name.charAt(0);
        if (!letter || letter !== lowercase(letter)) {
            throw $compileMinErr('baddir', "Directive name '{0}' is invalid. The first character must be a lowercase letter", name);
        }
        if (name !== name.trim()) {
            throw $compileMinErr('baddir',
                "Directive name '{0}' is invalid. The name should not contain leading or trailing whitespaces",
                name);
        }
    }

    this.directive = function registerDirective(name, directiveFactory) {
        assertNotHasOwnProperty(name, 'directive');
        if (isString(name)) {
            assertValidDirectiveName(name);
            assertArg(directiveFactory, 'directiveFactory');
            if (!hasDirectives.hasOwnProperty(name)) {
                hasDirectives[name] = [];
                $provide.factory(name + Suffix, ['$injector', '$exceptionHandler',
                    function ($injector, $exceptionHandler) {
                        var directives = [];
                        forEach(hasDirectives[name], function (directiveFactory, index) {
                            try {
                                var directive = $injector.invoke(directiveFactory);
                                if (isFunction(directive)) {
                                    directive = {compile: valueFn(directive)};
                                } else if (!directive.compile && directive.link) {
                                    directive.compile = valueFn(directive.link);
                                }
                                directive.priority = directive.priority || 0;
                                directive.index = index;
                                directive.name = directive.name || name;
                                directive.require = directive.require || (directive.controller && directive.name);
                                directive.restrict = directive.restrict || 'EA';
                                directive.$$moduleName = directiveFactory.$$moduleName;
                                directives.push(directive);
                            } catch (e) {
                                $exceptionHandler(e);
                            }
                        });
                        return directives;
                    }]);
            }
            hasDirectives[name].push(directiveFactory);
        } else {
            forEach(name, reverseParams(registerDirective));
        }
        return this;
    };

    this.component = function adregisterComponent(name, options) {
        var controller = options.controller || function () {
            };

        function factory($injector) {
            function makeInjectable(fn) {
                if (isFunction(fn) || isArray(fn)) {
                    return function (tElement, tAttrs) {
                        return $injector.invoke(fn, this, {$element: tElement, $attrs: tAttrs});
                    };
                } else {
                    return fn;
                }
            }

            var template = (!options.template && !options.templateUrl ? '' : options.template);
            return {
                controller: controller,
                controllerAs: identifierForController(options.controller) || options.controllerAs || '$ctrl',
                template: makeInjectable(template),
                templateUrl: makeInjectable(options.templateUrl),
                transclude: options.transclude,
                scope: {},
                bindToController: options.bindings || {},
                restrict: 'E',
                require: options.require
            };
        }

        // Copy any annotation properties (starting with $) over to the factory function
        // These could be used by libraries such as the new component router
        forEach(options, function (val, key) {
            if (key.charAt(0) === '$') {
                factory[key] = val;
            }
        });

        factory.$inject = ['$injector'];

        return this.directive(name, factory);
    };


    this.aHrefSanitizationWhitelist = function (regexp) {
        if (isDefined(regexp)) {
            $$sanitizeUriProvider.aHrefSanitizationWhitelist(regexp);
            return this;
        } else {
            return $$sanitizeUriProvider.aHrefSanitizationWhitelist();
        }
    };



    this.imgSrcSanitizationWhitelist = function (regexp) {
        if (isDefined(regexp)) {
            $$sanitizeUriProvider.imgSrcSanitizationWhitelist(regexp);
            return this;
        } else {
            return $$sanitizeUriProvider.imgSrcSanitizationWhitelist();
        }
    };

    var debugInfoEnabled = true;
    this.debugInfoEnabled = function (enabled) {
        if (isDefined(enabled)) {
            debugInfoEnabled = enabled;
            return this;
        }
        return debugInfoEnabled;
    };

    this.$get = [
        '$injector', '$interpolate', '$exceptionHandler', '$templateRequest', '$parse',
        '$controller', '$rootScope', '$sce', '$animate', '$$sanitizeUri',
        function ($injector, $interpolate, $exceptionHandler, $templateRequest, $parse,
                  $controller, $rootScope, $sce, $animate, $$sanitizeUri) {

            var SIMPLE_ATTR_NAME = /^\w/;
            var specialAttrHolder = document.createElement('div');
            var Attributes = function (element, attributesToCopy) {
                if (attributesToCopy) {
                    var keys = Object.keys(attributesToCopy);
                    var i, l, key;

                    for (i = 0, l = keys.length; i < l; i++) {
                        key = keys[i];
                        this[key] = attributesToCopy[key];
                    }
                } else {
                    this.$attr = {};
                }

                this.$$element = element;
            };

            Attributes.prototype = {

                $normalize: directiveNormalize,



                $addClass: function (classVal) {
                    if (classVal && classVal.length > 0) {
                        $animate.addClass(this.$$element, classVal);
                    }
                },

                $removeClass: function (classVal) {
                    if (classVal && classVal.length > 0) {
                        $animate.removeClass(this.$$element, classVal);
                    }
                },

                $updateClass: function (newClasses, oldClasses) {
                    var toAdd = tokenDifference(newClasses, oldClasses);
                    if (toAdd && toAdd.length) {
                        $animate.addClass(this.$$element, toAdd);
                    }

                    var toRemove = tokenDifference(oldClasses, newClasses);
                    if (toRemove && toRemove.length) {
                        $animate.removeClass(this.$$element, toRemove);
                    }
                },

                $set: function (key, value, writeAttr, attrName) {
                    // TODO: decide whether or not to throw an error if "class"
                    //is set through this function since it may cause $updateClass to
                    //become unstable.

                    var node = this.$$element[0],
                        booleanKey = getBooleanAttrName(node, key),
                        aliasedKey = getAliasedAttrName(key),
                        observer = key,
                        nodeName;

                    if (booleanKey) {
                        this.$$element.prop(key, value);
                        attrName = booleanKey;
                    } else if (aliasedKey) {
                        this[aliasedKey] = value;
                        observer = aliasedKey;
                    }

                    this[key] = value;

                    // translate normalized key to actual key
                    if (attrName) {
                        this.$attr[key] = attrName;
                    } else {
                        attrName = this.$attr[key];
                        if (!attrName) {
                            this.$attr[key] = attrName = snake_case(key, '-');
                        }
                    }

                    nodeName = nodeName_(this.$$element);

                    if ((nodeName === 'a' && (key === 'href' || key === 'xlinkHref')) ||
                        (nodeName === 'img' && key === 'src')) {
                        // sanitize a[href] and img[src] values
                        this[key] = value = $$sanitizeUri(value, key === 'src');
                    } else if (nodeName === 'img' && key === 'srcset') {
                        // sanitize img[srcset] values
                        var result = "";

                        // first check if there are spaces because it's not the same pattern
                        var trimmedSrcset = trim(value);
                        //                (   999x   ,|   999w   ,|   ,|,   )
                        var srcPattern = /(\s+\d+x\s*,|\s+\d+w\s*,|\s+,|,\s+)/;
                        var pattern = /\s/.test(trimmedSrcset) ? srcPattern : /(,)/;

                        // split srcset into tuple of uri and descriptor except for the last item
                        var rawUris = trimmedSrcset.split(pattern);

                        // for each tuples
                        var nbrUrisWith2parts = Math.floor(rawUris.length / 2);
                        for (var i = 0; i < nbrUrisWith2parts; i++) {
                            var innerIdx = i * 2;
                            // sanitize the uri
                            result += $$sanitizeUri(trim(rawUris[innerIdx]), true);
                            // add the descriptor
                            result += (" " + trim(rawUris[innerIdx + 1]));
                        }

                        // split the last item into uri and descriptor
                        var lastTuple = trim(rawUris[i * 2]).split(/\s/);

                        // sanitize the last uri
                        result += $$sanitizeUri(trim(lastTuple[0]), true);

                        // and add the last descriptor if any
                        if (lastTuple.length === 2) {
                            result += (" " + trim(lastTuple[1]));
                        }
                        this[key] = value = result;
                    }

                    if (writeAttr !== false) {
                        if (value === null || isUndefined(value)) {
                            this.$$element.removeAttr(attrName);
                        } else {
                            if (SIMPLE_ATTR_NAME.test(attrName)) {
                                this.$$element.attr(attrName, value);
                            } else {
                                setSpecialAttr(this.$$element[0], attrName, value);
                            }
                        }
                    }

                    // fire observers
                    var $$observers = this.$$observers;
                    $$observers && forEach($$observers[observer], function (fn) {
                        try {
                            fn(value);
                        } catch (e) {
                            $exceptionHandler(e);
                        }
                    });
                },

                $observe: function (key, fn) {
                    var attrs = this,
                        $$observers = (attrs.$$observers || (attrs.$$observers = createMap())),
                        listeners = ($$observers[key] || ($$observers[key] = []));

                    listeners.push(fn);
                    $rootScope.$evalAsync(function () {
                        if (!listeners.$$inter && attrs.hasOwnProperty(key) && !isUndefined(attrs[key])) {
                            // no one registered attribute interpolation function, so lets call it manually
                            fn(attrs[key]);
                        }
                    });

                    return function () {
                        arrayRemove(listeners, fn);
                    };
                }
            };

            function setSpecialAttr(element, attrName, value) {
                // Attributes names that do not start with letters (such as `(click)`) cannot be set using `setAttribute`
                // so we have to jump through some hoops to get such an attribute
                // https://github.com/angular/angular.js/pull/13318
                specialAttrHolder.innerHTML = "<span " + attrName + ">";
                var attributes = specialAttrHolder.firstChild.attributes;
                var attribute = attributes[0];
                // We have to remove the attribute from its container element before we can add it to the destination element
                attributes.removeNamedItem(attribute.name);
                attribute.value = value;
                element.attributes.setNamedItem(attribute);
            }

            function safeAddClass($element, className) {
                try {
                    $element.addClass(className);
                } catch (e) {
                    // ignore, since it means that we are trying to set class on
                    // SVG element, where class name is read-only.
                }
            }


            var startSymbol = $interpolate.startSymbol(),
                endSymbol = $interpolate.endSymbol(),
                denormalizeTemplate = (startSymbol == '{{' && endSymbol == '}}')
                    ? identity
                    : function denormalizeTemplate(template) {
                    return template.replace(/\{\{/g, startSymbol).replace(/}}/g, endSymbol);
                },
                NG_ATTR_BINDING = /^ngAttr[A-Z]/;
            var MULTI_ELEMENT_DIR_RE = /^(.+)Start$/;

            compile.$$addBindingInfo = debugInfoEnabled ? function $$addBindingInfo($element, binding) {
                var bindings = $element.data('$binding') || [];

                if (isArray(binding)) {
                    bindings = bindings.concat(binding);
                } else {
                    bindings.push(binding);
                }

                $element.data('$binding', bindings);
            } : noop;

            compile.$$addBindingClass = debugInfoEnabled ? function $$addBindingClass($element) {
                safeAddClass($element, 'ng-binding');
            } : noop;

            compile.$$addScopeInfo = debugInfoEnabled ? function $$addScopeInfo($element, scope, isolated, noTemplate) {
                var dataName = isolated ? (noTemplate ? '$isolateScopeNoTemplate' : '$isolateScope') : '$scope';
                $element.data(dataName, scope);
            } : noop;

            compile.$$addScopeClass = debugInfoEnabled ? function $$addScopeClass($element, isolated) {
                safeAddClass($element, isolated ? 'ng-isolate-scope' : 'ng-scope');
            } : noop;

            return compile;

            //================================

            function compile($compileNodes, transcludeFn, maxPriority, ignoreDirective,
                             previousCompileContext) {
                if (!($compileNodes instanceof jqLite)) {
                    // jquery always rewraps, whereas we need to preserve the original selector so that we can
                    // modify it.
                    $compileNodes = jqLite($compileNodes);
                }
                var compositeLinkFn =
                    compileNodes($compileNodes, transcludeFn, $compileNodes,
                        maxPriority, ignoreDirective, previousCompileContext);
                compile.$$addScopeClass($compileNodes);
                var namespace = null;
                return function publicLinkFn(scope, cloneConnectFn, options) {
                    assertArg(scope, 'scope');

                    if (previousCompileContext && previousCompileContext.needsNewScope) {
                        // A parent directive did a replace and a directive on this element asked
                        // for transclusion, which caused us to lose a layer of element on which
                        // we could hold the new transclusion scope, so we will create it manually
                        // here.
                        scope = scope.$parent.$new();
                    }

                    options = options || {};
                    var parentBoundTranscludeFn = options.parentBoundTranscludeFn,
                        transcludeControllers = options.transcludeControllers,
                        futureParentElement = options.futureParentElement;

                    // When `parentBoundTranscludeFn` is passed, it is a
                    // `controllersBoundTransclude` function (it was previously passed
                    // as `transclude` to directive.link) so we must unwrap it to get
                    // its `boundTranscludeFn`
                    if (parentBoundTranscludeFn && parentBoundTranscludeFn.$$boundTransclude) {
                        parentBoundTranscludeFn = parentBoundTranscludeFn.$$boundTransclude;
                    }

                    if (!namespace) {
                        namespace = detectNamespaceForChildElements(futureParentElement);
                    }
                    var $linkNode;
                    if (namespace !== 'html') {
                        // When using a directive with replace:true and templateUrl the $compileNodes
                        // (or a child element inside of them)
                        // might change, so we need to recreate the namespace adapted compileNodes
                        // for call to the link function.
                        // Note: This will already clone the nodes...
                        $linkNode = jqLite(
                            wrapTemplate(namespace, jqLite('<div>').append($compileNodes).html())
                        );
                    } else if (cloneConnectFn) {
                        // important!!: we must call our jqLite.clone() since the jQuery one is trying to be smart
                        // and sometimes changes the structure of the DOM.
                        $linkNode = JQLitePrototype.clone.call($compileNodes);
                    } else {
                        $linkNode = $compileNodes;
                    }

                    if (transcludeControllers) {
                        for (var controllerName in transcludeControllers) {
                            $linkNode.data('$' + controllerName + 'Controller', transcludeControllers[controllerName].instance);
                        }
                    }

                    compile.$$addScopeInfo($linkNode, scope);

                    if (cloneConnectFn) cloneConnectFn($linkNode, scope);
                    if (compositeLinkFn) compositeLinkFn(scope, $linkNode, $linkNode, parentBoundTranscludeFn);
                    return $linkNode;
                };
            }

            function detectNamespaceForChildElements(parentElement) {
                // TODO: Make this detect MathML as well...
                var node = parentElement && parentElement[0];
                if (!node) {
                    return 'html';
                } else {
                    return nodeName_(node) !== 'foreignobject' && toString.call(node).match(/SVG/) ? 'svg' : 'html';
                }
            }


            function compileNodes(nodeList, transcludeFn, $rootElement, maxPriority, ignoreDirective,
                                  previousCompileContext) {
                var linkFns = [],
                    attrs, directives, nodeLinkFn, childNodes, childLinkFn, linkFnFound, nodeLinkFnFound;

                for (var i = 0; i < nodeList.length; i++) {
                    attrs = new Attributes();

                    // we must always refer to nodeList[i] since the nodes can be replaced underneath us.
                    directives = collectDirectives(nodeList[i], [], attrs, i === 0 ? maxPriority : undefined,
                        ignoreDirective);

                    nodeLinkFn = (directives.length)
                        ? applyDirectivesToNode(directives, nodeList[i], attrs, transcludeFn, $rootElement,
                        null, [], [], previousCompileContext)
                        : null;

                    if (nodeLinkFn && nodeLinkFn.scope) {
                        compile.$$addScopeClass(attrs.$$element);
                    }

                    childLinkFn = (nodeLinkFn && nodeLinkFn.terminal || !(childNodes = nodeList[i].childNodes) || !childNodes.length)
                        ? null
                        : compileNodes(childNodes,
                        nodeLinkFn ? (
                        (nodeLinkFn.transcludeOnThisElement || !nodeLinkFn.templateOnThisElement)
                        && nodeLinkFn.transclude) : transcludeFn);

                    if (nodeLinkFn || childLinkFn) {
                        linkFns.push(i, nodeLinkFn, childLinkFn);
                        linkFnFound = true;
                        nodeLinkFnFound = nodeLinkFnFound || nodeLinkFn;
                    }

                    //use the previous context only for the first element in the virtual group
                    previousCompileContext = null;
                }

                // return a linking function if we have found anything, null otherwise
                return linkFnFound ? compositeLinkFn : null;

                function compositeLinkFn(scope, nodeList, $rootElement, parentBoundTranscludeFn) {
                    var nodeLinkFn, childLinkFn, node, childScope, i, ii, idx, childBoundTranscludeFn;
                    var stableNodeList;


                    if (nodeLinkFnFound) {
                        // copy nodeList so that if a nodeLinkFn removes or adds an element at this DOM level our
                        // offsets don't get screwed up
                        var nodeListLength = nodeList.length;
                        stableNodeList = new Array(nodeListLength);

                        // create a sparse array by only copying the elements which have a linkFn
                        for (i = 0; i < linkFns.length; i += 3) {
                            idx = linkFns[i];
                            stableNodeList[idx] = nodeList[idx];
                        }
                    } else {
                        stableNodeList = nodeList;
                    }

                    for (i = 0, ii = linkFns.length; i < ii;) {
                        node = stableNodeList[linkFns[i++]];
                        nodeLinkFn = linkFns[i++];
                        childLinkFn = linkFns[i++];

                        if (nodeLinkFn) {
                            if (nodeLinkFn.scope) {
                                childScope = scope.$new();
                                compile.$$addScopeInfo(jqLite(node), childScope);
                            } else {
                                childScope = scope;
                            }

                            if (nodeLinkFn.transcludeOnThisElement) {
                                childBoundTranscludeFn = createBoundTranscludeFn(
                                    scope, nodeLinkFn.transclude, parentBoundTranscludeFn);

                            } else if (!nodeLinkFn.templateOnThisElement && parentBoundTranscludeFn) {
                                childBoundTranscludeFn = parentBoundTranscludeFn;

                            } else if (!parentBoundTranscludeFn && transcludeFn) {
                                childBoundTranscludeFn = createBoundTranscludeFn(scope, transcludeFn);

                            } else {
                                childBoundTranscludeFn = null;
                            }

                            nodeLinkFn(childLinkFn, childScope, node, $rootElement, childBoundTranscludeFn);

                        } else if (childLinkFn) {
                            childLinkFn(scope, node.childNodes, undefined, parentBoundTranscludeFn);
                        }
                    }
                }
            }

            function createBoundTranscludeFn(scope, transcludeFn, previousBoundTranscludeFn) {

                var boundTranscludeFn = function (transcludedScope, cloneFn, controllers, futureParentElement, containingScope) {

                    if (!transcludedScope) {
                        transcludedScope = scope.$new(false, containingScope);
                        transcludedScope.$$transcluded = true;
                    }

                    return transcludeFn(transcludedScope, cloneFn, {
                        parentBoundTranscludeFn: previousBoundTranscludeFn,
                        transcludeControllers: controllers,
                        futureParentElement: futureParentElement
                    });
                };

                // We need  to attach the transclusion slots onto the `boundTranscludeFn`
                // so that they are available inside the `controllersBoundTransclude` function
                var boundSlots = boundTranscludeFn.$$slots = createMap();
                for (var slotName in transcludeFn.$$slots) {
                    if (transcludeFn.$$slots[slotName]) {
                        boundSlots[slotName] = createBoundTranscludeFn(scope, transcludeFn.$$slots[slotName], previousBoundTranscludeFn);
                    } else {
                        boundSlots[slotName] = null;
                    }
                }

                return boundTranscludeFn;
            }


            function collectDirectives(node, directives, attrs, maxPriority, ignoreDirective) {
                var nodeType = node.nodeType,
                    attrsMap = attrs.$attr,
                    match,
                    className;

                switch (nodeType) {
                    case NODE_TYPE_ELEMENT: /* Element */
                        // use the node name: <directive>
                        addDirective(directives,
                            directiveNormalize(nodeName_(node)), 'E', maxPriority, ignoreDirective);

                        // iterate over the attributes
                        for (var attr, name, nName, ngAttrName, value, isNgAttr, nAttrs = node.attributes,
                                 j = 0, jj = nAttrs && nAttrs.length; j < jj; j++) {
                            var attrStartName = false;
                            var attrEndName = false;

                            attr = nAttrs[j];
                            name = attr.name;
                            value = trim(attr.value);

                            // support ngAttr attribute binding
                            ngAttrName = directiveNormalize(name);
                            if (isNgAttr = NG_ATTR_BINDING.test(ngAttrName)) {
                                name = name.replace(PREFIX_REGEXP, '')
                                    .substr(8).replace(/_(.)/g, function (match, letter) {
                                        return letter.toUpperCase();
                                    });
                            }

                            var multiElementMatch = ngAttrName.match(MULTI_ELEMENT_DIR_RE);
                            if (multiElementMatch && directiveIsMultiElement(multiElementMatch[1])) {
                                attrStartName = name;
                                attrEndName = name.substr(0, name.length - 5) + 'end';
                                name = name.substr(0, name.length - 6);
                            }

                            nName = directiveNormalize(name.toLowerCase());
                            attrsMap[nName] = name;
                            if (isNgAttr || !attrs.hasOwnProperty(nName)) {
                                attrs[nName] = value;
                                if (getBooleanAttrName(node, nName)) {
                                    attrs[nName] = true; // presence means true
                                }
                            }
                            addAttrInterpolateDirective(node, directives, value, nName, isNgAttr);
                            addDirective(directives, nName, 'A', maxPriority, ignoreDirective, attrStartName,
                                attrEndName);
                        }

                        // use class as directive
                        className = node.className;
                        if (isObject(className)) {
                            // Maybe SVGAnimatedString
                            className = className.animVal;
                        }
                        if (isString(className) && className !== '') {
                            while (match = CLASS_DIRECTIVE_REGEXP.exec(className)) {
                                nName = directiveNormalize(match[2]);
                                if (addDirective(directives, nName, 'C', maxPriority, ignoreDirective)) {
                                    attrs[nName] = trim(match[3]);
                                }
                                className = className.substr(match.index + match[0].length);
                            }
                        }
                        break;
                    case NODE_TYPE_TEXT: /* Text Node */
                        if (msie === 11) {
                            // Workaround for #11781
                            while (node.parentNode && node.nextSibling && node.nextSibling.nodeType === NODE_TYPE_TEXT) {
                                node.nodeValue = node.nodeValue + node.nextSibling.nodeValue;
                                node.parentNode.removeChild(node.nextSibling);
                            }
                        }
                        addTextInterpolateDirective(directives, node.nodeValue);
                        break;
                    case NODE_TYPE_COMMENT: /* Comment */
                        try {
                            match = COMMENT_DIRECTIVE_REGEXP.exec(node.nodeValue);
                            if (match) {
                                nName = directiveNormalize(match[1]);
                                if (addDirective(directives, nName, 'M', maxPriority, ignoreDirective)) {
                                    attrs[nName] = trim(match[2]);
                                }
                            }
                        } catch (e) {
                            // turns out that under some circumstances IE9 throws errors when one attempts to read
                            // comment's node value.
                            // Just ignore it and continue. (Can't seem to reproduce in test case.)
                        }
                        break;
                }

                directives.sort(byPriority);
                return directives;
            }

            function groupScan(node, attrStart, attrEnd) {
                var nodes = [];
                var depth = 0;
                if (attrStart && node.hasAttribute && node.hasAttribute(attrStart)) {
                    do {
                        if (!node) {
                            throw $compileMinErr('uterdir',
                                "Unterminated attribute, found '{0}' but no matching '{1}' found.",
                                attrStart, attrEnd);
                        }
                        if (node.nodeType == NODE_TYPE_ELEMENT) {
                            if (node.hasAttribute(attrStart)) depth++;
                            if (node.hasAttribute(attrEnd)) depth--;
                        }
                        nodes.push(node);
                        node = node.nextSibling;
                    } while (depth > 0);
                } else {
                    nodes.push(node);
                }

                return jqLite(nodes);
            }

            function groupElementsLinkFnWrapper(linkFn, attrStart, attrEnd) {
                return function (scope, element, attrs, controllers, transcludeFn) {
                    element = groupScan(element[0], attrStart, attrEnd);
                    return linkFn(scope, element, attrs, controllers, transcludeFn);
                };
            }

            function compilationGenerator(eager, $compileNodes, transcludeFn, maxPriority, ignoreDirective, previousCompileContext) {
                var compiled;

                if (eager) {
                    return compile($compileNodes, transcludeFn, maxPriority, ignoreDirective, previousCompileContext);
                }
                return function () {
                    if (!compiled) {
                        compiled = compile($compileNodes, transcludeFn, maxPriority, ignoreDirective, previousCompileContext);

                        // Null out all of these references in order to make them eligible for garbage collection
                        // since this is a potentially long lived closure
                        $compileNodes = transcludeFn = previousCompileContext = null;
                    }
                    return compiled.apply(this, arguments);
                };
            }

            function applyDirectivesToNode(directives, compileNode, templateAttrs, transcludeFn,
                                           jqCollection, originalReplaceDirective, preLinkFns, postLinkFns,
                                           previousCompileContext) {
                previousCompileContext = previousCompileContext || {};

                var terminalPriority = -Number.MAX_VALUE,
                    newScopeDirective = previousCompileContext.newScopeDirective,
                    controllerDirectives = previousCompileContext.controllerDirectives,
                    newIsolateScopeDirective = previousCompileContext.newIsolateScopeDirective,
                    templateDirective = previousCompileContext.templateDirective,
                    nonTlbTranscludeDirective = previousCompileContext.nonTlbTranscludeDirective,
                    hasTranscludeDirective = false,
                    hasTemplate = false,
                    hasElementTranscludeDirective = previousCompileContext.hasElementTranscludeDirective,
                    $compileNode = templateAttrs.$$element = jqLite(compileNode),
                    directive,
                    directiveName,
                    $template,
                    replaceDirective = originalReplaceDirective,
                    childTranscludeFn = transcludeFn,
                    linkFn,
                    didScanForMultipleTransclusion = false,
                    mightHaveMultipleTransclusionError = false,
                    directiveValue;

                // executes all directives on the current element
                for (var i = 0, ii = directives.length; i < ii; i++) {
                    directive = directives[i];
                    var attrStart = directive.$$start;
                    var attrEnd = directive.$$end;

                    // collect multiblock sections
                    if (attrStart) {
                        $compileNode = groupScan(compileNode, attrStart, attrEnd);
                    }
                    $template = undefined;

                    if (terminalPriority > directive.priority) {
                        break; // prevent further processing of directives
                    }

                    if (directiveValue = directive.scope) {

                        // skip the check for directives with async templates, we'll check the derived sync
                        // directive when the template arrives
                        if (!directive.templateUrl) {
                            if (isObject(directiveValue)) {
                                // This directive is trying to add an isolated scope.
                                // Check that there is no scope of any kind already
                                assertNoDuplicate('new/isolated scope', newIsolateScopeDirective || newScopeDirective,
                                    directive, $compileNode);
                                newIsolateScopeDirective = directive;
                            } else {
                                // This directive is trying to add a child scope.
                                // Check that there is no isolated scope already
                                assertNoDuplicate('new/isolated scope', newIsolateScopeDirective, directive,
                                    $compileNode);
                            }
                        }

                        newScopeDirective = newScopeDirective || directive;
                    }

                    directiveName = directive.name;

                    // If we encounter a condition that can result in transclusion on the directive,
                    // then scan ahead in the remaining directives for others that may cause a multiple
                    // transclusion error to be thrown during the compilation process.  If a matching directive
                    // is found, then we know that when we encounter a transcluded directive, we need to eagerly
                    // compile the `transclude` function rather than doing it lazily in order to throw
                    // exceptions at the correct time
                    if (!didScanForMultipleTransclusion && ((directive.replace && (directive.templateUrl || directive.template))
                        || (directive.transclude && !directive.$$tlb))) {
                        var candidateDirective;

                        for (var scanningIndex = i + 1; candidateDirective = directives[scanningIndex++];) {
                            if ((candidateDirective.transclude && !candidateDirective.$$tlb)
                                || (candidateDirective.replace && (candidateDirective.templateUrl || candidateDirective.template))) {
                                mightHaveMultipleTransclusionError = true;
                                break;
                            }
                        }

                        didScanForMultipleTransclusion = true;
                    }

                    if (!directive.templateUrl && directive.controller) {
                        directiveValue = directive.controller;
                        controllerDirectives = controllerDirectives || createMap();
                        assertNoDuplicate("'" + directiveName + "' controller",
                            controllerDirectives[directiveName], directive, $compileNode);
                        controllerDirectives[directiveName] = directive;
                    }

                    if (directiveValue = directive.transclude) {
                        hasTranscludeDirective = true;

                        // Special case ngIf and ngRepeat so that we don't complain about duplicate transclusion.
                        // This option should only be used by directives that know how to safely handle element transclusion,
                        // where the transcluded nodes are added or replaced after linking.
                        if (!directive.$$tlb) {
                            assertNoDuplicate('transclusion', nonTlbTranscludeDirective, directive, $compileNode);
                            nonTlbTranscludeDirective = directive;
                        }

                        if (directiveValue == 'element') {
                            hasElementTranscludeDirective = true;
                            terminalPriority = directive.priority;
                            $template = $compileNode;
                            $compileNode = templateAttrs.$$element =
                                jqLite(document.createComment(' ' + directiveName + ': ' +
                                    templateAttrs[directiveName] + ' '));
                            compileNode = $compileNode[0];
                            replaceWith(jqCollection, sliceArgs($template), compileNode);

                            childTranscludeFn = compilationGenerator(mightHaveMultipleTransclusionError, $template, transcludeFn, terminalPriority,
                                replaceDirective && replaceDirective.name, {
                                    // Don't pass in:
                                    // - controllerDirectives - otherwise we'll create duplicates controllers
                                    // - newIsolateScopeDirective or templateDirective - combining templates with
                                    //   element transclusion doesn't make sense.
                                    //
                                    // We need only nonTlbTranscludeDirective so that we prevent putting transclusion
                                    // on the same element more than once.
                                    nonTlbTranscludeDirective: nonTlbTranscludeDirective
                                });
                        } else {

                            var slots = createMap();

                            $template = jqLite(jqLiteClone(compileNode)).contents();

                            if (isObject(directiveValue)) {

                                // We have transclusion slots,
                                // collect them up, compile them and store their transclusion functions
                                $template = [];

                                var slotMap = createMap();
                                var filledSlots = createMap();

                                // Parse the element selectors
                                forEach(directiveValue, function (elementSelector, slotName) {
                                    // If an element selector starts with a ? then it is optional
                                    var optional = (elementSelector.charAt(0) === '?');
                                    elementSelector = optional ? elementSelector.substring(1) : elementSelector;

                                    slotMap[elementSelector] = slotName;

                                    // We explicitly assign `null` since this implies that a slot was defined but not filled.
                                    // Later when calling boundTransclusion functions with a slot name we only error if the
                                    // slot is `undefined`
                                    slots[slotName] = null;

                                    // filledSlots contains `true` for all slots that are either optional or have been
                                    // filled. This is used to check that we have not missed any required slots
                                    filledSlots[slotName] = optional;
                                });

                                // Add the matching elements into their slot
                                forEach($compileNode.contents(), function (node) {
                                    var slotName = slotMap[directiveNormalize(nodeName_(node))];
                                    if (slotName) {
                                        filledSlots[slotName] = true;
                                        slots[slotName] = slots[slotName] || [];
                                        slots[slotName].push(node);
                                    } else {
                                        $template.push(node);
                                    }
                                });

                                // Check for required slots that were not filled
                                forEach(filledSlots, function (filled, slotName) {
                                    if (!filled) {
                                        throw $compileMinErr('reqslot', 'Required transclusion slot `{0}` was not filled.', slotName);
                                    }
                                });

                                for (var slotName in slots) {
                                    if (slots[slotName]) {
                                        // Only define a transclusion function if the slot was filled
                                        slots[slotName] = compilationGenerator(mightHaveMultipleTransclusionError, slots[slotName], transcludeFn);
                                    }
                                }
                            }

                            $compileNode.empty(); // clear contents
                            childTranscludeFn = compilationGenerator(mightHaveMultipleTransclusionError, $template, transcludeFn, undefined,
                                undefined, {needsNewScope: directive.$$isolateScope || directive.$$newScope});
                            childTranscludeFn.$$slots = slots;
                        }
                    }

                    if (directive.template) {
                        hasTemplate = true;
                        assertNoDuplicate('template', templateDirective, directive, $compileNode);
                        templateDirective = directive;

                        directiveValue = (isFunction(directive.template))
                            ? directive.template($compileNode, templateAttrs)
                            : directive.template;

                        directiveValue = denormalizeTemplate(directiveValue);

                        if (directive.replace) {
                            replaceDirective = directive;
                            if (jqLiteIsTextNode(directiveValue)) {
                                $template = [];
                            } else {
                                $template = removeComments(wrapTemplate(directive.templateNamespace, trim(directiveValue)));
                            }
                            compileNode = $template[0];

                            if ($template.length != 1 || compileNode.nodeType !== NODE_TYPE_ELEMENT) {
                                throw $compileMinErr('tplrt',
                                    "Template for directive '{0}' must have exactly one root element. {1}",
                                    directiveName, '');
                            }

                            replaceWith(jqCollection, $compileNode, compileNode);

                            var newTemplateAttrs = {$attr: {}};

                            // combine directives from the original node and from the template:
                            // - take the array of directives for this element
                            // - split it into two parts, those that already applied (processed) and those that weren't (unprocessed)
                            // - collect directives from the template and sort them by priority
                            // - combine directives as: processed + template + unprocessed
                            var templateDirectives = collectDirectives(compileNode, [], newTemplateAttrs);
                            var unprocessedDirectives = directives.splice(i + 1, directives.length - (i + 1));

                            if (newIsolateScopeDirective || newScopeDirective) {
                                // The original directive caused the current element to be replaced but this element
                                // also needs to have a new scope, so we need to tell the template directives
                                // that they would need to get their scope from further up, if they require transclusion
                                markDirectiveScope(templateDirectives, newIsolateScopeDirective, newScopeDirective);
                            }
                            directives = directives.concat(templateDirectives).concat(unprocessedDirectives);
                            mergeTemplateAttributes(templateAttrs, newTemplateAttrs);

                            ii = directives.length;
                        } else {
                            $compileNode.html(directiveValue);
                        }
                    }

                    if (directive.templateUrl) {
                        hasTemplate = true;
                        assertNoDuplicate('template', templateDirective, directive, $compileNode);
                        templateDirective = directive;

                        if (directive.replace) {
                            replaceDirective = directive;
                        }

                        nodeLinkFn = compileTemplateUrl(directives.splice(i, directives.length - i), $compileNode,
                            templateAttrs, jqCollection, hasTranscludeDirective && childTranscludeFn, preLinkFns, postLinkFns, {
                                controllerDirectives: controllerDirectives,
                                newScopeDirective: (newScopeDirective !== directive) && newScopeDirective,
                                newIsolateScopeDirective: newIsolateScopeDirective,
                                templateDirective: templateDirective,
                                nonTlbTranscludeDirective: nonTlbTranscludeDirective
                            });
                        ii = directives.length;
                    } else if (directive.compile) {
                        try {
                            linkFn = directive.compile($compileNode, templateAttrs, childTranscludeFn);
                            if (isFunction(linkFn)) {
                                addLinkFns(null, linkFn, attrStart, attrEnd);
                            } else if (linkFn) {
                                addLinkFns(linkFn.pre, linkFn.post, attrStart, attrEnd);
                            }
                        } catch (e) {
                            $exceptionHandler(e, startingTag($compileNode));
                        }
                    }

                    if (directive.terminal) {
                        nodeLinkFn.terminal = true;
                        terminalPriority = Math.max(terminalPriority, directive.priority);
                    }

                }

                nodeLinkFn.scope = newScopeDirective && newScopeDirective.scope === true;
                nodeLinkFn.transcludeOnThisElement = hasTranscludeDirective;
                nodeLinkFn.templateOnThisElement = hasTemplate;
                nodeLinkFn.transclude = childTranscludeFn;

                previousCompileContext.hasElementTranscludeDirective = hasElementTranscludeDirective;

                // might be normal or delayed nodeLinkFn depending on if templateUrl is present
                return nodeLinkFn;

                ////////////////////

                function addLinkFns(pre, post, attrStart, attrEnd) {
                    if (pre) {
                        if (attrStart) pre = groupElementsLinkFnWrapper(pre, attrStart, attrEnd);
                        pre.require = directive.require;
                        pre.directiveName = directiveName;
                        if (newIsolateScopeDirective === directive || directive.$$isolateScope) {
                            pre = cloneAndAnnotateFn(pre, {isolateScope: true});
                        }
                        preLinkFns.push(pre);
                    }
                    if (post) {
                        if (attrStart) post = groupElementsLinkFnWrapper(post, attrStart, attrEnd);
                        post.require = directive.require;
                        post.directiveName = directiveName;
                        if (newIsolateScopeDirective === directive || directive.$$isolateScope) {
                            post = cloneAndAnnotateFn(post, {isolateScope: true});
                        }
                        postLinkFns.push(post);
                    }
                }


                function getControllers(directiveName, require, $element, elementControllers) {
                    var value;

                    if (isString(require)) {
                        var match = require.match(REQUIRE_PREFIX_REGEXP);
                        var name = require.substring(match[0].length);
                        var inheritType = match[1] || match[3];
                        var optional = match[2] === '?';

                        //If only parents then start at the parent element
                        if (inheritType === '^^') {
                            $element = $element.parent();
                            //Otherwise attempt getting the controller from elementControllers in case
                            //the element is transcluded (and has no data) and to avoid .data if possible
                        } else {
                            value = elementControllers && elementControllers[name];
                            value = value && value.instance;
                        }

                        if (!value) {
                            var dataName = '$' + name + 'Controller';
                            value = inheritType ? $element.inheritedData(dataName) : $element.data(dataName);
                        }

                        if (!value && !optional) {
                            throw $compileMinErr('ctreq',
                                "Controller '{0}', required by directive '{1}', can't be found!",
                                name, directiveName);
                        }
                    } else if (isArray(require)) {
                        value = [];
                        for (var i = 0, ii = require.length; i < ii; i++) {
                            value[i] = getControllers(directiveName, require[i], $element, elementControllers);
                        }
                    } else if (isObject(require)) {
                        value = {};
                        forEach(require, function (controller, property) {
                            value[property] = getControllers(directiveName, controller, $element, elementControllers);
                        });
                    }

                    return value || null;
                }

                function setupControllers($element, attrs, transcludeFn, controllerDirectives, isolateScope, scope) {
                    var elementControllers = createMap();
                    for (var controllerKey in controllerDirectives) {
                        var directive = controllerDirectives[controllerKey];
                        var locals = {
                            $scope: directive === newIsolateScopeDirective || directive.$$isolateScope ? isolateScope : scope,
                            $element: $element,
                            $attrs: attrs,
                            $transclude: transcludeFn
                        };

                        var controller = directive.controller;
                        if (controller == '@') {
                            controller = attrs[directive.name];
                        }

                        var controllerInstance = $controller(controller, locals, true, directive.controllerAs);

                        // For directives with element transclusion the element is a comment,
                        // but jQuery .data doesn't support attaching data to comment nodes as it's hard to
                        // clean up (http://bugs.jquery.com/ticket/8335).
                        // Instead, we save the controllers for the element in a local hash and attach to .data
                        // later, once we have the actual element.
                        elementControllers[directive.name] = controllerInstance;
                        if (!hasElementTranscludeDirective) {
                            $element.data('$' + directive.name + 'Controller', controllerInstance.instance);
                        }
                    }
                    return elementControllers;
                }

                function nodeLinkFn(childLinkFn, scope, linkNode, $rootElement, boundTranscludeFn) {
                    var i, ii, linkFn, isolateScope, controllerScope, elementControllers, transcludeFn, $element,
                        attrs, removeScopeBindingWatches, removeControllerBindingWatches;

                    if (compileNode === linkNode) {
                        attrs = templateAttrs;
                        $element = templateAttrs.$$element;
                    } else {
                        $element = jqLite(linkNode);
                        attrs = new Attributes($element, templateAttrs);
                    }

                    controllerScope = scope;
                    if (newIsolateScopeDirective) {
                        isolateScope = scope.$new(true);
                    } else if (newScopeDirective) {
                        controllerScope = scope.$parent;
                    }

                    if (boundTranscludeFn) {
                        // track `boundTranscludeFn` so it can be unwrapped if `transcludeFn`
                        // is later passed as `parentBoundTranscludeFn` to `publicLinkFn`
                        transcludeFn = controllersBoundTransclude;
                        transcludeFn.$$boundTransclude = boundTranscludeFn;
                        // expose the slots on the `$transclude` function
                        transcludeFn.isSlotFilled = function (slotName) {
                            return !!boundTranscludeFn.$$slots[slotName];
                        };
                    }

                    if (controllerDirectives) {
                        elementControllers = setupControllers($element, attrs, transcludeFn, controllerDirectives, isolateScope, scope);
                    }

                    if (newIsolateScopeDirective) {
                        // Initialize isolate scope bindings for new isolate scope directive.
                        compile.$$addScopeInfo($element, isolateScope, true, !(templateDirective && (templateDirective === newIsolateScopeDirective ||
                        templateDirective === newIsolateScopeDirective.$$originalDirective)));
                        compile.$$addScopeClass($element, true);
                        isolateScope.$$isolateBindings =
                            newIsolateScopeDirective.$$isolateBindings;
                        removeScopeBindingWatches = initializeDirectiveBindings(scope, attrs, isolateScope,
                            isolateScope.$$isolateBindings,
                            newIsolateScopeDirective);
                        if (removeScopeBindingWatches) {
                            isolateScope.$on('$destroy', removeScopeBindingWatches);
                        }
                    }

                    // Initialize bindToController bindings
                    for (var name in elementControllers) {
                        var controllerDirective = controllerDirectives[name];
                        var controller = elementControllers[name];
                        var bindings = controllerDirective.$$bindings.bindToController;

                        if (controller.identifier && bindings) {
                            removeControllerBindingWatches =
                                initializeDirectiveBindings(controllerScope, attrs, controller.instance, bindings, controllerDirective);
                        }

                        var controllerResult = controller();
                        if (controllerResult !== controller.instance) {
                            // If the controller constructor has a return value, overwrite the instance
                            // from setupControllers
                            controller.instance = controllerResult;
                            $element.data('$' + controllerDirective.name + 'Controller', controllerResult);
                            removeControllerBindingWatches && removeControllerBindingWatches();
                            removeControllerBindingWatches =
                                initializeDirectiveBindings(controllerScope, attrs, controller.instance, bindings, controllerDirective);
                        }
                    }

                    // Bind the required controllers to the controller, if `require` is an object and `bindToController` is truthy
                    forEach(controllerDirectives, function (controllerDirective, name) {
                        var require = controllerDirective.require;
                        if (controllerDirective.bindToController && !isArray(require) && isObject(require)) {
                            extend(elementControllers[name].instance, getControllers(name, require, $element, elementControllers));
                        }
                    });

                    // Trigger the `$onInit` method on all controllers that have one
                    forEach(elementControllers, function (controller) {
                        if (isFunction(controller.instance.$onInit)) {
                            controller.instance.$onInit();
                        }
                    });

                    // PRELINKING
                    for (i = 0, ii = preLinkFns.length; i < ii; i++) {
                        linkFn = preLinkFns[i];
                        invokeLinkFn(linkFn,
                            linkFn.isolateScope ? isolateScope : scope,
                            $element,
                            attrs,
                            linkFn.require && getControllers(linkFn.directiveName, linkFn.require, $element, elementControllers),
                            transcludeFn
                        );
                    }

                    // RECURSION
                    // We only pass the isolate scope, if the isolate directive has a template,
                    // otherwise the child elements do not belong to the isolate directive.
                    var scopeToChild = scope;
                    if (newIsolateScopeDirective && (newIsolateScopeDirective.template || newIsolateScopeDirective.templateUrl === null)) {
                        scopeToChild = isolateScope;
                    }
                    childLinkFn && childLinkFn(scopeToChild, linkNode.childNodes, undefined, boundTranscludeFn);

                    // POSTLINKING
                    for (i = postLinkFns.length - 1; i >= 0; i--) {
                        linkFn = postLinkFns[i];
                        invokeLinkFn(linkFn,
                            linkFn.isolateScope ? isolateScope : scope,
                            $element,
                            attrs,
                            linkFn.require && getControllers(linkFn.directiveName, linkFn.require, $element, elementControllers),
                            transcludeFn
                        );
                    }

                    // This is the function that is injected as `$transclude`.
                    // Note: all arguments are optional!
                    function controllersBoundTransclude(scope, cloneAttachFn, futureParentElement, slotName) {
                        var transcludeControllers;
                        // No scope passed in:
                        if (!isScope(scope)) {
                            slotName = futureParentElement;
                            futureParentElement = cloneAttachFn;
                            cloneAttachFn = scope;
                            scope = undefined;
                        }

                        if (hasElementTranscludeDirective) {
                            transcludeControllers = elementControllers;
                        }
                        if (!futureParentElement) {
                            futureParentElement = hasElementTranscludeDirective ? $element.parent() : $element;
                        }
                        if (slotName) {
                            // slotTranscludeFn can be one of three things:
                            //  * a transclude function - a filled slot
                            //  * `null` - an optional slot that was not filled
                            //  * `undefined` - a slot that was not declared (i.e. invalid)
                            var slotTranscludeFn = boundTranscludeFn.$$slots[slotName];
                            if (slotTranscludeFn) {
                                return slotTranscludeFn(scope, cloneAttachFn, transcludeControllers, futureParentElement, scopeToChild);
                            } else if (isUndefined(slotTranscludeFn)) {
                                throw $compileMinErr('noslot',
                                    'No parent directive that requires a transclusion with slot name "{0}". ' +
                                    'Element: {1}',
                                    slotName, startingTag($element));
                            }
                        } else {
                            return boundTranscludeFn(scope, cloneAttachFn, transcludeControllers, futureParentElement, scopeToChild);
                        }
                    }
                }
            }

            // Depending upon the context in which a directive finds itself it might need to have a new isolated
            // or child scope created. For instance:
            // * if the directive has been pulled into a template because another directive with a higher priority
            // asked for element transclusion
            // * if the directive itself asks for transclusion but it is at the root of a template and the original
            // element was replaced. See https://github.com/angular/angular.js/issues/12936
            function markDirectiveScope(directives, isolateScope, newScope) {
                for (var j = 0, jj = directives.length; j < jj; j++) {
                    directives[j] = inherit(directives[j], {$$isolateScope: isolateScope, $$newScope: newScope});
                }
            }

            /**
             * looks up the directive and decorates it with exception handling and proper parameters. We
             * call this the boundDirective.
             *
             * @param {string} name name of the directive to look up.
             * @param {string} location The directive must be found in specific format.
             *   String containing any of theses characters:
             *
             *   * `E`: element name
             *   * `A': attribute
             *   * `C`: class
             *   * `M`: comment
             * @returns {boolean} true if directive was added.
             */
            function addDirective(tDirectives, name, location, maxPriority, ignoreDirective, startAttrName,
                                  endAttrName) {
                if (name === ignoreDirective) return null;
                var match = null;
                if (hasDirectives.hasOwnProperty(name)) {
                    for (var directive, directives = $injector.get(name + Suffix),
                             i = 0, ii = directives.length; i < ii; i++) {
                        try {
                            directive = directives[i];
                            if ((isUndefined(maxPriority) || maxPriority > directive.priority) &&
                                directive.restrict.indexOf(location) != -1) {
                                if (startAttrName) {
                                    directive = inherit(directive, {$$start: startAttrName, $$end: endAttrName});
                                }
                                if (!directive.$$bindings) {
                                    var bindings = directive.$$bindings =
                                        parseDirectiveBindings(directive, directive.name);
                                    if (isObject(bindings.isolateScope)) {
                                        directive.$$isolateBindings = bindings.isolateScope;
                                    }
                                }
                                tDirectives.push(directive);
                                match = directive;
                            }
                        } catch (e) {
                            $exceptionHandler(e);
                        }
                    }
                }
                return match;
            }


            /**
             * looks up the directive and returns true if it is a multi-element directive,
             * and therefore requires DOM nodes between -start and -end markers to be grouped
             * together.
             *
             * @param {string} name name of the directive to look up.
             * @returns true if directive was registered as multi-element.
             */
            function directiveIsMultiElement(name) {
                if (hasDirectives.hasOwnProperty(name)) {
                    for (var directive, directives = $injector.get(name + Suffix),
                             i = 0, ii = directives.length; i < ii; i++) {
                        directive = directives[i];
                        if (directive.multiElement) {
                            return true;
                        }
                    }
                }
                return false;
            }

            /**
             * When the element is replaced with HTML template then the new attributes
             * on the template need to be merged with the existing attributes in the DOM.
             * The desired effect is to have both of the attributes present.
             *
             * @param {object} dst destination attributes (original DOM)
             * @param {object} src source attributes (from the directive template)
             */
            function mergeTemplateAttributes(dst, src) {
                var srcAttr = src.$attr,
                    dstAttr = dst.$attr,
                    $element = dst.$$element;

                // reapply the old attributes to the new element
                forEach(dst, function (value, key) {
                    if (key.charAt(0) != '$') {
                        if (src[key] && src[key] !== value) {
                            value += (key === 'style' ? ';' : ' ') + src[key];
                        }
                        dst.$set(key, value, true, srcAttr[key]);
                    }
                });

                // copy the new attributes on the old attrs object
                forEach(src, function (value, key) {
                    if (key == 'class') {
                        safeAddClass($element, value);
                        dst['class'] = (dst['class'] ? dst['class'] + ' ' : '') + value;
                    } else if (key == 'style') {
                        $element.attr('style', $element.attr('style') + ';' + value);
                        dst['style'] = (dst['style'] ? dst['style'] + ';' : '') + value;
                        // `dst` will never contain hasOwnProperty as DOM parser won't let it.
                        // You will get an "InvalidCharacterError: DOM Exception 5" error if you
                        // have an attribute like "has-own-property" or "data-has-own-property", etc.
                    } else if (key.charAt(0) != '$' && !dst.hasOwnProperty(key)) {
                        dst[key] = value;
                        dstAttr[key] = srcAttr[key];
                    }
                });
            }


            function compileTemplateUrl(directives, $compileNode, tAttrs,
                                        $rootElement, childTranscludeFn, preLinkFns, postLinkFns, previousCompileContext) {
                var linkQueue = [],
                    afterTemplateNodeLinkFn,
                    afterTemplateChildLinkFn,
                    beforeTemplateCompileNode = $compileNode[0],
                    origAsyncDirective = directives.shift(),
                    derivedSyncDirective = inherit(origAsyncDirective, {
                        templateUrl: null, transclude: null, replace: null, $$originalDirective: origAsyncDirective
                    }),
                    templateUrl = (isFunction(origAsyncDirective.templateUrl))
                        ? origAsyncDirective.templateUrl($compileNode, tAttrs)
                        : origAsyncDirective.templateUrl,
                    templateNamespace = origAsyncDirective.templateNamespace;

                $compileNode.empty();

                $templateRequest(templateUrl)
                    .then(function (content) {
                        var compileNode, tempTemplateAttrs, $template, childBoundTranscludeFn;

                        content = denormalizeTemplate(content);

                        if (origAsyncDirective.replace) {
                            if (jqLiteIsTextNode(content)) {
                                $template = [];
                            } else {
                                $template = removeComments(wrapTemplate(templateNamespace, trim(content)));
                            }
                            compileNode = $template[0];

                            if ($template.length != 1 || compileNode.nodeType !== NODE_TYPE_ELEMENT) {
                                throw $compileMinErr('tplrt',
                                    "Template for directive '{0}' must have exactly one root element. {1}",
                                    origAsyncDirective.name, templateUrl);
                            }

                            tempTemplateAttrs = {$attr: {}};
                            replaceWith($rootElement, $compileNode, compileNode);
                            var templateDirectives = collectDirectives(compileNode, [], tempTemplateAttrs);

                            if (isObject(origAsyncDirective.scope)) {
                                // the original directive that caused the template to be loaded async required
                                // an isolate scope
                                markDirectiveScope(templateDirectives, true);
                            }
                            directives = templateDirectives.concat(directives);
                            mergeTemplateAttributes(tAttrs, tempTemplateAttrs);
                        } else {
                            compileNode = beforeTemplateCompileNode;
                            $compileNode.html(content);
                        }

                        directives.unshift(derivedSyncDirective);

                        afterTemplateNodeLinkFn = applyDirectivesToNode(directives, compileNode, tAttrs,
                            childTranscludeFn, $compileNode, origAsyncDirective, preLinkFns, postLinkFns,
                            previousCompileContext);
                        forEach($rootElement, function (node, i) {
                            if (node == compileNode) {
                                $rootElement[i] = $compileNode[0];
                            }
                        });
                        afterTemplateChildLinkFn = compileNodes($compileNode[0].childNodes, childTranscludeFn);

                        while (linkQueue.length) {
                            var scope = linkQueue.shift(),
                                beforeTemplateLinkNode = linkQueue.shift(),
                                linkRootElement = linkQueue.shift(),
                                boundTranscludeFn = linkQueue.shift(),
                                linkNode = $compileNode[0];

                            if (scope.$$destroyed) continue;

                            if (beforeTemplateLinkNode !== beforeTemplateCompileNode) {
                                var oldClasses = beforeTemplateLinkNode.className;

                                if (!(previousCompileContext.hasElementTranscludeDirective &&
                                    origAsyncDirective.replace)) {
                                    // it was cloned therefore we have to clone as well.
                                    linkNode = jqLiteClone(compileNode);
                                }
                                replaceWith(linkRootElement, jqLite(beforeTemplateLinkNode), linkNode);

                                // Copy in CSS classes from original node
                                safeAddClass(jqLite(linkNode), oldClasses);
                            }
                            if (afterTemplateNodeLinkFn.transcludeOnThisElement) {
                                childBoundTranscludeFn = createBoundTranscludeFn(scope, afterTemplateNodeLinkFn.transclude, boundTranscludeFn);
                            } else {
                                childBoundTranscludeFn = boundTranscludeFn;
                            }
                            afterTemplateNodeLinkFn(afterTemplateChildLinkFn, scope, linkNode, $rootElement,
                                childBoundTranscludeFn);
                        }
                        linkQueue = null;
                    });

                return function delayedNodeLinkFn(ignoreChildLinkFn, scope, node, rootElement, boundTranscludeFn) {
                    var childBoundTranscludeFn = boundTranscludeFn;
                    if (scope.$$destroyed) return;
                    if (linkQueue) {
                        linkQueue.push(scope,
                            node,
                            rootElement,
                            childBoundTranscludeFn);
                    } else {
                        if (afterTemplateNodeLinkFn.transcludeOnThisElement) {
                            childBoundTranscludeFn = createBoundTranscludeFn(scope, afterTemplateNodeLinkFn.transclude, boundTranscludeFn);
                        }
                        afterTemplateNodeLinkFn(afterTemplateChildLinkFn, scope, node, rootElement, childBoundTranscludeFn);
                    }
                };
            }


            /**
             * Sorting function for bound directives.
             */
            function byPriority(a, b) {
                var diff = b.priority - a.priority;
                if (diff !== 0) return diff;
                if (a.name !== b.name) return (a.name < b.name) ? -1 : 1;
                return a.index - b.index;
            }

            function assertNoDuplicate(what, previousDirective, directive, element) {

                function wrapModuleNameIfDefined(moduleName) {
                    return moduleName ?
                        (' (module: ' + moduleName + ')') :
                        '';
                }

                if (previousDirective) {
                    throw $compileMinErr('multidir', 'Multiple directives [{0}{1}, {2}{3}] asking for {4} on: {5}',
                        previousDirective.name, wrapModuleNameIfDefined(previousDirective.$$moduleName),
                        directive.name, wrapModuleNameIfDefined(directive.$$moduleName), what, startingTag(element));
                }
            }


            function addTextInterpolateDirective(directives, text) {
                var interpolateFn = $interpolate(text, true);
                if (interpolateFn) {
                    directives.push({
                        priority: 0,
                        compile: function textInterpolateCompileFn(templateNode) {
                            var templateNodeParent = templateNode.parent(),
                                hasCompileParent = !!templateNodeParent.length;

                            // When transcluding a template that has bindings in the root
                            // we don't have a parent and thus need to add the class during linking fn.
                            if (hasCompileParent) compile.$$addBindingClass(templateNodeParent);

                            return function textInterpolateLinkFn(scope, node) {
                                var parent = node.parent();
                                if (!hasCompileParent) compile.$$addBindingClass(parent);
                                compile.$$addBindingInfo(parent, interpolateFn.expressions);
                                scope.$watch(interpolateFn, function interpolateFnWatchAction(value) {
                                    node[0].nodeValue = value;
                                });
                            };
                        }
                    });
                }
            }


            function wrapTemplate(type, template) {
                type = lowercase(type || 'html');
                switch (type) {
                    case 'svg':
                    case 'math':
                        var wrapper = document.createElement('div');
                        wrapper.innerHTML = '<' + type + '>' + template + '</' + type + '>';
                        return wrapper.childNodes[0].childNodes;
                    default:
                        return template;
                }
            }


            function getTrustedContext(node, attrNormalizedName) {
                if (attrNormalizedName == "srcdoc") {
                    return $sce.HTML;
                }
                var tag = nodeName_(node);
                // maction[xlink:href] can source SVG.  It's not limited to <maction>.
                if (attrNormalizedName == "xlinkHref" ||
                    (tag == "form" && attrNormalizedName == "action") ||
                    (tag != "img" && (attrNormalizedName == "src" ||
                    attrNormalizedName == "ngSrc"))) {
                    return $sce.RESOURCE_URL;
                }
            }


            function addAttrInterpolateDirective(node, directives, value, name, allOrNothing) {
                var trustedContext = getTrustedContext(node, name);
                allOrNothing = ALL_OR_NOTHING_ATTRS[name] || allOrNothing;

                var interpolateFn = $interpolate(value, true, trustedContext, allOrNothing);

                // no interpolation found -> ignore
                if (!interpolateFn) return;


                if (name === "multiple" && nodeName_(node) === "select") {
                    throw $compileMinErr("selmulti",
                        "Binding to the 'multiple' attribute is not supported. Element: {0}",
                        startingTag(node));
                }

                directives.push({
                    priority: 100,
                    compile: function () {
                        return {
                            pre: function attrInterpolatePreLinkFn(scope, element, attr) {
                                var $$observers = (attr.$$observers || (attr.$$observers = createMap()));

                                if (EVENT_HANDLER_ATTR_REGEXP.test(name)) {
                                    throw $compileMinErr('nodomevents',
                                        "Interpolations for HTML DOM event attributes are disallowed.  Please use the " +
                                        "ng- versions (such as ng-click instead of onclick) instead.");
                                }

                                // If the attribute has changed since last $interpolate()ed
                                var newValue = attr[name];
                                if (newValue !== value) {
                                    // we need to interpolate again since the attribute value has been updated
                                    // (e.g. by another directive's compile function)
                                    // ensure unset/empty values make interpolateFn falsy
                                    interpolateFn = newValue && $interpolate(newValue, true, trustedContext, allOrNothing);
                                    value = newValue;
                                }

                                // if attribute was updated so that there is no interpolation going on we don't want to
                                // register any observers
                                if (!interpolateFn) return;

                                // initialize attr object so that it's ready in case we need the value for isolate
                                // scope initialization, otherwise the value would not be available from isolate
                                // directive's linking fn during linking phase
                                attr[name] = interpolateFn(scope);

                                ($$observers[name] || ($$observers[name] = [])).$$inter = true;
                                (attr.$$observers && attr.$$observers[name].$$scope || scope).$watch(interpolateFn, function interpolateFnWatchAction(newValue, oldValue) {
                                    //special case for class attribute addition + removal
                                    //so that class changes can tap into the animation
                                    //hooks provided by the $animate service. Be sure to
                                    //skip animations when the first digest occurs (when
                                    //both the new and the old values are the same) since
                                    //the CSS classes are the non-interpolated values
                                    if (name === 'class' && newValue != oldValue) {
                                        attr.$updateClass(newValue, oldValue);
                                    } else {
                                        attr.$set(name, newValue);
                                    }
                                });
                            }
                        };
                    }
                });
            }


            /**
             * This is a special jqLite.replaceWith, which can replace items which
             * have no parents, provided that the containing jqLite collection is provided.
             *
             * @param {JqLite=} $rootElement The root of the compile tree. Used so that we can replace nodes
             *                               in the root of the tree.
             * @param {JqLite} elementsToRemove The jqLite element which we are going to replace. We keep
             *                                  the shell, but replace its DOM node reference.
             * @param {Node} newNode The new DOM node.
             */
            function replaceWith($rootElement, elementsToRemove, newNode) {
                var firstElementToRemove = elementsToRemove[0],
                    removeCount = elementsToRemove.length,
                    parent = firstElementToRemove.parentNode,
                    i, ii;

                if ($rootElement) {
                    for (i = 0, ii = $rootElement.length; i < ii; i++) {
                        if ($rootElement[i] == firstElementToRemove) {
                            $rootElement[i++] = newNode;
                            for (var j = i, j2 = j + removeCount - 1,
                                     jj = $rootElement.length;
                                 j < jj; j++, j2++) {
                                if (j2 < jj) {
                                    $rootElement[j] = $rootElement[j2];
                                } else {
                                    delete $rootElement[j];
                                }
                            }
                            $rootElement.length -= removeCount - 1;

                            // If the replaced element is also the jQuery .context then replace it
                            // .context is a deprecated jQuery api, so we should set it only when jQuery set it
                            // http://api.jquery.com/context/
                            if ($rootElement.context === firstElementToRemove) {
                                $rootElement.context = newNode;
                            }
                            break;
                        }
                    }
                }

                if (parent) {
                    parent.replaceChild(newNode, firstElementToRemove);
                }

                // Append all the `elementsToRemove` to a fragment. This will...
                // - remove them from the DOM
                // - allow them to still be traversed with .nextSibling
                // - allow a single fragment.qSA to fetch all elements being removed
                var fragment = document.createDocumentFragment();
                for (i = 0; i < removeCount; i++) {
                    fragment.appendChild(elementsToRemove[i]);
                }

                if (jqLite.hasData(firstElementToRemove)) {
                    // Copy over user data (that includes Angular's $scope etc.). Don't copy private
                    // data here because there's no public interface in jQuery to do that and copying over
                    // event listeners (which is the main use of private data) wouldn't work anyway.
                    jqLite.data(newNode, jqLite.data(firstElementToRemove));

                    // Remove $destroy event listeners from `firstElementToRemove`
                    jqLite(firstElementToRemove).off('$destroy');
                }

                // Cleanup any data/listeners on the elements and children.
                // This includes invoking the $destroy event on any elements with listeners.
                jqLite.cleanData(fragment.querySelectorAll('*'));

                // Update the jqLite collection to only contain the `newNode`
                for (i = 1; i < removeCount; i++) {
                    delete elementsToRemove[i];
                }
                elementsToRemove[0] = newNode;
                elementsToRemove.length = 1;
            }


            function cloneAndAnnotateFn(fn, annotation) {
                return extend(function () {
                    return fn.apply(null, arguments);
                }, fn, annotation);
            }


            function invokeLinkFn(linkFn, scope, $element, attrs, controllers, transcludeFn) {
                try {
                    linkFn(scope, $element, attrs, controllers, transcludeFn);
                } catch (e) {
                    $exceptionHandler(e, startingTag($element));
                }
            }


            // Set up $watches for isolate scope and controller bindings. This process
            // only occurs for isolate scopes and new scopes with controllerAs.
            function initializeDirectiveBindings(scope, attrs, destination, bindings, directive) {
                var removeWatchCollection = [];
                forEach(bindings, function (definition, scopeName) {
                    var attrName = definition.attrName,
                        optional = definition.optional,
                        mode = definition.mode, // @, =, or &
                        lastValue,
                        parentGet, parentSet, compare, removeWatch;

                    switch (mode) {

                        case '@':
                            if (!optional && !hasOwnProperty.call(attrs, attrName)) {
                                destination[scopeName] = attrs[attrName] = void 0;
                            }
                            attrs.$observe(attrName, function (value) {
                                if (isString(value)) {
                                    destination[scopeName] = value;
                                }
                            });
                            attrs.$$observers[attrName].$$scope = scope;
                            lastValue = attrs[attrName];
                            if (isString(lastValue)) {
                                // If the attribute has been provided then we trigger an interpolation to ensure
                                // the value is there for use in the link fn
                                destination[scopeName] = $interpolate(lastValue)(scope);
                            } else if (isBoolean(lastValue)) {
                                // If the attributes is one of the BOOLEAN_ATTR then Angular will have converted
                                // the value to boolean rather than a string, so we special case this situation
                                destination[scopeName] = lastValue;
                            }
                            break;

                        case '=':
                            if (!hasOwnProperty.call(attrs, attrName)) {
                                if (optional) break;
                                attrs[attrName] = void 0;
                            }
                            if (optional && !attrs[attrName]) break;

                            parentGet = $parse(attrs[attrName]);
                            if (parentGet.literal) {
                                compare = equals;
                            } else {
                                compare = function (a, b) {
                                    return a === b || (a !== a && b !== b);
                                };
                            }
                            parentSet = parentGet.assign || function () {
                                    // reset the change, or we will throw this exception on every $digest
                                    lastValue = destination[scopeName] = parentGet(scope);
                                    throw $compileMinErr('nonassign',
                                        "Expression '{0}' in attribute '{1}' used with directive '{2}' is non-assignable!",
                                        attrs[attrName], attrName, directive.name);
                                };
                            lastValue = destination[scopeName] = parentGet(scope);
                            var parentValueWatch = function parentValueWatch(parentValue) {
                                if (!compare(parentValue, destination[scopeName])) {
                                    // we are out of sync and need to copy
                                    if (!compare(parentValue, lastValue)) {
                                        // parent changed and it has precedence
                                        destination[scopeName] = parentValue;
                                    } else {
                                        // if the parent can be assigned then do so
                                        parentSet(scope, parentValue = destination[scopeName]);
                                    }
                                }
                                return lastValue = parentValue;
                            };
                            parentValueWatch.$stateful = true;
                            if (definition.collection) {
                                removeWatch = scope.$watchCollection(attrs[attrName], parentValueWatch);
                            } else {
                                removeWatch = scope.$watch($parse(attrs[attrName], parentValueWatch), null, parentGet.literal);
                            }
                            removeWatchCollection.push(removeWatch);
                            break;

                        case '<':
                            if (!hasOwnProperty.call(attrs, attrName)) {
                                if (optional) break;
                                attrs[attrName] = void 0;
                            }
                            if (optional && !attrs[attrName]) break;

                            parentGet = $parse(attrs[attrName]);

                            destination[scopeName] = parentGet(scope);

                            removeWatch = scope.$watch(parentGet, function parentValueWatchAction(newParentValue) {
                                destination[scopeName] = newParentValue;
                            }, parentGet.literal);

                            removeWatchCollection.push(removeWatch);
                            break;

                        case '&':
                            // Don't assign Object.prototype method to scope
                            parentGet = attrs.hasOwnProperty(attrName) ? $parse(attrs[attrName]) : noop;

                            // Don't assign noop to destination if expression is not valid
                            if (parentGet === noop && optional) break;

                            destination[scopeName] = function (locals) {
                                return parentGet(scope, locals);
                            };
                            break;
                    }
                });

                return removeWatchCollection.length && function removeWatches() {
                        for (var i = 0, ii = removeWatchCollection.length; i < ii; ++i) {
                            removeWatchCollection[i]();
                        }
                    };
            }
        }];
}

var PREFIX_REGEXP = /^((?:x|data)[\:\-_])/i;
/**
 * Converts all accepted directives format into proper directive name.
 * @param name Name to normalize
 */
function directiveNormalize(name) {
    return camelCase(name.replace(PREFIX_REGEXP, ''));
}

/**
 * @ngdoc type
 * @name $compile.directive.Attributes
 *
 * @description
 * A shared object between directive compile / linking functions which contains normalized DOM
 * element attributes. The values reflect current binding state `{{ }}`. The normalization is
 * needed since all of these are treated as equivalent in Angular:
 *
 * ```
 *    <span ng:bind="a" ng-bind="a" data-ng-bind="a" x-ng-bind="a">
 * ```
 */

/**
 * @ngdoc property
 * @name $compile.directive.Attributes#$attr
 *
 * @description
 * A map of DOM element attribute names to the normalized name. This is
 * needed to do reverse lookup from normalized name back to actual name.
 */


/**
 * @ngdoc method
 * @name $compile.directive.Attributes#$set
 * @kind function
 *
 * @description
 * Set DOM element attribute value.
 *
 *
 * @param {string} name Normalized element attribute name of the property to modify. The name is
 *          reverse-translated using the {@link ng.$compile.directive.Attributes#$attr $attr}
 *          property to the original name.
 * @param {string} value Value to set the attribute to. The value can be an interpolated string.
 */


/**
 * Closure compiler type information
 */

function nodesetLinkingFn(/* angular.Scope */ scope,
                          /* NodeList */ nodeList,
                          /* Element */ rootElement,
                          /* function(Function) */ boundTranscludeFn) {
}

function directiveLinkingFn(/* nodesetLinkingFn */ nodesetLinkingFn,
                            /* angular.Scope */ scope,
                            /* Node */ node,
                            /* Element */ rootElement,
                            /* function(Function) */ boundTranscludeFn) {
}

function tokenDifference(str1, str2) {
    var values = '',
        tokens1 = str1.split(/\s+/),
        tokens2 = str2.split(/\s+/);

    outer:
        for (var i = 0; i < tokens1.length; i++) {
            var token = tokens1[i];
            for (var j = 0; j < tokens2.length; j++) {
                if (token == tokens2[j]) continue outer;
            }
            values += (values.length > 0 ? ' ' : '') + token;
        }
    return values;
}

function removeComments(jqNodes) {
    jqNodes = jqLite(jqNodes);
    var i = jqNodes.length;

    if (i <= 1) {
        return jqNodes;
    }

    while (i--) {
        var node = jqNodes[i];
        if (node.nodeType === NODE_TYPE_COMMENT) {
            splice.call(jqNodes, i, 1);
        }
    }
    return jqNodes;
}
