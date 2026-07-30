// 22 縣市中心點的概略經緯度，只用來「猜使用者目前在哪個縣市附近」方便顯示標籤用，
// 不追求精確（例如面積大的縣市，中心點可能跟使用者實際所在區有幾十公里落差），
// 精準的天氣還是直接用使用者 GPS 座標去查 Open-Meteo，這張表只影響「顯示成哪個地名」。
export const CITY_CENTERS: Record<string, { lat: number; lon: number }> = {
  "台北市": { lat: 25.0478, lon: 121.5319 },
  "新北市": { lat: 25.0170, lon: 121.4628 },
  "桃園市": { lat: 24.9936, lon: 121.3010 },
  "新竹市": { lat: 24.8047, lon: 120.9686 },
  "新竹縣": { lat: 24.8390, lon: 121.0177 },
  "基隆市": { lat: 25.1276, lon: 121.7392 },
  "宜蘭縣": { lat: 24.7021, lon: 121.7378 },
  "台中市": { lat: 24.1477, lon: 120.6736 },
  "苗栗縣": { lat: 24.5602, lon: 120.8214 },
  "彰化縣": { lat: 24.0518, lon: 120.5161 },
  "南投縣": { lat: 23.9609, lon: 120.9718 },
  "雲林縣": { lat: 23.7092, lon: 120.4313 },
  "台南市": { lat: 22.9998, lon: 120.2269 },
  "高雄市": { lat: 22.6273, lon: 120.3014 },
  "嘉義市": { lat: 23.4800, lon: 120.4491 },
  "嘉義縣": { lat: 23.4518, lon: 120.2555 },
  "屏東縣": { lat: 22.5519, lon: 120.5487 },
  "花蓮縣": { lat: 23.9871, lon: 121.6015 },
  "台東縣": { lat: 22.7583, lon: 121.1444 },
  "澎湖縣": { lat: 23.5711, lon: 119.5793 },
  "金門縣": { lat: 24.4491, lon: 118.3767 },
  "連江縣": { lat: 26.1608, lon: 119.9440 },
};

export function nearestCity(
  lat: number,
  lon: number,
  haversineKm: (lat1: number, lon1: number, lat2: number, lon2: number) => number
): string {
  let best = "台北市";
  let bestDist = Infinity;
  for (const [city, center] of Object.entries(CITY_CENTERS)) {
    const d = haversineKm(lat, lon, center.lat, center.lon);
    if (d < bestDist) {
      bestDist = d;
      best = city;
    }
  }
  return best;
}
