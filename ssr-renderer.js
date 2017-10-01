var state

module.exports = function(templateConstructor) {
    return function renderer(asr) {
        return {
            render(info) {
                let myElement = info.element.createChild(null, state)
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
            getChildElement(element, cb) {
                cb(null, element)
            },
            reset(info) {},
            destroy(element) {}

        }
    }
}

module.exports.setState = function(currentState) {
    state = currentState
}