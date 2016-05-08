//
// Enable visualisation of execution progress on the pipeline.
//
// TODO We can be more effective here when updating mapping.
//

define([
    'jquery',
    'jointjs'
], function (jQuery, joint) {

    // For each status contains component style.
    var statusToHighligh = {
        'http://etl.linkedpipes.com/resources/status/queued': {
            'stroke': 'black',
            'stroke-width': 1
        },
        'http://etl.linkedpipes.com/resources/status/initializing': {
            'stroke': 'blue',
            'stroke-width': 2
        },
        'http://etl.linkedpipes.com/resources/status/running': {
            'stroke': 'blue',
            'stroke-width': 2
        },
        'http://etl.linkedpipes.com/resources/status/finished': {
            'stroke': '#388E3C',
            'stroke-width': 4
        },
        'http://etl.linkedpipes.com/resources/status/mapped': {
            'stroke': '#00796B',
            'stroke-width': 3
        },
        'http://etl.linkedpipes.com/resources/status/failed': {
            'stroke': 'red',
            'stroke-width': 4
        },
        'disabled': {
            'stroke': 'gray',
            'stroke-width': 2
        },
        'notAvailable': {
            'stroke': 'black',
            'stroke-width': 1
        }
    };

    /**
     * Update visual higlight of the component.
     */
    var updateVisual = function (cell, component, execution, showRunning) {
        if (cell === undefined) {
            return;
        }
        var status = execution.getComponentStatus(component);
        // TODO Deal better with running status.
        if (showRunning) {
            if (status === 'http://etl.linkedpipes.com/resources/status/running' ||
                    status === 'http://etl.linkedpipes.com/resources/status/initializing') {
                cell.attr('rect', statusToHighligh[status]);
                return;
            }
        }
        if (!execution.mapping.isAvailable(component)) {
            cell.attr('rect', statusToHighligh['notAvailable']);
            return;
        }
        if (!execution.mapping.isEnabled(component)) {
            cell.attr('rect', statusToHighligh['disabled']);
            return;
        }
        cell.attr('rect', statusToHighligh[status]);
    };

    var service = {
        'canvas': void 0,
        'pipelineCanvas': void 0,
        'pipelineModel': void 0,
        'execution': void 0,
        '$mdDialog': void 0,
        'jsonld': void 0,
        'infoService': void 0,
        'enabled': true
    };

    service.update = function () {
        console.time('executionProgress.update');
        var components = this.execution.getComponents();
        for (var iri in components) {
            var component = components[iri];
            var cell = this.pipelineCanvas.getCell(iri);
            if (cell === undefined) {
                // FIXME Component has been removed.
                console.log('Missing');
                continue;
            }
            updateVisual(cell, component, this.execution, this.enabled);
        }
        console.timeEnd('executionProgress.update');
    };

    service.onComponentClick = function (component) {
        if (this.execution === undefined) {
            return;
        }
        var iri = component['@id'];
        var execInfo = this.execution.getComponents();
        // componentExec can be null if component
        // was not planed for execution.
        var componentExec = execInfo[iri];
        // Show dialog with detail.
        this.$mdDialog.show({
            'controller': 'components.component.execution.dialog',
            'templateUrl': 'app/components/componentExecutionDetail/componentExecutionDetailView.html',
            'hasBackdrop': false,
            'clickOutsideToClose': true,
            'fullscreen': false,
            'locals': {
                'component': component,
                'execution': componentExec
            }
        });
    };

    service.onPortClick = function (component, portBinding) {
        if (this.execution === undefined) {
            return;
        }
        var execInfo = this.execution.getComponents();
        var componentExec = execInfo[component['@id']];
        if (componentExec === undefined) {
            return;
        }
        var dataUnit = this.execution.getDataUnit(componentExec, portBinding);
        if (dataUnit === undefined) {
            console.log('Missing record for data unit.', componentExec,
                    portBinding);
            return;
        }
        // Construct path to data unit debug.
        var execIri = this.execution.getIri();
        var ftpPath = this.infoService.get().path.ftp + '/' +
                execIri.substring(
                        execIri.lastIndexOf('executions/') + 11) + '/';
        // Open in new tab.
        window.open(ftpPath + dataUnit.debug, '_blank');
    };

    service.setEnabled = function (enabled) {
        this.enabled = enabled;
        // Update, this would show/hide the running oomponent.
        this.update();
    };

    service.onPointerClick = function (cell, event) {
        if (!this.enabled) {
            return;
        }
        if (cell.model instanceof joint.dia.Link) {
            // Do nothing if clicked on a link.
            return;
        }
        // Check if user click on knonw component.
        var component = this.pipelineCanvas.getResource(cell.model.id);
        if (component === undefined) {
            return;
        }
        if (event.target.getAttribute('magnet')) {
            this.onPortClick(component, event.target.getAttribute('port'));
        } else {
            this.onComponentClick(component);
        }
    };

    /**
     * True if mapping for a component can be changed.
     */
    service.onCanChangeMapping = function (iri) {
        var component = this.execution.getComponents()[iri];
        if (component === undefined) {
            return;
        }
        return this.execution.mapping.isAvailable(component);
    };

    /**
     * Canhge status of mapping ie. from enabled to disable and back.
     */
    service.switchMapping = function (iri) {
        var component = this.execution.getComponents()[iri];
        if (component === undefined) {
            console.log('swithMapping: out');
            return;
        }
        if (!this.execution.mapping.isAvailable(component)) {
            return;
        }
        if (this.execution.mapping.isEnabled(component)) {
            this.onDisableMapping(iri);
        } else {
            this.onEnableMapping(iri);
        }
    };

    service.onEnableMapping = function (iri) {
        // TODO We can introduce check to not enable something we
        // should not. Althoug it should not be happen
        // as this must be called only if onCanChangeMapping is true.
        var component = this.execution.getComponents()[iri];
        if (component === undefined) {
            return;
        }
        if (!this.execution.mapping.isAvailable(component)) {
            return;
        }
        this.execution.mapping.enable(component);
        // Update visual.
        updateVisual(this.pipelineCanvas.getCell(iri), component,
                this.execution, this.enabled);
        // Propagation.
        var connections = this.pipelineModel.getConnections(
                this.pipelineCanvas.getPipeline());
        var conService = this.pipelineModel.connection;
        connections.forEach(function (connection) {
            if (conService.getTarget(connection) === iri) {
                this.onEnableMapping(conService.getSource(connection));
            }
        }.bind(this));
    };

    service.onDisableMapping = function (iri) {
        var component = this.execution.getComponents()[iri];
        if (component === undefined) {
            return;
        }
        if (!this.execution.mapping.isEnabled(component)) {
            return;
        }
        this.execution.mapping.disable(component);
        // Update visual.
        updateVisual(this.pipelineCanvas.getCell(iri), component,
                this.execution, this.enabled);
        // Propagation.
        var connections = this.pipelineModel.getConnections(
                this.pipelineCanvas.getPipeline());
        var conService = this.pipelineModel.connection;
        connections.forEach(function (connection) {
            if (conService.getSource(connection) === iri) {
                this.onDisableMapping(conService.getTarget(connection));
            }
        }.bind(this));
    };

    service.onRemoveMapping = function (iri) {
        var component = this.execution.getComponents()[iri];
        if (component === undefined) {
            return;
        }
        if (!this.execution.mapping.isEnabled(component)) {
            return;
        }
        this.execution.mapping.changed(component);
        // Update visual.
        updateVisual(this.pipelineCanvas.getCell(iri), component,
                this.execution, this.enabled);
        // Propagation.
        var connections = this.pipelineModel.getConnections(
                this.pipelineCanvas.getPipeline());
        var conService = this.pipelineModel.connection;
        connections.forEach(function (connection) {
            if (conService.getSource(connection) === iri) {
                this.onRemoveMapping(conService.getTarget(connection));
            }
        }.bind(this));
    };

    service.bind = function (canvas, pipelineCanvas, execution) {
        this.canvas = canvas;
        this.pipelineCanvas = pipelineCanvas;
        this.execution = execution;

        canvas.getPaper().on('cell:pointerclick',
                this.onPointerClick.bind(this));

        canvas.getPaper().on('lp:resource:remove',
                this.onRemoveMapping.bind(this));

        canvas.getPaper().on('lp:component:changed',
                this.onRemoveMapping.bind(this));

    };

    function factory($mdDialog, jsonld, infoService, pipelineModel) {
        return jQuery.extend({
            '$mdDialog': $mdDialog,
            'jsonld': jsonld,
            'infoService': infoService,
            'pipelineModel': pipelineModel
        }, service);
    }

    return function (app) {
        app.factory('canvas.execution', [
            '$mdDialog',
            'services.jsonld',
            'service.info',
            'components.pipelines.services.model',
            factory]);
    };

});
