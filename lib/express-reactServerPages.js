/*
 * Copyright (c) 2018, Rogassi Ent. All rights reserved.
 * Copyrights licensed under the New BSD License.
 * See the accompanying LICENSE file for terms.
 */

'use strict';

var Promise = global.Promise || require('promise');
var _ = require('lodash');
var React = require('react');
var ReactDOM = require('react-dom');
var ReactDOMServer = require('react-dom/server');

var glob = require('glob');
//var Handlebars = require('handlebars');
var fs = require('graceful-fs');
var path = require('path');

var utils = require('./utils');

module.exports = ExpressReactServerPages;

// -----------------------------------------------------------------------------

function ExpressReactServerPages(config) {
    // Config properties with defaults.
    utils.assign(this, {
        //handlebars     : Handlebars,
        extname: '.rt',
        wrapperExt: '.html',
        layoutsDir: 'views/layouts/',
        partialsDir: 'views/partials/',
        defaultLayout: undefined,
        helpers: undefined,
        compilerOptions: undefined,
    }, config);

    // Express view engine integration point.
    this.engine = this.renderView.bind(this);

    // Normalize `extname`.
    if (this.extname.charAt(0) !== '.') {
        this.extname = '.' + this.extname;
    }

    // Internal caches of compiled and precompiled templates.
    this.compiled = Object.create(null);
    this.precompiled = Object.create(null);

    // Private internal file system cache.
    this._fsCache = Object.create(null);
}

ExpressReactServerPages.prototype.getPartials = function (options) {
    var partialsDirs = Array.isArray(this.partialsDir) ?
        this.partialsDir : [this.partialsDir];

    partialsDirs = partialsDirs.map(function (dir) {
        var dirPath;
        var dirTemplates;
        var dirNamespace;

        // Support `partialsDir` collection with object entries that contain a
        // templates promise and a namespace.
        if (typeof dir === 'string') {
            dirPath = dir;
        } else if (typeof dir === 'object') {
            dirTemplates = dir.templates;
            dirNamespace = dir.namespace;
            dirPath = dir.dir;
        }

        // We must have some path to templates, or templates themselves.
        if (!(dirPath || dirTemplates)) {
            throw new Error('A partials dir must be a string or config object');
        }

        // Make sure we're have a promise for the templates.
        var templatesPromise = dirTemplates ? Promise.resolve(dirTemplates) :
            this.getTemplates(dirPath, options);

        return templatesPromise.then(function (templates) {
            return {
                templates: templates,
                namespace: dirNamespace,
            };
        });
    }, this);

    return Promise.all(partialsDirs).then(function (dirs) {
        var getTemplateName = this._getTemplateName.bind(this);

        return dirs.reduce(function (partials, dir) {
            var templates = dir.templates;
            var namespace = dir.namespace;
            var filePaths = Object.keys(templates);

            filePaths.forEach(function (filePath) {
                var partialName = getTemplateName(filePath, namespace);
                partials[partialName] = templates[filePath];
            });

            return partials;
        }, {});
    }.bind(this));
};

