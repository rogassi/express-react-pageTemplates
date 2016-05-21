/*
 * Copyright (c) 2016, Rogassi Ent. All rights reserved.
 * Copyrights licensed under the New BSD License.
 * See the accompanying LICENSE file for terms.
 */

'use strict';

var ExpressReactServerPages = require('./lib/express-reactServerPages');

exports = module.exports = exprsp;
exports.create = create;
exports.ExpressReactServerPages = ExpressReactServerPages;

// -----------------------------------------------------------------------------

function exprsp(config) {
    return create(config).engine;
}

function create(config) {
    return new ExpressReactServerPages(config);
}
