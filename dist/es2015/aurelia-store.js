import { PLATFORM } from 'aurelia-pal';
import { Logger, getLogger } from 'aurelia-logging';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { Container } from 'aurelia-dependency-injection';
import { delay, skip, take } from 'rxjs/operators';

/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

function __awaiter(thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function jump(state, n) {
    if (!isStateHistory(state)) {
        return state;
    }
    if (n > 0)
        return jumpToFuture(state, n - 1);
    if (n < 0)
        return jumpToPast(state, state.past.length + n);
    return state;
}
function jumpToFuture(state, index) {
    if (index < 0 || index >= state.future.length) {
        return state;
    }
    const { past, future, present } = state;
    const newPast = [...past, present, ...future.slice(0, index)];
    const newPresent = future[index];
    const newFuture = future.slice(index + 1);
    return { past: newPast, present: newPresent, future: newFuture };
}
function jumpToPast(state, index) {
    if (index < 0 || index >= state.past.length) {
        return state;
    }
    const { past, future, present } = state;
    const newPast = past.slice(0, index);
    const newFuture = [...past.slice(index + 1), present, ...future];
    const newPresent = past[index];
    return { past: newPast, present: newPresent, future: newFuture };
}
function nextStateHistory(presentStateHistory, nextPresent) {
    return Object.assign({}, presentStateHistory, {
        past: [...presentStateHistory.past, presentStateHistory.present],
        present: nextPresent,
        future: []
    });
}
function applyLimits(state, limit) {
    if (isStateHistory(state)) {
        if (state.past.length > limit) {
            state.past = state.past.slice(state.past.length - limit);
        }
        if (state.future.length > limit) {
            state.future = state.future.slice(0, limit);
        }
    }
    return state;
}
function isStateHistory(history) {
    return typeof history.present !== "undefined" &&
        typeof history.future !== "undefined" &&
        typeof history.past !== "undefined" &&
        Array.isArray(history.future) &&
        Array.isArray(history.past);
}

var MiddlewarePlacement;
(function (MiddlewarePlacement) {
    MiddlewarePlacement["Before"] = "before";
    MiddlewarePlacement["After"] = "after";
})(MiddlewarePlacement || (MiddlewarePlacement = {}));
function logMiddleware(state, _, settings) {
    if (settings && settings.logType && console.hasOwnProperty(settings.logType)) {
        console[settings.logType]("New state: ", state);
    }
    else {
        console.log("New state: ", state);
    }
}
function localStorageMiddleware(state, _, settings) {
    if (PLATFORM.global.localStorage) {
        const key = settings && settings.key && typeof settings.key === "string"
            ? settings.key
            : "aurelia-store-state";
        PLATFORM.global.localStorage.setItem(key, JSON.stringify(state));
    }
}
function rehydrateFromLocalStorage(state, key) {
    if (!PLATFORM.global.localStorage) {
        return state;
    }
    const storedState = PLATFORM.global.localStorage.getItem(key || "aurelia-store-state");
    if (!storedState) {
        return state;
    }
    try {
        return JSON.parse(storedState);
    }
    catch (e) { }
    return state;
}

var LogLevel;
(function (LogLevel) {
    LogLevel["trace"] = "trace";
    LogLevel["debug"] = "debug";
    LogLevel["info"] = "info";
    LogLevel["log"] = "log";
    LogLevel["warn"] = "warn";
    LogLevel["error"] = "error";
})(LogLevel || (LogLevel = {}));
class LoggerIndexed extends Logger {
}
function getLogType(options, definition, defaultLevel) {
    if (definition &&
        options.logDefinitions &&
        options.logDefinitions.hasOwnProperty(definition) &&
        options.logDefinitions[definition] &&
        Object.values(LogLevel).includes(options.logDefinitions[definition])) {
        return options.logDefinitions[definition];
    }
    return defaultLevel;
}

var PerformanceMeasurement;
(function (PerformanceMeasurement) {
    PerformanceMeasurement["StartEnd"] = "startEnd";
    PerformanceMeasurement["All"] = "all";
})(PerformanceMeasurement || (PerformanceMeasurement = {}));
class Store {
    constructor(initialState, options) {
        this.initialState = initialState;
        this.logger = getLogger("aurelia-store");
        this.devToolsAvailable = false;
        this.actions = new Map();
        this.middlewares = new Map();
        this.dispatchQueue = [];
        this.options = options || {};
        const isUndoable = this.options.history && this.options.history.undoable === true;
        this._state = new BehaviorSubject(initialState);
        this.state = this._state.asObservable();
        if (!this.options.devToolsOptions || this.options.devToolsOptions.disable !== true) {
            this.setupDevTools();
        }
        if (isUndoable) {
            this.registerHistoryMethods();
        }
    }
    registerMiddleware(reducer, placement, settings) {
        this.middlewares.set(reducer, { placement, settings });
    }
    unregisterMiddleware(reducer) {
        if (this.middlewares.has(reducer)) {
            this.middlewares.delete(reducer);
        }
    }
    isMiddlewareRegistered(middleware) {
        return this.middlewares.has(middleware);
    }
    registerAction(name, reducer) {
        if (reducer.length === 0) {
            throw new Error("The reducer is expected to have one or more parameters, where the first will be the present state");
        }
        this.actions.set(reducer, { type: name });
    }
    unregisterAction(reducer) {
        if (this.actions.has(reducer)) {
            this.actions.delete(reducer);
        }
    }
    isActionRegistered(reducer) {
        if (typeof reducer === "string") {
            return Array.from(this.actions).find((action) => action[1].type === reducer) !== undefined;
        }
        return this.actions.has(reducer);
    }
    resetToState(state) {
        this._state.next(state);
    }
    dispatch(reducer, ...params) {
        let action;
        if (typeof reducer === "string") {
            const result = Array.from(this.actions)
                .find((val) => val[1].type === reducer);
            if (result) {
                action = result[0];
            }
        }
        else {
            action = reducer;
        }
        return new Promise((resolve, reject) => {
            this.dispatchQueue.push({ reducer: action, params, resolve, reject });
            if (this.dispatchQueue.length === 1) {
                this.handleQueue();
            }
        });
    }
    handleQueue() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.dispatchQueue.length > 0) {
                const queueItem = this.dispatchQueue[0];
                try {
                    yield this.internalDispatch(queueItem.reducer, ...queueItem.params);
                    queueItem.resolve();
                }
                catch (e) {
                    queueItem.reject(e);
                }
                this.dispatchQueue.shift();
                this.handleQueue();
            }
        });
    }
    internalDispatch(reducer, ...params) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.actions.has(reducer)) {
                throw new Error(`Tried to dispatch an unregistered action${reducer ? " " + reducer.name : ""}`);
            }
            PLATFORM.performance.mark("dispatch-start");
            const action = Object.assign({}, this.actions.get(reducer), { params });
            if (this.options.logDispatchedActions) {
                this.logger[getLogType(this.options, "dispatchedActions", LogLevel.info)](`Dispatching: ${action.type}`);
            }
            const beforeMiddleswaresResult = yield this.executeMiddlewares(this._state.getValue(), MiddlewarePlacement.Before, {
                name: action.type,
                params
            });
            if (beforeMiddleswaresResult === false) {
                PLATFORM.performance.clearMarks();
                PLATFORM.performance.clearMeasures();
                return;
            }
            const result = yield reducer(beforeMiddleswaresResult, ...params);
            if (result === false) {
                PLATFORM.performance.clearMarks();
                PLATFORM.performance.clearMeasures();
                return;
            }
            PLATFORM.performance.mark("dispatch-after-reducer-" + action.type);
            if (!result && typeof result !== "object") {
                throw new Error("The reducer has to return a new state");
            }
            let resultingState = yield this.executeMiddlewares(result, MiddlewarePlacement.After, {
                name: action.type,
                params
            });
            if (resultingState === false) {
                PLATFORM.performance.clearMarks();
                PLATFORM.performance.clearMeasures();
                return;
            }
            if (isStateHistory(resultingState) &&
                this.options.history &&
                this.options.history.limit) {
                resultingState = applyLimits(resultingState, this.options.history.limit);
            }
            this._state.next(resultingState);
            PLATFORM.performance.mark("dispatch-end");
            if (this.options.measurePerformance === PerformanceMeasurement.StartEnd) {
                PLATFORM.performance.measure("startEndDispatchDuration", "dispatch-start", "dispatch-end");
                const measures = PLATFORM.performance.getEntriesByName("startEndDispatchDuration");
                this.logger[getLogType(this.options, "performanceLog", LogLevel.info)](`Total duration ${measures[0].duration} of dispatched action ${action.type}:`, measures);
            }
            else if (this.options.measurePerformance === PerformanceMeasurement.All) {
                const marks = PLATFORM.performance.getEntriesByType("mark");
                const totalDuration = marks[marks.length - 1].startTime - marks[0].startTime;
                this.logger[getLogType(this.options, "performanceLog", LogLevel.info)](`Total duration ${totalDuration} of dispatched action ${action.type}:`, marks);
            }
            PLATFORM.performance.clearMarks();
            PLATFORM.performance.clearMeasures();
            this.updateDevToolsState(action, resultingState);
        });
    }
    executeMiddlewares(state, placement, action) {
        return Array.from(this.middlewares)
            .filter((middleware) => middleware[1].placement === placement)
            .reduce((prev, curr, _, _arr) => __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield curr[0](yield prev, this._state.getValue(), curr[1].settings, action);
                if (result === false) {
                    _arr = [];
                    return false;
                }
                return result || (yield prev);
            }
            catch (e) {
                if (this.options.propagateError) {
                    _arr = [];
                    throw e;
                }
                return yield prev;
            }
            finally {
                PLATFORM.performance.mark(`dispatch-${placement}-${curr[0].name}`);
            }
        }), state);
    }
    setupDevTools() {
        if (PLATFORM.global.devToolsExtension) {
            this.logger[getLogType(this.options, "devToolsStatus", LogLevel.debug)]("DevTools are available");
            this.devToolsAvailable = true;
            this.devTools = PLATFORM.global.__REDUX_DEVTOOLS_EXTENSION__.connect(this.options.devToolsOptions);
            this.devTools.init(this.initialState);
            this.devTools.subscribe((message) => {
                this.logger[getLogType(this.options, "devToolsStatus", LogLevel.debug)](`DevTools sent change ${message.type}`);
                if (message.type === "DISPATCH") {
                    this._state.next(JSON.parse(message.state));
                }
            });
        }
    }
    updateDevToolsState(action, state) {
        if (this.devToolsAvailable) {
            this.devTools.send(action, state);
        }
    }
    registerHistoryMethods() {
        this.registerAction("jump", jump);
    }
}
function dispatchify(action) {
    const store = Container.instance.get(Store);
    return function (...params) {
        return store.dispatch(action, ...params);
    };
}

