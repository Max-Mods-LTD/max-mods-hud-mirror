// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const path = require('path');
const fs = require('fs');
const link = require('./oap_link.js');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'car');
const out = path.join(root, 'dist');
if (!fs.existsSync(out)) fs.mkdirSync(out);
const m = link.readManifest(dir);
const file = path.join(out, m.id + '@' + m.version + '.src.tgz');
const files = link.packSource(dir, file);
console.log(JSON.stringify({ file: file, members: files.length }, null, 2));
