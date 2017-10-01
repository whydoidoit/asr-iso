var state

module.exports = function(templateConstructor) {
    return function renderer(asr) {
        return {
            render: function(info) {
                var myElement = info.element.createChild(null, state)
                myElement.asr = asr
                if(templateConstructor && typeof templateConstructor === 'function') {
                    return Promise.resolve(templateConstructor(info))
                        .then(function (instance) {
                            myElement.templateInstance = instance
                            return myElement
                        })
                } else {
                    return myElement
                }
            },
            getChildElement: function(element, cb) {
                cb(null, element)
            },
            reset: function() {},
            destroy: function() {}

        }
    }
}

module.exports.setState = function(currentState) {
    state = currentState
}
