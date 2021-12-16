/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

// This service worker can be customized!
// See https://developers.google.com/web/tools/workbox/modules
// for the list of available Workbox modules, or add any other
// code you'd like.
// You can also remove this file if you'd prefer not to use a
// service worker, and the Workbox build step will be skipped.

import {clientsClaim} from 'workbox-core';
import {ExpirationPlugin} from 'workbox-expiration';
import {precacheAndRoute, createHandlerBoundToURL} from 'workbox-precaching';
import {registerRoute} from 'workbox-routing';
import {StaleWhileRevalidate, CacheFirst} from 'workbox-strategies';
import {CACHE_LINE_ENV_VARNAME} from './scripts/common';

declare const self: ServiceWorkerGlobalScope;

clientsClaim();

// Precache all of the assets generated by your build process.
// Their URLs are injected into the manifest variable below.
// This variable must be present somewhere in your service worker file,
// even if you decide not to use precaching. See https://cra.link/PWA
let precacheTargets = [...self.__WB_MANIFEST];

// TODO: remove dbs from this, as the extra complexity adds more harm than good
const customTargetsJsonString = process.env[CACHE_LINE_ENV_VARNAME];
if (customTargetsJsonString !== undefined) {
    try {
        const customTargets = JSON.parse(customTargetsJsonString);
        console.log("[Liburry Service Worker] Loaded custom targets: ", customTargets);
        precacheTargets = [...precacheTargets, ...customTargets];
        console.log("[Liburry Service Worker] All precache targets: ", precacheTargets);
    } catch (e) {
        console.warn("Failed to load custom targets!", e);
    }
}
precacheAndRoute(precacheTargets);

// Set up App Shell-style routing, so that all navigation requests
// are fulfilled with your index.html shell. Learn more at
// https://developers.google.com/web/fundamentals/architecture/app-shell
const fileExtensionRegexp = new RegExp('/[^/?]+\\.[^/]+$');
registerRoute(
    // Return false to exempt requests from being fulfilled by index.html.
    ({request, url}: {request: Request; url: URL}) => {
        // If this isn't a navigation, skip.
        if (request.mode !== 'navigate') {
            return false;
        }

        // If this is a URL that starts with /_, skip.
        if (url.pathname.startsWith('/_')) {
            return false;
        }

        // If this looks like a URL for a resource, because it contains
        // a file extension, skip.
        if (url.pathname.match(fileExtensionRegexp)) {
            return false;
        }

        // Return true to signal that we want to use the handler.
        return true;
    },
    createHandlerBoundToURL(process.env.PUBLIC_URL + '/index.html')
);

// An example runtime caching route for requests that aren't handled by the
// precache, in this case same-origin .png requests like those from in public/
registerRoute(
    // Add in any other file extensions or routing criteria as needed.
    // TODO: check against google fonts? any other checks?
    // url.origin === self.location.origin &&
    ({url}) => url.pathname.endsWith('.woff2'),
    // Customize this strategy as needed, e.g., by changing to CacheFirst.
    new StaleWhileRevalidate({
        cacheName: 'fonts',
        plugins: [
            // Ensure that once this runtime cache reaches a maximum size the
            // least-recently used images are removed.
            new ExpirationPlugin({maxEntries: 150}),
        ],
    })
);


function fileMatcher(opts: {url: URL}): boolean {
    const {url} = opts;
    const locationCorrect = url.pathname.startsWith('/db/'); //|| url.pathname.startsWith('/config/');
    const matchFileType = !!url.pathname.match(/(\.json|\.csv)$/); //|\.yml)$/);
    return locationCorrect && matchFileType;
}

// TODO: version databases so newly-generated DBs will overwrite old ones
registerRoute(
    fileMatcher,
    new CacheFirst({
        cacheName: 'databases',
        plugins: [
            new ExpirationPlugin({purgeOnQuotaError: false}),
        ],
    })
);

// This allows the web app to trigger skipWaiting via
// registration.waiting.postMessage({type: 'SKIP_WAITING'})
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Any other custom service worker logic can go here.