/// <reference path="../../../../node_modules/zone.js/zone.d.ts" />

import { Connectivity, Label, Observable, View } from '@nativescript/core';

const ZONE_SYMBOL_PREFIX = Zone.__symbol__('');
const zoneSymbolEventNames: any = {};
function prepareEventNames(eventName: string, eventNameToString?: (eventName: string) => string) {
	// const falseEventName = (eventNameToString ? eventNameToString(eventName) : eventName) + FALSE_STR;
	// const trueEventName = (eventNameToString ? eventNameToString(eventName) : eventName) + TRUE_STR;
	// const symbol = ZONE_SYMBOL_PREFIX + falseEventName;
	// const symbolCapture = ZONE_SYMBOL_PREFIX + trueEventName;
	// zoneSymbolEventNames[eventName] = {};
	// zoneSymbolEventNames[eventName][FALSE_STR] = symbol;
	// zoneSymbolEventNames[eventName][TRUE_STR] = symbolCapture;
	const symbol = ZONE_SYMBOL_PREFIX + (eventNameToString ? eventNameToString(eventName) : eventName);
	zoneSymbolEventNames[eventName] = symbol;
}
interface NSTaskData {
	thisArg?: any;
	eventName?: string;
	target?: any;
	actualDelegate?: any;
}
interface ExtendedTaskData extends TaskData {
	nsTaskData?: NSTaskData;
}

interface ExtendedTask extends Task {
	thisArg?: WeakRef<any>;
	eventName?: string;
	target?: any;
	customCallback?: any;
	ranOnce?: boolean;
}

function isPropertyWritable(propertyDesc: any) {
	if (!propertyDesc) {
		return true;
	}

	if (propertyDesc.writable === false) {
		return false;
	}

	return !(typeof propertyDesc.get === 'function' && typeof propertyDesc.set === 'undefined');
}

Zone.__load_patch('nativescript patchMethod', (global, Zone, api) => {
	api.patchMethod = function patchMethod(target: any, name: string, patchFn: (delegate: Function, delegateName: string, name: string) => (self: any, args: any[]) => any): Function | null {
		let proto = target;
		while (proto && !proto.hasOwnProperty(name)) {
			proto = Object.getPrototypeOf(proto);
		}
		if (!proto && target[name]) {
			// somehow we did not find it, but we can see it. This happens on IE for Window properties.
			proto = target;
		}

		const delegateName = Zone.__symbol__(name);
		let delegate: Function | null = null;
		if (proto && !proto.hasOwnProperty(delegateName)) {
			delegate = proto[delegateName] = proto[name];
			// check whether proto[name] is writable
			// some property is readonly in safari, such as HtmlCanvasElement.prototype.toBlob
			const desc = proto && api.ObjectGetOwnPropertyDescriptor(proto, name);
			if (isPropertyWritable(desc)) {
				const patchDelegate = patchFn(delegate!, delegateName, name);
				proto[name] = function () {
					return patchDelegate(this, arguments as any);
				};
				api.attachOriginToPatched(proto[name], delegate);
				//   if (shouldCopySymbolProperties) {
				// 	copySymbolProperties(delegate, proto[name]);
				//   }
			}
		}
		return delegate;
	};
});

