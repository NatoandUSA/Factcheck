'use strict';

// Review-only facade for the additive commerce-intelligence layer.
// Nothing in this module writes commerce authority or project state.
const ip = require('./ipScreen');
const semantic = require('./semantic');
const asin = require('./asinSelector');
const keyword = require('./keywordEngine');
const allocation = require('./allocation');
const amazon = require('./amazonComposer');

module.exports = {
  ip,
  semantic,
  asin,
  keyword,
  allocation,
  amazon
};
