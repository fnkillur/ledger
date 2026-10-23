import {
  AirplaneIcon,
  BankIcon,
  BeerSteinIcon,
  BookOpenIcon,
  BroomIcon,
  CalculatorIcon,
  CarIcon,
  CoffeeBeanIcon,
  CoffeeIcon,
  CookieIcon,
  CreditCardIcon,
  EnvelopeIcon,
  FirstAidKitIcon,
  ForkKnifeIcon,
  GameControllerIcon,
  GiftIcon,
  HandHeartIcon,
  HouseIcon,
  PiggyBankIcon,
  QuestionIcon,
  ReceiptIcon,
  ScissorsIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  SparkleIcon,
  TagIcon,
  UsersThreeIcon,
  WalletIcon,
  type Icon,
} from '@phosphor-icons/react'

type Tone = 'blue' | 'orange' | 'green' | 'yellow' | 'pink' | 'purple' | 'teal' | 'gray'

const CATEGORY_VISUALS: Record<string, [Icon, Tone]> = {
  '편의점·마트·잡화': [ShoppingCartIcon, 'green'],
  '여행·숙박': [AirplaneIcon, 'teal'],
  쇼핑: [ShoppingBagIcon, 'pink'],
  식비: [ForkKnifeIcon, 'orange'],
  '교통·자동차': [CarIcon, 'blue'],
  '주거·통신': [HouseIcon, 'purple'],
  '보험·세금·기타금융': [ReceiptIcon, 'gray'],
  '의료·건강·피트니스': [FirstAidKitIcon, 'green'],
  '취미·여가': [GameControllerIcon, 'purple'],
  '카페·간식': [CoffeeIcon, 'yellow'],
  '술·유흥': [BeerSteinIcon, 'orange'],
  미용: [ScissorsIcon, 'pink'],
  생활: [BroomIcon, 'blue'],
  원두: [CoffeeBeanIcon, 'yellow'],
  과자: [CookieIcon, 'yellow'],
  모임계: [UsersThreeIcon, 'purple'],
  부모님용돈: [HandHeartIcon, 'pink'],
  선물: [GiftIcon, 'pink'],
  교육: [BookOpenIcon, 'blue'],
  축의금: [EnvelopeIcon, 'pink'],
  카드대금: [CreditCardIcon, 'gray'],
  '카테고리 없음': [QuestionIcon, 'gray'],
  '저축·투자': [PiggyBankIcon, 'green'],
  월급: [WalletIcon, 'blue'],
  은행이자지원: [BankIcon, 'green'],
  연말정산: [CalculatorIcon, 'purple'],
  보험금환급: [ShieldCheckIcon, 'teal'],
  '상여(출장포함)': [SparkleIcon, 'yellow'],
}

type CategoryIconProps = {
  name: string
  // 시트에서 새로 만든 카테고리는 전용 아이콘이 없어서 시트의 이모지를 대신 보여준다.
  emoji?: string
  size?: number
}

function CategoryIcon({ name, emoji, size = 18 }: CategoryIconProps) {
  const visual = CATEGORY_VISUALS[name]
  const box = Math.round(size * 1.8)

  if (!visual) {
    return (
      <span className="category-icon tone-gray" style={{ width: box, height: box, fontSize: size * 0.9 }} aria-hidden="true">
        {emoji || <TagIcon size={size} weight="duotone" />}
      </span>
    )
  }

  const [Glyph, tone] = visual
  return (
    <span className={`category-icon tone-${tone}`} style={{ width: box, height: box }} aria-hidden="true">
      <Glyph size={size} weight="duotone" />
    </span>
  )
}

export default CategoryIcon
