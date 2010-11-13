// license.txt
/*********************************************************************

(this is the MIT license)

Copyright (c) 2010 Frank Schwieterman

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

**********************************************************************/
// DependencyGraphing.js


function DependencyGrapher(ioc) {
    this._ioc = ioc;
}

DependencyGrapher.prototype = {
    constructor: DependencyGrapher,

    GetRegisteredServices: function () {
        var result = [];

        var bindings = this._ioc._bindings;

        for (var name in bindings) {
            if (!bindings.hasOwnProperty(name))
                continue;

            result.push(name);
        }

        return result;
    },

    GetTopLevelServices: function () {

        //  Start with a list of all services.
        //  Enumerate the dependencies of every service, remove each from the list of all services.
        //  The remaining services have no dependencies.

        var servicesLeft = this.GetRegisteredServices();

        var bindings = this._ioc._bindings;

        for (var name in bindings) {
            if (!bindings.hasOwnProperty(name))
                continue;

            var binding = bindings[name];

            if (binding && binding.requires) {
                for (var i = 0; i < binding.requires.length; i++) {
                    for (var j = 0; j < servicesLeft.length; j++) {

                        if (servicesLeft[j] == binding.requires[i]) {
                            servicesLeft.splice(j, 1);
                            break;
                        }
                    }
                }
            }
        }

        return servicesLeft;
    },

    _dependencyWeights: {},

    GetWeightOfDependencies: function (serviceName) {

        var existing = this._dependencyWeights[serviceName];

        if (existing)
            return existing;

        var sum = 1;

        var binding = this._ioc._bindings[serviceName];

        if (binding) {

            var requires = binding.requires;

            if (requires) for (var i = 0; i < requires.length; i++) {

                sum += this.GetWeightOfDependencies(requires[i]);
            }
        }

        this._dependencyWeights[serviceName] = sum;

        return sum;
    },

    GetSortValue: function (name) {

        var index = 0;

        for (var key in this._ioc._bindings) {
            if (key == name)
                break;

            index++;
        }

        return index;
    },

    VisitDependencies: function (visitor, nodes, parent, depth) {

        nodes = nodes || this.GetTopLevelServices();
        parent = parent || null;
        depth = depth || 0;

        var that = this;

        var nodeCount = nodes.length;

        function getSortScore(name) {
            return that.GetWeightOfDependencies(name) * nodeCount - that.GetSortValue(name);
        }

        nodes.sort(function (a, b) {
            return getSortScore(b) - getSortScore(a);
        });

        for (var i = 0; i < nodes.length; i++) {

            var node = nodes[i];

            visitor(node, parent, depth);

            var nodeBinding = this._ioc._bindings[node];

            var requires = [];

            if (nodeBinding && nodeBinding.requires) {
                requires = nodeBinding.requires.slice(0);
            }

            this.VisitDependencies(visitor, requires, node, depth + 1);
        };
    },

    SimpleGraph: function () {

        var result = "";

        this.VisitDependencies(function (node, parent, depth) {
            result += new Array(depth + 1).join("    ") + node + "\n";
        });

        return result;
    }
}
// FakeJsfIoc.js


function FakeJsfIoc(ioc) {

    this._ioc = ioc;
    this._preloadedDependencies = [];
    this._includedServices = [];
    this.TestDoublePolicy = FakeJsfIoc.StubBehavior;
}

FakeJsfIoc.StubBehavior = function(dependencyName, functionName) { 
    return function() {};
};

FakeJsfIoc.MockBehavior = function(dependencyName, functionName) { 
    
    return function() {
        throw new Error("Unexpected call to " 
            + dependencyName + "." + functionName + "()"
            + " with " + arguments.length + " parameters");
    };
};


