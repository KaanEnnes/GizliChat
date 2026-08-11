/**
 * Stream Video (getstream.io) yapılandırması — sesli/görüntülü arama için.
 *
 * NOT: API_SECRET burada, JS bundle içinde, düz metin duruyor ve arama
 * token'ları cihazda (client-side) üretiliyor.
 * Normalde bu bir sunucu tarafı sorumluluğu olmalı (secret asla client'a
 * gönderilmemeli) — burada backend olmadığı için bilinçli bir prototip
 * kısayolu. Bkz. ObsidianVault/04-Security-Notes.md.
 *
 * Doldurulması gereken adımlar (elle, bu repodan yapılamaz):
 * 1. https://dashboard.getstream.io → hesap oluştur (ücretsiz) → yeni bir
 *    "Video & Audio" app oluştur.
 * 2. App ayarlarından API Key ve API Secret'ı buraya kopyala.
 */
export const STREAM_CONFIG = {
  apiKey: 'eeyxcdjv3z4r',
  apiSecret: 'ujj2vefsw23g8s43grfphc2g6bpzqp2f3jp7srq3bdeza3stc62f4quw7wxduhch',
};
