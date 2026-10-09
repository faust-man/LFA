// Verify that both real form handlers reject oversized photos before reading them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
const alerts = [];
const reads = [];
function element(id) {
    if (!elements.has(id)) elements.set(id, {
        value: '', style: {}, classList: { add() {}, remove() {} },
        addEventListener(event, callback) { this[event] = callback; }
    });
    return elements.get(id);
}
const context = vm.createContext({
    document: { getElementById: element, querySelector: element, addEventListener() {} },
    alert(message) { alerts.push(message); },
    FileReader: class {
        readAsDataURL(file) { reads.push(file.size); this.onload({ target: { result: 'data:image/png;base64,eA==' } }); }
    },
    setupTimeField() {}, setupDateField() {}, setupAddressField() {},
    formatFullAddress() {}, formatShortAddress() {}
});
for (const file of ['config.js', 'state.js', 'marker-create-modal.js', 'lost-modal.js']) {
    vm.runInContext(fs.readFileSync(`frontend/${file}`, 'utf8'), context, { filename: file });
}
const limit = vm.runInContext('MAX_PHOTO_BYTES', context);
for (const id of ['photo-input', 'lost-photo-input']) {
    const input = element(id);
    input.change({ target: { files: [{ size: limit }] } });
    const before = reads.length;
    input.value = 'oversized.jpg';
    input.change({ target: { files: [{ size: limit + 1 }] } });
    assert.equal(reads.length, before, 'oversized file must not be read');
    assert.equal(input.value, '');
    assert.equal(alerts.at(-1), 'Фото должно быть не больше 5 МБ');
}
assert.deepEqual(reads, [limit, limit]);
console.log('OK: both photo forms accept 5 MiB and reject larger files before reading');
