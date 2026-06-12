// js/core/loader.js — lazy CDN script loading (Fuse, zip.js).

const CDN_SCRIPTS = {
    fuse: 'https://cdn.jsdelivr.net/npm/fuse.js@7.2.0/dist/fuse.min.js',
    zip: 'https://cdn.jsdelivr.net/npm/@zip.js/zip.js@2.8.26/dist/zip-full.min.js'
};

const lazyScriptPromises = new Map();

export function configureLibrarySupport() {
    const root = document.documentElement;
    root.classList.toggle('has-fuse', typeof window.Fuse === 'function');
    root.classList.toggle('has-zip', Boolean(window.zip?.ZipReader));
}

/**
 * Load a known CDN library once. Resolves immediately if already present.
 * @param {'fuse'|'zip'} key
 */
export function loadScriptOnce(key, url = CDN_SCRIPTS[key]) {
    if (!url) return Promise.reject(new Error(`Unknown script: ${key}`));
    if (key === 'fuse' && typeof window.Fuse === 'function') return Promise.resolve();
    if (key === 'zip' && window.zip?.ZipReader) return Promise.resolve();
    if (lazyScriptPromises.has(key)) return lazyScriptPromises.get(key);

    const promise = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-lazy-lib="${key}"]`);
        if (existing) {
            existing.addEventListener('load', () => {
                configureLibrarySupport();
                resolve();
            }, { once: true });
            existing.addEventListener('error', () => reject(new Error(`Failed to load ${key}`)), { once: true });
            return;
        }
        const script = document.createElement('script');
        script.src = url;
        script.defer = true;
        script.dataset.lazyLib = key;
        script.onload = () => {
            configureLibrarySupport();
            resolve();
        };
        script.onerror = () => reject(new Error(`Failed to load ${key}`));
        document.head.appendChild(script);
    }).catch(error => {
        lazyScriptPromises.delete(key);
        throw error;
    });

    lazyScriptPromises.set(key, promise);
    return promise;
}
