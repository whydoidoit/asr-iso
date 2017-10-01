var ASR = require('abstract-state-router')
var isServer = typeof window === 'undefined' && !process.env.BROWSER
var newHashBrownRouter = require('hash-brown-router')
var EventEmitter = require('eventemitter3')
var stringLocation
var serverSideRenderer
var htmlFragment
if (isServer) {
    serverSideRenderer = require('./ssr-renderer')
    htmlFragment = require('./html-fragment')
    stringLocation = require('./string-location')
}


module.exports = function (renderer, rootElement, stateRouterOptions) {
    var states = []
    var singleton = !isServer ? ASR(renderer, rootElement, stateRouterOptions) : new EventEmitter()
    var ultimateParent = rootElement
    var addState = singleton.addState
    var stateRouter = Object.defineProperties(Object.assign(singleton, {
        addState: function(state) {
            var emitable = new EventEmitter()
            stateRouter.emit('add', state, isServer)
            if(isServer) {
                states.push(state);
                state.activate = state.activate || state.activateServer
            } else {
                addState(state)
                state.activate = state.activate || state.activateClient
            }
            var activate = state.activate
            state.activate = function(context) {
                emitable.emit('activate', context, isServer)
                context.isServer = isServer
                activate && activate(context, isServer)
            }
            return emitable
        }
    }), {
        singleton: {
            get: function() {
                return isServer ? null : singleton
            }
        }
    })

    if (isServer) {
        stateRouter.renderToHTML = function (state, parameters, rootElement, context) {
            return new Promise(function (resolve, reject) {

                rootElement = rootElement || '<div ui-view></div>'
                if (typeof rootElement === 'string') rootElement = htmlFragment(rootElement, stateRouterOptions.uiViewTagOrAttribute, context)
                var localRouter = ASR(serverSideRenderer(stateRouterOptions.templateConstructor), rootElement, {router: newHashBrownRouter({}, stringLocation())})
                states.forEach(state => localRouter.addState(state))

                function removeEvents() {
                    localRouter.off('stateChangeEnd', success)
                    localRouter.off('stateError', error)
                    localRouter.off('beforeCreateState', beforeCreate)
                }

                function beforeCreate(context) {
                    serverSideRenderer.setState(context.state)
                }

                function success() {
                    removeEvents()
                    var css = []
                    var html = rootElement.postRender(ultimateParent, css)
                    resolve({html: html, css: css})
                }

                function error(e) {
                    removeEvents()
                    reject(e)
                }

                localRouter.on('beforeCreateState', beforeCreate)
                localRouter.on('stateChangeEnd', success)
                localRouter.on('stateError', error)

                localRouter.go(state, parameters)
            })

        }
        stateRouter.go = stateRouter.renderToHTML
    } else {
        var go = stateRouter.go
        stateRouter.go = function(state, parameters, options, context) {
            window.__context = context || window.__context
            return go(state, parameters, options)
        }
    }
    stateRouter.isNodeJS = isServer
    return stateRouter


}
module.exports.isNodeJS = isServer

