'use strict';

var $controllerMinErr = minErr('$controller');


var CNTRL_REG = /^(\S+)(\s+as\s+([\w$]+))?$/;
function identifierForController(controller, ident) {
    if (ident && isString(ident)) return ident;
    if (isString(controller)) {
        var match = CNTRL_REG.exec(controller);
        if (match) return match[3];
    }
}

function $ControllerProvider() {
    var controllers = {},
        globals = false;

    this.register = function (name, constructor) {
        assertNotHasOwnProperty(name, 'controller');
        if (isObject(name)) {
            extend(controllers, name);
        } else {
            controllers[name] = constructor;
        }
    };

    this.allowGlobals = function () {
        globals = true;
    };


    this.$get = ['$injector', '$window', function ($injector, $window) {


        return function (expression, locals, later, ident) {
            var instance, match, constructor, identifier;
            later = later === true;
            if (ident && isString(ident)) {
                identifier = ident;
            }

            if (isString(expression)) {
                match = expression.match(CNTRL_REG);
                if (!match) {
                    throw $controllerMinErr('ctrlfmt',
                        "Badly formed controller string '{0}'. " +
                        "Must match `__name__ as __id__` or `__name__`.", expression);
                }
                constructor = match[1],
                    identifier = identifier || match[3];
                expression = controllers.hasOwnProperty(constructor)
                    ? controllers[constructor]
                    : getter(locals.$scope, constructor, true) ||
                (globals ? getter($window, constructor, true) : undefined);

                assertArgFn(expression, constructor, true);
            }

            if (later) {
                var controllerPrototype = (isArray(expression) ?
                    expression[expression.length - 1] : expression).prototype;
                instance = Object.create(controllerPrototype || null);

                if (identifier) {
                    addIdentifier(locals, identifier, instance, constructor || expression.name);
                }

                var instantiate;
                return instantiate = extend(function () {
                    var result = $injector.invoke(expression, instance, locals, constructor);
                    if (result !== instance && (isObject(result) || isFunction(result))) {
                        instance = result;
                        if (identifier) {
                            // If result changed, re-assign controllerAs value to scope.
                            addIdentifier(locals, identifier, instance, constructor || expression.name);
                        }
                    }
                    return instance;
                }, {
                    instance: instance,
                    identifier: identifier
                });
            }

            instance = $injector.instantiate(expression, locals, constructor);

            if (identifier) {
                addIdentifier(locals, identifier, instance, constructor || expression.name);
            }

            return instance;
        };

        function addIdentifier(locals, identifier, instance, name) {
            if (!(locals && isObject(locals.$scope))) {
                throw minErr('$controller')('noscp',
                    "Cannot export controller '{0}' as '{1}'! No $scope object provided via `locals`.",
                    name, identifier);
            }

            locals.$scope[identifier] = instance;
        }
    }];
}
