// Run inside Docker on the compose network; exercises real frontend handlers and API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

const base = process.env.TEST_BASE_URL || 'http://nginx';
const handlers = {};
const elements = new Map();
function element() {
    return {
        style: {}, classList: { add() {}, remove() {} },
        addEventListener(event, callback) { this[event] = callback; },
        querySelector() { return element(); }
    };
}
let center;
const context = vm.createContext({
    console, alert(message) { throw new Error(message); },
    fetch(url, options) { return fetch(new URL(url, base), options); },
    document: {
        createElement: element,
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, element());
            return elements.get(id);
        },
        addEventListener() {}, body: element()
    },
    map: { on(event, callback) { handlers[event] = callback; }, getCenter() { return center; } },
    maplibregl: { Marker: class {
        setLngLat(coords) { this.coords = coords; return this; }
        addTo() { return this; }
    } },
    escapeHtml: String, truncateOkras: String, formatDateShort: String,
    disablePlacingMode() { vm.runInContext('placingMode = false', context); }
});
for (const file of ['state.js', 'api.js', 'marker.js', 'mobile-place.js', 'main.js']) {
    vm.runInContext(fs.readFileSync(`frontend/${file}`, 'utf8'), context, { filename: file });
}

(async () => {
    const created = [];
    try {
        for (const mode of ['desktop', 'mobile']) {
            for (const [lng, lat] of [[37.6173, 55.7558], [0, 0], [-122.4194, 37.7749], [151.2093, -33.8688]]) {
                vm.runInContext(`placingMode = true; mobilePlacingMode = ${mode === 'mobile'}; pendingContact = ${JSON.stringify(randomUUID())};`, context);
                if (mode === 'desktop') await handlers.click({ lngLat: { lng, lat } });
                else {
                    center = { lng, lat };
                    await elements.get('mobile-place-confirm').click();
                }
                const marker = vm.runInContext('allMarkers.at(-1)', context);
                created.push(marker.id);
                assert.equal(marker.lng, lng, `${mode}: longitude`);
                assert.equal(marker.lat, lat, `${mode}: latitude`);
                assert.deepEqual(Array.from(marker.instance.coords), [lng, lat]);
                const saved = await (await fetch(`${base}/api/animals/${marker.id}`)).json();
                assert.equal(saved.longitude, lng);
                assert.equal(saved.latitude, lat);
                const restored = context.addMarkerToMapFromServer(saved);
                assert.deepEqual(Array.from(restored.instance.coords), [lng, lat]);
            }
        }
        console.log('OK: desktop clicks, mobile confirmation, API persistence and marker reload (8 cases)');
    } finally {
        for (const id of created) {
            const response = await fetch(`${base}/api/animals/${id}`, { method: 'DELETE' });
            assert.equal(response.status, 204);
        }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
