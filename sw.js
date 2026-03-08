const CACHE_NAME = 'cycling-route-app-v1';
const urlsToCache = [
    './', // index.html
    './index.html',
    './manifest.json',
    './style.css', // もし外部CSSファイルがある場合
    './icons/icon-192x192.png',
    './icons/icon-512x512.png',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' // タイル画像をキャッシュ対象に含める (注意が必要)
];

// インストールイベント: Service Worker が登録されたときにキャッシュを開き、リソースを追加
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                // タイル画像はキャッシュ戦略を考慮する必要があるため、ここではコメントアウトまたは別の戦略を適用
                // ただし、オフラインで地図を表示するためには必須
                return cache.addAll(urlsToCache.filter(url => !url.includes('tile.openstreetmap.org')));
            })
            .then(() => self.skipWaiting()) // 新しいService Workerがすぐにアクティブになるようにする
    );
});

// フェッチイベント: リクエストをインターセプトし、キャッシュから応答を返す
self.addEventListener('fetch', (event) => {
    // OpenStreetMapのタイル画像のリクエストを特別に処理
    if (event.request.url.includes('tile.openstreetmap.org')) {
        event.respondWith(
            caches.match(event.request).then((response) => {
                // キャッシュに存在すればそれを返す
                if (response) {
                    return response;
                }
                // キャッシュに存在しない場合はネットワークから取得し、キャッシュに追加してから返す
                return fetch(event.request).then((networkResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone()); // レスポンスは一度しか消費できないためcloneする
                        return networkResponse;
                    });
                });
            }).catch(() => {
                // オフラインでタイルがキャッシュにない場合のフォールバック（例: オフライン画像を表示）
                // ここでは何もしない（地図が表示されない）か、代替画像を返す
                console.log('Offline: Could not fetch map tile.');
            })
        );
        return; // タイル画像のリクエストはここで処理を終了
    }

    // その他のリクエストはキャッシュファースト戦略
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // キャッシュに存在すればそれを返す
                if (response) {
                    return response;
                }
                // キャッシュに存在しない場合はネットワークから取得
                return fetch(event.request)
                    .then((networkResponse) => {
                        // ネットワークからの応答が有効であればキャッシュに追加
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse;
                        }
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        return networkResponse;
                    })
                    .catch(() => {
                        // オフラインでキャッシュにもない場合のフォールバック
                        // 例えば、オフラインページを返すなど
                        console.log('Offline: Could not fetch resource:', event.request.url);
                        // return caches.match('/offline.html'); // オフラインページを用意する場合
                    });
            })
    );
});


// アクティベートイベント: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(() => self.clients.claim()) // 新しいService Workerがすぐにページの制御を開始するようにする
    );
});