FakeJsfIoc.prototype = {
    Load: function (service) {
        /// <summary>Load a service, replacing all dependencies with test doubles.</summary>
        /// <param name="service" type="Function">
        ///     service constructor
        /// </param>

        var binding = this.GetBindingByClass(service);

        var result = new binding.service;

        dependencyLoadingLoop:
        for (var i = 0; i < binding.requires.length; i++) {

            var dependency = binding.requires[i];

            for (var includeIndex = 0; includeIndex < this._includedServices.length; includeIndex++) {
                if (dependency == this._includedServices[includeIndex]) {
                    result[dependency] = this.Load(this._ioc._bindings[dependency].service);
                    continue dependencyLoadingLoop;
                }
            }

            result[dependency] = this.LoadTestDouble(dependency);
        }

        for (var i = 0; i < binding.parameters.length; i++) {
            var parameter = binding.parameters[i];
            result[parameter.name] = arguments[1 + i];
        }

        for (var i = 0; i < binding.eventSource.length; i++) {

            result["_notify" + binding.eventSource[i]] =
                this.TestDoublePolicy(binding.GetFriendlyName(), "_notify" + binding.eventSource[i]);
        }

        return result;
    },
    LoadTestDouble: function (nameOrService) {
        /// <summary>Access the test doubles used as dependencies when .Load() is called.</summary>
        /// <param name="nameOrService">
        ///     service name or service constructor
        /// </param>
        /// <returns type="Boolean">return description</returns>
        
        name = nameOrService;

        if (typeof (nameOrService) == "function") {

            var service = nameOrService;

            name = this.GetBindingByClass(service).name;
        }

        if (this._preloadedDependencies[name]) {
            return this._preloadedDependencies[name];
        }

        var result = this._ioc._singletons[name];

        if (!result) {
            var binding = this._ioc._bindings[name];

            if (binding) {
                result = new (this._ioc._bindings[name].service);
            } else {
                throw "FakeJsfIoc could not find service: " + name;
            }
        }

        result = this.CloneAsTestDouble(result, name);

        this._preloadedDependencies[name] = result;

        return result;
    },
    IncludeReal: function (includedServices) {
        /// <summary>List services that should be loaded as dependencies without using test doubles.</summary>
        /// <param name="includedServices">
        ///     Name or name of arrays.
        /// </param>
        /// <returns type="FakeIoc">call Load</returns>
        
        var that = this;

        if (typeof(includedServices) == "string") {
            includedServices = [includedServices];
        }

        return {
            Load: function () {
                that._includedServices = includedServices;
                var result = that.Load.apply(that, arguments);
                that._includedServices = [];
                return result;
            }
        }

    },
    RegisterInstance: function (name, instance) {
        /// <summary>Register an object as a service by name.</summary>
        /// <param name="name">
        ///     Name of the service
        /// </param>
        /// <param name="instance">
        ///     The service instance
        /// </param>

        if (this._preloadedDependencies[name]) {
            throw new Error("Service " + name + " already has a test definition");
        }

        this._preloadedDependencies[name] = instance;
    },
    GetBindingByClass: function (service) {

        var binding = null;

        for (var bindingName in this._ioc._bindings) {

            if (!this._ioc._bindings.hasOwnProperty(bindingName)) {
                continue;
            };

            if (this._ioc._bindings[bindingName].service === service) {
                binding = this._ioc._bindings[bindingName];
                break;
            }
        }

        if (binding == null) {

            throw new Error("FakeJsfIoc could not find service: " + service);
        };

        return binding;
    },
    CloneAsTestDouble: function (obj, name) {

        var result = {};

        for (var memberFunction in obj) {
            // jasmine.log("replacing " + member + "." + memberFunction);

            result[memberFunction] = this.TestDoublePolicy(name, memberFunction);
        }

        return result;
    }
};

// GraphVizFormatting.js


function GraphVizFormatting(ioc) {
    this._ioc = ioc;
}

GraphVizFormatting.prototype = {
    constructor: GraphVizFormatting,

    GetBinding: function (name) {

        var binding = this._ioc._bindings[name];

        if (binding == null)
            return name + ' [ shape="record", label="' + name + ' | (instance)" ]';

        var bindingName = binding.GetFriendlyName();

        var eventListenerString = "";

        if (binding.eventListener.length > 0) {
            eventListenerString = " | \\>";

            var events = binding.eventListener.slice();

            events.sort();

            for (var i = 0; i < events.length; i++) {
                eventListenerString = eventListenerString + " " + events[i]

                if (i % 4 == 3) {
                    eventListenerString = eventListenerString + " | \\>";
                }
            }
        }

        var eventSourceString = "";

        if (binding.eventSource.length > 0) {
            eventSourceString = " |";

            var events = binding.eventSource.slice();

            events.sort();

            for (var i = 0; i < events.length; i++) {
                eventSourceString = eventSourceString + " " + events[i]

                if (i % 4 == 3) {
                    eventSourceString = eventSourceString + " \\> |";
                }
            }

            eventSourceString += " \\>";
        }

        var relationString = "";

        for (var i = 0; i < binding.requires.length; i++) {

            var targetName = binding.requires[i];

            if (this._ioc._bindings[targetName]) {
                targetName = this._ioc._bindings[targetName].GetFriendlyName();
            }

            relationString = relationString + "; " + bindingName + " -> " + targetName;
        }

        return bindingName + ' [ shape="record", label="' + bindingName + eventListenerString + eventSourceString + '" ]' + relationString;
    },

    AppendSampleCodetoDocument: function () {

        var vizString = 'digraph {\n    graph [rankdir = "LR"];';

        for (var bindingName in ioc._bindings) {

            if (!ioc._bindings.hasOwnProperty(bindingName))
                continue;

            vizString += "    " + this.GetBinding(bindingName) + "\n";
        }

        vizString += "}";

        $("body").append("<pre>" + vizString + "</pre>");
    }
}
