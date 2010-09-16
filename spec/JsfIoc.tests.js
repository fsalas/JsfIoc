﻿
describe("JsfIoc", function () {

    function Foo() {
    };

    function Bar() {
    };

    it("Register and load a minimal service", function () {

        var sut = new JsfIoc();

        sut.Register({
            name: "_foo",
            service: Foo
        });

        var result = sut.Load("_foo");

        expect(result instanceof Foo).toBeTruthy();
    });

    it("Register and load a service with a dependency", function () {

        var sut = new JsfIoc();

        sut.Register({
            name: "_bar",
            service: Bar
        });

        sut.Register({
            name: "_foo",
            service: Foo,
            requires: ["_bar"]
        });

        var result = sut.Load("_foo");

        expect(result._bar instanceof Bar).toBeTruthy();
    });

    describe("services can have configuration parameters they receive on startup", function () {

        it("Register and load a service with an initialization parameter", function () {

            var parameterValue = "123abc";

            var sut = new JsfIoc();

            sut.Register({
                name: "_foo",
                service: Foo,
                parameters: ["_fooLevel"]
            });

            var result = sut.Load("_foo", parameterValue);

            expect(result._fooLevel).toEqual(parameterValue);
        });

        it("Services can have their configuration values set before they are loaded", function () {

            var parameterValue = "123abc";

            var sut = new JsfIoc();

            sut.Register({
                name: "_foo",
                service: Foo,
                parameters: ["_fooLevel"]
            });

            sut.Configure("_foo", parameterValue);

            var result = sut.Load("_foo");

            expect(result._fooLevel).toEqual(parameterValue);
        });

        describe("service parameters can have validation", function () {

            function IntegerParameter(name) {
                return {
                    name: name,
                    validator: function (value) {
                        return typeof(value) == "number";
                    }
                };
            }

            var sut;

            beforeEach(function () {

                sut = new JsfIoc();

                sut.Register({
                    service: Foo,
                    name: "_foo",
                    parameters: [IntegerParameter("_parameter")]
                });
            });

            it("Configure() accepts valid parameters", function () {

                sut.Configure("_foo", 5);

                var instance = sut.Load("_foo");

                expect(instance._parameter).toEqual(5);
            });

            it("Configure() rejects invalid parameters", function () {

                expect(function () {
                    sut.Configure("_foo", "five");
                }).toThrow("Invalid parameter passed to _foo.");
            });

            it("Load() accepts valid parameters", function () {

                var instance = sut.Load("_foo", 65);

                expect(instance._parameter).toEqual(65);
            });

            it("Load() rejects invalid parameters", function () {

                expect(function () {
                    sut.Load("_foo", "five");
                }).toThrow("Invalid parameter passed to _foo.");
            });
        });
    });

    it("Register and load a singleton", function () {

        var initialValue = "abc123";

        var sut = new JsfIoc();

        sut.Register({
            name: "_foo",
            service: Foo,
            singleton: true
        });

        var result1 = sut.Load("_foo");
        var result2 = sut.Load("_foo");

        expect(result1).toBe(result2);
    });

    it("Services are not singletons by default", function () {

        var initialValue = "abc123";

        var sut = new JsfIoc();

        sut.Register({
            name: "_foo",
            service: Foo
        });

        var result1 = sut.Load("_foo");
        var result2 = sut.Load("_foo");

        expect(result1).not.toBe(result2);
    });

    it("Register and load an instance", function () {

        var instance = new Foo();

        var sut = new JsfIoc();

        sut.RegisterInstance("_foo", instance);

        var result = sut.Load("_foo");

        expect(result).toBe(instance);
    });

    describe("Descriptive exceptions for common failures", function () {

        var sut;

        beforeEach(function () {

            sut = new JsfIoc();
        });

        describe("check parameters Register()", function () {

            it("Parameter 'name' should be a string", function () {

                expect(function () {
                    sut.Register({});
                }).toThrow("Register must be called with string parameter 'name'");
            });

            it("Parameter 'service' should be a function", function () {

                expect(function () {
                    sut.Register({ name: "xyz321" });
                }).toThrow("Register must be called with function parameter 'service'");
            });
        });

        describe("check parameters that name an existing service", function () {

            it("for Load()", function () {

                expect(function () {
                    sut.Load("_undefinedService");
                }).toThrow("Load was called for undefined service '_undefinedService'.");
            });

            it("for Configure()", function () {
                expect(function () {
                    sut.Configure("_anotherUndefinedService");
                }).toThrow("Configure was called for undefined service '_anotherUndefinedService'.");
            });
        });
    });

    describe("Message broker behavior", function () {
        function Source() {
        }

        function Listener() {
        };

        Listener.prototype.OnInitialize = function () { }

        var sut;

        beforeEach(function () {

            sut = new JsfIoc();

            sut.Register({
                service: Source,
                name: "_source",
                eventSource: ["Initialize"]
            });

            sut.Register({
                service: Listener,
                name: "_listener",
                eventListener: ["Initialize"]
            });
        });

        it("source has member _notify<EventName> added", function () {

            var source = sut.Load("_source");

            expect(source._notifyInitialize).toEqual(jasmine.any(Function));
        });

        it("function _notify<EventName> calls listeners", function () {

            var source = sut.Load("_source");

            spyOn(Listener.prototype, "OnInitialize");

            source._notifyInitialize();

            expect(Listener.prototype.OnInitialize).toHaveBeenCalled();
        });

        it("function _notify<EventName> passes parameters to listeners", function () {

            var source = sut.Load("_source");

            spyOn(Listener.prototype, "OnInitialize");

            source._notifyInitialize(1, 2, 3);

            expect(Listener.prototype.OnInitialize).toHaveBeenCalledWith(1, 2, 3);
        });

        describe("listeners can be called directly with the ioc container", function () {

            it("with parameters", function () {
                spyOn(Listener.prototype, "OnInitialize");

                sut.NotifyEvent("Initialize", [1, 2, 3]);

                expect(Listener.prototype.OnInitialize).toHaveBeenCalledWith(1, 2, 3);
            });

            it("without parameters", function () {
                spyOn(Listener.prototype, "OnInitialize");

                sut.NotifyEvent("Initialize");

                expect(Listener.prototype.OnInitialize).toHaveBeenCalled();
            });
        });
    });
});