ExpressReactServerPages.prototype.getTemplate = function (filePath, options) {
    filePath = path.resolve(filePath);
    options || (options = {});

    var precompiled = options.precompiled;
    var cache = precompiled ? this.precompiled : this.compiled;

    var pathExploded = path.parse(filePath); 
    var keySpecCulture = `${pathExploded.dir}${path.sep}${pathExploded.name}-${options.lang.toLowerCase()}${pathExploded.ext}`;
    var keySpecCultureRequire = `${pathExploded.dir}${path.sep}${pathExploded.name}-${options.lang.toLowerCase()}-rt.js`;
    var keySpecLang = `${pathExploded.dir}${path.sep}${pathExploded.name}-${options.lang.toLowerCase().split('-')[0]}${pathExploded.ext}`;
    var key = `${pathExploded.dir}${path.sep}${pathExploded.name}${pathExploded.ext}`;

    var template = options.cache && cache[keySpecCulture];

    // if (!template) {
    //     var template = options.cache && cache[keySpecLang];
    //     if (!template) {
    //         var template = options.cache && cache[key];
    //     }
    // }

    if (template) {
        return template;
    }

    //// Optimistically cache template promise to reduce file system I/O, but
    //// remove from cache if there was a problem.
    //template = cache[filePath] = this._getFile(filePath, { cache: options.cache })
    //    .then(function (file) {
    //    /// WE DO NOT DO THIS
    //    //if (precompiled) {
    //    //    return this._precompileTemplate(file, this.compilerOptions);
    //    //}
    //    return this._compileTemplate(file, this.compilerOptions);
    //}.bind(this));

    //var _tmp = require(filePath.replace(/\.rt.html/ig, '.js').replace(/\.rt/ig, '.js'));
    var _tmp = null;
    try {
        _tmp = require(keySpecCulture);
    } catch (ex) {
        try {
            _tmp = require(keySpecLang);
        } catch (ex) {
            _tmp = require(key);
        }
    }

    /// DEAL WITH ES6
    if (_tmp) {
        if (_tmp.__esModule) {
            template = cache[keySpecCulture] = _tmp.default;
        }
        else {
            template = cache[keySpecCulture] = _tmp;
        }
    }

    if (!options.cache) {
        // delete cache[keySpecCulture]
        // delete require.cache[keySpecCulture];
        // delete require.cache[keySpecCultureRequire];

        delete cache[key]
        delete require.cache[key];
        delete require.cache[key.replace(/\.js/, '-rt.js')];

        delete cache[keySpecCulture]
        delete require.cache[keySpecCulture];
        delete require.cache[keySpecCultureRequire];

        delete cache[keySpecLang]
        delete require.cache[keySpecLang];
        delete require.cache[keySpecLang.replace(/\.js/, '-rt.js')];

    }

    /// THIS IS PRETTY DIRTY
    // if (!options.cache) {

    //     delete cache[key]
    //     delete require.cache[key];
    //     delete require.cache[key.replace(/\.js/, '-rt.js')];

    //     delete cache[keySpecCulture]
    //     delete require.cache[keySpecCulture];
    //     delete require.cache[keySpecCulture.replace(/\.js/, '-rt.js')];

    //     delete cache[keySpecLang]
    //     delete require.cache[keySpecLang];
    //     delete require.cache[keySpecLang.replace(/\.js/, '-rt.js')];

    // }

    //return template.catch(function (err) {
    //    delete cache[filePath];
    //    throw err;
    //});
    return template;
};

ExpressReactServerPages.prototype.getTemplates = function (dirPath, options) {
    options || (options = {});
    var cache = options.cache;

    return this._getDir(dirPath, { cache: cache }).then(function (filePaths) {
        var templates = filePaths.map(function (filePath) {
            return this.getTemplate(path.join(dirPath, filePath), options);
        }, this);

        return Promise.all(templates).then(function (templates) {
            return filePaths.reduce(function (hash, filePath, i) {
                hash[filePath] = templates[i];
                return hash;
            }, {});
        });
    }.bind(this));
};

ExpressReactServerPages.prototype.render = function (filePath, context, options) {
    options || (options = {});

    return Promise.all([
        this.getTemplate(filePath, { cache: options.cache, lang: context.i18n ? context.i18n.language : null }),
        options.partials || this.getPartials({ cache: options.cache, lang: context.i18n ? context.i18n.language : null }),
    ]).then(function (templates) {
        var template = templates[0];
        var partials = templates[1];
        var helpers = options.helpers || this.helpers;


        // DOES TEMPLATE EXPOSE OVERRIDE SETTINGS ?

        // DOES CURRENT DIRECTORY OVERRIDE SETTINGS ?

        // RECURSE THE DIRECTORY UP UNTIL WE FIND A OVERRIDE SETTINGS ?

        // DO NOTHING IF WE DO NOT FIND ONE AND USE THE OPTIONS SETTING        

        context.template = template;
        // Add ExpressHandlebars metadata to the data channel so that it's
        // accessible within the templates and helpers, namespaced under:
        // `@exprsp.*`
        var data = utils.assign({}, options.data, {
            exprsp: utils.assign({}, options, {
                filePath: filePath,
                helpers: helpers,
                partials: partials,
            }),
        });

        return this._renderTemplate(template, context, {
            data: data,
            helpers: helpers,
            partials: partials,
        });
    }.bind(this));
};

