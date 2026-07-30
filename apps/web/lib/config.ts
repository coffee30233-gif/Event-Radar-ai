// 個人化預設值。這個專案是給你自己用的（不是給不特定使用者用的公開產品），
// 所以直接把「你的預設位置」「你的預設興趣」寫成設定值，比做一套完整的
// 「使用者偏好設定頁面」簡單很多，符合這個專案一路以來「盡量簡單」的原則。
// 之後如果搬家或興趣變了，直接改這個檔案就好。
import type { Category } from "@/types/event";

/** 預設位置：新北市林口區（林口三井 Outlet 附近）。
 *  瀏覽器定位權限還沒取得回應、或使用者拒絕定位時，用這個當預設值，
 *  首頁不用等定位權限就能立刻顯示「離我多近」這類個人化內容；
 *  如果瀏覽器真的給了更精確的 GPS 座標，會直接覆蓋掉這個預設值。
 */
export const DEFAULT_LOCATION = {
  lat: 25.0776,
  lon: 121.3928,
  label: "新北市林口區",
};

/** 預設感興趣的分類。跟「收藏過的活動分類」一起算進推薦分數，
 *  就算你還沒收藏任何活動，首頁的「今日推薦」也會先照這些分類排序。
 */
export const DEFAULT_INTEREST_CATEGORIES: Category[] = ["fireworks", "exhibition", "concert", "market"];

/** 首頁預設不顯示的分類。"talk"（講座/課程/研習）、"anime"（動漫）你說不想在首頁看到，
 *  這裡排除的活動在行事曆／地圖／AI 搜尋還是找得到，只有首頁的「今天的活動」
 *  列表跟活動總數不會算進去。
 */
export const HOME_EXCLUDED_CATEGORIES: Category[] = ["talk", "anime"];

/** 首頁不顯示距離預設位置超過這個公里數的活動。 */
export const HOME_MAX_DISTANCE_KM = 30;
