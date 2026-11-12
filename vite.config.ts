import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// PWA — 홈 화면 추가 + 오프라인: 앱 셸은 프리캐시, 공개 RPC(/api/public)는 네트워크 우선·실패 시 캐시(축제장 LTE 끊겨도 지도·일정이 보인다),
// Storage 이미지(배치도·배너)는 캐시 우선. 스태프·관리자 화면은 캐시하지 않는다 (항상 최신).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FLIT 축제 앱', short_name: 'FLIT', description: '체험부스 대기·예약, 행사장 지도, 일정·공지, 스탬프 투어',
        lang: 'ko', start_url: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#141412',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 관리자·PDF 묶음은 미리 받지 않는다 — 손님 첫 방문 때 뒤에서 1MB 가까이 받느라 화면 로딩과 회선을 나눠 썼다 (2026-11-12). 필요할 때 네트워크로 받는다
        globIgnores: ['**/pdf*', '**/Admin*'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/admin/, /^\/s\//],
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname === '/api/public', handler: 'NetworkFirst', options: { cacheName: 'public-rpc', networkTimeoutSeconds: 4, expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 } } },
          { urlPattern: ({ url }) => /\/storage\/v1\/object\/public\//.test(url.pathname), handler: 'CacheFirst', options: { cacheName: 'images', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 } } },
          { urlPattern: ({ url }) => url.hostname === 'cdn.jsdelivr.net', handler: 'StaleWhileRevalidate', options: { cacheName: 'fonts' } },
        ],
      },
    }),
  ],
})