ExpressReactServerPages.prototype.renderView = function (viewPath, options, callback) {
    options || (options = {});

    var context = options;

    // Express provides `settings.views` which is the path to the views dir that
    // the developer set on the Express app. When this value exists, it's used
    // to compute the view's name.
    var view;
    var viewsPath = options.settings && options.settings.views;
    if (viewsPath) {
        view = this._getTemplateName(path.relative(viewsPath, viewPath));
    }

    // Merge render-level and instance-level helpers together.
    var helpers = utils.assign({}, this.helpers, options.helpers);

    // Merge render-level and instance-level partials together.
    var partials = Promise.all([
        this.getPartials({ cache: options.cache }),
        Promise.resolve(options.partials),
    ]).then(function (partials) {
        return utils.assign.apply(null, [{}].concat(partials));
    });

    // Pluck-out ExpressHandlebars-specific options and Handlebars-specific
    // rendering options.
    options = {
        cache: options.cache,
        view: view,
        layout: 'layout' in options ? options.layout : this.defaultLayout,

        data: options.data,
        helpers: helpers,
        partials: partials,
    };

    this.render(viewPath, context, options)
        .then(function (body) {
            var layoutPath = this._resolveLayoutPath(options.layout);

            if (layoutPath) {

                var _body = this._getTemplateArray(layoutPath, options).then(function (templateAr) {
                    var _template = context.template;
                    var templateOut = [];
                    var last = 0;
                    //var rex = /<REACT.*"(.*)".*\/>/gm;
                    //var myArray;
                    var fileToEnd = null;
                    var mergedContext = null;

                    var seo = context.seo
                    if (_template.seo != null)
                        seo = _.merge(context.seo, _template.seo);

                    for (var pos in templateAr) {
                        var myArray = templateAr[pos];
                        templateOut.push(myArray.input.substr(last, myArray.index - last));
                        last = myArray.index + myArray[0].length;
                        fileToEnd = myArray.input.substr(last, myArray.input.length - last);
                        var component = null
                        if (myArray[1] == "REACT") {

                            if (mergedContext == null) {
                                mergedContext = utils.assign({}, context, options)
                                if (_template.extendSEO != null) {
                                    /// THIS WILL BECOME THE PREFERED METHOD IN FUTURE RELEASES
                                    seo = _template.extendSEO(seo, mergedContext);
                                }
                            }

                            if (myArray[2] == 'body') {
                                component = body;
                            }
                            else if (_template.renderComponent != null) {
                                //var _comp = React.createElement(_template.renderSection(myArray[1]), reqContext, {});
                                //if (_comp != null) {
                                //    component = ReactDOMServer.renderToStaticMarkup(_comp);
                                //}
                            }
                            else if (_template.renderRaw != null) {
                                //var _comp = React.createElement(_template.renderSection(myArray[1]), reqContext, {});
                                //if (_comp != null) {
                                component = _template.renderRaw(myArray[2], mergedContext);
                                //}
                            }
                        } else if (seo && myArray[3] == "SEO") {

                            if (mergedContext == null) {
                                mergedContext = utils.assign({}, context, options)
                                if (_template.extendSEO != null) {
                                    /// THIS WILL BECOME THE PREFERED METHOD IN FUTURE RELEASES
                                    seo = _template.extendSEO(seo, mergedContext);
                                }
                            }

                            switch (myArray[4].toUpperCase()) {
                                case "TITLE":
                                    if (component == null && seo.title)
                                        component = "<title>" + seo.title + "</title>";
                                    break;
                                case "DESCRIPTION":
                                    if (component == null && seo.description)
                                        component = "<meta name=\"description\" content=\"" + seo.description + "\">";
                                    break;
                                case "KEYWORDS":
                                    if (component == null && seo.keywords)
                                        component = "<meta name=\"keywords\" content=\"" + seo.keywords + "\">";
                                    break;
                            }
                        }
                        else if (((seo && seo.og) || _template.renderOpenGraph) && myArray[3] == "OG") {

                            if (mergedContext == null) {
                                mergedContext = utils.assign({}, context, options)
                                if (_template.extendSEO != null) {
                                    /// THIS WILL BECOME THE PREFERED METHOD IN FUTURE RELEASES
                                    seo = _template.extendSEO(seo, mergedContext);
                                }
                            }

                            if (component == null) {

                                component = utils.buildTag(myArray[3], myArray[4], seo, context);

                                // if (component == null && seo.og && seo.og[myArray[4].toLowerCase()]) {
                                //     component = "<meta property=\"og:" + myArray[4].toLowerCase() + "\" content=\"" + seo.og[myArray[4].toLowerCase()].replace('{{BUILDID}}', 'v=' + context.build) + "\" />";
                                // }

                            }

                        }
                        else if (myArray[7] == "BUILDID") {
                            component = "v=" + context.build;
                        }
                        else if (myArray[8] == "LANG") {
                            switch (myArray[9].toUpperCase()) {
                                case "PREINTERCOMINIT":
                                    component = `<script>
        window.intercomSettings.language_override = '${context.i18n.language}';
    </script>`
                                    break;
                            }
                        }
                        else if (seo && seo.title && myArray.length > 0 && myArray[5].toUpperCase() == "TITLE") {

                            if (mergedContext == null) {
                                mergedContext = utils.assign({}, context, options)
                                if (_template.extendSEO != null) {
                                    /// THIS WILL BECOME THE PREFERED METHOD IN FUTURE RELEASES
                                    seo = _template.extendSEO(seo, mergedContext);
                                }
                            }

                            if (component == null && seo.title) {
                                component = "<title>" + seo.title + "</title>";
                            }
                            else {
                                /// Output original title tag - worst case scenario
                                component = myArray[0];
                            }

                        }

                        if (component != null) {
                            templateOut.push(component);
                        }

                    }
                    templateOut.push(fileToEnd);
                    return templateOut.join('');;
                });

                //return this.render(
                //    layoutPath,
                //        utils.assign({}, context, { body: body }),
                //        utils.assign({}, options, { layout: undefined })
                //);
                return _body;

            }

            return body;
        }.bind(this))
        .then(utils.passValue(callback))
        .catch(utils.passError(callback));
};

