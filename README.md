# asr-iso

An isomorphic Server and Client side wrapper for [Abstract State Router](https://github.com/TehShrike/abstract-state-router).

# Goal

This module aims to allow the creation of isomorphic state definitions that can be used to render ASR states on the browser and the server.  It's designed for use in Progressive Web Apps that want to serve the proper state experience without the need for Javascript to be ready before the page looks right.

Using this library you can serve a page and then enhance it with Javascript without the user having to wait before they can start consuming the content.  When coupled with an isomorphic event wrapper you can also provide an interactive experience for clicks and forms that work even in the absence of Javascript on the client's browser.

# Installing

```shell
npm install --save asr-iso
```

# Usage

The library wraps Abstract State Router on the client and provides a compatible state definition interface on the server, but replaces `.go(state, stateParameters)` with a method that returns a promise for the HTML for a state.

Additionally it provides extra parameters which exist on both Client and Server to allow a context object to be passed into the state rendering functions that describes the current application state.  Utilising this property along with helper methods to alter the rendering on server and client allows the core state functions to operate equally well on both.

## Define a router

```javascript
var StateRouter = require('asr-iso')
var stateRouter = StateRouter(clientRender, rootLocation /* e.g. #here */, options);
``` 
You supply a client rendering function for the library of your choice.  The server side renderer is based on *[Parse5](https://github.com/inikulin/parse5)* and is supplied for you. For example this is a [Svelte](https://github.com/sveltejs/svelte) client renderer, based on TehStrike's ASR Svelte Renderer but modified to be compatible with the SSR renderer in asr-iso.  

```javascript
var defaultOptions = {}

function clientRenderer(stateRouter) {
    const asr = {
        makePath: stateRouter.makePath,
        stateIsActive: stateRouter.stateIsActive,
    }

    async function render(context, cb) {
        let {element: target, template, content} = context
        if (typeof target === 'string') {
            target = document.querySelector(target)
        }
        const rendererSuppliedOptions = Object.assign({}, defaultOptions, {
            target,
            data: Object.assign(content, defaultOptions.data, {asr}),
        })

        function construct(component, options) {
            return options.methods
                ? instantiateWithMethods(component, options, options.methods)
                : new component(options)
        }

        let svelte

        try {
            if (typeof template === 'string') {
                let constructor = await dynamic(template)
                svelte = construct(constructor.default, rendererSuppliedOptions)
            } else {
                throw new Error("Must supply a string template to ensure server side and client side rendering match")
            }
        } catch (e) {
            cb(e)
            return
        }

        function onRouteChange() {
            svelte.set({
                asr,
            })
        }

        stateRouter.on('stateChangeEnd', onRouteChange)

        svelte.on('destroy', () => {
            stateRouter.removeListener('stateChangeEnd', onRouteChange)
        })

        svelte.mountedToTarget = target
        return svelte
    }

    return {
        render,
        reset: async function reset(context, cb) {
            const svelte = context.domApi
            const element = svelte.mountedToTarget

            svelte.teardown()

            const renderContext = Object.assign({element}, context)

            await render(renderContext, cb)
        },
        destroy: function destroy(svelte, cb) {
            svelte.teardown()
            cb()
        },
        getChildElement: function getChildElement(svelte, cb) {
            try {
                const element = svelte.mountedToTarget
                const child = element.querySelector('ui-view') || element.querySelector('[ui-view]')
                cb(null, child)
            } catch (e) {
                cb(e)
            }
        },
    }
}
```

### rootLocation specification
We will normally use an `id` or `class` CSS selector for the target so that the server side may render it and the client side find it when it wires up.  The default SSR Renderer recognises targets starting with `.` or `#`

### Wiring up data into the template

ASR uses a state's `activate` method to wire up data.  Libraries like Svelte have a different API on the server and client sides so you will probably need to supply different methods.  However, if you are going to populate the templates using data supplied by the `resolve` method, existing data, state parameters or the global context then this can often be the same boiler plate code for every state.

Firstly each state may declare an `activateClient` and `activateServer` method that will be used appropriately.  In addition the standard `activate` method is passed a second parameter for `isServer` which is true on the server and falsey on the client and the general context for `activate` contains an `isServer` property.

The `stateRouter` also fires an event each time a state is added allowing you to wire up boilerplate code easily.  Here's an example for Svelte

```javascript
stateRouter.on('add', function (state, isServer) {
    state.activate = svelteActivate;
});

function svelteActivate(context) {
    if (context.isServer) {
        var dom = context.domApi;
        dom.data = Object.assign({}, context.data, context.parameters, dom.context)               
        dom.css = dom.templateInstance.renderCss().css
        dom.element = dom.templateInstance.render(dom.data);
    } else {
        /* 
        The following code presumes that a window.__context contains the global scope,
        this is set by state.go
        */
        context.domApi.set(Object.assign({}, context.data, context.parameters, 
            typeof window !== 'undefined' ? window.__context : null))
    }
}

```
#### Server Side Rendering API
In the server side your `activate` function is passed a `htmlFragment` in the `context.domApi` property.  You set the `element` property of this to the HTML to render.  

You may also set the `.css` property if CSS is rendered separately.

Child views are flagged with either a `<ui-view>` element or a container element with a `ui-view` attribute.

There is also ` .data` property.  If you set this to an Object then it will be serialized into a `dataIsland` on the client with a key of the related state name.  You can use this to wire up the data when the Javascript loads to save another round trip to the server.

For example you could add boiler plate code to overide the `.resolve` method of states:

```javascript
stateRouter.on('add', function (state, isServer) {
    state.activate = svelteActivate
    if (!isServer) {
        var resolve = state.resolve
        if (resolve) {
            state.resolve = function (data) {
                if (window.dataIslands) {
                    if (dataIslands[state.name]) {
                        Object.assign(data, dataIslands[state.name])
                        delete dataIslands[state.name]
                        return Promise.resolve(data)
                    }
                }
                return resolve.apply(state, Array.prototype.slice.call(arguments))
            }
        }
    }
})
```

### Adding States

Adding states is then the same on the client and server:

```javascript
var StateRouter = require('asr-iso')
var stateRouter = StateRouter(clientRenderer, '#here')

function clientRenderer(stateRouter) {
    // Renderer code ...
}

stateRouter.on('add', function (state, isServer) {
    state.activate = svelteActivate //for example
})

stateRouter.addState({
    name: 'app',
    route: '/',
    data: {
        name: 'mike'
    },
    template: 'holder' //Dynamically resolve 'holder'
})

function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time)
    })
}

stateRouter.addState({
    name: 'app.home',
    route: 'home',
    data: {
        surname: 'talbot'
    },
    template: 'basic',  //Dynamically resolve 'basic'
    resolve: async function (data) {
        await delay(1000) //Simulate server delay
        data.company = "3radical"
    }
})
```

### Setting a state

On the server using `.go` will render the HTML and CSS for a state into an object:

```javascript
    /* user contains server side variables for the user */
    var state = await stateRouter.go(user.state || 'app.home', {id: 123}, null, user)
```

So a full example using Svelte, Express with cookies and Redis might look like:

**Express route**
```javascript
require('svelte/ssr/register')
var express = require('express');
var router = express.Router();

var stateRouter = require('./states') // Defines the isomorphic stateRouter
var shortid = require('shortid')      // ID generator
var redis = require('./redis')        // Configured redis client
var events = require('./events')      // Wildcard hook events

router.get('/', async function (req, res) {
    var id = req.cookies.routerId
    
    // Get or create the user representation
    var user
    if (!id) {
        id = shortid.generate()
        user = {}
        // Allow hook(s) to set initial values
        events.emit(`initialize:${id}`, user)
    } else {
        user = JSON.parse((await redis.get(`--router-state--${id}`)) || "{}")
    }
    // Allow hook(s) to update the values
    events.emit(`retrieve:${id}`, user)
    
    // Use a cookie to manage the user representation
    res.cookie('routerId', id, {maxAge: 1000 * 60 * 60 * 24 * 7 * 12})
    
    // Render the state
    var state = await stateRouter.go(user.state || 'app.home', {id: 123}, null, user)
    
    // Store the user representation
    await redis.set(`--router-state--${id}`, JSON.stringify(user))
    
    // Output the page
    res.render('index', {
        contents: state.html, 
        styles: state.css, 
        context: JSON.stringify(user)
    });
});
```
**Pug Template**
```jade
extends layout

block styles
    style !{styles}
    script window.__context = !{context}

block content
  .content !{contents}
  script(src='index.js') 
```
Where `index.js` is the webpack bundled client version.

#### Client side state setting

The API for the client side is exactly the same.

If rehydrating state from the server you'd normally include something like this to run when the code is ready:

```javascript
import stateRouter from '../states'

stateRouter.evaluateCurrentRoute(
    window.__context.state || 'app.home', 
    window.__context.stateParameters
)
```

## Dynamic construction of templates (optional)
We can provide an extra option to asr-iso when it constructs a router teaching it how to find a dynamic template.  This is very useful if you will utilise *code splitting* to create chunks to be loaded on the client only when a state is activated, further reducing the download burden.

```javascript
var stateRouter = StateRouter(clientRenderer, '#here', {
    templateConstructor: function (state) {
        //Import a template on the client with import() and 
        //require on Node
        return dynamic(state.template)
    }
})
```
The `templateConstructor` can return a promise (and so also by `async`)

Using this method we can pass a template as the "name" of a file to be dynamically loaded as the representation of a state.

For example loading a Svelte component from a file system in which the component lives in a folder with its name and is defined in an `index.html` file - `dynamic` might look like this for the browser:

```javascript
function load(src) {
    return import(`../${src}/index.html`)
}

module.exports = load

```

And this for Node:
```javascript
function load(src) {
    return require(`../${src}/index.html`)
}

module.exports = load

```
Or any other way you wish to make it work for both.  

## WebPack client version

Ensure that *Parse5* is not included in the WebPack build by using the `Ignore Plugin` or specifying it as an `external`.  It isn't required on the client side and adds unnecessary bloat.

You should also use the `Define Plugin` to specify that the build is for the browser like this:

```javascript
plugins: [
    //...
    new webpack.DefinePlugin({
        BROWSER: JSON.stringify(true)
    }),
],
externals: {
    "parse5": "parse5"
}
```
# More Information

For more information on designing states and the other APIs see [Abstract State Router](https://github.com/TehShrike/abstract-state-router)
