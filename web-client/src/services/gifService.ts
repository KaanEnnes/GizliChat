import { GIPHY_API_KEY } from '../config/giphyConfig';

export interface GifResult {
  id: string;
  previewUrl: string;
  fullUrl: string;
  title: string;
}

const BASE_URL = 'https://api.giphy.com/v1/gifs';
const LIMIT = 24;

interface GiphyApiImage {
  url: string;
}
interface GiphyApiGif {
  id: string;
  title: string;
  images: {
    fixed_width: GiphyApiImage;
    original: GiphyApiImage;
  };
}
interface GiphyApiResponse {
  data: GiphyApiGif[];
}

function mapResults(data: GiphyApiGif[]): GifResult[] {
  return data.map(gif => ({
    id: gif.id,
    previewUrl: gif.images.fixed_width.url,
    fullUrl: gif.images.original.url,
    title: gif.title,
  }));
}

export async function searchGifs(query: string): Promise<GifResult[]> {
  const url = `${BASE_URL}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${LIMIT}&rating=pg-13`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GIF araması başarısız (${res.status})`);
  }
  const json = (await res.json()) as GiphyApiResponse;
  return mapResults(json.data);
}

export async function fetchTrendingGifs(): Promise<GifResult[]> {
  const url = `${BASE_URL}/trending?api_key=${GIPHY_API_KEY}&limit=${LIMIT}&rating=pg-13`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Trend GIF'ler alınamadı (${res.status})`);
  }
  const json = (await res.json()) as GiphyApiResponse;
  return mapResults(json.data);
}
