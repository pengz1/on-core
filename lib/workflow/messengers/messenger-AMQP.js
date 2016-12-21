// Copyright 2016, EMC, Inc.

'use strict';
var http = require('http');
var url = require('url');
module.exports = amqpMessengerFactory;
amqpMessengerFactory.$provide = 'Task.Messengers.AMQP';
amqpMessengerFactory.$inject = [
    'Protocol.Task',
    'Protocol.Events',
    'Protocol.TaskGraphRunner',
    'Services.Waterline',
    'Assert',
    '_',
    'Promise',
    'Services.Configuration'
];

function amqpMessengerFactory(
    taskProtocol,
    eventsProtocol,
    taskGraphRunnerProtocol,
    waterline,
    assert,
    _,
    Promise,
    configuration
) {
    var exports = {};

    exports.subscribeRunTask = function(domain, callback) {
        return taskProtocol.subscribeRun(domain, callback);
    };

    exports.publishRunTask = function(domain, taskId, graphId) {
        return taskProtocol.run(domain, { taskId: taskId, graphId: graphId });
    };

    exports.subscribeCancelTask = function(callback) {
        return taskProtocol.subscribeCancel(callback);
    };

    exports.publishCancelTask = function(taskId, errName, errMessage) {
        return taskProtocol.cancel(taskId, errName, errMessage);
    };

    exports.subscribeTaskFinished = function(domain, callback) {
        return eventsProtocol.subscribeTaskFinished(domain, callback);
    };

    exports.publishTaskFinished = function(
        domain,
        taskId,
        graphId,
        state,
        error,
        context,
        terminalOnStates
    ) {
        return eventsProtocol.publishTaskFinished(
                domain,
                taskId,
                graphId,
                state,
                error,
                context,
                terminalOnStates
        );
    };

    exports.subscribeRunTaskGraph = function(domain, callback) {
        return taskGraphRunnerProtocol.subscribeRunTaskGraph(domain, callback);
    };

    exports.subscribeCancelGraph = function(callback) {
        return taskGraphRunnerProtocol.subscribeCancelTaskGraph(callback);
    };

    exports.publishCancelGraph = function(graphId) {
        return taskGraphRunnerProtocol.cancelTaskGraph(graphId);
    };

    /**
     * Update graph progress in task dependencies, graph objects and AMQP channels
     * @param {String} graphId - graph id
     * @param {Object} data - an object of progress data that should include progress data
     * @returns {Promise}
     */
    exports.publishProgressEvent = function(graphId, data) {
        assert.uuid(graphId, "Progress data should include graphId");
        assert.object(data.progress, "Progress data should include progress info");
        
        if (!_.has(data, 'graphId')){
            data.graphId = graphId;
        }

        return waterline.graphobjects.findOne({instanceId: graphId})
        .then(function(graph){
            //Align graph progress data
            _alignGraphProgressData(data, graph);
            data.progress = _calProgressPercentage(data.progress);
            return graph;
        })
        .then(function(graph){
            //Align task progress data
            var task;
            if (_.isEmpty(data.taskProgress) || !_.isObject(data.taskProgress)) {
                return;
            }
            task = _getTaskObject(data.taskProgress.taskId, graph);
            _updateTaskName(data, task);

            if (!_.has(data, 'taskProgress.progress')) {
                return;
            }
            if (data.taskProgress.progress.maximum.toString() === '100') {
                _alignTaskProgressMaximum(data, task);
            }
            if (data.taskProgress.progress.value.toString() === '100') {
                _alignTaskProgressValue(data);
            }
            data.taskProgress.progress = _calProgressPercentage(data.taskProgress.progress);
        })
        .then(function(){
            return eventsProtocol.publishProgressEvent(data);
        });
    };

    function _calProgressPercentage(data) {
        assert.string(data.description, "Progress data should include progress description");
        if (_.has(data, 'percentage')) {
            return data;
        }
        var percentage = 100 * _.round(parseInt(data.value) / parseInt (data.maximum), 2);
        if (percentage >= 0 && percentage <= 100) {
            data.percentage = percentage.toString() + '%';
        } else {
            data.percentage =  'Not Available';
        }
        return data;
    }

    function _alignGraphProgressData(data, graph) {
        if(!_.has(data, 'graphName') &&
           _.has(graph, 'definition.friendlyName')) {
            data.graphName = graph.definition.friendlyName;
        }
        if(!_.has(data, 'nodeId')){
            //data.nodeId = graph.node;
        }
    }

    function _getTaskObject(taskId, graph){
        var task={};
        if (!taskId) {
            return task;
        }
        if (_.has(graph, 'tasks') &&
            graph.tasks[taskId]) {
            task = graph.tasks[taskId];
        }
        return task;
    }

    function _updateTaskName(data, task){
        if (_.has(data, 'taskProgress.taskName')) {
            return;
        }
        if (!_.isEmpty(task)){
            data.taskProgress.taskName = task.friendlyName;
        }
    }

    function _alignTaskProgressMaximum(data, task){
        if (!_.isEmpty(task) && _.has(task, 'options')){
            data.taskProgress.progress.maximum =
                task.options.totalSteps || data.taskProgress.progress.maximum;
        }
    }

    function _alignTaskProgressValue(data){
        data.taskProgress.progress.value = data.taskProgress.progress.maximum;
    }

    exports.start = function() {
        return Promise.resolve();
    };

    return exports;
}