// -- Protected Hooks ----------------------------------------------------------

//ExpressReactServerPages.prototype._compileTemplate = function (template, options) {
//    return this.handlebars.compile(template, options);
//};

//ExpressReactServerPages.prototype._precompileTemplate = function (template, options) {
//    return this.handlebars.precompile(template, options);
//};

ExpressReactServerPages.prototype._renderTemplate = function (template, context, options) {
    if (template && template.renderIsoMorphic) {
        /// TO USE RENDER TO STRING SO WE CAN ISOMORPHIC WHEN NEEDED
        return ReactDOMServer.renderToString(React.createElement(template, utils.assign({}, context, options), {}));
    }
    else {
        return ReactDOMServer.renderToStaticMarkup(React.createElement(template, utils.assign({}, context, options), {}));
    }
};

// -- Private ------------------------------------------------------------------

ExpressReactServerPages.prototype._getDir = function (dirPath, options) {
    dirPath = path.resolve(dirPath);
    options || (options = {});

    var cache = this._fsCache;
    var dir = options.cache && cache[dirPath];

    if (dir) {
        return dir.then(function (dir) {
            return dir.concat();
        });
    }

    var pattern = '**/*' + this.extname;

    // Optimistically cache dir promise to reduce file system I/O, but remove
    // from cache if there was a problem.
    dir = cache[dirPath] = new Promise(function (resolve, reject) {
        glob(pattern, {
            cwd: dirPath,
            follow: true
        }, function (err, dir) {
            if (err) {
                reject(err);
            } else {
                resolve(dir);
            }
        });
    });

    return dir.then(function (dir) {
        return dir.concat();
    }).catch(function (err) {
        delete cache[dirPath];
        throw err;
    });
};

ExpressReactServerPages.prototype._getTemplateArray = function (filePath, options) {

    const rex = /<(REACT).*"(.*)".*\/>|<(SEO|OG).*"(.*)".*\/>|<((?:title|TITLE)+).*>(.*)<\/.*(?:title|TITLE)>|\{\{(BUILDID)\}\}|<(LANG).*"(.*)".*\/>/gm;

    filePath = path.resolve(filePath);
    options || (options = {});

    var cache = this._fsCache;
    var file = options.cache && cache[filePath];

    if (file) {
        return file;
    }

    // Optimistically cache file promise to reduce file system I/O, but remove
    // from cache if there was a problem.
    file = cache[filePath] = new Promise(function (resolve, reject) {
        fs.readFile(filePath, 'utf8', function (err, file) {
            if (err) {
                reject(err);
            } else {
                var tempAr = [];
                var tempArItem = null;
                while ((tempArItem = rex.exec(file)) != null) {
                    tempAr.push(tempArItem);
                }
                resolve(tempAr);
            }
        });
    });

    return file.catch(function (err) {
        delete cache[filePath];
        throw err;
    });
};

ExpressReactServerPages.prototype._getFile = function (filePath, options) {
    filePath = path.resolve(filePath);
    options || (options = {});

    var cache = this._fsCache;
    var file = options.cache && cache[filePath];

    if (file) {
        return file;
    }

    // Optimistically cache file promise to reduce file system I/O, but remove
    // from cache if there was a problem.
    file = cache[filePath] = new Promise(function (resolve, reject) {
        fs.readFile(filePath, 'utf8', function (err, file) {
            if (err) {
                reject(err);
            } else {
                resolve(file);
            }
        });
    });

    return file.catch(function (err) {
        delete cache[filePath];
        throw err;
    });
};

ExpressReactServerPages.prototype._getTemplateName = function (filePath, namespace) {
    var extRegex = new RegExp(this.extname + '$');
    var name = filePath.replace(extRegex, '');

    if (namespace) {
        name = namespace + '/' + name;
    }

    return name;
};

ExpressReactServerPages.prototype._resolveLayoutPath = function (layoutPath) {
    if (!layoutPath) {
        return null;
    }

    if (!path.extname(layoutPath)) {
        layoutPath += this.wrapperExt;
    }

    return path.resolve(this.layoutsDir, layoutPath);
};