function executeSteps(store, shouldLogResults, ...steps) {
    return __awaiter(this, void 0, void 0, function* () {
        const logStep = (step, stepIdx) => (res) => {
            if (shouldLogResults) {
                console.group(`Step ${stepIdx}`);
                console.log(res);
                console.groupEnd();
            }
            step(res);
        };
        // tslint:disable-next-line:no-any
        const tryStep = (step, reject) => (res) => {
            try {
                step(res);
            }
            catch (err) {
                reject(err);
            }
        };
        const lastStep = (step, resolve) => (res) => {
            step(res);
            resolve();
        };
        return new Promise((resolve, reject) => {
            let currentStep = 0;
            steps.slice(0, -1).forEach((step) => {
                store.state.pipe(skip(currentStep), take(1), delay(0)).subscribe(tryStep(logStep(step, currentStep), reject));
                currentStep++;
            });
            store.state.pipe(skip(currentStep), take(1)).subscribe(lastStep(tryStep(logStep(steps[steps.length - 1], currentStep), reject), resolve));
        });
    });
}

const defaultSelector = (store) => store.state;
function connectTo(settings) {
    if (!Object.entries) {
        throw new Error("You need a polyfill for Object.entries for browsers like Internet Explorer. Example: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/entries#Polyfill");
    }
    const store = Container.instance.get(Store);
    const _settings = Object.assign({ selector: typeof settings === "function" ? settings : defaultSelector }, settings);
    function getSource(selector) {
        const source = selector(store);
        if (source instanceof Observable) {
            return source;
        }
        return store.state;
    }
    function createSelectors() {
        const isSelectorObj = typeof _settings.selector === "object";
        const fallbackSelector = {
            [_settings.target || "state"]: _settings.selector || defaultSelector
        };
        return Object.entries(Object.assign({}, (isSelectorObj ? _settings.selector : fallbackSelector))).map(([target, selector]) => ({
            targets: _settings.target && isSelectorObj ? [_settings.target, target] : [target],
            selector,
            // numbers are the starting index to slice all the change handling args, 
            // which are prop name, new state and old state
            changeHandlers: {
                [_settings.onChanged || ""]: 1,
                [`${_settings.target || target}Changed`]: _settings.target ? 0 : 1,
                ["propertyChanged"]: 0
            }
        }));
    }
    return function (target) {
        const originalSetup = typeof settings === "object" && settings.setup
            ? target.prototype[settings.setup]
            : target.prototype.bind;
        const originalTeardown = typeof settings === "object" && settings.teardown
            ? target.prototype[settings.teardown]
            : target.prototype.unbind;
        target.prototype[typeof settings === "object" && settings.setup ? settings.setup : "bind"] = function () {
            if (typeof settings == "object" &&
                typeof settings.onChanged === "string" &&
                !(settings.onChanged in this)) {
                throw new Error("Provided onChanged handler does not exist on target VM");
            }
            this._stateSubscriptions = createSelectors().map(s => getSource(s.selector).subscribe((state) => {
                const lastTargetIdx = s.targets.length - 1;
                const oldState = s.targets.reduce((accu = {}, curr) => accu[curr], this);
                Object.entries(s.changeHandlers).forEach(([handlerName, args]) => {
                    if (handlerName in this) {
                        this[handlerName](...[s.targets[lastTargetIdx], state, oldState].slice(args, 3));
                    }
                });
                s.targets.reduce((accu, curr, idx) => {
                    accu[curr] = idx === lastTargetIdx ? state : accu[curr] || {};
                    return accu[curr];
                }, this);
            }));
            if (originalSetup) {
                return originalSetup.apply(this, arguments);
            }
        };
        target.prototype[typeof settings === "object" && settings.teardown ? settings.teardown : "unbind"] = function () {
            if (this._stateSubscriptions && Array.isArray(this._stateSubscriptions)) {
                this._stateSubscriptions.forEach((sub) => {
                    if (sub instanceof Subscription && sub.closed === false) {
                        sub.unsubscribe();
                    }
                });
            }
            if (originalTeardown) {
                return originalTeardown.apply(this, arguments);
            }
        };
    };
}

function configure(aurelia, options) {
    if (!options || !options.initialState) {
        throw new Error("initialState must be provided via options");
    }
    let initState = options.initialState;
    if (options && options.history && options.history.undoable && !isStateHistory(options.initialState)) {
        initState = { past: [], present: options.initialState, future: [] };
    }
    delete options.initialState;
    aurelia.container
        .registerInstance(Store, new Store(initState, options));
}

export { configure, PerformanceMeasurement, Store, dispatchify, executeSteps, jump, nextStateHistory, applyLimits, isStateHistory, MiddlewarePlacement, logMiddleware, localStorageMiddleware, rehydrateFromLocalStorage, LogLevel, LoggerIndexed, getLogType, connectTo };
