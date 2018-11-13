/*
 * Copyright (c) 2018, Rogassi Ent. All rights reserved.
 * Copyrights licensed under the New BSD License.
 * See the accompanying LICENSE file for terms.
 */

'use strict';

exports.assign = Object.assign || require('object.assign');
exports.passError = passError;
exports.passValue = passValue;
exports.buildTag = buildTag;

const url = require('url');
// -----------------------------------------------------------------------------

function passError(callback) {
    return function (reason) {
        setImmediate(function () {
            callback(reason);
        });
    };
}

function passValue(callback) {
    return function (value) {
        setImmediate(function () {
            callback(null, value);
        });
    };
}

function buildTag(tagClass, tagName, seo, context) {
    var component = null;
    var tagName = tagName.toLowerCase();
    var tagValue = null;
    var baseURL = seo.baseURL;
    switch (tagClass) {
        case "OG":
            {

                if (seo.og)
                    tagValue = seo.og[tagName];

                if (tagValue)
                    tagValue = tagValue.replace('{{BUILDID}}', 'v=' + context.build)
                        .replace('{{BASEURL}}', baseURL)
                        .replace('{{CURRENTPATH}}', (url.parse(context.req.url).pathname + '/').replace('//', '/'));

                switch (tagName) {
                    case "twitter:site":
                        {
                            if (tagValue) {
                                component = `<meta property="twitter:site" content="` + tagValue + `" />`;
                            }
                            break;
                        }
                    case "twitter:domain":
                        {
                            if (tagValue) {
                                component = `<meta property="twitter:domain" content="` + tagValue + `" />`;
                            }
                            break;
                        }
                    case "title":
                        {
                            component = `<meta property="og:title" content="` + seo.title + `" />
    <meta property="twitter:title" content="` + seo.title + `" />`;
                            break;
                        }
                    case "description":
                        {
                            component = `<meta property="og:description" content="` + seo.description + `" />`;
                            break;
                        }
                    case "image":
                        {
                            if (tagValue)
                                component = `<meta property="og:image" content="` + tagValue + `" />
    <meta property="twitter:image" content="` + tagValue + `" />`;
                            break;
                        }
                    case "url": {

                        if (context.i18n && tagValue) {

                            var languageTagValue = tagValue.replace('{{CURRENTLANG}}', context.i18n.language);

                            component = `<meta property="og:url" content="` + languageTagValue + `" />
    <meta http-equiv="content-language" content="` + context.i18n.language + `" />
    <link rel="canonical" href="` + languageTagValue + `" />`

                            context.i18n.options.supportedLanguages.forEach(element => {

                                if (context.i18n.language != element)
                                    component = component + '\r\n' + `    <link rel="alternate" href="` + tagValue.replace('{{CURRENTLANG}}', element) + `" hreflang="` + element + `" />`;

                            });
                            component = component + '\r\n' + `    <link rel="alternate" href="` + tagValue.replace('/{{CURRENTLANG}}', '') + `" hreflang="x-default" />`;

                            //<meta rel="alternate" content="` + tagValue.replace('{{CURRENTLANG}}', 'es-mx') + `" hreflang="es-mx" />
                            //<meta rel="alternate" content="` + tagValue.replace('/{{CURRENTLANG}}', '') + `" hreflang="x-default" />
                            //`;

                        }
                        else if (tagValue)
                            component = `<meta property="og:url" content="` + tagValue + `" />
    <link rel="canonical" href="` + tagValue + `" />`;
                        break;

                    }
                    default:
                        {
                            if (tagValue)
                                component = "<meta property=\"og:" + tagName + "\" content=\"" + tagValue + "\" />";
                        }
                }
            }
    }
    return component;
}
