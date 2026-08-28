import type { Car } from "@/lib/supabase/types";

/** 車籍現在是不是登記在別人（二胎公司/人頭）名下，不在公司自己名下。
 *
 * 這裡刻意不能直接用 `has_used_as_nominee` 判斷——那個是「有沒有用過
 * 人頭」的永久旗標，一旦用過就會一直是 true（見 car-form-modal.tsx 的
 * 說明），不代表「現在」車籍在哪裡：證件領回來、車籍轉回公司名下之後，
 * `has_used_as_nominee` 還是 true，但車其實已經在公司名下了。
 *
 * 「現在是否在公司名下」要另外算：只要 `nominee_company` 有填、而且
 * `id_return_date`（證件預計/實際回收日期）還沒到（留空，或是日期還在
 * 未來），就代表車籍現在還登記在別人名下；`id_return_date` 一旦到了
 * （今天或更早），就視為證件已經領回、車籍已經回到公司名下。 */
export function isCurrentlyOutOnNominee(car: Car): boolean {
  if (!car.nominee_company) return false;
  if (!car.id_return_date) return true;

  const returnDate = new Date(car.id_return_date).getTime();
  if (Number.isNaN(returnDate)) return true;

  // 只比較到「日」，不比時分秒——id_return_date 存的是日期，today 若是
  // 回收日當天，就當作已經領回（車籍算回到公司名下），比較直覺。
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return returnDate > todayStart.getTime();
}

/** 車籍狀態徽章——庫存列表／卡片一眼就看得出這輛車現在是在公司名下、
 * 還是登記在二胎公司/人頭名下，不用點進詳情或編輯表單才知道。跟收購
 * 進價一樣算敏感財務資訊，只有 canViewCost 看得到，見 car-form-modal.tsx
 * 「二胎／人頭車合作紀錄」區塊的權限說明——沒有這個權限的人，這個徽章
 * 直接不顯示（不是顯示鎖頭），避免庫存列表的徽章列一直出現使用者看不懂
 * 也用不到的鎖頭圖示。 */
export function CarTitleBadge({
  car,
  canViewCost,
  className = "",
}: {
  car: Car;
  canViewCost: boolean;
  className?: string;
}) {
  if (!canViewCost) return null;

  const outOnNominee = isCurrentlyOutOnNominee(car);

  if (outOnNominee) {
    // 走到這裡代表 isCurrentlyOutOnNominee() 已經確認 nominee_company
    // 有值，這裡另外存一個非 null 的區域變數，避免下面直接用
    // `car.nominee_company`（型別仍是 string | null）。
    const companyName = car.nominee_company ?? "";
    return (
      <span
        className={
          "inline-flex items-center whitespace-nowrap rounded-full bg-[#FBEAEA] px-2.5 py-0.5 text-xs font-medium text-[#B75454] ring-1 ring-inset ring-[#F0D3D3]" +
          (className ? ` ${className}` : "")
        }
        title={`目前登記在「${companyName}」名下，尚未領回證件`}
      >
        ⚠️ 登記在{companyName}名下
      </span>
    );
  }

  return (
    <span
      className={
        "inline-flex items-center whitespace-nowrap rounded-full bg-[#E8F5E9] px-2.5 py-0.5 text-xs font-medium text-[#3D8B4E] ring-1 ring-inset ring-[#CDE8D1]" +
        (className ? ` ${className}` : "")
      }
      title="車籍目前在公司名下"
    >
      ✅ 車籍在公司
    </span>
  );
}