function patchEventListeners(cls: any) {
	function compare(task: ExtendedTask, delegate: any, thisArg?: any) {
		const taskThis = task.thisArg ? task.thisArg.get() : undefined;
		if (!thisArg) {
			thisArg = undefined; // keep consistent
		}
		return task.callback === delegate && taskThis === thisArg;
	}
	Zone.__load_patch(cls.name + ':eventListeners', (global: any, Zone, api) => {
		const ADD_EVENT_LISTENER = 'addEventListener';
		const REMOVE_EVENT_LISTENER = 'removeEventListener';
		const ONCE = 'once';
		const nativeAddListener = api.patchMethod(
			cls.prototype,
			ADD_EVENT_LISTENER,
			(delegate, delegateName, name) =>
				function (originalTarget, originalArgs) {
					const addSingleEvent = function (target, args) {
						const eventName = args[0];
						const callback = args[1];
						const taskData: NSTaskData = {};
						const thisArg = (args.length > 1 && args[2]) || undefined;
						taskData.target = target;
						taskData.eventName = eventName;
						taskData.thisArg = thisArg;
						let symbolEventNames = zoneSymbolEventNames[eventName];
						if (!symbolEventNames) {
							prepareEventNames(eventName);
							symbolEventNames = zoneSymbolEventNames[eventName];
						}
						const symbolEventName = symbolEventNames;
						let existingTasks = target[symbolEventName];
						let isExisting = false;
						let checkDuplicate = false;
						if (existingTasks) {
							// already have task registered
							isExisting = true;
							if (checkDuplicate) {
								for (let i = 0; i < existingTasks.length; i++) {
									if (compare(existingTasks[i], delegate, taskData.thisArg)) {
										// same callback, same capture, same event name, just return
										return;
									}
								}
							}
						} else {
							existingTasks = target[symbolEventName] = [];
						}
						const schedule = (task: Task) => {
							const args2 = [taskData.eventName, task.invoke];
							if (taskData.thisArg) {
								args2.push(taskData.thisArg);
							}
							delegate.apply(target, args2);
						};
						const unschedule = (task: ExtendedTask) => {
							const args2 = [task.eventName, task.invoke];
							if (task.thisArg) {
								args2.push(task.thisArg.get());
							}
							nativeRemoveListener.apply(target, args2);
						};
						const data: ExtendedTaskData = {
							nsTaskData: taskData,
						};
						const task: ExtendedTask = Zone.current.scheduleEventTask(cls.name + ':' + taskData.eventName, callback, data, schedule, unschedule);
						// should clear taskData.target to avoid memory leak
						// issue, https://github.com/angular/angular/issues/20442
						taskData.target = null;

						// need to clear up taskData because it is a global object
						if (data) {
							data.nsTaskData = null;
						}
						task.target = target;
						// task.capture = capture;
						task.thisArg = (thisArg && new WeakRef(thisArg)) || undefined;
						task.eventName = eventName;
						existingTasks.push(task);
						// return nativeAddListener.apply(target, args);
					};
					const events: string[] = originalArgs[0].split(',');
					if (events.length > 0) {
						Array.prototype.splice.call(originalArgs, 0, 1);
						for (let i = 0; i < events.length; i++) {
							addSingleEvent(originalTarget, [events[i].trim(), ...originalArgs]);
						}
					} else {
						addSingleEvent(originalTarget, originalArgs);
					}
				}
		);

		const nativeOnce = api.patchMethod(
			cls.prototype,
			ONCE,
			(delegate, delegateName, name) =>
				function (originalTarget, originalArgs) {
					const addSingleEvent = function (target, args) {
						const eventName = args[0];
						const callback = args[1];
						const taskData: NSTaskData = {};
						const thisArg = (args.length > 1 && args[2]) || undefined;
						taskData.target = target;
						taskData.eventName = eventName;
						taskData.thisArg = thisArg;
						let symbolEventNames = zoneSymbolEventNames[eventName];
						if (!symbolEventNames) {
							prepareEventNames(eventName);
							symbolEventNames = zoneSymbolEventNames[eventName];
						}
						const symbolEventName = symbolEventNames;
						let existingTasks = target[symbolEventName];
						let isExisting = false;
						let checkDuplicate = false;
						if (existingTasks) {
							// already have task registered
							isExisting = true;
							if (checkDuplicate) {
								for (let i = 0; i < existingTasks.length; i++) {
									if (compare(existingTasks[i], delegate, taskData.thisArg)) {
										// same callback, same capture, same event name, just return
										return;
									}
								}
							}
						} else {
							existingTasks = target[symbolEventName] = [];
						}
						const schedule = (task: ExtendedTask) => {
							task.ranOnce = false;
							task.customCallback = function (...args) {
								task.invoke.apply(this, args);
								task.ranOnce = true;
								task.target[REMOVE_EVENT_LISTENER](task.eventName, task.callback, task.thisArg ? task.thisArg.get() : undefined);
							};
							const args2 = [taskData.eventName, task.invoke];
							if (taskData.thisArg) {
								args2.push(taskData.thisArg);
							}
							delegate.apply(target, args2);
						};
						const unschedule = (task: ExtendedTask) => {
							if (task.ranOnce) {
								return;
							}
							const args2 = [task.eventName, task.invoke];
							if (task.thisArg) {
								args2.push(task.thisArg.get());
							}
							nativeRemoveListener.apply(target, args2);
						};
						const data: ExtendedTaskData = {
							nsTaskData: taskData,
						};
						const task: ExtendedTask = Zone.current.scheduleEventTask(cls.name + ':' + taskData.eventName, callback, data, schedule, unschedule);
						// should clear taskData.target to avoid memory leak
						// issue, https://github.com/angular/angular/issues/20442
						taskData.target = null;

						// need to clear up taskData because it is a global object
						if (data) {
							data.nsTaskData = null;
						}
						task.target = target;
						// task.capture = capture;
						task.thisArg = (thisArg && new WeakRef(thisArg)) || undefined;
						task.eventName = eventName;
						existingTasks.push(task);
					};
					const events: string[] = originalArgs[0].split(',');
					if (events.length > 0) {
						originalArgs.splice(0, 1);
						for (let i = 0; i < events.length; i++) {
							addSingleEvent(originalTarget, [events[i].trim(), ...originalArgs]);
						}
					} else {
						addSingleEvent(originalTarget, originalArgs);
					}
				}
		);

		const nativeRemoveListener = api.patchMethod(
			cls.prototype,
			REMOVE_EVENT_LISTENER,
			(delegate, delegateName, name) =>
				function (originalTarget, originalArgs) {
					const removeSingleEvent = function (target, args) {
						const eventName = args[0];
						const callback = args[1];
						const thisArg = (args.length > 1 && args[2]) || undefined;
						const symbolEventNames = zoneSymbolEventNames[eventName];
						const symbolEventName = symbolEventNames;
						const existingTasks: Task[] = symbolEventName && target[symbolEventName];
						if (existingTasks) {
							for (let i = 0; i < existingTasks.length; i++) {
								const existingTask = existingTasks[i];
								if (compare(existingTask, callback, thisArg)) {
									existingTasks.splice(i, 1);
									// set isRemoved to data for faster invokeTask check
									(existingTask as any).isRemoved = true;
									if (existingTasks.length === 0) {
										// all tasks for the eventName + capture have gone,
										// remove globalZoneAwareCallback and remove the task cache from target
										(existingTask as any).allRemoved = true;
										target[symbolEventName] = null;
									}
									existingTask.zone.cancelTask(existingTask);
									return;
								}
							}
						}
						return nativeRemoveListener.apply(target, args);
					};
					const events: string[] = originalArgs[0].split(',');
					if (events.length > 0) {
						Array.prototype.splice.call(originalArgs, 0, 1);
						for (let i = 0; i < events.length; i++) {
							removeSingleEvent(originalTarget, [events[i].trim(), ...originalArgs]);
						}
					} else {
						removeSingleEvent(originalTarget, originalArgs);
					}
				}
		);
	});
}

Zone.__load_patch('NSconnectivity', (global, zone, api) => {
	api.patchMethod(Connectivity, 'startMonitoring', (delegate, delegateName, name) => function (self, args) {
		const callback = args[0];
		return delegate.apply(self, [Zone.current.wrap(callback, 'NS Connectivity patch')]);
	});
});

patchEventListeners(Observable);
patchEventListeners(View);