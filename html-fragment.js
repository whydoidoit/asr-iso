var parse5 = require('parse5')
var EventEmitter = require('eventemitter3')

function getView(ast, tagOrAttribute) {
    if (!ast.childNodes) return null
    for (var i = 0; i < ast.childNodes.length; i++) {
        var child = ast.childNodes[i]
        if (child.tagName === tagOrAttribute || (child.attrs && child.attrs.some(attr => attr.name === tagOrAttribute))) return child
    }
    for (var i = 0; i < ast.childNodes.length; i++) {
        var child = ast.childNodes[i]
        var result = getView(child)
        if (result) return result
    }
    return null
}

var htmlFragment = module.exports = function (element, tagOrAttribute, state, context) {
    tagOrAttribute = tagOrAttribute || 'ui-view'
    var parsedElement = null
    var childElement = null
    var result = Object.defineProperties(Object.assign(new EventEmitter, {
        context: context,
        data: null,
        postRender: function (id, css) {
            result.emit('postRender', result)
            if (!parsedElement) throw new Error("Nothing to do")
            if (css && result.css) {
                css.push(result.css)
            }

            if (result.data && state) {
                Array.prototype.push.apply(parsedElement.childNodes, parse5.parseFragment('<script>var dataIslands = dataIslands || {};dataIslands["' + state.name + '"] = ' + JSON.stringify(result.data) + ';</script>').childNodes)

            }
            if (!result.child) {
                return parse5.serialize(parsedElement)
            }
            if (!result.child.postRender) throw new Error("Child should be an htmlFragment object")
            var view = getView(parsedElement, tagOrAttribute)
            if (!view) throw new Error("No ui-view found, either use a ui-view tag or a ui-view attribute")
            if (typeof id === 'string') {
                var attrs = view.attrs = view.attrs || []

                var firstCharacter = id.slice(0, 1);
                if (firstCharacter === '#') {
                    attrs.push({name: 'id', value: id.slice(1)})
                }
                if (firstCharacter === '.') {
                    attrs.push({name: 'class', value: id.slice(1)})
                }
            }
            Array.prototype.push.apply(view.childNodes, parse5.parseFragment(result.child.postRender(null, css)).childNodes)
            if (result.child.data && state) {
                Array.prototype.push.apply(view.childNodes, parse5.parseFragment('<script>var dataIslands = dataIslands || {};dataIslands["' + state.name + '"] = ' + JSON.stringify(result.child.data) + ';</script>').childNodes)

            }

            return parse5.serialize(parsedElement)
        },
        createChild: function (element, state) {
            return result.child = htmlFragment(element, tagOrAttribute, state, context)
        }
    }), {
        element: {
            get: function() {
                return parsedElement
            },
            set: function(value) {
                if (!value) {
                    parsedElement = null
                    return
                }
                result.emit('element', value)
                if (typeof value === 'string') {
                    parsedElement = parse5.parseFragment(value)
                } else {
                    parsedElement = value
                }
            }
        },
        child: {
            get: function() {
                return childElement
            },
            set: function(value) {
                result.emit('child', value)
                childElement = value
            }
        }

    })
    result.element = element
    return result
}
